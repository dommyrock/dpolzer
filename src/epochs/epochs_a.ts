// Epochs 1-5: forest camp -> farm hamlet -> village -> medieval town -> walled city.
import { hash, pick, irand, type R } from './rng';
import {
  C, EMIT, ROUGH, SMOOTH, WARM, Vox, T, type Maker, type Col,
  mixc, courses, onL, onR, gable, hip, cyl, cone, ball, crenel, facade, house, blobTree,
} from './shapes';
import { GREEN, DIRT, SAND, ground, roadTile, bridgeTile } from './models_base';

export interface Cat {
  small: Maker[]; large: Maker[]; fill: Maker[]; sec: Maker[]; hero: Maker;
  huge?: Maker[]; // optional 3x3-tile megastructures
  mega?: Maker[]; // optional 3x3-tile supertalls that crown the last zones of the epoch
  road: (r: R, dir: number) => Vox; pave: (r: R) => Vox; bridge: (r: R, dir: number) => Vox;
}

/** Additions that turn one epoch's library into the next one (see catalog.ts). Anything omitted is inherited. */
export interface Extras {
  small?: Maker[]; large?: Maker[]; huge?: Maker[]; fill?: Maker[]; sec?: Maker[]; mega?: Maker[]; hero?: Maker;
  road?: Cat['road']; pave?: Cat['pave']; bridge?: Cat['bridge'];
}

const WOOD = [0x6b4a2f, 0x7a5636, 0x5a3d28];
const LOG = courses([0x6b4a2f, 0x5a3d28]);
const THATCH = [0xc9a85a, 0xb8944a, 0xd8ba6e];
const STONE = [0x8f8b82, 0x7d796f, 0x9d998f];
const stone = (s = 0) => mixc(STONE, 0, s);
const PLASTER = [0xe8dcc0, 0xdfd2b4, 0xefe5cc];
const TILE_RED = [0xb5523a, 0x9c4430, 0xc4603f];
const SLATE = [0x4d5a70, 0x435066, 0x58667c];

// ---- shared props -------------------------------------------------------------
function tentAt(v: Vox, r: R, x0: number, y0: number, L = 5): void {
  const hide = mixc(pick(r, [[0xc9a66b, 0xb8935a, 0xd6b67c], [0xb89a78, 0xa8875f, 0xc8ac8a], [0xd2b48a, 0xc09c6c, 0xa88a5c]]), ROUGH, irand(r, 0, 99));
  for (let k = 0; k < 3; k++) v.box(x0, y0 + k, k * 2, x0 + L, y0 + 6 - k, k * 2 + 2, hide);
  v.box(x0 + L - 1, y0 + 2, 0, x0 + L, y0 + 4, 3, C(0x33241a));
  v.box(x0 - 1, y0 + 3, 6, x0 + L + 1, y0 + 4, 7, C(0x5a3d28));
}

function fireAt(v: Vox, x: number, y: number, big = false): void {
  const s = C(0x7d796f);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) v.set(x + dx * (big ? 2 : 1), y + dy * (big ? 2 : 1), 0, s);
  v.set(x, y, 0, C(0x4a3020));
  v.set(x, y, 1, C(0xff8a2a, EMIT)); v.set(x, y, 2, C(0xffc94a, EMIT));
  if (big) { v.box(x - 1, y - 1, 0, x + 1, y + 1, 2, C(0xff7a22, EMIT)); v.set(x, y - 1, 2, C(0xffb03a, EMIT)); v.set(x - 1, y, 3, C(0xffe07a, EMIT)); v.set(x, y, 3, C(0xffd24a, EMIT)); v.set(x, y, 4, C(0xfff0a8, EMIT)); }
  v.emit(x, y, big ? 6 : 4, 'smoke');
}

function fenceRing(v: Vox, x0: number, y0: number, x1: number, y1: number, c = 0x8a6a44): void {
  for (let x = x0; x < x1; x++) for (const y of [y0, y1 - 1]) { v.set(x, y, 0, C(c)); if ((x - x0) % 3 === 0) v.set(x, y, 1, C(c)); }
  for (let y = y0; y < y1; y++) for (const x of [x0, x1 - 1]) { v.set(x, y, 0, C(c)); if ((y - y0) % 3 === 0) v.set(x, y, 1, C(c)); }
}

function wellAt(v: Vox, cx: number, cy: number): void {
  cyl(v, cx, cy, 1.6, 0, 2, stone(3));
  v.set(cx - 0.5, cy - 0.5, 1, C(0x3a9aa6, SMOOTH));
  v.box(cx - 2, cy - 0.5, 2, cx - 1, cy + 0.5, 5, C(WOOD[2])); v.box(cx + 1, cy - 0.5, 2, cx + 2, cy + 0.5, 5, C(WOOD[2]));
  v.box(cx - 2, cy - 1, 5, cx + 2, cy + 1, 6, C(TILE_RED[1]));
}

function field(r: R, kind: number): Vox {
  const v = new Vox(T, T, 4);
  const along = r() < 0.5;
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const row = along ? y : x;
      if (kind === 0) { // wheat
        v.set(x, y, 0, C(row & 1 ? 0xc9a23a : 0xddb84a, ROUGH));
        if (row & 1) v.set(x, y, 1, C(hash(x, y, 3) < 0.5 ? 0xe8c85a : 0xd4ae42, ROUGH));
      } else if (kind === 1) { // vegetables
        v.set(x, y, 0, C(row % 3 === 0 ? 0x5a4630 : 0x6a5238, ROUGH));
        if (row % 3 !== 0 && hash(x, y, 9) < 0.7) v.set(x, y, 1, C(hash(x, y, 4) < 0.2 ? pick(r, [0xd8523a, 0xe89a3a, 0xf0e0c0]) : GREEN[2 + ((x + y) & 1)], ROUGH));
      } else { // fallow / pasture
        v.set(x, y, 0, C(row & 1 ? 0x7a6a3c : 0x8a7a44, ROUGH));
      }
    }
  return v;
}

