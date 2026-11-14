// Epochs 9-10: neon metropolis -> cyberpunk megacity.
import { hash, pick, irand, type R } from './rng';
import {
  C, EMIT, ROUGH, SMOOTH, WARM, COOL, Vox, T, type Col, type Maker,
  mixc, onL, onR, gable, hip, cyl, cone, ball, crenel, facade, house,
} from './shapes';
import { GREEN, ground, slab, bridgeTile } from './models_base';
import { type Cat } from './epochs_a';

// ================================ shared helpers ================================
type Face = 'L' | 'R';
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerpc = (a: number, b: number, t: number): number => {
  t = clamp01(t);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
/** Lighten (k > 0) or darken (k < 0) a colour. */
const shade = (c: number, k: number) => lerpc(c, k < 0 ? 0x000000 : 0xffffff, Math.abs(k));
const shuffle = <A>(r: R, a: A[]): A[] => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
};
const put = (v: Vox, face: Face, f: number, a0: number, a1: number, z0: number, z1: number, c: Col) =>
  (face === 'L' ? onL(v, f, a0, a1, z0, z1, c) : onR(v, f, a0, a1, z0, z1, c));
/** Paint the two visible faces of a box footprint. */
const faces = (v: Vox, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, c: Col) => {
  onL(v, y1 - 1, x0, x1, z0, z1, c); onR(v, x1 - 1, y0, y1, z0, z1, c);
};

interface RibO {
  glass?: number | ((z: number) => number); lit?: number; light?: number | ((r: R) => number);
  seg?: number; gap?: number; m?: number; wh?: number; sill?: number; side?: Face; even?: boolean;
}
/** Window bands whose lit share varies per floor, so lights cluster and leave dark resting floors. */
function ribbon(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z0: number, floors: number, fh: number, o: RibO = {}): void {
  const lit = o.lit ?? 0.3, seg = o.seg ?? 2, gap = o.gap ?? 0, m = o.m ?? 1, wh = o.wh ?? fh - 1, sill = o.sill ?? 1;
  for (let f = 0; f < floors; f++) {
    const zb = z0 + f * fh + sill, k = o.even ? 1 : pick(r, [0.1, 0.5, 1, 1.7]);
    const g = typeof o.glass === 'function' ? o.glass(zb) : o.glass ?? 0x4a5c72;
    const cell = () => C(g, SMOOTH | (r() < lit * k ? (typeof o.light === 'function' ? o.light(r) : o.light ?? WARM) : 0));
    if (o.side !== 'R') for (let a = x0 + m; a < x1 - m; a += seg + gap) onL(v, y1 - 1, a, Math.min(a + seg, x1 - m), zb, zb + wh, cell());
    if (o.side !== 'L') for (let b = y0 + m; b < y1 - m; b += seg + gap) onR(v, x1 - 1, b, Math.min(b + seg, y1 - m), zb, zb + wh, cell());
  }
}

/** Balcony rows: a pale rail line, a dark recess with glazing behind it, and a little laundry. */
function balconies(v: Vox, r: R, face: Face, f: number, a0: number, a1: number, z0: number, floors: number, fh: number, rail: number, wall: Col, lit = 0.33): void {
  for (let k = 0; k < floors; k++) {
    const z = z0 + k * fh;
    put(v, face, f, a0, a1, z + 2, z + fh, wall);
    for (let a = a0; a < a1; a += 2) put(v, face, f, a, Math.min(a + 2, a1), z + 1, z + 2, C(0x46566a, SMOOTH | (r() < lit ? WARM : 0)));
    put(v, face, f, a0, a1, z, z + 1, C(rail));
    for (let a = a0; a < a1; a++) if (r() < 0.09) put(v, face, f, a, a + 1, z, z + 1, C(pick(r, [0x6aa0d8, 0xe890a8, 0xe8c860, 0x8ac8a0])));
  }
}

/** Flat illuminated sign with a few dark "glyph" pixels. */
function lightbox(v: Vox, r: R, face: Face, f: number, a0: number, a1: number, z0: number, z1: number, col: number, ink = 0x2a2026): void {
  const s = irand(r, 0, 999);
  for (let a = a0; a < a1; a++)
    for (let z = z0; z < z1; z++) {
      const g = a > a0 && a < a1 - 1 && hash(a, z, s) < 0.24;
      put(v, face, f, a, a + 1, z, z + 1, g ? C(ink) : C(col, EMIT));
    }
}

/** Projecting vertical sign board: lit character blocks separated by dark gaps. */
function signV(v: Vox, x: number, y: number, z0: number, len: number, col: number, wide: '' | 'x' | 'y' = ''): void {
  for (let k = 0; k < len; k++) {
    const c = k % 3 === 2 ? C(0x1c1a22) : C(col, EMIT);
    v.set(x, y, z0 + k, c);
    if (wide === 'x') v.set(x + 1, y, z0 + k, c); else if (wide === 'y') v.set(x, y + 1, z0 + k, c);
  }
}

/** Video wall with a simple readable picture instead of random noise. */
function video(v: Vox, r: R, face: Face, f: number, a0: number, a1: number, z0: number, z1: number, k = irand(r, 0, 3)): void {
  const W = a1 - a0, H = z1 - z0, hue = pick(r, [0xe8384a, 0x2a6ad8, 0x1e9a6a, 0xe86a1a]);
  for (let a = a0; a < a1; a++)
    for (let z = z0; z < z1; z++) {
      const u = (a - a0 + 0.5) / W, w = (z - z0 + 0.5) / H;
      let c: number;
      if (k === 0) { // sunset
        const d = Math.hypot((u - 0.5) * W, (w - 0.45) * H);
        c = d < Math.min(W, H) * 0.27 ? 0xffe08a : w < 0.26 ? 0x3a2a7a : lerpc(0xff7a5a, 0x6a3aa8, (w - 0.26) / 0.74);
      } else if (k === 1) { // advert: colour block with a dot, white field with text lines
        c = u < 0.4 ? (Math.hypot((u - 0.2) * W, (w - 0.5) * H) < Math.min(W * 0.14, H * 0.3) ? 0xfff8e8 : hue)
          : (z - z0) % 3 === 1 && u < 0.92 && hash(a, z, 5) < 0.8 ? 0x2a2a3a : 0xf4f4ee;
      } else if (k === 2) { // wave
        const s = w + Math.sin(u * 7) * 0.13;
        c = s > 0.68 ? 0x5ad0ff : s > 0.42 ? 0xf4f8ff : 0x2a6ad8;
      } else { // portrait
        const d = Math.hypot((u - 0.5) * W, (w - 0.56) * H);
        c = d < Math.min(W, H) * 0.3 ? (w > 0.7 ? 0x3a2a4a : 0xffd8b8) : w < 0.26 && Math.abs(u - 0.5) < 0.34 ? 0x3a2a4a : 0xff6ab0;
      }
      put(v, face, f, a, a + 1, z, z + 1, C(c, EMIT));
    }
}

function parapet(v: Vox, x0: number, y0: number, x1: number, y1: number, z: number, c: Col, floor = 0x5e6068): void {
  v.box(x0, y0, z, x1, y1, z + 1, c); v.box(x0 + 1, y0 + 1, z, x1 - 1, y1 - 1, z + 1, 0);
  v.box(x0 + 1, y0 + 1, z - 1, x1 - 1, y1 - 1, z, C(floor));
}
function tank(v: Vox, x: number, y: number, z: number, c = 0xd8d2c0): void {
  v.box(x, y, z, x + 2, y + 2, z + 1, C(0x4a4a50)); v.box(x, y, z + 1, x + 2, y + 2, z + 3, C(c));
}
function acs(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const x = irand(r, x0, Math.max(x0, x1 - 2)), y = irand(r, y0, Math.max(y0, y1 - 1));
    v.box(x, y, z, x + 2, y + 1, z + 1, C(pick(r, [0xc8ccd0, 0xa8acb0, 0xe0e0dc])));
  }
}
function mast(v: Vox, x: number, y: number, z: number, h: number, tip = 0xff3b3b, col = 0xb4b8c0): void {
  v.box(x, y, z, x + 1, y + 1, z + h, C(col)); v.set(x, y, z + h, C(tip, EMIT));
}
/** Rooftop billboard on legs. */
function billboard(v: Vox, r: R, face: Face, f: number, a0: number, a1: number, z: number, h: number, kind: 'box' | 'video', col?: number): void {
  for (const a of [a0, a1 - 1]) put(v, face, f, a, a + 1, z, z + 2, C(0x3a3c44));
  if (kind === 'video') video(v, r, face, f, a0, a1, z + 2, z + 2 + h);
  else lightbox(v, r, face, f, a0, a1, z + 2, z + 2 + h, col ?? pick(r, SIGN9));
}
function treeAt(v: Vox, x: number, y: number, z: number, rad = 2.2, pal: number[] = GREEN, fruit?: number, s = 1): void {
  const th = 2 + Math.floor(rad / 2);
  v.box(x, y, z, x + 1, y + 1, z + th, C(0x5a3d28));
  ball(v, x + 0.5, y + 0.5, z + th + rad * 0.7, rad, rad * 0.85, (X, Y, Z) =>
    C(fruit != null && hash(X, Y, Z, s + 4) < 0.16 ? fruit : pal[Math.min(pal.length - 1, 1 + Math.floor(hash(X, Y, Z, s) * 3))], ROUGH));
}
/** Loose greenery on a flat surface. */
function hedge(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z: number, p = 0.8): void {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) if (r() < p) {
      v.set(x, y, z, C(GREEN[irand(r, 0, 3)], ROUGH));
      if (r() < 0.22) v.set(x, y, z + 1, C(GREEN[irand(r, 1, 3)], ROUGH));
    }
}
/** Greenery hanging down the two visible faces from the top edge. */
function vines(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z1: number, maxLen: number, dens = 0.6): void {
  for (let a = x0; a < x1; a++) if (r() < dens) for (let k = irand(r, 1, maxLen); k > 0; k--) v.set(a, y1 - 1, z1 - k, C(GREEN[irand(r, 0, 3)], ROUGH));
  for (let b = y0; b < y1; b++) if (r() < dens) for (let k = irand(r, 1, maxLen); k > 0; k--) v.set(x1 - 1, b, z1 - k, C(GREEN[irand(r, 0, 3)], ROUGH));
}
/** Big wheel in the plane y = const (seen from the front-left). */
function wheel(v: Vox, r: R, cx: number, y: number, cz: number, R0: number): void {
  const cols = shuffle(r, [0xff4fc0, 0x35e0ff, 0xffd24a, 0x6aff9a, 0xff4a3a]);
  const z0 = cz - R0 - 2;
  for (let t = 0; t <= 1; t += 0.04)
    for (const s of [-1, 1]) for (const dy of [-1, 1]) v.set(Math.round(cx + s * t * R0 * 0.6), y + dy, Math.round(cz - t * (cz - z0)), C(0x8a8e9a));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    for (let t = 1; t < R0; t++) v.set(Math.round(cx + Math.cos(a) * t), y, Math.round(cz + Math.sin(a) * t), C(0xb4bac6));
  }
  const n = Math.ceil(R0 * 14);
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; v.set(Math.round(cx + Math.cos(a) * R0), y, Math.round(cz + Math.sin(a) * R0), C(0xeceef2)); }
  for (let i = 0; i < 8; i++) { const a = ((i + 0.5) / 8) * Math.PI * 2; v.set(Math.round(cx + Math.cos(a) * R0), y, Math.round(cz + Math.sin(a) * R0), C(cols[i % cols.length], EMIT)); }
  v.set(cx, y, cz, C(0xffd24a, EMIT));
}
/** Square prism with chamfered corners (reads as hexagonal / octagonal). */
function oct(v: Vox, cx: number, cy: number, hw: number, ch: number, z0: number, z1: number, c: Col): void {
  for (let y = Math.floor(cy - hw); y <= Math.ceil(cy + hw); y++)
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      const dx = Math.abs(x + 0.5 - cx), dy = Math.abs(y + 0.5 - cy);
      if (dx <= hw && dy <= hw && dx + dy <= 2 * hw - ch) for (let z = z0; z < z1; z++) v.set(x, y, z, typeof c === 'number' ? c : c(x, y, z));
    }
}

// ================================ EPOCH 9 ======================================
// Contemporary dense Asian megacity: pale concrete, tile and glass by day, warm signage by night.
const CONC9 = [[0xc2beb6, 0xb6b2aa], [0xd6ccb6, 0xcac0aa], [0xe6e4de, 0xdad8d2], [0xa2a6ae, 0x969aa2], [0x94705e, 0x886654], [0xb4c0c4, 0xa8b4b8], [0x767a86, 0x6c707c]];
const SIGN9 = [0xff4a3a, 0xffd24a, 0xfff4d8, 0xff4fc0, 0x35e0ff, 0x6aff9a, 0xff8a2a];
const GLASS9 = [[0x3a5a80, 0x7aa8d0, 0xc8d0d8], [0x2e6a70, 0x74c0b8, 0xd0d8d4], [0x4a4a6e, 0x9494c4, 0xc8c8d4], [0x6a5a48, 0xc0a070, 0xd8d0c0], [0x2c3a4e, 0x5a7a9a, 0x9aa2ae]];
const ROOF9 = [[0x4e5660, 0x444c56], [0x3c5c5a, 0x345250], [0x5c4c46, 0x50423c], [0x2e3038, 0x282a32]];
const CHERRY = [0x9a4a6a, 0xe090b0, 0xf0a8c8, 0xf6cfe0];
const LANTERN = 0xff5a3a;
const light9 = (r: R) => (r() < 0.7 ? WARM : r() < 0.6 ? COOL : WARM | COOL);

