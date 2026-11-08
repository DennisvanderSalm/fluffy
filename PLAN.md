# Plan: leer-app voor kinderen van 4 tot 6, met Fluffy

> Begonnen voor één kleuter van 4; sinds stap 7i is de doelgroep 4 tot 6 jaar (groep 1, 2 en het begin van groep 3).

Uitgangspunten uit de vragen: **iPad, liggend** · ze **telt tot 10+ en kent de cijfers 1–10** ·
Fluffy is een **lichtblauw wolkje** · hosting via **GitHub Pages** (https, offline installeerbaar).

---

## 0. Eerlijke kanttekeningen (waar eisen botsen of niet haalbaar zijn)

1. **"App openen → Fluffy begroet haar" kan niet zonder één tik.** iPadOS laat een web-app pas
   geluid maken (spraak én opnames) na een aanraking. Daarom opent de app met een slapende
   Fluffy op een rustig scherm. Ze tikt ergens op het scherm, Fluffy wordt wakker en begroet
   haar. Dat is één tik op een groot doel, en het hele scherm telt mee.
2. **Een web-app kan niet voorkomen dat ze de app verlaat** (veeg omhoog naar het beginscherm).
   Oplossing op apparaatniveau: zet **Begeleide toegang** aan (Instellingen → Toegankelijkheid →
   Begeleide toegang). Daarmee zit ze in de app vast tot jij hem ontgrendelt.
3. **Web Speech is een noodoplossing.** De Nederlandse iPad-stemmen (Ellen, Xander, Claire) spreken
   zinnen goed uit, maar:
   - de mond van Fluffy beweegt *ongeveer* mee (de API geeft geen klankinformatie);
   - losse klanken ("mmm", "sss") voor de **leesmodule kan TTS niet** goed uitspreken: die zegt "em".
     Voor lezen zijn **eigen opnames dus vrijwel verplicht**. Het audiosysteem is daarop ontworpen.
   - Tip: download in Instellingen → Toegankelijkheid → Gesproken materiaal → Stemmen → Nederlands
     een "verbeterde" stem. Dat klinkt veel natuurlijker en werkt offline.
4. **"Na 10 minuten stoppen" en "de lopende opdracht afmaken"** betekent dat een sessie een
   halve tot hele minuut kan uitlopen. Dat is een bewuste keuze: nooit midden in een opdracht afbreken.
5. **Een nieuwe sessie na het einde**: anders kan ze na het eindscherm meteen opnieuw beginnen
   (eindeloos spelen). Daarom blijft het eindscherm (slapende Fluffy) staan tot er een **rustpauze**
   voorbij is (standaard 1 uur, instelbaar). Jij kunt in het ouderdeel altijd direct een nieuwe sessie starten.
6. **Opslag op de iPad**: Safari wist websitegegevens na 7 dagen zonder gebruik, **behalve** als de app
   op het beginscherm is gezet. Zet hem dus via Deel → "Zet op beginscherm".
7. **GitHub Pages is openbaar**: de *code* is zichtbaar, maar er staan geen gegevens van het kind in.
   Alle voortgang blijft op de iPad.
8. **Wetenschappelijke nuance**:
   - De "85%-regel" (Wilson e.a., 2019) komt uit modellen van leren. Bij kleuters is het bewijs
     indirect (zone van naaste ontwikkeling, mastery learning). Ik gebruik het als richtwaarde, niet als wet.
   - Het **protégé-effect** is vooral aangetoond bij oudere kinderen (Chase e.a., 2009, groep 7/8).
     Bij 4-jarigen is wel goed aangetoond dat ze **telfouten van een pop herkennen** en dat dit hun
     telbegrip laat zien en versterkt (Gelman & Meck, 1983; Briars & Siegler, 1984). Fluffy's "foutjes"
     zijn daarom telfouten: overslaan, dubbel tellen, verkeerd eindgetal.
   - De **oudervergrendeling** gebruikt uitgeschreven getalwoorden. Die kan een kleuter niet lezen.
     Over een paar jaar kan ze dat wel; dan passen we het slot aan.
9. **Bestaande code**: in deze map stond een eerdere app ("Tellen & Hoeveelheden") die bewust *zonder*
   gesproken instructies werkte. Dat botst met deze opdracht. Ik verplaats hem naar `oud/` (niet
   verwijderd) en bouw opnieuw in TypeScript met de architectuur hieronder.

---

## 1. Stack en motivatie

