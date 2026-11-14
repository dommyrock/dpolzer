// Epoch 11: Garden Metropolis. A biophilic city: pale towers draped in green, sky gardens, water everywhere.
// Epochs 12-14 reuse this whole library (see catalog.ts), so it is the base look of the last four epochs.
import { hash, pick, irand, type R } from './rng';
import { C, EMIT, ROUGH, SMOOTH, WARM, COOL, Vox, T, type Col, type Maker, mixc, onL, onR, gable, cyl } from './shapes';
import { slab } from './models_base';
import { type Cat } from './epochs_a';

type Face = 'L' | 'R';
type Pal = number[];
type CF = (x: number, y: number, z: number) => number;
const TAU = Math.PI * 2;

// ================================ palette ======================================
const LEAF: Pal = [0x2c6238, 0x3c8040, 0x55a04a, 0x7cbc54, 0xa8d86a];
const JUNGLE: Pal = [0x1f5a48, 0x2c7858, 0x449a66, 0x6cba78, 0x9cd890];
const LIME: Pal = [0x4f8a2c, 0x6ca834, 0x90c440, 0xb8dc58, 0xd8ec80];
const SAGE: Pal = [0x4a6a44, 0x628a54, 0x80a868, 0xa0c284, 0xc0d8a4];
const PALS = [LEAF, JUNGLE, LIME, SAGE];
const BLOOM: Pal = [0xf47aa8, 0xdc4490, 0xffd24a, 0xff9642, 0xfff6f0, 0xb88ae8];
const PINK: Pal = [0xf47aa8, 0xf8a8c8, 0xdc4490, 0xfff0f4];
const GOLD: Pal = [0xffd24a, 0xff9642, 0xfff2b0];
const WHITE = [0xf8f6f0, 0xeeece5], CREAM = [0xf5e9cc, 0xebdfc2], CONC = [0xdfe4e2, 0xd5dad8];
const SANDW = [0xe9d3ac, 0xdfc9a2], TIMB = [0xdcb888, 0xd0aa78], BLUSH = [0xf2d9cc, 0xe8cfc2], SKY = [0xd8e8ec, 0xcee0e4];
const SHELLS = [WHITE, CREAM, CONC, SANDW, WHITE, BLUSH];
const GLASS = [0x74c8c2, 0x84d0d2, 0x6cbcc6, 0x90d6c2, 0x9ad4dc];
const WATER = [0x3fb0cc, 0x4fbfd6, 0x62cbdc];
const FOAM = 0xf0fbff, LAMP = 0xffe6a8, BARK = 0x6e4e34;
const DECK = [0xd8b888, 0xcda977, 0xe0c296];
const STONE = [0xd9d5ca, 0xcfcbc0, 0xe2ded4];
const LAWN = [0x7cbc54, 0x8cc85c, 0x6fb04c, 0x9ad064];
const ROCK = [0xb9b2a2, 0xa8a192, 0xc8c2b4, 0x989284];

// ================================ helpers ======================================
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerpc = (a: number, b: number, t: number): number => {
  t = clamp01(t);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
/** Lighten (k > 0) or darken (k < 0) a colour. */
const shade = (c: number, k: number) => lerpc(c, k < 0 ? 0x000000 : 0xffffff, Math.abs(k));
const put = (v: Vox, face: Face, f: number, a0: number, a1: number, z0: number, z1: number, c: Col) =>
  (face === 'L' ? onL(v, f, a0, a1, z0, z1, c) : onR(v, f, a0, a1, z0, z1, c));
/** Paint the two visible faces of a box footprint. */
const faces = (v: Vox, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, c: Col) => {
  onL(v, y1 - 1, x0, x1, z0, z1, c); onR(v, x1 - 1, y0, y1, z0, z1, c);
};
const leafC = (pal: Pal, h: number) => pal[h < 0.12 ? 0 : h < 0.42 ? 1 : h < 0.74 ? 2 : h < 0.93 ? 3 : 4];
/** One foliage voxel: a random tone of the palette, sometimes a blossom. */
const rleaf = (r: R, pal: Pal = LEAF, bloom?: Pal, bp = 0.1) => C(bloom && r() < bp * 0.55 ? pick(r, bloom) : leafC(pal, r()), ROUGH);
const leaf = (pal: Pal = LEAF, s = 0, bloom?: Pal, bp = 0.1): CF => (x, y, z) =>
  C(bloom && hash(x, y, z, s + 7) < bp ? bloom[Math.floor(hash(x, y, z, s + 8) * bloom.length)] : leafC(pal, hash(x, y, z, s)), ROUGH);
const lawn = (s = 0, bp = 0.04): CF => (x, y) => C(hash(x, y, s + 3) < bp ? BLOOM[Math.floor(hash(x, y, s) * BLOOM.length)] : LAWN[Math.floor(hash(x, y, s) * LAWN.length)], ROUGH);
const waterTop: CF = (x, y) => C(((x - y + 32) & 7) === 0 && hash(x >> 1, y, 5) > 0.3 ? 0xa4e6ee : WATER[Math.floor(hash(x, y, 2) * 3)], SMOOTH);
/** Falling water: blue with long near-white streaks. */
const fallC = (s: number): CF => (x, y, z) => {
  const a = x - y, h = hash(a, (z + a * 3) >> 2, s);
  return C(h < 0.27 ? 0xe8f9fd : h < 0.5 ? 0x8cdaea : WATER[(a + (z >> 1)) & 1], SMOOTH);
};
const glassLit = (r: R, g: number, lit: number) => C(g, SMOOTH | (r() < lit ? (r() < 0.9 ? WARM : COOL) : 0));

interface TreeO { pal?: Pal; bloom?: Pal; bp?: number; th?: number; trunk?: number; squash?: number }
/** Round-crowned tree, lit from the upper left like the wild trees. */
function tree(v: Vox, x: number, y: number, z: number, rad: number, o: TreeO = {}): void {
  const pal = o.pal ?? LEAF, th = o.th ?? Math.max(1, Math.round(rad * 0.8)), s = x * 31 + y * 17 + z * 7;
  v.box(x, y, z, x + 1, y + 1, z + th + 1, C(o.trunk ?? BARK));
  const rz = rad * (o.squash ?? 0.85), cx = x + 0.5, cy = y + 0.5, cz = z + th + rz * 0.75;
  for (let zz = Math.floor(cz - rz); zz <= cz + rz; zz++)
    for (let yy = Math.floor(cy - rad); yy <= cy + rad; yy++)
      for (let xx = Math.floor(cx - rad); xx <= cx + rad; xx++) {
        const dx = (xx + 0.5 - cx) / rad, dy = (yy + 0.5 - cy) / rad, dz = (zz + 0.5 - cz) / rz;
        const hv = hash(xx, yy, zz, s);
        if (zz < z + 1 || dx * dx + dy * dy + dz * dz > 1 - hv * 0.28) continue;
        const li = 0.46 + 0.36 * dz + 0.16 * (dy - dx) + (hash(xx, yy, zz, s + 1) - 0.5) * 0.3;
        let col = pal[Math.max(0, Math.min(pal.length - 1, Math.floor(li * pal.length)))];
        if (o.bloom && hash(xx, yy, zz, s + 2) < (o.bp ?? 0.16)) col = o.bloom[Math.floor(hv * o.bloom.length)];
        v.set(xx, yy, zz, C(col, ROUGH));
      }
}
function palm(v: Vox, x: number, y: number, z: number, h: number, pal: Pal = LIME): void {
  for (let k = 0; k < h; k++) v.set(x + (k > h * 0.55 ? 1 : 0), y, z + k, C(k & 1 ? 0xa0825a : 0x8c6e48));
  const tx = x + 1, top = z + h;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]])
    for (let k = 1; k <= 3; k++) v.set(tx + dx * k, y + dy * k, top - (k < 3 ? 0 : 1), C(pal[1 + ((k + dx + 2) % 3)], ROUGH));
  v.set(tx, y, top, C(pal[3], ROUGH)); v.set(tx, y, top + 1, C(pal[2], ROUGH));
}
function bamboo(v: Vox, r: R, x: number, y: number, z: number, h: number): void {
  for (let k = 0; k < h; k++) v.set(x, y, z + k, C(k % 3 === 2 ? 0x6c9a34 : k & 1 ? 0x9cc84e : 0x8aba44));
  for (let k = Math.floor(h * 0.45); k <= h; k++)
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) if (r() < 0.42) v.set(x + dx, y + dy, z + k, rleaf(r, LIME));
  v.set(x, y, z + h, rleaf(r, LIME));
}
/** Loose planting on a flat surface: shrubs, some taller clumps, blossom. */
function shrubs(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z: number, dens = 0.7, pal: Pal = LEAF, bloom: Pal | undefined = BLOOM, bp = 0.1): void {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) if (r() < dens) {
      v.set(x, y, z, rleaf(r, pal, bloom, bp));
      if (r() < 0.25) v.set(x, y, z + 1, rleaf(r, pal, bloom, bp * 1.5));
    }
}
/** Climbers hanging down one face from zTop, in clumps of irregular length. */
function vines(v: Vox, r: R, face: Face, f: number, a0: number, a1: number, zTop: number, maxLen: number, dens = 0.65, pal: Pal = LEAF, bloom?: Pal): void {
  const ph = r() * 6;
  for (let a = a0; a < a1; a++) {
    if (r() >= dens) continue;
    const len = Math.max(1, Math.round(maxLen * (0.3 + 0.7 * r()) * (0.62 + 0.38 * Math.sin(a * 1.1 + ph))));
    for (let k = 1; k <= len; k++) put(v, face, f, a, a + 1, zTop - k, zTop - k + 1, rleaf(r, pal, bloom, 0.08));
  }
}
const drape = (v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, zTop: number, maxLen: number, dens = 0.65, pal: Pal = LEAF, bloom?: Pal) => {
  vines(v, r, 'L', y1 - 1, x0, x1, zTop, maxLen, dens, pal, bloom); vines(v, r, 'R', x1 - 1, y0, y1, zTop, maxLen, dens, pal, bloom);
};
interface LedgeO { slab?: number; pal?: Pal; bloom?: Pal; drip?: number; tall?: number }
/** Planted balcony projecting from a face (f = the plane just outside the wall): slab, shrubs, trailing tendrils. */
function ledge(v: Vox, r: R, face: Face, f: number, a0: number, a1: number, z: number, o: LedgeO = {}): void {
  const pal = o.pal ?? LEAF, bloom = o.bloom ?? BLOOM;
  for (let a = a0; a < a1; a++) {
    put(v, face, f, a, a + 1, z, z + 1, C(o.slab ?? WHITE[0]));
    if (r() < 0.92) put(v, face, f, a, a + 1, z + 1, z + 2, rleaf(r, pal, bloom, 0.12));
    if (r() < (o.tall ?? 0.3)) put(v, face, f, a, a + 1, z + 2, z + 3, rleaf(r, pal, bloom, 0.16));
    if (r() < (o.drip ?? 0.35)) for (let k = irand(r, 1, 3); k > 0; k--) put(v, face, f, a, a + 1, z - k, z - k + 1, rleaf(r, pal));
  }
}
interface GardenO { trees?: number; rad?: number; pal?: Pal; bloom?: Pal; dens?: number; deck?: boolean; tree?: TreeO }
/** Planting on the part of a roof that the next (smaller) volume [x0,ix1) x [y0,iy1) leaves exposed. */
function terrace(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, ix1: number, iy1: number, z: number, o: GardenO = {}): void {
  const pal = o.pal ?? LEAF, bloom = o.bloom ?? BLOOM;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (x < ix1 && y < iy1) continue;
      v.set(x, y, z - 1, o.deck ? C(DECK[(x + (y >> 1)) % 3]) : C(pick(r, LAWN), ROUGH));
      const rim = x === x1 - 1 || y === y1 - 1;
      if (r() < (rim ? 0.85 : o.dens ?? 0.4)) { v.set(x, y, z, rleaf(r, pal, bloom, 0.1)); if (r() < 0.25) v.set(x, y, z + 1, rleaf(r, pal, bloom, 0.14)); }
    }
  for (let i = 0; i < (o.trees ?? 0); i++) {
    const wl = y1 - iy1, wr = x1 - ix1;
    if (wl < 1 && wr < 1) break;
    const left = wr < 1 || (wl >= 1 && r() < 0.5);
    const x = left ? irand(r, x0 + 1, x1 - 2) : ix1 + (wr >> 1), y = left ? iy1 + (wl >> 1) : irand(r, y0 + 1, y1 - 2);
    tree(v, x, y, z, (o.rad ?? 1.8) * (0.85 + r() * 0.3), { pal, ...o.tree });
  }
}
/** Roof garden over a whole flat top. */
function roofGarden(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z: number, o: GardenO = {}): void {
  terrace(v, r, x0, y0, x1, y1, x0, y0, z, { ...o, trees: 0 });
  for (let i = 0; i < (o.trees ?? 0); i++)
    tree(v, irand(r, x0 + 1, Math.max(x0 + 1, x1 - 2)), irand(r, y0 + 1, Math.max(y0 + 1, y1 - 2)), z, (o.rad ?? 1.8) * (0.85 + r() * 0.3), { pal: o.pal ?? LEAF, ...o.tree });
}
function pool(v: Vox, x0: number, y0: number, x1: number, y1: number, z: number, rim?: number): void {
  if (rim != null) v.box(x0 - 1, y0 - 1, z, x1 + 1, y1 + 1, z + 1, C(rim));
  v.box(x0, y0, z, x1, y1, z + 1, waterTop);
}
function lilies(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const x = irand(r, x0, x1 - 1), y = irand(r, y0, y1 - 1);
    v.set(x, y, z, C(pick(r, [0x58a84a, 0x6cbc54, 0x4a9a4a]), ROUGH));
    if (r() < 0.4) v.set(x, y, z + 1, C(pick(r, PINK)));
  }
}
function foam(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z: number, p = 0.7): void {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (r() < p) v.set(x, y, z, C(r() < 0.6 ? FOAM : 0xbfeaf2, SMOOTH));
}
/** Waterfall on a face, with foam on the row in front of its foot and a mist emitter. */
function fall(v: Vox, r: R, face: Face, f: number, a0: number, a1: number, z0: number, z1: number, mist = true): void {
  put(v, face, f, a0, a1, z0, z1, fallC(irand(r, 0, 999)));
  for (let a = a0 - 1; a <= a1; a++) if (r() < 0.8) put(v, face, f + 1, a, a + 1, z0, z0 + 1, C(FOAM, SMOOTH));
  if (mist) { const m = (a0 + a1) / 2; if (face === 'L') v.emit(m, f + 1, z0 + 1, 'mist'); else v.emit(f + 1, m, z0 + 1, 'mist'); }
}
function lampPost(v: Vox, x: number, y: number, z: number, h = 2): void {
  v.box(x, y, z, x + 1, y + 1, z + h, C(0xe8e6e0)); v.set(x, y, z + h, C(LAMP, EMIT));
}