const e9: Cat = {
  // old alleys -> shops -> entertainment -> housing -> offices
  small: [
    (r, lvl) => { // izakaya / shop-house with noren and lanterns
      const v = new Vox(T, T, 28);
      const wall = pick(r, [[0x6a4a34, 0x5e402c], [0x3e3634, 0x36302e], [0xdcd0b6, 0xd0c4aa], [0x8c4836, 0x7e4030]]);
      const fl = 1 + lvl;
      house(r, { n: 1, w: 6, d: 6, floors: fl, fh: 4, wall: mixc(wall), roof: pick(r, ROOF9), roofType: lvl === 1 ? 'gable' : 'hip', door: 0x2a2220, win: { glass: 0x4a3c2c, lit: 0.7, wh: 2, sill: 1, gap: 1 } }, { v, x0: 1, y0: 1 });
      onL(v, 6, 2, 6, 2, 3, C(pick(r, [0x2a3a6a, 0x8a2a2a, 0xf0e8d8, 0x2a5a4a]))); // noren
      for (const x of [1, 5]) v.set(x, 7, 2, C(LANTERN, EMIT));
      if (fl > 1) { const aw = pick(r, [0xc8423a, 0x2f6fb0, 0x3f8a5a]); for (let x = 1; x < 7; x++) v.set(x, 7, 4, C(x & 1 ? aw : 0xf0e8d8)); }
      signV(v, 7, 3, 1, fl > 1 ? 5 : 2, pick(r, [0xff4a3a, 0xffd24a, 0xfff4d8]));
      return v;
    },
    (r, lvl) => { // convenience store, flats above
      const v = new Vox(T, T, 38);
      const [a, b] = pick(r, [[0x2aa866, 0x2f7fd0], [0xf07a2a, 0xe03a2a], [0x2f7fd0, 0xf0f0f4], [0xe03a6a, 0xf0c02a]]);
      const white = C(0xe8e8e2), sh = 7;
      v.box(1, 1, 0, 7, 7, sh, white);
      faces(v, 1, 1, 7, 7, 0, 4, C(0x7ab4d0, SMOOTH | WARM));
      v.box(6, 6, 0, 7, 7, 4, white); v.box(1, 6, 0, 2, 7, 4, white); v.box(6, 1, 0, 7, 2, 4, white);
      onL(v, 6, 4, 5, 0, 4, C(0x8a98a4)); onL(v, 6, 2, 6, 2, 3, C(0xf4f4ee));
      faces(v, 1, 1, 7, 7, 4, 5, C(b)); faces(v, 1, 1, 7, 7, 5, 6, C(a, EMIT));
      if (lvl === 0) {
        parapet(v, 1, 1, 7, 7, sh, white); acs(v, r, 2, 2, 5, 4, sh, 2);
        v.box(2, 5, sh, 3, 6, sh + 4, C(0x8a8e96)); v.box(2, 5, sh + 4, 5, 6, sh + 7, C(0xf4f4ee)); onL(v, 5, 2, 5, sh + 4, sh + 7, C(a, EMIT)); onL(v, 5, 3, 4, sh + 5, sh + 6, C(0xfafff4, EMIT));
      } else {
        const wall = pick(r, CONC9), fl = lvl * 2 + 1, H = sh + fl * 3;
        v.box(1, 1, sh, 7, 7, H, mixc(wall));
        facade(v, r, 1, 1, 7, 7, sh, fl, 3, { glass: 0x4a5c72, lit: 0.3, gap: 1, wh: 2, sill: 1 });
        balconies(v, r, 'L', 6, 1, 7, sh, fl, 3, shade(wall[0], 0.3), mixc(wall));
        parapet(v, 1, 1, 7, 7, H, C(wall[1])); tank(v, 2, 2, H);
      }
      return v;
    },
    (r, lvl) => { // pencil building: one tenant per floor, stacked sign boards
      const v = new Vox(T, T, 50);
      const wall = pick(r, CONC9), fl = 5 + lvl * 2 + irand(r, 0, 1), H = fl * 3, cols = shuffle(r, SIGN9);
      v.box(2, 1, 0, 7, 7, H, mixc(wall));
      for (let f = 0; f < fl; f++) {
        const z = f * 3;
        onL(v, 6, 3, 6, z, z + 2, C(0x2e3a4a, SMOOTH | (r() < (f ? 0.38 : 1) ? light9(r) : 0)));
        if (f && r() < 0.42) onL(v, 6, 2, 7, z + 2, z + 3, C(cols[f % 4], EMIT));
        if (r() < 0.3) v.set(6, 2, z + 1, C(0x2e3a4a, SMOOTH | WARM));
      }
      for (let z = 3; z < H - 5;) { const len = pick(r, [2, 5, 5]); if (r() < 0.7) signV(v, 7, 4, z, len, cols[(z >> 1) % 5], 'y'); z += len + 1 + irand(r, 0, 2); }
      parapet(v, 2, 1, 7, 7, H, C(wall[1]));
      if (lvl === 2 || r() < 0.35) billboard(v, r, 'L', 6, 2, 7, H, 3, 'box', cols[5]); else tank(v, 3, 3, H);
      return v;
    },
    (r, lvl) => { // karaoke / arcade box
      const v = new Vox(T, T, 40);
      const wall = pick(r, [[0x3c3644, 0x36303e], [0x5a2c36, 0x502830], [0x2e3c4c, 0x2a3644], [0xdad6ce, 0xcecac2]]);
      const fl = 3 + lvl, H = fl * 4, cols = shuffle(r, [0xff4fc0, 0xffd24a, 0x35e0ff, 0xff4a3a, 0x6aff9a]);
      v.box(1, 1, 0, 7, 7, H, mixc(wall));
      onL(v, 6, 2, 6, 0, 3, C(0x4a3a4a, SMOOTH | WARM | COOL)); onL(v, 6, 1, 7, 3, 4, C(cols[0], EMIT));
      for (let f = 1; f < fl; f++) {
        const z = f * 4;
        if (f & 1) lightbox(v, r, 'L', 6, 2, 6, z + 1, z + 3, cols[1 + ((f >> 1) % 2)]);
        else onL(v, 6, 2, 6, z + 1, z + 3, C(0x2a2e3a, SMOOTH | (r() < 0.5 ? WARM | COOL : 0)));
        if (r() < 0.5) v.set(6, 2, z + 2, C(0x2a2e3a, SMOOTH | WARM));
      }
      for (let z = 5; z < H - 1; z++) v.set(6, 5, z, (z - 5) % 3 === 2 ? C(0x1c1a22) : C(cols[3], EMIT));
      parapet(v, 1, 1, 7, 7, H, C(wall[1]));
      v.box(3, 3, H, 5, 5, H + 2, C(0x3a3c44)); onL(v, 4, 3, 5, H, H + 2, C(cols[0], EMIT));
      return v;
    },
    (r, lvl) => { // capsule tower
      const v = new Vox(T, T, 46);
      const n = 4 + lvl * 2 + irand(r, 0, 1), s = irand(r, 0, 99);
      const pod = pick(r, [[0xe4e8f0, 0xd4d8e2], [0xece4d0, 0xdcd4c0], [0xcfe0dc, 0xbfd0cc], [0xe8cfc0, 0xd8bfb0]]);
      v.box(3, 3, 0, 5, 5, n * 3 + 2, C(0x4a4e5a));
      for (let i = 0; i < n; i++) {
        const z = i * 3, dx = hash(i, s) < 0.5 ? 0 : 1, dy = hash(i, s, 1) < 0.5 ? 0 : 1;
        v.box(1 + dx, 1 + dy, z, 6 + dx, 6 + dy, z + 2, C(pod[i & 1]));
        v.set(5 + dx, 3 + dy, z, C(0x1a2030, SMOOTH | (r() < 0.4 ? COOL : 0))); v.set(3 + dx, 5 + dy, z, C(0x1a2030, SMOOTH | (r() < 0.4 ? WARM : 0)));
      }
      if (r() < 0.4) v.set(4, 4, n * 3 + 2, C(0xff3b5a, EMIT));
      return v;
    },
    (r, lvl) => { // "mansion" apartment block with balconies
      const v = new Vox(T, T, 50);
      const wall = pick(r, [CONC9[1], CONC9[2], CONC9[4], CONC9[5], [0xc8a890, 0xbc9c84]]);
      const fl = 4 + lvl * 2 + irand(r, 0, 1), H = fl * 3;
      v.box(1, 1, 0, 7, 7, H, mixc(wall));
      facade(v, r, 1, 1, 7, 7, 0, fl, 3, { glass: 0x4a5c72, lit: 0.3, gap: 1, wh: 2, sill: 1 });
      balconies(v, r, 'L', 6, 1, 7, 3, fl - 1, 3, shade(wall[0], 0.3), mixc(wall));
      onL(v, 6, 1, 7, 0, 3, mixc(wall)); onL(v, 6, 3, 5, 0, 2, C(0x5a4a3a, SMOOTH | WARM));
      parapet(v, 1, 1, 7, 7, H, C(wall[1])); tank(v, 2, 2, H); acs(v, r, 4, 2, 6, 6, H, 1);
      return v;
    },
    (r, lvl) => { // slim glass office
      const v = new Vox(T, T, 66);
      const [g0, g1, fr] = pick(r, GLASS9), fl = 6 + lvl * 4 + irand(r, 0, 2), H = fl * 3;
      v.box(1, 1, 0, 7, 7, H, C(fr));
      ribbon(v, r, 1, 1, 7, 7, 0, fl, 3, { glass: (z) => lerpc(g0, g1, z / H), m: 0, sill: 0, wh: 2, seg: 2, lit: 0.26, light: light9 });
      for (let z = 0; z < H; z++) v.set(6, 6, z, C(fr));
      const k = irand(r, 0, 2);
      if (k === 0) { parapet(v, 1, 1, 7, 7, H, C(fr)); billboard(v, r, 'L', 6, 1, 7, H, 3, 'box'); }
      else if (k === 1) { v.box(2, 2, H, 6, 6, H + 2, C(shade(fr, -0.2))); mast(v, 4, 4, H + 2, 6); }
      else for (let i = 0; i < 5; i++) v.box(1, 1, H + i, 7 - i, 7, H + i + 1, C(g1, SMOOTH));
      return v;
    },
  ],
  // shopping street -> housing -> love hotel -> entertainment -> department store -> video tower -> offices -> hotel -> station
  large: [
    (r, lvl) => { // covered shopping arcade between two rows of shop-houses
      const v = new Vox(16, 16, 36);
      const WALLS = [[0xdcd0b6, 0xd0c4aa], [0x8c6a50, 0x805e46], [0xc8c4bc, 0xbcb8b0], [0x6a4a34, 0x5e402c], [0xb85a44, 0xac5040], [0xe6e4de, 0xdad8d2]];
      const row = (y0: number, fls: number[], front: boolean) => {
        let x = 1;
        fls.forEach((f, i) => {
          const x1 = i === fls.length - 1 ? 15 : x + irand(r, 4, 5), y1 = y0 + 5, H = f * 4, wall = pick(r, WALLS);
          v.box(x, y0, 0, x1, y1, H, mixc(wall));
          onL(v, y1 - 1, x + 1, x1, 0, 3, C(0x5a4630, SMOOTH | WARM));
          for (let k = 1; k < f; k++) for (let a = x + 1; a < x1 - 1; a += 2) onL(v, y1 - 1, a, a + 1, k * 4 + 1, k * 4 + 3, C(0x4a5c72, SMOOTH | (r() < 0.45 ? WARM : 0)));
          if (i === fls.length - 1) for (let k = 1; k < f; k++) onR(v, x1 - 1, y0 + 1, y0 + 3, k * 4 + 1, k * 4 + 3, C(0x4a5c72, SMOOTH | (r() < 0.45 ? WARM : 0)));
          if (front) {
            const aw = pick(r, [0xc8423a, 0x2f6fb0, 0x3f8a5a, 0xe0a030, 0x7a3a8a]);
            for (let a = x; a < x1; a++) v.set(a, y1, 3, C((a - x) & 1 ? aw : 0xf0e8d8));
            for (let a = x + 1; a < x1; a += 2) if (r() < 0.55) v.set(a, y1, 2, C(LANTERN, EMIT));
          }
          if (f > 1 && r() < 0.55) lightbox(v, r, 'L', y1 - 1, x + 1, x1 - 1, 4, 5, pick(r, SIGN9));
          if (r() < 0.5) gable(v, x, y0, x1, y1, H, 'x', pick(r, ROOF9), mixc(wall), 0);
          else { parapet(v, x, y0, x1, y1, H, C(wall[1])); acs(v, r, x + 1, y0 + 1, x1 - 1, y1 - 1, H, 1); }
          x = x1;
        });
      };
      row(1, [2 + lvl, 3 + (lvl >> 1), 2 + lvl], false);
      row(10, shuffle(r, [1, 2, 2]), true);
      for (let x = 1; x < 15; x++) { // arched arcade roof
        const c = x % 4 === 1 ? C(0xe8e8e0) : C(0xa8d8d0, SMOOTH);
        v.set(x, 6, 8, c); v.set(x, 9, 8, c); v.set(x, 7, 9, c); v.set(x, 8, 9, c);
      }
      const gc = C(pick(r, [0xd8342a, 0x2a8a5a, 0x2f6fb0]));
      v.box(14, 6, 0, 15, 7, 9, gc); v.box(14, 9, 0, 15, 10, 9, gc);
      lightbox(v, r, 'R', 14, 6, 10, 7, 9, 0xffd24a, 0x8a2a1a);
      v.set(15, 6, 5, C(LANTERN, EMIT)); v.set(15, 9, 5, C(LANTERN, EMIT));
      return v;
    },
    (r, lvl) => { // housing estate: two balcony slabs
      const v = new Vox(16, 16, 70);
      const wall = pick(r, [[0xe6e2d8, 0xdad6cc], [0xd8cdb4, 0xccc1a8], [0xc4ccd0, 0xb8c0c4], [0xd8c0b0, 0xccb4a4]]);
      const acc = pick(r, [0xe07a4a, 0x4a9ad8, 0x5ab88a, 0xe0b040, 0xd86a8a]);
      const slabAt = (y0: number, fl: number) => {
        const H = fl * 3;
        v.box(1, y0, 0, 15, y0 + 5, H, mixc(wall));
        balconies(v, r, 'L', y0 + 4, 1, 15, 0, fl, 3, shade(wall[0], 0.35), mixc(wall));
        for (const a of [5, 10]) { onL(v, y0 + 4, a, a + 1, 0, H, C(shade(wall[0], -0.12))); for (let f = 0; f < fl; f++) if (r() < 0.3) v.set(a, y0 + 4, f * 3 + 1, C(0x4a5c72, SMOOTH | WARM)); }
        onR(v, 14, y0 + 2, y0 + 3, 3, H - 1, C(acc));
        parapet(v, 1, y0, 15, y0 + 5, H, C(wall[1])); tank(v, 3, y0 + 1, H, 0xc8d4d8); tank(v, 11, y0 + 2, H);
      };
      slabAt(1, 9 + lvl * 5 + irand(r, 0, 2)); slabAt(10, 5 + lvl * 2 + irand(r, 0, 1));
      treeAt(v, 4, 7, 0, 1.8); treeAt(v, 11, 7, 0, 1.8, CHERRY, 0xffffff, 3);
      return v;
    },
    (r, lvl) => { // pastel love-hotel castle
      const v = new Vox(16, 16, 70);
      const [b0, b1, rc, neon] = pick(r, [[0xf2bccb, 0xe8b0c0, 0xd85a80, 0xff4fc0], [0xbfe6d6, 0xb2dccb, 0x3a9a8a, 0x35e0ff], [0xd0c2ee, 0xc4b6e4, 0x7a5ac8, 0xff8ad9], [0xf6e8c4, 0xecdcb6, 0xd86a4a, 0xffd24a]]);
      const fl = 4 + lvl * 2, H = fl * 3;
      v.box(3, 3, 0, 13, 13, H, mixc([b0, b1]));
      facade(v, r, 3, 3, 13, 13, 3, fl - 1, 3, { glass: 0x4a3a5a, lit: 0.35, light: WARM | COOL, ww: 1, gap: 2, wh: 2, sill: 0, m: 2 });
      faces(v, 3, 3, 13, 13, H - 1, H, C(0xfaf4f0)); crenel(v, 3, 3, 13, 13, H, C(0xfaf4f0));
      for (const [cx, cy, eh] of [[3, 3, 5], [13, 3, 9], [3, 13, 9], [13, 13, 6]]) {
        cyl(v, cx, cy, 2.2, 0, H + eh, C(shade(b0, 0.25)));
        cyl(v, cx, cy, 2.2, H + eh - 1, H + eh, C(0xfaf4f0));
        cone(v, cx, cy, 2.9, H + eh, 6, [rc, shade(rc, -0.1)]);
      }
      const kh = 7 + lvl * 3;
      v.box(6, 6, H, 10, 10, H + kh, mixc([b0, b1])); hip(v, 6, 6, 10, 10, H + kh, [rc, shade(rc, -0.1)], 1);
      v.set(9, 8, H + kh - 3, C(0x4a3a5a, SMOOTH | WARM | COOL)); v.set(8, 9, H + kh - 3, C(0x4a3a5a, SMOOTH | WARM | COOL));
      const hz = H - 3, heart = ['01010', '11111', '11111', '01110', '00100'];
      heart.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '1') v.set(6 + i, 12, hz - j, C(neon, EMIT)); }));
      onL(v, 12, 7, 9, 0, 3, C(0x3a2a3a, SMOOTH | WARM | COOL));
      lightbox(v, r, 'R', 12, 6, 10, 4, 5, neon);
      return v;
    },
    (r, lvl) => { // pachinko / karaoke complex: banners and stacked floor signs on a dark body
      const v = new Vox(16, 16, 80);
      const wall = pick(r, [[0x3c3644, 0x36303e], [0x4e2c36, 0x462830], [0x2c3c4c, 0x283644], [0x54504c, 0x4c4844]]);
      const fl = 6 + lvl * 3, H = fl * 3, cols = shuffle(r, SIGN9);
      v.box(1, 2, 0, 15, 14, H, mixc(wall));
      faces(v, 1, 2, 15, 14, 0, 3, C(0x5a4636, SMOOTH | WARM)); v.box(14, 13, 0, 15, 14, 3, mixc(wall));
      for (let a = 1; a < 15; a++) v.set(a, 13, 3, a & 1 ? C(0xffd24a, EMIT) : C(0x8a2a1a));
      for (let i = 0; i < 3; i++) if (r() < 0.85) {
        const a = 3 + i * 4, z0 = irand(r, 5, 8), z1 = H - irand(r, 1, 5 + lvl * 3);
        for (let z = z0; z < z1; z++) onL(v, 13, a, a + 2, z, z + 1, (z - z0) % 4 === 3 ? C(0x1c1a22) : C(cols[i], EMIT));
      }
      for (let f = 1; f < fl; f++) {
        const z = f * 3 + 1;
        if (r() < 0.4) { const b0 = irand(r, 3, 8); lightbox(v, r, 'R', 14, b0, b0 + irand(r, 3, 5), z, z + 1, cols[3 + (f % 3)]); }
        else for (let b = 4; b < 12; b += 3) if (r() < 0.5) onR(v, 14, b, b + 1, z, z + 2, C(0x2a2e3a, SMOOTH | (r() < 0.4 ? WARM : 0)));
      }
      parapet(v, 1, 2, 15, 14, H, C(wall[1]));
      billboard(v, r, 'L', 12, 3, 13, H, 4, 'box', cols[6]); acs(v, r, 3, 4, 12, 10, H, 3);
      return v;
    },
    (r, lvl) => { // department store with roof garden and a wheel
      const v = new Vox(16, 16, 80);
      const wall = pick(r, [[0xeadec6, 0xded2ba], [0xc87052, 0xbc664a], [0xe8e8e4, 0xdcdcd8], [0xaab2ba, 0x9ea6ae]]);
      const acc = pick(r, [0xd8342a, 0x2a5aa8, 0x1e7a5a, 0x8a2a6a]);
      const fl = 4 + lvl, H = fl * 4;
      v.box(1, 1, 0, 15, 15, H, mixc(wall));
      for (let a = 2; a < 14; a += 3) { onL(v, 14, a, a + 2, 0, 3, C(0x6a5a40, SMOOTH | WARM)); onR(v, 14, a, a + 2, 0, 3, C(0x6a5a40, SMOOTH | WARM)); }
      faces(v, 1, 1, 15, 15, 3, 4, C(acc));
      for (let f = 1; f < fl; f++) for (let a = 2; a < 14; a += 3) {
        const z = f * 4 + 1;
        onL(v, 14, a, a + 1, z, z + 2, C(0x3a4656, SMOOTH | (r() < 0.3 ? WARM : 0)));
        onR(v, 14, a + 1, a + 2, z, z + 2, C(0x3a4656, SMOOTH | (r() < 0.3 ? WARM : 0)));
      }
      for (const a of [4, 7, 10]) if (r() < 0.75) onL(v, 14, a, a + 1, 5, H - 2, C(pick(r, [0xd8342a, 0xf0f0e8, 0x2a5aa8, 0xe0b030])));
      parapet(v, 1, 1, 15, 15, H, C(wall[1]), 0x7a8a6a);
      hedge(v, r, 2, 9, 10, 14, H, 0.5); treeAt(v, 3, 11, H, 1.7); treeAt(v, 12, 3, H, 1.7, CHERRY, 0xffffff, 2);
      v.box(11, 11, H, 15, 15, H + 5, mixc(wall));
      lightbox(v, r, 'L', 14, 12, 14, H + 1, H + 4, 0xfff4d8, acc); lightbox(v, r, 'R', 14, 12, 14, H + 1, H + 4, 0xfff4d8, acc);
      if (lvl >= 1) wheel(v, r, 6, 6, H + 6 + lvl, 4 + lvl);
      else for (let x = 3; x < 11; x += 2) { v.box(x, 6, H, x + 1, 7, H + 2, C(0x4a4a50)); v.set(x, 6, H + 2, C(LANTERN, EMIT)); }
      return v;
    },
    (r, lvl) => { // tower with one big video wall
      const v = new Vox(16, 16, 110);
      const wall = pick(r, [[0x8e929c, 0x848892], [0x5c6272, 0x545a68], [0xbab8b2, 0xb0aea8], [0x404858, 0x3a4250]]);
      const fl = 12 + lvl * 6 + irand(r, 0, 2), H = fl * 3;
      v.box(1, 2, 0, 15, 14, H, mixc(wall));
      ribbon(v, r, 1, 2, 15, 14, 3, fl - 1, 3, { glass: 0x3a4a60, lit: 0.3, seg: 2, gap: 1, wh: 1, light: light9 });
      faces(v, 1, 2, 15, 14, 0, 2, C(0x5a4a3a, SMOOTH | WARM)); lightbox(v, r, 'L', 13, 2, 14, 2, 3, pick(r, SIGN9));
      const sh = 12 + lvl * 4, z1 = H - 3, z0 = z1 - sh;
      onL(v, 13, 2, 14, z0 - 1, z1 + 1, C(0x15151b)); video(v, r, 'L', 13, 3, 13, z0, z1);
      signV(v, 15, 4, 5, Math.min(11, z0 - 8), pick(r, SIGN9), 'y');
      parapet(v, 1, 2, 15, 14, H, C(wall[1])); acs(v, r, 6, 4, 13, 12, H, 3); mast(v, 3, 4, H, 8 + lvl * 2);
      return v;
    },
    (r, lvl) => { // concrete office tower with a rooftop billboard frame
      const v = new Vox(16, 16, 110);
      const wall = pick(r, [CONC9[0], CONC9[1], CONC9[2], CONC9[3], CONC9[5]]), wd = [shade(wall[0], -0.2), shade(wall[1], -0.2)];
      const fl = 9 + lvl * 6 + irand(r, 0, 2), z0 = 8, H = z0 + fl * 3;
      v.box(1, 1, 0, 15, 15, z0, mixc(wd));
      for (let a = 2; a < 14; a += 4) {
        onL(v, 14, a, a + 3, 0, 3, C(0x5a4a3a, SMOOTH | (r() < 0.7 ? WARM : 0))); onR(v, 14, a, a + 3, 0, 3, C(0x5a4a3a, SMOOTH | (r() < 0.7 ? WARM : 0)));
        if (r() < 0.6) lightbox(v, r, r() < 0.6 ? 'L' : 'R', 14, a, a + 3, 4, 6, pick(r, SIGN9));
      }
      v.box(2, 2, z0, 13, 13, H, mixc(wall));
      facade(v, r, 2, 2, 13, 13, z0, fl, 3, { glass: 0x4a5c72, lit: 0.3, ww: 2, gap: 1, wh: 2, sill: 1, m: 1, light: light9 });
      v.box(4, 4, H, 11, 11, H + 3, mixc(wd)); acs(v, r, 5, 5, 10, 10, H + 3, 2);
      billboard(v, r, 'L', 12, 2, 13, H, 5 + lvl, r() < 0.3 ? 'video' : 'box');
      if (r() < 0.5) billboard(v, r, 'R', 12, 3, 12, H, 4, 'box');
      return v;
    },
    (r, lvl) => { // glass corporate tower
      const v = new Vox(16, 16, 136);
      const [g0, g1, fr] = pick(r, GLASS9), fl = 14 + lvl * 7 + irand(r, 0, 3), H = fl * 3;
      v.box(2, 2, 0, 14, 14, H, C(fr));
      ribbon(v, r, 2, 2, 14, 14, 0, fl, 3, { glass: (z) => lerpc(g0, g1, z / H), m: 0, sill: 0, wh: 2, seg: 3, lit: 0.24, light: (q) => (q() < 0.5 ? COOL : WARM) });
      for (let z = 0; z < H; z++) { v.set(13, 13, z, C(fr)); v.set(2, 13, z, C(fr)); v.set(13, 2, z, C(fr)); }
      faces(v, 2, 2, 14, 14, 0, 4, (x, y) => C(0x6a6050, SMOOTH | ((x + y) % 4 < 2 ? WARM : 0))); faces(v, 2, 2, 14, 14, 4, 5, C(fr));
      const k = irand(r, 0, 2);
      if (k === 0) for (let i = 0; i < 10; i++) v.box(2, 2, H + i, 14 - i, 14, H + i + 1, C(lerpc(g1, 0xffffff, 0.25), SMOOTH)); // slanted crown
      else if (k === 1) { // setbacks + spire
        v.box(4, 4, H, 12, 12, H + 6, C(fr)); ribbon(v, r, 4, 4, 12, 12, H, 2, 3, { glass: g1, m: 0, sill: 0, lit: 0.6, even: true, light: COOL });
        v.box(6, 6, H + 6, 10, 10, H + 10, C(fr)); mast(v, 8, 8, H + 10, 12);
      } else { // helipad + twin masts
        parapet(v, 2, 2, 14, 14, H, C(fr)); cyl(v, 8, 8, 4, H, H + 1, C(0x4a4e58)); v.box(7, 6, H + 1, 9, 10, H + 1, 0);
        for (const [x, y] of [[7, 6], [7, 9], [8, 6], [8, 9], [7, 7], [8, 8]]) v.set(x, y, H, C(0xf0f0e8));
        mast(v, 3, 3, H + 1, 9); mast(v, 12, 3, H + 1, 6);
      }
      return v;
    },
    (r, lvl) => { // round hotel tower with a rooftop restaurant disc
      const v = new Vox(16, 16, 136);
      const fl = 14 + lvl * 7 + irand(r, 0, 2), H = fl * 3, s = irand(r, 0, 999);
      const wall = pick(r, [0xe8e6e0, 0xdccdae, 0xbcc8d0, 0x94705e]), glass = pick(r, [0x4a5c72, 0x2e4e58]);
      const kf = Array.from({ length: fl + 2 }, () => pick(r, [0.1, 0.5, 1, 1.6]));
      cyl(v, 8, 8, 5.7, 0, H, (x, y, z) => {
        if (z % 3 !== 1 || z < 3) return C(z < 3 ? shade(wall, -0.25) : z % 3 ? wall : shade(wall, -0.07));
        const f = Math.floor(z / 3), a = Math.floor((Math.atan2(y - 7.5, x - 7.5) + 4) * 3.2);
        return C(glass, SMOOTH | (hash(a, f, s) < 0.24 * kf[f] ? WARM : 0));
      });
      const k = irand(r, 0, 2);
      if (k < 2) {
        cyl(v, 8, 8, 7.3, H, H + 1, C(shade(wall, -0.1)));
        cyl(v, 8, 8, 7.3, H + 1, H + 3, (x, y) => C(0x4a4438, SMOOTH | (hash(x, y, s) < 0.7 ? WARM : 0)));
        cyl(v, 8, 8, 7.3, H + 3, H + 4, C(wall)); cyl(v, 8, 8, 2.5, H + 4, H + 6, C(shade(wall, -0.15)));
        mast(v, 8, 8, H + 6, k ? 12 : 6);
      } else { ball(v, 8, 8, H, 5.7, 4.5, C(0x9ad0d8, SMOOTH)); mast(v, 8, 8, H + 4, 6); }
      return v;
    },
    (r, lvl) => { // elevated rail station
      const v = new Vox(16, 16, 44);
      const line = pick(r, [0x4ab04a, 0xe8842a, 0x2f8fd8, 0xe0c020, 0xd83a4a]);
      const wall = pick(r, [CONC9[0], CONC9[2], CONC9[3]]), fl = 2 + lvl * 2, H = fl * 3;
      v.box(1, 1, 0, 15, 6, H, mixc(wall)); // station building at the back
      ribbon(v, r, 1, 1, 15, 6, 6, Math.max(0, fl - 2), 3, { glass: 0x4a5c72, lit: 0.4, seg: 2 });
      if (fl > 2) lightbox(v, r, 'L', 5, 3, 13, H - 2, H, 0xfff4d8, line);
      parapet(v, 1, 1, 15, 6, H, C(wall[1])); acs(v, r, 3, 2, 12, 4, H, 2);
      for (const x of [1, 7, 13]) v.box(x, 7, 0, x + 2, 10, 6, C(0x9a9890)); // viaduct
      v.box(0, 6, 6, 16, 11, 8, mixc([0xa8a69e, 0x9e9c94])); v.box(0, 10, 8, 16, 11, 9, C(0xb8b6ae));
      onL(v, 10, 4, 12, 6, 8, C(0xfff4d8, EMIT)); onL(v, 10, 4, 12, 6, 7, C(line, EMIT));
      const t0 = irand(r, 1, 3);
      v.box(t0, 7, 8, t0 + 12, 10, 12, C(0xe4e6ea, SMOOTH)); v.box(t0, 7, 12, t0 + 12, 10, 13, C(0x9aa0a8));
      onL(v, 9, t0, t0 + 12, 9, 10, C(line));
      for (let a = t0 + 1; a < t0 + 11; a++) if ((a - t0) % 4 !== 0) onL(v, 9, a, a + 1, 10, 12, C(0x2e3a4a, SMOOTH | WARM));
      onR(v, t0 + 11, 7, 10, 10, 12, C(0x2e3a4a, SMOOTH)); v.set(t0 + 11, 9, 9, C(0xfff2b0, EMIT));
      if (lvl > 0) { for (const x of [1, 8, 14]) v.box(x, 6, 8, x + 1, 7, 15, C(0x7a7e86)); v.box(0, 6, 15, 16, 10, 16, C(0xd8dce0)); v.box(0, 7, 15, 16, 9, 16, C(0xa8d0d0, SMOOTH)); }
      v.box(2, 12, 0, 6, 15, 3, C(0xe0e0da)); onL(v, 14, 2, 6, 1, 2, C(0x5a4a3a, SMOOTH | WARM)); v.box(2, 12, 3, 6, 15, 4, C(line)); // kiosk
      for (let k = 0; k < 4; k++) v.box(9 + k, 11, 0, 10 + k, 13, 5 - k, C(0xb0aea6)); // stairs
      treeAt(v, 13, 13, 0, 1.6);
      return v;
    },
  ],
  huge: [
    (r, lvl) => { // covered market hall: three glass barrel vaults
      const v = new Vox(24, 24, 34);
      const wall = pick(r, [[0xb85a44, 0xac5040], [0xdcd0b6, 0xd0c4aa], [0xc8c4bc, 0xbcb8b0]]), iron = pick(r, [0x3a5a50, 0x4a4e58, 0x7a3a2a]);
      const h = 6 + lvl;
      v.box(1, 1, 0, 23, 23, h, mixc(wall));
      for (const [y0, y1] of [[1, 8], [8, 16], [16, 23]]) {
        const c = (y0 + y1) / 2, hw = (y1 - y0) / 2;
        for (let y = y0; y < y1; y++) {
          const hh = Math.max(1, Math.round(Math.sqrt(Math.max(0, 1 - ((y + 0.5 - c) / hw) ** 2)) * 5));
          for (let x = 1; x < 23; x++) v.box(x, y, h, x + 1, y + 1, h + hh, x % 5 === 1 || x === 22 ? C(iron) : C(0xa8d4cc, SMOOTH));
          onR(v, 22, y, y + 1, h, h + hh, C(0x7a6a4a, SMOOTH | WARM)); onR(v, 22, y, y + 1, h + hh - 1, h + hh, C(iron));
        }
        onR(v, 22, y0 + 2, y1 - 2, 0, 4, C(0x4a3a2a, SMOOTH | WARM));
      }
      for (let a = 2; a < 22; a += 5) { // stalls along the front
        const aw = pick(r, [0xc8423a, 0x2f6fb0, 0x3f8a5a, 0xe0a030]);
        onL(v, 22, a, a + 4, 0, 3, C(0x5a4630, SMOOTH | WARM));
        for (let x = a; x < a + 4; x++) v.set(x, 23, 3, C((x - a) & 1 ? aw : 0xf0e8d8));
        v.set(a + 1, 23, 2, C(LANTERN, EMIT)); if (r() < 0.6) lightbox(v, r, 'L', 22, a, a + 4, 4, 5, pick(r, SIGN9));
      }
      v.box(10, 10, h + 4, 14, 14, h + 9, mixc(wall)); hip(v, 10, 10, 14, 14, h + 9, [iron], 1); mast(v, 12, 12, h + 12, 4, 0xffd24a);
      return v;
    },
    (r, lvl) => { // stadium: closed dome or open bowl
      const v = new Vox(24, 24, 50);
      const seat = pick(r, [0x2f6fb0, 0xc8423a, 0xe0a030, 0x3f8a5a]), s = irand(r, 0, 99);
      cyl(v, 12, 12, 11.4, 0, 7, (x, y, z) => (z === 4 ? C(seat) : z < 3 && (x + y) % 3 === 0 ? C(0x5a5650, SMOOTH | (hash(x, y, s) < 0.5 ? WARM : 0)) : C(0xd8d4cc)));
      if (lvl === 1) {
        ball(v, 12, 12, 7, 10.6, 7.5, (x, y) => (Math.floor((Math.atan2(y - 11.5, x - 11.5) + 4) * 3.5) % 2 ? C(0xf2f4f6, SMOOTH) : C(0xe2e6ea, SMOOTH)));
        cyl(v, 12, 12, 1.6, 13, 15, C(0xb8c0c8)); v.set(12, 12, 15, C(0xff3b3b, EMIT));
      } else {
        cyl(v, 12, 12, 10, 1, 8, 0);
        for (let k = 0; k < 5; k++) { cyl(v, 12, 12, 10 - k, 1, 6 - k, (x, y) => C(hash(x, y, s) < 0.3 ? 0xe8e4dc : (x + y + k) % 5 === 0 ? 0xf0f0e8 : seat)); cyl(v, 12, 12, 9 - k, 1, 8, 0); }
        cyl(v, 12, 12, 6, 0, 1, (x, y) => C((x + y) % 4 < 2 ? 0x4a9a4a : 0x55a653)); v.box(8, 12, 0, 16, 13, 1, C(0xf0f0e8));
        for (const [x, y] of [[2, 2], [21, 2], [2, 21], [21, 21]]) { v.box(x, y, 0, x + 1, y + 1, 22, C(0x8a8e96)); v.box(x - 1, y - 1, 22, x + 2, y + 2, 25, C(0x8a8e96)); v.box(x - 1, y + 1, 22, x + 2, y + 2, 25, (X, _Y, Z) => ((X + Z) & 1 ? C(0xfff8e0, EMIT) : C(0xb8bcc4))); v.box(x + 1, y - 1, 22, x + 2, y + 1, 25, (_X, Y, Z) => ((Y + Z) & 1 ? C(0xfff8e0, EMIT) : C(0xb8bcc4))); }
      }
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; if (Math.cos(a) + Math.sin(a) > -0.3) v.set(12 + Math.cos(a) * 11.6, 12 + Math.sin(a) * 11.6, 7, C(0xfff4d8, EMIT)); }
      return v;
    },
    (r, lvl) => { // mixed-use complex: podium, glass tower and hotel slab
      const v = new Vox(24, 24, 150);
      const stone = pick(r, [[0xd8d4cc, 0xccc8c0], [0xcfc4ae, 0xc3b8a2], [0xa2a6ae, 0x969aa2]]);
      v.box(1, 1, 0, 23, 23, 12, mixc(stone));
      for (let a = 2; a < 22; a += 4) { onL(v, 22, a, a + 3, 0, 3, C(0x5a4a3a, SMOOTH | WARM)); onR(v, 22, a, a + 3, 0, 3, C(0x5a4a3a, SMOOTH | WARM)); }
      onL(v, 22, 11, 22, 4, 11, C(0x15151b)); video(v, r, 'L', 22, 12, 21, 5, 10);
      for (let b = 3; b < 20; b += 6) if (r() < 0.7) lightbox(v, r, 'R', 22, b, b + 4, 5 + irand(r, 0, 3), 7 + irand(r, 0, 3), pick(r, SIGN9));
      parapet(v, 1, 1, 23, 23, 12, C(stone[1]), 0x7a8a6a); hedge(v, r, 11, 13, 22, 22, 12, 0.45); treeAt(v, 13, 18, 12, 2); treeAt(v, 19, 15, 12, 1.8, CHERRY, 0xffffff, 5);
      const [g0, g1, fr] = pick(r, GLASS9), fa = 18 + lvl * 6, HA = 12 + fa * 3;
      v.box(12, 2, 12, 22, 12, HA, C(fr));
      ribbon(v, r, 12, 2, 22, 12, 12, fa, 3, { glass: (z) => lerpc(g0, g1, (z - 12) / (fa * 3)), m: 0, sill: 0, wh: 2, seg: 3, lit: 0.25, light: (q) => (q() < 0.5 ? COOL : WARM) });
      for (let z = 12; z < HA; z++) v.set(21, 11, z, C(fr));
      for (let i = 0; i < 8; i++) v.box(12, 2, HA + i, 22 - i, 12, HA + i + 1, C(lerpc(g1, 0xffffff, 0.25), SMOOTH));
      mast(v, 13, 3, HA + 8, 10);
      const wall = pick(r, [CONC9[1], CONC9[2], CONC9[5]]), fb = 10 + lvl * 3, HB = 12 + fb * 3;
      v.box(2, 12, 12, 10, 22, HB, mixc(wall));
      balconies(v, r, 'L', 21, 2, 10, 12, fb, 3, shade(wall[0], 0.35), mixc(wall)); facade(v, r, 2, 12, 10, 21, 12, fb, 3, { glass: 0x4a5c72, lit: 0.3, gap: 1, wh: 2, sill: 1 });
      parapet(v, 2, 12, 10, 22, HB, C(wall[1])); billboard(v, r, 'L', 21, 3, 9, HB, 3, 'box'); tank(v, 4, 14, HB);
      return v;
    },
    (r, lvl) => { // container port: stacks, gantry cranes, a shed
      const v = new Vox(24, 24, 60);
      const CONT9 = [0xc8423a, 0x2f6fb0, 0x3f8a5a, 0xe0a030, 0x8a8e94, 0xe8e4dc, 0x7a3a2a, 0x2a8a8a];
      v.box(0, 0, 0, 24, 24, 1, mixc([0x8a8c92, 0x82848a]));
      for (let x = 1; x < 22; x += 7)
        for (let y = 12; y < 23; y += 4) {
          const n = irand(r, 1, 2 + lvl);
          for (let k = 0; k < n; k++) for (const dx of [0, 3]) if (k < n - 1 || r() < 0.7) {
            const c = pick(r, CONT9);
            v.box(x + dx, y, 1 + k * 2, x + dx + 3, y + 3, 3 + k * 2, (_x, yy) => C(yy & 1 ? c : shade(c, -0.1)));
          }
        }
      const crane = (x: number) => {
        const red = pick(r, [0xe8442a, 0xe8a020, 0x2f6fb0]), hC = 20 + lvl * 3;
        for (const y of [3, 9]) { v.box(x, y, 1, x + 1, y + 1, hC, C(red)); v.box(x + 3, y, 1, x + 4, y + 1, hC, C(red)); }
        v.box(x, 3, hC - 8, x + 4, 4, hC - 7, C(red)); v.box(x, 9, hC - 8, x + 4, 10, hC - 7, C(red));
        v.box(x + 1, 0, hC, x + 3, 20, hC + 1, C(0xf0f0e8)); v.box(x, 3, hC, x + 4, 10, hC + 1, C(red));
        for (let k = 0; k < 6; k++) { v.set(x + 1, 6 + k, hC + 6 - k, C(red)); v.set(x + 1, 6 - k, hC + 6 - k, C(red)); }
        v.box(x + 1, 6, hC + 1, x + 2, 7, hC + 7, C(red)); v.set(x + 1, 6, hC + 7, C(0xff3b3b, EMIT));
        const ty = irand(r, 12, 17);
        v.box(x + 1, ty, hC - 2, x + 3, ty + 2, hC, C(0x4a4e58)); v.box(x + 2, ty, hC - 8, x + 3, ty + 1, hC - 2, C(0x3a3c44));
        v.box(x + 1, ty - 1, hC - 10, x + 4, ty + 2, hC - 8, C(pick(r, CONT9)));
        v.set(x + 3, 9, hC - 1, C(0xffe9a8, EMIT)); v.set(x + 2, 19, hC - 1, C(0xffe9a8, EMIT));
      };
      crane(3); if (lvl > 1) crane(13);
      const sx = lvl > 1 ? 19 : 12;
      v.box(sx, 1, 1, 23, 10, 7, mixc([0xb8c0c4, 0xacb4b8])); gable(v, sx, 1, 23, 10, 7, 'y', [0x5a7a8a, 0x527080], mixc([0xb8c0c4, 0xacb4b8]), 0);
      onL(v, 9, sx + 1, 22, 1, 5, C(0x4a4038, SMOOTH | WARM)); onR(v, 22, 2, 9, 3, 5, C(0x4a5c72, SMOOTH));
      return v;
    },
  ],
  fill: [
    (r) => { // night market stalls
      const v = new Vox(T, T, 8);
      for (const y0 of [0, 5]) {
        const aw = pick(r, [0xc8423a, 0x2f6fb0, 0xe0a030]);
        v.box(1, y0, 0, 7, y0 + 2, 2, C(0x4a3a2c));
        for (let x = 1; x < 7; x++) v.set(x, y0 + 2, 3, C(x & 1 ? aw : 0xf0e8d8));
        v.box(1, y0, 3, 7, y0 + 2, 4, C(aw));
        for (const x of [1, 3, 5]) v.set(x, y0 + 2, 2, C(pick(r, [LANTERN, 0xffd24a, 0xffa03a]), EMIT));
      }
      return v;
    },
    (r) => { // pocket shrine with torii
      const v = new Vox(T, T, 16);
      const red = C(0xd8342a);
      for (const x of [1, 6]) v.box(x, 6, 0, x + 1, 7, 6, red);
      v.box(0, 6, 5, 8, 7, 6, red); v.box(0, 6, 6, 8, 7, 7, C(0x2a2a2e)); v.box(1, 6, 3, 7, 7, 4, red);
      v.box(3, 1, 0, 6, 4, 3, C(0x8a5a3a)); hip(v, 3, 1, 6, 4, 3, pick(r, ROOF9), 1);
      v.set(2, 5, 0, C(0x8a8a80)); v.set(2, 5, 1, C(0xffd24a, EMIT));
      return v;
    },
    (r) => { // vending machines under a cherry tree
      const v = new Vox(T, T, 16);
      for (const x of [1, 3, 5]) { v.box(x, 1, 0, x + 2, 2, 4, C(pick(r, [0xe8e4dc, 0xc8342c, 0x2f6fb0]))); v.box(x, 1, 1, x + 2, 2, 3, C(pick(r, [0x9fe8ff, 0xf4f8ff, 0xffe08a]), EMIT)); }
      treeAt(v, 5, 5, 0, 2, CHERRY, 0xffffff, irand(r, 0, 9));
      return v;
    },
    (r) => { // cherry tree and lamp
      const v = new Vox(T, T, 16);
      treeAt(v, 3, 3, 0, 2.5, CHERRY, 0xffffff, irand(r, 0, 9));
      v.box(6, 6, 0, 7, 7, 4, C(0x2e2e34)); v.set(6, 6, 4, C(0xffd8a0, EMIT));
      return v;
    },
    (r) => { // raked gravel garden
      const v = new Vox(T, T, 12);
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) v.set(x, y, 0, C((x + (y >> 2)) & 1 ? 0xd8d2c0 : 0xcfc8b4));
      ball(v, 2.5, 5, 0.5, 1.4, 1.5, mixc([0x7d796f, 0x6b675f], ROUGH)); v.set(5, 2, 1, C(0x8f8b82, ROUGH)); v.set(6, 2, 1, C(0x7d796f, ROUGH));
      treeAt(v, 5, 5, 1, 1.7, [0x1c4436, 0x275a44, 0x357452, 0x4b8f5f], undefined, irand(r, 0, 9));
      return v;
    },
    (r) => { // coin parking
      const v = new Vox(T, T, 12);
      for (const y of [0, 4]) for (const x of [1, 4]) if (r() < 0.7) {
        const c = pick(r, [0xc8342c, 0x2f6fb0, 0xe8e4dc, 0x2a2c30, 0xe0c030, 0x8ac8d8]);
        v.box(x, y, 0, x + 2, y + 3, 1, C(c)); v.box(x, y + 1, 1, x + 2, y + 3, 2, C(c)); v.box(x, y + 1, 1, x + 2, y + 2, 2, C(0x9fc4dc, SMOOTH));
      }
      v.box(7, 7, 0, 8, 8, 5, C(0x5a5e66)); v.box(7, 6, 5, 8, 8, 7, C(0xffd24a, EMIT)); v.set(7, 7, 5, C(0x2a2a30));
      return v;
    },
    (r) => { // ramen cart with lantern string
      const v = new Vox(T, T, 12);
      const aw = pick(r, [0xc8423a, 0x2a3a6a, 0xe0a030]);
      v.box(2, 2, 0, 6, 5, 2, C(0x6a4a34)); v.box(2, 2, 2, 6, 5, 3, C(0xd8ccb0));
      for (const [x, y] of [[2, 2], [5, 2], [2, 4], [5, 4]]) v.box(x, y, 3, x + 1, y + 1, 5, C(0x4a3020));
      v.box(1, 1, 5, 7, 6, 6, C(aw)); for (let x = 1; x < 7; x++) v.set(x, 6, 5, C(x & 1 ? aw : 0xf0e8d8));
      v.set(2, 5, 4, C(LANTERN, EMIT)); v.set(5, 5, 4, C(LANTERN, EMIT)); v.box(2, 6, 0, 6, 7, 1, C(0x7a5636));
      v.emit(4, 3, 7, 'smoke');
      return v;
    },
  ],
  sec: [
    (r) => { // temple precinct: five-storey pagoda, torii, cherry trees
      const v = new Vox(16, 16, 70);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) v.set(x, y, 0, C(hash(x, y, 3) < 0.5 ? 0xcfc8b8 : 0xc4bdad));
      const roof = pick(r, ROOF9), red = 0xc8382a;
      v.box(2, 2, 1, 12, 12, 2, C(0x8f8b82));
      let z = 2;
      for (let t = 0; t < 5; t++) {
        const hw = 4 - (t >> 1) - (t === 4 ? 0.5 : 0), x0 = Math.round(7 - hw), x1 = Math.round(7 + hw);
        v.box(x0, x0, z, x1, x1, z + 4, C(0xf0e8d8));
        for (let a = x0; a < x1; a += 2) { v.box(a, x1 - 1, z, a + 1, x1, z + 4, C(red)); v.box(x1 - 1, a, z, x1, a + 1, z + 4, C(red)); }
        v.box(x1 - 1, x1 - 1, z, x1, x1, z + 4, C(red)); faces(v, x0, x0, x1, x1, z, z + 1, C(red));
        const m = (x0 + x1) >> 1; v.set(m, x1 - 1, z + 2, C(0x4a3a2a, SMOOTH | WARM)); v.set(x1 - 1, m, z + 2, C(0x4a3a2a, SMOOTH | WARM));
        v.box(x0 - 2, x0 - 2, z + 4, x1 + 2, x1 + 2, z + 5, C(roof[0])); v.box(x0 - 1, x0 - 1, z + 5, x1 + 1, x1 + 1, z + 6, C(roof[1]));
        for (const [cx, cy] of [[x0 - 2, x1 + 1], [x1 + 1, x0 - 2], [x1 + 1, x1 + 1]]) v.set(cx, cy, z + 5, C(roof[0]));
        z += 6;
      }
      v.box(7, 7, z, 8, 8, z + 9, C(0xd8b040)); for (let k = 1; k < 8; k += 2) v.box(6, 6, z + k, 9, 9, z + k + 1, C(0xc8a030));
      v.set(7, 7, z + 9, C(0xffd24a, EMIT));
      const tr = C(red); // torii
      for (const x of [11, 14]) v.box(x, 14, 0, x + 1, 15, 6, tr);
      v.box(10, 14, 5, 16, 15, 6, tr); v.box(10, 14, 6, 16, 15, 7, C(0x2a2a2e)); v.box(11, 14, 3, 15, 15, 4, tr);
      treeAt(v, 13, 3, 1, 2.3, CHERRY, 0xffffff, 1); treeAt(v, 3, 13, 1, 2.3, CHERRY, 0xffffff, 2);
      v.box(8, 13, 1, 9, 14, 3, C(0x8f8b82)); v.set(8, 13, 3, C(0xffd24a, EMIT));
      return v;
    },
    (r) => { // red-and-white lattice broadcast tower
      const v = new Vox(16, 16, 146);
      const red = pick(r, [0xe8442a, 0xe8601a]), H = 112;
      const hw = (z: number) => 0.6 + 6.9 * Math.pow(1 - z / H, 1.7);
      for (let z = 0; z < H; z++) {
        const w = hw(z), a = Math.round(7.5 - w), b = Math.round(7.5 + w), c = C(Math.floor(z / 14) % 2 ? 0xf0f0ec : red);
        for (const [x, y] of [[a, a], [a, b], [b, a], [b, b]]) v.set(x, y, z, c);
        if (b - a < 2) continue;
        if (z % 7 === 0) { for (let t = a; t <= b; t++) { v.set(t, a, z, c); v.set(t, b, z, c); v.set(a, t, z, c); v.set(b, t, z, c); } v.set(b, b, z, C(0xffb040, EMIT)); }
        else { const p = Math.round(a + ((z % 7) / 7) * (b - a)), q = a + b - p; for (const t of [p, q]) { v.set(t, b, z, c); v.set(b, t, z, c); v.set(t, a, z, c); v.set(a, t, z, c); } }
      }
      const deck = (z: number, h: number) => {
        const w = hw(z) + 1.2, a = Math.round(7.5 - w), b = Math.round(7.5 + w) + 1;
        v.box(a, a, z, b, b, z + h, C(0xf0f0ec)); faces(v, a, a, b, b, z + 1, z + h - 1, (x, y) => C(0x4a5c72, SMOOTH | (hash(x, y, z) < 0.6 ? WARM : 0)));
      };
      deck(36, 5); deck(74, 4);
      v.box(7, 7, H, 9, 9, H + 8, C(0xf0f0ec));
      for (let k = 0; k < 20; k++) v.set(7, 7, H + 8 + k, C(k % 8 < 4 ? red : 0xf0f0ec));
      v.set(7, 7, H + 28, C(0xff3b3b, EMIT));
      return v;
    },
    (r) => { // castle keep on a stone base
      const v = new Vox(16, 16, 60);
      const roof = pick(r, [[0x4a5a58, 0x42524f], [0x4e5660, 0x444c56], [0x3a4a5a, 0x344252]]);
      for (let k = 0; k < 4; k++) v.box(k, k, k * 2, 16 - k, 16 - k, k * 2 + 2, mixc([0x8f8b82, 0x7d796f, 0x9d998f], 0, k));
      let z = 8;
      [[12, 5], [10, 5], [7, 5]].forEach(([w, h], t) => {
        const x0 = (16 - w) >> 1, x1 = x0 + w;
        v.box(x0, x0, z, x1, x1, z + h, C(0xf2efe6)); faces(v, x0, x0, x1, x1, z, z + 1, C(0x4a4038));
        for (let a = x0 + 1; a < x1 - 1; a += 2) { v.set(a, x1 - 1, z + 2, C(0x3a342c, SMOOTH | (r() < 0.4 ? WARM : 0))); v.set(x1 - 1, a, z + 2, C(0x3a342c, SMOOTH | (r() < 0.4 ? WARM : 0))); }
        if (t < 2) { hip(v, x0, x0, x1, x1, z + h, roof, 1, 2); const m = (x0 + x1) >> 1; for (let k = 0; k < 2; k++) v.box(m - 2 + k, x1 - 1, z + h + k, m + 2 - k, x1 + 1, z + h + k + 1, C(k ? roof[1] : 0xf2efe6)); }
        else { gable(v, x0, x0, x1, x1, z + h, 'x', roof, C(0xf2efe6), 1); v.set(x0, 7, z + h + 5, C(0xe8c040)); v.set(x1 - 1, 7, z + h + 5, C(0xe8c040)); }
        z += h + 2;
      });
      treeAt(v, 13, 13, 6, 1.6, [0x1c4436, 0x275a44, 0x357452, 0x4b8f5f]);
      return v;
    },
    (r) => { // great bronze statue on a stepped terrace
      const v = new Vox(16, 16, 44);
      const br = pick(r, [[0x5a8a78, 0x4e7e6c, 0x66967f], [0xb8943a, 0xa88430, 0xc8a444], [0x7a6a52, 0x6e5e48, 0x86765c]]);
      for (let k = 0; k < 3; k++) v.box(k, k, k, 16 - k, 16 - k, k + 1, mixc([0xc4bdad, 0xb8b1a1], 0, k));
      for (let k = 0; k < 3; k++) v.box(6, 13 - k, 2 - k, 10, 14 - k, 3 - k, C(0xd8d2c0));
      cyl(v, 8, 8, 5.2, 3, 5, mixc([0x8f8b82, 0x7d796f]));
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; v.set(8 + Math.cos(a) * 5, 8 + Math.sin(a) * 5, 5, C(br[2])); }
      ball(v, 8, 8, 6.5, 4.6, 2.4, mixc(br)); ball(v, 8, 8, 11, 3.3, 5, mixc(br)); ball(v, 8, 8, 17.5, 2.2, 2.4, mixc(br)); v.box(7, 7, 19, 9, 9, 21, mixc(br));
      for (const [x, y] of [[2, 13], [13, 2]]) { v.box(x, y, 3, x + 1, y + 1, 6, C(0x8f8b82)); v.set(x, y, 6, C(0xffd24a, EMIT)); }
      v.box(12, 12, 3, 14, 14, 4, C(0x5a4a3a)); v.emit(12, 12, 6, 'smoke');
      treeAt(v, 2, 3, 3, 1.8, CHERRY, 0xffffff, 4);
      return v;
    },
  ],
  hero: (r) => { // twin towers joined by a skybridge
    const v = new Vox(24, 24, 176);
    v.box(0, 0, 0, 24, 24, 9, mixc([0xd8d4cc, 0xccc8c0]));
    for (let a = 1; a < 22; a += 4) { onL(v, 23, a, a + 3, 0, 3, C(0x5a4a3a, SMOOTH | WARM)); onR(v, 23, a, a + 3, 0, 3, C(0x5a4a3a, SMOOTH | WARM)); }
    ribbon(v, r, 0, 0, 24, 24, 4, 1, 4, { glass: 0x4a5c72, lit: 0.45, seg: 3, gap: 1, wh: 2, sill: 1, light: light9, even: true });
    onL(v, 23, 12, 23, 2, 9, C(0x15151b)); video(v, r, 'L', 23, 13, 22, 3, 8, 0);
    onR(v, 23, 12, 23, 2, 9, C(0x15151b)); video(v, r, 'R', 23, 13, 22, 3, 8, 2);
    parapet(v, 0, 0, 24, 24, 9, C(0xc4c0b8), 0x8a8c84); hedge(v, r, 11, 11, 23, 23, 9, 0.4);
    treeAt(v, 13, 20, 9, 2, CHERRY, 0xffffff, 1); treeAt(v, 20, 13, 9, 2, CHERRY, 0xffffff, 2); treeAt(v, 19, 19, 9, 2.2);
    const g0 = 0x6484a8, g1 = 0xdce8f4, fr = 0xf0f2f6; // pearl-white glass, unlike any other tower in town
    const twr = (x0: number, y0: number, fl: number, trim: number) => {
      const x1 = x0 + 9, y1 = y0 + 9, top = 9 + fl * 3;
      v.box(x0, y0, 9, x1, y1, top, C(fr));
      ribbon(v, r, x0, y0, x1, y1, 9, fl, 3, { glass: (z) => lerpc(g0, g1, (z - 9) / (fl * 3)), m: 0, sill: 0, wh: 2, seg: 3, lit: 0.26, light: (q) => (q() < 0.6 ? WARM : COOL) });
      for (let z = 9; z < top; z++) {
        for (const [x, y] of [[x1 - 1, y1 - 1], [x0, y1 - 1], [x1 - 1, y0], [x0 + 4, y1 - 1], [x1 - 1, y0 + 4]]) v.set(x, y, z, C(fr));
        if (z % 30 > 27) faces(v, x0, y0, x1, y1, z, z + 1, C(shade(fr, -0.25)));
      }
      for (let k = 1; k <= 3; k++) {
        const zz = top + (k - 1) * 4;
        v.box(x0 + k, y0 + k, zz, x1 - k, y1 - k, zz + 4, C(fr));
        faces(v, x0 + k, y0 + k, x1 - k, y1 - k, zz + 1, zz + 3, C(g1, SMOOTH | WARM));
      }
      faces(v, x0 + 3, y0 + 3, x1 - 3, y1 - 3, top + 11, top + 12, C(trim, EMIT));
      v.box(x0 + 4, y0 + 4, top + 12, x0 + 5, y0 + 5, top + 16, C(0xc8ccd4)); mast(v, x0 + 4, y0 + 4, top + 16, 10);
    };
    twr(14, 1, 37, 0xffe08a); twr(1, 14, 37, 0xffe08a);
    for (let t = 0; t <= 5; t++) { // skybridge, level on screen
      const cx = 14 - t, cy = 9 + t;
      v.box(cx - 1, cy - 1, 60, cx + 2, cy + 2, 61, C(0xe8ecf0)); v.box(cx - 1, cy - 1, 61, cx + 2, cy + 2, 64, C(0x4a6a8a, SMOOTH)); v.box(cx - 1, cy - 1, 64, cx + 2, cy + 2, 65, C(0xe8ecf0));
      v.set(cx + 1, cy + 1, 62, C(0xfff0c0, EMIT)); v.set(cx, cy + 1, 62, C(0xfff0c0, EMIT));
    }
    for (let k = 1; k < 4; k++) { v.set(14 - k, 10 + k - 1, 60 - k * 2, C(0xc8ccd4)); v.set(14 - k, 10 + k - 1, 59 - k * 2, C(0xc8ccd4)); v.set(10 + k - 1, 14 - k, 60 - k * 2, C(0xc8ccd4)); v.set(10 + k - 1, 14 - k, 59 - k * 2, C(0xc8ccd4)); }
    return v;
  },
  road: (r, d) => slab((x, y) => {
    const asph = () => C(pick(r, [0x3e4048, 0x3a3c44, 0x42444c]));
    if (d === 0) { // junction with zebra crossings
      const ex = x <= 1 || x >= 6, ey = y <= 1 || y >= 6;
      if (ex !== ey) return (ex ? y : x) % 2 === 1 ? C(0xe4e4dc) : asph();
      return asph();
    }
    const a = d === 1 ? x : y, b = d === 1 ? y : x;
    if (b === 0 || b === 7) return C(pick(r, [0x8e9098, 0x868890]));
    if ((b === 3 || b === 4) && a % 4 < 2 && b === 4) return C(0xe4e4dc);
    return asph();
  }, C(0x2e2a28)),
  pave: (r) => ground(r, [0x767880, 0x6e7078, 0x7c7e86], 0, { c: [0x62646c, 0x8a8c94], p: 0.07 }, C(0x3a3c44)),
  bridge: (r, d) => bridgeTile(r, d, [0x3e4048, 0x42444c], 0xb8bcc4, 0, 0xffe9a8),
};