| Keuze | Waarom |
|---|---|
| **TypeScript + Vite**, geen UI-framework | Klein (tientallen kB), snel op de iPad, geen runtime-afhankelijkheden. De schermen zijn eenvoudig; SVG + DOM is genoeg. |
| **Vitest** | Snelle unit-tests voor engine en sessielogica (pure functies, nep-klok). |
| **Eigen service worker** (via een klein Vite-plugin) | Precache van alle bestanden, volledig offline, zonder Workbox-afhankelijkheid. |
| **localStorage** met versie-schema | De hoeveelheid data is klein; eenvoudig en robuust. Migraties via `version`. |
| **Content-Security-Policy** in de productie-build | De browser *blokkeert* elke verbinding naar buiten; "niets naar buiten" is daarmee afgedwongen, niet alleen beloofd. |
| **Systeemlettertype** `ui-rounded` | Geen externe fonts; op iPad is dat SF Pro Rounded. |

---

## 2. Architectuur

```
src/
  core/                 gedeelde kern, domein-onafhankelijk
    engine/             vaardigheidsgraaf, mastery-model, planner (welk item nu?)
    session/            sessieduur, rustpauze, max per dag, samenvatting
    audio/              spraak (script-id's → opname óf TTS), zachte geluidjes
    fluffy/             Fluffy als SVG met standen + mondbeweging
    storage/            lokale opslag + schema-versies
    ui/                 schermen, slepen/tikken, oudervergrendeling, ouderdeel
  domains/
    rekenen/            vaardigheden, activiteiten, ouder-tips (nu)
    lezen/              (later; zelfde interfaces)
  content/
    spraak.nl.ts        ALLE gesproken zinnen met id's  ← hier eigen opnames aan koppelen
public/audio/nl/        opnames (ElevenLabs via `npm run stem`, of eigen); ontbreekt er één → TTS
```

**Domeinmodule-interface**: een module levert `skills` (knopen in de graaf met voorwaarden),
`activities` (elk koppelt aan één of meer vaardigheden en maakt items per niveau) en `parentTips`
(uitleg + spelletjes zonder scherm). De kern weet niets van rekenen. Lezen wordt een tweede module
met dezelfde vorm: geen herbouw nodig.

