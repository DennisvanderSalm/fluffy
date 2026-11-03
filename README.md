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
```

Snel testen op de iPad zonder te publiceren: `npm run dev`, dan op de iPad (zelfde wifi)
`http://<ip-van-je-pc>:5173` openen. Spraak werkt dan al; offline installeren nog niet (daarvoor is https nodig).

## Op de iPad zetten (GitHub Pages)

1. Maak op GitHub een nieuwe repository (bijvoorbeeld `fluffy`) en push deze map naar de branch `main`.
2. Ga in de repository naar **Settings → Pages** en kies bij *Source*: **GitHub Actions**.
3. Na een paar minuten staat de app op `https://<jouw-naam>.github.io/fluffy/`.
4. Open die link op de iPad in **Safari** → Deel-knop → **Zet op beginscherm**.
5. Open de app één keer met wifi; daarna werkt hij ook offline.

**Aanraders op de iPad**
- Instellingen → Toegankelijkheid → Gesproken materiaal → Stemmen → Nederlands: download een
  *verbeterde* stem (bv. Claire of Xander). Klinkt veel natuurlijker.
- Instellingen → Toegankelijkheid → **Begeleide toegang** aan. Start de app, klik 3× op de zij-/thuisknop
  en je kind blijft in de app.

## Ouderdeel

Rechtsboven staat een vaag tandwieltje. **Houd het 2 seconden vast** en tik dan de drie getallen aan
die er in woorden staan. Daar vind je de voortgang per vaardigheid, spelletjes zonder scherm en de instellingen.

## Eigen stem opnemen

Alle zinnen staan met een id in [src/content/spraak.nl.ts](src/content/spraak.nl.ts).
Zie [public/audio/nl/LEESMIJ.txt](public/audio/nl/LEESMIJ.txt) om ze te vervangen door eigen opnames.

## Structuur

```
src/core/        gedeelde kern: engine (mastery + planner), sessie, audio, Fluffy, opslag, schermen
src/domains/     domeinmodules: rekenen (nu), lezen (later)
src/content/     alle gesproken zinnen
tests/           Vitest: engine, planner, sessielogica
oud/             de eerdere app ("Tellen & Hoeveelheden"), ter referentie bewaard
```
