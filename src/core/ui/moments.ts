/**
 * Momenten van de dag waar een opdracht bij hoort ("Als je de trap op gaat …"), met een plaatje.
 * Het plaatje helpt haar de opdracht te onthouden: ze kan nog niet lezen.
 */

export type Moment = 'tafel' | 'bad' | 'trap' | 'onderweg' | 'bed' | 'buiten' | 'keuken' | 'spelen' | 'kleren';

export const MOMENTS: readonly Moment[] = ['tafel', 'bad', 'trap', 'onderweg', 'bed', 'buiten', 'keuken', 'spelen', 'kleren'];

/** Voor de ouder (dagkaart). */
export const MOMENT_LABEL: Record<Moment, string> = {
  tafel: 'Aan tafel',
  bad: 'In bad',
  trap: 'Op de trap',
  onderweg: 'Onderweg',
  bed: 'Bij het naar bed gaan',
  buiten: 'Buiten',
  keuken: 'In de keuken',
  spelen: 'Bij het spelen',
  kleren: 'Bij het aankleden',
};

const S = 'stroke="#3b4a6b" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"';
const svg = (body: string) => `<svg viewBox="0 0 200 160"><g ${S}>${body}</g></svg>`;

export const MOMENT_SVG: Record<Moment, string> = {
  // Bord met vork en mes.
  tafel: svg(`
    <circle cx="100" cy="86" r="50" fill="#fff"/><circle cx="100" cy="86" r="32" fill="#eef4fb"/>
    <path d="M30 70 V134 M22 34 V56 Q22 70 30 70 Q38 70 38 56 V34 M30 34 V56" fill="none"/>
    <path d="M170 134 V34 Q184 46 182 84 H170" fill="#fff"/>`),
  // Bad met schuim en een badeendje.
  bad: svg(`
    <path d="M32 82 V42 Q32 30 46 30 H58" fill="none"/>
    <circle cx="62" cy="74" r="14" fill="#dceefb"/><circle cx="86" cy="68" r="16" fill="#dceefb"/><circle cx="110" cy="74" r="12" fill="#dceefb"/>
    <ellipse cx="142" cy="72" rx="20" ry="11" fill="#f6d55c"/><circle cx="154" cy="54" r="10" fill="#f6d55c"/>
    <path d="M163 53 L172 56 L163 59 Z" fill="#f0954a"/>
    <path d="M18 82 H182 V96 Q182 136 132 136 H68 Q18 136 18 96 Z" fill="#fff"/>
    <path d="M48 136 L42 150 M152 136 L158 150" fill="none"/>`),
  // Trap.
  trap: svg(`<path d="M20 144 V118 H56 V92 H92 V66 H128 V40 H164 V16 H184 V144 Z" fill="#f6e3c6"/>
    <path d="M38 118 V70 M74 92 V44 M110 66 V22 M38 70 L146 8" fill="none" stroke="#9fb3cf"/>`),
  // Twee voetstapjes.
  onderweg: svg(`
    <ellipse cx="66" cy="108" rx="18" ry="28" fill="#f8dcc6" transform="rotate(-12 66 108)"/>
    <circle cx="52" cy="70" r="5" fill="#f8dcc6"/><circle cx="62" cy="66" r="5" fill="#f8dcc6"/><circle cx="73" cy="66" r="5" fill="#f8dcc6"/><circle cx="83" cy="70" r="4" fill="#f8dcc6"/>
    <ellipse cx="134" cy="72" rx="18" ry="28" fill="#f8dcc6" transform="rotate(12 134 72)"/>
    <circle cx="118" cy="34" r="4" fill="#f8dcc6"/><circle cx="128" cy="30" r="5" fill="#f8dcc6"/><circle cx="139" cy="30" r="5" fill="#f8dcc6"/><circle cx="149" cy="34" r="5" fill="#f8dcc6"/>`),
  // Bed met kussen, deken en de maan.
  bed: svg(`
    <path d="M20 146 V60 H40 V146" fill="#f6e3c6"/>
    <rect x="40" y="94" width="144" height="32" rx="6" fill="#fff"/>
    <rect x="46" y="76" width="42" height="20" rx="9" fill="#eef4fb"/>
    <path d="M86 94 H184 V126 H86 Z" fill="#b7d3f2"/>
    <path d="M48 126 V146 M176 126 V146" fill="none"/>
    <path d="M160 14 A20 20 0 1 0 184 44 A15 15 0 1 1 160 14 Z" fill="#f6d55c"/>`),
  // Boom en zon.
  buiten: svg(`
    <path d="M18 146 H182" fill="none"/>
    <rect x="62" y="92" width="18" height="54" fill="#c9a27a"/>
    <circle cx="71" cy="68" r="40" fill="#9fd49a"/>
    <circle cx="152" cy="42" r="18" fill="#f6d55c"/>
    <path d="M152 12 V6 M152 78 V72 M122 42 H116 M188 42 H182 M131 21 L127 17 M177 67 L173 63 M173 21 L177 17 M131 63 L127 67" fill="none"/>`),
  // Pan met deksel en stoom.
  keuken: svg(`
    <path d="M68 40 Q60 30 68 20 M94 34 Q86 24 94 14 M120 40 Q112 30 120 20" fill="none" stroke="#9fb3cf"/>
    <path d="M34 82 Q92 52 150 82 Z" fill="#eef4fb"/><circle cx="92" cy="60" r="6" fill="#fff"/>
    <path d="M40 82 H144 V108 Q144 138 112 138 H72 Q40 138 40 108 Z" fill="#fff"/>
    <path d="M144 94 H186" fill="none" stroke-width="10"/>`),
  // Blokken en een bal.
  spelen: svg(`
    <rect x="26" y="90" width="52" height="52" rx="4" fill="#f5b7c8"/>
    <rect x="84" y="90" width="52" height="52" rx="4" fill="#b7d3f2"/>
    <rect x="55" y="36" width="52" height="52" rx="4" fill="#f6d55c"/>
    <circle cx="166" cy="120" r="22" fill="#9fd49a"/><path d="M146 112 Q166 124 186 112" fill="none"/>`),
  // T-shirt met strepen.
  kleren: svg(`
    <path d="M72 18 L42 30 L14 62 L38 80 L52 66 V144 H148 V66 L162 80 L186 62 L158 30 L128 18 Q100 40 72 18 Z" fill="#b7d3f2"/>
    <path d="M54 88 H146 M54 112 H146" fill="none" stroke="#fff" stroke-width="8"/>`),
};
