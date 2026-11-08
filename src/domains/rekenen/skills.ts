import type { LineId } from '../../content/spraak.nl';
import type { SkillInfo, StartLevel } from '../../core/domain';

/**
 * Leerlijn rekenen als graaf met voorwaarden (Clements & Sarama: kleine stappen in de
 * natuurlijke volgorde). Binnen een vaardigheid lopen de niveaus van concreet naar symbool
 * en van veel naar weinig hulp.
 */
const d = 'rekenen';

export const REKEN_SKILLS: SkillInfo[] = [
  {
    id: 'tellen-5', domain: d, requires: [], levels: 3, stage: 1,
    name: 'Tellen tot 5',
    about: 'Bij elk ding precies één telwoord zeggen, in de goede volgorde.',
    offScreen: 'Tel samen de traptreden als jullie naar boven lopen, of de knoopjes van een jas.',
  },
  {
    id: 'tellen-10', domain: d, requires: ['tellen-5'], levels: 3, stage: 1,
    name: 'Tellen tot 10',
    about: 'Tot tien tellen en daarbij elk ding één keer aanwijzen.',
    offScreen: 'Tel de appels in de fruitschaal en wijs ze aan. Tel ook eens de stappen naar de voordeur.',
  },
  {
    id: 'telbegrip', domain: d, requires: ['tellen-10'], levels: 3, stage: 1,
    name: 'Snappen hoe tellen werkt',
    about: 'Zien wanneer iemand fout telt (eentje overslaan, dubbel tellen, een getal vergeten) en weten dat je in elke volgorde mag tellen.',
    offScreen: 'Tel zelf eens "per ongeluk" fout: sla een knuffel over of tel er een dubbel. Mag zij je verbeteren? Tel ook eens van rechts naar links: klopt het dan nog?',
  },
  {
    id: 'hoeveel-5', domain: d, requires: ['tellen-5'], levels: 3, stage: 2,
    name: 'Hoeveel? (tot 5)',
    about: 'Begrijpen dat het laatste telwoord zegt hoeveel het er zijn, en precies zoveel kunnen pakken.',
    offScreen: '"Geef mij eens 3 lepels." Daarna samen natellen. Of: "Hoeveel koekjes liggen er? Ja, 4!"',
  },
  {
    id: 'hoeveel-10', domain: d, requires: ['hoeveel-5', 'tellen-10'], levels: 3, stage: 2,
    name: 'Hoeveel? (tot 10)',
    about: 'Precies een gevraagd aantal pakken tot tien. Het tienveld (2 rijen van 5) helpt om het in één keer te zien.',
    offScreen: 'Leg sokken in een eierdoos van 10 (2 rijen van 5): "Doe er eens 7 in." Hoeveel vakjes zijn er nog leeg?',
  },
  {
    id: 'zien-5', domain: d, requires: ['hoeveel-5'], levels: 3, stage: 3,
    name: 'In één keer zien (tot 5)',
    about: 'Kleine hoeveelheden herkennen zonder te tellen, zoals de ogen van een dobbelsteen of opgestoken vingers.',
    offScreen: 'Gooi een dobbelsteen en roep zo snel als je wilt hoeveel het er zijn. Of steek vingers op: "Hoeveel?"',
  },
  {
    id: 'zien-10', domain: d, requires: ['zien-5', 'hoeveel-10'], levels: 3, stage: 3,
    name: 'In één keer zien (tot 10)',
    about: 'Hoeveelheden tot tien herkennen via de vijfstructuur: "een volle hand en nog 2 is 7".',
    offScreen: 'Steek twee handen op: "5 en 2". Hoeveel vingers zijn dat samen?',
  },
  {
    id: 'vergelijken', domain: d, requires: ['hoeveel-5'], levels: 3, stage: 4,
    name: 'Meer, minder, evenveel',
    about: 'Twee groepjes vergelijken: waar zijn er meer, en hoe maak je ze evenveel?',
    offScreen: 'Dek de tafel: is er voor iedereen een bord? Zijn er meer vorken of meer lepels?',
  },
  {
    id: 'cijfers-10', domain: d, requires: ['hoeveel-10'], levels: 2, stage: 5,
    name: 'Cijfer en hoeveelheid tot 10',
    about: 'Een cijfer koppelen aan een hoeveelheid en aan het telwoord: 7, zeven, en zeven dingen.',
    offScreen: 'Zoek cijfers op huisnummers of in de supermarkt en pak dan zoveel blokjes of stappen.',
  },
  {
    id: 'buren-10', domain: d, requires: ['tellen-10', 'cijfers-10'], levels: 3, stage: 6,
    name: 'Getallenlijn: ervoor en erna',
    about: 'Weten welk getal vóór of na een ander getal komt.',
    offScreen: 'Speel ganzenbord of mens-erger-je-niet en zeg bij elke stap het getal van het vakje hardop.',
  },
  {
    id: 'plaats-10', domain: d, requires: ['buren-10'], levels: 3, stage: 6,
    name: 'Getallenlijn: waar hoort een getal',
    about: 'Een getal op een lijn van 1 tot 10 plaatsen: 9 ligt bijna aan het eind, 2 dichtbij het begin.',
    offScreen: 'Leg 10 kussens op een rij als "getallenpad" en spring naar nummer 6.',
  },
  {
    id: 'splitsen-5', domain: d, requires: ['zien-5'], levels: 3, stage: 7,
    name: 'Splitsen tot 5',
    about: 'Een hoeveelheid in twee delen zien: 5 is 2 en 3.',
    offScreen: 'Verstop een paar knikkers onder een bakje: "Er waren er 5, ik zie er 2. Hoeveel zitten eronder?"',
  },
  {
    id: 'splitsen-10', domain: d, requires: ['splitsen-5', 'zien-10'], levels: 3, stage: 7,
    name: 'Splitsen tot 10',
    about: 'Tien en kleinere getallen splitsen, met hulp van de vijfstructuur.',
    offScreen: 'Verdeel 8 aardbeien over twee bordjes, op verschillende manieren.',
  },
  {
    id: 'verhaal-5', domain: d, requires: ['splitsen-5'], levels: 3, stage: 8,
    name: 'Erbij en eraf (tot 5)',
    about: 'Kleine verhaaltjes naspelen: er komt er één bij, of er gaat er één weg.',
    offScreen: '"Er zitten 3 knuffels op de bank. Eén gaat slapen. Hoeveel zijn er nog?" Speel het echt na.',
  },
  {
    id: 'verhaal-10', domain: d, requires: ['verhaal-5', 'splitsen-10'], levels: 3, stage: 8,
    name: 'Erbij en eraf (tot 10)',
    about: 'Hetzelfde, met grotere aantallen en nog steeds met materiaal.',
    offScreen: 'Boodschappen uitpakken: "We hadden 6 eieren, we gebruiken er 2. Hoeveel blijven er over?"',
  },
  {
    id: 'patroon-ab', domain: d, requires: [], levels: 3, stage: 9,
    name: 'Patronen (rood-blauw-rood-blauw)',
    about: 'Een eenvoudig patroon zien en voortzetten. Dat hangt samen met later rekenen.',
    offScreen: 'Rijg kralen of leg bestek in een patroon: vork-lepel-vork-lepel. Wat komt er nu?',
  },
  {
    id: 'patroon-abc', domain: d, requires: ['patroon-ab'], levels: 3, stage: 9,
    name: 'Moeilijkere patronen',
    about: 'Patronen als A-B-B of A-B-C voortzetten en zelf verzinnen.',
    offScreen: 'Klap-stamp-stamp, klap-stamp-stamp… kan zij het voortzetten? En zelf een patroon verzinnen?',
  },
  {
    id: 'ruimte', domain: d, requires: [], levels: 3, stage: 10,
    name: 'Waar is het? (op, onder, naast)',
    about: 'Woorden voor de plek van iets: op, onder, naast, in, voor en achter. Ruimtelijk denken hangt samen met later rekenen.',
    offScreen: 'Verstoppertje met een knuffel: "Hij zit ónder de bank!" Laat haar ook zelf zeggen waar hij zit, en verstop hem om de beurt.',
  },
  {
    id: 'vormen', domain: d, requires: [], levels: 3, stage: 10,
    name: 'Vormen',
    about: 'Rondje, vierkant, driehoek en rechthoek herkennen, ook als ze schuin staan. Waar zie je het aan? Aan de kanten en de punten.',
    offScreen: 'Zoek vormen in huis en buiten: een rond bord, een rechthoekige deur, een driehoekig verkeersbord. Tel samen de punten.',
  },
];

