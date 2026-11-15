#!/usr/bin/env python3
"""
Losse klanken (kl.*) en uitgerekte woorden (rekt.*) knippen uit opnames van hele woorden.

Waarom: een spraakcomputer kan geen losse klank zeggen. Vraag je om "k", dan krijg je de
letternaam ("kaa"); vraag je om "Hhhh… huis", dan krijg je "haa… huis". Hele woorden zegt de
stem wel goed (die zijn met spraakherkenning gecontroleerd). Dus knippen we de klank uit het
woord: de k uit kaas, de aa uit kaas, de n uit zon. Zo is de klank precies de klank die ze in het
woord hoort.

Gebruik (python3 met numpy en scipy, en ffmpeg met libmp3lame):

    python3 scripts/klanken.py            # maakt de opnames en werkt manifest.json bij
    python3 scripts/klanken.py --proef    # schrijft alleen wav's naar /tmp/klanken, om te luisteren
    python3 scripts/klanken.py --nieuw    # alleen wat er nog niet is (na het inspreken van nieuwe woorden)

De opnames komen als "eigen opname" in manifest.json (wel onder clips, niet onder generated), en
`npm run stem` slaat kl.* en rekt.* altijd over. De knippunten horen bij de opnames in scripts/bron/
(kopieën van de woorden zoals ze waren toen de knippunten gezocht zijn).
"""
import hashlib
import json
import re
import os
import subprocess
import sys

import numpy as np

SR = 44100
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DIR = os.path.join(ROOT, 'public', 'audio', 'nl')
MANIFEST = os.path.join(DIR, 'manifest.json')
RESULTS = os.path.join(ROOT, 'scripts', 'controle.json')
BRON = os.path.join(ROOT, 'scripts', 'bron')
WORDS_TS = os.path.join(ROOT, 'src', 'domains', 'lezen', 'plaatjes.ts')

# id → (bronopname, begin, eind, bewerking). Tijden in seconden in de bronopname.
#   ('',)          zo laten
#   ('rek', f)     f keer zo lang, toonhoogte blijft gelijk (klinkers, z, j)
#   ('ruis', s)    ruisklank aanhouden tot s seconden (v, h: geen stem, dus geen toonhoogte)
#   ('plof',)      plofklank: scherp begin, lage plof van de microfoon eruit
CUTS = {
    'kl.m': ('rekt.maan', 0.030, 0.600, ('',)),
    'kl.n': ('w.zon', 0.400, 0.680, ('',)),
    'kl.s': ('w.kaas', 0.315, 0.540, ('',)),
    'kl.z': ('w.zon', 0.005, 0.170, ('rek', 2.0)),
    'kl.v': ('w.veer', 0.005, 0.088, ('ruis', 0.35)),
    'kl.h': ('rekt.huis', 0.028, 0.095, ('ruis', 0.30)),
    'kl.r': ('rekt.roos', 0.040, 0.148, ('',)),
    'kl.j': ('w.jas', 0.030, 0.085, ('rek', 1.5)),
    'kl.b': ('w.boot', 0.025, 0.098, ('plof',)),
    'kl.d': ('w.doos', 0.030, 0.092, ('plof',)),
    'kl.k': ('w.kaas', 0.078, 0.118, ('plof',)),
    'kl.p': ('w.pop', 0.310, 0.345, ('plof',)),
    'kl.t': ('w.pet', 0.325, 0.420, ('plof',)),
    'kl.aa': ('w.kaas', 0.120, 0.300, ('rek', 1.5)),
    'kl.oo': ('w.boom', 0.065, 0.250, ('rek', 1.5)),
    'kl.ee': ('w.beer', 0.105, 0.270, ('rek', 1.5)),
    'kl.ui': ('w.muis', 0.055, 0.285, ('rek', 1.3)),
    'kl.oe': ('w.hoed', 0.090, 0.200, ('rek', 1.8)),
    'kl.eu': ('w.deur', 0.070, 0.250, ('rek', 1.5)),
    'kl.uu': ('w.vuur', 0.115, 0.270, ('rek', 1.5)),
    'kl.a': ('w.tas', 0.115, 0.215, ('rek', 1.3)),
    'kl.e': ('w.pet', 0.100, 0.225, ('rek', 1.3)),
    'kl.i': ('w.vis', 0.090, 0.195, ('rek', 1.3)),
    'kl.o': ('w.kop', 0.100, 0.205, ('rek', 1.3)),
}

# Uitgerekt: de klank aangehouden, een pauze, dan het woord. Welke woorden staat in plaatjes.ts
# (STRETCHED); het woord zelf is de gewone opname (w.*). rekt.maan was al goed en blijft zoals hij is.
SUSTAIN = {
    'm': ('rekt.maan', 0.030, 0.900, ('',)),
    'n': ('w.zon', 0.400, 0.680, ('rek', 2.2)),
    's': ('w.kaas', 0.315, 0.540, ('ruis', 0.60)),
    'v': ('w.veer', 0.005, 0.088, ('ruis', 0.60)),
    'h': ('rekt.huis', 0.028, 0.095, ('ruis', 0.45)),
    'z': ('w.zon', 0.005, 0.170, ('rek', 3.0)),
    'r': ('rekt.roos', 0.040, 0.148, ('tril', 3)),
}
KEEP = {'rekt.maan'}
PAUSE = 0.5

