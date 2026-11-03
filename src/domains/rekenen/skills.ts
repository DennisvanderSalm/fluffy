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
    offScreen: 'Tel de appels in de fruitschaal en wijs ze aan. Laat haar ook eens jou verbeteren als je "per ongeluk" een appel overslaat.',
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
];

export const REKEN_START_LEVELS: StartLevel[] = [
  { id: 'begin', label: 'Begint met tellen', assumed: [] },
  { id: 'tellen10', label: 'Telt tot 10 en kent de cijfers', assumed: ['tellen-5', 'tellen-10', 'hoeveel-5'] },
  { id: 'verder', label: 'Snapt "hoeveel" al tot 10', assumed: ['tellen-5', 'tellen-10', 'hoeveel-5', 'hoeveel-10'] },
];
