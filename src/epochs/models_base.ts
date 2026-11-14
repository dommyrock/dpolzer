// Terrain, nature and ambient-life sprites shared by every epoch.
import { hash, pick, rng, hashStr, type R } from './rng';
import { C, EMIT, ROUGH, SMOOTH, WARM, COOL, Vox, T, blobTree, pine, ball, cyl, mixc, type Col } from './shapes';

export const GREEN = [0x2f5d34, 0x3f7a3a, 0x569a45, 0x7cb850, 0xa5d167];
export const PINE = [0x1c4436, 0x275a44, 0x357452, 0x4b8f5f];
export const AUTUMN = [0x8a3f20, 0xb5602a, 0xd98a34, 0xeab54a];
export const BIRCH = [0x6f8f2c, 0x93ad36, 0xbfc84a, 0xe0dc6a];
export const SAND = [0xd9c27a, 0xe6d391, 0xcbb06a, 0xdcc884];
export const DIRT = [0x8a6a44, 0x7a5a3a, 0x94744c];
export const WATER = [0x3a9aa6, 0x44a8ac, 0x4fb3b0];
export const SOIL = 0x4a3b2c;

export type Item = [id: string, make: (r: R) => Vox, baseZ?: number];

/** One 32x16 ground tile: an 8x8 slab whose top sits on the ground plane. */
export function slab(top: (x: number, y: number) => number, side: Col = C(SOIL), th = 2): Vox {
  const v = new Vox(T, T, th);
  if (th > 1) v.box(0, 0, 0, T, T, th - 1, side);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) v.set(x, y, th - 1, top(x, y));
  return v;
}

export const ground = (r: R, cols: number[], flags = ROUGH, speck?: { c: number[]; p: number }, side: Col = C(SOIL)) =>
  slab(() => (speck && r() < speck.p ? C(pick(r, speck.c), flags) : C(pick(r, cols), flags)), side);

export interface RoadO { curb?: number[]; dash?: number; dashEmit?: boolean; flags?: number; edge?: number }

/** dir 0 = junction, 1 = runs along x, 2 = runs along y. */
export function roadTile(r: R, dir: number, base: number[], o: RoadO = {}): Vox {
  const fl = o.flags ?? 0;
  return slab((x, y) => {
    const a = dir === 1 ? x : y, b = dir === 1 ? y : x; // a along, b across
    if (dir !== 0) {
      if (o.curb && (b === 0 || b === 7)) return C(pick(r, o.curb), fl);
      if (o.edge != null && (b === 1 || b === 6)) return C(o.edge, o.dashEmit ? EMIT : fl);
      if (o.dash != null && b === 4 && a % 4 < 2) return C(o.dash, o.dashEmit ? EMIT : fl);
    } else if (o.curb && (x === 0 || x === 7) && (y === 0 || y === 7)) return C(pick(r, o.curb), fl);
    return C(pick(r, base), fl);
  }, C(0x2e2a28));
}

export function bridgeTile(r: R, dir: number, deck: number[], rail: number, flags = 0, lamp?: number): Vox {
  const v = new Vox(T, T, 6);
  v.box(0, 0, 0, T, T, 2, (x, y) => C(deck[Math.floor(hash(x, y, dir) * deck.length)], flags));
  for (let a = 0; a < T; a++) {
    const post = a % 3 === 0 ? 2 : 1;
    for (const b of [0, 7]) v.box(dir === 1 ? a : b, dir === 1 ? b : a, 2, (dir === 1 ? a : b) + 1, (dir === 1 ? b : a) + 1, 2 + post, C(rail));
  }
  if (lamp != null) { v.set(dir === 1 ? 3 : 0, dir === 1 ? 0 : 3, 4, C(lamp, EMIT)); v.set(dir === 1 ? 3 : 7, dir === 1 ? 7 : 3, 4, C(lamp, EMIT)); }
  void r;
  return v;
}