function stallAt(v: Vox, r: R, x0: number, y0: number, w = 5): void {
  const a = pick(r, [0xc8423a, 0x3a6ab0, 0xe0b030, 0x4a9a6a]);
  v.box(x0, y0, 0, x0 + w, y0 + 3, 2, mixc(WOOD));
  for (let x = x0; x < x0 + w; x++) v.set(x, y0 + 1, 2, C(pick(r, [0xd8523a, 0xe8b03a, 0x7ab04a, 0xf0e0c0])));
  for (const x of [x0, x0 + w - 1]) for (const y of [y0, y0 + 2]) v.box(x, y, 2, x + 1, y + 1, 5, C(WOOD[2]));
  for (let x = x0 - 1; x <= x0 + w; x++) for (let y = y0 - 1; y <= y0 + 3; y++) v.set(x, y, 5 + (y === y0 + 1 ? 1 : 0), C((x - x0) & 1 ? a : 0xf0e8d8));
}

function gardenTree(v: Vox, r: R, x: number, y: number, pal = GREEN, fruit?: number): void {
  v.box(x, y, 0, x + 1, y + 1, 3, C(0x5a3d28));
  ball(v, x + 0.5, y + 0.5, 4.5, 2.3, 2, (X, Y, Z) => C(fruit != null && hash(X, Y, Z, 4) < 0.14 ? fruit : pal[1 + Math.floor(hash(X, Y, Z, 1) * 3)], ROUGH));
  void r;
}

// ================================ EPOCH 1 ======================================
const e1: Cat = {
  small: [
    (r) => { const v = new Vox(T, T, 10); tentAt(v, r, 1, 1, 5); return v; },
    (r) => { // lean-to with a small fire
      const v = new Vox(T, T, 10);
      for (let y = 1; y <= 4; y++) v.box(1, y, 1 + y, 7, y + 1, 2 + y, mixc(THATCH, ROUGH, irand(r, 0, 9)));
      v.box(1, 1, 0, 7, 2, 2, LOG);
      for (const x of [1, 6]) v.box(x, 4, 0, x + 1, 5, 5, C(WOOD[2]));
      v.box(2, 2, 0, 6, 4, 1, C(0x8a7a5a));
      fireAt(v, 4, 6);
      return v;
    },
    (r) => { // log pile + drying rack
      const v = new Vox(T, T, 8);
      v.box(1, 1, 0, 6, 4, 2, LOG); v.box(2, 2, 2, 5, 3, 3, LOG);
      onR(v, 5, 1, 4, 0, 2, C(0xc9a878));
      for (const x of [1, 6]) v.box(x, 6, 0, x + 1, 7, 5, C(WOOD[2]));
      v.box(1, 6, 4, 7, 7, 5, C(WOOD[0]));
      for (const x of [2, 4, 5]) v.box(x, 6, 2, x + 1, 7, 4, C(pick(r, [0xb86a4a, 0xc9a66b, 0x9a5a3a])));
      return v;
    },
  ],
  large: [
    (r, lvl) => house(r, { n: 2, w: 10 + lvl * 2, d: 8, floors: 1, fh: 3, wall: LOG, roof: THATCH, roofType: 'gable', roofFlags: ROUGH, ov: 1, win: { lit: 0.6, gap: 3 }, door: 0x33241a, gfill: LOG }),
    (r, lvl) => { // hide yurt
      const v = new Vox(16, 16, 16);
      const hide = mixc([0xc9a66b, 0xb8935a, 0xd6b67c], ROUGH, irand(r, 0, 9));
      cyl(v, 8, 8, 5 + lvl * 0.5, 0, 3, hide);
      for (let k = 0; k < 5; k++) cyl(v, 8, 8, (5.6 + lvl * 0.5) * (1 - k / 5.5), 3 + k, 4 + k, k === 0 ? C(0x8a5a3a) : hide);
      onL(v, 12 + (lvl > 1 ? 1 : 0), 7, 9, 0, 3, C(0x33241a));
      v.emit(8, 8, 9, 'smoke');
      return v;
    },
  ],
  fill: [
    (r) => { const v = blobTree(r, GREEN, { trunkH: 0, rad: 2.4, squash: 0.7, blobs: 2, blossom: [0xd8423a, 0xb02a4a], bp: 0.16, size: 10 }); return v; },
    (r) => { // wildflowers
      const v = new Vox(T, T, 4);
      for (let i = 0; i < 9; i++) { const x = irand(r, 0, 7), y = irand(r, 0, 7); v.set(x, y, 0, C(GREEN[3], ROUGH)); v.set(x, y, 1, C(pick(r, [0xf4e36b, 0xffffff, 0xe889a8, 0xb08ae0]))); }
      return v;
    },
    (r) => { // stump + mushrooms
      const v = new Vox(T, T, 5);
      cyl(v, 4, 4, 1.6, 0, 2, mixc(WOOD)); v.set(3, 3, 1, C(0xc9a878)); v.set(4, 4, 1, C(0xd8b888));
      for (let i = 0; i < 3; i++) { const x = irand(r, 0, 7), y = irand(r, 5, 7); v.set(x, y, 0, C(0xf0e8d8)); v.set(x, y, 1, C(0xc8423a)); }
      return v;
    },
  ],
  sec: [
    (r) => { // lookout platform
      const v = new Vox(16, 16, 24);
      for (const [x, y] of [[4, 4], [11, 4], [4, 11], [11, 11]]) v.box(x, y, 0, x + 1, y + 1, 10, C(WOOD[2]));
      v.box(3, 3, 9, 13, 13, 10, mixc(WOOD));
      fenceRing(v, 3, 3, 13, 13, WOOD[0]); // ground fence
      for (let x = 3; x < 13; x++) for (const y of [3, 12]) v.set(x, y, 11, C(WOOD[0]));
      for (let y = 3; y < 13; y++) for (const x of [3, 12]) v.set(x, y, 11, C(WOOD[0]));
      for (const [x, y] of [[4, 4], [11, 4], [4, 11], [11, 11]]) v.box(x, y, 10, x + 1, y + 1, 14, C(WOOD[2]));
      hip(v, 4, 4, 12, 12, 14, THATCH, 1, 99, ROUGH);
      for (let z = 0; z < 9; z++) if (z & 1) v.box(7, 12, z, 9, 13, z + 1, C(WOOD[1]));
      void r;
      return v;
    },
    (r) => { // standing stones
      const v = new Vox(16, 16, 12);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2, x = Math.round(8 + Math.cos(a) * 5.2), y = Math.round(8 + Math.sin(a) * 5.2);
        v.box(x - 1, y - 1, 0, x + 1, y + 1, irand(r, 4, 7), mixc([0x8f8b82, 0x7d796f, 0xa4a097, 0x6f7a66], ROUGH, i));
      }
      v.box(7, 7, 0, 9, 9, 1, mixc(STONE, ROUGH));
      return v;
    },
  ],
  hero: (r) => {
    const v = new Vox(24, 24, 22);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; v.set(Math.round(11.5 + Math.cos(a) * 3.6), Math.round(11.5 + Math.sin(a) * 3.6), 0, C(pick(r, STONE), ROUGH)); }
    fireAt(v, 12, 12, true);
    v.emit(12, 12, 5, 'spark');
    v.box(5, 10, 0, 6, 14, 1, LOG); v.box(10, 17, 0, 14, 18, 1, LOG); v.box(17, 10, 0, 18, 14, 1, LOG); v.box(10, 5, 0, 14, 6, 1, LOG);
    // totem
    const bands = [0x6b4a2f, 0xc8423a, 0x6b4a2f, 0xe0b030, 0x6b4a2f, 0x3a8a8a, 0x6b4a2f, 0xf0e8d8];
    for (let z = 0; z < 12; z++) v.box(18, 3, z, 20, 5, z + 1, C(bands[(z >> 1) % bands.length]));
    v.box(16, 3, 8, 22, 4, 9, C(0xc8423a)); v.box(18, 3, 12, 20, 5, 13, C(0xe0b030));
    tentAt(v, r, 1, 1, 6); tentAt(v, r, 2, 17, 5);
    // banner
    v.box(21, 19, 0, 22, 20, 10, C(WOOD[2])); v.box(21, 20, 7, 22, 23, 10, C(0xc8423a));
    return v;
  },
  road: (r) => ground(r, [DIRT[0], DIRT[1], GREEN[2], DIRT[2]], ROUGH),
  pave: (r) => ground(r, [GREEN[2], GREEN[3], GREEN[2], DIRT[2]], ROUGH, { c: [DIRT[0]], p: 0.12 }, C(0x3d5a30)),
  bridge: (r, d) => bridgeTile(r, d, WOOD, WOOD[2]),
};