interface BodyO { style: number; wall: number[]; glass: number; lit?: number }
/**
 * A building volume with one of six skins on its visible faces:
 * 0 ribbon glazing between pale slabs, 1 punched windows, 2 fins over glass, 3 loggias with pot plants,
 * 4 thin strip windows in a solid wall, 5 staggered two-bay windows.
 */
function body(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z0: number, fl: number, o: BodyO): number {
  const H = z0 + fl * 3, lit = o.lit ?? 0.38, [w0, w1] = o.wall;
  const win = (k: number) => glassLit(r, o.glass, lit * k);
  v.box(x0, y0, z0, x1, y1, H, (_x, _y, z) => C((z - z0) % 3 === 0 ? w1 : w0));
  for (let f = 0; f < fl; f++) {
    const z = z0 + f * 3, k = pick(r, [0.25, 0.7, 1, 1.5]);
    const span = (face: Face, pf: number, a0: number, a1: number) => {
      if (o.style === 0) for (let a = a0; a < a1; a += 2) put(v, face, pf, a, Math.min(a + 2, a1), z + 1, z + 3, win(k));
      else if (o.style === 1) for (let a = a0 + 1; a < a1 - 1; a += 2) put(v, face, pf, a, a + 1, z + 1, z + 3, win(k));
      else if (o.style === 2) {
        let cur = win(k);
        for (let a = a0; a < a1; a++) {
          if ((a - a0) % 3 === 0) { put(v, face, pf, a, a + 1, z, z + 3, C(shade(w1, -0.1))); continue; }
          if ((a - a0) % 3 === 1) cur = win(k);
          put(v, face, pf, a, a + 1, z + 1, z + 3, cur);
        }
      } else if (o.style === 3) {
        put(v, face, pf, a0, a1, z, z + 1, C(shade(w0, 0.5)));
        for (let a = a0; a < a1; a++) {
          const m = (a - a0) % 4;
          if (m < 2) put(v, face, pf, a, a + 1, z + 1, z + 3, glassLit(r, shade(o.glass, -0.22), lit * k));
          else if (m === 2) put(v, face, pf, a, a + 1, z + 1, z + 3, C(shade(w1, -0.1)));
        }
        for (let a = a0; a < a1; a++) if (r() < 0.2) put(v, face, pf, a, a + 1, z, z + 1, rleaf(r, LEAF, BLOOM, 0.3));
      } else if (o.style === 4) {
        for (let a = a0 + 1; a < a1 - 1; a += 3) put(v, face, pf, a, Math.min(a + 3, a1 - 1), z + 1, z + 2, win(k));
      } else {
        for (let a = a0 + ((f & 1) ? 2 : 0); a < a1; a += 4) put(v, face, pf, a, Math.min(a + 2, a1), z + 1, z + 3, win(k));
      }
    };
    span('L', y1 - 1, x0, x1); span('R', x1 - 1, y0, y1);
  }
  return H;
}
/** Glazed ground floor with a doorway. */
function lobby(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, h = 3): void {
  faces(v, x0, y0, x1, y1, 0, h, (x, y) => C(0x6aa8a8, SMOOTH | ((x + y) % 3 ? WARM : 0)));
  const dx = irand(r, x0 + 1, Math.max(x0 + 1, x1 - 3));
  onL(v, y1 - 1, dx, dx + 2, 0, h - 1, C(0xb08a5c));
  v.box(x1 - 1, y1 - 1, 0, x1, y1, h, C(WHITE[0]));
}
interface CutO { wall: number[]; glass: number; pal?: Pal; inset?: number }
/** Open sky-garden storey: the floor is cut back to a glazed core on the visible sides, with columns, planting and trees. */
function skyGarden(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z: number, h: number, o: CutO): void {
  const ins = o.inset ?? Math.max(2, (x1 - x0) >> 2), cx1 = x1 - ins, cy1 = y1 - ins, pal = o.pal ?? LEAF, s = irand(r, 0, 999);
  v.box(x0, y0, z, x1, y1, z + h, 0);
  v.box(x0, y0, z, cx1, cy1, z + h, (x, y, zz) => C(shade(o.glass, -0.12), SMOOTH | (hash((x + y) >> 1, zz, s) < 0.6 ? WARM : 0)));
  v.box(x0, y0, z - 1, x1, y1, z, C(o.wall[0]));
  const cols: [number, number][] = [[x1 - 1, y1 - 1], [x0, y1 - 1], [x1 - 1, y0]];
  if (x1 - x0 > 9) cols.push([(x0 + x1) >> 1, y1 - 1], [x1 - 1, (y0 + y1) >> 1]);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) if (x >= cx1 || y >= cy1) {
      if (r() < 0.8) v.set(x, y, z, rleaf(r, pal, BLOOM, 0.1));
      if (r() < 0.3) v.set(x, y, z + 1, rleaf(r, pal, BLOOM, 0.14));
    }
  if (h >= 5) {
    const rad = Math.min(ins * 0.7, (h - 2) / 2.3), n = Math.max(1, Math.round((x1 - x0) / 5));
    for (let i = 0; i < n; i++) {
      tree(v, x0 + 1 + Math.floor(((i + 0.5) * (x1 - x0 - 2)) / n), cy1 + (ins >> 1), z, rad, { pal, th: 1 });
      tree(v, cx1 + (ins >> 1), y0 + 1 + Math.floor(((i + 0.5) * (y1 - y0 - 2)) / n), z, rad, { pal, th: 1 });
    }
  }
  for (const [x, y] of cols) v.box(x, y, z, x + 1, y + 1, z + h, C(o.wall[0]));
  drape(v, r, x0, y0, x1, y1, z - 1, 5, 0.55, pal);
}
/** Garden bridge between two towers, running level across the screen (x falls as y rises). */
function skyBridge(v: Vox, r: R, xa: number, ya: number, n: number, z: number, w = 3, pal: Pal = LEAF, closed = true): number {
  for (let t = 0; t <= n; t++) {
    const cx = xa - t, cy = ya + t;
    v.box(cx, cy, z, cx + w, cy + w, z + 1, C(WHITE[0]));
    if (closed) {
      v.box(cx, cy, z + 1, cx + w, cy + w, z + 3, C(0x5aa8b4, SMOOTH | ((t & 1) ? WARM : 0)));
      v.box(cx, cy, z + 3, cx + w, cy + w, z + 4, C(WHITE[1]));
    }
  }
  const zt = z + (closed ? 4 : 1);
  for (let t = 0; t <= n; t++) {
    const cx = xa - t, cy = ya + t;
    for (let y = cy; y < cy + w; y++) for (let x = cx; x < cx + w; x++) if (r() < 0.7) v.set(x, y, zt, rleaf(r, pal, BLOOM, 0.12));
    if (t > 0 && t < n && t % 2 === 1) tree(v, cx + (w >> 1), cy + (w >> 1), zt, 1.5 + r() * 0.4, { pal, th: 1 });
  }
  return zt;
}
const roundSkin = (r: R, cx: number, cy: number, wall: number, glass: number, lit = 0.36): Col => {
  const s = irand(r, 0, 999);
  return (x, y, z) => {
    if (z % 3 === 0) return C(wall);
    const f = Math.floor(z / 3), a = Math.floor((Math.atan2(y + 0.5 - cy, x + 0.5 - cx) + 4) * 3);
    return C(glass, SMOOTH | (hash(a, f, s) < lit * (0.3 + hash(f, s) * 1.3) ? WARM : 0));
  };
};
/** Low timber house with a mono-pitch solar (or sedum) roof falling towards the front. Returns the ridge height. */
function ecoHouse(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z0: number, fl: number, wall: number[], green = false): number {
  const H = z0 + fl * 3 + 1, d = y1 - y0;
  v.box(x0, y0, z0, x1, y1, H, (_x, _y, z) => C(wall[z & 1]));
  for (let f = 0; f < fl; f++) {
    const z = z0 + f * 3 + 1;
    for (let a = x0 + 1; a < x1 - 1; a += 2) onL(v, y1 - 1, a, a + 1, z, z + 2, glassLit(r, 0x5a9aa8, 0.45));
    for (let b = y0 + 1; b < y1 - 1; b += 2) onR(v, x1 - 1, b, b + 1, z, z + 2, glassLit(r, 0x5a9aa8, 0.45));
  }
  onL(v, y1 - 1, x0 + 1, x0 + 2, z0, z0 + 3, C(0x9a7450));
  for (let y = y0; y <= y1; y++) {
    const rz = H + Math.floor(((y1 - y) * 3) / (d + 1));
    for (let x = x0; x < x1; x++) {
      for (let z = H; z < rz; z++) v.set(x, y, z, C(wall[z & 1]));
      v.set(x, y, rz, green ? rleaf(r, LIME, BLOOM, 0.08) : C((x - x0) % 3 === 2 || y === y1 ? 0xdfe6ea : (x + y) & 1 ? 0x3a5c94 : 0x44689f, SMOOTH));
    }
  }
  return H + 3;
}
function vegBeds(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z = 0, alongX = true): void {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const row = alongX ? y - y0 : x - x0;
      if (row % 2 === 1) { v.set(x, y, z, C(0xdccca4)); continue; }
      v.set(x, y, z, C(pick(r, [0x7a5a3c, 0x6e5034]), ROUGH));
      if (r() < 0.75) v.set(x, y, z + 1, r() < 0.16 ? C(pick(r, [0xe0523a, 0xf0a03a, 0xf4ecd0, 0xb85a8a]), ROUGH) : rleaf(r, row % 4 ? LIME : LEAF));
    }
}
/** Narrow gabled house with a sedum roof (ridge runs front to back, gable faces the viewer). */
function gableHouse(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z0: number, fl: number, wall: number[], pal: Pal): void {
  const H = z0 + fl * 3;
  v.box(x0, y0, z0, x1, y1, H, mixc(wall));
  for (let f = 0; f < fl; f++) {
    const z = z0 + f * 3 + 1;
    for (let a = x0 + 1; a < x1 - 1; a += 2) onL(v, y1 - 1, a, a + 1, z, z + 2, glassLit(r, 0x5a9aa8, 0.5));
    for (let b = y0 + 1; b < y1 - 1; b += 2) onR(v, x1 - 1, b, b + 1, z, z + 2, glassLit(r, 0x5a9aa8, 0.4));
  }
  onL(v, y1 - 1, x0 + 1, x0 + 2, z0, z0 + 2, C(pick(r, [0x9a7450, 0x4a8a8a, 0xc86a5a])));
  const top = gable(v, x0, y0, x1, y1, H, 'y', [pal[2], pal[3], pal[1]], mixc(wall), 0, ROUGH);
  if (x1 - x0 >= 4) v.set((x0 + x1) >> 1, y1 - 1, H, glassLit(r, 0x5a9aa8, 0.6));
  for (let y = y0; y < y1; y++) if (r() < 0.2) v.set((x0 + x1) >> 1, y, top - 1, C(pick(r, BLOOM), ROUGH));
}
/** Glass conservatory dome with white ribs; some panes show the planting inside. */
function dome(v: Vox, r: R, cx: number, cy: number, rx: number, rz: number, z0 = 0, ribs = 10, glass = 0x8fd4d8): void {
  const s = irand(r, 0, 999);
  for (let z = z0; z <= z0 + rz; z++)
    for (let y = Math.floor(cy - rx); y <= cy + rx; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / rx, dz = (z + 0.5 - z0) / rz;
        if (dx * dx + dy * dy + dz * dz > 1) continue;
        const an = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
        const rib = (z - z0) % 4 === 3 || Math.abs(Math.sin(an * ribs * 0.5)) < 0.16;
        const inside = hash(x >> 1, y >> 1, z >> 1, s) < 0.5 * (1 - dz);
        v.set(x, y, z, rib ? C(0xf6f8f6) : inside ? C(pick(r, [0x6fc08c, 0x58aa78, 0x86cc94]), SMOOTH | (hash(x, y, z, s) < 0.25 ? WARM : 0))
          : C(glass, SMOOTH | (hash(x >> 1, y >> 1, z, s + 1) < 0.28 ? WARM : 0)));
      }
}
/** Sculptural tree: slender trunk wrapped in climbers, flaring into a lattice canopy with a few lights. */
function superTree(v: Vox, r: R, cx: number, cy: number, z0: number, h: number, rad: number, branch = 0xf4f2ec, lights = true): void {
  const tr = Math.max(1, rad * 0.22), s = irand(r, 0, 999), ch = Math.round(rad * 1.25), pal = pick(r, [JUNGLE, LEAF]);
  for (let z = 0; z < h; z++) {
    const t = z / h, rr = tr * (1.25 - 0.4 * Math.sin(t * Math.PI));
    cyl(v, cx, cy, rr, z0 + z, z0 + z + 1, (x, y, zz) => (hash(x, y, zz, s) < 0.6 - t * 0.2 ? C(hash(x, y, zz, s + 1) < 0.1 ? PINK[Math.floor(hash(x, y, zz, s + 3) * 4)] : leafC(pal, hash(x, y, zz, s + 2)), ROUGH) : C(shade(branch, -0.1))));
  }
  const nb = Math.max(7, Math.round(rad * 1.9)); // ribs sweeping up and out, far enough apart to see through
  for (let i = 0; i < nb; i++) {
    const an = (i / nb) * TAU + 0.2;
    for (let t = 0; t <= 1; t += 0.025) {
      const rr = tr + (rad - tr) * Math.pow(t, 1.5), z = z0 + h - ch + ch * Math.pow(t, 0.85);
      v.set(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr, z, hash(i, Math.floor(t * 9), s) < 0.2 ? C(leafC(pal, hash(i, t * 30, s)), ROUGH) : C(branch));
    }
  }
  for (const q of [1, 0.6]) {
    const rr = rad * q, n = Math.ceil(rr * 8), z = z0 + h - ch + ch * Math.pow(Math.pow((rr - tr) / (rad - tr), 1 / 1.5), 0.85);
    for (let i = 0; i < n; i++) {
      const an = (i / n) * TAU;
      v.set(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr, z + (q === 1 ? 1 : 0), lights && q === 1 && i % 4 === 0 ? C(LAMP, EMIT) : C(shade(branch, -0.04)));
    }
  }
}

