// Epoch 6: industrial city.
import { hash, pick, irand, type R } from './rng';
import {
  C, EMIT, ROUGH, SMOOTH, WARM, COOL, Vox, T, type Maker, type Crown,
  mixc, onL, onR, cyl, cone, ball, facade, house, tower, antenna, roofJunk, both, spire, vsign, screen,
} from './shapes';
import { GREEN, ground, roadTile, bridgeTile } from './models_base';
import { type Cat, stone, gardenTree } from './epochs_a';

const BRICK = [[0x9a4a3a, 0x8a4032, 0xa65444], [0x7a4a3a, 0x6c4032, 0x86543f], [0xa86a4a, 0x9a5e40, 0xb47654]];
const SOOT = [0x4a4644, 0x3e3a38, 0x56524e];
const NEON = [0xff4fc0, 0x35e0ff, 0xffd24a, 0xa0ff5a, 0xff5a4a, 0xb07aff];
const anyLight = (r: R) => (r() < 0.55 ? WARM : r() < 0.6 ? COOL : WARM | COOL);

function lampAt(v: Vox, x: number, y: number, h = 5, col = 0xffe9a8): void {
  v.box(x, y, 0, x + 1, y + 1, h, C(0x2e2e34)); v.set(x, y, h, C(col, EMIT));
}
function parkBase(v: Vox, S: number, col: number[] = [GREEN[2], GREEN[3]]): void {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) v.set(x, y, 0, C(col[Math.floor(hash(x, y, 8) * col.length)], ROUGH));
}
function stack(v: Vox, cx: number, cy: number, r0: number, h: number, col = BRICK[1]): void {
  for (let z = 0; z < h; z++) cyl(v, cx, cy, Math.max(1, r0 - z * 0.035), z, z + 1, z % 7 === 6 ? C(0x3e3a38) : mixc(col, 0, 3));
  v.emit(Math.floor(cx), Math.floor(cy), h + 1, 'smoke'); v.emit(Math.floor(cx), Math.floor(cy), h + 1, 'smoke');
}
function sawtooth(v: Vox, x0: number, y0: number, x1: number, y1: number, z: number): void {
  for (let x = x0; x < x1; x++) {
    const k = (x - x0) % 4;
    v.box(x, y0, z, x + 1, y1, z + 1 + k, k === 3 ? C(0x5f8496, SMOOTH | WARM) : C(0x5a5652));
  }
}

