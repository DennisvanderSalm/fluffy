# Fluffy voor ontwikkelaars

Hoe je de app zelf bouwt, publiceert en de stem laat inspreken. De uitleg voor ouders staat in de
[README](README.md); het volledige plan met de onderbouwing per stap in [PLAN.md](PLAN.md).

## Ontwikkelen

```bash
npm install
npm run dev      # http://localhost:5173 (ook bereikbaar vanaf de iPad via het IP-adres van je pc)
npm test         # tests van de adaptieve engine en de sessielogica
npm run build    # productieversie in dist/ (met offline service worker)
npm run e2e      # bouwt, en speelt de app na in WebKit (de motor van Safari): sessie, ouderdeel, offline, updates
```

Snel testen op de iPad zonder te publiceren: `npm run dev`, dan op de iPad (zelfde wifi)
`http://<ip-van-je-pc>:5173` openen. Spraak werkt dan al; offline installeren nog niet (daarvoor is https nodig).

## Op de iPad zetten (GitHub Pages)

1. Maak op GitHub een nieuwe repository (bijvoorbeeld `fluffy`) en push deze map naar de branch `main`.
2. Ga in de repository naar **Settings → Pages** en kies bij *Source*: **GitHub Actions**.
3. Na een paar minuten staat de app op `https://<jouw-naam>.github.io/fluffy/`.
4. Open die link op de iPad in **Safari** → Deel-knop → **Zet op beginscherm**.
5. Open de app één keer met wifi; daarna werkt hij ook offline.

**Nieuwe versies.** Na elke push draaien eerst alle tests (ook in WebKit); pas daarna komt de nieuwe
versie online. De iPad haalt hem op de achtergrond binnen: alleen de app zelf en nieuwe opnames, niet
opnieuw alle opnames. Overschakelen gebeurt pas als Fluffy slaapt of op het startscherm staat, nooit
midden in een sessie.

## Stem van Fluffy (ElevenLabs)

Zonder opnames praat Fluffy met de computerstem van de iPad. Met het script `npm run stem`
laat je alle zinnen **één keer** inspreken door ElevenLabs. De mp3's komen in `public/audio/nl/`
en worden met de app meegeleverd. Tijdens het spelen gaat er niets naar ElevenLabs: de app blijft offline,
en de API-sleutel staat alleen op je pc.

1. Maak een account op elevenlabs.io. Kies in de **Voice Library** een warme, rustige Nederlandse stem
   en voeg die toe aan **My Voices**. Maak bij je profiel een **API key** aan.
2. Maak in deze map een bestand `.env.local` (staat in `.gitignore`, gaat dus nooit naar GitHub):
   ```
   ELEVENLABS_API_KEY=jouw-sleutel
   ELEVENLABS_VOICE_ID=id-van-de-stem
   ```
   Het id vind je met `npm run stem -- --stemmen`.
3. Kijk eerst wat het kost (er wordt niets verstuurd):
   ```bash
   npm run stem -- --proef
   ```
   Nu zijn dat ruim 1.400 opnames en zo'n 45.000 tekens.
4. Beluister de stem eerst met een paar zinnen, dan de rest:
   ```bash
   npm run stem -- --max 10
   npm run dev
   npm run stem
   ```
5. Tevreden? Commit en push `public/audio/nl`. Na de deploy praat Fluffy op de iPad met de nieuwe stem.

Goed om te weten:
- **Hele zinnen**: "Kun je vier appels in het mandje leggen?" is één opname, geen geplakte stukjes.
  Elke activiteit geeft zelf op welke zinnen dat zijn (`phrases()`). Een test (`tests/geplakt.test.ts`)
  controleert dat zinnen met getallen niet midden in de zin geplakt worden, en `npm run dev` waarschuwt
  in de console als het toch gebeurt. Bij één past de app de zin aan: "Dus het is er één".
- **Getallen** worden ingesproken met de getallen ervóór als context, zodat "drie" klinkt als tellen.
  Niet met de getallen erna: dan kapt de stem het woord af ("ach" in plaats van "acht").
- **Tellen gaat in een vast ritme**: elk getal begint ongeveer een seconde na het vorige (de eerste
  keren met een spelletje iets rustiger), of het woord nu kort is of lang.
- **Automatische controle.** Na het inspreken meet het script elke opname: stopt hij midden in een klank,
  en hoort spraakherkenning (ElevenLabs Speech-to-Text) de goede woorden? Uitslagen staan in
  `scripts/controle.json`.
  ```bash
  npm run stem -- --controle                 # alleen controleren
  npm run stem -- --herstel                  # wat niet klopt opnieuw inspreken (tot 3 keer)
  npm run stem -- --afgekeurd getal.8,w.vis  # deze opnieuw inspreken
  ```
  Losse klanken ("mmm", "b") kan spraakherkenning niet beoordelen: luister die zelf na in het ouderdeel.
  Klinkt daar iets niet goed, tik dan op **Klinkt niet goed**; het ouderdeel geeft je dan de regel voor `--afgekeurd`.
  De sleutel moet daarvoor ook Speech-to-Text mogen gebruiken.
- **Alleen wat verandert** wordt opnieuw ingesproken. Een andere stem of gewijzigde tekst? Draai het script opnieuw.
  Met `--opnieuw` spreek je alles opnieuw in.
- **Geen naam.** De app vraagt geen naam van het kind, dus die kan ook nooit naar ElevenLabs gaan.
- Controleer zelf de actuele prijzen en de gebruiksvoorwaarden van je ElevenLabs-abonnement.
- Optioneel in `.env.local`: `ELEVENLABS_MODEL` (standaard `eleven_multilingual_v2`) en `ELEVENLABS_SPEED` (standaard `0.95`).

## Eigen stem opnemen

Alle zinnen staan met een id in [src/content/spraak.nl.ts](src/content/spraak.nl.ts).
Zie [public/audio/nl/LEESMIJ.txt](public/audio/nl/LEESMIJ.txt) om ze te vervangen door eigen opnames.
Eigen opnames gaan voor op die van ElevenLabs.

## Structuur

```
src/core/        gedeelde kern: engine (mastery + planner), sessie, audio, Fluffy, opslag, schermen
src/domains/     domeinmodules: rekenen en lezen
src/content/     alle gesproken zinnen
tests/           Vitest: engine, planner, sessielogica, activiteiten, opnames
e2e/             Playwright (WebKit): de app nagespeeld zoals op de iPad
oud/             de eerdere app ("Tellen & Hoeveelheden"), ter referentie bewaard
```
