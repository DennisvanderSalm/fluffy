import type { Rng } from '../../core/util';

/**
 * Plaatjes voor Kiekeboe: hoeveelheden die je in één keer kunt zien (subitizing).
 * Alles in één SVG van 400 × 250. Elk telbaar ding heeft een punt, zodat Fluffy ze kan aanwijzen.
 *
 * - dobbel: het vaste dobbelsteenbeeld (1–6)
 * - los: stippen zonder vast patroon (moeilijker)
 * - vingers: één hand, of een volle hand en nog wat (5-structuur)
 * - tienveld: twee rijen van vijf, de bovenste rij eerst vol (5-structuur)
 * - dobbels: een dobbelsteen met vijf en een tweede ernaast (5 en nog wat)
 */

export type Pattern = 'dobbel' | 'los' | 'vingers' | 'tienveld' | 'dobbels';

export const VIEW = { w: 400, h: 250 };

export interface Point { x: number; y: number }

const DOT = '#7aa7d6';
const DOT_EDGE = '#5a88b8';

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
};

function diePoints(n: number, cx: number, cy: number, size: number): Point[] {
  const step = size * 0.29;
  return PIPS[n].map(([dx, dy]) => ({ x: cx + dx * step, y: cy + dy * step }));
}

/** Stippen zonder patroon: willekeurig, maar nooit te dicht op elkaar. */
export function loosePoints(n: number, rng: Rng): Point[] {
  for (let tries = 0; tries < 200; tries++) {
    const pts: Point[] = [];
    for (let i = 0; i < n && pts.length === i; i++) {
      for (let k = 0; k < 50; k++) {
        const p = { x: 70 + rng() * 260, y: 55 + rng() * 140 };
        if (pts.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > 78)) {
          pts.push(p);
          break;
        }
      }
    }
    if (pts.length === n) return pts;
  }
  return diePoints(Math.min(n, 6), 200, 125, 170);
}

function tenFramePoints(n: number): Point[] {
  const cell = 64;
  const x0 = 200 - 2.5 * cell;
  const y0 = 125 - cell;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + cell * ((i % 5) + 0.5), y: y0 + cell * (Math.floor(i / 5) + 0.5) }));
}

// Vingers: duim, wijsvinger, middelvinger, ringvinger, pink (zo tellen kleuters op hun hand).
const FINGERS = [
  { dx: -64, top: 104, w: 26, angle: -38 },
  { dx: -36, top: 42, w: 25, angle: -6 },
  { dx: -9, top: 30, w: 25, angle: 0 },
  { dx: 18, top: 42, w: 25, angle: 5 },
  { dx: 43, top: 64, w: 22, angle: 12 },
];
const FINGER_BASE = 150;

function fingerTip(cx: number, i: number): Point {
  const f = FINGERS[i];
  const len = FINGER_BASE - f.top;
  const rad = (f.angle * Math.PI) / 180;
  const bx = cx + f.dx + f.w / 2;
  return { x: bx + Math.sin(rad) * (len - 14), y: FINGER_BASE - Math.cos(rad) * (len - 14) };
}

function handCenters(n: number): { cx: number; up: number }[] {
  return n <= 5 ? [{ cx: 200, up: n }] : [{ cx: 108, up: 5 }, { cx: 292, up: n - 5 }];
}

/** De punten om aan te wijzen, in telvolgorde. */
export function patternPoints(pattern: Pattern, n: number, loose: Point[] = []): Point[] {
  switch (pattern) {
    case 'dobbel':
      return diePoints(n, 200, 125, 170);
    case 'dobbels':
      return [...diePoints(5, 108, 125, 160), ...diePoints(n - 5, 292, 125, 160)];
    case 'tienveld':
      return tenFramePoints(n);
    case 'vingers':
      return handCenters(n).flatMap((h) => Array.from({ length: h.up }, (_, i) => fingerTip(h.cx, i)));
    case 'los':
      return loose;
  }
}

function dots(points: Point[], r: number): string {
  return points.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="${DOT}" stroke="${DOT_EDGE}" stroke-width="3"/>`).join('');
}

function die(cx: number, cy: number, size: number, n: number): string {
  const h = size / 2;
  return `<rect x="${cx - h}" y="${cy - h}" width="${size}" height="${size}" rx="${size * 0.18}" fill="#fff" stroke="#c9b99c" stroke-width="5"/>`
    + dots(diePoints(n, cx, cy, size), size * 0.09);
}

function hand(cx: number, up: number): string {
  const fingers = FINGERS.map((f, i) => {
    const raised = i < up;
    const top = raised ? f.top : FINGER_BASE - 26;
    const x = cx + f.dx;
    const h = 175 - top;
    const angle = raised ? f.angle : f.angle * 0.5;
    return `<rect x="${x}" y="${top}" width="${f.w}" height="${h}" rx="${f.w / 2}" transform="rotate(${angle} ${x + f.w / 2} ${FINGER_BASE})"
      fill="#f6d5bd" stroke="#d9a98a" stroke-width="4"/>`;
  }).join('');
  const palm = `<rect x="${cx - 62}" y="${FINGER_BASE - 18}" width="${118}" height="${100}" rx="44" fill="#f6d5bd" stroke="#d9a98a" stroke-width="4"/>`;
  return fingers + palm;
}

/** Het plaatje als SVG-tekst. */
export function patternSvg(pattern: Pattern, n: number, loose: Point[] = []): string {
  let body = '';
  switch (pattern) {
    case 'dobbel':
      body = die(200, 125, 170, n);
      break;
    case 'dobbels':
      body = die(108, 125, 160, 5) + die(292, 125, 160, n - 5);
      break;
    case 'tienveld': {
      const cell = 64;
      const x0 = 200 - 2.5 * cell;
      const y0 = 125 - cell;
      const cells = Array.from({ length: 10 }, (_, i) =>
        `<rect x="${x0 + cell * (i % 5) + 4}" y="${y0 + cell * Math.floor(i / 5) + 4}" width="${cell - 8}" height="${cell - 8}" rx="12" fill="#fbf4e6" stroke="#d6ba8c" stroke-width="3"/>`).join('');
      body = cells + dots(tenFramePoints(n), 22);
      break;
    }
    case 'vingers':
      body = handCenters(n).map((h) => hand(h.cx, h.up)).join('');
      break;
    case 'los':
      body = dots(loose, 26);
      break;
  }
  return `<svg viewBox="0 0 ${VIEW.w} ${VIEW.h}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}