# De opnames waar de knippunten bij horen, als kopie in scripts/bron/. Zo blijven de knippunten kloppen,
# ook als een woord later opnieuw wordt ingesproken.
SOURCE_FILES = {
    'rekt.maan': 'rekt.maan.0b4e7dbd90.mp3',
    'rekt.huis': 'rekt.huis.1394c3b23d.mp3',
    'rekt.roos': 'rekt.roos.a5319388e3.mp3',
    'w.zon': 'w.zon.079e7064ed.mp3',
    'w.kaas': 'w.kaas.61f3f600d0.mp3',
    'w.veer': 'w.veer.a731381e22.mp3',
    'w.jas': 'w.jas.fcc5d91929.mp3',
    'w.boot': 'w.boot.fd94fb2f3e.mp3',
    'w.doos': 'w.doos.bbf539deb3.mp3',
    'w.pop': 'w.pop.b0661edca5.mp3',
    'w.pet': 'w.pet.f722c23606.mp3',
    'w.boom': 'w.boom.10a288542a.mp3',
    'w.beer': 'w.beer.45864e3dc5.mp3',
    'w.muis': 'w.muis.82ee936429.mp3',
    'w.hoed': 'w.hoed.213f47daef.mp3',
    'w.deur': 'w.deur.9a02637f96.mp3',
    'w.vuur': 'w.vuur.7312249a75.mp3',
    'w.tas': 'w.tas.11db63907c.mp3',
    'w.vis': 'w.vis.5f2a9b2d9c.mp3',
    'w.kop': 'w.kop.bae8d4ecfa.mp3',
    'w.voet': 'w.voet.81cabafc81.mp3',
    'w.huis': 'w.huis.2256b51b0c.mp3',
    'w.roos': 'w.roos.ea7f915492.mp3',
}