// ================================ small (1x1) ==================================
// The middle of this list is what a mature district is mostly made of (see world.ts), so low and tall types alternate there:
// eco cottage, tree pavilion, vertical farm, green-roof house, timber walk-up, terrace tower, slim sky-garden tower
const small: Maker[] = [
  (r, lvl) => { // eco cottage: timber boards, solar mono-pitch, kitchen garden
    const v = new Vox(T, T, 26);
    ecoHouse(v, r, 1, 0, 7, 5, 0, 1 + lvl, pick(r, [TIMB, WHITE, CREAM, SANDW]), r() < 0.3);
    vegBeds(v, r, 0, 6, 8, 8);
    if (r() < 0.5) tree(v, 7, 5, 0, 1.3, { pal: LIME, bloom: GOLD, bp: 0.2, th: 1 }); else { v.box(0, 5, 0, 1, 6, 2, C(0x7ab0c0)); v.set(0, 5, 2, C(0xdfe6ea)); }
    return v;
  },
  (r, lvl) => { // round glass pavilion, stepped like a cake, with a tree growing through its living roof
    const v = new Vox(T, T, 40);
    const fl = 1 + lvl, s = irand(r, 0, 999), pal = pick(r, PALS);
    for (let f = 0; f < fl; f++) {
      const z = f * 4, rad = 3.3 - f * 0.55;
      cyl(v, 4, 4, rad, z, z + 3, (x, y) => (Math.floor((Math.atan2(y - 3.5, x - 3.5) + 4) * 2.2) % 3 === 0 ? C(TIMB[1]) : C(0x6ab4bc, SMOOTH | (hash(x, y, f, s) < 0.6 ? WARM : 0))));
      cyl(v, 4, 4, rad + 0.7, z + 3, z + 4, C(WHITE[0]));
      for (let i = 0; i < 26; i++) {
        const an = (i / 26) * TAU, x = 4 + Math.cos(an) * (rad + 0.3), y = 4 + Math.sin(an) * (rad + 0.3);
        if (r() < (f === fl - 1 ? 0.8 : 0.45)) v.set(x, y, z + 4, rleaf(r, pal, BLOOM, 0.14));
        if (Math.cos(an) + Math.sin(an) > 0.2 && r() < 0.22) v.set(x, y, z + 3, rleaf(r, pal));
      }
    }
    tree(v, 4, 4, fl * 4, 2.3 + (lvl === 0 ? 0.3 : 0), { pal, bloom: r() < 0.5 ? PINK : undefined, th: 2 });
    return v;
  },
  (r, lvl) => { // vertical farm: crop trays behind glass, greenhouse on top
    const v = new Vox(T, T, 54);
    const fl = 4 + lvl * 2 + irand(r, 0, 1), H = fl * 3 + 3, s = irand(r, 0, 999);
    v.box(1, 1, 0, 7, 7, H, C(WHITE[0]));
    lobby(v, r, 1, 1, 7, 7);
    for (let f = 0; f < fl; f++) {
      const z = 3 + f * 3, pal = [LIME, LEAF, JUNGLE, LIME][f % 4], red = hash(f, s) < 0.13;
      faces(v, 1, 1, 7, 7, z + 1, z + 2, red ? mixc([0xb85a7a, 0x9a4a6a, 0xc87a8a], ROUGH, s + f) : leaf(pal, s + f));
      for (let a = 1; a < 7; a += 2) { onL(v, 6, a, a + 2, z + 2, z + 3, C(0xa4dcd8, SMOOTH | (r() < 0.34 ? (f % 3 ? WARM : WARM | COOL) : 0))); onR(v, 6, a, a + 2, z + 2, z + 3, C(0xa4dcd8, SMOOTH | (r() < 0.34 ? (f % 3 ? WARM : WARM | COOL) : 0))); }
    }
    for (let z = 3; z < H; z++) v.set(6, 6, z, C(WHITE[0]));
    if (r() < 0.55) {
      for (let k = 0; k < 3; k++) v.box(1 + k, 1, H + k, 7 - k, 7, H + k + 1, (x, y) => C(y === 6 || y === 3 ? 0xf6f8f6 : 0xa4dcd8, SMOOTH | (y === 6 ? 0 : WARM)));
      onL(v, 6, 3, 5, H, H + 2, leaf(LIME, s));
    } else {
      roofGarden(v, r, 1, 1, 7, 7, H + 1, { pal: LIME, dens: 0.5, trees: 1, rad: 1.6, tree: { pal: LIME, bloom: GOLD, bp: 0.2, th: 1 } });
      v.box(2, 2, H, 4, 4, H + 3, C(0x9ac8d0)); v.box(2, 2, H + 3, 4, 4, H + 4, C(0xdfe6ea));
    }
    if (r() < 0.6) { const f = irand(r, 1, fl - 1); ledge(v, r, r() < 0.5 ? 'L' : 'R', 7, 2, 6, 3 + f * 3, { pal: LIME, tall: 0.6 }); }
    return v;
  },
  (r, lvl) => { // white house under a barrel-vaulted meadow roof
    const v = new Vox(T, T, 30);
    const wall = pick(r, [WHITE, CREAM, BLUSH, CONC, SKY]), fl = 2 + lvl, H = fl * 3, s = irand(r, 0, 999), pal = pick(r, [LIME, LEAF, SAGE]);
    body(v, r, 1, 1, 7, 7, 0, fl, { style: 1, wall, glass: 0x5a9aa8, lit: 0.5 });
    onL(v, 6, 3, 4, 0, 3, C(pick(r, [0x9a7450, 0x4a8a8a, 0xc86a5a])));
    for (let y = 0; y < 8; y++) {
      const hh = Math.round(Math.sqrt(Math.max(0, 1 - ((y + 0.5 - 4) / 4.3) ** 2)) * 3.3);
      if (hh > 0) v.box(1, y, H, 7, y + 1, H + hh, leaf(pal, s, BLOOM, 0.1));
      if (hh > 1 && y > 0 && y < 7) onR(v, 6, y, y + 1, H, H + hh - 1, C(wall[0]));
    }
    v.set(6, 3, H, C(0x5a9aa8, SMOOTH | WARM)); v.set(6, 4, H, C(0x5a9aa8, SMOOTH | WARM));
    vines(v, r, 'L', 6, 1, 7, H + 1, 2 + lvl, 0.5, pal, BLOOM);
    if (r() < 0.6) ledge(v, r, 'L', 7, 4, 7, 3, { drip: 0.2, tall: 0.1 });
    return v;
  },
  (r, lvl) => { // timber-and-glass walk-up with planted balconies
    const v = new Vox(T, T, 48);
    const fl = 4 + lvl * 2 + irand(r, 0, 1), pal = pick(r, PALS);
    const H = body(v, r, 1, 1, 7, 7, 0, fl, { style: 2, wall: pick(r, [TIMB, TIMB, SANDW, WHITE]), glass: pick(r, GLASS) });
    lobby(v, r, 1, 1, 7, 7);
    for (let f = 1; f < fl; f++) if (r() < 0.6) { const a = irand(r, 1, 4); ledge(v, r, f & 1 ? 'L' : 'R', 7, a, a + irand(r, 2, 3), f * 3, { pal, slab: TIMB[0] }); }
    v.box(1, 1, H, 7, 7, H + 1, C(WHITE[0]));
    roofGarden(v, r, 1, 1, 7, 7, H + 1, { trees: 1, rad: 1.7, pal, tree: { th: 1 } });
    return v;
  },
  (r, lvl) => { // white terrace tower with a planter on every balcony
    const v = new Vox(T, T, 70);
    const wall = pick(r, SHELLS), fl = 6 + lvl * 3 + irand(r, 0, 2), pal = pick(r, PALS);
    const H = body(v, r, 1, 1, 7, 7, 0, fl, { style: pick(r, [1, 3, 4, 0, 3, 5]), wall, glass: pick(r, GLASS) });
    lobby(v, r, 1, 1, 7, 7);
    for (let f = 1; f < fl; f++) if (r() < 0.8) { const a = irand(r, 1, 4); ledge(v, r, f & 1 ? 'L' : 'R', 7, a, a + irand(r, 2, 3), f * 3, { pal }); }
    v.box(1, 1, H, 7, 7, H + 1, C(wall[0]));
    roofGarden(v, r, 1, 1, 7, 7, H + 1, { trees: 1 + (lvl > 0 ? 1 : 0), rad: 1.7, pal, tree: { th: 1 } });
    drape(v, r, 1, 1, 7, 7, H + 1, 4 + lvl * 2, 0.5, pal);
    return v;
  },
  (r, lvl) => { // slim glass tower with a sky-garden cut
    const v = new Vox(T, T, 90);
    const fl = 9 + lvl * 4 + irand(r, 0, 2), g = pick(r, GLASS), wall = pick(r, [WHITE, CONC, CREAM]), pal = pick(r, PALS);
    const H = body(v, r, 1, 1, 7, 7, 0, fl, { style: pick(r, [0, 0, 2, 4]), wall, glass: g, lit: 0.34 });
    lobby(v, r, 1, 1, 7, 7);
    skyGarden(v, r, 1, 1, 7, 7, Math.round(fl * (0.45 + r() * 0.25)) * 3, 5, { wall, glass: g, pal });
    const k = irand(r, 0, 2);
    v.box(1, 1, H, 7, 7, H + 1, C(wall[0]));
    if (k === 0) { for (let i = 0; i < 5; i++) v.box(1, 1, H + 1 + i, 7 - i, 7, H + 2 + i, C(lerpc(g, 0xffffff, 0.35), SMOOTH)); drape(v, r, 1, 1, 7, 7, H + 1, 3, 0.4, pal); }
    else if (k === 1) roofGarden(v, r, 1, 1, 7, 7, H + 1, { trees: 2, rad: 1.9, pal, tree: { th: 1 } });
    else {
      roofGarden(v, r, 1, 1, 7, 7, H + 1, { pal, dens: 0.6 });
      for (const [x, y] of [[1, 1], [6, 1], [1, 6], [6, 6]]) v.box(x, y, H + 1, x + 1, y + 1, H + 5, C(WHITE[0]));
      for (const y of [1, 3, 6]) v.box(1, y, H + 5, 7, y + 1, H + 6, C(TIMB[0])); vines(v, r, 'L', 6, 1, 7, H + 5, 3, 0.6, pal, BLOOM);
    }
    return v;
  },
];