// ================================ EPOCH 6 ======================================
const e6: Cat = {
  small: [
    (r, lvl) => house(r, { n: 1, w: 6, d: 6, floors: 2 + (lvl > 0 ? 1 : 0), fh: 3, wall: mixc(pick(r, BRICK)), base: mixc(SOOT), roof: [0x4a4a52, 0x3e3e46], roofType: 'gable', along: r() < 0.5 ? 'x' : 'y', chimney: 0x6c4032, smoke: true, win: { lit: 0.6 } }),
    (r, lvl) => { // workshop
      const v = house(r, { n: 1, w: 7, d: 6, floors: 1, fh: 4 + lvl, wall: mixc(pick(r, BRICK)), roof: [0x4a4a52], roofType: 'flat', win: { lit: 0.8, wh: 2, gap: 1 }, door: 0x2e2e34 });
      sawtooth(v, 0, 1, 7, 7, 4 + lvl);
      return v;
    },
    (r, lvl) => house(r, { n: 1, w: 6, d: 6, floors: 3 + (lvl > 1 ? 1 : 0), fh: 3, wall: mixc(pick(r, BRICK)), roof: [0x4a4a52, 0x56565e], roofType: 'mansard', chimney: 0x6c4032, smoke: true, win: { lit: 0.6 } }),
  ],
  large: [
    (r, lvl) => { // factory
      const v = new Vox(16, 16, 60);
      house(r, { n: 2, w: 13, d: 9, floors: 2, fh: 4, wall: mixc(pick(r, BRICK)), base: mixc(SOOT), roof: [0x4a4a52], roofType: 'flat', win: { lit: 0.85, gap: 1, wh: 3, sill: 1 }, door: 0x2e2e34 }, { v, x0: 1, y0: 5 });
      sawtooth(v, 1, 5, 14, 14, 9);
      stack(v, 4, 3, 1.6, 22 + lvl * 4); if (lvl > 0) stack(v, 10, 3, 1.4, 18 + lvl * 3);
      return v;
    },
    (r, lvl) => { // warehouse with water tank
      const v = house(r, { n: 2, w: 14, d: 12, floors: 3 + lvl, fh: 4, wall: mixc(pick(r, BRICK)), base: mixc(SOOT), roof: [0x56524e, 0x4a4644], roofType: 'flat', win: { lit: 0.5, gap: 1, wh: 3, sill: 1 } });
      const H = (3 + lvl) * 4 + 1;
      for (const [x, y] of [[4, 4], [6, 4], [4, 6], [6, 6]]) v.box(x, y, H, x + 1, y + 1, H + 3, C(0x2e2e34));
      cyl(v, 5.5, 5.5, 2.2, H + 3, H + 7, mixc([0x7a5636, 0x6b4a2f])); cone(v, 5.5, 5.5, 2.4, H + 7, 2, [0x4a4a52]);
      return v;
    },
    (r, lvl) => house(r, { n: 2, w: 13, d: 12, floors: 4 + lvl, fh: 3, wall: mixc(pick(r, BRICK)), base: mixc(SOOT), roof: [0x4a4a52, 0x56565e], roofType: 'mansard', chimney: 0x6c4032, smoke: true, win: { lit: 0.6, gap: 1 } }), // tenement block
    (r, lvl) => { // gasometer
      const v = new Vox(16, 16, 40);
      const h = 10 + lvl * 3;
      cyl(v, 8, 8, 6.5, 0, h, (x, y, z) => C(z % 4 === 3 ? 0x2e3438 : [0x4a5a5e, 0x42525a][(x + y) & 1]));
      ball(v, 8, 8, h, 6.3, 2, C(0x56666a));
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.4, x = Math.round(7.5 + Math.cos(a) * 7), y = Math.round(7.5 + Math.sin(a) * 7); v.box(x, y, 0, x + 1, y + 1, h + 3, C(0x2e2e34)); }
      void r;
      return v;
    },
  ],
  fill: [
    (r) => { // coal yard
      const v = new Vox(T, T, 8);
      ball(v, 3, 3, 0, 2.6, 2.6, mixc([0x2a2a2e, 0x34343a, 0x1e1e22], ROUGH)); ball(v, 5.5, 5.5, 0, 2, 2, mixc([0x2a2a2e, 0x34343a], ROUGH));
      void r;
      return v;
    },
    (r) => { const v = new Vox(T, T, 14); parkBase(v, T); gardenTree(v, r, 2, 2); lampAt(v, 6, 6, 5); return v; },
    (r) => { // crates + barrels
      const v = new Vox(T, T, 8);
      for (let i = 0; i < 4; i++) { const x = irand(r, 0, 5), y = irand(r, 0, 5); v.box(x, y, 0, x + 2, y + 2, irand(r, 1, 3), mixc([0x9a7a4a, 0x8a6a3e, 0xa88654], 0, i)); }
      return v;
    },
    (r) => { const v = new Vox(T, T, 14); gardenTree(v, r, 3, 3, GREEN.slice(0, 4)); return v; },
  ],
  sec: [
    (r) => { // water tower
      const v = new Vox(16, 16, 50);
      for (const [x, y] of [[4, 4], [11, 4], [4, 11], [11, 11]]) v.box(x, y, 0, x + 1, y + 1, 16, C(0x2e2e34));
      for (let z = 4; z < 16; z += 4) { v.box(4, 11, z, 12, 12, z + 1, C(0x3a3a40)); v.box(11, 4, z, 12, 12, z + 1, C(0x3a3a40)); }
      cyl(v, 8, 8, 5.5, 16, 24, (x, y, z) => C(z % 3 === 0 ? 0x5a3a2a : [0x8a4a34, 0x7c4230][(x + y) & 1]));
      cone(v, 8, 8, 6, 24, 4, [0x4a4a52, 0x3e3e46]);
      void r;
      return v;
    },
    (r) => { // pump house with tall chimney
      const v = new Vox(16, 16, 70);
      house(r, { n: 2, w: 9, d: 9, floors: 2, fh: 5, wall: mixc(BRICK[0]), base: mixc(SOOT), roof: [0x4a4a52, 0x3e3e46], roofType: 'hip', win: { lit: 0.9, wh: 3, gap: 2 } }, { v, x0: 5, y0: 5 });
      stack(v, 3.5, 3.5, 2.2, 40, BRICK[2]);
      return v;
    },
  ],
  hero: (r) => { // grand railway station
    const v = new Vox(24, 24, 70);
    const br = mixc(BRICK[0], 0, 4);
    house(r, { n: 3, w: 20, d: 12, floors: 2, fh: 5, wall: br, base: stone(2), roof: [0x4a4a52], roofType: 'flat', win: { lit: 0.9, gap: 1, wh: 4, sill: 1, m: 2 }, door: 0x2e2e34 }, { v, x0: 1, y0: 8 });
    // glass barrel vault
    for (let x = 2; x < 20; x++) for (let k = 0; k < 5; k++) for (const y of [9 + k, 18 - k]) v.box(x, y, 11 + k, x + 1, y + 1, 12 + k, x % 3 === 0 ? C(0x3a3a40) : C(0x8ab8c8, SMOOTH | WARM));
    v.box(2, 13, 15, 20, 15, 16, C(0x3a3a40));
    // clock tower
    v.box(16, 2, 0, 22, 8, 30, br);
    facade(v, r, 16, 2, 22, 8, 3, 4, 5, { lit: 0.7, gap: 2, wh: 3, m: 2 });
    onL(v, 7, 17, 21, 24, 28, C(0xf4f0e0, WARM)); onR(v, 21, 3, 7, 24, 28, C(0xf4f0e0, WARM));
    onL(v, 7, 19, 20, 25, 27, C(0x2a2a2e)); onR(v, 21, 5, 6, 25, 27, C(0x2a2a2e));
    v.box(15, 1, 30, 23, 9, 31, stone(1));
    for (let k = 0; k < 7; k++) v.box(16 + (k >> 1), 2 + (k >> 1), 31 + k, 22 - (k >> 1), 8 - (k >> 1), 32 + k, C([0x4a4a52, 0x3e3e46][k & 1]));
    v.box(19, 5, 38, 20, 6, 43, C(0xc8ccd4));
    // rails out front
    for (let x = 0; x < 24; x++) { v.set(x, 22, 0, C(x % 2 ? 0x5a4a3a : 0x3a3a40)); v.set(x, 21, 0, C(0x8a8a90)); v.set(x, 23, 0, C(0x8a8a90)); }
    return v;
  },
  road: (r, d) => roadTile(r, d, [0x6a6460, 0x5e5854, 0x746e68], { flags: ROUGH, curb: [0x8a847c, 0x7e7870] }),
  pave: (r) => ground(r, [0x8a847c, 0x7e7870, 0x948e86], ROUGH, { c: [0x5e5854], p: 0.1 }),
  bridge: (r, d) => bridgeTile(r, d, [0x5e5854, 0x6a6460], 0x2e2e34, ROUGH, 0xffe9a8),
};

export { e6 };