function cliff(r: R): Vox {
  const H = 30;
  const v = new Vox(T, T, H);
  const s = Math.floor(r() * 1e6);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const dep = 9 + Math.floor(hash(x >> 1, y >> 1, s) * 12 + hash(x, y, s) * 5);
      for (let z = H - dep; z < H; z++) {
        const k = H - z;
        const col = k <= 3 ? [0x6a5038, 0x5c452f][z & 1] : [0x6f6258, 0x5d524a, 0x4c433d, 0x675a50][(z + (hash(x >> 1, z, s) < 0.3 ? 1 : 0)) & 3];
        v.set(x, y, z, C(col, ROUGH));
      }
    }
  return v;
}

function sheep(dir: number): Vox {
  const v = new Vox(6, 6, 6);
  const wool = mixc([0xf1ede2, 0xe2ddd0, 0xfaf8f2], ROUGH);
  if (dir === 1) { v.box(1, 2, 1, 5, 4, 4, wool); v.box(5, 2, 2, 6, 4, 4, C(0x3a3430)); for (const x of [1, 4]) v.box(x, 2, 0, x + 1, 4, 1, C(0x3a3430)); }
  else { v.box(2, 1, 1, 4, 5, 4, wool); v.box(2, 5, 2, 4, 6, 4, C(0x3a3430)); for (const y of [1, 4]) v.box(2, y, 0, 4, y + 1, 1, C(0x3a3430)); }
  return v;
}

function vehicle(r: R, kind: string, dir: number): Vox {
  const v = new Vox(T, T, 8);
  // helper that writes boxes in "along/across" space
  const b = (a0: number, c0: number, z0: number, a1: number, c1: number, z1: number, col: Col) =>
    dir === 1 ? v.box(a0, c0, z0, a1, c1, z1, col) : v.box(c0, a0, z0, c1, a1, z1, col);
  if (kind === 'cart') {
    b(1, 3, 1, 5, 6, 3, mixc([0x7a5636, 0x6b4a2f]));
    b(1, 3, 3, 5, 6, 4, C(pick(r, [0xd8c89a, 0xb04a3a, 0x5a7a9a])));
    b(1, 2, 0, 2, 7, 2, C(0x2e2620)); b(4, 2, 0, 5, 7, 2, C(0x2e2620));
    b(5, 4, 0, 8, 6, 3, C(pick(r, [0x6a4a30, 0x3a3028, 0xc9b79a])));
  } else if (kind === 'tram') {
    const body = pick(r, [0x3f6a4a, 0x8a2f2a, 0x2f4a6a]);
    b(0, 3, 0, 8, 6, 1, C(0x2a2a2e)); b(0, 3, 1, 8, 6, 2, C(body)); b(0, 3, 2, 8, 6, 4, C(0xe8dcc0));
    for (const a of [1, 3, 5]) b(a, 5, 2, a + 1, 6, 3, C(0x2c3e55, SMOOTH | WARM));
    b(0, 3, 4, 8, 6, 5, C(body));
  } else if (kind === 'car') {
    const body = pick(r, [0xc8342c, 0x2f6fb0, 0xe8e4dc, 0x2a2c30, 0xe0b030, 0x4a9a6a]);
    b(1, 3, 0, 7, 6, 2, C(body)); b(2, 3, 2, 6, 6, 3, C(0x9fc4dc, SMOOTH)); b(3, 3, 3, 5, 6, 4, C(body));
    b(7, 3, 1, 8, 4, 2, C(0xfff2b0, EMIT)); b(7, 5, 1, 8, 6, 2, C(0xfff2b0, EMIT));
  } else {
    const body = pick(r, [0x2a2f45, 0xdfe4f0, 0x5a2a6a, 0x1e3a4a]);
    const glow = pick(r, [0x35e0ff, 0xff4fc0, 0xa0ff5a]);
    b(1, 3, 2, 7, 6, 4, C(body)); b(3, 3, 4, 6, 6, 5, C(0x7fe8ff, SMOOTH));
    b(1, 3, 1, 7, 6, 2, C(glow, EMIT)); b(0, 4, 2, 1, 5, 4, C(0xff3b5a, EMIT));
  }
  return v;
}