// ================================ large (2x2) ==================================
// eco housing -> canal houses -> market under a living roof -> hanging-garden ziggurat -> timber courtyard block
// -> waterfall tower -> round spiral tower -> vertical forest -> twin towers with garden bridges -> stacked garden boxes
const large: Maker[] = [
  (r, lvl) => { // eco-housing cluster around a kitchen garden
    const v = new Vox(16, 16, 34);
    const walls = [TIMB, WHITE, CREAM, SANDW];
    ecoHouse(v, r, 1, 0, 8, 5, 0, 1 + lvl, pick(r, walls), r() < 0.25);
    ecoHouse(v, r, 9, 1, 15, 6, 0, 1 + Math.max(0, lvl - irand(r, 0, 1)), pick(r, walls), r() < 0.25);
    ecoHouse(v, r, 0, 9, 5, 14, 0, 1 + (lvl >> 1), pick(r, walls), r() < 0.4);
    vegBeds(v, r, 6, 8, 12, 15, 0, r() < 0.5);
    // little greenhouse
    v.box(13, 9, 0, 16, 14, 2, C(0xa4dcd8, SMOOTH | WARM)); v.box(13, 9, 2, 16, 14, 3, (x) => C(x === 14 ? 0xf6f8f6 : 0xb4e4e0, SMOOTH)); onL(v, 13, 13, 16, 0, 1, leaf(LIME, 3));
    tree(v, 13, 7, 0, 1.5, { pal: LIME, bloom: GOLD, bp: 0.22, th: 2 }); tree(v, 2, 6, 0, 1.4, { pal: LEAF, bloom: [0xe0523a], bp: 0.18, th: 2 });
    v.box(5, 14, 0, 6, 15, 3, C(0x7ab0c0)); // rain barrel
    return v;
  },
  (r, lvl) => { // canal houses with sedum roofs
    const v = new Vox(16, 16, 40);
    v.box(0, 0, 0, 16, 6, 2, mixc(STONE));
    v.box(0, 6, 0, 16, 11, 1, waterTop);
    v.box(0, 11, 0, 16, 16, 1, lawn(irand(r, 0, 99), 0.1));
    for (let a = 0; a < 16; a++) v.set(a, 11, 0, C(STONE[a & 1]));
    let x = 0;
    const cols = [WHITE, CREAM, BLUSH, SKY, SANDW, CONC];
    for (let i = 0; x < 15; i++) {
      const w = x > 10 ? 16 - x : irand(r, 4, 5), x1 = Math.min(16, x + w);
      gableHouse(v, r, x, 0, x1, 5, 2, 2 + lvl + irand(r, 0, 1), cols[(i * 2 + irand(r, 0, 5)) % 6], pick(r, [LEAF, LIME, SAGE]));
      x = x1;
    }
    for (let a = 0; a < 16; a++) if (r() < 0.3) v.set(a, 5, 2, rleaf(r, LEAF, BLOOM, 0.6));
    const bx = irand(r, 9, 12); // footbridge
    v.box(bx, 5, 2, bx + 2, 12, 3, C(DECK[0])); v.box(bx, 11, 1, bx + 2, 13, 2, C(DECK[1]));
    for (const y of [6, 10]) { v.set(bx, y, 3, C(WHITE[0])); v.set(bx + 1, y, 3, C(WHITE[0])); }
    const b0 = irand(r, 2, 5); // boat
    v.box(b0, 8, 1, b0 + 4, 9, 2, C(pick(r, [0xc86a5a, 0x4a8a8a, 0xf0e8d8]))); v.set(b0 + 1, 8, 2, C(0xf4ecd0));
    lilies(v, r, 0, 6, 16, 11, 0, 5);
    shrubs(v, r, 0, 14, 16, 16, 1, 0.5, LEAF, BLOOM, 0.3);
    tree(v, 2, 13, 1, 1.9, { pal: SAGE, th: 2 }); tree(v, 14, 13, 1, 1.6, { pal: LEAF, bloom: PINK, bp: 0.3, th: 2 });
    lampPost(v, 7, 11, 1);
    return v;
  },
  (r, lvl) => { // market under an undulating living roof
    const v = new Vox(16, 16, 44);
    const h0 = 5 + lvl * 2, ph = r() * 6, s = irand(r, 0, 999), pal = pick(r, [LIME, LEAF]);
    const zAt = (x: number, y: number) => h0 + Math.round(1.5 * Math.sin(x * 0.55 + ph) + 1.3 * Math.cos(y * 0.5 + ph * 0.7) + 1.5);
    v.box(0, 0, 0, 16, 16, 1, (x, y) => C(DECK[(x + (y >> 2)) % 3]));
    for (const [x, y] of [[2, 2], [2, 8], [2, 13], [8, 2], [8, 13], [13, 2], [13, 8], [13, 13], [8, 8]]) {
      const zt = zAt(x, y);
      v.box(x, y, 1, x + 1, y + 1, zt, C(TIMB[1]));
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) v.set(x + dx, y + dy, zt - 1, C(TIMB[0]));
    }
    for (const [a, face] of [[1, 'L'], [6, 'L'], [11, 'L'], [1, 'R'], [6, 'R']] as const) { // stalls along the open fronts
      const aw = pick(r, [0xe8785a, 0x58a8a8, 0xf0c050, 0xf4f0e6, 0xd8709a]);
      if (face === 'L') { v.box(a, 12, 1, a + 4, 14, 3, C(TIMB[0])); for (let x = a; x < a + 4; x++) { v.set(x, 14, 1, C(pick(r, [0xe0523a, 0xf0a03a, 0x8cc85c, 0xf4d04a]), ROUGH)); v.set(x, 14, 4, C((x - a) & 1 ? aw : 0xf8f4ea)); v.set(x, 13, 4, C(aw)); } v.set(a + 1, 14, 3, C(LAMP, EMIT)); }
      else { v.box(12, a, 1, 14, a + 4, 3, C(TIMB[0])); for (let y = a; y < a + 4; y++) { v.set(14, y, 1, C(pick(r, [0xe0523a, 0xf0a03a, 0x8cc85c, 0xf4d04a]), ROUGH)); v.set(14, y, 4, C((y - a) & 1 ? aw : 0xf8f4ea)); v.set(13, y, 4, C(aw)); } v.set(14, a + 2, 3, C(LAMP, EMIT)); }
    }
    const hole = lvl > 0;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        if (((x - 7.5) / 8.2) ** 4 + ((y - 7.5) / 8.2) ** 4 > 1) continue;
        const d = Math.hypot(x - 7.5, y - 7.5), z = zAt(x, y);
        if (hole && d < 2.6) continue;
        const sky = Math.hypot(x - 4, y - 11.5) < 1.6 || Math.hypot(x - 11.5, y - 4) < 1.6;
        const rim = ((x - 7.5) / 8.2) ** 4 + ((y - 7.5) / 8.2) ** 4 > 0.7;
        v.set(x, y, z - 1, rim ? C(WHITE[0]) : C(TIMB[(x + y) & 1]));
        v.set(x, y, z, sky ? C(0xa4dcd8, SMOOTH | WARM) : hole && d < 3.5 ? C(WHITE[0]) : leaf(pal, s, BLOOM, 0.03)(x, y, z));
        if (!sky && !rim && hash(x, y, s) < 0.1 && d >= 3.5) v.set(x, y, z + 1, leaf(pal, s + 1, BLOOM, 0.2)(x, y, z));
      }
    if (hole) tree(v, 8, 8, 1, 3.4 + lvl * 0.5, { pal: pick(r, [LEAF, JUNGLE]), th: h0 + 4, bloom: lvl > 1 ? PINK : undefined });
    return v;
  },
  (r, lvl) => { // hanging-garden ziggurat
    const v = new Vox(16, 16, 80);
    const n = 3 + lvl * 2, wall = pick(r, SHELLS), g = pick(r, GLASS), pal = pick(r, [LEAF, JUNGLE, LIME]), st = pick(r, [[3, 0], [1, 4], [5, 0], [3, 4]]);
    let x1 = 15, y1 = 15, z = 0;
    for (let i = 0; i < n; i++) {
      body(v, r, 1, 1, x1, y1, z, 2, { style: st[i & 1], wall, glass: g });
      if (i === 0) lobby(v, r, 1, 1, x1, y1);
      z += 6;
      const nx = i === n - 1 ? 1 : Math.max(5, x1 - irand(r, 1, 2)), ny = i === n - 1 ? 1 : Math.max(5, y1 - irand(r, 1, 2));
      terrace(v, r, 1, 1, x1, y1, nx, ny, z, { pal, trees: i === n - 1 ? 2 : r() < 0.7 ? 1 : 0, rad: i === n - 1 ? 2 : 1.4, dens: 0.7, tree: { th: 1, bloom: r() < 0.3 ? PINK : undefined } });
      drape(v, r, 1, 1, x1, y1, z, 3, 0.45, pal, BLOOM);
      x1 = nx; y1 = ny;
    }
    return v;
  },
  (r, lvl) => { // timber-and-glass courtyard block
    const v = new Vox(16, 16, 64);
    const fl = 4 + lvl * 3 + irand(r, 0, 1), fl2 = Math.max(3, fl - irand(r, 1, 3)), g = pick(r, GLASS), pal = pick(r, PALS);
    v.box(6, 6, 0, 16, 16, 1, lawn(irand(r, 0, 99), 0.08));
    const H = body(v, r, 1, 1, 15, 7, 0, fl, { style: 2, wall: TIMB, glass: g });
    const H2 = body(v, r, 1, 7, 7, 15, 0, fl2, { style: 3, wall: pick(r, [WHITE, CREAM]), glass: g });
    lobby(v, r, 1, 1, 15, 7); lobby(v, r, 1, 7, 7, 15);
    for (let f = 2; f < fl; f += 2) { const a = irand(r, 7, 11); ledge(v, r, 'L', 7, a, a + irand(r, 2, 4), f * 3, { pal, slab: WHITE[0] }); }
    for (let f = 1; f < fl; f += 2) { const b = irand(r, 1, 3); ledge(v, r, 'R', 15, b, b + irand(r, 2, 3), f * 3, { pal, slab: WHITE[0] }); }
    v.box(1, 1, H, 15, 7, H + 1, C(WHITE[0])); v.box(1, 7, H2, 7, 15, H2 + 1, C(WHITE[0]));
    roofGarden(v, r, 1, 1, 15, 7, H + 1, { trees: 2 + lvl, rad: 1.9, pal });
    roofGarden(v, r, 1, 7, 7, 15, H2 + 1, { trees: 1, rad: 1.8, pal, deck: true, dens: 0.3 });
    drape(v, r, 1, 7, 7, 15, H2 + 1, 5, 0.55, pal);
    pool(v, 10, 10, 14, 13, 0, STONE[0]); lilies(v, r, 10, 10, 14, 13, 0, 3);
    tree(v, 9, 13, 1, 2.6, { pal: pick(r, [LEAF, SAGE]), bloom: r() < 0.4 ? PINK : undefined, bp: 0.3, th: 3 });
    shrubs(v, r, 7, 7, 16, 9, 1, 0.5, pal); lampPost(v, 14, 14, 1);
    return v;
  },
  (r, lvl) => { // tower with a waterfall pouring down a slot in its front
    const v = new Vox(16, 16, 124);
    const wall = pick(r, SHELLS), g = pick(r, GLASS), fl = [9, 15, 26][lvl] + irand(r, 0, 3), pal = pick(r, [JUNGLE, LEAF]);
    const H = body(v, r, 2, 1, 14, 13, 0, fl, { style: pick(r, [0, 1, 4, 4, 0, 5]), wall, glass: g });
    lobby(v, r, 2, 1, 14, 13);
    for (let f = 2; f < fl; f++) if (r() < 0.5) { const b = irand(r, 1, 8); ledge(v, r, 'R', 14, b, b + irand(r, 2, 4), f * 3, { pal }); }
    for (let f = 2; f < fl; f++) if (r() < 0.4) { const a = r() < 0.5 ? 2 : 11; ledge(v, r, 'L', 13, a, a + 3, f * 3, { pal }); }
    v.box(2, 1, H, 14, 13, H + 1, C(wall[0]));
    roofGarden(v, r, 2, 1, 14, 13, H + 1, { trees: 3, rad: 2.1, pal });
    const a0 = 6 + irand(r, 0, 1), a1 = a0 + 3;
    pool(v, a0 - 1, 8, a1 + 1, 12, H, STONE[0]);
    v.box(a0, 12, 2, a1, 13, H + 1, 0); v.box(a0, 11, 2, a1, 12, H + 1, fallC(irand(r, 0, 999)));
    vines(v, r, 'L', 12, a0 - 2, a0, H + 1, 16 + lvl * 8, 0.95, pal, BLOOM); vines(v, r, 'L', 12, a1, a1 + 2, H + 1, 16 + lvl * 8, 0.95, pal, BLOOM);
    for (let z = 8; z < H - 6; z += irand(r, 7, 12)) { const sd = r() < 0.5 ? a0 - 1 : a1; v.set(sd, 12, z, rleaf(r, pal)); v.set(sd, 13, z, rleaf(r, pal, BLOOM, 0.3)); v.set(sd, 13, z + 1, rleaf(r, pal)); }
    v.box(a0 - 2, 13, 0, a1 + 2, 16, 2, C(STONE[1])); v.box(a0 - 1, 12, 1, a1 + 1, 15, 2, waterTop); v.box(a0, 12, 0, a1, 13, 2, waterTop);
    foam(v, r, a0 - 1, 12, a1 + 1, 14, 2, 0.6); v.emit((a0 + a1) / 2, 13, 3, 'mist');
    shrubs(v, r, 2, 13, a0 - 2, 15, 0, 0.7, pal); shrubs(v, r, a1 + 2, 13, 14, 15, 0, 0.7, pal);
    return v;
  },
  (r, lvl) => { // round tower with two planted ramps spiralling up it
    const v = new Vox(16, 16, 136);
    const fl = [10, 16, 27][lvl] + irand(r, 0, 3), H = fl * 3, wall = pick(r, [WHITE[0], CREAM[0], CONC[0], SANDW[0]]), g = pick(r, GLASS);
    const R0 = 5.6, pitch = (r() < 0.5 ? 1 : -1) * (0.1 + r() * 0.05), ph = r() * 6, pal = pick(r, PALS);
    cyl(v, 8, 8, R0, 0, H, roundSkin(r, 8, 8, wall, g));
    cyl(v, 8, 8, R0, 0, 3, (x, y) => C(0x6aa8a8, SMOOTH | ((x + y) % 3 ? WARM : 0)));
    for (let z = 3; z < H; z++) {
      const a0 = z * pitch + ph;
      for (let i = 0; i < 72; i++) {
        const an = (i / 72) * TAU, d = (((an - a0) % Math.PI) + Math.PI) % Math.PI;
        if (d > 0.62) continue;
        const x = 8 + Math.cos(an) * (R0 + 0.8), y = 8 + Math.sin(an) * (R0 + 0.8);
        v.set(x, y, z, z % 3 === 0 ? C(wall) : rleaf(r, pal, BLOOM, 0.07));
        if (d < 0.2 && z % 3 === 1 && r() < 0.5) v.set(8 + Math.cos(an) * (R0 + 1.7), 8 + Math.sin(an) * (R0 + 1.7), z, rleaf(r, pal, BLOOM, 0.2));
      }
    }
    cyl(v, 8, 8, R0 + 1, H, H + 1, C(wall));
    for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) if (Math.hypot(x - 7.5, y - 7.5) < R0 + 0.8 && r() < 0.75) v.set(x, y, H + 1, rleaf(r, pal, BLOOM, 0.1));
    tree(v, 8, 8, H + 1, 2.6, { pal }); tree(v, 5, 10, H + 1, 1.7, { pal }); tree(v, 10, 5, H + 1, 1.7, { pal, bloom: PINK, bp: 0.25 });
    return v;
  },
  (r, lvl) => { // vertical forest: stepped white tower, a tree on every balcony
    const v = new Vox(16, 16, 150);
    const wall = pick(r, SHELLS), g = pick(r, GLASS), fl = [12, 19, 30][lvl] + irand(r, 0, 3), pal = pick(r, [LEAF, JUNGLE, SAGE]);
    const f1 = Math.round(fl * 0.62), st = pick(r, [0, 3, 1, 4, 3]);
    const H1 = body(v, r, 2, 2, 14, 14, 0, f1, { style: st, wall, glass: g });
    lobby(v, r, 2, 2, 14, 14);
    v.box(2, 2, H1, 14, 14, H1 + 1, C(wall[0]));
    terrace(v, r, 2, 2, 14, 14, 12, 12, H1 + 1, { pal, trees: 3, rad: 1.6, dens: 0.8, tree: { th: 1 } });
    const H = body(v, r, 2, 2, 12, 12, H1 + 1, fl - f1, { style: st, wall, glass: g });
    const bal = (x1: number, f0: number, f1_: number, zb: number) => {
      for (let f = f0; f < f1_; f++) for (const face of ['L', 'R'] as const) {
        if (r() < 0.2) continue;
        const a = irand(r, 2, x1 - 4), len = irand(r, 2, 4), z = zb + f * 3;
        ledge(v, r, face, x1, a, Math.min(x1, a + len), z, { pal, tall: 0.5 });
        if (r() < 0.35) { const t = a + (len >> 1); if (face === 'L') tree(v, t, x1, z + 1, 1.3, { pal, th: 1 }); else tree(v, x1, t, z + 1, 1.3, { pal, th: 1 }); }
      }
    };
    bal(14, 2, f1, 0); bal(12, 1, fl - f1, H1 + 1);
    skyGarden(v, r, 2, 2, 14, 14, Math.round(f1 * 0.5) * 3, 6, { wall, glass: g, pal });
    v.box(2, 2, H, 12, 12, H + 1, C(wall[0]));
    roofGarden(v, r, 2, 2, 12, 12, H + 1, { trees: 4, rad: 2.2, pal, dens: 0.7 });
    drape(v, r, 2, 2, 12, 12, H + 1, 6, 0.6, pal);
    return v;
  },
  (r, lvl) => { // twin towers joined by garden bridges
    const v = new Vox(16, 16, 136);
    const wall = pick(r, SHELLS), g = pick(r, GLASS), pal = pick(r, PALS);
    const fa = [11, 17, 27][lvl] + irand(r, 0, 3), fb = fa - irand(r, 2, 5);
    v.box(1, 1, 0, 15, 15, 4, mixc(wall)); lobby(v, r, 1, 1, 15, 15, 3);
    roofGarden(v, r, 1, 1, 15, 15, 4, { pal, dens: 0.5 });
    tree(v, 11, 11, 4, 2.2, { pal, bloom: r() < 0.5 ? PINK : undefined, th: 2 }); tree(v, 13, 9, 4, 1.4, { pal }); tree(v, 8, 13, 4, 1.5, { pal });
    const HA = body(v, r, 9, 1, 15, 7, 4, fa, { style: pick(r, [0, 4, 2]), wall, glass: g });
    const HB = body(v, r, 1, 9, 7, 15, 4, fb, { style: pick(r, [1, 3, 5]), wall, glass: g });
    for (const [x0, y0, fl] of [[9, 1, fa], [1, 9, fb]]) for (let f = 2; f < fl; f++) if (r() < 0.45) {
      const L = r() < 0.5, a = irand(r, 0, 3);
      if (L) ledge(v, r, 'L', y0 + 6, x0 + a, x0 + a + irand(r, 2, 3), 4 + f * 3, { pal }); else ledge(v, r, 'R', x0 + 6, y0 + a, y0 + a + irand(r, 2, 3), 4 + f * 3, { pal });
    }
    const zs = lvl === 0 ? [0.6] : lvl === 1 ? [0.38, 0.78] : [0.3, 0.58, 0.86];
    for (const q of zs) skyBridge(v, r, 8, 5, 4, 4 + Math.round((fb * q)) * 3, 3, pal);
    for (const [x0, y0, Ht] of [[9, 1, HA], [1, 9, HB]]) {
      v.box(x0, y0, Ht, x0 + 6, y0 + 6, Ht + 1, C(wall[0]));
      roofGarden(v, r, x0, y0, x0 + 6, y0 + 6, Ht + 1, { trees: 2, rad: 1.8, pal, tree: { th: 1 } });
      drape(v, r, x0, y0, x0 + 6, y0 + 6, Ht + 1, 5, 0.5, pal);
    }
    return v;
  },
  (r, lvl) => { // stacked, shifted boxes with a garden on every exposed roof
    const v = new Vox(16, 16, 110);
    const n = lvl === 2 ? 5 : 2 + lvl, g = pick(r, GLASS), pal = pick(r, PALS);
    const offs: [number, number][] = [[3, 0], [0, 3], [3, 3], [1, 1], [0, 0]];
    let z = 0;
    const k = irand(r, 0, 4);
    for (let i = 0; i < n; i++) {
      const [ox, oy] = i === 0 ? [1, 1] : offs[(k + i * 2) % 5], x0 = 1 + ox, y0 = 1 + oy, fl = irand(r, 3, 4) + (lvl === 2 && i < 2 ? 1 : 0);
      const wall = i & 1 ? TIMB : pick(r, SHELLS);
      const H = body(v, r, x0, y0, x0 + 11, y0 + 11, z, fl, { style: i & 1 ? 2 : pick(r, [0, 3, 4, 1]), wall, glass: g });
      if (i === 0) lobby(v, r, x0, y0, x0 + 11, y0 + 11);
      v.box(x0, y0, H, x0 + 11, y0 + 11, H + 1, C(WHITE[0]));
      roofGarden(v, r, x0, y0, x0 + 11, y0 + 11, H + 1, { pal, dens: 0.55, trees: i === n - 1 ? 3 : 0, rad: 2.1 });
      for (const [tx, ty] of [[x0 + 9, y0 + 9], [x0 + 9, y0 + 3], [x0 + 3, y0 + 9]]) if (i < n - 1 && r() < 0.8) tree(v, tx, ty, H + 1, 1.6, { pal, th: 1, bloom: r() < 0.25 ? PINK : undefined });
      drape(v, r, x0, y0, x0 + 11, y0 + 11, H + 1, 4, 0.5, pal, BLOOM);
      z = H + 1;
    }
    return v;
  },
];