// ================================ EPOCH 2 ======================================
const cottage = (wall: Col, roof: number[], o: Partial<Parameters<typeof house>[1]> = {}): Maker => (r, lvl) =>
  house(r, { n: 1, w: 6, d: 5 + (lvl > 0 ? 1 : 0), floors: 1 + (lvl > 1 ? 1 : 0), fh: 3, wall, roof, roofType: 'gable', roofFlags: ROUGH, win: { lit: 0.6 }, ...o });

const e2: Cat = {
  small: [
    cottage(courses([0x7a5636, 0x6b4a2f]), THATCH, { chimney: 0x7d796f, smoke: true }),
    (r) => { // hen coop
      const v = new Vox(T, T, 10);
      for (const [x, y] of [[2, 2], [5, 2], [2, 5], [5, 5]]) v.box(x, y, 0, x + 1, y + 1, 2, C(WOOD[2]));
      v.box(2, 2, 2, 6, 6, 4, courses([0xb8935a, 0xa8834a]));
      gable(v, 2, 2, 6, 6, 4, 'x', [0x8a4a34, 0x7a3f2c], C(0xb8935a), 1);
      onL(v, 5, 3, 5, 2, 3, C(0x33241a));
      fenceRing(v, 0, 0, 8, 8);
      v.set(1, 6, 0, C(0xf4f0e8)); v.set(1, 6, 1, C(0xc8423a)); v.set(6, 7, 0, C(0xd8a868));
      void r;
      return v;
    },
    cottage(mixc(PLASTER), [0x8a5a3a, 0x7a4e32], { timber: 0x5a3d28, chimney: 0x7d796f, smoke: true }),
  ],
  large: [
    (r, lvl) => { // barn
      const v = house(r, { n: 2, w: 12 + lvl, d: 9, floors: 1, fh: 5, wall: courses([0x8a4a34, 0x7c4230]), roof: [0x5a4a40, 0x4c3e36], roofType: 'gable', ov: 1, win: { lit: 0, gap: 4, wh: 1, sill: 3 }, door: 0x4a2a20 });
      const x0 = (16 - 12 - lvl) >> 1;
      onL(v, 12, x0 + 4, x0 + 8, 0, 4, C(0x5a3024)); onL(v, 12, x0 + 4, x0 + 8, 4, 5, C(0xe8dcc0));
      onL(v, 12, x0 + 5, x0 + 7, 1, 3, C(0x33241a));
      return v;
    },
    (r, lvl) => { // farmhouse with yard
      const v = new Vox(16, 16, 30);
      house(r, { n: 2, w: 9, d: 7, floors: 1 + (lvl > 0 ? 1 : 0), fh: 3, wall: mixc(PLASTER), timber: 0x5a3d28, roof: THATCH, roofType: 'gable', roofFlags: ROUGH, chimney: 0x7d796f, smoke: true, win: { lit: 0.7 } }, { v, x0: 2, y0: 2 });
      fenceRing(v, 0, 0, 16, 16);
      for (let x = 2; x < 9; x++) v.set(x, 12, 0, C(GREEN[3], ROUGH));
      gardenTree(v, r, 13, 12, GREEN, 0xd8423a);
      v.box(12, 3, 0, 14, 5, 2, C(0xd8ba6e, ROUGH));
      return v;
    },
  ],
  fill: [(r) => field(r, 0), (r) => field(r, 1), (r) => field(r, 0), (r) => { // hay + fence
    const v = field(r, 2);
    cyl(v, 3, 3, 1.8, 1, 3, mixc(THATCH, ROUGH)); cyl(v, 5.5, 5.5, 1.4, 1, 2, mixc(THATCH, ROUGH));
    return v;
  }],
  sec: [
    (r) => { // windmill
      const v = new Vox(16, 16, 34);
      for (let z = 0; z < 14; z++) cyl(v, 8, 8, 4.2 - z * 0.14, z, z + 1, z < 2 ? stone(1) : mixc(PLASTER, 0, 2));
      cone(v, 8, 8, 3.6, 14, 4, [0x8a4a34, 0x7a3f2c]);
      onL(v, 11, 7, 9, 0, 3, C(0x4a3020)); onL(v, 11, 7, 8, 7, 9, C(0x2c3e55, SMOOTH | WARM));
      // sails on the left-facing plane
      const hy = 13, hz = 13;
      for (let k = -8; k <= 8; k++) { v.set(8 + k * 0.7, hy, hz + k * 0.7, C(0xf0e8d8)); v.set(8 + k * 0.7, hy, hz - k * 0.7, C(0xf0e8d8)); if (Math.abs(k) > 2) { v.set(8 + k * 0.7 + 1, hy, hz + k * 0.7, C(0xd8c8a8)); v.set(8 + k * 0.7 + 1, hy, hz - k * 0.7, C(0xd8c8a8)); } }
      v.box(8, 12, hz, 9, 14, hz + 1, C(0x5a3d28));
      fenceRing(v, 0, 0, 16, 16);
      void r;
      return v;
    },
    (r) => { // fenced paddock with trough and haystack
      const v = new Vox(16, 16, 12);
      for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) v.set(x, y, 0, C(hash(x, y, 2) < 0.3 ? 0x8a7a44 : GREEN[3], ROUGH));
      fenceRing(v, 0, 0, 16, 16); for (let x = 0; x < 16; x++) for (const y of [0, 15]) v.set(x, y, 1, C(0x8a6a44));
      v.box(3, 3, 1, 8, 5, 2, C(WOOD[1])); v.box(4, 3, 2, 7, 5, 3, C(0x3a9aa6, SMOOTH));
      cone(v, 11, 10, 3, 1, 5, THATCH, ROUGH);
      void r;
      return v;
    },
  ],
  hero: (r) => { // great barn, silo and well yard
    const v = new Vox(24, 24, 40);
    house(r, { n: 3, w: 15, d: 10, floors: 1, fh: 6, wall: courses([0x8a4a34, 0x7c4230]), roof: [0x5a4a40, 0x4c3e36], roofType: 'gable', win: { lit: 0, gap: 4, wh: 1, sill: 4 }, door: 0x4a2a20, base: stone(1) }, { v, x0: 2, y0: 2 });
    onL(v, 11, 7, 12, 1, 6, C(0x5a3024)); onL(v, 11, 8, 11, 1, 5, C(0x33241a)); onL(v, 11, 7, 12, 6, 7, C(0xe8dcc0));
    cyl(v, 20.5, 5.5, 2.6, 0, 15, (x, y, z) => C(z % 4 === 3 ? 0x8a8478 : [0xcfc8b4, 0xc2bba6][(x + y) & 1]));
    cone(v, 20.5, 5.5, 3, 15, 3, [0x8a4a34, 0x7a3f2c]);
    wellAt(v, 18, 18);
    for (let i = 0; i < 3; i++) cyl(v, 5 + i * 4, 18 + (i & 1), 1.5, 0, 2, mixc(THATCH, ROUGH, i));
    fenceRing(v, 0, 14, 14, 24);
    return v;
  },
  road: (r) => ground(r, [DIRT[0], DIRT[1], DIRT[2], DIRT[0], 0x9a7c54], ROUGH, { c: [GREEN[2]], p: 0.06 }),
  pave: (r) => ground(r, [GREEN[2], GREEN[3], GREEN[3], GREEN[2]], ROUGH, { c: [DIRT[2], 0xf4e36b], p: 0.07 }, C(0x3d5a30)),
  bridge: (r, d) => bridgeTile(r, d, WOOD, WOOD[2]),
};