function flyer(r: R, k: number): Vox {
  const v = new Vox(T, T, 5);
  if (k === 0) { v.box(3, 3, 1, 5, 5, 2, C(0x2a2f3a)); for (const [x, y] of [[2, 2], [5, 2], [2, 5], [5, 5]]) v.set(x, y, 2, C(0x9aa0a8)); v.set(4, 4, 0, C(0xff3b5a, EMIT)); }
  else {
    const glow = pick(r, [0x35e0ff, 0xff4fc0, 0xffd24a]);
    v.box(1, 3, 1, 7, 5, 3, C(k === 1 ? 0xdfe4f0 : 0x3a2f55)); v.box(3, 3, 3, 6, 5, 4, C(0x7fe8ff, SMOOTH));
    v.box(1, 3, 0, 7, 5, 1, C(glow, EMIT));
  }
  return v;
}

/** Later-era air traffic: delivery drone, passenger shuttle. */
function flyer2(r: R, k: number): Vox {
  const v = new Vox(T, T, 6);
  if (k === 3) { // delivery drone carrying a parcel
    v.box(3, 3, 2, 5, 5, 3, C(0xf0f2f6)); for (const [x, y] of [[1, 1], [6, 1], [1, 6], [6, 6]]) v.set(x, y, 3, C(0x5a6070));
    v.box(2, 2, 3, 6, 6, 3, 0); v.box(3, 3, 0, 5, 5, 2, C(pick(r, [0xffa030, 0xc8a070, 0x6ad08a]))); v.set(4, 4, 3, C(0x6aff9a, EMIT));
  } else { // shuttle
    v.box(0, 3, 1, 8, 5, 3, C(0xf0f2f6)); v.box(2, 1, 1, 5, 7, 2, C(0xdce1e7)); v.box(5, 3, 3, 7, 5, 4, C(0x7fe8ff, SMOOTH));
    v.box(0, 3, 1, 1, 5, 3, C(pick(r, [0x35e0ff, 0xffa030]), EMIT));
  }
  return v;
}

/** Small off-world base pieces that sit on the Moon and Mars. */
function colony(r: R, k: number): Vox {
  const v = new Vox(12, 12, 20);
  const hull = mixc([0xe8ecf0, 0xdce1e7, 0xcfd6de]);
  if (k === 0) { // glass dome with a garden
    cyl(v, 6, 6, 5, 0, 1, hull);
    ball(v, 6, 6, 1, 4.4, 4.2, (x, y, z) => ((x + y) % 3 === 0 || z % 3 === 0 ? C(0xcfd6de) : C(0x7fd8e8, SMOOTH | COOL)));
    v.box(0, 0, 0, 12, 12, 0, 0);
    ball(v, 6, 6, 1, 2.4, 1.6, C(0x4fae5a, ROUGH));
  } else if (k === 1) { // habitat tubes
    v.box(1, 3, 0, 11, 6, 3, hull); v.box(4, 6, 0, 7, 11, 3, hull);
    for (let x = 2; x < 11; x += 2) v.set(x, 5, 1, C(0x1a2436, SMOOTH | WARM));
    for (let y = 7; y < 11; y += 2) v.set(6, y, 1, C(0x1a2436, SMOOTH | COOL));
    v.box(1, 3, 3, 11, 6, 4, C(0xffa030)); v.box(1, 4, 3, 11, 5, 4, 0);
  } else if (k === 2) { // comms tower
    v.box(4, 4, 0, 8, 8, 3, hull); v.box(5, 5, 3, 7, 7, 12, C(0xb8c0cc));
    for (let z = 4; z < 12; z += 3) { v.set(6, 6, z, C(0x1a2436, SMOOTH | COOL)); v.set(5, 6, z, C(0x1a2436, SMOOTH | WARM)); }
    v.box(5, 5, 12, 6, 6, 17, C(0x8a90a0)); v.set(5, 5, 17, C(0xff3b5a, EMIT));
  } else if (k === 3) { // landing pad with a parked shuttle
    cyl(v, 6, 6, 5.4, 0, 1, C(0x4a5060));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; v.set(6 + Math.cos(a) * 4.8, 6 + Math.sin(a) * 4.8, 0, C(0xffd24a, EMIT)); }
    v.box(3, 5, 1, 9, 8, 3, C(0xf0f2f6)); v.box(5, 5, 3, 8, 8, 4, C(0x7fe8ff, SMOOTH)); v.box(3, 6, 1, 4, 7, 3, C(0x35e0ff, EMIT));
  } else { // dish + solar field
    v.box(5, 5, 0, 7, 7, 4, C(0x8a90a0));
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if (i * i + j * j <= 10) v.set(6 + i, 6 + j, 4 + Math.floor((i * i + j * j) / 4), C(0xe8ecf0));
    v.set(6, 6, 7, C(0xff5a3a, EMIT));
    v.box(0, 9, 0, 4, 12, 1, (x, y) => C((x + y) & 1 ? 0x23406a : 0x2c4f82, SMOOTH));
  }
  void r;
  return v;
}