// ================================ huge (3x3) ===================================
// conservatory domes -> floating-garden reservoir -> green mountain -> garden-void megablock
const huge: Maker[] = [
  (r, lvl) => { // conservatory: two glass domes in a flower garden
    const v = new Vox(24, 24, 50);
    v.box(0, 0, 0, 24, 24, 1, lawn(irand(r, 0, 99), 0.1));
    cyl(v, 9.5, 9.5, 9.6, 0, 2, mixc(STONE)); dome(v, r, 9.5, 9.5, 8.8, 13 + lvl * 3, 2, 12);
    cyl(v, 19, 6, 5, 0, 2, mixc(STONE)); dome(v, r, 19, 6, 4.5, 7 + lvl, 2, 8, 0x9cdccc);
    onL(v, 18, 8, 11, 2, 5, C(0x6aa8a8, SMOOTH | WARM)); onL(v, 18, 7, 12, 5, 6, C(WHITE[0]));
    pool(v, 3, 19, 11, 23, 0, STONE[0]); lilies(v, r, 3, 19, 11, 23, 0, 7);
    v.box(6, 20, 1, 8, 22, 2, C(STONE[2])); v.box(7, 21, 2, 8, 22, 5, C(FOAM, SMOOTH)); v.emit(7, 21, 6, 'mist');
    shrubs(v, r, 12, 19, 24, 24, 1, 0.55, LEAF, BLOOM, 0.4); shrubs(v, r, 18, 11, 24, 19, 1, 0.5, LIME, BLOOM, 0.4);
    palm(v, 15, 20, 1, 8); palm(v, 20, 16, 1, 7); palm(v, 22, 21, 1, 6); tree(v, 1, 17, 1, 1.8, { pal: SAGE });
    for (const [x, y] of [[12, 22], [22, 12], [17, 17]]) lampPost(v, x, y, 1);
    return v;
  },
  (r, lvl) => { // floating-garden reservoir
    const v = new Vox(24, 24, 60);
    v.box(0, 0, 0, 24, 24, 2, mixc(STONE)); v.box(1, 1, 1, 23, 23, 2, 0); v.box(1, 1, 0, 23, 23, 1, waterTop);
    const isl: [number, number, number][] = [[6, 6, 4.2], [16, 7, 3.2], [7, 17, 3], [17, 17, 3.8], [12, 12, 2.2]];
    for (const [i, [cx, cy, rad]] of isl.entries()) {
      const pal = PALS[(i + irand(r, 0, 3)) % 4];
      cyl(v, cx, cy, rad, 1, 2, lawn(i * 7, 0.12)); cyl(v, cx, cy, rad + 0.6, 0, 1, C(0xbfeaf2, SMOOTH)); cyl(v, cx, cy, rad, 0, 1, C(STONE[1]));
      for (let k = 0; k < rad * 5; k++) { const an = r() * TAU, d = r() * (rad - 0.6); v.set(cx + Math.cos(an) * d, cy + Math.sin(an) * d, 2, rleaf(r, pal, BLOOM, 0.12)); }
      if (i === 0) superTree(v, r, cx, cy, 2, 22 + lvl * 8, 5.5);
      else if (i === 3) { v.box(15, 15, 2, 19, 19, 3, C(DECK[0])); for (const [x, y] of [[15, 15], [18, 15], [15, 18], [18, 18]]) v.box(x, y, 3, x + 1, y + 1, 6, C(TIMB[1])); v.box(14, 14, 6, 20, 20, 7, leaf(LIME, 5, BLOOM, 0.1)); v.box(15, 15, 7, 19, 19, 8, leaf(LIME, 6, BLOOM, 0.15)); v.set(17, 18, 5, C(LAMP, EMIT)); }
      else if (i === 4) { v.box(12, 12, 2, 13, 13, 9 + lvl * 2, C(FOAM, SMOOTH)); v.set(12, 12, 9 + lvl * 2, C(0xbfeaf2, SMOOTH)); foam(v, r, 10, 10, 15, 15, 2, 0.25); v.emit(12, 12, 10 + lvl * 2, 'mist'); }
      else tree(v, Math.floor(cx), Math.floor(cy), 2, rad * 0.75, { pal, bloom: i === 2 ? PINK : undefined, bp: 0.3 });
    }
    for (let t = 0; t < 22; t++) { const x = 1 + t, y = Math.round(12 + Math.sin(t * 0.45) * 2.2); if (v.get(x, y, 1) === 0) { v.set(x, y, 1, C(DECK[t % 3])); v.set(x, y + 1, 1, C(DECK[(t + 1) % 3])); } } // boardwalk
    lilies(v, r, 1, 1, 23, 23, 1, 26);
    for (const [x, y] of [[0, 0], [23, 0], [0, 23], [23, 23], [12, 23], [23, 12]]) lampPost(v, x, y, 2);
    shrubs(v, r, 0, 0, 24, 1, 2, 0.6, LEAF); shrubs(v, r, 0, 0, 1, 24, 2, 0.6, LEAF);
    return v;
  },
  (r, lvl) => { // green mountain: terraced housing with a cascade tumbling down its front
    const v = new Vox(24, 24, 100);
    const wall = pick(r, [WHITE, CREAM, SANDW]), g = pick(r, GLASS), pal = pick(r, [LEAF, JUNGLE]), n = 6 + lvl * 2, s = irand(r, 0, 999);
    const c0 = 9 + irand(r, 0, 3), c1 = c0 + 3;
    let x1 = 23, y1 = 23, z = 0;
    for (let i = 0; i < n; i++) {
      body(v, r, 1, 1, x1, y1, z, 2, { style: i % 3 === 1 ? 0 : 3, wall, glass: g });
      if (i === 0) lobby(v, r, 1, 1, x1, y1);
      onL(v, y1 - 1, c0, c1, z, z + 6, fallC(s + i));
      z += 6;
      const last = i === n - 1, nx = last ? 1 : Math.max(7, x1 - irand(r, 1, 3)), ny = last ? 1 : Math.max(c1 - 3, y1 - irand(r, 2, 3));
      terrace(v, r, 1, 1, x1, y1, nx, ny, z, { pal, trees: last ? 3 : 2, rad: last ? 2.6 : 1.7, dens: 0.65, tree: { bloom: r() < 0.3 ? PINK : undefined } });
      drape(v, r, 1, 1, x1, y1, z, 4, 0.55, pal, BLOOM);
      if (!last) { v.box(c0, ny, z - 1, c1, y1, z, waterTop); for (let a = c0; a < c1; a++) { v.set(a, y1 - 1, z, 0); v.set(a, y1 - 1, z + 1, 0); if (r() < 0.6) v.set(a, y1 - 1, z - 1, C(FOAM, SMOOTH)); } v.box(c0, y1 - 1, z - 6, c1, y1, z, fallC(s + i)); }
      else { pool(v, c0, 3, c1, y1 - 1, z - 1); v.box(c0, y1 - 1, z - 6, c1, y1, z, fallC(s + i)); v.set(c0, y1 - 1, z, 0); v.set(c0 + 1, y1 - 1, z, 0); v.set(c0 + 2, y1 - 1, z, 0); }
      x1 = nx; y1 = ny;
    }
    v.box(c0 - 1, 23, 0, c1 + 1, 24, 1, waterTop); foam(v, r, c0 - 1, 23, c1 + 1, 24, 1, 0.8); v.emit(c0 + 1.5, 24, 2, 'mist');
    return v;
  },
  (r, lvl) => { // megablock: three stacked villages, open sky-park storeys between them, garden voids cut through
    const v = new Vox(24, 24, 176);
    const wall = pick(r, [WHITE, CONC, CREAM]), wall2 = pick(r, [SANDW, TIMB, CREAM]), g = pick(r, GLASS), pal = pick(r, PALS);
    const fls = [8 + lvl * 2, 9 + lvl * 2, 6 + lvl * 2], st = pick(r, [[0, 5, 4], [4, 0, 5], [0, 3, 1]]);
    const voidAt = (x0: number, y0: number, x1: number, y1: number, z: number, h: number) => {
      const s = irand(r, 0, 999);
      v.box(x0, y0, z, x1, y1, z + h, 0);
      const back: Col = (x, y, zz) => ((zz - z) % 3 === 2 ? C(wall[1]) : C(shade(g, -0.15), SMOOTH | (hash((x + y) >> 1, zz, s) < 0.5 ? WARM : 0)));
      onL(v, y0 - 1, x0, x1, z, z + h, back); onR(v, x0 - 1, y0, y1, z, z + h, back);
      v.box(x0, y0, z - 1, x1, y1, z, lawn(s, 0.08));
      shrubs(v, r, x0, y0, x1, y1, z, 0.5, pal, BLOOM, 0.15);
      const nt = Math.max(2, Math.round(((x1 - x0) * (y1 - y0)) / 16));
      for (let i = 0; i < nt; i++) tree(v, irand(r, x0 + 1, x1 - 2), irand(r, y0 + 1, y1 - 2), z, Math.min(2.6, (h - 3) / 2.4) * (0.8 + r() * 0.35), { pal, bloom: r() < 0.25 ? PINK : undefined });
      for (const [x, y] of [[x1 - 1, y1 - 1], [x0, y1 - 1], [x1 - 1, y0]]) if (x === 21 || y === 21) v.box(x, y, z, x + 1, y + 1, z + h, C(WHITE[0]));
      vines(v, r, 'L', 21, x0, x1, z, 6, y1 === 22 ? 0.6 : 0, pal, BLOOM); vines(v, r, 'R', 21, y0, y1, z, 6, x1 === 22 ? 0.6 : 0, pal, BLOOM);
    };
    let z = 0;
    fls.forEach((fl, i) => {
      const w = i === 1 ? wall2 : wall, H = body(v, r, 2, 2, 22, 22, z, fl, { style: st[i], wall: w, glass: g, lit: 0.34 });
      if (i === 0) lobby(v, r, 2, 2, 22, 22, 4);
      if (st[i] === 0) for (let zz = z; zz < H; zz++) for (const a of [2, 8, 15, 21]) { v.set(a, 21, zz, C(w[0])); v.set(21, a, zz, C(w[0])); }
      for (let f = 1; f < fl; f++) if (r() < 0.5) { const a = irand(r, 2, 17); ledge(v, r, r() < 0.5 ? 'L' : 'R', 22, a, a + irand(r, 2, 5), z + f * 3, { pal }); }
      if (i === 1) voidAt(11, 11, 22, 22, z + 6, Math.min(15, fl * 3 - 9));
      else if (i === 0) voidAt(5, 16, 13, 22, z + 9, 9); else voidAt(16, 6, 22, 14, z + 6, 9);
      z = H;
      if (i < 2) {
        const hh = 9, s = irand(r, 0, 999);
        v.box(2, 2, z, 22, 22, z + 1, C(WHITE[0]));
        v.box(2, 2, z + 1, 17, 17, z + hh, (x, y, zz) => C(shade(g, -0.15), SMOOTH | (hash((x + y) >> 1, zz, s) < 0.55 ? WARM : 0)));
        terrace(v, r, 2, 2, 22, 22, 17, 17, z + 1, { pal, trees: 7, rad: 2.3, dens: 0.6, tree: { bloom: r() < 0.3 ? PINK : undefined } });
        for (const [x, y] of [[21, 21], [2, 21], [21, 2], [11, 21], [21, 11]]) v.box(x, y, z + 1, x + 1, y + 1, z + hh, C(WHITE[0]));
        drape(v, r, 2, 2, 22, 22, z, 6, 0.5, pal, BLOOM);
        z += hh;
      }
    });
    v.box(2, 2, z, 22, 22, z + 1, C(wall[0]));
    roofGarden(v, r, 2, 2, 22, 22, z + 1, { trees: 9, rad: 2.6, pal, dens: 0.6 });
    pool(v, 13, 14, 20, 19, z); drape(v, r, 2, 2, 22, 22, z + 1, 7, 0.55, pal);
    return v;
  },
];