// ================================ EPOCH 10 =====================================
// Far future: megastructures and industrial sci-fi. Four material families mix across districts.
const TEAL = [[0x22343a, 0x1e2e34], [0x1a2a30, 0x16242a], [0x2c4046, 0x283a40]];
const CERAM = [[0xe8ecf0, 0xdce1e7], [0xf0efe8, 0xe4e3dc], [0xd4dce6, 0xc8d0da]];
const VIOLET = [[0x402a58, 0x38244e], [0x4e2c5e, 0x462654], [0x2e2648, 0x282040]];
const RUST = [[0x8e4e32, 0x7e442a, 0x98583c], [0x6e4e3c, 0x624434, 0x785642], [0x7a7a6c, 0x6e6e60, 0x848476]];
const CONT = [0x9a4a2e, 0x2e6a6e, 0xc8a030, 0x4a5a6e, 0x8a8e94, 0x7a2e3a, 0x3a7a4a, 0xc8c4b8];
const AMBER = 0xffa030, CYAN = 0x35e0ff, MAG = 0xff4fc0, VIO = 0xb07aff, LIME = 0xa0ff5a, HOT = 0xff5a3a;

/** Thin vertical light slits scattered over the two visible faces. */
function slits(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, col: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const len = irand(r, 4, Math.max(4, (z1 - z0) >> 1)), z = irand(r, z0, Math.max(z0, z1 - len));
    if (r() < 0.5) { const a = irand(r, x0 + 1, x1 - 2); onL(v, y1 - 1, a, a + 1, z, z + len, C(col, EMIT)); }
    else { const b = irand(r, y0 + 1, y1 - 2); onR(v, x1 - 1, b, b + 1, z, z + len, C(col, EMIT)); }
  }
}
/** Corrugated shipping container, 3 wide and 3 high. */
function container(v: Vox, r: R, x0: number, y0: number, z: number, along: 'x' | 'y', len = 6, col = pick(r, CONT)): void {
  const x1 = x0 + (along === 'x' ? len : 3), y1 = y0 + (along === 'x' ? 3 : len), dk = shade(col, -0.14);
  v.box(x0, y0, z, x1, y1, z + 3, (x, y) => C((along === 'x' ? x : y) & 1 ? col : dk));
  if (r() < 0.65) {
    const w = C(0x2a2420, SMOOTH | (r() < 0.55 ? WARM : 0)), o = 1 + irand(r, 0, Math.max(0, len - 3));
    if (along === 'x') v.set(x0 + o, y1 - 1, z + 1, w); else v.set(x1 - 1, y0 + o, z + 1, w);
  }
}
/** Holographic picture: scan-lines of self-lit voxels in one plane, dim fill and bright outline, so it reads as translucent. */
type HoloShape = (u: number, w: number, ar: number) => number; // u in -1..1, w in 0..1 (up); returns 0 empty, 1 fill, 2 outline
function holo(v: Vox, face: Face, f: number, a0: number, z0: number, W: number, H: number, shape: HoloShape, cols: number[]): void {
  for (let a = 0; a < W; a++)
    for (let z = 0; z < H; z++) {
      if (z % 3 !== 0) continue;
      const k = shape(((a + 0.5) / W) * 2 - 1, (z + 0.5) / H, W / (2 * H));
      if (!k) continue;
      const base = cols[Math.floor(z / 9) % cols.length];
      const c = C(k === 2 ? lerpc(base, 0xffffff, 0.3) : shade(base, -0.45), EMIT);
      if (face === 'L') v.set(a0 + a, f, z0 + z, c); else v.set(f, a0 + a, z0 + z, c);
    }
}
const HOLO: HoloShape[] = [
  (u, w, ar) => { // figure in a long dress
    const au = Math.abs(u);
    if (Math.hypot(u * ar, w - 0.88) < 0.085) return 2;
    if (w > 0.74 && w < 0.8) return au < 0.2 ? 1 : 0;
    if (w >= 0.28 && w <= 0.74) { const hw = Math.min(0.95, 0.4 + (0.74 - w) * 1.3); return au < hw ? (au > hw - 0.3 ? 2 : 1) : 0; }
    return w < 0.28 && au > 0.1 && au < 0.5 ? 1 : 0;
  },
  (u, w) => { const d = Math.abs(u) / 0.98 + Math.abs(w - 0.5) / 0.5; return d < 1 ? (d > 0.7 || Math.abs(u) < 0.12 ? 2 : 1) : 0; }, // gem
  (u, w, ar) => { // ringed planet
    if (Math.hypot(u * ar, w - 0.5) < Math.min(ar * 0.7, 0.3)) return 1;
    const e = Math.hypot(u / 0.98, (w - 0.5 - u * 0.1) / 0.1);
    return e > 0.55 && e < 1 ? 2 : 0;
  },
  (u, w) => { // bottle
    const au = Math.abs(u), hw = w > 0.72 ? 0.28 : w > 0.6 ? 0.28 + (0.72 - w) * 3.5 : 0.7;
    if (w < 0.06 || w > 0.95 || au > hw) return 0;
    return au > hw - 0.3 || (w > 0.28 && w < 0.44) || w > 0.88 ? 2 : 1;
  },
];
function flyerAt(v: Vox, r: R, x: number, y: number, z: number): void {
  v.box(x, y, z, x + 4, y + 2, z + 1, C(pick(r, [0xdfe4f0, 0x5a2a6a, 0x1e3a4a, 0xc8a030])));
  v.box(x + 1, y, z + 1, x + 3, y + 2, z + 2, C(0x7fe8ff, SMOOTH)); v.set(x, y + 1, z, C(HOT, EMIT));
}
function padDisc(v: Vox, r: R, cx: number, cy: number, z: number, rad: number, light = AMBER, flyer = true): void {
  cyl(v, cx, cy, rad, z, z + 1, C(0x2a3036)); cyl(v, cx, cy, rad - 1.3, z, z + 1, C(0x3a444c));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.5; v.set(cx + Math.cos(a) * (rad - 0.7), cy + Math.sin(a) * (rad - 0.7), z, C(light, EMIT)); }
  if (flyer) flyerAt(v, r, Math.round(cx - 2), Math.round(cy - 1), z + 1);
}
/** Dashed halo ring. */
function halo(v: Vox, cx: number, cy: number, z: number, rad: number, col: number, dash = 3): void {
  const n = Math.ceil(rad * 9);
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; if (Math.floor((i / n) * rad * 3) % dash !== dash - 1) v.set(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, z, C(col, EMIT)); }
}


