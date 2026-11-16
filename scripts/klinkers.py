#!/usr/bin/env python3
"""
Tweede paar oren voor de woordjes: klinkt de klinker zoals in de andere woorden met die klinker?

Spraakherkenning controleert of het goede woord gezegd wordt, maar verstaat een los woordje soms
slecht. Dit script kijkt naar het geluid zelf, zonder internet: het zoekt in elke opname de klinker,
meet de klankkleur (zoals een spraakherkenner dat doet, met mel-cepstrum) en kijkt welke andere
woorden er het meest op lijken. De aa van "vaas" hoort op de aa van "kaas" en "maan" te lijken, niet
op de a van "jas".

    python3 scripts/klinkers.py           # lijst, de twijfelgevallen bovenaan
    python3 scripts/klinkers.py man pen   # alleen deze woorden

Het is een hulpmiddel, geen rechter: bij klanken met weinig woorden (eu, uu) en voor een r kleurt
de klinker anders, en dan slaat het script soms ten onrechte aan. Wat hier bovenaan staat: even
luisteren in het ouderdeel. Nodig: python3 met numpy en scipy, en ffmpeg.
"""
import json
import os
import re
import subprocess
import sys

import numpy as np
from scipy.fft import dct

SR = 16000
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
D = os.path.join(ROOT, 'public', 'audio', 'nl') + os.sep
DOUBT = 1.15


def vowels():
    """Woord → klinker, uit SOUNDS en SHORT_SOUNDS in plaatjes.ts (de middelste klank)."""
    with open(os.path.join(ROOT, 'src', 'domains', 'lezen', 'plaatjes.ts'), encoding='utf8') as fh:
        text = fh.read()
    return {w: v for w, v in re.findall(r"(\w+): \['\w+', '(\w+)', '\w+'\]", text)}


def load(f):
    return np.frombuffer(subprocess.run(['ffmpeg','-v','quiet','-i',D+f,'-f','f32le','-ac','1','-ar',str(SR),'-'],capture_output=True).stdout,dtype=np.float32).astype(float)
def mel(n=26,nfft=512):
    hz=lambda m:700*(10**(m/2595)-1); ml=lambda h:2595*np.log10(1+h/700)
    pts=hz(np.linspace(ml(100),ml(6500),n+2)); bins=np.floor((nfft+1)*pts/SR).astype(int)
    fb=np.zeros((n,nfft//2+1))
    for i in range(n):
        a,b,c=bins[i],bins[i+1],bins[i+2]
        fb[i,a:b]=(np.arange(a,b)-a)/max(1,b-a); fb[i,b:c]=(c-np.arange(b,c))/max(1,c-b)
    return fb
FB=mel()
def feats(x):
    w,h=400,160; n=(len(x)-w)//h
    fr=np.stack([x[i*h:i*h+w]*np.hamming(w) for i in range(n)])
    P=np.abs(np.fft.rfft(fr,512))**2
    E=np.log(P@FB.T+1e-10); C=dct(E,norm='ortho')[:,1:13]
    en=np.log((fr**2).sum(1)+1e-10)
    # voicing via autocorr
    voi=[]
    for f in fr:
        f=f-f.mean(); ac=np.correlate(f,f,'full')[w-1:]; voi.append(ac[40:320].max()/(ac[0]+1e-12))
    return C,en,np.array(voi),P
def nucleus(x):
    C,en,voi,P=feats(x)
    lo=P[:,:int(1000/SR*512)].sum(1); son=np.log(lo+1e-10)
    ok=(voi>0.45)&(en>en.max()-3.0)
    # longest run containing the energy peak among voiced frames
    if not ok.any(): ok=en>en.max()-2
    pk=np.argmax(np.where(ok,en,-1e9)); a=b=pk
    while a>0 and ok[a-1]: a-=1
    while b<len(ok)-1 and ok[b+1]: b+=1
    return C,a,b
def vec(x):
    C,a,b=nucleus(x); n=b-a+1
    q=max(1,n//4)
    s1=C[a+q//2:a+q//2+max(1,n//3)].mean(0); s2=C[b-q//2-max(1,n//3)+1:b-q//2+1].mean(0); mid=C[a+n//3:a+n//3+max(1,n//3)].mean(0)
    return np.concatenate([mid,s1,s2]), n*0.01


def main():
    with open(D + 'manifest.json') as fh:
        clips = json.load(fh)['clips']
    V = {w: v for w, v in vowels().items() if f'w.{w}' in clips}
    X = {w: vec(load(clips[f'w.{w}']))[0] for w in V}
    words = list(V)
    sd = np.stack([X[w] for w in words]).std(0) + 1e-9
    rows = []
    for w in words:
        d = {u: float(np.linalg.norm((X[w] - X[u]) / sd)) for u in words if u != w}
        same = [d[u] for u in d if V[u] == V[w]]
        other = min(d[u] for u in d if V[u] != V[w])
        near = sorted(d, key=d.get)[:3]
        rows.append((min(same) / other if same else float('nan'), w, near))
    only = set(sys.argv[1:])
    print('Hoe hoger het getal, hoe minder de klinker op die van zijn soortgenoten lijkt.\n')
    for score, w, near in sorted(rows, key=lambda r: -r[0] if r[0] == r[0] else 0):
        if only and w not in only:
            continue
        mark = 'luister even' if score > DOUBT else ''
        print(f"{score:5.2f}  {w:6s} ({V[w]:2s})  lijkt op: {', '.join(f'{u} ({V[u]})' for u in near):40s} {mark}")


if __name__ == '__main__':
    main()