// ================================ EPOCH 3 ======================================
const chapel = (r: R, n: 2 | 3, wall: Col, roof: number[], towerH: number, cap: number[], flags = 0): Vox => {
  const S = n * T, v = new Vox(S, S, 60);
  const nx0 = n === 3 ? 3 : 1, nw = n === 3 ? 16 : 11, nd = n === 3 ? 9 : 7, ny0 = (S - nd) >> 1;
  house(r, { n, w: nw, d: nd, floors: 1, fh: n === 3 ? 7 : 5, wall, roof, roofType: 'gable', roofFlags: flags, along: 'x', win: { lit: 0.8, gap: 2, wh: n === 3 ? 4 : 3, sill: 2, m: 2 }, door: 0x4a3020 }, { v, x0: nx0, y0: ny0 });
  const tw = n === 3 ? 6 : 5, tx = nx0 + nw - 2, ty = (S - tw) >> 1;
  v.box(tx, ty, 0, tx + tw, ty + tw, towerH, wall);
  onR(v, tx + tw - 1, ty + 2, ty + tw - 2, 0, 4, C(0x4a3020));
  onR(v, tx + tw - 1, ty + 2, ty + tw - 2, towerH - 5, towerH - 2, C(0x2c3e55, SMOOTH | WARM));
  onL(v, ty + tw - 1, tx + 2, tx + tw - 2, towerH - 5, towerH - 2, C(0x2c3e55, SMOOTH | WARM));
  const top = hip(v, tx, ty, tx + tw, ty + tw, towerH, cap, 1);
  const cx = tx + (tw >> 1), cy = ty + (tw >> 1);
  v.box(cx, cy, top, cx + 1, cy + 1, top + 4, C(0xe0c060)); v.box(cx, cy - 1, top + 2, cx + 1, cy + 2, top + 3, C(0xe0c060));
  return v;
};