// ================================ mega (three supertalls) ======================
const mega: Maker[] = [
  (r) => { // spiralling vertical-forest needle
    const v = new Vox(24, 24, 380), H = 300, ph = r() * 6, pal = JUNGLE;
    const radAt = (z: number) => 3.6 + 6 * Math.pow(1 - z / H, 0.85);
    cyl(v, 12, 12, 11.6, 0, 3, mixc(STONE));
    for (let i = 0; i < 90; i++) { const an = r() * TAU, d = 10 + r() * 1.4; v.set(12 + Math.cos(an) * d, 12 + Math.sin(an) * d, 3, rleaf(r, pal, BLOOM, 0.2)); }
    const skin = roundSkin(r, 12, 12, WHITE[0], GLASS[1], 0.27);
    for (let z = 3; z < H; z++) cyl(v, 12, 12, radAt(z), z, z + 1, skin);
    cyl(v, 12, 12, radAt(3), 3, 7, (x, y) => C(0x6aa8a8, SMOOTH | ((x + y) % 3 ? WARM : 0)));
    for (const zc of [84, 156, 222]) { // open sky-garden storeys
      for (let z = zc; z < zc + 7; z++) { cyl(v, 12, 12, radAt(z) + 0.3, z, z + 1, 0); cyl(v, 12, 12, radAt(z) * 0.55, z, z + 1, C(0x4a98a4, SMOOTH | WARM)); }
      const rr = radAt(zc);
      cyl(v, 12, 12, rr + 0.6, zc - 1, zc, C(WHITE[0]));
      for (let i = 0; i < 40; i++) { const an = (i / 40) * TAU, d = rr * (0.7 + r() * 0.3); v.set(12 + Math.cos(an) * d, 12 + Math.sin(an) * d, zc, rleaf(r, LEAF, BLOOM, 0.15)); }
      for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU + 0.3, d = rr * 0.82; if (Math.cos(an) + Math.sin(an) > -0.4) tree(v, Math.floor(12 + Math.cos(an) * d), Math.floor(12 + Math.sin(an) * d), zc, 1.7, { pal: LEAF, th: 1 }); v.box(Math.floor(12 + Math.cos(an + 0.5) * rr * 0.92), Math.floor(12 + Math.sin(an + 0.5) * rr * 0.92), zc, Math.floor(12 + Math.cos(an + 0.5) * rr * 0.92) + 1, Math.floor(12 + Math.sin(an + 0.5) * rr * 0.92) + 1, zc + 7, C(WHITE[0])); }
    }
    for (let z = 8; z < H - 3; z++) { // two helical planted ramps
      const rr = radAt(z) + 0.8, a0 = z * 0.055 + ph, n = Math.ceil(rr * 9);
      for (let i = 0; i < n; i++) {
        const an = (i / n) * TAU, d = (((an - a0) % Math.PI) + Math.PI) % Math.PI;
        if (d > 0.6) continue;
        v.set(12 + Math.cos(an) * rr, 12 + Math.sin(an) * rr, z, z % 3 === 0 ? C(WHITE[0]) : rleaf(r, pal, BLOOM, 0.06));
        if (d < 0.3 && z % 3 !== 0 && r() < 0.55) v.set(12 + Math.cos(an) * (rr + 0.9), 12 + Math.sin(an) * (rr + 0.9), z, rleaf(r, LEAF, BLOOM, 0.14));
      }
      if (z % 10 === 0) for (const off of [0.3, Math.PI + 0.3]) { const an = a0 + off; if (Math.cos(an) + Math.sin(an) > 0.3) tree(v, Math.floor(12 + Math.cos(an) * (rr + 0.4)), Math.floor(12 + Math.sin(an) * (rr + 0.4)), z + 1, 1.7, { pal: z % 20 ? LEAF : JUNGLE, th: 1, bloom: z % 50 === 0 ? PINK : undefined, bp: 0.3 }); }
    }
    cyl(v, 12, 12, 6, H, H + 1, C(WHITE[0])); cyl(v, 12, 12, 5, H + 1, H + 2, lawn(3, 0.1));
    for (let i = 0; i < 5; i++) { const an = (i / 5) * TAU + 0.6; tree(v, Math.floor(12 + Math.cos(an) * 3.6), Math.floor(12 + Math.sin(an) * 3.6), H + 2, 2, { pal: LEAF, bloom: i === 1 ? PINK : undefined }); }
    for (let i = 0; i < 44; i++) { const an = (i / 44) * TAU; if (Math.cos(an) + Math.sin(an) > -0.2 && r() < 0.7) for (let k = irand(r, 1, 5); k > 0; k--) v.set(12 + Math.cos(an) * 5.6, 12 + Math.sin(an) * 5.6, H + 1 - k, rleaf(r, pal)); }
    v.box(12, 12, H + 2, 13, 13, H + 34, C(0xf0f2f0)); v.set(12, 12, H + 34, C(LAMP, EMIT)); v.set(12, 12, H + 20, C(LAMP, EMIT));
    return v;
  },
  (r) => { // twin towers with stacked sky bridges and a chain of waterfalls between them
    const v = new Vox(24, 24, 380), HA = 294, HB = 270, pal = LEAF;
    v.box(0, 0, 0, 24, 24, 6, mixc(STONE)); lobby(v, r, 0, 0, 24, 24, 5);
    roofGarden(v, r, 0, 0, 24, 24, 6, { pal, dens: 0.4 });
    pool(v, 11, 11, 23, 23, 5); lilies(v, r, 11, 11, 23, 23, 5, 8);
    const tw = (x0: number, y0: number, Ht: number, st: number[], g: number) => {
      let z = 6, i = 0;
      while (z < Ht) {
        const fl = Math.min(Math.floor((Ht - z) / 3), i % 2 ? 6 : 18);
        if (fl < 2) break;
        if (i % 2) { body(v, r, x0, y0, x0 + 8, y0 + 8, z, fl, { style: 0, wall: WHITE, glass: g }); skyGarden(v, r, x0, y0, x0 + 8, y0 + 8, z + 3, 7, { wall: WHITE, glass: g, pal: pick(r, PALS) }); }
        else {
          body(v, r, x0, y0, x0 + 8, y0 + 8, z, fl, { style: st[(i >> 1) % st.length], wall: WHITE, glass: g, lit: 0.36 });
          for (let f = 1; f < fl; f++) for (const face of ['L', 'R'] as const) if (r() < 0.4) { const a = irand(r, 0, 5), b = (face === 'L' ? x0 : y0) + a; ledge(v, r, face, (face === 'L' ? y0 : x0) + 8, b, b + irand(r, 2, 3), z + f * 3, { pal }); }
        }
        z += fl * 3; i++;
      }
      v.box(x0, y0, z, x0 + 8, y0 + 8, z + 1, C(WHITE[0]));
      return z + 1;
    };
    const za = tw(15, 1, HA, [0, 3, 0], GLASS[1]), zb = tw(1, 15, HB, [3, 0, 3], GLASS[3]);
    // crowns: stepped garden with a mast / sloping meadow roof
    roofGarden(v, r, 15, 1, 23, 9, za, { trees: 3, rad: 2.2, pal, dens: 0.7 }); drape(v, r, 15, 1, 23, 9, za, 8, 0.6, pal);
    v.box(18, 4, za, 20, 6, za + 8, C(WHITE[0])); v.box(19, 5, za + 8, 20, 6, za + 30, C(0xf0f2f0)); v.set(19, 5, za + 30, C(LAMP, EMIT));
    for (let i = 0; i < 6; i++) v.box(1, 15, zb + i, 9 - i, 23, zb + i + 1, i === 5 ? leaf(LIME, 9, BLOOM, 0.12) : (x, y, zz) => (x === 8 - i ? leaf(LIME, 9, BLOOM, 0.12)(x, y, zz) : C(WHITE[1])));
    drape(v, r, 1, 15, 9, 23, zb, 7, 0.6, pal);
    const levels = [62, 124, 186, 246];
    for (const [i, z] of levels.entries()) {
      const zt = skyBridge(v, r, 13, 6, 7, z, 5, i & 1 ? JUNGLE : LEAF, i !== 3);
      v.box(10, 10, zt - 1, 15, 15, zt, waterTop); // basin where the fall from above lands and the next one starts
      v.box(10, 10, zt, 15, 15, zt + 4, 0);
      const zl = i === 0 ? 6 : skyTop(levels[i - 1], true);
      for (const [x, y] of [[13, 11], [12, 12], [11, 13]]) v.box(x, y, zl, x + 1, y + 1, zt, fallC(i * 13 + x));
      foam(v, r, 10, 10, 15, 15, zl, 0.5);
      if (i >= 2) v.emit(12.5, 12.5, zl + 1, 'mist');
    }
    return v;
  },
  (r) => { // white lattice tree-tower: a diagrid trunk carrying canopy gardens
    const v = new Vox(24, 24, 380), H = 288, s = irand(r, 0, 999);
    const tr = (z: number) => 6 - 2.4 * (z / H) + (z < 30 ? 5.2 * Math.pow(1 - z / 30, 2) : 0);
    const skin: Col = (x, y, z) => {
      const a = Math.floor(((Math.atan2(y + 0.5 - 12, x + 0.5 - 12) + Math.PI) / TAU) * 32), q = z;
      const row = Math.floor(q / 6), aa = (a + (row & 1) * 2) % 4;
      if (q % 6 < 2 || aa >= 2) return C(q % 6 === 0 ? WHITE[1] : WHITE[0]);
      return C(0x58aab4, SMOOTH | (hash(a >> 1, row, s) < 0.3 ? WARM : 0));
    };
    for (let z = 0; z < H; z++) cyl(v, 12, 12, tr(z), z, z + 1, skin);
    for (let i = 0; i < 60; i++) { const an = r() * TAU, d = 9.5 + r() * 2; v.set(12 + Math.cos(an) * d, 12 + Math.sin(an) * d, 0, rleaf(r, LEAF, BLOOM, 0.25)); }
    const canopy = (zc: number, R0: number, pal: Pal, big: boolean) => {
      const ch = Math.round(R0 * 1.7), t0 = tr(zc);
      for (let i = 0; i < 20; i++) {
        const an = (i / 20) * TAU + 0.1;
        for (let t = 0; t <= 1; t += 0.02) {
          const rr = t0 + (R0 - t0) * Math.pow(t, 2), z = zc - ch + ch * Math.pow(t, 0.8);
          v.set(12 + Math.cos(an) * rr, 12 + Math.sin(an) * rr, z, hash(i, Math.floor(t * 14), s) < 0.22 ? rleaf(r, pal) : C(WHITE[0]));
        }
      }
      for (let y = 0; y < 24; y++)
        for (let x = 0; x < 24; x++) {
          const d = Math.hypot(x + 0.5 - 12, y + 0.5 - 12);
          if (d > R0 + 0.4 || d < tr(zc)) continue;
          v.set(x, y, zc, d > R0 - 0.7 ? C(WHITE[0]) : lawn(s + zc, 0.08)(x, y, zc));
          if (d > R0 - 0.7) { if (hash(x, y, zc, s) < 0.12) v.set(x, y, zc + 1, C(LAMP, EMIT)); if (x + y > 22 && r() < 0.5) for (let k = irand(r, 1, 4); k > 0; k--) v.set(x, y, zc - k, rleaf(r, pal, BLOOM, 0.1)); }
          else if (r() < 0.5) v.set(x, y, zc + 1, rleaf(r, pal, BLOOM, 0.14));
        }
      const nt = big ? 9 : 6;
      for (let i = 0; i < nt; i++) { const an = (i / nt) * TAU + zc, d = (tr(zc) + R0) * 0.52; tree(v, Math.floor(12 + Math.cos(an) * d), Math.floor(12 + Math.sin(an) * d), zc + 1, big ? 2.5 : 1.9, { pal, bloom: i % 4 === 1 ? PINK : undefined, bp: 0.3 }); }
    };
    canopy(92, 10.2, LEAF, false); canopy(158, 9, JUNGLE, false); canopy(222, 10, SAGE, false);
    canopy(H, 11.6, LEAF, true);
    tree(v, 12, 12, H + 1, 4.2, { pal: JUNGLE, th: 6 });
    v.box(12, 12, H + 1, 13, 13, H + 22, C(0xf0f2f0)); v.set(12, 12, H + 22, C(LAMP, EMIT));
    return v;
  },
];
/** Top surface of a sky bridge whose deck is at z. */
function skyTop(z: number, closed: boolean): number { return z + (closed ? 4 : 1); }