/** Opdrachten in het echt per vaardigheid (zie core/ui/samen.ts). */
const TASKS: Record<string, LineId[]> = {
  'tellen-5': ['echt.tellen-5', 'echt.tellen-5.b', 'echt.tellen-5.c'],
  'tellen-10': ['echt.tellen-10', 'echt.tellen-10.b', 'echt.tellen-10.c', 'echt.tellen-10.d'],
  telbegrip: ['echt.telbegrip', 'echt.telbegrip.b', 'echt.telbegrip.c'],
  'hoeveel-5': ['echt.hoeveel-5', 'echt.hoeveel-5.b', 'echt.hoeveel-5.c'],
  'hoeveel-10': ['echt.hoeveel-10', 'echt.hoeveel-10.b', 'echt.hoeveel-10.c'],
  'zien-5': ['echt.zien-5', 'echt.zien-5.b', 'echt.zien-5.c'],
  'zien-10': ['echt.zien-10', 'echt.zien-10.b'],
  vergelijken: ['echt.vergelijken', 'echt.vergelijken.b', 'echt.vergelijken.c'],
  'cijfers-10': ['echt.cijfers-10', 'echt.cijfers-10.b', 'echt.cijfers-10.c'],
  'buren-10': ['echt.buren-10', 'echt.buren-10.b', 'echt.buren-10.c'],
  'plaats-10': ['echt.plaats-10', 'echt.plaats-10.b', 'echt.plaats-10.c'],
  'splitsen-5': ['echt.splitsen-5', 'echt.splitsen-5.b', 'echt.splitsen-5.c'],
  'splitsen-10': ['echt.splitsen-10', 'echt.splitsen-10.b', 'echt.splitsen-10.c'],
  'verhaal-5': ['echt.verhaal-5', 'echt.verhaal-5.b', 'echt.verhaal-5.c'],
  'verhaal-10': ['echt.verhaal-10', 'echt.verhaal-10.b', 'echt.verhaal-10.c'],
  'patroon-ab': ['echt.patroon-ab', 'echt.patroon-ab.b', 'echt.patroon-ab.c'],
  'patroon-abc': ['echt.patroon-abc', 'echt.patroon-abc.b', 'echt.patroon-abc.c'],
  ruimte: ['echt.ruimte', 'echt.ruimte.b', 'echt.ruimte.c', 'echt.ruimte.d'],
  vormen: ['echt.vormen', 'echt.vormen.b', 'echt.vormen.c'],
};
for (const s of REKEN_SKILLS) s.realTasks = TASKS[s.id];

export const REKEN_START_LEVELS: StartLevel[] = [
  { id: 'begin', label: 'Begint met tellen', assumed: [] },
  { id: 'tellen10', label: 'Telt tot 10 en kent de cijfers', assumed: ['tellen-5', 'tellen-10', 'hoeveel-5'] },
  { id: 'verder', label: 'Snapt "hoeveel" al tot 10', assumed: ['tellen-5', 'tellen-10', 'hoeveel-5', 'hoeveel-10'] },
];