const e3: Cat = {
  small: [
    cottage(mixc(PLASTER), THATCH, { timber: 0x5a3d28, chimney: 0x7d796f, smoke: true }),
    (r, lvl) => { // shop with awning
      const v = house(r, { n: 1, w: 6, d: 5, floors: 1 + (lvl > 1 ? 1 : 0), fh: 3, wall: mixc(PLASTER), timber: 0x5a3d28, roof: [0x8a5a3a, 0x7a4e32], roofType: 'gable', win: { lit: 0.7 } });
      const a = pick(r, [0xc8423a, 0x3a6ab0, 0x4a9a6a]);
      for (let x = 1; x < 7; x++) v.set(x, 6, 3, C(x & 1 ? a : 0xf0e8d8));
      v.set(2, 6, 0, C(0xd8523a)); v.set(5, 6, 0, C(0xe8b03a));
      return v;
    },
    (r, lvl) => house(r, { n: 1, w: 5, d: 6, floors: 2 + (lvl > 1 ? 1 : 0), fh: 3, wall: mixc(PLASTER), timber: 0x5a3d28, roof: [0x8a5a3a, 0x7a4e32], roofType: 'gable', chimney: 0x7d796f, smoke: true, win: { lit: 0.6 } }),
  ],
  large: [
    (r, lvl) => { // inn
      const v = house(r, { n: 2, w: 13, d: 10, floors: 2 + (lvl > 1 ? 1 : 0), fh: 4, wall: mixc(PLASTER), timber: 0x5a3d28, base: stone(), roof: [0x8a5a3a, 0x7a4e32, 0x94623f], roofType: 'gable', chimney: 0x7d796f, smoke: true, win: { lit: 0.8, gap: 2 } });
      v.box(1, 14, 5, 2, 16, 8, C(0x5a3d28)); v.box(1, 15, 5, 2, 16, 7, C(0xe0b030));
      return v;
    },
    (r, lvl) => { // smithy
      const v = house(r, { n: 2, w: 11, d: 9, floors: 1, fh: 5, wall: stone(2), roof: [0x5a4a40, 0x4c3e36], roofType: 'hip', win: { lit: 0.9, gap: 3, wh: 2 }, door: 0x33241a });
      v.box(3, 4, 0, 6, 7, 13 + lvl, stone(5)); v.emit(4, 5, 14 + lvl, 'smoke'); v.emit(4, 5, 14 + lvl, 'smoke');
      v.box(12, 13, 0, 14, 15, 2, C(0x3a3430)); v.set(13, 14, 2, C(0xff8a2a, EMIT));
      return v;
    },
    (r, lvl) => chapel(r, 2, stone(4), [0x6a5a50, 0x5c4e46], 13 + lvl * 2, [0x8a4a34, 0x7a3f2c]),
  ],
  fill: [
    (r) => { const v = new Vox(T, T, 12); for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (hash(x, y, 1) < 0.5) v.set(x, y, 0, C(GREEN[3], ROUGH)); gardenTree(v, r, 2, 2, GREEN, pick(r, [0xd8423a, 0xe89a3a])); gardenTree(v, r, 5, 5, GREEN, 0xd8423a); return v; },
    (r) => { const v = field(r, 1); fenceRing(v, 0, 0, 8, 8); return v; },
    (r) => field(r, 0),
  ],
  sec: [
    (r) => { // market square
      const v = new Vox(16, 16, 14);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (hash(x, y, 6) < 0.8) v.set(x, y, 0, C(pick(r, [0xa08a64, 0x94805c, 0xac966e]), ROUGH));
      stallAt(v, r, 2, 2); stallAt(v, r, 9, 3); stallAt(v, r, 2, 10);
      wellAt(v, 12, 12);
      return v;
    },
    (r) => { // village green with maypole
      const v = new Vox(16, 16, 20);
      v.box(7, 7, 0, 9, 9, 1, stone()); v.box(8, 8, 1, 9, 9, 15, C(0xf0e8d8));
      for (let k = 1; k < 7; k++) { v.set(8 + k, 8, 15 - k * 2, C(0xc8423a)); v.set(8, 8 + k, 15 - k * 2, C(0xe0b030)); v.set(8 - k, 8, 15 - k * 2, C(0x3a6ab0)); }
      gardenTree(v, r, 2, 2); gardenTree(v, r, 12, 3); gardenTree(v, r, 3, 12);
      v.box(11, 12, 0, 14, 13, 1, C(WOOD[1]));
      return v;
    },
  ],
  hero: (r) => {
    const v = chapel(r, 3, stone(4), [0x6a5a50, 0x5c4e46], 22, [0x8a4a34, 0x7a3f2c]);
    for (let x = 0; x < 24; x++) for (const y of [0, 23]) if (x < 9 || x > 13 || y === 0) v.box(x, y, 0, x + 1, y + 1, 2, stone(8));
    for (let y = 0; y < 24; y++) for (const x of [0, 23]) if (y < 9 || y > 14 || x === 0) v.box(x, y, 0, x + 1, y + 1, 2, stone(8));
    gardenTree(v, r, 3, 19); gardenTree(v, r, 19, 2, GREEN);
    for (const [x, y] of [[8, 20], [11, 21], [14, 20]]) { v.box(x, y, 0, x + 1, y + 1, 2, C(0x9d998f)); }
    return v;
  },
  road: (r) => ground(r, [0xa08a64, 0x94805c, 0xac966e, 0x8a7654], ROUGH, { c: [0x7a6a50], p: 0.08 }),
  pave: (r) => ground(r, [GREEN[2], GREEN[3], GREEN[3]], ROUGH, { c: [0xa08a64, 0xf4e36b], p: 0.1 }, C(0x3d5a30)),
  bridge: (r, d) => bridgeTile(r, d, [0x8a6a44, 0x7a5a3a], WOOD[2]),
};

