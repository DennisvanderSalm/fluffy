# Fluffy: rustige leer-app voor kleuters

Een rustige leer-app voor een kleuter van 4. Fluffy, een zacht wolkje, speelt mee en doet dingen voor.
Versie 1 gaat over beginnende gecijferdheid; een leesmodule komt later.
Het volledige plan en de onderbouwing staan in **[PLAN.md](PLAN.md)**.

- Volledig offline, geen accounts, geen tracking. Alle voortgang blijft op de iPad.
- Geen punten, sterren, streaks, timers of "kom terug"-meldingen.
- De sessie eindigt vanzelf rustig (standaard na 10 minuten).

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

**Aanraders op de iPad**
- Instellingen → Toegankelijkheid → Gesproken materiaal → Stemmen → Nederlands: download een
  *verbeterde* stem (bv. Claire of Xander). Klinkt veel natuurlijker.
- Instellingen → Toegankelijkheid → **Begeleide toegang** aan. Start de app, klik 3× op de zij-/thuisknop
  en je kind blijft in de app.

## Ouderdeel

Rechtsboven staat een vaag tandwieltje. **Houd het 2 seconden vast** en tik dan de drie getallen aan
die er in woorden staan. Daar vind je het spelletje voor vandaag, de voortgang per vaardigheid, waar ze
tegenaan loopt, de instellingen (ook "Samen spelen"), je eigen stem, alle opnames om te beluisteren
(en zelf opnieuw in te spreken als er een niet goed klinkt), de back-up (met een herinnering als die
lang niet gemaakt is) en hoe veilig de voortgang op de iPad staat.

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
   Nu zijn dat zo'n 300 opnames en ruim 8.000 tekens.
4. Beluister de stem eerst met een paar zinnen, dan de rest:
   ```bash
   npm run stem -- --max 10
   npm run dev
   npm run stem
   ```
5. Tevreden? Commit en push `public/audio/nl`. Na de deploy praat Fluffy op de iPad met de nieuwe stem.

Goed om te weten:
- **Hele zinnen**: "Kun je vier appels in het mandje leggen?" is één opname, geen geplakte stukjes.
  Elke activiteit geeft zelf op welke zinnen dat zijn (`phrases()`).
- **Getallen** worden ingesproken met de buurgetallen als context, zodat "drie" klinkt als tellen.
- **Alleen wat verandert** wordt opnieuw ingesproken. Een andere stem of gewijzigde tekst? Draai het script opnieuw.
  Met `--opnieuw` spreek je alles opnieuw in.
- **De naam van je kind gaat niet naar ElevenLabs.** Die zegt de computerstem. Wil je ook de naam
  met een opname, neem die dan zelf op (zie hieronder).
- Controleer zelf de actuele prijzen en de gebruiksvoorwaarden van je ElevenLabs-abonnement.
- Optioneel in `.env.local`: `ELEVENLABS_MODEL` (standaard `eleven_multilingual_v2`) en `ELEVENLABS_SPEED` (standaard `0.95`).

## Eigen stem opnemen

Alle zinnen staan met een id in [src/content/spraak.nl.ts](src/content/spraak.nl.ts).
Zie [public/audio/nl/LEESMIJ.txt](public/audio/nl/LEESMIJ.txt) om ze te vervangen door eigen opnames.
Eigen opnames gaan voor op die van ElevenLabs.

## Structuur

```
src/core/        gedeelde kern: engine (mastery + planner), sessie, audio, Fluffy, opslag, schermen
src/domains/     domeinmodules: rekenen (nu), lezen (later)
src/content/     alle gesproken zinnen
tests/           Vitest: engine, planner, sessielogica, rekenactiviteiten
oud/             de eerdere app ("Tellen & Hoeveelheden"), ter referentie bewaard
```