// Three supertalls, far above the rest of the skyline. One rises in each of the last three zones.
const megaTalls: Maker[] = [
  (r) => { // white helix needle
    const v = new Vox(24, 24, 380), H = 318;
    cyl(v, 12, 12, 11.2, 0, 6, mixc(CERAM[2]));
    const radAt = (z: number) => 9.6 - 6.4 * Math.pow((z - 6) / (H - 6), 0.8);
    for (let z = 6; z < H; z++) {
      const a = z * 0.085;
      cyl(v, 12, 12, radAt(z), z, z + 1, (x, y, zz) => {
        const d = (((Math.atan2(y + 0.5 - 12, x + 0.5 - 12) - a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        if (d < 0.42) return C(CYAN, EMIT);
        if (zz % 3 === 2) return C(0xd0d8e2);
        return hash(x, y, zz, 7) < 0.28 ? C(0x8fbcd8, SMOOTH | COOL) : C(hash(x, y, zz, 3) < 0.5 ? 0xe8ecf0 : 0xf6f8fa);
      });
    }
    for (const [z, col] of [[96, MAG], [176, CYAN], [248, MAG]] as const)
      for (let i = 0; i < 80; i++) { const an = (i / 80) * Math.PI * 2, rr = radAt(z) + 3.2; v.set(12 + Math.cos(an) * rr, 12 + Math.sin(an) * rr, z, C(col, EMIT)); }
    v.box(12, 12, H, 13, 13, H + 38, C(0xc8ccd4));
    for (let k = 4; k < 38; k += 6) v.set(12, 12, H + k, C(CYAN, EMIT));
    ball(v, 12.5, 12.5, H + 40, 2, 2, C(0xf4f8ff, EMIT));
    void r;
    return v;
  },
  (r) => { // black twin monolith with amber slits
    const v = new Vox(24, 24, 360), H = 286;
    v.box(2, 3, 0, 22, 21, 10, mixc(TEAL[2]));
    for (let a = 3; a < 21; a += 3) { v.set(a, 20, 4, C(AMBER, EMIT)); v.set(21, a + 1, 4, C(AMBER, EMIT)); }
    const slabs: [number, number][] = [[4, H], [13, H - 44]];
    for (const [x0, h] of slabs) {
      v.box(x0, 5, 10, x0 + 7, 19, h, mixc(TEAL[1], 0, x0));
      for (let z = 14; z < h - 4; z++) if (z % 22 < 17) v.set(x0 + 3, 18, z, C(AMBER, EMIT)); // one light slit per slab
      for (let y = 6; y < 18; y += 2) for (let z = 12; z < h - 4; z += 3) if (hash(y, z, x0) < 0.2) { v.set(x0 + 6, y, z, C(0x101820, SMOOTH | WARM)); v.set(x0 + 6, y, z + 1, C(0x101820, SMOOTH | WARM)); }
      for (let x = x0 + 1; x < x0 + 6; x += 2) for (let z = 12; z < h - 4; z += 3) if (hash(x, z, x0 + 9) < 0.14) v.set(x, 18, z, C(0x101820, SMOOTH | COOL));
      for (let x = x0; x < x0 + 7; x++) v.set(x, 18, h - 1, C(AMBER, EMIT));
      for (let y = 5; y < 19; y++) v.set(x0 + 6, y, h - 1, C(AMBER, EMIT));
    }
    for (const z of [84, 162, 226]) { v.box(11, 8, z, 13, 16, z + 4, C(0x2c4046)); v.box(11, 15, z + 1, 13, 16, z + 2, C(AMBER, EMIT)); }
    for (const [x, y, hh] of [[5, 7, 26], [8, 12, 40], [6, 16, 18]]) { v.box(x, y, H, x + 1, y + 1, H + hh, C(0x8a90a0)); v.set(x, y, H + hh, C(HOT, EMIT)); }
    void r;
    return v;
  },
  (r) => { // violet tiered tower with sky gardens and halo rings
    const v = new Vox(24, 24, 380);
    let z = 0;
    const tiers: [number, number][] = [[20, 22], [16, 24], [12, 24], [8, 20], [4, 12]];
    tiers.forEach(([w, fl], i) => {
      const x0 = (24 - w) >> 1, x1 = x0 + w, hh = fl * 3;
      v.box(x0, x0, z, x1, x1, z + hh, mixc(VIOLET[i % 3], 0, i));
      facade(v, r, x0, x0, x1, x1, z, fl, 3, { glass: 0x1a1430, lit: 0.26, light: (rr) => (rr() < 0.6 ? WARM | COOL : COOL), sill: 0, wh: 2, ww: 1, gap: 1 });
      for (let zz = z; zz < z + hh; zz++) v.set(x1 - 1, x1 - 1, zz, C(MAG, EMIT));
      z += hh;
      if (i < tiers.length - 1) {
        for (let a = x0; a < x1; a++) { v.set(a, x1 - 1, z, C(GREEN[1 + (a & 1) * 2], ROUGH)); v.set(a, x1 - 2, z, C(GREEN[2], ROUGH)); v.set(x1 - 1, a, z, C(GREEN[2 + (a & 1)], ROUGH)); v.set(x1 - 2, a, z, C(GREEN[1], ROUGH)); }
        for (let k = 0; k < 72; k++) { const an = (k / 72) * Math.PI * 2, rr = w / 2 + 2.5; if (k % 9 < 7) v.set(12 + Math.cos(an) * rr, 12 + Math.sin(an) * rr, z + 5, C(i & 1 ? VIO : MAG, EMIT)); }
      }
    });
    v.box(12, 12, z, 13, 13, z + 30, C(0x8a90a0));
    for (let k = 3; k < 30; k += 5) v.set(12, 12, z + k, C(MAG, EMIT));
    v.box(11, 11, z + 30, 14, 14, z + 32, C(MAG, EMIT));
    return v;
  },
];

const e10: Cat = {
  mega: megaTalls,
  // slum -> overgrown -> entertainment -> pods -> corporate -> data -> industrial
  small: [
    (r, lvl) => { // cross-stacked container homes
      const v = new Vox(T, T, 44);
      const n = 3 + lvl * 2 + irand(r, 0, 1);
      for (let i = 0; i < n; i++)
        for (let k = 0; k < 2; k++) {
          if (i > 1 && r() < (k ? 0.3 : 0.12)) continue;
          const j = irand(r, 0, 2);
          if (i & 1) container(v, r, 1 + k * 3, j, i * 3, 'y'); else container(v, r, j, 1 + k * 3, i * 3, 'x');
        }
      const H = n * 3;
      v.box(2, 2, H, 4, 4, H + 1, C(0x3a6a9a)); mast(v, 5, 2, H, irand(r, 3, 6), AMBER, 0x5a666c);
      for (let z = 0; z < H; z++) v.set(3, 7, z, C(z % 2 ? 0x5a666c : 0x3a444a));
      signV(v, 7, 4, 3, pick(r, [2, 5]), pick(r, [MAG, AMBER, CYAN, LIME]));
      return v;
    },
    (r, lvl) => { // overgrown ruin block
      const v = new Vox(T, T, 46);
      const wall = pick(r, RUST), fl = 3 + lvl * 2 + irand(r, 0, 1), H = fl * 3;
      v.box(1, 1, 0, 7, 7, H, mixc(wall));
      facade(v, r, 1, 1, 7, 7, 0, fl, 3, { glass: 0x1e2428, lit: 0.18, gap: 1, wh: 2, sill: 1 });
      v.box(4 + irand(r, 0, 1), 1, H - 2, 7, 3, H, 0);
      vines(v, r, 1, 1, 7, 7, H, Math.min(H - 2, 5 + lvl * 3), 0.7); hedge(v, r, 1, 1, 7, 7, H, 0.7);
      treeAt(v, 2 + irand(r, 0, 1), 4, H, 2.1, GREEN, 0xa5d167, irand(r, 0, 9));
      if (r() < 0.6) v.set(7, 3, 2, C(LIME, EMIT));
      return v;
    },
    (r, lvl) => { // noodle bar under a holo-ad
      const v = new Vox(T, T, 34);
      const wall = pick(r, VIOLET), neon = pick(r, [MAG, CYAN, AMBER]);
      v.box(1, 2, 0, 7, 6, 4, mixc(wall));
      onL(v, 5, 2, 6, 1, 3, C(0x5a4030, SMOOTH | WARM)); onR(v, 6, 3, 5, 1, 3, C(0x5a4030, SMOOTH | WARM));
      for (let x = 1; x < 7; x++) v.set(x, 6, 3, C(x & 1 ? 0x2a2030 : 0x5a2a4a));
      onL(v, 5, 1, 7, 4, 5, C(neon, EMIT)); v.box(1, 2, 4, 7, 5, 5, C(0x2a2030));
      v.box(3, 3, 5, 5, 4, 6, C(0x3a444c)); v.emit(2, 3, 6, 'smoke');
      const hh = 13 + lvl * 6;
      holo(v, 'L', 3, 1, 7, 6, hh, pick(r, HOLO), shuffle(r, [CYAN, MAG, VIO, AMBER]).slice(0, 2));
      return v;
    },
    (r, lvl) => { // habitat pods on a stalk
      const v = new Vox(T, T, 60);
      const body = pick(r, [CERAM[0], CERAM[1], [0x9ab8c0, 0x8eacb4], VIOLET[0]]), acc = pick(r, [CYAN, MAG, AMBER, LIME]);
      const n = 2 + lvl, gap = 9, H = 6 + n * gap, s = irand(r, 0, 99);
      v.box(3, 3, 0, 5, 5, H, C(0x3a444c));
      for (let z = 3; z < H; z += 9) v.set(4, 4, z, C(acc, EMIT));
      for (let i = 0; i < n; i++) {
        const z = 7 + i * gap, rad = 3.4 - (i === n - 1 ? 0.6 : 0);
        cyl(v, 4, 4, rad - 0.8, z - 1, z, C(body[1])); cyl(v, 4, 4, rad, z, z + 1, C(body[0]));
        cyl(v, 4, 4, rad, z + 1, z + 2, (x, y) => C(0x24343c, SMOOTH | (hash(x, y, s + i) < 0.4 ? COOL : 0)));
        cyl(v, 4, 4, rad, z + 2, z + 3, C(body[0])); cyl(v, 4, 4, rad - 1, z + 3, z + 4, C(body[1]));
      }
      mast(v, 4, 4, H, 4, acc, 0x8a9098);
      return v;
    },
    (r, lvl) => { // white ceramic mini tower
      const v = new Vox(T, T, 60);
      const body = pick(r, [CERAM[0], CERAM[1], [0x6a8a94, 0x62828c], [0x2c4046, 0x283a40], [0x8a7a9a, 0x7e6e8e]]), acc = pick(r, [CYAN, CYAN, LIME, VIO]), H = 20 + lvl * 10 + irand(r, 0, 4), s = irand(r, 0, 99);
      cyl(v, 4, 4, 3, 0, H, (x, y, z) => (z % 8 === 6 ? C(0x2e4650, SMOOTH | (hash(x, y, z, s) < 0.35 ? COOL : 0)) : z % 8 === 7 || z < 2 ? C(0x8a98a4) : C(body[(x + y) & 1])));
      for (let z = Math.round(H * 0.55); z < H - 2; z++) if (z % 8 < 5) v.set(6, 6, z, C(acc, EMIT));
      ball(v, 4, 4, H, 3, 2.6, C(body[0], SMOOTH)); mast(v, 4, 4, H + 2, 5, acc, 0x8a98a4);
      return v;
    },
    (r, lvl) => { // data monolith
      const v = new Vox(T, T, 50);
      const wall = pick(r, [[0x1c1e24, 0x181a20], [0x1c2428, 0x182024], [0x26222c, 0x221e28]]), acc = pick(r, [AMBER, CYAN, HOT, LIME]);
      const H = 16 + lvl * 10 + irand(r, 0, 4);
      v.box(1, 2, 0, 7, 7, H, mixc(wall, SMOOTH));
      v.box(1, 2, 0, 7, 7, 2, C(0x3a424a));
      slits(v, r, 1, 2, 7, 7, 3, H - 1, acc, 3 + lvl);
      for (let a = 2; a < 7; a += 2) v.box(a, 3, H, a + 1, 6, H + 2, C(0x4a525a));
      return v;
    },
    (r, lvl) => { // coolant tanks
      const v = new Vox(T, T, 30);
      const c = pick(r, [0xd8dee4, 0x2e6a6e, 0x9a4a2e, 0xc8a030]), H = 8 + lvl * 4;
      cyl(v, 3.5, 3.5, 2.6, 0, H, (_x, _y, z) => C(z % 4 === 3 ? shade(c, -0.25) : c)); cyl(v, 3.5, 3.5, 1.8, H, H + 1, C(shade(c, 0.15)));
      cyl(v, 6, 6, 1.4, 0, 5 + lvl * 2, C(0x8a9098)); v.set(6, 6, 5 + lvl * 2, C(AMBER, EMIT));
      for (let z = 0; z < H; z++) v.set(6, 3, z, C(0x5a666c));
      v.box(5, 3, H - 2, 7, 4, H - 1, C(0x5a666c)); v.box(1, 6, 0, 4, 7, 2, C(0x4a565c)); v.box(1, 6, 2, 2, 7, 3, C(0x8a6a3a));
      v.emit(3, 3, H + 2, 'smoke');
      return v;
    },
  ],
  // slum stack -> overgrown arcology -> holo tower -> ring tower -> wedge -> hex tower -> ziggurat -> data slabs -> refinery -> pad tower
  large: [
    (r, lvl) => { // container slum clinging to an old tower
      const v = new Vox(16, 16, 110);
      const wall = pick(r, TEAL), H = 36 + lvl * 20 + irand(r, 0, 8);
      v.box(2, 2, 0, 11, 11, H, mixc(wall));
      ribbon(v, r, 2, 2, 11, 11, 12, Math.floor((H - 14) / 4), 4, { glass: 0x10181c, lit: 0.3, seg: 1, gap: 1, wh: 1, sill: 2 });
      for (let z = 0; z < H; z++) { v.set(4, 11, z, C(z % 6 === 5 ? 0x8a6a3a : 0x5a666c)); v.set(11, 5, z, C(0x4a565c)); }
      slits(v, r, 2, 2, 11, 11, H >> 1, H - 2, AMBER, 2);
      const layers = 3 + lvl * 2, frOn = [true, true, true], rtOn = [true, true];
      for (let i = 0; i < layers; i++) {
        [1, 6, 11].forEach((x, k) => { if (frOn[k] && (i < 2 || r() < 0.7)) container(v, r, x, 12, i * 3, 'x', k === 2 ? 4 : 5); else frOn[k] = false; });
        [1, 6].forEach((y, k) => { if (rtOn[k] && (i < 2 || r() < 0.7)) container(v, r, 12, y, i * 3, 'y', 5); else rtOn[k] = false; });
      }
      signV(v, 7, 11, layers * 3 + 2, 8, pick(r, [MAG, AMBER, CYAN]), 'x');
      v.set(9, 15, 2, C(AMBER, EMIT)); v.set(15, 4, 2, C(AMBER, EMIT)); v.set(3, 15, 5, C(HOT, EMIT));
      tank(v, 3, 3, H, 0x8a6a4a); tank(v, 7, 4, H, 0x5a666c); mast(v, 9, 8, H, 9, HOT, 0x5a666c); mast(v, 4, 8, H, 5, HOT, 0x5a666c);
      v.emit(6, 6, H + 3, 'smoke');
      return v;
    },
    (r, lvl) => { // overgrown terraced arcology
      const v = new Vox(16, 16, 110);
      const wall = pick(r, RUST), tiers = 3 + lvl, step = tiers > 3 ? 2 : 3;
      let z = 0;
      for (let t = 0; t < tiers; t++) {
        const x1 = 15 - t * step, th = 11 + lvl + irand(r, 0, 3), nx = t === tiers - 1 ? 1 : x1 - step;
        v.box(1, 1, z, x1, x1, z + th, mixc(wall, 0, t));
        ribbon(v, r, 1, 1, x1, x1, z, Math.floor(th / 3), 3, { glass: 0x1e2a2c, lit: 0.25, seg: 1, gap: 1, wh: 2, sill: 1 });
        z += th;
        hedge(v, r, 1, nx, x1, x1, z, 0.85); hedge(v, r, nx, 1, x1, nx, z, 0.85);
        vines(v, r, 1, 1, x1, x1, z, 6, 0.65);
        if (t < tiers - 1) { treeAt(v, irand(r, 2, nx - 1), x1 - 2, z, 1.6, GREEN, undefined, t); treeAt(v, x1 - 2, irand(r, 2, nx - 1), z, 1.6, GREEN, 0xa5d167, t + 3); }
        if (t === 1) for (let k = 1; k < z; k++) v.set(4, x1 - 1, z - k, C(0x9ae0e8, SMOOTH));
      }
      treeAt(v, 4, 4, z, 2.6, GREEN, 0xa5d167, 7); v.set(2, 7, z + 1, C(LIME, EMIT));
      return v;
    },
    (r, lvl) => { // entertainment tower with a giant hologram
      const v = new Vox(16, 16, 124);
      const wall = pick(r, VIOLET), neon = pick(r, [MAG, VIO, CYAN]), H = 48 + lvl * 22 + irand(r, 0, 8);
      v.box(1, 1, 0, 15, 15, 8, mixc(VIOLET[2]));
      faces(v, 1, 1, 15, 15, 1, 3, (x, y) => C(0x4a3046, SMOOTH | ((x + y) % 3 ? WARM | COOL : 0)));
      v.box(1, 1, 8, 12, 12, H, mixc(wall));
      ribbon(v, r, 1, 1, 12, 12, 10, Math.floor((H - 12) / 4), 4, { glass: 0x1e1830, lit: 0.22, seg: 2, gap: 1, wh: 1, sill: 2, light: WARM | COOL });
      for (const zz of [Math.round(H * 0.45), H - 3]) faces(v, 1, 1, 12, 12, zz, zz + 1, (x, y) => ((x + y) % 4 === 3 ? C(0x1c1826) : C(neon, EMIT)));
      v.box(3, 3, H, 10, 10, H + 4, mixc(VIOLET[2])); v.box(5, 5, H + 4, 8, 8, H + 7, mixc(wall)); mast(v, 6, 6, H + 7, 8, neon, 0x6a5a7a);
      v.box(2, 13, 8, 13, 15, 9, C(0x2a2436)); for (let a = 3; a < 12; a += 4) v.set(a, 14, 8, C(0xf4f8ff, EMIT));
      holo(v, 'L', 14, 2, 10, 11, Math.min(H - 12, 28 + lvl * 10), pick(r, HOLO), shuffle(r, [CYAN, MAG, AMBER, VIO]).slice(0, 2));
      return v;
    },
    (r, lvl) => { // cylindrical tower with halo decks
      const v = new Vox(16, 16, 136);
      const wall = pick(r, [VIOLET[0], VIOLET[2], TEAL[1], [0x3a3a44, 0x34343e]]), neon = pick(r, [MAG, VIO, CYAN, AMBER]);
      const H = 52 + lvl * 22 + irand(r, 0, 8), s = irand(r, 0, 999);
      cyl(v, 8, 8, 5.6, 0, H, (x, y, z) => {
        const f = Math.floor(z / 4), a = Math.floor((Math.atan2(y - 7.5, x - 7.5) + 4) * 3);
        if (z % 4 === 2 && hash(f, s) < 0.45) return C(0x181624, SMOOTH | (hash(a, f, s) < 0.5 ? WARM | COOL : 0));
        return C(wall[hash(x, y, z, s) < 0.5 ? 0 : 1]);
      });
      for (const zz of [Math.round(H * 0.4), Math.round(H * 0.78)]) {
        cyl(v, 8, 8, 7.4, zz, zz + 1, C(0x2a2a34)); cyl(v, 8, 8, 5.6, zz + 1, zz + 3, C(0x14141c, SMOOTH)); halo(v, 8, 8, zz, 7.2, neon, 3);
      }
      const k = irand(r, 0, 1);
      if (k) { ball(v, 8, 8, H, 5.6, 4, C(wall[0], SMOOTH)); mast(v, 8, 8, H + 3, 10, neon, 0x6a6a7a); }
      else { for (let i = 0; i < 5; i++) cyl(v, 8, 8, 5.6 + i * 0.4, H + i, H + i + 1, C(i === 4 ? 0x2a2a34 : wall[i & 1])); halo(v, 8, 8, H + 4, 7, neon, 2); mast(v, 8, 8, H + 5, 6, neon, 0x6a6a7a); }
      return v;
    },
    (r, lvl) => { // white ceramic wedge megatower
      const v = new Vox(16, 16, 130);
      const wall = pick(r, CERAM), H = 56 + lvl * 22 + irand(r, 0, 8), acc = pick(r, [CYAN, CYAN, LIME, AMBER]);
      const x0 = 2, x1 = 14, y0 = 3, y1 = 13;
      const hAt = (x: number) => Math.round(H - ((x - x0) / (x1 - x0 - 1)) * H * 0.42);
      for (let x = x0; x < x1; x++) { v.box(x, y0, 0, x + 1, y1, hAt(x), mixc(wall, 0, 1)); v.box(x, y0, hAt(x) - 1, x + 1, y1, hAt(x), C(0x8fd4e4, SMOOTH)); v.set(x, y1 - 1, hAt(x) - 1, C(acc, EMIT)); }
      v.box(x0, y0, 0, x1, y1, 4, mixc(TEAL[0])); faces(v, x0, y0, x1, y1, 1, 3, (x, y) => C(0x24343c, SMOOTH | ((x + y) % 4 < 2 ? COOL : 0)));
      for (let f = 0; f * 4 + 8 < H; f++) {
        if (f % 5 > 2) continue;
        const zb = 6 + f * 4, k = pick(r, [0.2, 0.8, 1.4]);
        for (let a = x0 + 4; a < x1 - 1; a += 2) if (zb + 4 < hAt(a + 1)) onL(v, y1 - 1, a, a + 2, zb, zb + 2, C(0x3a5a6a, SMOOTH | (r() < 0.25 * k ? COOL : 0)));
        if (zb + 4 < hAt(x1 - 1)) for (let b = y0 + 1; b < y1 - 1; b += 2) onR(v, x1 - 1, b, b + 2, zb, zb + 2, C(0x3a5a6a, SMOOTH | (r() < 0.25 * k ? COOL : 0)));
      }
      for (let z = 4; z < hAt(x0 + 2) - 2; z++) v.set(x0 + 2, y1 - 1, z, C(0x26323a));
      mast(v, x0 + 1, y0 + 1, H, 8, acc, 0x8a98a4);
      return v;
    },
    (r, lvl) => { // hexagonal tower with a landing pad
      const v = new Vox(16, 16, 150);
      const wall = pick(r, [CERAM[0], CERAM[2], [0x9ab8c0, 0x8eacb4], TEAL[2]]), acc = pick(r, [CYAN, CYAN, LIME, VIO]);
      const H = 64 + lvl * 24 + irand(r, 0, 8), s = irand(r, 0, 999);
      oct(v, 7, 7, 5.5, 3.4, 0, H, (x, y, z) => {
        const b = z % 20;
        if (b >= 18 || z < 3) return C(0x26343c);
        if (b < 12 && z % 3 === 1) return C(0x34505c, SMOOTH | (hash(x + y * 3, Math.floor(z / 3), s) < (Math.floor(z / 20) % 2 ? 0.1 : 0.34) ? COOL : 0));
        return C(wall[(x + y) & 1]);
      });
      for (let z = Math.round(H * 0.55); z < H - 1; z++) if (z % 20 < 17) { v.set(10, 11, z, C(acc, EMIT)); }
      const zp = Math.round(H * 0.5);
      v.box(10, 10, zp - 1, 13, 13, zp, C(0x3a444c)); padDisc(v, r, 12.5, 12.5, zp, 3.3, AMBER, r() < 0.7);
      oct(v, 7, 7, 4, 2.4, H, H + 3, C(0x3a4a54)); mast(v, 6, 6, H + 3, 12, acc, 0x8a98a4); mast(v, 8, 5, H + 3, 7, HOT, 0x8a98a4); mast(v, 5, 8, H + 3, 5, HOT, 0x8a98a4);
      return v;
    },
    (r, lvl) => { // stepped corporate ziggurat
      const v = new Vox(16, 16, 110);
      const wall = pick(r, [TEAL[1], TEAL[0], [0x2a2a30, 0x26262c], [0x3a2e2a, 0x342824]]), acc = pick(r, [AMBER, AMBER, HOT, CYAN]);
      const tiers = 5 + lvl, th = 9 + lvl + (lvl > 1 ? 1 : 0);
      let z = 0, top = 16;
      for (let t = 0; t < tiers; t++) {
        const a = Math.round((t * 5) / (tiers - 1)), b = 16 - a;
        v.box(a, a, z, b, b, z + th, mixc(wall, 0, t));
        faces(v, a, a, b, b, z + th - 1, z + th, C(shade(wall[0], 0.12)));
        for (let p = a + 2; p < b - 3; p += 3) for (const fc of ['L', 'R'] as Face[]) {
          const q = r();
          put(v, fc, b - 1, p, p + 2, z + 3, z + 4, q < 0.2 ? C(acc, EMIT) : C(0x3a2c1c, SMOOTH | (q < 0.5 ? WARM : 0)));
          if (th > 9) put(v, fc, b - 1, p, p + 2, z + 6, z + 7, C(0x3a2c1c, SMOOTH | (r() < 0.25 ? WARM : 0)));
        }
        for (let zz = z + 1; zz < z + th - 1; zz++) if (zz % 3) { v.set(7, b - 1, zz, C(acc, EMIT)); v.set(8, b - 1, zz, C(0x101418)); }
        z += th; top = b - a;
      }
      const c0 = (16 - top) >> 1;
      v.box(c0 + 1, c0 + 1, z, c0 + 2, c0 + 2, z + 9, C(0x5a666c)); v.box(c0 + top - 2, c0 + 1, z, c0 + top - 1, c0 + 2, z + 6, C(0x5a666c));
      v.set(c0 + 1, c0 + 1, z + 9, C(acc, EMIT)); v.set(c0 + top - 2, c0 + 1, z + 6, C(acc, EMIT));
      padDisc(v, r, 8.5, 8.5, z, top / 2 - 0.6, acc, false);
      return v;
    },
    (r, lvl) => { // data-centre monoliths
      const v = new Vox(16, 16, 124);
      const wall = pick(r, [[0x1c1e24, 0x181a20], [0x1c2428, 0x182024], [0x26222c, 0x221e28]]), acc = pick(r, [AMBER, CYAN, HOT, LIME]);
      const H = 50 + lvl * 24 + irand(r, 0, 8);
      const slabAt = (y0: number, h: number) => {
        v.box(2, y0, 0, 14, y0 + 5, h, mixc(wall, SMOOTH)); v.box(2, y0, 0, 14, y0 + 5, 3, C(0x3a424a));
        for (let a = 3; a < 13; a += irand(r, 2, 3)) if (r() < 0.6) { const len = irand(r, 5, h >> 1), z = irand(r, 4, h - len - 2); onL(v, y0 + 4, a, a + 1, z, z + len, C(acc, EMIT)); }
        for (let z = 6; z < h - 4; z += 2) onR(v, 13, y0 + 1, y0 + 4, z, z + 1, C(0x30363e));
        for (let a = 3; a < 13; a += 2) v.box(a, y0 + 1, h, a + 1, y0 + 4, h + 2, C(0x4a525a));
      };
      slabAt(2, H); slabAt(9, Math.round(H * 0.66));
      for (const zz of [10, Math.round(H * 0.4)]) v.box(4 + (zz % 5), 7, zz, 6 + (zz % 5), 9, zz + 2, C(0x5a666c));
      v.emit(8, 4, H + 3, 'smoke');
      return v;
    },
    (r, lvl) => { // refinery / coolant plant
      const v = new Vox(16, 16, 80);
      v.box(0, 0, 0, 16, 16, 1, mixc([0x2a3034, 0x262c30]));
      const tc = pick(r, [0xd8dee4, 0x2e6a6e, 0x9a4a2e]), pc = pick(r, [0x8a6a3a, 0x5a666c, 0x9a4a2e]);
      for (const [x, y] of [[3, 3], [7, 3], [3, 7], [7, 7]]) v.box(x, y, 1, x + 1, y + 1, 5, C(0x5a666c));
      ball(v, 5.5, 5.5, 7, 4.2, 4.2, (_x, _y, z) => C(z === 7 ? shade(tc, -0.25) : tc, SMOOTH));
      for (const [cx, hh] of [[3, 9 + lvl * 3], [8, 12 + lvl * 3]]) { cyl(v, cx, 12.5, 2.3, 1, hh, (_x, _y, z) => C(z % 5 === 4 ? shade(tc, -0.3) : shade(tc, 0.05))); cyl(v, cx, 12.5, 1.5, hh, hh + 1, C(shade(tc, 0.2))); }
      const hc = 26 + lvl * 8;
      cyl(v, 12.5, 4.5, 1.8, 1, hc, C(0x8a98a4));
      for (let z = 7; z < hc; z += 6) { cyl(v, 12.5, 4.5, 2.8, z, z + 1, C(0x3a444c)); v.set(14, 6, z + 1, C(AMBER, EMIT)); }
      cone(v, 12.5, 4.5, 1.8, hc, 3, [0x6a7680]);
      const hf = 36 + lvl * 10;
      for (let z = 1; z < hf; z++) { v.set(13, 12, z, C(z % 6 < 3 ? 0x9a4a2e : 0xd8d4cc)); if (z % 6 === 0 && z < hf - 6) { v.set(12, 12, z, C(0x5a666c)); v.set(13, 11, z, C(0x5a666c)); v.set(14, 12, z, C(0x5a666c)); v.set(13, 13, z, C(0x5a666c)); } }
      v.set(13, 12, hf, C(AMBER, EMIT)); v.set(13, 12, hf + 1, C(0xffd24a, EMIT)); v.set(13, 12, hf + 2, C(0xfff0a8, EMIT)); v.emit(13, 12, hf + 4, 'smoke');
      v.box(1, 9, 4, 15, 10, 5, C(pc)); v.box(1, 9, 5, 12, 10, 6, C(shade(pc, -0.2)));
      for (const x of [1, 6, 11, 14]) v.box(x, 9, 1, x + 1, 10, 4, C(0x4a565c));
      v.box(10, 5, 3, 11, 10, 4, C(pc)); v.box(10, 10, 1, 11, 13, 2, C(pc));
      v.set(1, 15, 1, C(AMBER, EMIT)); v.set(15, 15, 1, C(AMBER, EMIT));
      return v;
    },
    (r, lvl) => { // landing platforms on stalks
      const v = new Vox(16, 16, 100);
      const body = pick(r, [TEAL[0], CERAM[0], [0x4a5a66, 0x44525e]]), acc = pick(r, [AMBER, CYAN, LIME]);
      const Hs = 38 + lvl * 16 + irand(r, 0, 6);
      v.box(6, 6, 0, 10, 10, Hs, mixc(body));
      for (let z = 2; z < Hs - 1; z++) { v.set(9, 9, z, z % 5 === 0 ? C(acc, EMIT) : C(0x1c262c)); if (z % 8 === 3) { v.set(7, 9, z, C(0x24343c, SMOOTH | COOL)); v.set(9, 7, z, C(0x24343c, SMOOTH | (r() < 0.5 ? COOL : 0))); } }
      const pads: [number, number, number][] = [[4, 12, Math.round(Hs * 0.35)], [12, 4, Math.round(Hs * 0.62)]];
      for (const [cx, cy, z] of pads) {
        v.box(Math.min(cx, 8), Math.min(cy, 8), z - 1, Math.max(cx, 8) + 1, Math.max(cy, 8) + 1, z, C(0x4a565c));
        v.box(cx, cy, 0, cx + 1, cy + 1, z, C(0x5a666c)); padDisc(v, r, cx + 0.5, cy + 0.5, z, 3.4, acc, r() < 0.75);
      }
      cyl(v, 8, 8, 6.4, Hs, Hs + 1, C(0x3a444c)); padDisc(v, r, 8, 8, Hs + 1, 6.4, acc, true);
      v.box(4, 4, Hs + 2, 7, 7, Hs + 5, mixc(body)); faces(v, 4, 4, 7, 7, Hs + 3, Hs + 4, C(0x24343c, SMOOTH | COOL)); mast(v, 5, 5, Hs + 5, 6, HOT, 0x8a98a4);
      return v;
    },
  ],
  huge: [
    (r, lvl) => { // megablock: twin hab slabs with bridges and slum accretions
      const v = new Vox(24, 24, 150);
      const wall = pick(r, [TEAL[0], TEAL[1], [0x2e2c36, 0x2a2832]]), acc = pick(r, [AMBER, MAG, CYAN]), acc2 = pick(r, [AMBER, HOT, CYAN]);
      const HA = 82 + lvl * 16, HB = Math.round(HA * 0.72);
      const slabAt = (x0: number, y1: number, h: number, s: number) => {
        v.box(x0, 2, 0, x0 + 8, y1, h, mixc(wall, 0, s));
        ribbon(v, r, x0, 2, x0 + 8, y1, 9, Math.floor((h - 12) / 3), 3, { glass: 0x0e1418, lit: 0.36, seg: 1, gap: 1, wh: 1, sill: 1, light: (q) => (q() < 0.8 ? WARM : COOL) });
        for (let z = 24; z < h - 4; z += 24) { faces(v, x0, 2, x0 + 8, y1, z, z + 2, C(shade(wall[0], 0.16))); for (let b = 4; b < y1 - 1; b += 5) v.set(x0 + 7, b, z + 1, C(acc2, EMIT)); }
        tank(v, x0 + 1, 4, h, 0x8a6a4a); tank(v, x0 + 5, 10, h, 0x5a666c); mast(v, x0 + 2, 15, h, 12, HOT, 0x5a666c); mast(v, x0 + 6, 5, h, 7, HOT, 0x5a666c);
      };
      slabAt(2, 20, HA, 1); slabAt(14, 20, HB, 2);
      v.box(2, 2, HA, 10, 11, HA + 12, mixc(wall, 0, 3)); tank(v, 4, 4, HA + 12, 0x5a666c); mast(v, 7, 8, HA + 12, 10, HOT, 0x5a666c);
      [30, 52, 70].forEach((z) => { if (z < HB - 6) { v.box(10, 16, z, 14, 20, z + 1, C(0x4a565c)); v.box(10, 16, z + 1, 14, 20, z + 3, C(0x24343c, SMOOTH)); onL(v, 19, 10, 14, z + 1, z + 2, C(0xffe0a0, EMIT)); v.box(10, 16, z + 3, 14, 20, z + 4, C(0x4a565c)); } });
      lightbox(v, r, 'L', 19, 16, 19, HB - 30, HB - 4, acc, 0x1a1418);
      lightbox(v, r, 'R', 21, 5, 8, HB - 36, HB - 8, acc2, 0x1a1418);
      holo(v, 'R', 22, 10, 12, 9, Math.min(36, HB - 50), pick(r, HOLO), [acc === MAG ? CYAN : MAG, VIO]);
      const on = [true, true, true, true];
      for (let i = 0; i < 2 + lvl * 2; i++) [1, 7, 13, 18].forEach((x, k) => { if (on[k] && (i < 2 || r() < 0.65)) container(v, r, x, 21, i * 3, 'x', k === 3 ? 5 : 6); else on[k] = false; });
      v.set(5, 23, 4, C(AMBER, EMIT)); v.set(16, 23, 2, C(HOT, EMIT));
      v.emit(5, 8, HA + 14, 'smoke');
      return v;
    },
    (r, lvl) => { // giant tiered arcology with vertical forests
      const v = new Vox(24, 24, 170);
      const wall = pick(r, CERAM), tiers = 6 + lvl, th = 13 + lvl;
      let z = 0, lx0 = 1, lx1 = 23;
      for (let t = 0; t < tiers; t++) {
        const x0 = 1 + (t >> 1), x1 = 23 - t * 2;
        v.box(x0, x0, z, x1, x1, z + th, mixc(wall, 0, t));
        ribbon(v, r, x0, x0, x1, x1, z + 1, Math.floor((th - 3) / 4), 4, { glass: 0x3a5a6a, lit: 0.26, seg: 2, gap: 1, wh: 2, sill: 1, light: COOL });
        faces(v, x0, x0, x1, x1, z + th - 2, z + th - 1, C(0x5a6a74));
        const m = (x0 + x1) >> 1;
        onL(v, x1 - 1, m - 1, m + 2, z, z + th, (_x, _y, zz) => C(0x4aa0b4, SMOOTH | (hash(zz, t, 3) < 0.4 ? COOL : 0)));
        z += th;
        hedge(v, r, x0, x1 - 2, x1, x1, z, 0.9); hedge(v, r, x1 - 2, x0, x1, x1 - 2, z, 0.9);
        vines(v, r, x0, x0, x1, x1, z, 4, 0.5);
        for (let k = 0; k < 3; k++) { const p = irand(r, x0 + 1, x1 - 4); if (k & 1) treeAt(v, p, x1 - 2, z, 1.5, GREEN, undefined, k + t); else treeAt(v, x1 - 2, p, z, 1.5, GREEN, 0xa5d167, k + t); }
        lx0 = x0; lx1 = x1;
      }
      const c = (lx0 + lx1) / 2;
      ball(v, c, c, z, (lx1 - lx0) / 2 - 0.5, 4.5, (x, y, zz) => ((x + y) % 3 === 0 || zz === z + 2 ? C(0xd8e0e6) : C(0x7ad0e0, SMOOTH)));
      mast(v, Math.floor(c), Math.floor(c), z + 4, 10, LIME, 0x8a98a4);
      return v;
    },
    (r, lvl) => { // spaceport
      const v = new Vox(24, 24, 120);
      v.box(0, 0, 0, 24, 24, 1, mixc([0x2a3036, 0x262c32]));
      for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; v.set(9.5 + Math.cos(a) * 8, 9.5 + Math.sin(a) * 8, 0, i % 5 === 0 ? C(AMBER, EMIT) : C(i % 2 ? 0xc8a030 : 0x3a444c)); }
      cyl(v, 9.5, 9.5, 4.2, 1, 3, C(0x3a444c));
      const L = 34 + lvl * 10, body = pick(r, [0xe8ecf0, 0xf0efe8, 0xd4dce6]), tr = pick(r, [0xe8601a, 0x2e6a6e, 0x9a2a3a]);
      cyl(v, 9.5, 9.5, 2.6, 3, 3 + L, (x, y, z) => (z === 3 + Math.round(L * 0.6) ? C(0x2a3036) : z > 3 + L - 8 && z < 3 + L - 5 && x + y > 20 ? C(0x24343c, SMOOTH | COOL) : z < 8 ? C(tr) : C(body, SMOOTH)));
      cone(v, 9.5, 9.5, 2.6, 3 + L, 8, [body]); v.set(9, 9, 11 + L, C(HOT, EMIT));
      for (const [bx, by] of [[6, 9.5], [13, 9.5], [9.5, 6], [9.5, 13]]) { cyl(v, bx, by, 1.3, 3, 3 + Math.round(L * 0.55), C(shade(body, -0.08), SMOOTH)); cone(v, bx, by, 1.3, 3 + Math.round(L * 0.55), 4, [tr]); }
      const G = L + 6; // gantry
      for (let z = 1; z < G; z++) {
        const c = C(z % 12 < 6 ? 0xc8a030 : 0x6a7680);
        for (const [x, y] of [[17, 5], [19, 5], [17, 7], [19, 7]]) v.set(x, y, z, c);
        if (z % 6 === 0) { v.box(17, 7, z, 20, 8, z + 1, c); v.box(19, 5, z, 20, 8, z + 1, c); } else if (z % 2) { v.set(18, 7, z, c); v.set(19, 6, z, c); }
      }
      for (const zz of [Math.round(L * 0.45), Math.round(L * 0.85)]) { v.box(11, 7, zz, 18, 8, zz + 1, C(0x8a98a4)); v.set(12, 8, zz, C(AMBER, EMIT)); }
      v.set(18, 6, G, C(HOT, EMIT)); v.set(18, 6, G + 1, C(HOT, EMIT));
      v.box(19, 19, 1, 21, 21, 20, C(0x8a98a4)); cyl(v, 20, 20, 3.4, 20, 21, C(0xd4dce6)); cyl(v, 20, 20, 3.4, 21, 23, (x, y) => C(0x24343c, SMOOTH | ((x + y) % 3 ? COOL : 0))); cyl(v, 20, 20, 3.4, 23, 24, C(0xd4dce6)); mast(v, 20, 20, 24, 6, HOT, 0x8a98a4);
      for (const [cx, cy] of [[4, 19.5], [10, 20.5]]) { ball(v, cx, cy, 4, 3, 3, (_x, _y, z) => C(z === 4 ? tr : 0xd8dee4, SMOOTH)); v.box(Math.floor(cx), Math.floor(cy), 1, Math.floor(cx) + 1, Math.floor(cy) + 1, 2, C(0x5a666c)); }
      v.box(4, 14, 1, 5, 19, 2, C(0x8a6a3a)); v.box(4, 13, 1, 9, 14, 2, C(0x8a6a3a));
      if (lvl > 1) { v.box(15, 15, 1, 17, 22, 3, C(body, SMOOTH)); v.box(13, 16, 1, 19, 19, 2, C(shade(body, -0.1))); v.box(15, 20, 3, 17, 22, 4, C(0x7fe8ff, SMOOTH)); v.box(15, 15, 3, 17, 16, 5, C(tr)); }
      v.emit(9, 9, 2, 'smoke'); v.emit(12, 12, 2, 'smoke');
      return v;
    },
    (r, lvl) => { // fusion plant: torus, core and cooling towers
      const v = new Vox(24, 24, 80);
      v.box(0, 0, 0, 24, 24, 1, mixc([0x2a3036, 0x262c32]));
      const glow = pick(r, [CYAN, MAG, LIME]), metal = pick(r, [[0x5a6a74, 0x52626c], [0x9aa8b4, 0x8e9ca8], [0x7a6a5c, 0x6e5e52]]);
      const cx = 11, cy = 11, R0 = 6.6, tr = 3.1;
      for (let z = 1; z < 10; z++)
        for (let y = 0; y < 22; y++)
          for (let x = 0; x < 22; x++) {
            const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy) - R0, dz = z + 0.5 - 5;
            if (d * d + dz * dz > tr * tr) continue;
            const seg = Math.floor((Math.atan2(dy, dx) + Math.PI) * (16 / Math.PI));
            v.set(x, y, z, seg % 4 === 0 && dz > -1 ? (seg % 8 === 0 ? C(glow, EMIT) : C(shade(glow, -0.55), SMOOTH)) : C(metal[(x + y) & 1]));
          }
      const hc = 18 + lvl * 4;
      cyl(v, cx, cy, 3, 1, hc, (_x, _y, z) => (z > 10 && z < hc - 2 && z % 3 ? C(0x1c262c, SMOOTH) : C(metal[0])));
      for (let z = 11; z < hc - 2; z++) { v.set(13, 12, z, C(glow, EMIT)); v.set(12, 13, z, C(glow, EMIT)); }
      ball(v, cx, cy, hc, 3, 2.6, C(shade(metal[0], 0.2), SMOOTH)); mast(v, 11, 11, hc + 2, 8, glow, 0x8a98a4);
      for (const [tx, ty] of [[20, 4], [4, 20]]) {
        const ht = 20 + lvl * 4;
        for (let z = 1; z < ht; z++) cyl(v, tx, ty, 4 - 1.7 * Math.sin((z / ht) * Math.PI * 0.8), z, z + 1, C(z > ht - 3 ? 0xb8442a : z % 7 === 0 ? 0xc4ccd4 : 0xd8dee4));
        cyl(v, tx, ty, 1.6, ht - 2, ht, 0); v.emit(tx, ty, ht + 1, 'smoke'); v.emit(tx, ty, ht + 2, 'smoke');
      }
      v.box(17, 17, 1, 23, 23, 6, mixc(TEAL[0])); ribbon(v, r, 17, 17, 23, 23, 1, 1, 5, { glass: 0x24343c, lit: 0.7, seg: 2, gap: 1, wh: 2, sill: 2, light: COOL, even: true });
      v.box(18, 18, 6, 22, 22, 7, C(0x3a444c)); mast(v, 21, 19, 7, 5, AMBER, 0x8a98a4);
      v.box(17, 12, 1, 18, 17, 3, C(0x8a6a3a)); v.box(12, 17, 1, 17, 18, 3, C(0x8a6a3a));
      for (const [x, y] of [[1, 1], [22, 12], [12, 22]]) { v.box(x, y, 1, x + 1, y + 1, 10, C(0x4a565c)); v.set(x, y, 10, C(AMBER, EMIT)); }
      v.emit(11, 11, hc + 4, 'spark');
      return v;
    },
  ],
  fill: [
    (r) => { // holo tree
      const v = new Vox(T, T, 20);
      const c = pick(r, [CYAN, MAG, LIME]);
      cyl(v, 4, 4, 2.4, 0, 1, C(0x2a3036)); v.box(4, 4, 1, 5, 5, 6, C(0x5a666c)); v.set(4, 4, 6, C(c, EMIT));
      ball(v, 4.5, 4.5, 10.5, 3.4, 4.4, (x, y, z) => (z % 3 === 0 && Math.hypot(x - 4, y - 4) > 1.2 ? C(hash(x, y, z, 7) < 0.3 ? lerpc(c, 0xffffff, 0.4) : shade(c, -0.35), EMIT) : 0));
      return v;
    },
    (r) => { // landing pad
      const v = new Vox(T, T, 8);
      padDisc(v, r, 4, 4, 0, 3.7, AMBER, r() < 0.7);
      return v;
    },
    (r) => { // energy pylons
      const v = new Vox(T, T, 22);
      const c = pick(r, [CYAN, AMBER]);
      for (const [x, y, h] of [[2, 2, 10], [5, 5, 14], [5, 1, 7]]) { v.box(x, y, 0, x + 1, y + 1, h, C(0x3a444c)); v.set(x, y, h - 3, C(c, EMIT)); v.set(x, y, h, C(0xf4f8ff, EMIT)); }
      return v;
    },
    (r) => { // bio-engineered tree
      const v = new Vox(T, T, 16);
      treeAt(v, 3, 3, 0, 2.5, [0x1a5a4a, 0x2a8a6a, 0x4ac89a, 0x8affd0], undefined, irand(r, 0, 9)); v.set(6, 6, 0, C(LIME, EMIT));
      return v;
    },
    (r) => { // steam vents and ducts
      const v = new Vox(T, T, 12);
      const pc = pick(r, [0x8a6a3a, 0x5a666c, 0x2e6a6e]);
      v.box(1, 1, 0, 4, 4, 2, C(0x3a444c)); v.box(2, 2, 2, 3, 3, 3, C(0x1c262c));
      v.box(4, 2, 1, 7, 3, 2, C(pc)); v.box(6, 2, 0, 7, 7, 1, C(pc)); v.box(5, 5, 0, 7, 7, 4, C(0x4a565c)); v.set(6, 6, 4, C(AMBER, EMIT));
      v.emit(2, 2, 4, 'smoke');
      return v;
    },
    (r) => { // holo-ad post
      const v = new Vox(T, T, 22);
      v.box(3, 4, 0, 5, 5, 2, C(0x3a444c)); v.set(3, 4, 2, C(0xf4f8ff, EMIT)); v.set(4, 4, 2, C(0xf4f8ff, EMIT));
      holo(v, 'L', 4, 1, 4, 6, 16, pick(r, HOLO), shuffle(r, [CYAN, MAG, VIO, AMBER]).slice(0, 2));
      return v;
    },
    (r) => { // hydroponic dome
      const v = new Vox(T, T, 12);
      cyl(v, 4, 4, 3.6, 0, 1, C(0x3a444c)); hedge(v, r, 2, 2, 6, 6, 1, 0.9);
      ball(v, 4, 4, 1, 3.4, 4, (x, y, z) => ((x + y) % 3 === 0 || z === 3 ? C(0xd8e0e6) : (x + y + z) % 2 ? C(0x9ae0e8, SMOOTH) : 0));
      return v;
    },
  ],
  sec: [
    (r) => { // orbital-elevator needle
      const v = new Vox(16, 16, 172);
      const body = pick(r, CERAM), acc = pick(r, [CYAN, MAG, LIME]);
      oct(v, 8, 8, 7.5, 4.5, 0, 6, mixc(TEAL[0])); faces(v, 1, 1, 15, 15, 2, 4, (x, y) => C(0x24343c, SMOOTH | ((x + y) % 3 === 0 ? COOL : 0)));
      oct(v, 8, 8, 5.5, 3.3, 6, 13, mixc(body)); oct(v, 8, 8, 3.5, 2, 13, 22, mixc(body, 0, 2));
      for (let k = 0; k < 14; k++) for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) v.set(8 + dx * (7 - k / 2), 8 + dy * (7 - k / 2), 6 + k * 2, C(0x8a98a4));
      const H = 150;
      for (let z = 22; z < H; z++) { const c = C(z % 10 === 0 ? 0x8a98a4 : 0x4a5862); v.box(7, 7, z, 9, 9, z + 1, c); if (z % 20 === 10) v.set(8, 8, z, C(acc, EMIT)); }
      [[50, 3.6], [90, 3], [126, 2.5]].forEach(([z, rad], i) => {
        cyl(v, 8, 8, rad, z, z + 1, C(body[1])); cyl(v, 8, 8, rad, z + 1, z + 2, (x, y) => C(0x24343c, SMOOTH | ((x + y + i) % 3 === 0 ? COOL : 0))); cyl(v, 8, 8, rad, z + 2, z + 3, C(body[0])); v.set(8 + rad, 8, z + 3, C(AMBER, EMIT));
      });
      const zc = irand(r, 60, 80);
      v.box(6, 6, zc, 10, 10, zc + 5, C(0xc8a030)); faces(v, 6, 6, 10, 10, zc + 2, zc + 3, C(0x24343c, SMOOTH | COOL)); v.set(9, 9, zc + 5, C(HOT, EMIT));
      for (let z = H; z < H + 10; z++) v.set(8, 8, z, C(0x8a98a4));
      v.set(8, 8, H + 10, C(acc, EMIT)); v.emit(8, 8, H + 12, 'spark');
      return v;
    },
    (r) => { // reactor dome
      const v = new Vox(16, 16, 60);
      const glow = pick(r, [CYAN, LIME, MAG]), s = irand(r, 0, 99);
      cyl(v, 8, 8, 7.6, 0, 4, mixc(TEAL[0])); cyl(v, 8, 8, 7.6, 4, 5, C(0x4a565c));
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + 0.3; v.set(8 + Math.cos(a) * 7, 8 + Math.sin(a) * 7, 2, C(0x3a2c1c, SMOOTH | WARM)); }
      ball(v, 8, 8, 5, 6.6, 15, (x, y, z) => {
        if ((x + y) % 4 === 0 || z % 5 === 0) return C(0xd4dce4);
        return hash(x >> 2, y >> 2, Math.floor(z / 5), s) < 0.4 ? C(glow, EMIT) : C(0x1c2c34, SMOOTH);
      });
      cyl(v, 8, 8, 2, 19, 22, C(0x8a98a4));
      for (let z = 22; z < 36; z++) v.set(8, 8, z, C(z % 3 ? 0xf4f8ff : glow, EMIT));
      for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) { v.box(x, y, 0, x + 1, y + 1, 14, C(0x4a565c)); v.set(x, y, 14, C(AMBER, EMIT)); }
      v.box(12, 10, 0, 15, 13, 6, C(0x8a6a3a)); v.box(13, 11, 6, 14, 12, 9, C(0x5a666c));
      v.emit(8, 8, 37, 'spark');
      return v;
    },
    (r) => { // holographic globe over a projector plaza
      const v = new Vox(16, 16, 50);
      const cols = shuffle(r, [CYAN, MAG, LIME, VIO]), s = irand(r, 0, 99);
      cyl(v, 8, 8, 7.4, 0, 1, C(0x2a3036)); cyl(v, 8, 8, 5.4, 0, 1, C(0x1c262c)); cyl(v, 8, 8, 2, 1, 3, C(0x4a565c));
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.6, x = Math.floor(8 + Math.cos(a) * 6), y = Math.floor(8 + Math.sin(a) * 6); v.box(x, y, 1, x + 1, y + 1, 8, C(0x5a666c)); v.set(x, y, 8, C(0xf4f8ff, EMIT)); }
      const cz = 24, R0 = 7.4;
      ball(v, 8, 8, cz, R0, R0, (x, y, z) => {
        const dx = x + 0.5 - 8, dy = y + 0.5 - 8, dz = z + 0.5 - cz, d = Math.hypot(dx, dy, dz) / R0;
        if (d < 0.86 || dx + dy + dz * 0.8 < -1 || z % 4 !== 0) return 0;
        return hash(x >> 2, y >> 2, Math.floor(z / 8), s) < 0.42 ? C(lerpc(cols[0], 0xffffff, 0.3), EMIT) : C(shade(cols[1], -0.15), EMIT);
      });
      for (let z = 4; z < cz - 8; z += 3) v.set(8, 8, z, C(0xf4f8ff, EMIT));
      return v;
    },
    (r) => { // floating gardens on stalks
      const v = new Vox(16, 16, 70);
      const body = pick(r, CERAM), zp = 26, zq = 42;
      cyl(v, 11, 11, 4.2, 0, 1, (x, y) => (Math.hypot(x + 0.5 - 11, y + 0.5 - 11) > 3.4 ? C(0xc4ccd4) : C(0x4ab0c0, SMOOTH)));
      for (const [x, y] of [[4, 4], [11, 5], [5, 11]]) v.box(x, y, 0, x + 1, y + 1, zp, C(0x8a98a4));
      cyl(v, 8, 8, 5, zp - 2, zp - 1, C(body[1])); cyl(v, 8, 8, 6.4, zp - 1, zp, C(body[1])); cyl(v, 8, 8, 7.4, zp, zp + 2, mixc(body));
      halo(v, 8, 8, zp, 7.4, CYAN, 4);
      for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) if (Math.hypot(x + 0.5 - 8, y + 0.5 - 8) < 6.6 && r() < 0.9) v.set(x, y, zp + 2, C(GREEN[irand(r, 1, 4)], ROUGH));
      treeAt(v, 4, 10, zp + 2, 2.4, GREEN, 0xf0a8c8, 1); treeAt(v, 11, 4, zp + 2, 2, GREEN, undefined, 2); treeAt(v, 10, 11, zp + 2, 1.6, [0x1a5a4a, 0x2a8a6a, 0x4ac89a, 0x8affd0], undefined, 3);
      v.box(5, 5, zp + 2, 6, 6, zq, C(0x8a98a4)); // upper deck
      cyl(v, 5.5, 5.5, 2.6, zq - 1, zq, C(body[1])); cyl(v, 5.5, 5.5, 3.8, zq, zq + 1, mixc(body)); halo(v, 5.5, 5.5, zq, 3.8, LIME, 3);
      ball(v, 5.5, 5.5, zq + 1, 3, 3.4, (x, y, z) => ((x + y) % 3 === 0 ? C(0xd8e0e6) : (x + y + z) % 2 ? C(0x9ae0e8, SMOOTH) : C(GREEN[2], ROUGH)));
      for (let z = 1; z < zp; z++) { v.set(13, 12, z, C(z % 3 ? 0x9ae0e8 : 0xd8f4f8, SMOOTH)); v.set(12, 13, z, C(z % 3 === 1 ? 0xd8f4f8 : 0x9ae0e8, SMOOTH)); }
      return v;
    },
  ],
  hero: (r) => { // megaspire: a tapering needle flanked by two lesser spires
    const v = new Vox(24, 24, 208);
    const HT = 160, s = irand(r, 0, 999);
    const hwAt = (z: number) => 2 + 8.6 * Math.pow(1 - z / HT, 0.72);
    oct(v, 12, 12, 11.9, 5, 0, 6, mixc(TEAL[1], 0, 9));
    faces(v, 0, 0, 24, 24, 2, 4, (x, y) => C(0x3a2c1c, SMOOTH | ((x + y) % 3 ? WARM : 0)));
    const skin = (z: number, hi: number, hw: number) => (x: number, y: number) => {
      const b = z % 26;
      if (b >= 24) return C(0x1c262c);
      if (z < hi) return z % 4 === 2 && (x + y) % 2 === 0 ? C(0x2a2014, SMOOTH | (hash(x, y, z, s) < 0.3 ? WARM : 0)) : C(TEAL[0][(x + y + z) & 1]);
      if (b < 15 && z % 3 === 1 && hw > 2.4) return C(0x34505c, SMOOTH | (hash(x + y * 5, z, s) < 0.26 ? COOL : 0));
      return C(CERAM[0][(x + y) & 1]);
    };
    for (let z = 6; z < HT; z++) {
      const hw = hwAt(z);
      oct(v, 12, 12, hw, hw * 0.5, z, z + 1, skin(z, 50, hw));
      if (z % 26 === 0 && z > 30) for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; if (Math.cos(a) + Math.sin(a) > -0.2 && hash(i, z) < 0.7) v.set(12 + Math.cos(a) * (hw + 0.6), 12 + Math.sin(a) * (hw + 0.6), z, C(GREEN[1 + (i % 3)], ROUGH)); }
    }
    const side = (cx: number, cy: number, h: number, col: number) => { // flanking spires
      for (let z = 0; z < h; z++) { const hw = 1.2 + 3 * Math.pow(1 - z / h, 0.7); oct(v, cx, cy, hw, hw * 0.5, z, z + 1, skin(z, 30, hw)); }
      for (let z = 32; z < h - 4; z++) if (z % 26 < 22 && z % 5) v.set(Math.floor(cx), Math.floor(cy + 1.2 + 3 * Math.pow(1 - z / h, 0.7) - 0.5), z, C(col, EMIT));
      mast(v, Math.floor(cx), Math.floor(cy), h, 10, col, 0x8a98a4);
      for (const zz of [Math.round(h * 0.42), Math.round(h * 0.7)]) { // bridges back to the main shaft
        const n = 14;
        for (let t = 0; t <= n; t++) { const x = Math.floor(cx + ((12 - cx) * t) / n), y = Math.floor(cy + ((12 - cy) * t) / n); v.box(x, y, zz, x + 1, y + 1, zz + 2, C(t % 3 === 1 ? 0x24343c : 0x8a98a4)); }
      }
    };
    side(4.5, 19.5, 104, CYAN); side(19.5, 4.5, 80, MAG);
    for (let z = 0; z < 60; z++) { // buttress fins
      const reach = Math.round(12 - 9.5 * Math.pow(z / 60, 0.7));
      v.box(11, 12, z, 13, 12 + reach, z + 1, C(0x2c4046)); v.box(12, 11, z, 12 + reach, 13, z + 1, C(0x283a40));
      if (z % 8 === 4) { v.set(12, 11 + reach, z, C(AMBER, EMIT)); v.set(11 + reach, 12, z, C(AMBER, EMIT)); }
    }
    for (let z = 52; z < HT - 2; z++) if (z % 26 < 22 && z % 5) { const f = Math.floor(12 + hwAt(z) - 0.5); v.set(12, f, z, C(CYAN, EMIT)); v.set(f, 12, z, C(CYAN, EMIT)); }
    for (const [z, col] of [[70, CYAN], [112, MAG], [140, CYAN]]) {
      const rad = Math.min(11.4, hwAt(z) + 3.6);
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.78; for (let t = hwAt(z) * 0.7; t < rad; t++) v.set(12 + Math.cos(a) * t, 12 + Math.sin(a) * t, z, C(0x5a666c)); }
      halo(v, 12, 12, z, rad, col, 4); halo(v, 12, 12, z + 3, rad - 1.2, 0xf4f8ff, 2);
    }
    for (const [z, ang] of [[40, 0.78], [92, 0.78]]) {
      const d = hwAt(z) + 2.2, cx = 12 + Math.cos(ang) * d, cy = 12 + Math.sin(ang) * d;
      for (let t = 0; t < d; t++) { const x = Math.floor(12 + Math.cos(ang) * t), y = Math.floor(12 + Math.sin(ang) * t); v.box(x, y, z - 1, x + 1, y + 1, z, C(0x4a565c)); }
      padDisc(v, r, cx, cy, z, 3.3, AMBER, true);
    }
    cyl(v, 12, 12, 3.6, HT, HT + 1, C(0x3a444c)); cyl(v, 12, 12, 2, HT + 1, HT + 4, mixc(CERAM[0]));
    v.box(11, 11, HT + 4, 13, 13, HT + 14, C(0x8a98a4));
    halo(v, 12, 12, HT + 8, 5, MAG, 2);
    for (let z = HT + 14; z < HT + 30; z++) v.set(12, 12, z, (z - HT) % 4 === 3 ? C(MAG, EMIT) : C(0x8a98a4));
    ball(v, 12.5, 12.5, HT + 22, 2.6, 2.6, (x, y, z) => ((x + y + z) % 2 ? C(0xf4f8ff, EMIT) : C(CYAN, EMIT)));
    v.set(12, 12, HT + 30, C(0xf4f8ff, EMIT)); v.emit(12, 12, HT + 32, 'spark');
    return v;
  },
  road: (r, d) => slab((x, y) => {
    const base = () => C(pick(r, [0x15181e, 0x12151b, 0x181b22]));
    if (d === 0) return (x === 0 || x === 7) && (y === 0 || y === 7) ? C(AMBER, EMIT) : (x === 3 || x === 4) && (y === 3 || y === 4) ? C(0x1c4a56) : base();
    const a = d === 1 ? x : y, b = d === 1 ? y : x;
    if (b === 0 || b === 7) return C(pick(r, [0x2a3238, 0x262e34]));
    if (b === 1) return a === 2 ? C(CYAN, EMIT) : C(0x1a3a44);
    if (b === 6) return a === 6 ? C(CYAN, EMIT) : C(0x1a3a44);
    return base();
  }, C(0x0e1014)),
  pave: (r) => {
    const v = ground(r, [0x232a30, 0x1f262c, 0x272e34], 0, { c: [0x2e383e], p: 0.06 }, C(0x0e1014));
    if (r() < 0.3) for (let i = 0; i < 8; i++) v.set(i, 7, 1, C(0x1c4a56));
    return v;
  },
  bridge: (r, d) => bridgeTile(r, d, [0x15181e, 0x181b22], 0x2a3238, 0, AMBER),
};

export { e9, e10 };