// ================================ EPOCH 4 ======================================
const COBBLE = [0x8d8a80, 0x7a776e, 0x9c998e, 0x858278];
const townhouse = (walls: number[][], roofs: number[][], extra: Partial<Parameters<typeof house>[1]> = {}): Maker => (r, lvl) =>
  house(r, { n: 1, w: 6, d: 6, floors: 2 + (lvl > 0 ? 1 : 0), fh: 3, wall: mixc(pick(r, walls)), timber: 0x4a3020, roof: pick(r, roofs), roofType: 'gable', along: r() < 0.5 ? 'x' : 'y', chimney: lvl > 1 ? 0x7d796f : undefined, smoke: true, win: { lit: 0.6 }, ...extra });

function castle(r: R, flag: number): Vox {
  const v = new Vox(24, 24, 50);
  const st = stone(11), dk = mixc([0x7d796f, 0x6f6b62, 0x8a867c], 0, 12);
  // curtain wall
  v.box(1, 1, 0, 23, 23, 7, st); v.box(3, 3, 0, 21, 21, 7, 0); v.box(3, 3, 0, 21, 21, 1, C(0x8a7a5a, ROUGH));
  crenel(v, 1, 1, 23, 23, 7, st);
  onL(v, 22, 10, 14, 0, 5, C(0x33241a)); onL(v, 22, 11, 13, 5, 6, C(0x33241a));
  // corner towers
  for (const [cx, cy] of [[3, 3], [21, 3], [3, 21], [21, 21]]) {
    cyl(v, cx, cy, 3, 0, 13, dk);
    cone(v, cx, cy, 3.4, 13, 6, SLATE);
    v.box(cx, cy, 19, cx + 1, cy + 1, 23, C(0x5a3d28)); v.box(cx, cy + 1, 21, cx + 1, cy + 3, 23, C(flag));
  }
  // keep
  v.box(7, 7, 0, 17, 17, 19, st);
  facade(v, r, 7, 7, 17, 17, 4, 3, 5, { lit: 0.7, gap: 2, wh: 2, m: 2 });
  v.box(6, 6, 19, 18, 18, 20, dk); crenel(v, 6, 6, 18, 18, 20, st);
  v.box(10, 10, 20, 14, 14, 26, st); crenel(v, 10, 10, 14, 14, 26, st);
  v.box(12, 12, 26, 13, 13, 33, C(0x5a3d28)); v.box(12, 13, 29, 13, 17, 33, C(flag));
  return v;
}

const e4: Cat = {
  small: [
    townhouse([PLASTER, [0xe0c8a0, 0xd4bc94], [0xd8d0c0, 0xcec6b6]], [TILE_RED, [0x9a5a3a, 0x8a4e32]]),
    (r, lvl) => house(r, { n: 1, w: 5, d: 6, floors: 3 + (lvl > 1 ? 1 : 0), fh: 3, wall: mixc(pick(r, [PLASTER, [0xe6cfa0, 0xdcc594]])), timber: 0x4a3020, roof: TILE_RED, roofType: 'gable', along: 'y', win: { lit: 0.6 } }),
    (r, lvl) => house(r, { n: 1, w: 6, d: 6, floors: 1 + (lvl > 0 ? 1 : 0), fh: 4, wall: stone(irand(r, 0, 9)), roof: SLATE, roofType: 'hip', chimney: 0x6f6b62, smoke: true, win: { lit: 0.7 } }),
  ],
  large: [
    (r, lvl) => house(r, { n: 2, w: 13, d: 10, floors: 3 + (lvl > 1 ? 1 : 0), fh: 4, wall: mixc(PLASTER), timber: 0x4a3020, base: stone(), roof: TILE_RED, roofType: 'gable', chimney: 0x7d796f, smoke: true, win: { lit: 0.7, gap: 2 } }),
    (r, lvl) => chapel(r, 2, stone(4), SLATE, 16 + lvl * 2, SLATE),
    (r, lvl) => { // merchant row: two joined houses
      const v = new Vox(16, 16, 40);
      house(r, { n: 2, w: 7, d: 10, floors: 2 + (lvl > 0 ? 1 : 0), fh: 4, wall: mixc(PLASTER), timber: 0x4a3020, roof: TILE_RED, roofType: 'gable', along: 'y', win: { lit: 0.7 } }, { v, x0: 1, y0: 3 });
      house(r, { n: 2, w: 7, d: 10, floors: 3, fh: 4, wall: mixc([0xe0c8a0, 0xd4bc94]), timber: 0x4a3020, roof: [0x9a5a3a, 0x8a4e32], roofType: 'gable', along: 'y', chimney: 0x7d796f, smoke: true, win: { lit: 0.7 } }, { v, x0: 8, y0: 3 });
      return v;
    },
  ],
  fill: [
    (r) => { const v = new Vox(T, T, 10); stallAt(v, r, 1, 2, 5); return v; },
    (r) => { const v = new Vox(T, T, 8); wellAt(v, 4, 4); void r; return v; },
    (r) => { const v = field(r, 1); fenceRing(v, 0, 0, 8, 8, 0x7d796f); return v; },
    (r) => { const v = new Vox(T, T, 12); gardenTree(v, r, 3, 3); return v; },
  ],
  sec: [
    (r) => { // gate tower
      const v = new Vox(16, 16, 40);
      v.box(3, 3, 0, 13, 13, 18, stone(21));
      onL(v, 12, 6, 10, 0, 6, C(0x33241a)); onL(v, 12, 7, 9, 6, 7, C(0x33241a));
      facade(v, r, 3, 3, 13, 13, 8, 2, 5, { lit: 0.7, gap: 3, m: 2 });
      v.box(2, 2, 18, 14, 14, 19, mixc([0x7d796f, 0x6f6b62])); crenel(v, 2, 2, 14, 14, 19, stone(2));
      v.box(8, 8, 19, 9, 9, 26, C(0x5a3d28)); v.box(8, 9, 23, 9, 13, 26, C(0x3a6ab0));
      return v;
    },
    (r) => { // market hall
      const v = new Vox(16, 16, 30);
      for (let x = 2; x < 14; x += 3) for (const y of [3, 12]) v.box(x, y, 0, x + 1, y + 1, 5, stone(3));
      v.box(2, 3, 5, 14, 13, 6, C(0x5a3d28));
      gable(v, 2, 3, 14, 13, 6, 'x', TILE_RED, C(0xe8dcc0), 1);
      for (let x = 3; x < 13; x += 2) v.box(x, 6, 0, x + 1, 10, 2, C(pick(r, [0xd8523a, 0xe8b03a, 0x7ab04a, 0x8a6a44])));
      return v;
    },
  ],
  hero: (r) => castle(r, 0xc8423a),
  road: (r, d) => roadTile(r, d, COBBLE, { flags: ROUGH }),
  pave: (r) => ground(r, [0x9c998e, 0x8d8a80, 0xa8a59a], ROUGH, { c: [0x7a776e], p: 0.1 }),
  bridge: (r, d) => bridgeTile(r, d, COBBLE, 0x6f6b62, ROUGH),
};