function rocket(): Vox {
  const v = new Vox(8, 8, 34);
  cyl(v, 4, 4, 1.7, 3, 22, (x, y, z) => C(z % 7 === 0 ? 0x2a2f3a : z > 15 && z < 19 ? 0xff7a2a : 0xf0f2f6));
  for (let k = 0; k < 5; k++) cyl(v, 4, 4, Math.max(0.6, 1.7 * (1 - k / 5)), 22 + k, 23 + k, C(k < 3 ? 0xf0f2f6 : 0xd8423a));
  for (const [x, y] of [[1, 4], [6, 4], [4, 1], [4, 6]]) { v.box(x, y, 0, x + 1, y + 1, 6, C(0xd8423a)); }
  v.box(3, 3, 0, 5, 5, 3, C(0x4a5060));
  v.set(4, 5, 12, C(0x1a2436, SMOOTH | COOL));
  return v;
}

export function baseItems(): Item[] {
  const it: Item[] = [];
  for (let k = 0; k < 6; k++)
    it.push([`grass:${k}`, (r) => ground(r, [GREEN[2], GREEN[2], GREEN[3], GREEN[3], GREEN[1]], ROUGH, k >= 4 ? { c: [0xf4e36b, 0xffffff, 0xe889a8], p: 0.05 } : undefined, C(0x3d5a30)), 2]);
  for (let k = 0; k < 4; k++)
    it.push([`forest:${k}`, (r) => ground(r, [GREEN[1], GREEN[1], GREEN[2], GREEN[0]], ROUGH, { c: [0x6a5a34, 0x8a7a44], p: 0.08 }, C(0x33502c)), 2]);
  for (let k = 0; k < 4; k++)
    it.push([`sand:${k}`, (r) => ground(r, SAND, ROUGH, { c: [0xb89a58, 0xf0e4b0], p: 0.07 }, C(0xb09858)), 2]);
  for (let f = 0; f < 4; f++)
    it.push([`water:${f}`, () => slab((x, y) => {
      const ph = (x - y + f * 2 + 16) & 7;
      const hl = ph === 0 && hash(x >> 1, y, 5) > 0.35;
      return C(hl ? 0x8fdcd0 : WATER[Math.floor(hash(x, y, f >> 1) * 3)], SMOOTH);
    }, C(0x2d7f8c), 1), 2]);
  for (let k = 0; k < 4; k++) it.push([`cliff:${k}`, cliff, 32]);

  for (let k = 0; k < 6; k++) it.push([`oak:${k}`, (r) => blobTree(r, GREEN, { trunkH: 4 + Math.floor(r() * 3), rad: 3.6 + r() * 1.6 })]);
  for (let k = 0; k < 4; k++) it.push([`pine:${k}`, (r) => pine(r, PINE, 11 + Math.floor(r() * 5))]);
  for (let k = 0; k < 3; k++) it.push([`blossom:${k}`, (r) => blobTree(r, GREEN.slice(1), { trunkH: 4, rad: 3.6 + r(), blossom: [0xf6cfe0, 0xffffff, 0xf0a8c8], bp: 0.38 })]);
  for (let k = 0; k < 3; k++) it.push([`autumn:${k}`, (r) => blobTree(r, k === 2 ? BIRCH : AUTUMN, { trunkH: 4 + Math.floor(r() * 2), rad: 3.2 + r() * 1.2, trunk: k === 2 ? 0xd8d2c4 : 0x4a3020 })]);
  for (let k = 0; k < 4; k++) it.push([`bush:${k}`, (r) => blobTree(r, GREEN, { trunkH: 0, rad: 2 + r() * 0.9, squash: 0.7, blobs: 2, blossom: k >= 2 ? [0xd8423a, 0xf4e36b] : undefined, bp: 0.1, size: 10 })]);
  for (let k = 0; k < 2; k++) it.push([`rock:${k}`, (r) => {
    const v = new Vox(10, 10, 8);
    ball(v, 5, 5, 0.5, 2.4 + r(), 2 + r(), mixc([0x8f8b82, 0x7d796f, 0xa4a097], ROUGH));
    ball(v, 3.5 + r() * 2, 6, 0, 1.6, 1.4, mixc([0x7d796f, 0x6b675f], ROUGH));
    return v;
  }]);
  for (let k = 0; k < 2; k++) it.push([`palm:${k}`, (r) => {
    const v = new Vox(14, 14, 20);
    const h = 9 + Math.floor(r() * 3);
    for (let z = 0; z < h; z++) v.set(7 + (z > h / 2 ? 1 : 0), 7, z, C(z & 1 ? 0x8a6a44 : 0x7a5a3a));
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]])
      for (let k2 = 1; k2 <= 4; k2++) v.set(8 + dx * k2, 7 + dy * k2, h + (k2 < 3 ? 0 : k2 === 3 ? -1 : -2), C(GREEN[1 + ((k2 + dx + 2) % 3)], ROUGH));
    v.set(8, 7, h, C(GREEN[3], ROUGH));
    return v;
  }]);
  for (const d of [1, 2]) it.push([`sheep:${d}`, () => sheep(d)]);
  for (let k = 0; k < 3; k++) it.push([`cloud:${k}`, (r) => {
    const v = new Vox(22, 12, 6);
    const n = 3 + k;
    for (let i = 0; i < n; i++) ball(v, 5 + (i * 12) / n + r() * 2, 5 + r() * 2, 2, 3 + r() * 1.5, 1.6 + r(), C(0xf4f6fa, SMOOTH));
    return v;
  }]);
  for (const kind of ['cart', 'tram', 'car', 'hover'])
    for (const d of [1, 2]) for (let k = 0; k < 3; k++) it.push([`veh:${kind}:${d}:${k}`, (r) => vehicle(r, kind, d)]);
  for (let k = 0; k < 3; k++) it.push([`fly:${k}`, (r) => flyer(r, k)]);
  for (let k = 3; k < 5; k++) it.push([`fly:${k}`, (r) => flyer2(r, k)]);
  for (let k = 0; k < 5; k++) it.push([`col:${k}`, (r) => colony(r, k)]);
  it.push(['rocket:0', rocket]);
  return it;
}

export const seeded = (id: string, seed: number) => rng(hashStr(id) ^ seed);
export { cyl };