// ================================ fill (1x1 props) =============================
const fill: Maker[] = [
  (r) => { // pocket park: lawn, bench, shade tree
    const v = new Vox(T, T, 18);
    v.box(0, 0, 0, T, T, 1, lawn(irand(r, 0, 99), 0.07));
    for (let k = 0; k < 8; k++) v.set(k, Math.round(4 + Math.sin(k * 0.8) * 1.5), 0, C(STONE[k % 3]));
    tree(v, 2, 2, 1, 2.6, { pal: pick(r, PALS), bloom: r() < 0.3 ? PINK : undefined, bp: 0.3, th: 3 });
    v.box(4, 6, 1, 7, 7, 2, C(DECK[0])); v.set(4, 6, 1, C(0x8a8a84)); v.set(6, 6, 1, C(0x8a8a84));
    shrubs(v, r, 5, 0, 8, 2, 1, 0.6, LEAF, BLOOM, 0.4); lampPost(v, 7, 4, 1, 3);
    return v;
  },
  (r) => { // lily pond
    const v = new Vox(T, T, 12);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const d = Math.hypot(x - 3.5 + Math.sin(y) * 0.5, (y - 3.5) * 1.1);
      if (d < 3.1) v.set(x, y, 0, waterTop(x, y, 0)); else if (d < 3.9) v.set(x, y, 0, C(pick(r, ROCK), ROUGH)); else if (r() < 0.5) v.set(x, y, 0, rleaf(r, LIME, BLOOM, 0.25));
    }
    lilies(v, r, 2, 2, 6, 6, 0, 5);
    for (const [x, y] of [[1, 6], [6, 1], [7, 6]]) for (let k = 0; k < irand(r, 2, 4); k++) v.set(x, y, k, C(k > 1 && r() < 0.5 ? 0x8a6a3c : LIME[1 + (k & 1)], ROUGH));
    return v;
  },
  (r) => { // fountain
    const v = new Vox(T, T, 14);
    cyl(v, 4, 4, 3.7, 0, 1, C(STONE[0])); cyl(v, 4, 4, 2.9, 0, 1, waterTop); cyl(v, 4, 4, 1.2, 0, 2, C(STONE[2])); cyl(v, 4, 4, 0.9, 2, 3, waterTop);
    v.box(4, 4, 3, 5, 5, 6, C(FOAM, SMOOTH)); v.set(3, 4, 4, C(0xbfeaf2, SMOOTH)); v.set(4, 3, 4, C(0xbfeaf2, SMOOTH)); v.set(5, 4, 3, C(0xbfeaf2, SMOOTH)); v.set(4, 5, 3, C(0xbfeaf2, SMOOTH));
    foam(v, r, 2, 2, 6, 6, 1, 0.25);
    v.emit(4, 4, 7, 'mist');
    for (const [x, y] of [[0, 0], [7, 0], [0, 7], [7, 7]]) v.set(x, y, 0, rleaf(r, LEAF, BLOOM, 0.6));
    return v;
  },
  (r) => { // cascade steps
    const v = new Vox(T, T, 16);
    const al = r() < 0.5, s = irand(r, 0, 99);
    for (let k = 0; k < 4; k++) {
      const h = (4 - k) * 2;
      for (let a = k * 2; a < k * 2 + 2; a++) for (let b = 0; b < T; b++) {
        const x = al ? b : a, y = al ? a : b, wet = b >= 2 && b < 6, lip = a & 1;
        v.box(x, y, 0, x + 1, y + 1, h, wet ? (lip ? fallC(s) : C(STONE[1])) : mixc(ROCK, ROUGH, 3));
        if (wet) v.set(x, y, h - 1, lip ? C(r() < 0.6 ? FOAM : 0xbfeaf2, SMOOTH) : waterTop(x, y, 0));
        else { v.set(x, y, h - 1, r() < 0.7 ? rleaf(r, pick(r, [LEAF, LIME]), BLOOM, 0.2) : C(pick(r, ROCK), ROUGH)); if (r() < 0.3) v.set(x, y, h, rleaf(r, JUNGLE, BLOOM, 0.2)); }
      }
    }
    v.emit(al ? 4 : 7, al ? 7 : 4, 2, 'mist');
    return v;
  },
  (r) => { // bamboo grove
    const v = new Vox(T, T, 22);
    v.box(0, 0, 0, T, T, 1, (x, y) => C(hash(x, y, 4) < 0.3 ? 0xc8c0a0 : LAWN[(x + y) % 4], ROUGH));
    for (let i = 0; i < 9; i++) bamboo(v, r, irand(r, 0, 7), irand(r, 0, 7), 1, irand(r, 8, 15));
    v.set(6, 6, 1, C(0x9a9a92)); v.set(6, 6, 2, C(LAMP, EMIT));
    return v;
  },
  (r) => { // flower meadow
    const v = new Vox(T, T, 8);
    const cols = pick(r, [[0xf47aa8, 0xfff6f0, 0xdc4490], [0xffd24a, 0xff9642, 0xfff6f0], [0xb88ae8, 0xf47aa8, 0xfff6f0], BLOOM]), ph = r() * 6;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      v.set(x, y, 0, C(pick(r, LAWN), ROUGH));
      const band = Math.sin((x + y) * 0.7 + ph) + Math.sin((x - y) * 0.5 + ph * 2) * 0.6;
      if (band > 0.1 && r() < 0.8) v.set(x, y, 1, C(r() < 0.6 ? pick(r, cols) : pick(r, LIME), ROUGH)); else if (r() < 0.25) v.set(x, y, 1, rleaf(r, LIME));
    }
    if (r() < 0.5) { v.box(5, 2, 1, 7, 4, 3, C(0xf0e4c0)); v.box(5, 2, 3, 7, 4, 4, C(DECK[1])); } // beehive
    return v;
  },
  (r) => { // playground under trees
    const v = new Vox(T, T, 18);
    v.box(0, 0, 0, T, T, 1, (x, y) => C(Math.hypot(x - 4.5, y - 4.5) < 3 ? [0xe8c890, 0xe0be84][(x + y) & 1] : LAWN[(x * 3 + y) % 4], ROUGH));
    tree(v, 1, 1, 1, 2.3, { pal: pick(r, PALS), th: 3 }); tree(v, 6, 1, 1, 1.7, { pal: LIME, th: 2 });
    const c = pick(r, [0xf0785a, 0x58a8c8, 0xf0c050]);
    for (let k = 0; k < 4; k++) v.set(3 + k, 5, 4 - k, C(c)); v.box(2, 5, 1, 3, 6, 5, C(WHITE[0])); v.box(2, 4, 4, 3, 6, 5, C(DECK[0])); // slide
    v.box(6, 4, 1, 7, 5, 4, C(WHITE[0])); v.box(6, 6, 1, 7, 7, 4, C(WHITE[0])); v.box(6, 4, 4, 7, 7, 5, C(c)); v.set(6, 5, 2, C(DECK[1])); // swing
    return v;
  },
  (r) => { // waterfall rock
    const v = new Vox(T, T, 18);
    const s = irand(r, 0, 999), H = irand(r, 7, 10);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 7; x++) {
      const h = Math.round(H - Math.hypot(x - 3, y - 2) * 1.2 + hash(x >> 1, y >> 1, s) * 2);
      if (h > 0) v.box(x, y, 0, x + 1, y + 1, h, (X, Y, Z) => (Z === h - 1 && hash(X, Y, s) < 0.6 ? rleaf(r, JUNGLE, BLOOM, 0.1) : C(ROCK[Math.floor(hash(X, Y, Z >> 1, s) * 4)], ROUGH)));
    }
    v.box(2, 5, 0, 7, 8, 1, waterTop); for (let x = 1; x < 8; x++) v.set(x, 7 + (x & 1 ? 0 : -3), 0, C(pick(r, ROCK), ROUGH));
    let ht = 0; for (let z = 0; z < 18; z++) if (v.get(3, 4, z)) ht = z + 1;
    v.box(3, 4, 0, 5, 5, ht, fallC(s)); foam(v, r, 2, 5, 6, 6, 0, 0.8); v.emit(4, 5, 1, 'mist');
    tree(v, 1, 1, Math.max(1, H - 3), 1.6, { pal: JUNGLE, th: 1 });
    return v;
  },
];

// ================================ sec (2x2 landmarks) ==========================
const sec: Maker[] = [
  (r) => { // rain-vortex conservatory: a ring-shaped glass dome with a waterfall plunging through its oculus
    const v = new Vox(16, 16, 40), s = irand(r, 0, 999), fc = fallC(s);
    v.box(0, 0, 0, 16, 16, 1, lawn(s, 0.1));
    cyl(v, 7.5, 7.5, 7.9, 0, 2, mixc(STONE));
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7, y - 7);
        if (d > 7.4) continue;
        const h = 2 + Math.round(10 * Math.sqrt(Math.max(0.03, 1 - ((d - 3.3) / 4.2) ** 2))), an = Math.atan2(y - 7, x - 7);
        for (let z = 2; z < h; z++) {
          const rib = (z - 2) % 4 === 3 || Math.abs(Math.sin(an * 6)) < 0.15;
          const wet = d < 2.3 || (Math.abs(x - y) <= 1 && x + y >= 14);
          const inside = hash(x >> 1, y >> 1, z >> 1, s) < 0.55 * (1 - (z - 2) / 10);
          v.set(x, y, z, wet ? (rib && d >= 2.3 && (z - 2) % 4 === 3 ? C(0xf6f8f6) : fc(x, y, z)) : rib ? C(0xf6f8f6)
            : inside ? C(pick(r, [0x6fc08c, 0x58aa78, 0x86cc94]), SMOOTH | (hash(x, y, z, s) < 0.25 ? WARM : 0)) : C(0x8fd4d8, SMOOTH | (hash(x >> 1, y >> 1, z, s + 1) < 0.28 ? WARM : 0)));
        }
      }
    foam(v, r, 11, 11, 14, 14, 2, 0.5); v.emit(12.5, 12.5, 3, 'mist'); v.emit(7.5, 7.5, 9, 'mist');
    onL(v, 14, 4, 6, 2, 5, C(0x6aa8a8, SMOOTH | WARM)); onL(v, 14, 3, 7, 5, 6, C(WHITE[0]));
    for (let i = 0; i < 30; i++) { const an = (i / 30) * TAU; if (Math.cos(an) + Math.sin(an) > 0.1 && r() < 0.7) v.set(7.5 + Math.cos(an) * 8.3, 7.5 + Math.sin(an) * 8.3, 1, C(pick(r, BLOOM), ROUGH)); }
    palm(v, 14, 13, 1, 7); palm(v, 1, 14, 1, 6); tree(v, 14, 2, 1, 1.6, { pal: JUNGLE }); lampPost(v, 15, 15, 1);
    return v;
  },
  (r) => { // grove of sculptural trees with an aerial walkway
    const v = new Vox(16, 16, 60);
    v.box(0, 0, 0, 16, 16, 1, lawn(irand(r, 0, 99), 0.12));
    const br = pick(r, [0xf4f2ec, 0xe6d2b0, 0xd8bcd8]);
    superTree(v, r, 4.5, 4.5, 1, 40, 5.4, br); superTree(v, r, 11.5, 5.5, 1, 27, 4.2, br); superTree(v, r, 5.5, 11.5, 1, 31, 4.4, br); superTree(v, r, 12.5, 12.5, 1, 18, 3.2, br);
    for (let t = 0; t <= 6; t++) { v.set(11 - t, 5 + t, 20, C(WHITE[0])); v.set(11 - t, 5 + t, 21, t & 1 ? C(LAMP, EMIT) : C(0xe8e6e0)); } // walkway between two trunks
    shrubs(v, r, 0, 13, 9, 16, 1, 0.5, LEAF, BLOOM, 0.4); shrubs(v, r, 13, 0, 16, 9, 1, 0.5, JUNGLE, BLOOM, 0.4);
    pool(v, 7, 7, 10, 10, 0, STONE[0]);
    return v;
  },
  (r) => { // waterfall cliff garden
    const v = new Vox(16, 16, 50);
    const s = irand(r, 0, 999), HP = 26;
    const hAt = (x: number, y: number) => {
      const m = Math.max(x, y + 1), n = (hash(x >> 1, y >> 1, s) - 0.5) * 3;
      return m < 8 ? HP + n * 0.6 + (8 - m) * 0.3 : m < 10 ? HP * 0.55 + n : m < 12 ? HP * 0.2 + n * 0.5 : 0;
    };
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const h = Math.round(hAt(x, y));
        if (h <= 0) { v.set(x, y, 0, x < 11 && y > 10 ? waterTop(x, y, 0) : lawn(s, 0.1)(x, y, 0)); continue; }
        v.box(x, y, 0, x + 1, y + 1, h, (X, Y, Z) => (hash(X, Y, Z, s) < 0.14 ? rleaf(r, JUNGLE) : C(ROCK[Math.floor(hash(X >> 1, Y, Z >> 1, s) * 4)], ROUGH)));
        v.set(x, y, h - 1, hash(x, y, s + 1) < 0.8 ? rleaf(r, pick(r, [LEAF, JUNGLE]), BLOOM, 0.08) : C(pick(r, ROCK), ROUGH));
        if (hash(x, y, s + 2) < 0.35) v.set(x, y, h, rleaf(r, JUNGLE, BLOOM, 0.15));
      }
    // the river on the plateau and its two drops
    const fx = 3 + irand(r, 0, 1);
    for (let y = 2; y < 16; y++) for (let x = fx; x < fx + 3; x++) {
      let top = 0; for (let z = 0; z < 49; z++) if (v.get(x, y, z)) top = z + 1;
      const h = Math.round(hAt(x, y));
      if (h <= 0) continue;
      for (let z = h - 1; z < top + 1; z++) v.set(x, y, z, 0);
      v.set(x, y, h - 2, waterTop(x, y, 0));
      if (Math.round(hAt(x, y + 1)) < h - 2) v.box(x, y, Math.max(0, Math.round(hAt(x, y + 1)) - 1), x + 1, y + 1, h - 1, fallC(s));
    }
    foam(v, r, fx - 1, 11, fx + 4, 13, 1, 0.7); foam(v, r, fx, 9, fx + 3, 10, Math.round(HP * 0.55), 0.4);
    v.emit(fx + 1.5, 12, 2, 'mist'); v.emit(fx + 1.5, 9, HP * 0.55 + 1, 'mist');
    tree(v, 1, 1, HP + 2, 2.6, { pal: JUNGLE }); tree(v, 6, 1, HP + 1, 2, { pal: LEAF }); tree(v, 1, 6, HP + 1, 1.9, { pal: LEAF, bloom: PINK, bp: 0.3 });
    tree(v, 13, 2, 0, 1.8, { pal: SAGE }); palm(v, 12, 13, 1, 6); lilies(v, r, 0, 12, 10, 16, 0, 5);
    lampPost(v, 14, 14, 1);
    return v;
  },
  (r) => { // lotus pavilion on a pond
    const v = new Vox(16, 16, 40);
    cyl(v, 8, 8, 7.9, 0, 1, C(STONE[0])); cyl(v, 8, 8, 7.2, 0, 1, waterTop); lilies(v, r, 1, 1, 15, 15, 0, 8);
    cyl(v, 8, 8, 3.4, 0, 2, C(STONE[2]));
    const petal = (an: number, rOf: (t: number) => number, zOf: (t: number) => number, wmax: number, base: number, tip: number) => {
      for (let t = 0; t <= 1; t += 0.02) {
        const rr = rOf(t), z = zOf(t), w = Math.max(0.04, wmax * Math.pow(Math.sin(Math.PI * (0.2 + 0.8 * t)), 0.8));
        for (let d = -w; d <= w; d += 0.03)
          v.set(8 + Math.cos(an + d) * rr, 8 + Math.sin(an + d) * rr, z, C(lerpc(base, tip, clamp01(Math.pow(t, 2) * 0.9 + (Math.abs(d) > w - 0.06 ? 0.14 : 0)))));
      }
    };
    for (let i = 0; i < 6; i++) petal((i / 6) * TAU + 0.26, (t) => 3.2 + 3.9 * t, (t) => 1.4 + 2.4 * t * t, 0.42, 0xfffcfa, 0xf8b4cc);
    for (let i = 0; i < 6; i++) petal((i / 6) * TAU + 0.26 + TAU / 12, (t) => 2.4 + 3.3 * Math.sin(t * Math.PI * 0.5), (t) => 2 + 6.5 * Math.pow(t, 1.2), 0.38, 0xfffafa, 0xf6a0c0);
    cyl(v, 8, 8, 1.6, 2, 8, (x, y, z) => C(0xf2dc98, SMOOTH | ((x + y + z) % 3 ? WARM : 0)));
    for (let i = 0; i < 4; i++) petal((i / 4) * TAU + 0.6, (t) => 1.1 + 1.6 * Math.sin(t * Math.PI * 0.85), (t) => 2 + 12 * t, 0.62, 0xfdeaf0, 0xf08ab2);
    v.set(8, 8, 15, C(LAMP, EMIT));
    v.box(7, 13, 1, 9, 16, 2, C(DECK[0])); // jetty
    return v;
  },
];

