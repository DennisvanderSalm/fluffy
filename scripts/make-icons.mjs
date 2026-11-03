// Maakt de app-iconen (PNG) zonder externe hulpmiddelen: een eenvoudige Fluffy op crème.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const PUFFS = [[100,112,60],[60,96,34],[100,72,38],[140,96,34],[52,132,30],[148,132,30],[78,152,30],[122,152,30]];
const hex = (h) => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const BG = hex('#fbf6ee'), EDGE = hex('#a3cdea'), FILL = hex('#d6ecfa'), INK = hex('#3b4a6b'), CHEEK = hex('#f5c3cf'), WHITE = [255,255,255];

function colorAt(x, y) {
  // Coördinaten in het 200×200-ontwerp, iets ingezoomd zodat Fluffy het icoon vult.
  const inC = (cx, cy, r) => (x-cx)**2 + (y-cy)**2 <= r*r;
  const inE = (cx, cy, rx, ry) => ((x-cx)/rx)**2 + ((y-cy)/ry)**2 <= 1;
  if (inC(85,104,3) || inC(121,104,3)) return WHITE;
  if (inE(82,108,8,10) || inE(118,108,8,10)) return INK;
  // glimlach
  const sx = x - 100, sy = y - 130;
  if (Math.abs(sx) <= 10 && Math.abs(sy - (9 * (1 - (sx/10)**2)) / 2) <= 2.2) return INK;
  if (inE(70,128,10,6) || inE(130,128,10,6)) return CHEEK;
  if (PUFFS.some(([cx,cy,r]) => inC(cx,cy,r))) return FILL;
  if (PUFFS.some(([cx,cy,r]) => inC(cx,cy,r+3))) return EDGE;
  return BG;
}

function png(size) {
  const ss = 3, raw = Buffer.alloc(size * (size * 3 + 1));
  const scale = 170 / size, off = 15;
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let acc = [0,0,0];
      for (let i = 0; i < ss; i++) for (let j = 0; j < ss; j++) {
        const c = colorAt(off + (px + (i + .5)/ss) * scale, off + 8 + (py + (j + .5)/ss) * scale);
        acc = acc.map((v, k) => v + c[k]);
      }
      const o = py * (size * 3 + 1) + 1 + px * 3;
      for (let k = 0; k < 3; k++) raw[o + k] = Math.round(acc[k] / (ss * ss));
    }
  }
  const crcTable = Array.from({length:256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('public/icons', { recursive: true });
for (const [name, size] of [['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180]]) {
  writeFileSync(`public/icons/${name}`, png(size));
}
const circles = (g, f) => PUFFS.map(([x,y,r]) => `<circle cx="${x}" cy="${y}" r="${r+g}" fill="${f}"/>`).join('');
writeFileSync('public/icons/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="15 23 170 170"><rect x="0" y="0" width="200" height="200" fill="#fbf6ee"/>${circles(3,'#a3cdea')}${circles(0,'#d6ecfa')}<ellipse cx="70" cy="128" rx="10" ry="6" fill="#f5c3cf"/><ellipse cx="130" cy="128" rx="10" ry="6" fill="#f5c3cf"/><ellipse cx="82" cy="108" rx="8" ry="10" fill="#3b4a6b"/><ellipse cx="118" cy="108" rx="8" ry="10" fill="#3b4a6b"/><circle cx="85" cy="104" r="3" fill="#fff"/><circle cx="121" cy="104" r="3" fill="#fff"/><path d="M90 130 Q100 139 110 130" stroke="#3b4a6b" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`);
console.log('iconen gemaakt');