// ================================ EPOCH 5 ======================================
const PASTEL = [[0xe8c890, 0xdcbc84], [0xe0a890, 0xd49c84], [0xd8d0b8, 0xccc4ac], [0xc8b8a0, 0xbcac94], [0xe6d8a0, 0xdacc94]];
const TERRA = [0xc4683f, 0xb05a36, 0xd0744a];

function cathedral(r: R): Vox {
  const v = new Vox(24, 24, 70);
  const st = mixc([0xc8c0ae, 0xbcb4a2, 0xd2cab8], 0, 5);
  // nave + transept
  house(r, { n: 3, w: 18, d: 9, floors: 1, fh: 12, wall: st, roof: SLATE, roofType: 'gable', along: 'x', win: { lit: 0.9, gap: 2, wh: 6, sill: 3, m: 2 }, door: 0x4a3020 }, { v, x0: 1, y0: 8 });
  house(r, { n: 3, w: 7, d: 17, floors: 1, fh: 12, wall: st, roof: SLATE, roofType: 'gable', along: 'y', win: { lit: 0.9, gap: 2, wh: 6, sill: 3, m: 2 }, door: 0x4a3020 }, { v, x0: 5, y0: 4 });
  // twin west towers
  for (const y0 of [5, 15]) {
    v.box(17, y0, 0, 22, y0 + 5, 26, st);
    facade(v, r, 17, y0, 22, y0 + 5, 6, 3, 6, { lit: 0.6, gap: 1, wh: 3, m: 2 });
    for (let k = 0; k < 10; k++) cyl(v, 19.5, y0 + 2.5, Math.max(0.6, 2.9 * (1 - k / 10)), 26 + k, 27 + k, C(SLATE[k % 3]));
    v.box(19, y0 + 2, 36, 20, y0 + 3, 39, C(0xe0c060));
  }
  // rose window + portal
  v.box(18, 10, 0, 22, 15, 16, st);
  onR(v, 21, 11, 14, 8, 12, C(0x5a4a8a, SMOOTH | WARM)); onR(v, 21, 12, 13, 7, 13, C(0x8a4a6a, SMOOTH | WARM));
  onR(v, 21, 11, 14, 0, 5, C(0x4a3020));
  gable(v, 18, 10, 22, 15, 16, 'x', SLATE, st, 0);
  // crossing spire
  for (let k = 0; k < 12; k++) cyl(v, 8.5, 12.5, Math.max(0.6, 2.4 * (1 - k / 12)), 19 + k, 20 + k, C(0x6a8a80));
  return v;
}