// ================================ hero (3x3) ===================================
const hero: Maker = (r) => { // three towers carrying a sky park, with a waterfall dropping from it down the centre tower
  const v = new Vox(24, 24, 244), HT = 168, DT = HT + 5, pal = LEAF;
  v.box(0, 0, 0, 24, 24, 3, mixc(STONE)); lobby(v, r, 0, 0, 24, 24, 3);
  v.box(0, 0, 3, 24, 24, 4, lawn(5, 0.08));
  v.box(11, 11, 3, 23, 23, 4, waterTop); for (let a = 10; a < 24; a++) { v.set(a, 23, 3, C(STONE[2])); v.set(23, a, 3, C(STONE[2])); v.set(a, 10, 3, C(STONE[2])); v.set(10, a, 3, C(STONE[2])); }
  lilies(v, r, 17, 17, 23, 23, 3, 6);
  shrubs(v, r, 0, 7, 10, 17, 4, 0.5, pal); shrubs(v, r, 7, 0, 17, 8, 4, 0.5, pal);
  tree(v, 3, 12, 4, 2.4, { pal: JUNGLE }); tree(v, 12, 3, 4, 2.4, { pal: LEAF, bloom: PINK, bp: 0.3 }); palm(v, 20, 12, 4, 8); palm(v, 12, 20, 4, 8); tree(v, 8, 20, 4, 1.8, { pal }); tree(v, 20, 8, 4, 1.8, { pal });
  const tw = (x0: number, y0: number, w: number, g: number, st: number[], cuts: number[], seed: number) => {
    const x1 = x0 + w, y1 = y0 + w;
    let z = 4, i = 0;
    while (z < HT) {
      const fl = Math.min(Math.ceil((HT - z) / 3), 9 + ((i + seed) % 3) * 3);
      body(v, r, x0, y0, x1, y1, z, fl, { style: st[i % st.length], wall: i % 2 ? CREAM : WHITE, glass: g, lit: 0.36 });
      for (let f = 1; f < fl; f++) for (const face of ['L', 'R'] as const) if (r() < 0.5) { const a = irand(r, 0, w - 3), b = (face === 'L' ? x0 : y0) + a; ledge(v, r, face, face === 'L' ? y1 : x1, b, b + irand(r, 2, 3), z + f * 3, { pal: pick(r, PALS) }); }
      z += fl * 3; i++;
    }
    for (const q of cuts) skyGarden(v, r, x0, y0, x1, y1, 4 + Math.round((HT * q) / 3) * 3, 7, { wall: WHITE, glass: g, pal: pick(r, PALS) });
    drape(v, r, x0, y0, x1, y1, HT, 14, 0.5, JUNGLE, BLOOM);
  };
  tw(17, 1, 6, GLASS[1], [0, 4, 3], [0.3, 0.68], 0); tw(1, 17, 6, GLASS[3], [5, 3, 0], [0.48, 0.82], 1); tw(8, 8, 8, GLASS[0], [0, 3], [0.2, 0.55], 2);
  // the fall: a slot down the front corner of the centre tower
  v.box(13, 13, 4, 16, 16, HT, 0);
  const fc = fallC(irand(r, 0, 999));
  for (let y = 13; y < 16; y++) for (let x = 13; x < 16; x++) if (x + y <= 28) v.box(x, y, 3, x + 1, y + 1, DT, fc);
  vines(v, r, 'L', 15, 10, 13, HT, 26, 0.9, JUNGLE, BLOOM); vines(v, r, 'R', 15, 10, 13, HT, 26, 0.9, JUNGLE, BLOOM);
  foam(v, r, 14, 14, 19, 19, 4, 0.55); v.emit(16, 16, 5, 'mist'); v.emit(16.5, 16.5, 9, 'mist');
  // sky park: a long boat-shaped deck across all three towers
  const inDeck = (x: number, y: number, grow: number) => {
    const u = (x - y) / 2, w = (x + y - 23) / 2;
    return Math.abs(w) <= (4.8 + grow) * Math.sqrt(Math.max(0, 1 - (u / 13.6) ** 2)) + 0.5;
  };
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      if (Math.abs(x - y) <= 2 && x + y > 28) continue; // spillway notch above the fall
      if (inDeck(x, y, -2.6)) v.set(x, y, HT - 1, C(WHITE[1]));
      if (inDeck(x, y, -1.3)) v.set(x, y, HT, C(WHITE[1]));
      if (!inDeck(x, y, 0)) continue;
      const w = (x + y - 23) / 2, u = (x - y) / 2;
      v.box(x, y, HT + 1, x + 1, y + 1, DT, (_x, _y, z) => (z === HT + 2 || z === HT + 3 ? C(0x5aa8b4, SMOOTH | (hash(x >> 1, y >> 1, 3) < 0.55 ? WARM : 0)) : C(WHITE[0])));
      const water = (w > 1.8 && Math.abs(u) < 9.5 && inDeck(x, y, -1)) || (Math.abs(u) <= 1.5 && w > 0);
      v.set(x, y, DT, water ? waterTop(x, y, 0) : Math.abs(w) < 0.8 ? C(DECK[(x + y) % 3]) : lawn(7, 0.08)(x, y, 0));
      if (!water && Math.abs(w) >= 0.8 && r() < 0.45) v.set(x, y, DT + 1, rleaf(r, pal, BLOOM, 0.14));
    }
  for (const u of [-10, -7.5, -5, 5, 7.5, 10]) { const x = Math.round(11.5 + u - 1.4), y = Math.round(11.5 - u - 1.4); tree(v, x, y, DT + 1, 2.3 + (Math.abs(u) === 7.5 ? 0.6 : 0), { pal: Math.abs(u) === 5 ? JUNGLE : LEAF, bloom: Math.abs(u) === 10 ? PINK : undefined, bp: 0.3 }); }
  for (const u of [-9, -3.5, 3.5, 9]) palm(v, Math.round(11.5 + u + 0.4), Math.round(11.5 - u + 0.4), DT + 1, 7);
  // crown of the centre tower: a glass pavilion, roof garden and mast
  v.box(8, 8, DT + 1, 14, 14, DT + 10, C(WHITE[0]));
  for (let f = 0; f < 3; f++) for (let a = 8; a < 14; a += 2) { onL(v, 13, a, a + 2, DT + 2 + f * 3, DT + 4 + f * 3, glassLit(r, GLASS[0], 0.6)); onR(v, 13, a, a + 2, DT + 2 + f * 3, DT + 4 + f * 3, glassLit(r, GLASS[0], 0.6)); }
  v.box(8, 8, DT + 10, 14, 14, DT + 11, C(WHITE[0]));
  roofGarden(v, r, 8, 8, 14, 14, DT + 11, { trees: 3, rad: 2, pal: JUNGLE, dens: 0.7 }); drape(v, r, 8, 8, 14, 14, DT + 11, 5, 0.6, JUNGLE, BLOOM);
  v.box(10, 10, DT + 11, 11, 11, DT + 34, C(0xf0f2f0)); v.set(10, 10, DT + 34, C(LAMP, EMIT)); v.set(10, 10, DT + 23, C(LAMP, EMIT));
  return v;
};

// ================================ ground =======================================
const grassC = (r: R) => C(r() < 0.06 ? pick(r, BLOOM) : pick(r, [LAWN[0], LAWN[1], LAWN[2], LIME[2]]), ROUGH);

export const e11: Cat = {
  small, large, huge, mega, fill, sec, hero,
  // leafy boulevard: pale paving, planted verges, a terracotta cycle lane
  road: (r, d) => slab((x, y) => {
    const stone = () => C(pick(r, [0xcfcbc0, 0xc8c4b9, 0xd4d0c6]));
    if (d === 0) {
      const ex = x === 0 || x === 7, ey = y === 0 || y === 7;
      if (ex && ey) return grassC(r);
      const zx = x <= 1 || x >= 6, zy = y <= 1 || y >= 6;
      if (zx !== zy) return (zx ? y : x) % 2 === 1 ? C(0xf2efe6) : stone();
      return stone();
    }
    const a = d === 1 ? x : y, b = d === 1 ? y : x;
    if (b === 0 || b === 7) return a % 4 === 1 && r() < 0.5 ? C(LEAF[1], ROUGH) : grassC(r);
    if (b === 6) return C(pick(r, [0xd9aa8c, 0xd3a486]));
    if (b === 1) return C(0xe8e4da);
    if (b === 3 && a % 4 < 2) return C(0xf2efe6);
    return stone();
  }, C(0x9a9486)),
  // only ever under buildings: pale stone flags, timber deck or grass pavers
  pave: (r) => {
    const k = r();
    if (k < 0.4) return slab((x, y) => (x % 4 === 0 || y % 4 === 0 ? (r() < 0.35 ? C(LAWN[2], ROUGH) : C(0xc4c0b4)) : C(pick(r, STONE))), C(0x9a9486));
    if (k < 0.7) return slab((x, y) => C(x === 0 && (y & 1) ? 0xbf9c6a : DECK[(y + (x >> 2)) % 3]), C(0x8a6e4c));
    return slab((x, y) => ((x + y) & 1 ? C(pick(r, LAWN), ROUGH) : C(pick(r, STONE))), C(0x9a9486));
  },
  bridge: (_r, d) => {
    const v = new Vox(T, T, 7);
    v.box(0, 0, 0, T, T, 2, (x, y) => {
      const b = d === 1 ? y : x;
      return C(b === 6 ? 0xd9aa8c : b === 1 ? 0xe8e4da : [0xcfcbc0, 0xc8c4b9][(x + y) & 1]);
    });
    for (let a = 0; a < T; a++)
      for (const b of [0, 7]) {
        const x = d === 1 ? a : b, y = d === 1 ? b : a;
        v.set(x, y, 2, C(WHITE[0]));
        if (a % 4 === 1 || a % 4 === 2) v.set(x, y, 3, C(leafC(a & 1 ? LEAF : LIME, hash(a, b, 3)), ROUGH)); else if (a % 4 === 3) v.set(x, y, 3, C(WHITE[1]));
        if (a === 3) v.set(x, y, 4, C(LAMP, EMIT));
      }
    return v;
  },
};