def decode(path, tempo=1.0):
    # atempo (WSOLA) houdt een klinker gelijkmatig; rubberband gaf er hoorbare dipjes in.
    steps = []
    while tempo < 0.5:
        steps.append('atempo=0.5')
        tempo /= 0.5
    if tempo != 1.0:
        steps.append(f'atempo={tempo:.4f}')
    flt = ['-af', ','.join(steps)] if steps else []
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, *flt, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def fade(x, ms_in, ms_out):
    x = x.copy()
    a, b = int(SR * ms_in / 1000), int(SR * ms_out / 1000)
    a, b = min(a, len(x) // 2), min(b, len(x) // 2)
    if a:
        x[:a] *= np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    if b:
        x[-b:] *= np.cos(np.linspace(0, np.pi / 2, b)) ** 2
    return x


def peak_rms(x, ms=30):
    w = int(SR * ms / 1000)
    if len(x) < w:
        return float(np.sqrt((x ** 2).mean()))
    return max(float(np.sqrt((x[i:i + w] ** 2).mean())) for i in range(0, len(x) - w + 1, w // 2))


def highpass(x, hz):
    from scipy.signal import butter, sosfiltfilt
    return sosfiltfilt(butter(4, hz, 'highpass', fs=SR, output='sos'), x)


def noise_sustain(x, seconds, rng):
    """Een ruisklank aanhouden: korte stukjes uit de bron, door elkaar en overlappend."""
    g = int(0.030 * SR)
    hop = g // 2
    n = int(seconds * SR)
    out = np.zeros(n + g)
    win = np.hanning(g)
    for pos in range(0, n, hop):
        s = rng.integers(0, len(x) - g)
        out[pos:pos + g] += x[s:s + g] * win
    return out[:n]


def trill(x, times):
    """Een rollende r langer maken: dezelfde paar tikken achter elkaar, met een overgang."""
    xf = int(0.008 * SR)
    out = x.copy()
    for _ in range(times - 1):
        ramp = np.linspace(0, 1, xf)
        out[-xf:] = out[-xf:] * (1 - ramp) + x[:xf] * ramp
        out = np.concatenate([out, x[xf:]])
    return out


def make(src_path, start, end, op, rng):
    kind = op[0]
    if kind == 'rek':
        f = op[1]
        y = decode(src_path, tempo=1 / f)
        seg = y[int(start * f * SR):int(end * f * SR)]
        return fade(seg, 20, 60)
    y = decode(src_path)
    seg = y[int(start * SR):int(end * SR)]
    if kind == 'ruis':
        seg = noise_sustain(highpass(seg, 120), op[1], rng)
        return fade(seg, 40, 120)
    if kind == 'plof':
        return fade(highpass(seg, 100), 2, 15)
    if kind == 'tril':
        return fade(trill(seg, op[1]), 8, 30)
    return fade(seg, 15, 70)


def trim(x, thresh=0.02):
    """Stilte aan het begin en eind van een woordopname weg."""
    w = int(0.01 * SR)
    env = np.array([np.abs(x[i:i + w]).max() for i in range(0, len(x) - w, w)])
    on = np.nonzero(env > thresh * env.max())[0]
    return x[max(0, on[0] - 1) * w:(on[-1] + 2) * w]


def finish(x, target=None):
    """Rustig begin en eind, en een beetje stilte erachter (anders lijkt hij afgekapt)."""
    if target:
        x = x * min(8.0, target / max(peak_rms(x), 1e-9))
    x = np.concatenate([np.zeros(int(0.02 * SR)), x, np.zeros(int(0.08 * SR))])
    return np.clip(x, -0.98, 0.98)


def encode(x, path):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-codec:a', 'libmp3lame', '-b:a', '64k', path],
                   input=x.astype(np.float32).tobytes(), check=True)


def stretched_words():
    """De woorden uit STRETCHED in plaatjes.ts: {'zon': 'z', ...}."""
    with open(WORDS_TS, encoding='utf8') as fh:
        block = re.search(r'export const STRETCHED[^=]*=\s*\{(.*?)\};', fh.read(), re.S).group(1)
    return {w: text[0].lower() for w, text in re.findall(r"(\w+): '([^']+)'", block)}


def main():
    proef = '--proef' in sys.argv
    only_new = '--nieuw' in sys.argv
    with open(MANIFEST) as fh:
        manifest = json.load(fh)
    clips = manifest['clips']

    def src(sid):
        return os.path.join(BRON, SOURCE_FILES[sid])

    # De luidheid van een gewone klinker, als maat voor de zachte ruisklanken.
    vowel = peak_rms(decode(src('w.kaas')))
    loud = {'kl.v': 0.35 * vowel, 'kl.h': 0.35 * vowel, 'kl.j': 0.6 * vowel, 'kl.k': 0.45 * vowel, 'kl.p': 0.45 * vowel}

    out = {}
    for cid, (sid, a, b, op) in CUTS.items():
        rng = np.random.default_rng(sum(map(ord, cid)))
        out[cid] = finish(make(src(sid), a, b, op, rng), loud.get(cid))
    sustained = {}
    for key, (sid, a, b, op) in SUSTAIN.items():
        rng = np.random.default_rng(1000 + ord(key))
        x = make(src(sid), a, b, op, rng)
        if key in 'vh':
            x = x * min(8.0, 0.35 * vowel / max(peak_rms(x), 1e-9))
        sustained[key] = x
    waiting = []
    for w, key in stretched_words().items():
        cid = f'rekt.{w}'
        if cid in KEEP:
            continue
        if f'w.{w}' not in clips:
            waiting.append(w)
            continue
        word = fade(trim(decode(os.path.join(DIR, clips[f'w.{w}']))), 5, 20)
        out[cid] = finish(np.concatenate([sustained[key], np.zeros(int(PAUSE * SR)), word]))
    if waiting:
        print(f'Nog geen opname van het woord, dus nog niet uitgerekt: {", ".join(waiting)}')
    if only_new:
        out = {cid: x for cid, x in out.items() if cid not in clips}

    if proef:
        os.makedirs('/tmp/klanken', exist_ok=True)
        for cid, x in out.items():
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                            f'/tmp/klanken/{cid}.wav'], input=x.astype(np.float32).tobytes(), check=True)
        print(f'{len(out)} wav\'s in /tmp/klanken')
        return

    try:
        with open(RESULTS) as fh:
            results = json.load(fh)
    except FileNotFoundError:
        results = {}
    # Eerst alles maken (de bronnen rekt.huis en rekt.roos worden zelf ook vervangen), dan pas wegschrijven.
    for cid, x in out.items():
        h = hashlib.sha1(x.astype(np.float32).tobytes()).hexdigest()[:10]
        name = f'{cid}.{h}.mp3'
        old = clips.get(cid)
        if old == name:
            continue
        tmp = os.path.join(DIR, name + '.tmp.mp3')
        encode(x, tmp)
        out[cid] = (name, tmp, old)
    for cid, v in out.items():
        if not isinstance(v, tuple):
            continue
        name, tmp, old = v
        os.replace(tmp, os.path.join(DIR, name))
        if old and old != name and os.path.exists(os.path.join(DIR, old)):
            os.remove(os.path.join(DIR, old))
        clips[cid] = name
        manifest.get('generated', {}).pop(cid, None)
        manifest.get('takes', {}).pop(cid, None)
        results.pop(cid, None)
        print(f'  {cid} → {name}')
    with open(MANIFEST, 'w') as fh:
        fh.write(json.dumps(manifest, indent=1, ensure_ascii=False) + '\n')
    with open(RESULTS, 'w') as fh:
        fh.write(json.dumps(results, indent=1, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