const e5: Cat = {
  small: [
    (r, lvl) => house(r, { n: 1, w: 6, d: 6, floors: 3 + (lvl > 1 ? 1 : 0), fh: 3, wall: mixc(pick(r, PASTEL)), base: stone(), roof: pick(r, [TERRA, SLATE]), roofType: 'hip', chimney: 0x8a7a6a, smoke: lvl > 0, win: { lit: 0.6 } }),
    (r, lvl) => house(r, { n: 1, w: 5, d: 6, floors: 3 + lvl, fh: 3, wall: mixc(pick(r, PASTEL)), roof: SLATE, roofType: 'gable', along: 'y', win: { lit: 0.6 } }),
    (r, lvl) => house(r, { n: 1, w: 6, d: 6, floors: 2 + (lvl > 0 ? 1 : 0), fh: 4, wall: mixc([0xc8c0ae, 0xbcb4a2]), roof: SLATE, roofType: 'mansard', chimney: 0x8a7a6a, smoke: true, win: { lit: 0.7, wh: 3, sill: 1 } }),
  ],
  large: [
    (r, lvl) => house(r, { n: 2, w: 14, d: 12, floors: 3 + (lvl > 1 ? 1 : 0), fh: 4, wall: mixc(pick(r, PASTEL)), base: stone(), roof: TERRA, roofType: 'hip', chimney: 0x8a7a6a, smoke: true, win: { lit: 0.7, gap: 1, wh: 3, sill: 1 } }),
    (r, lvl) => house(r, { n: 2, w: 13, d: 13, floors: 4 + (lvl > 0 ? 1 : 0), fh: 4, wall: mixc([0xc8c0ae, 0xbcb4a2, 0xd2cab8]), base: stone(3), roof: SLATE, roofType: 'mansard', chimney: 0x8a7a6a, smoke: true, win: { lit: 0.7, gap: 1, wh: 3, sill: 1 } }),
    (r, lvl) => { // courtyard palazzo
      const v = house(r, { n: 2, w: 14, d: 14, floors: 3 + (lvl > 1 ? 1 : 0), fh: 4, wall: mixc(pick(r, PASTEL)), base: stone(), roof: [TERRA[0], TERRA[1]], roofType: 'flat', win: { lit: 0.7, gap: 1, wh: 3, sill: 1 } });
      const H = (3 + (lvl > 1 ? 1 : 0)) * 4 + 1;
      v.box(5, 5, H - 4, 11, 11, H + 2, 0); v.box(5, 5, H - 5, 11, 11, H - 4, C(GREEN[3], ROUGH));
      gardenTree(v, r, 7, 7);
      return v;
    },
  ],
  fill: [
    (r) => { // fountain
      const v = new Vox(T, T, 8);
      cyl(v, 4, 4, 3, 0, 1, mixc([0xc8c0ae, 0xbcb4a2])); cyl(v, 4, 4, 2, 0, 1, C(0x4fb3b0, SMOOTH));
      v.box(3, 3, 0, 5, 5, 3, C(0xd2cab8)); v.set(3, 3, 3, C(0x8fdcd0, SMOOTH)); v.set(4, 4, 3, C(0x8fdcd0, SMOOTH));
      void r;
      return v;
    },
    (r) => { // statue + hedges
      const v = new Vox(T, T, 10);
      for (let i = 0; i < 8; i++) { v.set(i, 0, 0, C(GREEN[1], ROUGH)); v.set(i, 7, 0, C(GREEN[1], ROUGH)); v.set(0, i, 0, C(GREEN[1], ROUGH)); v.set(7, i, 0, C(GREEN[1], ROUGH)); }
      v.box(3, 3, 0, 5, 5, 2, C(0xc8c0ae)); v.box(3, 3, 2, 4, 4, 6, C(pick(r, [0x6a9a8a, 0x8a8a8a, 0xb8a060])));
      return v;
    },
    (r) => { // formal garden
      const v = new Vox(T, T, 12);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x === 0 || x === 7 || y === 0 || y === 7 || x === y || x + y === 7)) v.set(x, y, 0, C(GREEN[1 + ((x + y) & 1)], ROUGH)); else if (hash(x, y, 3) < 0.3) v.set(x, y, 0, C(pick(r, [0xe889a8, 0xf4e36b, 0xffffff])));
      return v;
    },
    (r) => { const v = new Vox(T, T, 12); gardenTree(v, r, 3, 3, GREEN); return v; },
  ],
  sec: [
    (r) => { // clock tower
      const v = new Vox(16, 16, 60);
      const st = mixc([0xc8c0ae, 0xbcb4a2, 0xd2cab8]);
      v.box(4, 4, 0, 12, 12, 4, stone(4)); v.box(5, 5, 4, 11, 11, 26, st);
      facade(v, r, 5, 5, 11, 11, 5, 3, 5, { lit: 0.6, gap: 2, wh: 3, m: 2 });
      onL(v, 10, 6, 10, 20, 24, C(0xf4f0e0, WARM)); onR(v, 10, 6, 10, 20, 24, C(0xf4f0e0, WARM));
      onL(v, 10, 8, 9, 21, 23, C(0x2a2a2e)); onR(v, 10, 8, 9, 21, 23, C(0x2a2a2e));
      v.box(4, 4, 26, 12, 12, 27, st);
      for (let k = 0; k < 9; k++) cyl(v, 8, 8, Math.max(0.6, 3.6 * (1 - k / 9)), 27 + k, 28 + k, C([0x6a8a80, 0x5e7c72][k & 1]));
      v.box(8, 8, 36, 9, 9, 39, C(0xe0c060));
      onL(v, 11, 7, 9, 0, 4, C(0x4a3020));
      return v;
    },
    (r) => { // domed rotunda
      const v = new Vox(16, 16, 40);
      const st = mixc([0xd8d0b8, 0xccc4ac]);
      cyl(v, 8, 8, 6.5, 0, 2, stone(2)); cyl(v, 8, 8, 5.5, 2, 9, st);
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; v.box(Math.round(7.5 + Math.cos(a) * 5.8), Math.round(7.5 + Math.sin(a) * 5.8), 2, Math.round(7.5 + Math.cos(a) * 5.8) + 1, Math.round(7.5 + Math.sin(a) * 5.8) + 1, 9, C(0xefe8d8)); }
      cyl(v, 8, 8, 6.5, 9, 10, st);
      ball(v, 8, 8, 10, 5.4, 5.5, C(0x6a9a8a)); v.box(0, 0, 0, 16, 16, 0, 0);
      v.box(8, 8, 15, 9, 9, 19, C(0xe0c060));
      void r;
      return v;
    },
  ],
  hero: cathedral,
  road: (r, d) => roadTile(r, d, [0xa8a294, 0x9c9688, 0xb2ac9e], { flags: ROUGH, curb: [0xc8c0ae, 0xbcb4a2] }),
  pave: (r) => ground(r, [0xc2baa6, 0xb6ae9a, 0xcec6b2], ROUGH, { c: [0xa49c88], p: 0.1 }),
  bridge: (r, d) => bridgeTile(r, d, [0xb2ac9e, 0xa8a294], 0xc8c0ae, ROUGH),
};

export const CATS_A: Cat[] = [e1, e2, e3, e4, e5];
export { stone, STONE, WOOD, gardenTree, fenceRing, SAND, Vox };
export type { Col };