**Spraak als segmenten**: een zin is een lijst segmenten, bijvoorbeeld
`["geefn.vraag.1", "getal.4", "geefn.vraag.2"]`. Dat is "Kun je" + "vier" + "appels in het mandje leggen?".
Met TTS worden de teksten aan elkaar geplakt. Met opnames worden de clips na elkaar afgespeeld.
Zo heb je niet voor elk getal een aparte opname van de hele zin nodig.
Klanken voor lezen worden gewone segmenten (`klank.m` = "mmm").
Een opname kan ook een hele zin dekken (id's met `+` ertussen). De app zoekt per zin de langste
opname die past, zodat "Kun je vier appels in het mandje leggen?" als één vloeiende zin klinkt.

---

## 3. Adaptieve engine

**Per vaardigheid** bewaren we: status (`nieuw` / `bezig` / `beheerst`), huidig niveau (binnen de
vaardigheid), recente pogingen, en een herhaalschema.

**Score per item uit hulp, nooit uit tijd** (de engine krijgt geen tijd binnen):
- goed bij de eerste poging = 1
- goed na een hint = 0,5
- voorgedaan door Fluffy = 0 (het item komt later in de sessie terug)

**Niveau-trap, gericht op ±80–85% succes:**
- omhoog als de laatste 5 pogingen op dit niveau gemiddeld ≥ 0,85 zijn (en er minstens 4 zijn);
- omlaag als de laatste 3 pogingen gemiddeld ≤ 0,34 zijn (één keer vastlopen is dus geen probleem).

**Mastery = stabiel**: op het hoogste niveau gemiddeld ≥ 0,85 over de laatste 6 pogingen, **verdeeld over
minstens 2 sessies**. Beheersen op één dag telt dus nog niet als stabiel.

**Gespreide herhaling** (Leitner): een beheerste vaardigheid komt terug na 1, 3, 7, 14 en 30 dagen.
Gaat de herhaling goed, dan schuift ze een vak op. Lukt hij niet zonder hulp, dan gaat ze terug naar vak 1.
Twee keer achter elkaar mis is "terug naar oefenen".

**Planner, per item:**
1. Een item dat Fluffy voordeed komt terug, met minstens 2 andere items ertussen.
2. Ongeveer elk derde item is een herhaling van iets ouds dat aan de beurt is (interleaving).
3. Anders een vaardigheid aan de grens (`bezig`, of nieuw met alle voorwaarden beheerst),
   met maximaal 2 tegelijk.

**Startniveau** (ouder): vaardigheden onder het startpunt krijgen de status "aangenomen beheerst"
en komen al in de eerste sessie als herhaling langs. Gaat dat mis, dan zakken ze terug naar oefenen.
Zo hoeft de startinschatting niet perfect te zijn.

---

## 4. Leerlijn als vaardigheidsgraaf (rekenen)

| # | Vaardigheid (id) | Voorwaarden | Activiteit(en) |
|---|---|---|---|
| 1 | Synchroon tellen tot 5 (`tellen-5`) | geen | Samen tellen |
| 2 | Synchroon tellen tot 10 (`tellen-10`) | tellen-5 | Samen tellen |
| 2b | Telbegrip: fouten zien, volgorde mag (`telbegrip`) | tellen-10 | Fluffy telt fout |
| 3 | Kardinaliteit tot 5 (`hoeveel-5`) | tellen-5 | **Mandje vullen**, Samen tellen |
| 4 | Kardinaliteit tot 10 (`hoeveel-10`) | hoeveel-5, tellen-10 | **Mandje vullen** (tienveld), Samen tellen |
| 5 | Subitizing tot 5 (`zien-5`) | hoeveel-5 | Kiekeboe-stippen, vingers |
| 6 | Subitizing tot 10 via vijfstructuur (`zien-10`) | zien-5, hoeveel-10 | Kiekeboe (tienveld, 2 handen), Rekenrek (zeven zetten) |
| 7 | Vergelijken (`vergelijken`) | hoeveel-5 | Koekjes vergelijken (meer, minder, maak evenveel) |
| 8 | Cijfer ↔ hoeveelheid tot 10 (`cijfers-10`) | hoeveel-10 | **Mandje vullen** (cijferkaart), Cijfers zoeken |
| 9 | Getallenlijn: ervoor/erna (`buren-10`) | tellen-10, cijfers-10 | Getallenpad |
| 10 | Getallenlijn: plaats van een getal (`plaats-10`) | buren-10 | Waar woont…? |
| 11 | Splitsen tot 5 (`splitsen-5`) | zien-5 | Splitshuisje |
| 12 | Splitsen tot 10 (`splitsen-10`) | splitsen-5, zien-10 | Splitshuisje (rijtjes van vijf), Rekenrek (tien splitsen) |
| 13 | Erbij/eraf tot 5 met materiaal (`verhaal-5`) | splitsen-5 | Eendjes in de vijver |
| 14 | Erbij/eraf tot 10 (`verhaal-10`) | verhaal-5, splitsen-10 | Eendjes in de vijver (op het hoogste niveau achter het riet) |
| 15 | Patronen AB (`patroon-ab`) | geen | Kralenketting |
| 16 | Patronen ABB/ABC (`patroon-abc`) | patroon-ab | Kralenketting |
| 17 | Ruimtelijke woorden: op, onder, naast, in, voor, achter (`ruimte`) | geen | Waar zit het muisje? |
| 18 | Vormen, ook gedraaid en met bijna-vormen (`vormen`) | geen | Vormen zoeken |

Binnen elke vaardigheid lopen de niveaus van **concreet → beeld → symbool** en van **veel hulp → weinig hulp**.

`telbegrip` is in stap 2 toegevoegd als eigen vaardigheid. Fouten herkennen is iets anders dan zelf goed tellen,
en zo komt "Fluffy telt fout" ook aan bod bij een kind dat tellen tot 10 al beheerst (dat is dan "aangenomen"
en komt alleen nog als herhaling langs).

**Startniveau voor nu** (telt tot 10+, kent cijfers): `tellen-5`, `tellen-10` en `hoeveel-5` als
"aangenomen" (worden snel gecontroleerd). Ze begint bij `hoeveel-10`, gevolgd door `cijfers-10`,
`zien-5` en `patroon-ab`. De cijfers *herkennen* is iets anders dan begrijpen dat 7 bij zeven
dingen hoort. Daarom beginnen we bij hoeveelheid ↔ cijfer en niet bij het cijfer zelf.

---

## 5. Activiteiten en hun onderbouwing

| Activiteit | Didactisch doel | Principe / bron |
|---|---|---|
| **Mandje vullen** (Geef-me-N): "Kun je vier appels in het mandje leggen?" Slepen of tikken; in het mandje zit vanaf 6 een tienveld. Bij een cijferkaart: "Leg er zoveel in als dit cijfer." | Kardinaliteit: weten dat je stopt bij het getalwoord. Koppeling woord ↔ hoeveelheid ↔ cijfer. | Give-N-taak (Wynn, 1990; Sarnecka & Carey, 2008). Concreet → symbool. Tienveld/vijfstructuur (NL kleuterdidactiek). Hulp afbouwen: Fluffy telt eerst mee, later niet meer. |
| **Samen tellen**: tik elk beestje aan, Fluffy zegt het telwoord; daarna: "Hoeveel zijn het er?" en ze tikt het getal aan. Opstelling: op een rij → twee rijen (5 en de rest) → los. Bij "hoeveel" telt Fluffy op de hogere niveaus niet meer mee. Een al geteld beestje telt niet dubbel ("Die hebben we al geteld"). | Eén-op-één tellen, vaste volgorde, laatste telwoord = hoeveelheid | Telprincipes (Gelman & Gallistel, 1978); leerlijn tellen (Clements & Sarama): rij is makkelijker dan los. |
| **Fluffy telt fout** (protégé): Fluffy telt hardop en wijst aan met een handje, en vraagt "Heb ik het goed geteld?" (duim omhoog / duim omlaag). Fouten per niveau: overslaan en dubbel tellen → ook een telwoord overslaan → ook een verkeerd eindgetal, en "goed, maar van de andere kant" (dat klopt wél). Ongeveer 40% van de keren telt Fluffy goed, en nooit drie keer hetzelfde antwoord op rij. Heeft ze een fout gevonden, dan tellen ze samen opnieuw. | Telprincipes expliciet maken door fouten te herkennen | Gelman & Meck (1983); Briars & Siegler (1984): dat de volgorde niet uitmaakt, begrijpen kinderen pas later, daarom pas op het hoogste niveau. Learning by teaching (Chase e.a., 2009). |
| **Kiekeboe-stippen**: dobbelsteenbeeld, vingers, tienveld of losse stippen zijn even zichtbaar (3 s op het makkelijkste niveau, 2 à 2,5 s daarna), dan zakt er een dekentje over. Ze antwoordt met een getalkaartje, zonder tijdsdruk. Hint: nog een keer kijken, iets langer. Voordoen: het dekentje gaat eraf en Fluffy wijst aan; boven de vijf zegt ze "Een hele hand, dat is vijf" en telt verder, en sluit af met "Vijf en twee, dat is zeven". Tot 5: dobbelsteen → ook vingers → ook losse stippen. Tot 10: tienveld → ook twee handen → ook twee dobbelstenen (vijf en nog wat). | Subitizing, vijfstructuur | Clements (1999); Starkey & Cooper (1995). Het dekentje zorgt dat ze het beeld in één keer ziet en niet telt; antwoorden mag zo lang als ze wil. |
| **Koekjes vergelijken**: twee bordjes boven elkaar. "Op welk bordje liggen er meer (minder) koekjes?" Ze tikt het bordje aan. Niveaus: groot verschil → klein verschil en ook "minder" → "maak evenveel" (koekjes uit de pot erbij of terug) en rijen die misleiden (het kleinste groepje ligt wijd uit elkaar). Hint: maatjes maken, de koekjes schuiven onder elkaar en wie geen maatje heeft licht op. Voordoen: beide bordjes tellen, "Vijf is meer dan drie." | Vergelijken, één-op-één koppelen, aantal boven lengte | Leerlijn vergelijken (Clements & Sarama); Mix (1999); Piaget-taak (lengte versus aantal) als uitdaging op het hoogste niveau. |
| **Cijfers zoeken**: cijfer → tienveld-kaartje, tienveld → getalkaartje, en (hoogste niveau) alleen gesproken: "Zoek het kaartje met zeven." Eerst getallen tot 6 met duidelijk andere keuzes, daarna tot 10 met keuzes die dicht bij elkaar liggen. Hint: Fluffy telt het gekozen kaartje ("Hier zijn er vijf. We zoeken zeven."). Voordoen met de vijfstructuur. | Drie representaties koppelen | Triple-code-model (Dehaene); Number Worlds (Griffin & Case). |
| **Getallenpad**: tien vakjes op één rij, een konijntje en een huisje bij 10 (samen naar huis, geen winnaar). "Het konijntje springt één vakje verder. Op welk vakje komt het?" Bij elke sprong noemt Fluffy het getal: "Na vier komt vijf." Niveaus: één verder → ook twee verder of één terug → zonder nummers op het pad: "Welk getal komt na zes?" met getalkaartjes. | Lineair getalbegrip, ervoor/erna | Siegler & Ramani (2008, 2009): het *noemen van de vakgetallen* is het werkzame bestanddeel; een rechte rij werkt beter dan een rond bord. |
| **Waar woont…?**: een straat met tien huisjes op een rij. "Waar woont zeven?" Niveaus: alleen het gezochte huisje zonder nummer → alleen 1, 5 en 10 → alleen 1 en 10. Hint: Fluffy wijst het dichtstbijzijnde bekende nummer aan ("Hier woont vijf. Zoek maar verder vanaf hier."). | Plaats van een getal op de getallenlijn | Siegler & Booth (2004): lineaire getallenlijn-schatting hangt samen met rekenvaardigheid. |
| **Rekenrek**: tien kralen op een stang, 5 blauw + 5 wit. Een tik op een kraal schuift die kraal en alle kralen ervoor naar Fluffy, dus zeven zet je in één tik. Zetten (`zien-10`): "Schuif zeven kralen naar mij toe"; eerst 5–7, dan tot 10, dan vanaf een rekenrek waar al kralen opzij liggen ("Maak er zeven van"); klaar met het duimpje. Hint: "Dat zijn er vier, we wilden er zeven" en de blauwe vijf lichten op. Voordoen: alle blauwe in één keer, dan verder tellen, "Vijf en twee, dat is zeven". Splitsen (`splitsen-10`): Fluffy schuift er zes opzij, "Hoeveel kralen zijn er aan de andere kant?"; eerst met 5–9 opzij, dan alles, dan met een dekentje over de andere kant. Afsluiting: "Tien is zes en vier." | Vijfstructuur, splitsen van tien, hoeveelheden in één keer zetten | Rekenrek (Treffers, Freudenthal Instituut). Aanwijzen in plaats van links/rechts, want dat kennen kleuters nog niet. |
| **Splitshuisje**: vlinders in rijtjes van vijf; een paar vliegen het huisje in en de deur gaat dicht. "Er waren vijf vlinders. Buiten zijn er twee. Hoeveel vlinders zitten er in het huisje?" Getalkaartjes. Niveaus (tot 5 en tot 10): kijken hoe ze naar binnen vliegen → grotere aantallen → alleen het getal op het dak ("In dit huisje wonen zeven vlinders"). Hint: even door de deur gluren. Voordoen: deur open, binnen tellen, "Vijf is twee en drie." | Deel-geheel, splitsen | NL kleuterdidactiek; part-whole (Resnick, 1983). |
| **Verhaaltjes**: "Er zitten 3 vogels op het dak. Er komt er 1 bij." Met materiaal naspelen. | Erbij/eraf modelleren | Cognitively Guided Instruction (Carpenter e.a.): kleuters lossen zulke verhalen op door ze na te spelen. |
| **Kralenketting**: wat komt hierna? (AB-AB) | Patroonbegrip | Rittle-Johnson e.a. (2019): patroonbegrip voorspelt rekenen. |
| **Opdracht in het echt**: "Kun je 3 lepels pakken? Tik op mij als je terug bent." Daarna tellen ze samen na; het kind tikt per lepel op een stip. | Transfer naar de echte wereld, concreet materiaal | Embodied cognition; concreet → beeld (Bruner). |

**Overal in de app:**
- **Feedbackladder**: (1) hint, bijvoorbeeld samen natellen wat er ligt; (2) Fluffy doet het hardop
  denkend voor en daarna doen ze het samen; (3) het item komt later terug. Daarna gaat het spel door,
  zonder eindeloze lus. *Contingent tutoring* (Wood, Bruner & Ross, 1976); worked examples (Sweller).
- **Proces-lof**: "Je legde ze één voor één", "Je telde heel precies". Nooit "slim".
  Gunderson e.a. (2013) vonden bij peuters dat proces-lof samenhangt met een latere groei-mindset.
- **Geen beloningssystemen**: externe beloningen ondermijnen intrinsieke motivatie, ook bij kleuters
  (Lepper, Greene & Nisbett, 1973; Deci, Koestner & Ryan, 1999).
- **Mayer**: gesproken uitleg bij beeld (modaliteit), één ding tegelijk (coherentie), Fluffy kijkt naar
  waar het om gaat (signalering). Geen bewegende decoraties tijdens een opdracht.
- **Autonomie**: om de 3 items kiest ze uit 2 activiteiten. Fluffy noemt beide (het plaatje licht zacht op),
  één tik kiest. Beide opties komen uit het plan (dezelfde vaardigheid met een andere activiteit, of het item
  dat daarna aan de beurt was), dus kiezen gaat nooit ten koste van de leerlijn. Geen keuze als er een
  voorgedaan item terugkomt. Kleine, echte keuzes versterken de intrinsieke motivatie (Patall, Cooper &
  Robinson, 2008); twee opties is genoeg voor een kind dat niet leest.
- **Eerste keren**: de eerste 2 keer met een activiteit geeft Fluffy wat meer uitleg (per activiteit bijgehouden).

---

## 6. Schermen en verloop

1. **Slaapscherm / start**: Fluffy slaapt rustig. Een tik waar dan ook → Fluffy wordt wakker en begroet
   haar bij naam.
2. **Opdracht**: Fluffy links onder, het materiaal in het midden, een groot duim-knopje ("klaar") rechts onder.
   Tik op Fluffy = de opdracht opnieuw horen.
3. **Feedback**: Fluffy reageert (blij of nadenken). Er is nooit een rood kruis of foutgeluid.
4. **Einde**: als de tijd om is, maakt ze het lopende item af. Fluffy vertelt in één of twee zinnen wat ze
   samen deden, gaapt en slaapt. Het scherm wordt rustig donkerblauw. Er is geen "nog een keer"-knop.
5. **Ouderdeel**: tandwieltje rechtsboven (klein, vaag). Tikken doet niets. **2 seconden vasthouden**
   opent een slot met uitgeschreven getalwoorden ("Tik: zeven, twee, negen"). Tijdens het ouderdeel
   staat de sessieklok stil.

Technisch kindveilig: geen tekstselectie, geen contextmenu, geen zoomen of knijpen, geen
pull-to-refresh, tikdoelen ≥ 2 cm (≥ 110 CSS-px op iPad), ruime sleepzones (loslaten "in de buurt van" het mandje telt).

---

## 7. Ouderdeel

- **Voortgang per vaardigheid** in gewone taal: "Nog niet aan begonnen", "Hier oefenen jullie nu mee",
  "Gaat goed, komt af en toe terug". Per vaardigheid staat erbij wat het is en een **spelletje zonder
  scherm**. Geen percentages of scores.
- **Laatste sessies**: datum, duur, waarmee geoefend.
- **Instellingen**: naam, sessielengte (5/10/15/20 min), max sessies per dag (geen/1/2/3), rustpauze,
  volume, stem, startniveau, voortgang resetten (met bevestiging), nu een nieuwe sessie starten.

---

## 8. Voorbereiding op lezen (nu niet bouwen)

- Graaf: `rijm`, `beginklank`, `klank-letter-<x>` (in een vaste volgorde, bijvoorbeeld m, s, r, v, aa, …),
  `hakken-mkm`, `plakken-mkm`. Ze hebben dezelfde voorwaarden-structuur als rekenen.
- Audio: klanken als segmenten (`klank.m`); opnames verplicht, TTS alleen als terugval voor zinnen.
- Fluffy: dezelfde standen, plus eventueel een "luister"-houding met handje aan het oor.
- Engine en planner: zijn domein-onafhankelijk; herhaling en interleaving werken over domeinen heen.

---

## 9. Privacy

Geen netwerkverkeer: een CSP met `connect-src 'none'` in de build, en de service worker cachet alleen eigen
bestanden. Geen analytics, geen externe scripts of fonts. Alles staat in `localStorage` op de iPad.

---

## 10. Testen

- **Vitest**: niveau-trap, mastery over 2 sessies, hulpgewicht, herhaalschema, terugzakken, planner
  (herhaalitems, interleaving, voorwaarden), sessielogica (einde na lopend item, rustpauze, max per dag,
  klok staat stil in het ouderdeel).
- **Tabletformaat**: in de browser op 1180×820 (iPad Air liggend) en 1024×768 (iPad 9e generatie).
- **Met je kind**: na elke stap een korte testlijst (zie README).

---

## 10b. Lezen (voorbereidend)

Wat leren lezen het sterkst voorspelt en wat je bij een vierjarige al kunt oefenen: **klanken los horen**
(vooral de beginklank) en **weten welke letter bij een klank hoort** (National Early Literacy Panel, 2008).
Die twee werken het best samen: klanktraining met letters erbij heeft meer effect dan zonder
(Bus & van IJzendoorn, 1999; National Reading Panel, 2000). Rijmen voorspelt lezen nauwelijks als je de
klanken al meetelt (Hulme e.a., 2002; Muter e.a., 2004), en lettergrepen klappen voegt weinig toe.
Daarom: beginklank eerst, letters er direct achteraan, rijmen als opwarmer.

| Vaardigheid (id) | Voorwaarden | Activiteit |
|---|---|---|
| Beginklank horen (`beginklank`) | geen | **Beginklank**: "Welke begint net zo als maan?" Na het antwoord verschijnt de letter: "Kijk, zo schrijf je het begin van maan." |
| Rijmen horen (`rijmen`) | geen | **Rijmen** (opwarmer): "Wat rijmt op huis?" |
| Letters en klanken (`letters`) | beginklank | **Letters zoeken**: "Mmm… maan. Welke letter hoort bij het begin van maan?" |
| Hakken en plakken (`hakken`) | beginklank | **Hakken en plakken**: Fluffy zegt "b… oo… t", de blokjes lichten op, zij kiest het plaatje. Niveau 2 met een woord dat net zo begint, niveau 3 met de letters op de blokjes |
| Eerste woordjes (`woordjes`) | hakken, letters | **Eerste woordjes**: de letters staan er (m · aa · n), zij tikt ze aan om de klanken te horen en kiest het plaatje |

Niveaus: twee plaatjes/letters → drie → drie met een lastige afleider (bij rijmen een woord met dezelfde
beginklank, bij beginklank een woord dat rijmt, bij letters een letter die erop lijkt: m/n, b/d).
Fluffy gebruikt altijd de klank, nooit de letternaam ("mmm", niet "em"). Klanken die je kunt aanhouden
(m, v, h, z, r) zegt ze eerst los en dan in het woord: "mmm… maan" (Byrne & Fielding-Barnsley, 1991).
Bij b, p, k en t kan dat niet. Woorden met twee beginklanken (kraan, schip) tellen niet als "hetzelfde begin".

Lezen is klanken omzetten in woorden **én** begrijpen wat er staat (Gough & Tunmer, 1986). De app oefent
alleen het eerste. Woordenschat en begrip groeien vooral door samen voorlezen en erover praten
(Mol, Bus & de Jong, 2009); dat staat als tip in het ouderdeel.

Aan het begin van een sessie kiest het kind met twee plaatjes (cijferblokjes / boekje met a en b), of de
ouder zet het vak vast in het ouderdeel. In het ouderdeel kan de ouder per vaardigheid het niveau zelf
zetten (nog niet / oefenen stap n / kan ze al); daarna past de app het weer aan op hoe het gaat.

## 10c. Ouder en kind samen

Een vierjarige leert van een scherm het meest als er iemand meekijkt en meepraat (Hirsh-Pasek e.a., 2015:
actief, betrokken, betekenisvol en *sociaal*). Dat laatste missen de meeste apps. Wat de app daarom doet:

- **Opdrachten in het echt** ("Pak eens drie knuffels. Doe het maar samen met mama."), passend bij wat ze net
  oefende. Niets te winnen of te verliezen: een duimpje als ze klaar is. De speelklok staat zolang stil.
  Instelling "Samen spelen": uit, af en toe (één per sessie), of "we spelen samen" (om de vier items, en Fluffy
  begroet jullie allebei). De ouder kiest hoe Fluffy hem of haar noemt (papa, mama, oma, opa).
- **Navertellen**: aan het eind zegt Fluffy "Vertel maar aan papa wat we gedaan hebben." Zelf navertellen
  helpt onthouden en geeft de ouder een ingang voor een gesprek.
- **Spelletje voor vandaag** bovenaan het ouderdeel: één of twee spelletjes zonder scherm die aansluiten bij de
  laatste sessie. Thuis spelen met getallen (bordspellen, Ramani & Siegler, 2008) en samen voorlezen
  (Mol, Bus & de Jong, 2009) doen meer dan welke app ook.
- **Waar ze tegenaan loopt**: vaardigheden waar ze de laatste drie weken vaak hulp bij nodig had, en wat bij fouten
  vaker opviel ("haalt voor en achter nog door elkaar", "luistert vooral naar de eerste klank"). Geen scores.
- **Eigen stem**: de ouder spreekt de naam in (dan niet meer de computerstem) en een welterusten na "doei doei".
  Blijft op het apparaat (IndexedDB), zit niet in de back-up.

Bewust níet: beloningen, reeksen, een Fluffy die verdrietig is als je niet speelt, meldingen, "nog één keer".

## 11. Stappen

| Stap | Inhoud |
|---|---|
| **1 (klaar)** | Verticale slice: kern (engine, sessie, opslag, audio, Fluffy), **Mandje vullen** (hoeveel-5/10, cijfers-10) met adaptiviteit en feedbackladder, rustig einde, ouderdeel, tests, GitHub Pages-workflow |
| **2 (klaar)** | Samen tellen + Fluffy telt fout (nieuwe vaardigheid `telbegrip`); keuzemomenten tussen 2 activiteiten |
| **3 (klaar)** | Kiekeboe-stippen (subitizing, vingers, vijfstructuur) |
| **4 (klaar)** | Koekjes vergelijken + Cijfers zoeken |
| **5 (klaar)** | Getallenpad (ervoor/erna) + Waar woont…? |
| **6 (klaar)** | Rekenrek + splitshuisje |
| **6b (klaar)** | Vakkeuze aan het begin (rekenen of lezen, met plaatjes; ouder kan het vastzetten), eerste leesspellen **Rijmen** en **Beginklank**, niveau per vaardigheid handmatig instellen in het ouderdeel, uitleg bij het tandwiel |
| **6c (klaar)** | Leerlijn lezen bijgewerkt naar het onderzoek: beginklank eerst, rijmen als opwarmer, klappen eruit, **Letters zoeken**, letter bij de beginklank, uitgerekte klanken, voorleestip |
| **6d (klaar)** | Knop "Fluffy wakker maken" in het ouderdeel: slaat rustpauze en dagmaximum één keer over en start meteen een sessie |
| **7 (klaar)** | **Hakken en plakken** en **Eerste woordjes** (lezen); **Eendjes in de vijver** (erbij/eraf), **Kralenketting** (patronen), **Waar zit het muisje?** (ruimte) en **Vormen zoeken** (rekenen) |
| **7b (klaar)** | Ouder en kind samen: opdrachten in het echt (de klok staat dan stil), "speel je samen met mama?", "vertel maar wat we gedaan hebben", spelletje voor vandaag en "waar ze tegenaan loopt" in het ouderdeel, eigen stem (naam en welterusten), back-up. Een lastig stukje eindigt met iets wat ze al kan; een opwarmer uit het andere vak houdt oude stof vers |
| **7c (klaar)** | Techniek: offline-opslag gesplitst (app per versie, opnames blijven staan; een update haalt alleen nieuwe opnames op en schakelt pas over buiten een sessie), opnames beluisteren en zelf opnieuw inspreken in het ouderdeel, back-upherinnering en opslagstatus, sessieregels los testbaar, vangnet als een opname niet start, proef in WebKit (Safari) bij elke publicatie |
| **7d (klaar)** | Spraak: tellen in een vast ritme, getallen opnieuw ingesproken zonder afkappen, zacht in- en uitfaden, enkelvoud bij één, test tegen geplakte zinnen, automatische controle van alle opnames met spraakherkenning (en opnieuw inspreken wat niet klopt), "Klinkt niet goed" in het ouderdeel |
| **7e (klaar)** | Sneller op niveau: een nieuwe vaardigheid begint met een proefje (3 opdrachten op het hoogste niveau; meteen goed = overslaan, later ter controle terug; anders oefenen vanaf het middelste niveau), 3 keer achter elkaar zelf goed = niveau omhoog, "opnieuw laten kijken" in het ouderdeel. Meer opdrachten in het echt (72 in totaal, veel met bewegen), twee per sessie, steeds een andere |
| **7f (klaar)** | De rest van de dag: aan het eind geeft Fluffy een opdracht bij een gewoon moment van de dag ("Als je de trap op gaat: tel de treden"; 48 opdrachten, 2 per vaardigheid), met een plaatje op het slaapscherm (tikken = nog een keer horen); de volgende dag vraagt Fluffy ernaar (telt niet als speeltijd). Ouderdeel: dagkaart "Vandaag samen" met de opdracht, ideeën bij gewone momenten en een spelletje, te delen via WhatsApp |
| **7g (klaar)** | Sommen met kralen: optellen en aftrekken met cijfers tot 10 (Sommen tot 5 en tot 10, na Erbij en eraf). Niveaus: kralenstaafjes in Montessori-kleuren → handjes (vingerpatronen) → de som alleen; tot 10 geregeld dubbelen. Onderbouwing: Jordan e.a. (2012), Kullberg e.a. (2019); voor 4-jarigen niet onderzocht, daarom pas na erbij en eraf. README: "Hoe Fluffy lesgeeft" (ook: geen leerstijlen, Pashler e.a. 2008) en eerlijke grenzen van het bewijs |
| **7h (klaar)** | Privacy: de naam van het kind is helemaal weg (geen invulveld, geen opname; Fluffy zegt "Hoi!" en "Doei doei!"); een eerder ingevulde naam en opname worden gewist. De computerstem (alleen nog reserve) gebruikt alleen stemmen op het apparaat zelf, nooit een online stem. Privacy-sectie in de README en het ouderdeel bijgewerkt |
| **7i (klaar)** | Doelgroep 4 tot 6 jaar: teksten in README, ouderdeel en doc aangepast. Het slot van het ouderdeel is een keersom (zoals 7 × 8) in plaats van uitgeschreven getallen, want een 6-jarige leest die al. |
| 8 | Afronding v1: met haar testen en bijstellen |
| later | Leesmodule |
