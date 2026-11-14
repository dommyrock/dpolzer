// Epochs 7-8: early-modern city (limestone, brick, copper, art deco) -> modern downtown (glass, white slabs, concrete, colour).
import { hash, pick, irand, type R } from './rng';
import {
  C, EMIT, ROUGH, SMOOTH, WARM, COOL, Vox, T, type Col, type FacadeO,
  mixc, courses, onL, onR, hip, cyl, cone, ball, facade, house,
} from './shapes';
import { GREEN, ground, roadTile, bridgeTile } from './models_base';
import { type Cat } from './epochs_a';

// ================================ SHARED TOOLKIT ================================
const IRON = 0x2c2c32;
const sd = (r: R) => Math.floor(r() * 1e6);
const at = (c: Col, x: number, y: number, z: number) => (typeof c === 'number' ? c : c(x, y, z));
type F = 0 | 1; // visible face: 0 = left (+y plane, runs along x), 1 = right (+x plane, runs along y)
const on = (v: Vox, f: F, p: number, a0: number, a1: number, z0: number, z1: number, c: Col) =>
  (f ? onR : onL)(v, p, a0, a1, z0, z1, c);

/** Transposed copy (x <-> y): a free mirrored variant of any asymmetric model. */
function mirror(v: Vox): Vox {
  const m = new Vox(v.d, v.w, v.h);
  for (let z = 0; z < v.h; z++)
    for (let y = 0; y < v.d; y++)
      for (let x = 0; x < v.w; x++) m.data[(z * m.d + x) * m.w + y] = v.data[(z * v.d + y) * v.w + x];
  m.emitters = v.emitters.map((e) => ({ ...e, x: e.y, y: e.x }));
  return m;
}
const flip = (r: R, v: Vox) => (r() < 0.5 ? mirror(v) : v);

interface WO { glass?: number; lit?: number; cool?: number; ww?: number; gap?: number; wh?: number; sill?: number }
/** Window grid on ONE face, between a0 and a1. */
function wins(v: Vox, r: R, f: F, p: number, a0: number, a1: number, z0: number, floors: number, fh: number, o: WO = {}): void {
  const ww = o.ww ?? 1, gap = o.gap ?? 1, wh = o.wh ?? fh - 1, sill = o.sill ?? 0, lit = o.lit ?? 0.42, g = o.glass ?? 0x2b384c;
  for (let k = 0; k < floors; k++)
    for (let a = a0; a + ww <= a1; a += ww + gap) {
      const l = r() < lit ? (r() < (o.cool ?? 0) ? COOL : WARM) : 0;
      on(v, f, p, a, a + ww, z0 + k * fh + sill, z0 + k * fh + sill + wh, C(g, SMOOTH | l));
    }
}

interface MO { fh?: number; win?: FacadeO | null; cap?: Col; ov?: number; span?: Col }
/** Box mass with a window grid on both visible faces, optional spandrel strips and a cap slab. Returns its top z. */
function mass(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z0: number, floors: number, wall: Col, o: MO = {}): number {
  const fh = o.fh ?? 3, z1 = z0 + floors * fh;
  v.box(x0, y0, z0, x1, y1, z1, wall);
  if (o.win !== null) {
    const w = { sill: 0, wh: fh - 1, gap: 1, ww: 1, m: 1, ...o.win };
    if (o.span != null) {
      for (let a = x0 + w.m; a + w.ww <= x1 - w.m; a += w.ww + w.gap) onL(v, y1 - 1, a, a + w.ww, z0, z1, o.span);
      for (let b = y0 + w.m; b + w.ww <= y1 - w.m; b += w.ww + w.gap) onR(v, x1 - 1, b, b + w.ww, z0, z1, o.span);
    }
    facade(v, r, x0, y0, x1, y1, z0, floors, fh, w);
  }
  if (o.cap != null) { const ov = o.ov ?? 0; v.box(x0 - ov, y0 - ov, z1, x1 + ov, y1 + ov, z1 + 1, o.cap); return z1 + 1; }
  return z1;
}

/** Barrel vault over a rectangle; `hk` flattens it. Returns the crown height. */
function vault(v: Vox, x0: number, y0: number, x1: number, y1: number, z: number, along: 'x' | 'y', c: Col, hk = 1): number {
  const n = along === 'x' ? y1 - y0 : x1 - x0, rad = n / 2;
  let top = z;
  for (let i = 0; i < n; i++) {
    const d = i + 0.5 - rad, h = Math.max(1, Math.round(Math.sqrt(rad * rad - d * d) * hk));
    if (along === 'x') v.box(x0, y0 + i, z, x1, y0 + i + 1, z + h, c); else v.box(x0 + i, y0, z, x0 + i + 1, y1, z + h, c);
    top = Math.max(top, z + h);
  }
  return top;
}
function dome(v: Vox, cx: number, cy: number, z: number, rad: number, h: number, c: Col): number {
  for (let k = 0; k < h; k++) cyl(v, cx, cy, Math.max(0.7, rad * Math.sqrt(1 - (k / h) ** 2)), z + k, z + k + 1, c);
  return z + h;
}
function lampAt(v: Vox, x: number, y: number, h = 5, col = 0xffe9a8, z = 0, pole = IRON): void {
  v.box(x, y, z, x + 1, y + 1, z + h, C(pole)); v.set(x, y, z + h, C(col, EMIT));
}
function lawn(v: Vox, x0: number, y0: number, x1: number, y1: number, z = 0, col: number[] = [GREEN[2], GREEN[3]]): void {
  v.box(x0, y0, z, x1, y1, z + 1, (x, y) => C(col[Math.floor(hash(x, y, 8) * col.length)], ROUGH));
}
function tree(v: Vox, r: R, x: number, y: number, z = 0, rad = 2.3, pal: number[] = GREEN): void {
  const s = sd(r);
  v.box(x, y, z, x + 1, y + 1, z + 3, C(0x5a3d28));
  ball(v, x + 0.5, y + 0.5, z + 2.3 + rad, rad, rad * 0.9, (X, Y, Z) => C(pal[1 + Math.floor(hash(X, Y, Z, s) * 3)], ROUGH));
}
function flag(v: Vox, x: number, y: number, z: number, h: number, col: number): void {
  v.box(x, y, z, x + 1, y + 1, z + h, C(0xb8bcc4)); v.box(x + 1, y, z + h - 2, x + 3, y + 1, z + h, C(col));
}
/** Rooftop water tank on legs (n = 3 or 4 voxels wide). */
function tank(v: Vox, x: number, y: number, z: number, n = 4, h = 4): void {
  for (const [dx, dy] of [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1]]) v.box(x + dx, y + dy, z, x + dx + 1, y + dy + 1, z + 2, C(0x4a4a52));
  cyl(v, x + n / 2, y + n / 2, n === 3 ? 1.4 : 2, z + 2, z + 2 + h, (_x, _y, Z) => C(Z % 3 === 0 ? 0x8a6238 : 0xb08458));
  cone(v, x + n / 2, y + n / 2, n === 3 ? 1.8 : 2.4, z + 2 + h, 2, [0x7a6a5a, 0x6a5a4a]);
}
/** Zig-zag iron fire escape hung on a face (p = first plane outside the wall). */
function fireEsc(v: Vox, f: F, p: number, a: number, z0: number, n: number, fh = 3): void {
  for (let k = 1; k <= n; k++) {
    const z = z0 + k * fh;
    on(v, f, p, a, a + 3, z, z + 1, C(0x3a3a42));
    if (k < n) { const s = k & 1 ? a : a + 2; on(v, f, p, s, s + 1, z + 1, z + 2, C(0x4a4a52)); }
  }
}
function awning(v: Vox, f: F, p: number, a0: number, a1: number, z: number, c: number, c2 = 0xf2ead8): void {
  for (let a = a0; a < a1; a++) on(v, f, p, a, a + 1, z, z + 1, C((a - a0) & 1 ? c2 : c));
}
/** Theatre / hotel canopy: lit reader board with a row of bulbs. */
function marquee(v: Vox, f: F, p: number, a0: number, a1: number, z: number, body = 0x7a2424): void {
  on(v, f, p, a0, a1, z, z + 2, C(body));
  on(v, f, p + 1, a0, a1, z + 1, z + 2, C(0xf6eed8, WARM));
  for (let a = a0; a < a1; a++) on(v, f, p + 1, a, a + 1, z, z + 1, (a - a0) & 1 ? C(body) : C(0xffd98a, EMIT));
}
/** Sign letters on a scaffold along a roof edge. */
function roofSign(v: Vox, r: R, f: F, p: number, a0: number, a1: number, z: number, col: number): void {
  on(v, f, p, a0, a1 - ((a1 - a0) % 3 === 0 ? 1 : 0), z + 1, z + 2, C(IRON));
  for (let a = a0; a + 2 <= a1; a += 3) {
    on(v, f, p, a, a + 1, z, z + 1, C(IRON)); on(v, f, p, a + 1, a + 2, z, z + 1, C(IRON));
    on(v, f, p, a, a + 2, z + 2, z + 5, C(col, EMIT));
    if (r() < 0.75) on(v, f, p, a + (r() < 0.5 ? 0 : 1), a + 1 + (r() < 0.5 ? 0 : 0), z + 3, z + 4, 0);
  }
}
/** Period car (3 long). ax 0 = along x. `mod` gives the brighter modern palette. */
function carAt(v: Vox, r: R, x: number, y: number, ax: F, mod = false, z = 0): void {
  const c = C(pick(r, mod ? [0xd03a30, 0x2f6fc0, 0xf0f0ec, 0x30343a, 0xe8b830, 0x3fa070, 0xc0c4cc] : [0x34343c, 0x7a2a2a, 0x2a5a48, 0x34466a, 0xd8ceb4, 0x9a4428, 0xb89a4a]));
  if (ax) { v.box(x, y, z, x + 2, y + 3, z + 1, c); v.box(x, y, z + 1, x + 2, y + 2, z + 2, C(mod ? 0xa8cce0 : 0x3a4048, SMOOTH)); }
  else { v.box(x, y, z, x + 3, y + 2, z + 1, c); v.box(x, y, z + 1, x + 2, y + 2, z + 2, C(mod ? 0xa8cce0 : 0x3a4048, SMOOTH)); }
}

// ================================ EPOCH 7 ======================================
// Palette identity: warm limestone, buff/red/brown brick, terracotta, copper-green roofs, gold deco trim.
const LIME = [[0xdccdaa, 0xd0c19e, 0xe4d6b6], [0xcdbb96, 0xc1af8a, 0xd6c5a2], [0xc9c0ae, 0xbdb4a2, 0xd3cab9]];
const BRK7 = [[0xa6563e, 0x9a4c36, 0xb06046], [0x8a4a3c, 0x7e4034, 0x965444], [0xc08a5c, 0xb47e52, 0xca9666], [0x74463a, 0x683c32, 0x805042]];
const TERRA = [0xc8693f, 0xb85c36, 0xd47848];
const COPPER = [0x5fa58c, 0x4f957c, 0x74b79e];
const GRANITE = [0x4e4a4c, 0x423e42, 0x5a565a];
const GOLD = 0xe2c060, CREAM = 0xeee2c8, ROOF7 = 0x55555d, W7 = 0x2b384c;
const FLAGS = [0xc8342c, 0x2f5fa0, 0xe0b030, 0x2f8a5a];
const SIGN7 = [0xff5a4a, 0xffd24a, 0xff8a3a, 0x8fe6ff];
const win7: FacadeO = { glass: W7, lit: 0.42, ww: 1, gap: 1, m: 1 };
const copper: Col = (_x, _y, z) => C(COPPER[z % 2]);

/** Crowns shared by the deco towers. */
function crown7(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z: number, kind: number): void {
  const cx = (x0 + x1) >> 1, cy = (y0 + y1) >> 1;
  if (kind === 0) { // steep copper pyramid + needle
    let k = 0;
    while (x1 - x0 - 2 * k >= 1 && y1 - y0 - 2 * k >= 1) { v.box(x0 + k, y0 + k, z + k * 2, x1 - k, y1 - k, z + k * 2 + 2, C(COPPER[k % 2])); k++; }
    v.box(cx, cy, z + k * 2, cx + 1, cy + 1, z + k * 2 + 4, C(0xc8ccd0)); v.set(cx, cy, z + k * 2 + 4, C(0xff4a3a, EMIT));
  } else if (kind === 1) { // glowing lantern under a gold cap
    v.box(x0 + 1, y0 + 1, z, x1 - 1, y1 - 1, z + 3, C(CREAM));
    onL(v, y1 - 2, x0 + 2, x1 - 2, z + 1, z + 2, C(0xffe2a0, EMIT)); onR(v, x1 - 2, y0 + 2, y1 - 2, z + 1, z + 2, C(0xffe2a0, EMIT));
    hip(v, x0 + 1, y0 + 1, x1 - 1, y1 - 1, z + 3, [0xc9a84c, GOLD], 0);
  } else if (kind === 2) { // penthouse + flag
    v.box(x0 + 1, y0 + 1, z, x1 - 2, y1 - 2, z + 2, C(0xb8ae9c)); flag(v, x1 - 2, y1 - 2, z, 7, pick(r, FLAGS));
  } else tank(v, x0, y0, z, x1 - x0 >= 5 ? 4 : 3);
}

const e7: Cat = {
  // garden suburb -> rowhouses -> tenements -> shops -> offices -> roadside
  small: [
    (r, lvl) => { // 0 bungalow with porch and garden
      const v = new Vox(T, T, 22);
      const wc = pick(r, [[0xe9e0ca, 0xddd4be], [0xcfd9c6, 0xc3cdba], [0xe0cda4, 0xd4c198], [0xc6ced6, 0xbac2ca], [0xd9b9a0, 0xcdad94]]);
      const rf = pick(r, [[0x5c6e60, 0x506254], [0x8c4c3c, 0x7e4234], [0x4d5a70, 0x435066], [0x6a5a50, 0x5e4e44]]);
      house(r, { n: 1, w: 6, d: 5, floors: lvl > 1 ? 2 : 1, fh: 3, wall: courses(wc), base: C(0x8f887a), roof: rf, roofType: lvl === 1 ? 'hip' : 'gable', along: 'x', chimney: 0x8a4a3c, smoke: r() < 0.5, win: { glass: W7, lit: 0.5, gap: 2 }, door: 0x5a3a28 }, { v, x0: 1, y0: 0 });
      v.box(1, 5, 0, 5, 7, 1, C(0xb9b1a1));
      v.box(1, 6, 1, 2, 7, 4, C(0xf2eee2)); v.box(4, 6, 1, 5, 7, 4, C(0xf2eee2));
      v.box(1, 5, 4, 5, 7, 5, C(rf[1]));
      lawn(v, 5, 5, 8, 8); lawn(v, 0, 7, 5, 8);
      v.set(6, 6, 1, C(GREEN[1], ROUGH)); v.set(6, 7, 1, C(pick(r, [0xe8a0b0, 0xf4e36b, 0xffffff]), ROUGH));
      return flip(r, v);
    },
    (r, lvl) => { // 1 pair of brownstones with stoops
      const v = new Vox(T, T, 30);
      for (const x0 of [0, 4]) {
        const fl = 3 + lvl - (r() < 0.35 ? 1 : 0), H = fl * 3 + 1;
        v.box(x0, 0, 0, x0 + 4, 7, H, mixc(pick(r, BRK7), 0, sd(r)));
        v.box(x0, 0, 0, x0 + 4, 7, 1, mixc(GRANITE));
        wins(v, r, 0, 6, x0, x0 + 4, 1, fl, 3, { lit: 0.45 });
        wins(v, r, 1, x0 + 3, 1, 6, 1, fl, 3, { lit: 0.45 });
        onL(v, 6, x0 + 2, x0 + 3, 1, 3, C(pick(r, [0x4a2c20, 0x2a4a3a, 0x7a2a2a, 0x2a2a30])));
        v.box(x0 + 2, 7, 0, x0 + 3, 8, 1, C(0xb0a898));
        v.box(x0, 0, H, x0 + 4, 8, H + 1, C(pick(r, [CREAM, 0xb8ae9c, 0x6a5a50]))); v.box(x0, 0, H, x0 + 4, 6, H + 1, C(ROOF7));
        v.box(x0 + 1, 1, H + 1, x0 + 2, 2, H + 3, C(0x7e4034));
      }
      return flip(r, v);
    },
    (r, lvl) => { // 2 tenement with fire escape and water tank
      const v = new Vox(T, T, 40), fl = 4 + lvl + irand(r, 0, 1), b = pick(r, BRK7);
      let z = mass(v, r, 0, 0, 7, 7, 0, fl, mixc(b, 0, sd(r)), { win: { ...win7, sill: 1, wh: 2 } });
      if (r() < 0.5) { // shop on the ground floor
        v.box(0, 0, 0, 7, 7, 3, C(pick(r, [0x3a4a40, 0x5a2a28, 0x2e3a52, 0x4a4038])));
        onL(v, 6, 1, 3, 0, 2, C(0xa8bcc0, SMOOTH | WARM)); onL(v, 6, 4, 6, 0, 2, C(0xa8bcc0, SMOOTH | WARM)); onR(v, 6, 1, 6, 0, 2, C(0xa8bcc0, SMOOTH));
      } else { v.box(0, 0, 0, 7, 7, 1, mixc(GRANITE)); onL(v, 6, 3, 4, 1, 3, C(0x3a2a20)); v.box(3, 7, 0, 4, 8, 1, C(0xb0a898)); }
      v.box(0, 0, z, 8, 8, z + 1, C(pick(r, [CREAM, 0xb8ae9c, 0x6a5a50]))); v.box(0, 0, z, 6, 6, z + 1, C(ROOF7));
      fireEsc(v, 0, 7, 2, 0, fl - 1);
      z++;
      if (lvl > 0 || r() < 0.4) tank(v, 1, 1, z, 3, 3);
      v.box(5, 1, z, 6, 2, z + 2, C(b[1]));
      return flip(r, v);
    },
    (r, lvl) => { // 3 corner shop with striped awning
      const v = new Vox(T, T, 30), up = pick(r, [LIME[0], LIME[1], BRK7[2], [0xcfd6c8, 0xc3cabc], [0xe2c8b4, 0xd6bca8]]), fl = 1 + lvl + irand(r, 0, 1);
      const a = pick(r, [0xb8342c, 0x2f5f9a, 0x2f7a52, 0xc88a2a]);
      v.box(0, 0, 0, 7, 7, 4, C(pick(r, [0x3a4a40, 0x5a2a28, 0x2e3a52, 0x3a3a40])));
      onL(v, 6, 1, 3, 0, 3, C(0xa8bcc0, SMOOTH | WARM)); onL(v, 6, 4, 6, 0, 3, C(0xa8bcc0, SMOOTH | WARM)); onL(v, 6, 3, 4, 0, 3, C(0x2a2420));
      onR(v, 6, 1, 6, 0, 3, C(0xa8bcc0, SMOOTH | WARM));
      awning(v, 0, 7, 0, 7, 3, a); awning(v, 1, 7, 0, 8, 3, a);
      let z = mass(v, r, 0, 0, 7, 7, 4, fl, mixc(up, 0, sd(r)), { win: { ...win7, sill: 1, wh: 2, lit: 0.5 } });
      v.box(0, 0, z, 8, 8, z + 1, C(CREAM)); v.box(0, 0, z, 6, 6, z + 1, C(ROOF7));
      z++;
      if (r() < 0.6) { onL(v, 6, 1, 6, z, z + 3, C(0xf0e6cc)); onL(v, 6, 1, 6, z + 1, z + 2, C(a)); } // painted roof sign
      else v.box(1, 1, z, 3, 3, z + 2, C(0x8a8a90));
      return v;
    },
    (r, lvl) => { // 4 streamline diner
      const v = new Vox(T, T, 14), st = pick(r, [0xc8342c, 0x2f8a8a, 0xe0a030, 0x2f5f9a]);
      const col: Col = (_x, _y, z) => (z === 0 ? C(st) : z === 1 ? C(0xa8c8d0, SMOOTH | WARM) : C(0xdfe3ea, SMOOTH));
      cyl(v, 2, 3, 2, 0, 3, col); cyl(v, 6, 3, 2, 0, 3, col); v.box(2, 1, 0, 6, 5, 3, col);
      v.box(1, 1, 3, 7, 5, 4, C(0xf0f2f6, SMOOTH)); v.box(1, 2, 4, 7, 4, 5, C(st));
      onL(v, 4, 3, 5, 0, 2, C(0x4a3a30));
      v.set(2, 3, 5, C(IRON)); v.set(5, 3, 5, C(IRON)); onL(v, 3, 2, 6, 6, 7, C(pick(r, SIGN7), EMIT));
      if (lvl > 0) carAt(v, r, lvl > 1 ? 1 : 4, 6, 0);
      return flip(r, v);
    },
    (r, lvl) => { // 5 small deco office with blade sign
      const v = new Vox(T, T, 44), L = pick(r, LIME), fl = 3 + lvl * 2 + irand(r, 0, 1), s = sd(r);
      let z = mass(v, r, 0, 0, 7, 7, 0, 1, mixc(GRANITE, 0, s), { fh: 4, win: { glass: 0xa8bcc0, lit: 0.7, wh: 3 } });
      onL(v, 6, 3, 4, 0, 3, C(GOLD, WARM));
      z = mass(v, r, 0, 0, 7, 7, z, fl, mixc(L, 0, s), { win: win7, span: C(pick(r, [0x7a6e5c, 0x8a5a44, 0x4f7f6c])), cap: C(CREAM) });
      v.box(1, 1, z, 6, 6, z + 1 + (lvl > 0 ? 1 : 0), mixc(L, 0, s));
      crown7(v, r, 2, 2, 5, 5, z + 1 + (lvl > 0 ? 1 : 0), pick(r, [0, 1, 2]));
      if (r() < 0.6) for (let k = 0; k < 6 + lvl * 2; k++) v.set(7, 3, 6 + k, k % 3 === 2 ? C(0x3a2020) : C(pick(r, [0xff5a4a, 0xffd24a]), EMIT));
      return flip(r, v);
    },
    (r, lvl) => { // 6 gas station
      const v = new Vox(T, T, 16), ac = pick(r, [0xc8342c, 0x2f6fa0, 0x2f8a5a, 0xe08a2a]);
      v.box(0, 0, 0, 5, 3, 4, C(0xf0ede4)); v.box(0, 0, 3, 5, 3, 4, C(ac));
      onL(v, 2, 1, 4, 1, 3, C(0xa8c8d0, SMOOTH | WARM)); onR(v, 4, 1, 2, 0, 3, C(0x4a3a30));
      v.box(1, 3, 4, 7, 7, 5, C(0xf0ede4)); onL(v, 6, 1, 7, 4, 5, C(ac)); onR(v, 6, 3, 7, 4, 5, C(ac));
      v.box(4, 5, 0, 5, 6, 4, C(0xd8d4cc));
      for (const x of [2, 6]) { v.box(x, 5, 0, x + 1, 6, 2, C(ac)); v.set(x, 5, 2, C(0xfff0c0, EMIT)); }
      v.box(7, 0, 0, 8, 1, 7 + lvl, C(IRON)); v.box(6, 0, 7 + lvl, 8, 1, 9 + lvl, C(ac)); v.set(7, 0, 8 + lvl, C(0xfff0c0, EMIT));
      if (r() < 0.6) carAt(v, r, 1, 6, 0);
      return flip(r, v);
    },
  ],
  // apartments -> hotel -> stores & theatre -> office core -> flatiron -> bank -> tram depot
  large: [
    (r, lvl) => { // 0 U- or L-shaped apartment block around a planted court
      const v = new Vox(16, 16, 46), s = sd(r), wall = mixc(pick(r, BRK7), 0, s), fl = 4 + lvl + irand(r, 0, 1), U = r() < 0.5;
      const trim = C(pick(r, [CREAM, 0xcfc3a8, 0xb8ae9c]));
      const boxes = U ? [[0, 0, 15, 5], [0, 5, 5, 14], [10, 5, 15, 14]] : [[0, 0, 15, 7], [0, 7, 7, 14]];
      lawn(v, 1, 1, 15, 14);
      let z = 0;
      boxes.forEach(([x0, y0, x1, y1], i) => {
        z = mass(v, r, x0, y0, x1, y1, 0, fl, wall, { win: { ...win7, sill: 1, wh: 2, lit: 0.45 }, cap: trim });
        v.box(x0, y0, 0, x1, y1, 1, mixc(GRANITE, 0, s));
        v.box(x0 + 1, y0 + (i ? -1 : 1), z - 1, x1 - 1, y1 - 1, z, C(ROOF7));
        if (i) { onL(v, y1 - 1, x0 + 2, x0 + 3, 1, 3, C(0x3a2a20)); fireEsc(v, 0, y1, x0 + 1, 0, fl - 1); }
      });
      if (U) { tree(v, r, 7, 8, 1, 2.2); tree(v, r, 7, 12, 1, 1.8); v.box(5, 14, 0, 10, 15, 2, C(GREEN[1], ROUGH)); }
      else { tree(v, r, 9, 9, 1, 2.4); tree(v, r, 12, 12, 1, 2); tree(v, r, 13, 8, 1, 1.7); v.box(8, 14, 0, 15, 15, 2, C(GREEN[1], ROUGH)); }
      tank(v, 2, 1, z, 3, 3); if (lvl > 0) tank(v, 10, 1, z, 3, 3);
      v.box(7, 2, z, 8, 3, z + 2, C(0x7e4034));
      return flip(r, v);
    },
    (r, lvl) => { // 1 hotel slab with rooftop sign and entrance marquee
      const v = new Vox(16, 16, 76), s = sd(r), L = mixc(pick(r, LIME), 0, s), b = mixc(pick(r, [BRK7[0], BRK7[2], BRK7[1], TERRA]), 0, s + 1);
      const fl = 6 + lvl * 3 + irand(r, 0, 1);
      let z = mass(v, r, 1, 3, 14, 12, 0, 1, L, { fh: 5, win: { glass: 0xa8bcc0, lit: 0.8, wh: 3, sill: 1 }, cap: C(CREAM), ov: 1 });
      z = mass(v, r, 1, 3, 14, 12, z, fl, b, { win: { ...win7, lit: 0.45 } });
      z = mass(v, r, 1, 3, 14, 12, z, 1, L, { win: win7, cap: C(CREAM), ov: 1 });
      v.box(2, 4, z - 1, 13, 11, z, C(ROOF7));
      for (let zz = 6; zz < z - 5; zz++) { if (zz % 2) { v.set(1, 11, zz, C(CREAM)); v.set(13, 11, zz, C(CREAM)); v.set(13, 3, zz, C(CREAM)); } } // quoins
      onL(v, 11, 6, 9, 0, 4, C(0x3a2a20)); onL(v, 11, 7, 8, 0, 3, C(0xe0c880, WARM));
      marquee(v, 0, 12, 5, 10, 4);
      if (r() < 0.5) { for (const x of [1, 10]) { v.box(x, 3, z, x + 4, 8, z + 3, L); hip(v, x, 3, x + 4, 8, z + 3, COPPER, 0, 2); } }
      else { v.box(5, 4, z, 10, 8, z + 2, C(0xb8ae9c)); tank(v, 2, 4, z, 3, 3); }
      roofSign(v, r, 0, 10, 2, 13, z, pick(r, SIGN7));
      return flip(r, v);
    },
    (r, lvl) => { // 2 department store with corner turret
      const v = new Vox(16, 16, 52), s = sd(r), Lp = pick(r, [LIME[0], LIME[2], [0xe6dcc6, 0xdad0ba, 0xeee6d2], [0xd8b8a0, 0xccac94, 0xe2c4ac]]), L = mixc(Lp, 0, s);
      const fl = 3 + lvl, aw = pick(r, [0x2f6a52, 0xa8342c, 0x2f4f8a, 0xb8842a]);
      v.box(1, 1, 0, 14, 14, 4, mixc(GRANITE, 0, s));
      wins(v, r, 0, 13, 2, 13, 0, 1, 4, { ww: 2, wh: 3, glass: 0xb0c4c4, lit: 0.9 }); wins(v, r, 1, 13, 2, 13, 0, 1, 4, { ww: 2, wh: 3, glass: 0xb0c4c4, lit: 0.9 });
      awning(v, 0, 14, 2, 13, 3, aw); awning(v, 1, 14, 2, 13, 3, aw);
      let z = mass(v, r, 1, 1, 14, 14, 4, fl, L, { fh: 4, win: { glass: W7, lit: 0.42, ww: 2, wh: 3 }, span: C(pick(r, [0x6a8a7a, 0x8a6a4a, 0x7a6e5c])), cap: C(CREAM), ov: 1 });
      v.box(2, 2, z - 1, 13, 13, z, C(ROOF7));
      if (r() < 0.6) { // domed corner turret with clock
        cyl(v, 13, 13, 2.3, 0, z + 3, (x, y, zz) => (zz > 4 && zz < z && zz % 4 > 0 && zz % 4 < 3 && (x + y) % 2 === 0 ? C(W7, SMOOTH | WARM) : C(Lp[(x + zz) % 2])));
        cyl(v, 13, 13, 2.8, z + 3, z + 4, C(CREAM)); dome(v, 13, 13, z + 4, 2.6, 4, copper); v.box(13, 13, z + 8, 14, 14, z + 10, C(GOLD));
        v.set(14, 14, z + 1, C(0xf6eed8, WARM));
      } else { // stepped clock gable
        v.box(5, 12, z, 10, 14, z + 3, L); v.box(6, 12, z + 3, 9, 14, z + 5, L); onL(v, 13, 7, 8, z + 2, z + 4, C(0xf6eed8, WARM)); flag(v, 7, 12, z + 5, 6, pick(r, FLAGS));
      }
      v.box(3, 3, z, 8, 6, z + 2, C(0xb8ae9c)); vault(v, 4, 8, 11, 11, z, 'x', (x) => C(x % 2 ? 0x8fb0b0 : 0x5a6a6a, SMOOTH), 0.7);
      flag(v, 2, 12, z, 6, pick(r, FLAGS));
      return flip(r, v);
    },
    (r, lvl) => { // 3 theatre: fly tower, auditorium, bulb marquee and blade sign
      const v = new Vox(16, 16, 52), s = sd(r), L = mixc(pick(r, [LIME[0], LIME[1], [0xe0b8a0, 0xd4ac94, 0xeac4ac]]), 0, s), b = mixc(pick(r, BRK7), 0, s + 1);
      const fh = 16 + lvl * 4, lob = 10 + lvl * 2;
      v.box(1, 1, 0, 14, 6, fh, b); v.box(1, 1, fh, 14, 6, fh + 1, C(CREAM)); v.box(2, 2, fh, 13, 5, fh + 1, C(ROOF7));
      onR(v, 13, 2, 5, fh - 6, fh - 2, C(0xf0e6cc)); onR(v, 13, 2, 5, fh - 5, fh - 3, C(pick(r, [0xb8342c, 0x2f5f9a, 0x2f7a52]))); // painted wall ad
      v.box(1, 6, 0, 14, 12, 9, b); vault(v, 1, 6, 14, 12, 9, 'x', C(0x6a6a72), 0.5);
      wins(v, r, 1, 13, 7, 11, 2, 1, 6, { wh: 4, lit: 0.3 });
      v.box(2, 12, 0, 13, 14, lob, L);
      for (const x of [3, 5, 9, 11]) onL(v, 13, x, x + 1, 5, lob - 2, C(0x8a5a44));
      onL(v, 13, 6, 9, 5, lob - 1, C(0xb8c8c0, SMOOTH | WARM)); onL(v, 13, 4, 11, 0, 3, C(0x3a2420)); onL(v, 13, 5, 10, 0, 3, C(0xe0c880, WARM)); onL(v, 13, 7, 8, 0, 3, C(0x3a2420));
      v.box(2, 12, lob, 13, 14, lob + 1, C(CREAM)); v.box(5, 12, lob + 1, 10, 14, lob + 2, L); v.box(6, 12, lob + 2, 9, 14, lob + 3, C(GOLD));
      marquee(v, 0, 14, 3, 12, 3, pick(r, [0x7a2424, 0x24447a, 0x2a5a4a]));
      const sc = pick(r, SIGN7); // blade sign
      v.box(12, 14, 5, 13, 15, lob + 5, C(0x3a2020));
      for (let z = 6; z < lob + 4; z++) if (z % 3) v.set(12, 15, z, C(sc, EMIT));
      v.set(12, 14, lob + 5, C(0xffd98a, EMIT));
      return flip(r, v);
    },
    (r, lvl) => { // 4 limestone ziggurat tower
      const v = new Vox(16, 16, 90), s = sd(r), Lp = pick(r, LIME), wall = mixc(Lp, 0, s), sp = C(pick(r, [0x8a7a62, 0x6a6258, 0x9a5a44, 0x4f7f6c]));
      const corner = r() < 0.4, n = [[3, 0, 3, 0, 2], [4, 3, 3, 2, 1], [5, 4, 4, 3, 2]][lvl];
      let z = 0, last = [1, 1, 14, 14];
      [13, 11, 9, 7, 5].forEach((w, i) => {
        if (!n[i]) return;
        const x0 = corner ? 1 : 1 + ((13 - w) >> 1), x1 = x0 + w;
        z = mass(v, r, x0, x0, x1, x1, z, n[i], wall, { win: { ...win7, lit: 0.45 }, span: sp, cap: C(CREAM) });
        v.set(x1 - 1, x1 - 1, z, C(GOLD)); v.set(x0, x1 - 1, z, C(GOLD)); v.set(x1 - 1, x0, z, C(GOLD));
        last = [x0, x0, x1, x1];
      });
      v.box(1, 1, 0, 14, 14, 1, mixc(GRANITE, 0, s)); onL(v, 13, 6, 9, 0, 4, C(0x3a3030)); onL(v, 13, 7, 8, 0, 3, C(GOLD, WARM));
      crown7(v, r, last[0], last[1], last[2], last[3], z, pick(r, [0, 1, 2, 0]));
      return flip(r, v);
    },
    (r, lvl) => { // 5 slender shaft with corner buttresses and copper crown
      const v = new Vox(16, 16, 96), s = sd(r), wp = pick(r, [LIME[0], LIME[2], BRK7[2], TERRA, [0xb8a890, 0xac9c84, 0xc4b49c]]), wall = mixc(wp, 0, s), L = mixc(LIME[0], 0, s);
      const fl = 6 + lvl * 4 + irand(r, 0, 1);
      let z = mass(v, r, 1, 1, 14, 14, 0, 2, L, { win: { glass: 0x8fa8ac, lit: 0.7, ww: 2 }, cap: C(CREAM) });
      v.box(1, 1, 0, 14, 14, 1, mixc(GRANITE, 0, s)); onL(v, 13, 6, 9, 0, 5, C(0x3a3030)); onL(v, 13, 7, 8, 0, 4, C(GOLD, WARM));
      v.box(2, 2, z - 1, 13, 13, z, C(ROOF7));
      const z1 = mass(v, r, 4, 4, 11, 11, z, fl, wall, { win: { ...win7, lit: 0.4 }, span: C(pick(r, [0x7a6e5c, 0x5a5650, 0x8a5a44])) });
      const bh = z + Math.floor(fl * 0.72) * 3;
      for (const [x, y] of [[3, 3], [10, 3], [3, 10], [10, 10]]) { v.box(x, y, z, x + 2, y + 2, bh, L); v.box(x, y, bh, x + 2, y + 2, bh + 1, C(CREAM)); v.set(x + (x > 5 ? 1 : 0), y + (y > 5 ? 1 : 0), bh + 1, C(GOLD)); }
      v.box(3, 3, z1, 12, 12, z1 + 1, C(CREAM));
      const ck = pick(r, [0, 0, 1]);
      if (ck === 0) { v.box(5, 5, z1 + 1, 10, 10, z1 + 4, wall); onL(v, 9, 6, 9, z1 + 2, z1 + 3, C(W7, SMOOTH | WARM)); onR(v, 9, 6, 9, z1 + 2, z1 + 3, C(W7, SMOOTH | WARM)); crown7(v, r, 5, 5, 10, 10, z1 + 4, 0); }
      else { cyl(v, 7.5, 7.5, 3, z1 + 1, z1 + 5, (x, y, zz) => ((x + y) % 2 && zz > z1 + 1 ? C(W7, SMOOTH | WARM) : C(wp[0]))); dome(v, 7.5, 7.5, z1 + 5, 3.2, 4, copper); v.box(7, 7, z1 + 9, 8, 8, z1 + 13, C(0xc8ccd0)); v.set(7, 7, z1 + 13, C(0xff4a3a, EMIT)); }
      tree(v, r, 12, 12, z, 1.4); if (lvl > 0) tank(v, 2, 11, z, 3, 2);
      return flip(r, v);
    },
    (r, lvl) => { // 6 brick cross-plan tower with tiled crown
      const v = new Vox(16, 16, 90), s = sd(r), bp = pick(r, [BRK7[2], BRK7[0], BRK7[1], [0xb89a78, 0xac8e6c, 0xc4a684]]), wall = mixc(bp, 0, s), L = mixc(LIME[1], 0, s);
      const fl = 8 + lvl * 4 + irand(r, 0, 1), roof = pick(r, [TERRA, COPPER, [0x6a5a50, 0x5e4e44]]), trim = C(CREAM);
      const W = { win: { ...win7, lit: 0.42 }, cap: trim };
      v.box(1, 1, 0, 14, 14, 4, L); wins(v, r, 0, 13, 2, 13, 0, 1, 4, { ww: 2, wh: 3, glass: 0x8fa8ac, lit: 0.7 }); wins(v, r, 1, 13, 2, 13, 0, 1, 4, { ww: 2, wh: 3, glass: 0x8fa8ac, lit: 0.7 });
      v.box(0, 0, 4, 15, 15, 5, trim); v.box(1, 1, 4, 14, 14, 5, C(ROOF7));
      onL(v, 13, 7, 8, 0, 3, C(GOLD, WARM));
      const za = mass(v, r, 1, 5, 14, 10, 5, Math.round(fl * 0.55), wall, W);
      const zb = mass(v, r, 5, 1, 10, 14, 5, Math.round(fl * 0.78), wall, W);
      const zc = mass(v, r, 4, 4, 11, 11, 5, fl, wall, { win: win7 });
      v.box(4, 4, zc - 3, 11, 11, zc, L); wins(v, r, 0, 10, 5, 10, zc - 3, 1, 3, { lit: 0.8 }); wins(v, r, 1, 10, 5, 10, zc - 3, 1, 3, { lit: 0.8 });
      v.box(3, 3, zc, 12, 12, zc + 1, trim);
      const top = hip(v, 4, 4, 11, 11, zc + 1, roof, 0);
      v.box(7, 7, top, 8, 8, top + 5, C(0xc8ccd0)); v.set(7, 7, top + 5, C(0xff4a3a, EMIT));
      if (r() < 0.6) tank(v, 1, 6, za, 3, 2); flag(v, 9, 13, zb, 5, pick(r, FLAGS));
      return flip(r, v);
    },
    (r, lvl) => { // 7 flatiron: an acute prow aimed at the street corner, both facades off the grid
      const v = new Vox(16, 16, 70), s = sd(r), Lp = pick(r, [LIME[0], LIME[1], BRK7[2], [0xd8c0a8, 0xccb49c, 0xe2ccb4]]), wallc = mixc(Lp, 0, s);
      const fl = 6 + lvl * 4 + irand(r, 0, 1), H = 4 + fl * 3;
      const yb = (x: number) => 10 + Math.round(((x - 1) * 4) / 13), xb = (y: number) => 10 + Math.round(((y - 1) * 4) / 13);
      const inside = (x: number, y: number, g = 0) => x >= 1 && y >= 1 && x + y >= 11 - g && y < yb(x) + g && x < xb(y) + g;
      const skin: Col = (x, y, z) => {
        const left = y === yb(x) - 1, a = left ? x : y;
        if (z < 4) return a % 2 === 0 && z > 0 && z < 3 ? C(0xa8bcc0, SMOOTH | (hash(a, left ? 1 : 2, s) < 0.8 ? WARM : 0)) : C(GRANITE[(a + z) % 3]);
        const k = z - 4;
        if (k % 3 === 2 || a % 2) return at(wallc, x, y, z);
        return C(W7, SMOOTH | (hash(a, Math.floor(k / 3), s + (left ? 0 : 7)) < 0.42 ? WARM : 0));
      };
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        if (inside(x, y)) { v.box(x, y, 0, x + 1, y + 1, H, skin); v.set(x, y, H, C(inside(x, y, -1) ? ROOF7 : CREAM)); }
        else if (inside(x, y, 1)) { v.set(x, y, 3, C(CREAM)); v.set(x, y, H, C(CREAM)); }
      }
      cyl(v, 13, 13, 1.7, 0, H + 3, (x, y, z) => (z > 3 && z < H && z % 3 !== 0 && (x + y) % 2 === 0 ? C(W7, SMOOTH | WARM) : C(Lp[z % 2])));
      cone(v, 13, 13, 2.1, H + 3, 3, COPPER); v.set(12, 12, H + 6, C(GOLD));
      if (r() < 0.6) tank(v, 5, 5, H + 1, 3, 3); else flag(v, 6, 6, H + 1, 7, pick(r, FLAGS));
      return v;
    },
    (r, lvl) => { // 8 columned bank: temple, domed, or temple front with an office slab
      const v = new Vox(16, 16, 60), s = sd(r), Lp = pick(r, [LIME[0], LIME[2], [0xe6e0d0, 0xdad4c4, 0xeee9da]]), wall = mixc(Lp, 0, s), col = C(0xf2ecdc);
      v.box(1, 1, 0, 14, 15, 1, C(0xbdb5a3)); v.box(3, 15, 0, 12, 16, 1, C(0xbdb5a3));
      v.box(1, 1, 1, 14, 12, 12, wall);
      for (let b = 2; b < 11; b += 2) onR(v, 13, b, b + 1, 3, 10, C(W7, SMOOTH | (r() < 0.5 ? WARM : 0)));
      onL(v, 11, 2, 13, 1, 10, C(0x4a443c)); onL(v, 11, 6, 9, 1, 7, C(0xc8a85a, WARM)); onL(v, 11, 7, 8, 1, 6, C(0x4a3a2a));
      for (let x = 2; x < 14; x += 2) v.box(x, 13, 1, x + 1, 14, 10, col);
      v.box(1, 12, 10, 14, 14, 12, col); v.box(0, 0, 12, 15, 15, 13, C(CREAM));
      if (lvl < 2) {
        for (let k = 0; k < 3; k++) v.box(2 + k * 2, 1, 13 + k, 13 - k * 2, 14, 14 + k, k === 2 ? C(Lp[2]) : wall); // low pediment
        v.set(7, 13, 14, C(GOLD));
        if (lvl === 1) { cyl(v, 7.5, 6, 4, 13, 18, (x, y, z) => ((x + y) % 2 && z > 14 && z < 17 ? C(W7, SMOOTH | WARM) : C(Lp[0]))); cyl(v, 7.5, 6, 4.4, 18, 19, C(CREAM)); const t = dome(v, 7.5, 6, 19, 4, 4, copper); v.box(7, 5, t, 8, 6, t + 2, C(GOLD)); }
        else flag(v, 7, 6, 16, 7, pick(r, FLAGS));
      } else {
        v.box(1, 1, 13, 14, 14, 14, C(ROOF7));
        const z = mass(v, r, 1, 1, 14, 8, 13, 6 + irand(r, 0, 2), wall, { win: win7, span: C(0x7a6e5c), cap: C(CREAM), ov: 1 });
        v.box(3, 2, z, 12, 7, z + 2, wall); v.box(3, 2, z + 2, 12, 7, z + 3, C(CREAM)); flag(v, 7, 4, z + 3, 7, pick(r, FLAGS));
      }
      return flip(r, v);
    },
    (r, lvl) => { // 9 tram depot with vaulted bays (the edge of town)
      const v = new Vox(16, 16, 44), s = sd(r), bp = pick(r, [BRK7[0], BRK7[2], BRK7[1]]), wall = mixc(bp, 0, s), rc = pick(r, [0x5a6a64, 0x6a6a72, 0x7a5a4a]);
      v.box(1, 13, 0, 14, 16, 1, mixc([0x8a857c, 0x7c776e, 0x96918a], 0, s));
      v.box(1, 1, 0, 14, 13, 7, wall);
      wins(v, r, 1, 13, 2, 12, 2, 1, 5, { wh: 3, lit: 0.5, glass: 0x8fa8ac });
      const out = irand(r, 0, 2);
      for (let k = 0; k < 3; k++) {
        const bx = 2 + k * 4;
        onL(v, 12, bx, bx + 3, 0, 5, C(0x24242a)); onL(v, 12, bx + 1, bx + 2, 5, 6, C(0x24242a));
        vault(v, bx - 1, 1, bx + 4, 13, 7, 'y', (x, y) => (x === bx + 1 && y % 3 ? C(0xa8c8c8, SMOOTH | WARM) : C(rc)), 0.9);
        onL(v, 12, bx, bx + 3, 7, 8, wall); onL(v, 12, bx + 1, bx + 2, 8, 9, C(CREAM));
        for (let y = 13; y < 16; y++) { v.set(bx, y, 0, C(0x3a3a40)); v.set(bx + 2, y, 0, C(0x3a3a40)); }
        if (k === out || (lvl > 1 && k === (out + 1) % 3)) { // a tram nosing out
          const tc = pick(r, [0x2f6a4a, 0x9a2f2a, 0x2f4a7a, 0xc89a2a]), y0 = 11 + irand(r, 0, 1);
          v.box(bx, y0, 1, bx + 3, y0 + 4, 2, C(tc)); v.box(bx, y0, 2, bx + 3, y0 + 4, 4, C(0xeee2c8)); v.box(bx, y0, 4, bx + 3, y0 + 4, 5, C(tc));
          onL(v, y0 + 3, bx, bx + 3, 2, 3, C(0x9fb8c0, SMOOTH | WARM)); onR(v, bx + 2, y0, y0 + 4, 2, 3, C(0x9fb8c0, SMOOTH | WARM)); v.set(bx + 1, y0 + 3, 1, C(0xfff2b0, EMIT));
        }
      }
      if (lvl > 0) { // office + clock tower
        const th = 15 + lvl * 4;
        v.box(10, 1, 7, 14, 5, th, wall); wins(v, r, 1, 13, 2, 4, 8, lvl + 1, 3, {}); wins(v, r, 0, 4, 11, 13, 8, lvl + 1, 3, {});
        v.box(9, 0, th, 15, 6, th + 1, C(CREAM)); onL(v, 4, 11, 13, th - 3, th - 1, C(0xf6eed8, WARM)); onR(v, 13, 2, 4, th - 3, th - 1, C(0xf6eed8, WARM));
        hip(v, 10, 1, 14, 5, th + 1, COPPER, 0);
      } else tank(v, 10, 2, 9, 3, 3);
      return flip(r, v);
    },
  ],
  huge: [
    (r, lvl) => { // 0 grand railway terminal
      const v = new Vox(24, 24, 90), s = sd(r), Lp = pick(r, LIME), wall = mixc(Lp, 0, s);
      const glz: Col = (x, y, z) => C(0xa8c4c0, SMOOTH | (hash((x + y) >> 1, z >> 2, s) < 0.6 ? WARM : 0));
      v.box(2, 18, 0, 22, 24, 1, mixc([0xb8b0a0, 0xaca494, 0xc2baaa], 0, s));
      // glass train shed behind
      v.box(2, 1, 0, 22, 8, 6, mixc(BRK7[2], 0, s)); wins(v, r, 1, 21, 2, 7, 1, 1, 5, { wh: 3, lit: 0.6 });
      vault(v, 2, 1, 22, 8, 6, 'x', (x, _y, z) => (x % 4 === 1 ? C(0x4a5a56) : C(0x9fc4c0, SMOOTH | (hash(x, z, s) < 0.4 ? WARM : 0))));
      // head house with three great arches
      v.box(2, 8, 0, 22, 18, 13, wall); v.box(2, 8, 0, 22, 18, 1, mixc(GRANITE, 0, s));
      for (const a of [4, 10, 16]) { onL(v, 17, a, a + 4, 4, 10, glz); onL(v, 17, a + 1, a + 3, 10, 11, glz); onL(v, 17, a + 1, a + 3, 0, 3, C(0x3a2a20)); v.box(a, 18, 3, a + 4, 19, 4, C(0x4a5a56)); }
      onR(v, 21, 11, 15, 4, 10, glz); onR(v, 21, 12, 14, 10, 11, glz);
      v.box(1, 7, 13, 23, 19, 14, C(CREAM)); v.box(3, 9, 14, 21, 17, 16, wall);
      vault(v, 3, 9, 21, 17, 16, 'x', (x) => C(x % 3 === 0 ? COPPER[1] : COPPER[0]), 0.6);
      v.box(10, 17, 14, 14, 19, 18, wall); onL(v, 18, 11, 13, 15, 17, C(0xf6eed8, WARM)); v.box(11, 17, 18, 13, 19, 19, C(GOLD));
      for (const x of [3, 20]) { v.box(x - 1, 15, 14, x + 2, 18, 16, wall); dome(v, x + 0.5, 16.5, 16, 1.8, 2, copper); }
      // clock tower
      const th = 32 + lvl * 8;
      v.box(17, 3, 0, 22, 8, th, wall); wins(v, r, 0, 7, 18, 21, 16, Math.floor((th - 24) / 4), 4, { wh: 2 }); wins(v, r, 1, 21, 4, 7, 16, Math.floor((th - 24) / 4), 4, { wh: 2 });
      v.box(16, 2, th - 7, 23, 9, th - 6, C(CREAM));
      onL(v, 7, 18, 21, th - 5, th - 2, C(0xf6eed8, WARM)); onR(v, 21, 4, 7, th - 5, th - 2, C(0xf6eed8, WARM)); v.set(19, 7, th - 4, C(IRON)); v.set(21, 5, th - 4, C(IRON));
      v.box(16, 2, th, 23, 9, th + 1, C(CREAM)); crown7(v, r, 17, 3, 22, 8, th + 1, 0);
      // forecourt
      carAt(v, r, 5, 20, 0); carAt(v, r, 10, 21, 0); carAt(v, r, 16, 20, 0);
      lampAt(v, 3, 22, 6); lampAt(v, 20, 22, 6); flag(v, 12, 22, 0, 9, pick(r, FLAGS));
      return flip(r, v);
    },
    (r, lvl) => { // 1 domed city hall
      const v = new Vox(24, 24, 80), s = sd(r), Lp = pick(r, [LIME[0], LIME[2], [0xe6e0d0, 0xdad4c4, 0xeee9da]]), wall = mixc(Lp, 0, s), col = C(0xf2ecdc);
      lawn(v, 1, 19, 23, 23); v.box(8, 19, 0, 16, 24, 1, C(0xbdb5a3));
      let z = mass(v, r, 2, 3, 22, 18, 0, 3, wall, { fh: 4, win: { glass: W7, lit: 0.45, wh: 3 }, cap: C(CREAM), ov: 1 });
      v.box(2, 3, 0, 22, 18, 1, mixc(GRANITE, 0, s)); v.box(3, 4, z - 1, 21, 17, z, C(ROOF7));
      // portico
      v.box(8, 18, 0, 16, 21, 2, C(0xbdb5a3)); v.box(8, 21, 0, 16, 22, 1, C(0xbdb5a3));
      onL(v, 17, 8, 16, 2, 11, C(0x4a443c)); onL(v, 17, 11, 13, 2, 7, C(0xc8a85a, WARM));
      for (let x = 8; x < 16; x += 2) v.box(x + (x > 11 ? 1 : 0), 19, 2, x + 1 + (x > 11 ? 1 : 0), 20, 11, col);
      v.box(7, 18, 11, 17, 21, 13, col);
      for (let k = 0; k < 3; k++) v.box(7 + k * 2, 14, 13 + k, 17 - k * 2, 21, 14 + k, k === 2 ? C(Lp[2]) : wall);
      v.set(12, 20, 14, C(GOLD));
      for (const x of [2, 18]) { v.box(x, 13, z, x + 4, 18, z + 3, wall); wins(v, r, 0, 17, x + 1, x + 3, z, 1, 3, {}); v.box(x, 13, z + 3, x + 4, 18, z + 4, C(CREAM)); }
      // drum + copper dome
      const dh = 6 + lvl * 4;
      cyl(v, 12, 10, 6, z, z + 2, C(Lp[1]));
      cyl(v, 12, 10, 5, z + 2, z + 2 + dh, (x, y, zz) => ((x + y) % 2 && zz > z + 2 && zz < z + 1 + dh ? C(W7, SMOOTH | (hash(x, y, s) < 0.6 ? WARM : 0)) : C(Lp[0])));
      cyl(v, 12, 10, 5.6, z + 2 + dh, z + 3 + dh, C(CREAM));
      let t = dome(v, 12, 10, z + 3 + dh, 5.2, 7, copper);
      cyl(v, 12, 10, 1.6, t - 1, t + 3, (x, y, zz) => (zz > t && (x + y) % 2 ? C(0xffe2a0, EMIT) : C(CREAM)));
      t = dome(v, 12, 10, t + 3, 1.8, 2, copper); v.box(11, 9, t, 12, 10, t + 3, C(GOLD));
      flag(v, 3, 5, z, 8, pick(r, FLAGS)); flag(v, 20, 5, z, 8, pick(r, FLAGS));
      tree(v, r, 3, 21, 1, 2); tree(v, r, 20, 21, 1, 2); lampAt(v, 7, 22, 5); lampAt(v, 16, 22, 5);
      return v;
    },
    (r, lvl) => { // 2 deco business centre: slab with stepped shoulders on a shopping podium
      const v = new Vox(24, 24, 120), s = sd(r), Lp = pick(r, LIME), wall = mixc(Lp, 0, s), sp = C(pick(r, [0x7a6e5c, 0x6a6258, 0x5a6a62]));
      const W = { win: { ...win7, lit: 0.45 }, span: sp, cap: C(CREAM) }, fl = 15 + lvl * 4;
      let z = mass(v, r, 1, 1, 22, 22, 0, 2, wall, { fh: 4, win: { glass: 0x9fb4b8, lit: 0.75, ww: 2, wh: 3 }, cap: C(CREAM) });
      v.box(1, 1, 0, 22, 22, 1, mixc(GRANITE, 0, s)); v.box(2, 2, z - 1, 21, 21, z, C(ROOF7));
      onL(v, 21, 10, 13, 0, 6, C(0x3a3030)); onL(v, 21, 11, 12, 0, 5, C(GOLD, WARM)); onR(v, 21, 10, 13, 0, 6, C(0x3a3030)); onR(v, 21, 11, 12, 0, 5, C(GOLD, WARM));
      mass(v, r, 3, 6, 20, 13, z, Math.round(fl * 0.45), wall, W);
      mass(v, r, 5, 4, 18, 15, z, Math.round(fl * 0.62), wall, W);
      mass(v, r, 5, 6, 18, 13, z, Math.round(fl * 0.8), wall, W);
      const zt = mass(v, r, 7, 4, 16, 15, z, fl, wall, W);
      v.box(8, 5, zt, 15, 14, zt + 2, wall); v.box(8, 5, zt + 2, 15, 14, zt + 3, C(CREAM));
      v.box(11, 9, zt + 3, 12, 10, zt + 11, C(0xc8ccd0)); v.set(11, 9, zt + 11, C(0xff4a3a, EMIT));
      onL(v, 14, 9, 14, zt - 2, zt - 1, C(0xffe2a0, EMIT));
      // satellite block + roof garden + plaza statue
      const zs = mass(v, r, 15, 15, 22, 22, z, 5 + lvl * 2, wall, W); crown7(v, r, 16, 16, 21, 21, zs, pick(r, [0, 1]));
      lawn(v, 2, 16, 14, 21, z); tree(v, r, 4, 18, z + 1, 1.8); tree(v, r, 9, 18, z + 1, 1.6); tree(v, r, 12, 19, z + 1, 1.3);
      tank(v, 18, 3, z, 3, 3); flag(v, 2, 2, z, 8, pick(r, FLAGS));
      return flip(r, v);
    },
    (r, lvl) => { // 3 deco power station
      const v = new Vox(24, 24, 90), s = sd(r), bp = pick(r, [BRK7[2], BRK7[1], [0xb89a78, 0xac8e6c, 0xc4a684]]), wall = mixc(bp, 0, s);
      const glow: Col = (x, y, z) => C(0xb8c0a8, SMOOTH | (hash(x + y, z >> 2, s) < 0.75 ? WARM : 0));
      v.box(1, 1, 0, 23, 23, 1, mixc([0x7a766e, 0x6e6a62, 0x86827a], 0, s));
      v.box(4, 2, 0, 20, 10, 26, wall); v.box(3, 1, 26, 21, 11, 27, C(CREAM)); v.box(4, 2, 26, 20, 10, 27, C(ROOF7));
      for (let b = 3; b < 9; b += 2) onR(v, 19, b, b + 1, 17, 24, glow);
      for (let a = 5; a < 19; a += 2) onL(v, 9, a, a + 1, 18, 24, glow);
      v.box(2, 10, 0, 22, 18, 16, wall); v.box(1, 9, 16, 23, 19, 17, C(CREAM)); v.box(2, 10, 16, 22, 18, 17, C(ROOF7));
      for (let a = 3; a < 21; a += 2) onL(v, 17, a, a + 1, 3, 13, a % 6 === 3 ? C(bp[1]) : glow);
      for (let b = 11; b < 17; b += 2) onR(v, 21, b, b + 1, 3, 13, glow);
      v.box(9, 17, 16, 15, 19, 19, wall); v.box(10, 17, 19, 14, 19, 21, wall); v.box(9, 17, 19, 15, 19, 20, C(CREAM)); onL(v, 18, 11, 13, 0, 5, C(0x2e2e34));
      vault(v, 4, 11, 20, 17, 17, 'x', (x) => C(x % 4 === 0 ? 0x8fb0b0 : 0x5a5a62, x % 4 === 0 ? SMOOTH | WARM : 0), 0.5);
      const ch = 46 + lvl * 8;
      for (const [x, y] of lvl > 1 ? [[6, 4], [17, 4], [6, 8], [17, 8]] : [[6, 5], [17, 5]]) {
        v.box(x - 2, y - 2, 26, x + 3, y + 3, 30, wall);
        for (let z = 30; z < ch; z++) cyl(v, x + 0.5, y + 0.5, Math.max(1.5, 2.4 - (z - 30) * 0.02), z, z + 1, z > ch - 3 ? C(0x4a4644) : (X, Y) => C((X + Y) % 2 ? 0xe6dcc6 : 0xd6ccb6));
        v.emit(x, y, ch + 1, 'smoke'); v.emit(x, y, ch + 1, 'smoke');
      }
      // transformer yard
      for (const x of [3, 7, 17]) { v.box(x, 20, 1, x + 3, 22, 3, C(0x6a7278)); v.box(x + 1, 20, 3, x + 2, 21, 5, C(0xb8bcc4)); v.set(x + 1, 20, 5, C(0xd8e8ff, EMIT)); }
      carAt(v, r, 12, 21, 0);
      return flip(r, v);
    },
  ],
  fill: [
    (r) => { const v = new Vox(T, T, 14); lawn(v, 0, 0, T, T); tree(v, r, 2, 2); v.box(5, 6, 0, 7, 7, 2, C(0x5a4a34)); v.box(5, 6, 1, 7, 7, 2, C(0x7a5636)); lampAt(v, 6, 2, 4); return v; },
    (r) => { // period parking lot
      const v = new Vox(T, T, 6);
      for (const y of [1, 5]) for (const x of [0, 4]) if (r() < 0.75) carAt(v, r, x + irand(r, 0, 1), y, 0);
      return v;
    },
    (r) => { // fountain plaza
      const v = new Vox(T, T, 10);
      cyl(v, 4, 4, 3.4, 0, 1, C(0xd2cab8)); cyl(v, 4, 4, 2.4, 0, 1, C(0x4fb3b0, SMOOTH)); v.box(3, 3, 0, 5, 5, 2, C(0xd2cab8)); v.box(3, 3, 2, 5, 5, 3, C(0x4fb3b0, SMOOTH)); v.set(4, 4, 3, C(COPPER[0])); v.set(4, 4, 4, C(0x8fdcd0, SMOOTH));
      void r;
      return v;
    },
    (r) => { const v = new Vox(T, T, 14); lawn(v, 0, 0, T, T); tree(v, r, 4, 3, 0, 2.5); tree(v, r, 1, 5, 0, 1.8, GREEN.slice(1)); return v; },
    (r) => { // newsstand, mailbox, hydrant
      const v = new Vox(T, T, 10), a = pick(r, [0x2f6a52, 0xa8342c, 0x2f4f8a]);
      v.box(1, 1, 0, 5, 4, 4, C(0x4f8a6a)); onL(v, 3, 2, 4, 1, 3, C(0xf0e6cc, WARM)); awning(v, 0, 4, 1, 5, 3, a); v.box(1, 1, 4, 5, 4, 5, C(0x2f5a44));
      v.box(6, 5, 0, 7, 6, 2, C(0x2f4f8a)); v.set(2, 6, 0, C(0xc8342c)); v.set(2, 6, 1, C(0xc8342c)); lampAt(v, 6, 1, 5);
      return v;
    },
    (r) => { // statue in a clipped hedge
      const v = new Vox(T, T, 14);
      lawn(v, 0, 0, T, T); for (let i = 1; i < 7; i++) for (const j of [1, 6]) { v.set(i, j, 1, C(GREEN[1], ROUGH)); v.set(j, i, 1, C(GREEN[1], ROUGH)); }
      v.set(3, 6, 1, 0); v.set(4, 6, 1, 0);
      v.box(3, 3, 0, 5, 5, 3, C(0xd2cab8)); v.box(3, 3, 3, 4, 4, 7, C(COPPER[r() < 0.5 ? 0 : 1])); v.set(4, 3, 5, C(COPPER[1])); v.set(3, 3, 7, C(COPPER[2]));
      return v;
    },
    (r) => { // painted billboard
      const v = new Vox(T, T, 14), a = pick(r, [0xb8342c, 0x2f5f9a, 0x2f7a52, 0xc88a2a]), b = pick(r, [0xf0e6cc, 0xe8d49a]);
      for (const x of [1, 4, 6]) v.box(x, 3, 0, x + 1, 4, 4, C(0x5a4a34));
      v.box(0, 4, 3, 8, 5, 9, C(b)); onL(v, 4, 1, 7, 5, 7, C(a)); onL(v, 4, 1, 3, 4, 8, C(a)); v.box(0, 4, 9, 8, 5, 10, C(0x3a3a40));
      v.set(2, 5, 9, C(0xffe9a8, EMIT)); v.set(5, 5, 9, C(0xffe9a8, EMIT));
      lawn(v, 0, 5, 8, 8, 0, [0x8a8a5a, GREEN[2]]);
      return flip(r, v);
    },
  ],
  sec: [
    (r) => { // 0 observatory / planetarium
      const v = new Vox(16, 16, 40), s = sd(r), Lp = LIME[0], wall = mixc(Lp, 0, s);
      lawn(v, 0, 0, 16, 16); v.box(5, 12, 0, 11, 16, 1, C(0xbdb5a3));
      v.box(2, 2, 0, 14, 13, 6, wall); v.box(2, 2, 0, 14, 13, 1, mixc(GRANITE, 0, s)); v.box(1, 1, 6, 15, 14, 7, C(CREAM));
      wins(v, r, 0, 12, 3, 6, 2, 1, 4, { wh: 3 }); wins(v, r, 0, 12, 10, 13, 2, 1, 4, { wh: 3 }); wins(v, r, 1, 13, 3, 12, 2, 1, 4, { wh: 3 });
      onL(v, 12, 6, 10, 1, 6, C(0x4a443c)); onL(v, 12, 7, 9, 1, 5, C(0xc8a85a, WARM)); v.box(6, 13, 1, 7, 14, 6, C(0xf2ecdc)); v.box(9, 13, 1, 10, 14, 6, C(0xf2ecdc));
      cyl(v, 8, 7.5, 5, 7, 10, (x, y) => C(Lp[(x + y) % 2]));
      dome(v, 8, 7.5, 10, 5, 6, (x, y, z) => (x === 10 && y > 7 ? C(0x1e2a36) : C(COPPER[(z + (x >> 1)) % 2])));
      dome(v, 3.5, 3.5, 7, 1.6, 2, copper); dome(v, 12.5, 3.5, 7, 1.6, 2, copper);
      tree(v, r, 1, 14, 1, 1.6); tree(v, r, 13, 14, 1, 1.6);
      return v;
    },
    (r) => { // 1 radio station with lattice mast
      const v = new Vox(16, 16, 76), s = sd(r);
      v.box(7, 8, 0, 15, 15, 7, mixc(LIME[2], 0, s)); cyl(v, 14, 14, 2.5, 0, 7, (_x, _y, z) => (z % 3 === 1 ? C(0x9fc0c8, SMOOTH | WARM) : C(LIME[2][0])));
      wins(v, r, 0, 14, 8, 12, 1, 2, 3, { ww: 2, lit: 0.7 }); wins(v, r, 1, 14, 9, 12, 1, 2, 3, { lit: 0.7 });
      v.box(6, 7, 7, 16, 16, 8, C(CREAM)); v.box(7, 8, 7, 14, 14, 8, C(ROOF7));
      roofSign(v, r, 0, 14, 8, 13, 8, pick(r, SIGN7));
      for (let z = 0; z < 50; z++) {
        const w = Math.max(1, Math.round(5 - z / 11)), x0 = 4 - (w >> 1), y0 = 4 - (w >> 1), c = C(z % 10 < 5 ? 0xc8423a : 0xe8e4dc);
        for (const [x, y] of [[x0, y0], [x0 + w, y0], [x0, y0 + w], [x0 + w, y0 + w]]) v.set(x, y, z, c);
        if (z % 5 === 0) { v.box(x0, y0 + w, z, x0 + w + 1, y0 + w + 1, z + 1, c); v.box(x0 + w, y0, z, x0 + w + 1, y0 + w + 1, z + 1, c); }
        else if (w > 1) { v.set(x0 + 1 + ((z >> 0) % w), y0 + w, z, C(0x8a8a90)); v.set(x0 + w, y0 + ((z >> 0) % w), z, C(0x8a8a90)); }
      }
      for (let z = 50; z < 58; z++) v.set(4, 4, z, C(0xc8ccd0));
      v.set(4, 4, 58, C(0xff3b3b, EMIT)); v.set(5, 5, 30, C(0xff3b3b, EMIT));
      carAt(v, r, 1, 12, 0);
      return v;
    },
    (r) => { // 2 fairground big wheel
      const v = new Vox(16, 16, 40), s = sd(r), R0 = 7.3, cz = 11;
      v.box(0, 0, 0, 16, 16, 1, mixc([0xc9b890, 0xbdac84, 0xd3c29c], ROUGH, s));
      for (let t = 0; t <= cz; t++) for (const y of [6, 10]) { v.set(7.5 - (cz - t) * 0.4, y, t, C(0x9a2f2a)); v.set(8.5 + (cz - t) * 0.4, y, t, C(0x9a2f2a)); }
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.26; for (let t = 1; t < R0; t += 0.5) v.set(8 + Math.cos(a) * t, 8, cz + Math.sin(a) * t, C(0xa8acb4)); }
      for (let i = 0; i < 96; i++) { const a = (i / 96) * Math.PI * 2; v.set(8 + Math.cos(a) * R0, 8, cz + Math.sin(a) * R0, i % 12 === 6 ? C(0xffe2a0, EMIT) : C(0xf0ece4)); }
      for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 + 0.1, gx = Math.floor(8 + Math.cos(a) * R0), gz = Math.floor(cz + Math.sin(a) * R0); v.box(gx, 9, gz - 1, gx + 1, 10, gz + 1, C([0xc8342c, 0x2f6fb0, 0xe0b030, 0x2f8a5a, 0xe87a30][k % 5])); }
      v.box(7, 6, cz, 9, 11, cz + 1, C(0xe0b030));
      cyl(v, 3, 13, 2, 1, 4, (x, y) => C((x + y) % 2 ? 0xc8342c : 0xf2ead8)); cone(v, 3, 13, 2.6, 4, 3, [0xc8342c, 0xf2ead8]); v.set(3, 13, 7, C(0xffe2a0, EMIT));
      v.box(12, 12, 1, 15, 14, 4, C(0x3f7a5c)); awning(v, 0, 14, 12, 15, 3, 0xe0b030);
      return flip(r, v);
    },
    (r) => { // 3 moored airship
      const v = new Vox(16, 16, 60), s = sd(r), st = pick(r, [0xc8342c, 0x2f5f9a, 0xe0b030]);
      lawn(v, 0, 0, 16, 16, 0, [GREEN[2], GREEN[3], 0x9aa85a]);
      for (let z = 0; z < 31; z++) { const w = z < 8 ? 1 : 0; for (const [x, y] of [[13, 7], [13 + w, 7 + w], [13, 7 + w], [13 + w, 7]]) v.set(x, y, z, C(z % 6 < 3 ? 0xc8423a : 0xe8e4dc)); }
      v.box(1, 11, 1, 6, 15, 4, mixc(LIME[1], 0, s)); vault(v, 1, 11, 6, 15, 4, 'x', C(0x6a6a72), 0.6); onL(v, 14, 2, 5, 1, 3, C(0x2e2e34));
      const cz = 31;
      for (let x = 0; x < 13; x++) for (let y = 3; y < 13; y++) for (let z = cz - 5; z <= cz + 5; z++) {
        const dx = (x + 0.5 - 6.5) / 6.7, dy = (y + 0.5 - 8) / 3.9, dz = (z + 0.5 - cz) / 3.9;
        if (dx * dx + dy * dy + dz * dz <= 1) v.set(x, y, z, C(z === cz ? st : (x + (z >> 1)) % 4 === 0 ? 0xc4c8d0 : 0xd8dce4, SMOOTH));
      }
      v.box(5, 7, cz - 5, 9, 9, cz - 3, C(0x8a8e96)); onL(v, 8, 5, 9, cz - 5, cz - 4, C(0x9fc0c8, SMOOTH | WARM));
      v.box(0, 7, cz + 2, 2, 9, cz + 6, C(st)); v.box(0, 5, cz - 1, 2, 11, cz + 1, C(st));
      v.set(12, 8, cz - 1, C(0xff3b3b, EMIT));
      return v;
    },
  ],
  hero: (r) => { // art-deco skyscraper: cross-shouldered setbacks, glowing copper crown
    const v = new Vox(24, 24, 150), s = sd(r), Lp = LIME[0], wall = mixc(Lp, 0, s);
    const W = { win: { ...win7, lit: 0.5 }, span: C(0x7a6e5c), cap: C(CREAM) };
    let z = mass(v, r, 1, 1, 22, 22, 0, 3, wall, { win: { glass: 0x9fb4b8, lit: 0.7, ww: 1 }, span: C(0x5a5650), cap: C(CREAM) });
    v.box(1, 1, 0, 22, 22, 1, mixc(GRANITE, 0, s)); v.box(2, 2, z - 1, 21, 21, z, C(ROOF7));
    for (const f of [0, 1] as F[]) { on(v, f, 21, 8, 15, 0, 8, C(0x3a3030)); on(v, f, 21, 9, 14, 0, 7, C(0xc8a85a, WARM)); on(v, f, 21, 11, 12, 0, 7, C(0x3a3030)); on(v, f, 22, 8, 15, 8, 9, C(GOLD)); }
    const sq = (a: number, fl: number) => { z = mass(v, r, a, a, 23 - a, 23 - a, z, fl, wall, W); for (const [x, y] of [[22 - a, 22 - a], [a, 22 - a], [22 - a, a]]) v.box(x, y, z, x + 1, y + 1, z + 2, C(GOLD)); };
    const cross = (a: number, fl: number) => { mass(v, r, a + 2, a, 21 - a, 23 - a, z, fl, wall, W); z = mass(v, r, a, a + 2, 23 - a, 21 - a, z, fl, wall, W); };
    sq(3, 6); cross(3, 4); sq(5, 5); cross(5, 3); sq(7, 5);
    z = mass(v, r, 9, 9, 14, 14, z, 3, wall, { win: { ...win7, lit: 0.9 }, span: C(0xe8d8a8, WARM), cap: C(CREAM) });
    v.box(9, 9, z, 14, 14, z + 2, C(COPPER[0])); v.box(10, 10, z + 2, 13, 13, z + 5, C(COPPER[1]));
    onL(v, 12, 10, 13, z + 3, z + 4, C(0xffe2a0, EMIT)); onR(v, 12, 10, 13, z + 3, z + 4, C(0xffe2a0, EMIT));
    v.box(10, 10, z + 5, 13, 13, z + 6, C(COPPER[2])); v.box(11, 11, z + 6, 12, 12, z + 16, C(0xc8ccd0)); v.set(11, 11, z + 16, C(0xff4a3a, EMIT));
    return v;
  },
  road: (r, d) => roadTile(r, d, [0x4c4a50, 0x46444a, 0x525056], { curb: [0xc4bba8, 0xb8af9c], dash: 0xd8d2b0 }),
  pave: (r) => ground(r, [0xc4bba8, 0xb8af9c, 0xcdc4b2], 0, { c: [0xa69e8c], p: 0.08 }),
  bridge: (r, d) => bridgeTile(r, d, [0x4c4a50, 0x46444a], 0x4f6f66, 0, 0xffe9a8),
};

// ================================ EPOCH 8 ======================================
// Palette identity: bright daylight - coloured curtain-wall glass, white modernism, raw concrete, postmodern candy accents.
const GL = [ // [deep, mid, pale]: blue, teal, bronze, green, navy, silver
  [0x3f78ad, 0x5a96c8, 0x9ccbea], [0x2f8f8f, 0x4fb0ac, 0x9adcd4], [0x4e4238, 0x685848, 0xc8a070],
  [0x3f8a66, 0x5aa880, 0xa0d8b4], [0x2c4a78, 0x44689c, 0x86a8d4], [0x74869a, 0x94a6ba, 0xccd8e4],
];
const WHITE = 0xf2f1ec, FRAME = 0xe4e8ec, ROOF8 = 0xa4a8ae, PLAZA = [0xd6d8da, 0xcacccf, 0xdfe1e3];
const ACC = [0xe0503c, 0xf0b428, 0x2f8fd0, 0x38a868, 0xe87a30, 0x18a0a0, 0xd04a8a];
const CONC = [[0xb8b3a8, 0xaca79c, 0xc4bfb4], [0xa09c96, 0x94908a, 0xaca8a2], [0xc4b8a4, 0xb8ac98, 0xd0c4b0]];
const POMO = [[0xd89a88, 0xcc8e7c, 0xe2a694], [0xe8d8b0, 0xdccca4, 0xf0e2be], [0x8ab8c0, 0x7eacb4, 0x96c4cc], [0xb8a0c8, 0xac94bc, 0xc4acd4], [0xc87a5a, 0xbc6e50, 0xd28666]];
const shade = (hex: number, f: number) =>
  (Math.min(255, Math.round(((hex >> 16) & 255) * f)) << 16) | (Math.min(255, Math.round(((hex >> 8) & 255) * f)) << 8) | Math.min(255, Math.round((hex & 255) * f));
const mixLight = (r: R) => (r() < 0.3 ? COOL : WARM);

interface GO { pal: number[]; fh?: number; bay?: number; mull?: number; span?: number; lit?: number; cool?: number; diag?: number; dcol?: number }
/** Curtain-wall pattern as a 3D colour function; `coord` maps a voxel to its position along the facade. */
function glassFn(s: number, o: GO, coord: (x: number, y: number) => number, z0: number, z1: number): Col {
  const fh = o.fh ?? 3, bay = o.bay ?? 3, lit = o.lit ?? 0.32, cool = o.cool ?? 0.35, p = o.diag ?? 0;
  return (x, y, z) => {
    const a = coord(x, y), k = z - z0;
    if (p && ((a + k) % p === 0 || (((a - k) % p) + p) % p === 0)) return C(o.dcol ?? 0xf0f2f4, SMOOTH);
    if (o.span != null && k % fh === fh - 1) return C(o.span, SMOOTH);
    if (o.mull != null && a % bay === bay - 1) return C(o.mull, SMOOTH);
    const ca = Math.floor(a / bay), cf = Math.floor(k / fh), h = hash(ca, cf, s);
    if (h < lit) return C(o.pal[hash(ca, cf, s + 3) < 0.45 ? 2 : 1], SMOOTH | (hash(ca, cf, s + 1) < cool ? COOL : WARM));
    const t = k / Math.max(1, z1 - z0) + (hash(ca, cf, s + 2) - 0.5) * 0.45;
    return C(o.pal[t > 0.55 ? 1 : 0], SMOOTH);
  };
}
const boxCo = (x1: number, y1: number) => (x: number, y: number) => (x1 - 1 - x > 0 ? x1 - 1 - x : 1200 + (y1 - 1 - y));
function gbox(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, o: GO): number {
  v.box(x0, y0, z0, x1, y1, z1, glassFn(sd(r), o, boxCo(x1, y1), z0, z1));
  return z1;
}
/** A random curtain-wall style for a glass colour. */
function curtain(r: R, pal: number[], lit = 0.32): GO {
  const k = irand(r, 0, 4);
  if (k === 0) return { pal, lit, mull: FRAME, span: FRAME, bay: 3 }; // white grid
  if (k === 1) return { pal, lit, span: 0xeceeee, bay: 2 }; // ribbon bands
  if (k === 2) return { pal, lit, mull: shade(pal[0], 0.7), bay: 2 }; // vertical fins
  if (k === 3) return { pal, lit, span: shade(pal[0], 0.82), bay: 2 }; // sheer glass
  return { pal, lit, mull: 0x343a42, span: 0x343a42, bay: 3 }; // dark steel frame
}
/** Residential face: glazing behind coloured balcony fronts split by white fins. (a1 - a0) % 3 must be 1. */
function balconies(v: Vox, s: number, f: F, p: number, a0: number, a1: number, z0: number, floors: number, colOf: (bay: number, fl: number) => number, fin = WHITE): void {
  for (let k = 0; k < floors; k++) {
    const z = z0 + k * 3;
    for (let a = a0; a < a1; a++) {
      const bay = Math.floor((a - a0) / 3);
      if ((a - a0) % 3 === 0) { on(v, f, p + 1, a, a + 1, z, z + 3, C(fin)); continue; }
      const h = hash(bay, k, s + f);
      on(v, f, p, a, a + 1, z + 1, z + 3, C(0x3f5a78, SMOOTH | (h < 0.4 ? (h < 0.08 ? COOL : WARM) : 0)));
      on(v, f, p + 1, a, a + 1, z, z + 1, C(colOf(bay, k)));
    }
  }
}
const scheme = (r: R): ((bay: number, fl: number) => number) => {
  const k = irand(r, 0, 3), a = pick(r, ACC), b = pick(r, ACC);
  return k === 0 ? () => a : k === 1 ? (bay, fl) => ((bay + fl) & 1 ? a : b) : k === 2 ? (bay) => ACC[(bay * 2 + 1) % ACC.length] : (_bay, fl) => (fl % 3 === 0 ? a : 0xdfe3e8);
};
function helipad(v: Vox, cx: number, cy: number, z: number, rad = 3.5): void {
  cyl(v, cx, cy, rad, z, z + 1, C(0x5a5e66)); cyl(v, cx, cy, rad - 1, z, z + 1, C(0x6a6e76));
  for (const d of [-1, 0, 1]) { v.set(cx - 1.5, cy - 0.5 + d, z, C(0xf4f4f0)); v.set(cx + 0.5, cy - 0.5 + d, z, C(0xf4f4f0)); }
  v.set(cx - 0.5, cy - 0.5, z, C(0xf4f4f0));
  v.set(cx + rad - 0.5, cy - 0.5, z, C(0xffd24a, EMIT));
}
/** Roof finishes for the modern towers. */
function crown8(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z: number, kind: number, pal: number[]): void {
  const cx = (x0 + x1) >> 1, cy = (y0 + y1) >> 1, w = Math.min(x1 - x0, y1 - y0);
  v.box(x0, y0, z, x1, y1, z + 1, C(FRAME)); v.box(x0 + 1, y0 + 1, z, x1 - 1, y1 - 1, z + 1, C(ROOF8)); z++;
  if (kind === 0) { // mechanical penthouse + mast
    v.box(x0 + 2, y0 + 2, z, x1 - 2, y1 - 2, z + 2, (x, y) => C((x + y) % 2 ? 0xb4b8be : 0x9ca0a6));
    v.box(cx, cy, z + 2, cx + 1, cy + 1, z + 8, C(0xc8ccd4)); v.set(cx, cy, z + 8, C(0xff3b3b, EMIT));
  } else if (kind === 1 && w >= 7) helipad(v, (x0 + x1) / 2, (y0 + y1) / 2, z - 1, Math.min(3.5, w / 2 - 0.5));
  else if (kind === 2 && w >= 6) { // roof garden
    lawn(v, x0 + 1, y0 + 1, x1 - 1, y1 - 1, z - 1); tree(v, r, x0 + 2, y0 + 2, z, 1.5); if (w > 7) tree(v, r, x1 - 3, y1 - 4, z, 1.3);
    v.box(x0 + 1, y1 - 3, z, x0 + 3, y1 - 1, z + 2, C(FRAME));
  } else if (kind === 3) { // sloped glass wedge
    for (let k = 0; x1 - 2 * k > x0; k++) v.box(x0, y0, z - 1 + k, x1 - 2 * k, y1, z + k, C(k % 2 ? pal[1] : pal[2], SMOOTH));
  } else if (kind === 5) { // twin blades
    v.box(x0, y0, z, x1, y0 + 1, z + 6, C(FRAME)); v.box(x0, y0, z, x0 + 1, y1, z + 4, C(FRAME)); v.set(x1 - 1, y0, z + 6, C(0xff3b3b, EMIT));
  } else { // cooling units + dish
    for (let i = 0; i < 2; i++) { const x = x0 + 1 + i * 3, y = y0 + 1; if (x + 2 < x1) v.box(x, y, z, x + 2, y + 2, z + 1 + i, C(0xb4b8be)); }
    v.box(x1 - 3, y1 - 3, z, x1 - 2, y1 - 2, z + 2, C(0x8a8e96)); v.set(x1 - 3, y1 - 3, z + 2, C(0xe8ecf0));
  }
}

const e8: Cat = {
  // suburbs -> townhouses & flats -> shops & drive-ins -> small offices
  small: [
    (r, lvl) => { // 0 suburban house with pool or driveway
      const v = new Vox(T, T, 18);
      lawn(v, 0, 0, 8, 8);
      const rf = pick(r, [[0x8a5a48, 0x7c5040], [0x6a7078, 0x5e646c], [0xb8684a, 0xa85c40], [0x4a5a6a, 0x3e4e5e]]);
      house(r, { n: 1, w: 7, d: 4, floors: lvl > 1 ? 2 : 1, fh: 3, wall: C(pick(r, [0xf0ece0, 0xe8d8b8, 0xd8e0e4, 0xe0c8b0, 0xcad6c2, 0xf0dca0])), roof: rf, roofType: r() < 0.5 ? 'hip' : 'gable', along: 'x', win: { glass: 0x7ab0d0, lit: 0.5, ww: 1, gap: 2 }, door: pick(r, ACC) }, { v, x0: 0, y0: 0 });
      if (r() < 0.65) { v.box(1, 4, 0, 7, 8, 1, C(0xe8e4dc)); v.box(2, 5, 0, 6, 7, 1, C(0x3fc8d8, SMOOTH)); v.set(6, 7, 1, C(pick(r, ACC))); v.set(1, 7, 1, C(0xf4f4f0)); }
      else { v.box(4, 4, 0, 7, 8, 1, C(0xb8bcc0)); carAt(v, r, 5, 5, 1, true, 1); tree(v, r, 1, 6, 1, 1.7); }
      v.set(0, 4, 1, C(GREEN[1], ROUGH)); v.set(7, 4, 1, C(GREEN[1], ROUGH));
      return flip(r, v);
    },
    (r, lvl) => { // 1 flat-roofed modern villa
      const v = new Vox(T, T, 20), ac = pick(r, [0x9a6a42, 0x4a4e56, 0xc8644a, 0x7a8a6a, 0x2f6f90]);
      const gl = (l: boolean) => C(0x7ab0d0, SMOOTH | (l ? WARM : 0));
      lawn(v, 0, 0, 8, 8);
      v.box(0, 0, 0, 6, 5, 3, C(WHITE)); onL(v, 4, 1, 5, 0, 2, gl(true)); onR(v, 5, 1, 4, 1, 2, gl(false));
      v.box(0, 0, 3, 7, 6, 4, C(0xe6e5e0));
      v.box(2, 0, 4, 8, 4, 7, C(ac)); onL(v, 3, 3, 7, 5, 6, gl(r() < 0.6)); onR(v, 7, 1, 3, 5, 6, gl(r() < 0.4));
      v.box(2, 0, 7, 8, 4, 8, C(WHITE));
      if (lvl > 1) { v.box(3, 0, 8, 6, 3, 10, C(WHITE)); onL(v, 2, 4, 5, 8, 10, gl(true)); v.box(3, 0, 10, 7, 4, 11, C(0xe6e5e0)); }
      v.set(0, 5, 4, C(GREEN[2], ROUGH)); v.set(1, 5, 4, C(GREEN[3], ROUGH)); v.set(0, 4, 4, C(GREEN[1], ROUGH));
      if (lvl > 0) { v.box(0, 5, 0, 5, 8, 1, C(0xe8e4dc)); v.box(1, 6, 0, 4, 8, 1, C(0x3fc8d8, SMOOTH)); } else tree(v, r, 1, 6, 1, 1.6);
      carAt(v, r, 6, 5, 1, true, 1);
      return flip(r, v);
    },
    (r, lvl) => { // 2 candy-coloured townhouse row
      const v = new Vox(T, T, 28), pal = [0xe8c8a0, 0xd88a6a, 0xa8c8d8, 0xf0e4c0, 0xc8d8b0, 0xe0a0a0, 0xb8683f, 0xf2f1ec, 0x8ab0b8, 0xe8d070];
      let x0 = 0;
      for (const w of r() < 0.5 ? [3, 2, 3] : [2, 3, 3]) {
        const fl = 2 + (lvl > 0 ? 1 : 0) + (lvl > 1 ? 1 : 0) + (r() < 0.3 ? 1 : 0), H = fl * 3, c = pick(r, pal), wx = x0 + (w === 3 ? 1 : 0);
        v.box(x0, 0, 0, x0 + w, 6, H, C(c));
        onL(v, 5, wx, wx + 1, 0, 2, C(pick(r, ACC)));
        for (let k = 1; k < fl; k++) onL(v, 5, wx, wx + 1 + (w === 3 && r() < 0.5 ? 1 : 0), k * 3, k * 3 + 2, C(0x4a6a8a, SMOOTH | (r() < 0.5 ? WARM : 0)));
        wins(v, r, 1, x0 + w - 1, 1, 5, 1, fl, 3, { wh: 2, glass: 0x4a6a8a, lit: 0.4, sill: 0 });
        if (r() < 0.5) { v.box(x0, 0, H, x0 + w, 6, H + 1, C(0xe4e6e8)); v.box(x0, 0, H, x0 + w, 5, H + 1, C(ROOF8)); }
        else for (let k = 0; k < 2; k++) v.box(x0, 0, H + k, x0 + w, 6 - k * 3, H + k + 1, C(k ? 0x6a7078 : 0x7a8088)); // mono-pitch
        v.set(x0 + w - 1, 6, 0, C(GREEN[2], ROUGH));
        x0 += w;
      }
      return flip(r, v);
    },
    (r, lvl) => { // 3 white apartment block with coloured balconies
      const v = new Vox(T, T, 32), fl = 3 + lvl + irand(r, 0, 1), s = sd(r), wc = pick(r, [WHITE, 0xe8e2d4, 0xdde2e6]), z = 3 + fl * 3;
      v.box(0, 0, 0, 7, 6, 3, C(0x4a525a)); for (const x of [0, 3, 6]) v.box(x, 5, 0, x + 1, 6, 3, C(wc)); onL(v, 5, 1, 3, 0, 2, C(0x9fd0e8, SMOOTH | WARM));
      v.box(0, 0, 3, 7, 6, z, C(wc));
      balconies(v, s, 0, 5, 0, 7, 3, fl, scheme(r), wc);
      wins(v, r, 1, 6, 1, 5, 3, fl, 3, { glass: 0x3f5a78, lit: 0.4 });
      v.box(0, 0, z, 7, 7, z + 1, C(FRAME)); v.box(0, 0, z, 6, 6, z + 1, C(ROOF8));
      v.box(1, 1, z + 1, 3, 3, z + 3, C(wc)); if (r() < 0.5) v.box(4, 1, z + 1, 6, 4, z + 2, C(0x2c4a78, SMOOTH));
      return flip(r, v);
    },
    (r, lvl) => { // 4 convenience store, flats above at higher levels
      const v = new Vox(T, T, 24), c = pick(r, ACC), gl = C(0x9fd0e8, SMOOTH | WARM);
      v.box(0, 0, 0, 7, 5, 4, C(WHITE)); onL(v, 4, 1, 6, 0, 3, gl); onL(v, 4, 3, 4, 0, 3, C(FRAME)); onR(v, 6, 1, 4, 1, 3, gl);
      onL(v, 4, 0, 7, 3, 4, C(c)); onR(v, 6, 0, 5, 3, 4, C(c)); onL(v, 5, 2, 5, 3, 4, C(0xfff4d0, EMIT));
      let z = 4;
      if (lvl > 0) z = mass(v, r, 0, 0, 7, 5, 4, lvl, C(pick(r, [WHITE, 0xe8dcc8, 0xd8c8b8, 0xc8d4dc])), { win: { glass: 0x4a6a8a, lit: 0.5 } });
      v.box(0, 0, z, 7, 5, z + 1, C(FRAME)); v.box(0, 0, z, 6, 4, z + 1, C(ROOF8)); v.box(1, 1, z + 1, 3, 3, z + 2, C(0xb4b8be));
      if (r() < 0.7) carAt(v, r, irand(r, 0, 4), 6, 0, true);
      return flip(r, v);
    },
    (r, lvl) => { // 5 drive-in restaurant with pole sign
      const v = new Vox(T, T, 22), c = pick(r, [0xd03a30, 0xe87a30, 0x2f8fd0, 0x38a868]), c2 = pick(r, [0xf0b428, 0xf2f1ec]), gl = C(0x9fd0e8, SMOOTH | WARM);
      v.box(1, 0, 0, 7, 5, 3, C(0xf0e8d8)); v.box(1, 0, 0, 7, 5, 1, C(c)); onL(v, 4, 2, 6, 1, 3, gl); onR(v, 6, 1, 4, 1, 3, gl);
      hip(v, 1, 0, 7, 5, 3, [c, shade(c, 0.88)], 1, 2); v.box(2, 1, 5, 6, 4, 6, C(0xd8d4cc)); v.box(3, 2, 6, 5, 3, 7, C(0xb4b8be));
      const H = 8 + lvl * 2;
      v.box(0, 7, 0, 1, 8, H, C(0xb8bcc4)); v.box(0, 5, H, 1, 8, H + 3, C(c2, EMIT)); v.set(0, 6, H + 1, C(c)); v.set(0, 6, H + 2, C(c));
      carAt(v, r, 3, 6, 0, true);
      return flip(r, v);
    },
    (r, lvl) => { // 6 small glass office
      const v = new Vox(T, T, 44), pal = pick(r, GL), fl = 3 + lvl * 2 + irand(r, 0, 1), ac = pick(r, ACC);
      v.box(0, 0, 0, 7, 7, 3, C(0x3a424c)); onL(v, 6, 1, 6, 0, 2, C(pal[2], SMOOTH | WARM)); onR(v, 6, 1, 6, 0, 2, C(pal[2], SMOOTH | WARM));
      for (const [x, y] of [[6, 6], [0, 6], [6, 0], [3, 6], [6, 3]]) v.box(x, y, 0, x + 1, y + 1, 3, C(WHITE));
      v.box(0, 0, 3, 7, 7, 4, C(r() < 0.5 ? ac : FRAME));
      const z = gbox(v, r, 0, 0, 7, 7, 4, 4 + fl * 3, curtain(r, pal, 0.4));
      crown8(v, r, 0, 0, 7, 7, z, pick(r, [0, 4, 3, 5]), pal);
      return flip(r, v);
    },
  ],
  // housing slab -> school -> hospital -> mall -> parking -> brutalist civic -> postmodern -> glass core
  large: [
    (r, lvl) => { // 0 white residential slab with coloured balconies on pilotis
      const v = new Vox(16, 16, 80), s = sd(r), fl = 7 + lvl * 5 + irand(r, 0, 2), wc = pick(r, [WHITE, 0xe8e4d8, 0xdfe3e8]), a = pick(r, ACC), z = 3 + fl * 3;
      lawn(v, 0, 10, 16, 16); v.box(6, 10, 0, 8, 16, 1, C(PLAZA[0]));
      v.box(1, 3, 0, 14, 10, 3, C(0x46505a)); onL(v, 9, 5, 9, 0, 2, C(0x9fd0e8, SMOOTH | WARM));
      for (let x = 1; x < 14; x += 3) v.box(x, 9, 0, x + 1, 10, 3, C(wc));
      v.box(1, 3, 3, 14, 10, z, C(wc));
      balconies(v, s, 0, 9, 1, 14, 3, fl, scheme(r), wc);
      onR(v, 13, 6, 7, 3, z, (_x, _y, zz) => C(0x3f5a78, SMOOTH | (hash(zz, s) < 0.3 && zz % 3 ? WARM : 0)));
      onR(v, 13, 4, 5, 3, z, C(a)); // supergraphic stripe on the gable end
      v.box(1, 3, z, 14, 11, z + 1, C(FRAME)); v.box(2, 4, z, 13, 9, z + 1, C(ROOF8));
      v.box(2, 4, z + 1, 5, 7, z + 3, C(wc)); v.box(9, 4, z + 1, 12, 7, z + 3, C(wc)); cyl(v, 7, 6, 1.5, z + 1, z + 3, C(0xdfe3e8));
      tree(v, r, 2, 12, 1, 2); tree(v, r, 11, 13, 1, 1.7); carAt(v, r, 12, 11, 0, true, 1);
      return flip(r, v);
    },
    (r, lvl) => { // 1 school with sports court
      const v = new Vox(16, 16, 30), s = sd(r), wc = pick(r, [[0xd8946a, 0xcc885e], [0xf0e6c8, 0xe6dcbe], [0xe8d488, 0xdeca7e], [0xdfe3e8, 0xd3d7dc]]), ac = pick(r, ACC), fl = 2 + (lvl > 1 ? 1 : 0);
      v.box(0, 0, 0, 16, 16, 1, mixc([0x9a9ea0, 0x929698, 0xa2a6a8], 0, s));
      const W = { win: { glass: 0x7ab0d0, lit: 0.3, ww: 2, wh: 2, sill: 1 }, cap: C(FRAME) };
      let z = 0;
      for (const [x0, y0, x1, y1] of [[0, 0, 15, 5], [0, 5, 5, 13]]) {
        z = mass(v, r, x0, y0, x1, y1, 1, fl, mixc(wc, 0, s), W);
        for (let k = 0; k < fl; k++) { onL(v, y1 - 1, x0 + 1, x1 - 1, 1 + k * 3, 2 + k * 3, C(ac)); onR(v, x1 - 1, y0 + 1, y1 - 1, 1 + k * 3, 2 + k * 3, C(ac)); }
        v.box(x0 + 1, y0 + (y0 ? -1 : 1), z - 1, x1 - 1, y1 - 1, z, C(ROOF8));
      }
      v.box(5, 5, 4, 8, 7, 5, C(ac)); onL(v, 4, 6, 7, 1, 3, C(0x9fd0e8, SMOOTH | WARM)); // entrance canopy
      if (lvl > 0) { v.box(10, 0, 1, 15, 5, 8, mixc(wc, 0, s)); vault(v, 10, 0, 15, 5, 8, 'y', C(FRAME), 0.7); onR(v, 14, 1, 4, 5, 7, C(0x7ab0d0, SMOOTH | WARM)); } // gym
      const court = pick(r, [[0x3f8a66, 0x4a9a74], [0x3f78ad, 0x4a86bc], [0xc8644a, 0xd47050]]);
      v.box(7, 8, 1, 15, 15, 2, (x, y) => (x === 7 || x === 14 || y === 8 || y === 14 || x === 11 ? C(0xf4f4f0) : C(court[(x + y) & 1])));
      v.box(7, 11, 2, 8, 12, 5, C(0xb8bcc4)); v.box(14, 11, 2, 15, 12, 5, C(0xb8bcc4)); v.set(8, 11, 4, C(0xe87a30)); v.set(13, 11, 4, C(0xe87a30));
      flag(v, 6, 9, 1, 8, pick(r, ACC)); tree(v, r, 1, 14, 1, 1.7);
      v.box(2, 15, 1, 6, 16, 3, C(0xf0b428)); onL(v, 15, 3, 5, 2, 3, C(0x4a6a8a, SMOOTH)); // school bus
      v.box(3, 1, z, 6, 4, z + 1, C(0xb4b8be));
      return flip(r, v);
    },
    (r, lvl) => { // 2 hospital: ward slab on a podium, helipad, ambulance bay
      const v = new Vox(16, 16, 70), s = sd(r), pal = pick(r, [GL[1], GL[0], GL[3]]), band = pick(r, [0x18a0a0, 0x2f8fd0, 0x38a868]), fl = 5 + lvl * 3 + irand(r, 0, 1);
      let z = gbox(v, r, 1, 1, 15, 15, 0, 6, { pal, lit: 0.5, span: WHITE, bay: 2, cool: 0.6 });
      v.box(1, 1, z, 15, 15, z + 1, C(WHITE)); v.box(2, 2, z, 14, 14, z + 1, C(ROOF8)); z++;
      onL(v, 14, 5, 10, 0, 3, C(0x9fd0e8, SMOOTH | COOL)); v.box(4, 15, 3, 11, 16, 4, C(0xd03a30)); // entrance canopy
      const zt = gbox(v, r, 1, 1, 15, 8, z, z + fl * 3, { pal, lit: 0.34, span: WHITE, bay: 2, cool: 0.6 });
      onL(v, 7, 1, 15, zt - 1, zt, C(band)); onR(v, 14, 1, 8, zt - 1, zt, C(band)); onL(v, 7, 1, 15, z, z + 1, C(band)); onR(v, 14, 1, 8, z, z + 1, C(band));
      v.box(1, 1, zt, 15, 8, zt + 1, C(WHITE)); v.box(2, 2, zt, 14, 7, zt + 1, C(ROOF8));
      v.box(10, 2, zt + 1, 14, 6, zt + 4, C(WHITE)); // lift core with the red cross
      for (const f of [0, 1] as F[]) { const p = f ? 13 : 5, a = f ? 3 : 11; on(v, f, p, a, a + 3, zt + 2, zt + 3, C(0xe8342c, EMIT)); on(v, f, p, a + 1, a + 2, zt + 1, zt + 4, C(0xe8342c, EMIT)); }
      if (lvl > 0) helipad(v, 5.5, 4.5, zt, 3); else v.box(3, 3, zt + 1, 6, 6, zt + 2, C(0xb4b8be));
      v.box(3, 10, z, 6, 13, z + 1, C(0xb4b8be)); lawn(v, 8, 10, 13, 13, z - 1); tree(v, r, 10, 11, z, 1.4);
      v.box(12, 15, 0, 15, 16, 2, C(0xf4f4f0)); onL(v, 15, 13, 14, 1, 2, C(0xe8342c)); v.set(12, 15, 2, C(0x3f9fff, EMIT)); // ambulance
      return flip(r, v);
    },
    (r, lvl) => { // 3 shopping mall with skylit arcade, anchor store and rooftop parking
      const v = new Vox(16, 16, 40), s = sd(r), wc = pick(r, [[0xf0e8d8, 0xe6dece], [0xe8e8e4, 0xdedeDA], [0xe8d0b8, 0xdec6ae]]), ac = pick(r, ACC), ac2 = pick(r, ACC), H = 7 + lvl;
      v.box(0, 13, 0, 16, 16, 1, C(0x8a8e94));
      v.box(1, 1, 0, 15, 13, H, mixc(wc, 0, s)); onL(v, 12, 1, 15, H - 2, H - 1, C(ac)); onR(v, 14, 1, 13, H - 2, H - 1, C(ac));
      v.box(1, 1, H, 15, 13, H + 1, C(FRAME)); v.box(2, 2, H, 14, 12, H + 1, C(0x8a8e94));
      // glazed portal
      v.box(5, 12, 0, 10, 14, H + 2, C(ac2)); onL(v, 13, 6, 9, 0, H, (x, _y, z) => C(0xa8d8e8, SMOOTH | (hash(x, z >> 1, s) < 0.8 ? WARM : 0)));
      wins(v, r, 0, 12, 1, 5, 1, 1, 4, { ww: 1, gap: 1, wh: 2, glass: 0xa8d8e8, lit: 0.8 }); wins(v, r, 0, 12, 11, 14, 1, 1, 4, { ww: 1, gap: 1, wh: 2, glass: 0xa8d8e8, lit: 0.8 });
      wins(v, r, 1, 14, 2, 12, 1, 1, 4, { ww: 2, gap: 2, wh: 2, glass: 0xa8d8e8, lit: 0.6 });
      // anchor store
      const ah = H + 3 + lvl, anc = pick(r, [0xc8644a, 0x3f78ad, 0x4a4e56, 0x2f8f8f]);
      v.box(9, 1, 0, 15, 8, ah, C(anc)); v.box(9, 1, ah, 15, 8, ah + 1, C(shade(anc, 0.8))); onR(v, 14, 2, 7, ah - 3, ah - 1, C(0xfff4d0, EMIT)); onR(v, 14, 3, 4, ah - 3, ah - 1, C(anc)); onR(v, 14, 5, 6, ah - 2, ah - 1, C(anc));
      vault(v, 2, 9, 9, 12, H + 1, 'x', (x, _y, z) => (x % 3 === 0 ? C(FRAME) : C(0x8fd8d0, SMOOTH | (hash(x, z, s) < 0.5 ? WARM : 0))), 1);
      for (const [x, y] of [[2, 2], [2, 5], [6, 3]]) if (r() < 0.8) carAt(v, r, x, y, 0, true, H + 1);
      lampAt(v, 5, 6, 4, 0xf4f8ff, H + 1, 0xb8bcc4);
      carAt(v, r, 1, 14, 0, true, 1); carAt(v, r, 11, 14, 0, true, 1); tree(v, r, 7, 14, 1, 1.3);
      v.box(15, 15, 0, 16, 16, 10 + lvl * 2, C(0xb8bcc4)); v.box(15, 13, 8 + lvl * 2, 16, 16, 11 + lvl * 2, C(ac2, EMIT)); v.set(15, 14, 9 + lvl * 2, C(0xf4f4f0));
      return flip(r, v);
    },
    (r, lvl) => { // 4 multi-storey car park with spiral ramp
      const v = new Vox(16, 16, 40), s = sd(r), cp = pick(r, CONC), n = 3 + lvl * 2, rainbow = r() < 0.5, ac = pick(r, ACC), H = n * 3;
      const deck: Col = (x, y, z) => {
        const k = z % 3, a = x + y;
        if (k === 2) return C(rainbow ? ACC[(Math.floor(z / 3) + 2) % ACC.length] : z === H - 1 ? ac : cp[0]);
        if (a % 4 === 0) return C(cp[1]);
        return k === 0 && hash(x >> 1, y >> 1, Math.floor(z / 3), s) < 0.3 ? C([0xd03a30, 0x2f6fc0, 0xf0f0ec, 0xe8b830, 0x3fa070, 0xc0c4cc][Math.floor(hash(x >> 1, y >> 1, z, s + 1) * 6)]) : C(0x2a2e36);
      };
      v.box(1, 1, 0, 14, 14, H, deck); v.box(1, 1, H - 1, 14, 14, H, C(0x6a6e76)); onL(v, 13, 1, 14, H - 1, H + 1, C(rainbow ? cp[2] : ac)); onR(v, 13, 1, 14, H - 1, H + 1, C(rainbow ? cp[2] : ac));
      for (const [x, y] of [[2, 2], [2, 6], [6, 2], [7, 7], [2, 10]]) if (r() < 0.75) carAt(v, r, x, y, 0, true, H);
      lampAt(v, 6, 5, 4, 0xf4f8ff, H, 0xb8bcc4); lampAt(v, 10, 2, 4, 0xf4f8ff, H, 0xb8bcc4);
      cyl(v, 12.5, 12.5, 3, 0, H + 1, (x, y, z) => { const an = Math.floor(((Math.atan2(y - 12, x - 12) + Math.PI) / (Math.PI * 2)) * 5.99); return C((an + z) % 3 === 0 ? 0x30343c : cp[(an + z) % 3 === 1 ? 2 : 0]); });
      cyl(v, 12.5, 12.5, 1.6, H + 1, H + 2, C(cp[1]));
      v.box(1, 1, H, 4, 4, H + 4, C(cp[2])); onL(v, 3, 2, 3, H + 1, H + 3, C(0x2f6fd0, EMIT)); onR(v, 3, 2, 3, H + 1, H + 3, C(0x2f6fd0, EMIT));
      return flip(r, v);
    },
    (r, lvl) => { // 5 brutalist concrete: inverted ziggurat or slab between service towers
      const v = new Vox(16, 16, 90), s = sd(r), cp = pick(r, CONC), ac = pick(r, ACC), fl = 6 + lvl * 4 + irand(r, 0, 1);
      const wall: Col = (x, y, z) => C(cp[(z + (hash(x, y, z, s) < 0.25 ? 1 : 0)) % 3]);
      const W = { win: { glass: 0x2a3a48, lit: 0.36, light: mixLight }, span: C(shade(cp[0], 0.72)) };
      let z = 0;
      if (r() < 0.5) {
        v.box(6, 6, 0, 11, 11, 9, wall); onL(v, 10, 7, 10, 0, 7, C(0x8ab8d0, SMOOTH | WARM)); onR(v, 10, 7, 10, 0, 7, C(0x8ab8d0, SMOOTH | WARM));
        z = 9;
        const n1 = Math.ceil(fl / 2), n2 = fl - n1;
        v.box(4, 4, z, 13, 13, z + 1, C(cp[1])); z = mass(v, r, 4, 4, 13, 13, z + 1, n1, wall, W);
        v.box(2, 2, z, 15, 15, z + 1, C(cp[1])); z = mass(v, r, 2, 2, 15, 15, z + 1, n2, wall, W);
        v.box(2, 2, z, 15, 15, z + 2, wall); v.box(3, 3, z + 1, 14, 14, z + 2, C(ROOF8));
        cyl(v, 3, 3, 1.6, 0, z + 5, wall); cyl(v, 12.5, 3, 1.6, 0, z + 3, wall); v.box(6, 5, z + 2, 10, 9, z + 4, wall);
        onR(v, 14, 8, 9, 10, z, C(ac));
      } else {
        v.box(2, 4, 0, 14, 11, 3, C(0x3a424c)); for (let x = 2; x < 14; x += 3) v.box(x, 10, 0, x + 1, 11, 3, wall);
        z = mass(v, r, 2, 4, 13, 11, 3, fl, wall, W);
        v.box(1, 3, z, 14, 12, z + 3, wall); onL(v, 11, 2, 13, z + 1, z + 2, C(0x2a3a48, SMOOTH | WARM)); onR(v, 13, 4, 11, z + 1, z + 2, C(0x2a3a48, SMOOTH));
        v.box(12, 5, 0, 15, 9, z + 6, wall); v.box(0, 6, 0, 3, 10, z + 4, wall);
        for (let zz = 4; zz < z + 4; zz += 3) { v.set(14, 7, zz, C(0x2a3a48, SMOOTH)); v.set(1, 9, zz, C(0x2a3a48, SMOOTH)); }
        onL(v, 8, 13, 14, 0, z + 6, C(ac)); v.box(4, 5, z + 3, 8, 8, z + 4, C(0x9ca0a6));
        v.box(13, 6, z + 6, 14, 7, z + 11, C(0xc8ccd4)); v.set(13, 6, z + 11, C(0xff3b3b, EMIT));
      }
      return flip(r, v);
    },
    (r, lvl) => { // 6 postmodern granite tower with a showpiece top
      const v = new Vox(16, 16, 100), s = sd(r), gp = pick(r, POMO), wall = mixc(gp, 0, s), ac = pick(r, ACC), ac2 = pick(r, [0x2f8f8f, 0x38a868, 0xd04a3a, 0x3f78ad, 0xf0b428]);
      const pal = pick(r, [GL[1], GL[0], GL[3], GL[4]]), fl = 8 + lvl * 5 + irand(r, 0, 2);
      v.box(1, 1, 0, 14, 14, 6, wall);
      for (const f of [0, 1] as F[]) {
        on(v, f, 13, 2, 13, 0, 4, C(0x2e3640)); for (let a = 2; a < 13; a += 2) on(v, f, 13, a, a + 1, 0, 4, C(ac));
        on(v, f, 13, 6, 9, 0, 5, C(pal[2], SMOOTH | WARM));
      }
      v.box(0, 0, 6, 15, 15, 7, C(ac2));
      let z = mass(v, r, 2, 2, 13, 13, 7, fl, wall, { win: { glass: 0x2e4258, lit: 0.38, light: mixLight } });
      for (const f of [0, 1] as F[]) {
        on(v, f, 12, 6, 9, 7, z, glassFn(s, { pal, bay: 3, span: shade(pal[0], 0.8), lit: 0.4 }, (x, y) => (f ? y : x), 7, z));
        for (let zz = 7 + 11; zz < z - 3; zz += 12) on(v, f, 12, 2, 13, zz, zz + 1, C(ac2));
      }
      v.box(1, 1, z, 14, 14, z + 1, C(ac2)); z++;
      v.box(3, 3, z, 12, 12, z + 2, wall);
      const kind = irand(r, 0, 2);
      if (kind === 0) { // split pediment
        for (let k = 0; k < 5; k++) { v.box(3 + k, 3, z + 2 + k, 12 - k, 12, z + 3 + k, C(k === 0 ? ac : shade(ac, 0.9))); onL(v, 11, 4 + k, 11 - k, z + 2 + k, z + 3 + k, wall); }
        onL(v, 11, 7, 8, z + 3, z + 7, C(0x26303a)); onL(v, 11, 6, 9, z + 3, z + 5, C(0x26303a));
      } else if (kind === 1) { // barrel vault with glazed lunette
        const top = vault(v, 3, 3, 12, 12, z + 2, 'y', C(ac), 1);
        for (let x = 4; x < 11; x++) for (let zz = z + 2; zz < top; zz++) if (v.get(x, 11, zz + 1) && v.get(x - 1, 11, zz) && v.get(x + 1, 11, zz)) v.set(x, 11, zz, C(pal[2], SMOOTH | WARM));
      } else { const t = hip(v, 3, 3, 12, 12, z + 2, [ac, shade(ac, 0.88)], 0); ball(v, 7.5, 7.5, t + 1, 1.5, 1.5, C(0xe8c860)); }
      return flip(r, v);
    },
    (r, lvl) => { // 7 curtain-wall office: point tower or slab on a glass podium, or a framed box
      const v = new Vox(16, 16, 116), pal = pick(r, GL), go = curtain(r, pal), fl = 9 + lvl * 7 + irand(r, 0, 3), kind = irand(r, 0, 2);
      let z = 0, b = [2, 2, 14, 14];
      if (kind < 2) {
        z = gbox(v, r, 1, 1, 15, 15, 0, 4, { pal, lit: 0.7, mull: FRAME, bay: 3 }); v.box(0, 0, z, 16, 16, z + 1, C(FRAME)); v.box(1, 1, z, 15, 15, z + 1, C(PLAZA[1])); z++;
        b = kind === 0 ? [3, 3, 13, 13] : [1, 4, 15, 11];
        if (kind === 0) { tree(v, r, 1, 13, z, 1.2); tree(v, r, 13, 1, z, 1.2); } else { lawn(v, 2, 12, 14, 14, z - 1); tree(v, r, 4, 12, z, 1.3); tree(v, r, 10, 12, z, 1.3); }
      }
      const zt = gbox(v, r, b[0], b[1], b[2], b[3], z, z + fl * 3, go);
      if (kind === 2) { // white exoskeleton frame + recessed lobby
        for (const [x, y] of [[13, 13], [2, 13], [13, 2], [13, 7], [7, 13]]) v.box(x, y, 0, x + 1, y + 1, zt, C(FRAME));
        for (let zz = 9; zz < zt; zz += 9) { onL(v, 13, 2, 14, zz - 1, zz, C(FRAME)); onR(v, 13, 2, 14, zz - 1, zz, C(FRAME)); }
        onL(v, 13, 3, 13, 0, 3, C(pal[2], SMOOTH | WARM)); onR(v, 13, 3, 13, 0, 3, C(pal[2], SMOOTH | WARM));
      }
      crown8(v, r, b[0], b[1], b[2], b[3], zt, pick(r, [0, 1, 2, 3, 4, 5]), pal);
      return flip(r, v);
    },
    (r, lvl) => { // 8 cylindrical glass tower
      const v = new Vox(16, 16, 116), pal = pick(r, GL), s = sd(r), rad = pick(r, [5.5, 6.5]), fl = 9 + lvl * 7 + irand(r, 0, 3), H = 4 + fl * 3, top = irand(r, 0, 2);
      const co = (x: number, y: number) => Math.floor((Math.atan2(y - 7, x - 7) + Math.PI) * rad);
      const go: GO = pick(r, [{ pal, span: 0xeceeee, bay: 2 }, { pal, mull: FRAME, bay: 2 }, { pal, span: shade(pal[0], 0.8), bay: 2 }, { pal, mull: FRAME, span: FRAME, bay: 3 }]);
      const g = glassFn(s, go, co, 4, H);
      cyl(v, 7.5, 7.5, rad - 1, 0, 4, (x, y) => (co(x, y) % 3 === 0 ? C(FRAME) : C(pal[2], SMOOTH | WARM)));
      cyl(v, 7.5, 7.5, rad + 0.5, 3, 4, C(FRAME));
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const dx = x - 7, dy = y - 7;
        if (dx * dx + dy * dy > rad * rad) continue;
        const zt = top === 0 ? H - Math.round((dx + dy + rad * 1.4) * 0.45) : H;
        v.box(x, y, 4, x + 1, y + 1, zt, g); v.set(x, y, zt, C(top === 0 ? 0xe8ecf0 : FRAME, SMOOTH));
      }
      if (top === 1) { cyl(v, 7.5, 7.5, rad + 0.7, H, H + 1, C(FRAME)); cyl(v, 7.5, 7.5, rad - 2, H + 1, H + 3, (x, y) => C((x + y) % 2 ? 0xb4b8be : 0x9ca0a6)); v.box(7, 7, H + 3, 8, 8, H + 9, C(0xc8ccd4)); v.set(7, 7, H + 9, C(0xff3b3b, EMIT)); }
      else if (top === 2) helipad(v, 7.5, 7.5, H, rad - 1.5);
      else v.set(4, 4, H + 1, C(0xff3b3b, EMIT));
      return v;
    },
    (r, lvl) => { // 9 expressive glass: leaning shard, faceted crystal or twisting stack
      const v = new Vox(16, 16, 124), pal = pick(r, GL), s = sd(r), fl = 11 + lvl * 7 + irand(r, 0, 3), H = fl * 3, kind = irand(r, 0, 2);
      const go: GO = { pal, lit: 0.3, bay: 2, span: shade(pal[0], 0.82), ...(r() < 0.6 && pal !== GL[5] ? { diag: 6, dcol: 0xeef2f4 } : { mull: FRAME, bay: 3 }) };
      if (kind === 0) {
        const sx = (8 / H) * (0.5 + r() * 0.5), sy = (8 / H) * (0.5 + r() * 0.5);
        let x1 = 15, y1 = 15;
        for (let z = 0; z < H; z++) { x1 = 15 - Math.floor(z * sx); y1 = 15 - Math.floor(z * sy); v.box(1, 1, z, x1, y1, z + 1, glassFn(s, go, boxCo(x1, y1), 0, H)); }
        v.box(1, 1, H, x1, y1, H + 1, C(FRAME));
        v.box(1, 1, H + 1, 2, y1, H + 5, C(FRAME)); v.box(1, 1, H + 1, x1, 2, H + 8, C(FRAME)); v.set(1, 1, H + 8, C(0xff3b3b, EMIT));
      } else if (kind === 1) {
        const up = r() < 0.5, g = glassFn(s, go, boxCo(14, 14), 0, H);
        for (let z = 0; z <= H; z++) {
          const t = z / H, c = Math.floor((up ? t : 1 - t) * 11);
          for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) if (13 - x + (13 - y) >= c && (up || x - 2 + (y - 2) >= Math.floor(t * 6))) v.set(x, y, z, z === H ? C(FRAME) : at(g, x, y, z));
        }
        v.box(4, 4, H + 1, 5, 5, H + 9, C(0xc8ccd4)); v.set(4, 4, H + 9, C(0xff3b3b, EMIT));
      } else {
        const n = Math.ceil(fl / 4), ph = r() * 6;
        let z = 0, x0 = 3, y0 = 3;
        for (let i = 0; i < n; i++) {
          x0 = 3 + Math.round(Math.cos(ph + i * 0.9) * 1.6); y0 = 3 + Math.round(Math.sin(ph + i * 0.9) * 1.6);
          z = gbox(v, r, x0, y0, x0 + 10, y0 + 10, z, z + 12, go); v.box(x0, y0, z - 1, x0 + 10, y0 + 10, z, C(FRAME));
        }
        crown8(v, r, x0, y0, x0 + 10, y0 + 10, z, pick(r, [0, 2, 5]), pal);
      }
      return flip(r, v);
    },
  ],
  huge: [
    (r, lvl) => { // 0 housing estate: planted terrace block, two balcony towers, pool
      const v = new Vox(24, 24, 90), s = sd(r), wc = pick(r, [WHITE, 0xe8e4d8, 0xdfe3e8]);
      lawn(v, 0, 0, 24, 24); v.box(8, 10, 0, 10, 24, 1, C(PLAZA[0])); v.box(0, 11, 0, 24, 13, 1, C(PLAZA[0]));
      const n = 5 + lvl; // every floor steps back behind a planter
      for (let k = 0; k < n; k++) {
        const y1 = 10 - k, z = k * 3;
        v.box(1, 1, z, 15, y1, z + 3, C(wc));
        for (let x = 2; x < 14; x++) if (x % 3) onL(v, y1 - 1, x, x + 1, z + 1, z + 3, C(0x3f5a78, SMOOTH | (hash(x, k, s) < 0.4 ? WARM : 0)));
        v.box(1, y1 - 1, z + 3, 15, y1, z + 4, (x) => C(hash(x, k, s + 3) < 0.65 ? GREEN[1 + (x % 3)] : wc, ROUGH));
        wins(v, r, 1, 14, 2, y1 - 1, z, 1, 3, { glass: 0x3f5a78, lit: 0.4 });
      }
      v.box(2, 2, n * 3, 14, 10 - n, n * 3 + 1, C(ROOF8));
      const sch = scheme(r);
      for (const [x0, y0, fl] of [[16, 2, 10 + lvl * 5], [1, 15, 5 + lvl * 3]]) {
        const z = 3 + fl * 3;
        v.box(x0, y0, 0, x0 + 7, y0 + 7, 3, C(0x46505a)); for (const d of [0, 3, 6]) { v.box(x0 + d, y0 + 6, 0, x0 + d + 1, y0 + 7, 3, C(wc)); v.box(x0 + 6, y0 + d, 0, x0 + 7, y0 + d + 1, 3, C(wc)); }
        v.box(x0, y0, 3, x0 + 7, y0 + 7, z, C(wc));
        balconies(v, s, 0, y0 + 6, x0, x0 + 7, 3, fl, sch, wc); balconies(v, s + 9, 1, x0 + 6, y0, y0 + 7, 3, fl, sch, wc);
        v.box(x0, y0, z, x0 + 8, y0 + 8, z + 1, C(FRAME)); v.box(x0 + 1, y0 + 1, z, x0 + 6, y0 + 6, z + 1, C(ROOF8)); v.box(x0 + 2, y0 + 2, z + 1, x0 + 5, y0 + 5, z + 3, C(wc));
      }
      v.box(12, 14, 0, 22, 21, 1, C(0xe8e4dc)); v.box(13, 15, 0, 21, 20, 1, C(0x3fc8d8, SMOOTH)); v.box(16, 15, 0, 17, 17, 1, C(0xe8e4dc));
      for (const [x, y] of [[12, 21], [22, 14]]) { v.box(x, y, 1, x + 1, y + 1, 3, C(0xb8bcc4)); v.box(x - 1, y - 1, 3, x + 2, y + 2, 4, C(pick(r, ACC))); }
      tree(v, r, 10, 22, 1, 1.6); tree(v, r, 21, 22, 1, 1.8); tree(v, r, 5, 12, 1, 1.5); tree(v, r, 17, 11, 1, 1.4); tree(v, r, 22, 10, 1, 1.5);
      return flip(r, v);
    },
    (r, lvl) => { // 1 twin glass towers joined by a skybridge
      const v = new Vox(24, 24, 150), pal = pick(r, GL), go = curtain(r, pal), s = sd(r), fa = 22 + lvl * 7, fb = fa - irand(r, 2, 5);
      v.box(0, 0, 0, 24, 24, 1, mixc(PLAZA, 0, s));
      let z = gbox(v, r, 2, 2, 22, 22, 1, 6, { pal, lit: 0.7, mull: FRAME, bay: 3 }); v.box(1, 1, z, 23, 23, z + 1, C(FRAME)); v.box(2, 2, z, 22, 22, z + 1, C(PLAZA[1])); z++;
      const za = z + fa * 3, zb = z + fb * 3, g = glassFn(s, go, boxCo(11, 22), z, za), g2 = glassFn(s + 5, go, boxCo(22, 11), z, za);
      v.box(2, 13, z, 11, 22, za, g); v.box(13, 2, z, 22, 11, zb, g2);
      const br = z + Math.floor(fb * 0.55) * 3;
      for (let t = 0; t < 4; t++) v.box(10 + t, 11 - t, br, 12 + t, 14 - t, br + 4, (_x, _y, zz) => (zz === br || zz === br + 3 ? C(FRAME) : C(pal[2], SMOOTH | WARM)));
      const ck = pick(r, [3, 5, 0]);
      crown8(v, r, 2, 13, 11, 22, za, ck, pal); crown8(v, r, 13, 2, 22, 11, zb, ck, pal);
      vault(v, 3, 3, 11, 11, z, 'x', (x, _y, zz) => (x % 3 === 0 ? C(FRAME) : C(pal[1], SMOOTH | (hash(x, zz, s) < 0.5 ? WARM : 0))), 0.6);
      lawn(v, 13, 13, 21, 21, z - 1); cyl(v, 17, 17, 2.4, z - 1, z, C(0x3fc8d8, SMOOTH)); v.set(16, 16, z, C(0xe8ecf0));
      tree(v, r, 14, 20, z, 1.5); tree(v, r, 20, 14, z, 1.5); tree(v, r, 20, 20, z, 1.3);
      return flip(r, v);
    },
    (r, lvl) => { // 2 convention centre under a wave roof
      const v = new Vox(24, 24, 70), s = sd(r), pal = pick(r, [GL[1], GL[0], GL[3]]), ac = pick(r, ACC), ph = r() * 6, amp = 2.5 + lvl;
      v.box(0, 0, 0, 24, 24, 1, mixc(PLAZA, 0, s));
      const hz = (x: number) => 11 + lvl * 2 + Math.round(Math.sin(ph + x * 0.42) * amp);
      for (let x = 1; x < 23; x++) {
        const h = hz(x);
        v.box(x, 2, 1, x + 1, 17, h, C(x % 5 === 0 ? 0xdfe3e8 : WHITE));
        onL(v, 16, x, x + 1, 1, h - 1, (X, _y, z) => (X % 4 === 0 ? C(FRAME) : z % 4 === 0 ? C(shade(pal[0], 0.85), SMOOTH) : C(pal[hash(X >> 1, z >> 2, s) < 0.3 ? 2 : 1], SMOOTH | (hash(X >> 1, z >> 2, s + 1) < 0.5 ? WARM : 0))));
        v.box(x, 1, h, x + 1, 19, h + 1, C(x % 3 === 0 ? 0xdfe3e8 : 0xf6f7f8, SMOOTH)); v.set(x, 18, h - 1, C(0xdfe3e8));
      }
      for (let b = 4; b < 16; b += 4) onR(v, 22, b, b + 2, 3, 7, C(pal[1], SMOOTH | (r() < 0.5 ? WARM : 0)));
      v.box(8, 17, 1, 16, 20, 6, C(ac)); onL(v, 19, 9, 15, 1, 5, C(pal[2], SMOOTH | WARM)); v.box(7, 17, 6, 17, 21, 7, C(shade(ac, 0.85)));
      for (let x = 2; x < 23; x += 3) if (x < 7 || x > 17) flag(v, x, 22, 1, 7, ACC[x % ACC.length]);
      if (lvl > 1) { // hotel tower
        const zt = gbox(v, r, 15, 2, 22, 9, 1, 1 + 16 * 3, curtain(r, pal)); crown8(v, r, 15, 2, 22, 9, zt, pick(r, [0, 1, 5]), pal);
      }
      tree(v, r, 3, 19, 1, 1.5); tree(v, r, 20, 19, 1, 1.5);
      return flip(r, v);
    },
    (r, lvl) => { // 3 air terminal: vaulted concourse, control tower, airliner at the gate
      const v = new Vox(24, 24, 80), s = sd(r), pal = pick(r, [GL[0], GL[1], GL[5]]), ac = pick(r, ACC);
      v.box(0, 0, 0, 24, 24, 1, (x, y) => (y === 20 && x % 3 ? C(0xf0c030) : C([0xb4b8bc, 0xacb0b4, 0xbcc0c4][Math.floor(hash(x, y, s) * 3)])));
      gbox(v, r, 1, 1, 18, 11, 1, 7, { pal, lit: 0.55, mull: FRAME, bay: 3, cool: 0.5 });
      vault(v, 1, 1, 18, 11, 7, 'x', (x, y) => (x % 4 === 0 ? C(0xdfe3e8) : y === 5 || y === 6 ? C(pal[1], SMOOTH) : C(0xf6f7f8, SMOOTH)), 0.5);
      v.box(6, 11, 3, 8, 16, 5, C(0xdfe3e8)); v.box(6, 15, 1, 8, 16, 3, C(0x8a8e96)); // jet bridge
      // control tower
      const th = 26 + lvl * 7;
      cyl(v, 20.5, 4.5, 1.6, 1, th, (_x, _y, z) => C(z % 6 === 0 ? 0xc8ccd0 : 0xe6e8ea));
      cyl(v, 20.5, 4.5, 2.6, th, th + 1, C(0xdfe3e8)); cyl(v, 20.5, 4.5, 3.2, th + 1, th + 4, (x, y, z) => (z === th + 1 ? C(0xdfe3e8) : C(0x4fb89a, SMOOTH | ((x + y) % 3 ? COOL : 0))));
      cyl(v, 20.5, 4.5, 3.5, th + 4, th + 5, C(WHITE)); v.box(20, 4, th + 5, 21, 5, th + 9, C(0xc8ccd4)); v.set(20, 4, th + 9, C(0xff3b3b, EMIT)); v.box(19, 3, th + 5, 20, 6, th + 7, C(0xd03a30));
      // airliner, nose towards +x
      const py = 18, pz = 2, body = C(0xf4f5f6, SMOOTH);
      v.box(3, py, pz, 17, py + 2, pz + 2, body); v.box(17, py, pz, 18, py + 2, pz + 1, body); onL(v, py + 1, 5, 16, pz + 1, pz + 2, (x) => (x % 3 === 0 ? C(0x3a4a5a, SMOOTH) : C(0xf4f5f6)));
      onL(v, py + 1, 3, 17, pz, pz + 1, C(0xd4d8dc)); onR(v, 17, py, py + 2, pz, pz + 1, C(0x3a4a5a, SMOOTH));
      for (let k = 0; k < 5; k++) { v.box(9 - k, py + 2 + k, pz, 12 - k, py + 3 + k, pz + 1, C(0xdfe3e8)); v.box(9 - k, py - 1 - k, pz, 12 - k, py - k, pz + 1, C(0xdfe3e8)); }
      v.box(9, py + 3, pz - 1, 11, py + 4, pz, C(0x8a8e96)); v.box(9, py - 2, pz - 1, 11, py - 1, pz, C(0x8a8e96));
      v.box(2, py, pz + 2, 5, py + 1, pz + 5, C(ac)); v.box(3, py, pz + 5, 4, py + 1, pz + 6, C(ac)); v.box(2, py - 2, pz + 1, 4, py + 4, pz + 2, C(0xdfe3e8));
      v.box(8, py, 1, 9, py + 2, 2, C(0x30343a)); v.box(15, py, 1, 16, py + 1, 2, C(0x30343a));
      v.box(19, 12, 1, 22, 14, 3, C(0xf0b428)); v.box(20, 9, 1, 22, 11, 2, C(0xf4f5f6)); // service vehicles
      return v;
    },
  ],
  fill: [
    (r) => { const v = new Vox(T, T, 14); lawn(v, 0, 0, T, T); cyl(v, 5, 5, 2.4, 0, 1, C(0x4fb3b0, SMOOTH)); tree(v, r, 1, 2, 0, 2.2); v.set(6, 2, 0, C(0xd8d4c8)); return v; },
    (r) => { const v = new Vox(T, T, 14); lawn(v, 0, 0, T, T); tree(v, r, 1, 1, 0, 2); tree(v, r, 5, 5, 0, 1.8, GREEN.slice(1)); v.box(1, 6, 0, 3, 7, 2, C(0x9a6a42)); lampAt(v, 6, 1, 5, 0xf4f8ff, 0, 0x8a8e96); return v; },
    (r) => { // marked parking lot
      const v = new Vox(T, T, 6);
      v.box(0, 0, 0, T, T, 1, (x, y) => ((x === 0 || x === 4) && y !== 3 && y !== 4 ? C(0xe8e8e0) : C(0x6a6e74)));
      for (const y of [0, 5]) for (const x of [1, 5]) if (r() < 0.75) carAt(v, r, x, y, 1, true, 1);
      return v;
    },
    (r) => { // playground
      const v = new Vox(T, T, 10), a = pick(r, ACC), b = pick(r, ACC);
      v.box(0, 0, 0, T, T, 1, (x, y) => C((x + y) % 2 ? 0xe0b070 : 0xd8a868, ROUGH));
      for (const x of [1, 5]) v.box(x, 1, 1, x + 1, 2, 5, C(a)); v.box(1, 1, 5, 6, 2, 6, C(a)); v.set(2, 1, 2, C(0x30343a)); v.set(4, 1, 3, C(0x30343a));
      v.box(5, 4, 1, 7, 6, 4, C(b)); for (let k = 0; k < 3; k++) v.set(4 - k, 5, 3 - k, C(0xf0b428)); v.set(6, 6, 1, C(0x9a6a42));
      v.set(1, 6, 1, C(GREEN[2], ROUGH)); v.set(1, 5, 1, C(GREEN[1], ROUGH));
      return v;
    },
    (r) => { // ball court
      const v = new Vox(T, T, 10), c = pick(r, [[0x3f8a66, 0x4a9a74], [0x3f78ad, 0x4a86bc], [0xc8644a, 0xd47050]]);
      v.box(0, 0, 0, T, T, 1, (x, y) => (x === 0 || x === 7 || y === 0 || y === 7 || y === 4 ? C(0xf4f4f0) : C(c[(x + y) & 1])));
      for (const y of [0, 7]) { v.box(3, y, 1, 4, y + 1, 5, C(0xb8bcc4)); v.box(3, y, 4, 5, y + 1, 5, C(0xf4f4f0)); v.set(4, y ? 6 : 1, 3, C(0xe87a30)); }
      return v;
    },
    (r) => { // plaza sculpture
      const v = new Vox(T, T, 12), a = pick(r, ACC);
      v.box(0, 0, 0, T, T, 1, (x, y) => C(PLAZA[(x >> 1) + (y >> 1) & 1 ? 0 : 2]));
      if (r() < 0.5) { v.box(2, 3, 1, 3, 4, 7, C(a)); v.box(2, 3, 6, 6, 4, 7, C(a)); v.box(5, 3, 3, 6, 4, 7, C(a)); v.box(4, 4, 1, 5, 5, 3, C(shade(a, 0.8))); }
      else { ball(v, 4, 4, 3.5, 2, 2, C(0xc8d0d8, SMOOTH)); v.box(3, 3, 1, 5, 5, 2, C(0x6a6e76)); }
      v.box(6, 6, 1, 8, 8, 2, C(0xb8bcc4)); v.set(6, 6, 2, C(GREEN[2], ROUGH)); v.set(7, 7, 2, C(GREEN[3], ROUGH)); v.set(7, 6, 2, C(pick(r, [0xe8a0b0, 0xf4e36b]), ROUGH));
      return v;
    },
    (r) => { // food truck with parasol
      const v = new Vox(T, T, 12), a = pick(r, ACC), b = pick(r, ACC);
      v.box(1, 1, 1, 6, 4, 4, C(a)); v.box(6, 1, 1, 7, 4, 3, C(0xf4f5f6)); onL(v, 3, 2, 5, 2, 3, C(0xfff4d0, WARM)); v.box(1, 4, 4, 6, 5, 5, C(0xf4f4f0)); v.box(1, 1, 0, 2, 4, 1, C(0x30343a)); v.box(5, 1, 0, 6, 4, 1, C(0x30343a));
      v.box(5, 6, 0, 6, 7, 3, C(0xb8bcc4)); v.box(4, 5, 3, 7, 8, 4, (x, y) => C((x + y) % 2 ? b : 0xf4f4f0)); v.set(3, 6, 0, C(0x9a6a42)); v.set(7, 6, 0, C(0x9a6a42));
      return flip(r, v);
    },
  ],
  sec: [
    (r) => { // 0 TV tower with saucer pod
      const v = new Vox(16, 16, 110), s = sd(r), pal = pick(r, [GL[0], GL[1], GL[4]]);
      v.box(0, 0, 0, 16, 16, 1, mixc(PLAZA, 0, s));
      cyl(v, 8, 8, 6, 1, 4, (x, y) => ((x + y) % 3 === 0 ? C(FRAME) : C(pal[2], SMOOTH | WARM))); cyl(v, 8, 8, 6.5, 4, 5, C(WHITE));
      for (let z = 5; z < 56; z++) cyl(v, 8, 8, Math.max(1.4, 2.8 - (z - 5) * 0.035), z, z + 1, C(z % 8 === 0 ? 0xc0c4c8 : 0xe2e4e6));
      [2.5, 4, 5.5, 6, 6, 5.5, 4.5, 3].forEach((rad, i) => cyl(v, 8, 8, rad, 52 + i, 53 + i, (x, y) => (i === 3 || i === 4 ? C(pal[(x + y) % 3 === 0 ? 0 : 1], SMOOTH | (hash(x, y, i, s) < 0.6 ? (hash(x, y, s) < 0.4 ? COOL : WARM) : 0)) : C(i === 5 ? 0xd03a30 : 0xe8eaec, SMOOTH))));
      cyl(v, 8, 8, 2.4, 62, 64, C(0xe2e4e6));
      for (let z = 60; z < 88; z++) { v.set(8, 8, z, C(z % 6 < 3 ? 0xd03a30 : 0xf0f0ec)); if (z < 72) { v.set(7, 8, z, C(0xc8ccd0)); v.set(8, 7, z, C(0xc8ccd0)); v.set(7, 7, z, C(0xc8ccd0)); } }
      v.set(8, 8, 88, C(0xff3b3b, EMIT)); v.set(8, 8, 72, C(0xff3b3b, EMIT));
      tree(v, r, 1, 13, 1, 1.5); tree(v, r, 13, 1, 1, 1.5);
      return v;
    },
    (r) => { // 1 stadium: tall roofed stands at the back, low ones in front so the pitch shows
      const v = new Vox(16, 16, 34), s = sd(r), tc = pick(r, [[0xd03a30, 0xf2f1ec], [0x2f6fc0, 0xf0b428], [0x38a868, 0xf2f1ec], [0xe87a30, 0x30343a]]);
      const crowd = [0xf0d0b0, 0x30343a, 0xf4f4f0, 0xf0b428];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const ax = Math.abs(x - 7.5), ay = Math.abs(y - 7.5), dd = Math.max(ax - 3.5, ay - 4.5);
        if (ax + ay > 13) continue;
        if (dd <= 0) { v.set(x, y, 0, ax === 3.5 || ay === 4.5 || y === 7 ? C(0xe8f0e0) : C((y >> 1) % 2 ? 0x4a9a4a : 0x5aaa54, ROUGH)); continue; }
        const far = x + y < 15, row = Math.floor(dd), h = 1 + Math.round((dd + 0.5) * (far ? 2.3 : 0.6));
        v.box(x, y, 0, x + 1, y + 1, h, (X, Y, z) => C(z % 3 === 1 && (X + Y) % 2 ? 0x46505a : 0xe2e4e6));
        v.set(x, y, h - 1, (x + y) % 5 === 0 ? C(0xd8dadc) : hash(x, y, s) < 0.18 ? C(crowd[Math.floor(hash(x, y, s + 1) * 4)]) : C(tc[row === 1 ? 1 : 0]));
        if (far && dd > 2) { v.set(x, y, 13, C((x + y) % 3 === 0 ? 0xdfe3e8 : 0xf6f7f8, SMOOTH)); if (dd > 3 && (x + y) % 4 === 0) v.box(x, y, h, x + 1, y + 1, 13, C(0xb8bcc4)); }
      }
      for (const [x, y] of [[0, 0], [15, 1], [1, 15]]) { v.box(x, y, 0, x + 1, y + 1, 17, C(0xb8bcc4)); v.box(x, y, 17, x + 1, y + 1, 19, C(0xf4f8ff, EMIT)); v.set(x ? x - 1 : 1, y ? y - 1 : 1, 18, C(0xf4f8ff, EMIT)); }
      v.box(13, 13, 0, 15, 15, 3, C(tc[0])); v.box(13, 13, 3, 15, 15, 4, C(0xe2e4e6));
      return flip(r, v);
    },
    (r) => { // 2 botanical glass dome
      const v = new Vox(16, 16, 30), s = sd(r), pal = pick(r, [GL[1], GL[3]]);
      lawn(v, 0, 0, 16, 16); v.box(7, 12, 0, 9, 16, 1, C(PLAZA[0]));
      cyl(v, 8, 7, 6.6, 0, 2, C(0xe8eaec));
      dome(v, 8, 7, 2, 6.3, 8, (x, y, z) => (z % 3 === 1 || x === 8 || y === 7 || Math.abs(x - 8) === Math.abs(y - 7) ? C(0xf2f5f5) : hash(x >> 1, y >> 1, z >> 1, s) < 0.2 ? C(0x4a9a5a, SMOOTH) : C(pal[x + y < 13 ? 2 : 1], SMOOTH | (hash(x >> 1, y >> 1, z, s + 1) < 0.5 ? WARM : 0))));
      v.box(6, 12, 0, 10, 14, 4, C(0xe8eaec)); onL(v, 13, 7, 9, 0, 3, C(pal[2], SMOOTH | WARM)); vault(v, 6, 12, 10, 14, 4, 'y', C(pal[1], SMOOTH), 1);
      dome(v, 2.5, 13, 0, 2.2, 3, (x, y, z) => ((x + y + z) % 3 === 0 ? C(0xf2f5f5) : C(pal[1], SMOOTH)));
      cyl(v, 13, 13, 2, 0, 1, C(0x4fb3b0, SMOOTH)); v.set(13, 13, 0, C(0xe8a0b0, ROUGH));
      tree(v, r, 13, 1, 1, 1.5); tree(v, r, 1, 1, 1, 1.3);
      return flip(r, v);
    },
    (r) => { // 3 concert hall: two white shells sweeping up over glass foyers
      const v = new Vox(16, 16, 40), s = sd(r), pal = pick(r, [GL[1], GL[0], GL[3]]), ac = pick(r, ACC);
      v.box(0, 0, 0, 16, 16, 1, mixc(PLAZA, 0, s));
      const shell = (x0: number, x1: number, y0: number, y1: number, h0: number, h1: number) => {
        for (let x = x0; x < x1; x++) {
          const t = (x - x0) / (x1 - x0 - 1), h = Math.round(h0 + (h1 - h0) * t * t);
          v.box(x, y0, 1, x + 1, y1, h, (X, _y, z) => (X % 3 === 0 ? C(FRAME) : C(pal[hash(X, z >> 1, s) < 0.3 ? 2 : 1], SMOOTH | (hash(X, z >> 1, s + 1) < 0.55 ? WARM : 0))));
          v.box(x, y0 - 1, h, x + 1, y1 + 1, h + 2, C(x % 4 === 0 ? 0xdfe3e8 : 0xf6f7f8, SMOOTH));
        }
        onR(v, x1 - 1, y0, y1, 1, h1, (_x, Y, z) => (Y === y0 || Y === y1 - 1 || z % 5 === 0 ? C(FRAME) : C(pal[hash(Y, z >> 1, s) < 0.3 ? 2 : 1], SMOOTH | (hash(Y, z >> 1, s + 2) < 0.55 ? WARM : 0))));
      };
      shell(1, 15, 2, 9, 4, 20); shell(1, 11, 10, 14, 3, 11);
      v.box(11, 10, 1, 15, 15, 2, C(ac)); v.box(11, 14, 1, 15, 15, 2, C(shade(ac, 0.8)));
      lampAt(v, 13, 12, 5, 0xf4f8ff, 2, 0xb8bcc4);
      return flip(r, v);
    },
  ],
  hero: (r) => { // tapering diagrid supertall with a split crown
    const v = new Vox(24, 24, 200), s = sd(r), pal = GL[0], H = 106, z0 = 9;
    const go: GO = { pal, lit: 0.3, bay: 2, span: shade(pal[0], 0.82), diag: 8, dcol: 0xf2f5f7 };
    v.box(0, 0, 0, 24, 24, 1, mixc(PLAZA, 0, s));
    gbox(v, r, 2, 2, 22, 22, 1, 8, { pal: GL[1], lit: 0.7, mull: FRAME, bay: 3 }); v.box(1, 1, 8, 23, 23, 9, C(FRAME)); v.box(2, 2, 8, 22, 22, 9, C(PLAZA[1]));
    for (const f of [0, 1] as F[]) { on(v, f, 22, 9, 15, 4, 5, C(0xe0503c)); on(v, f, 21, 10, 14, 1, 4, C(GL[1][2], SMOOTH | WARM)); }
    lawn(v, 3, 18, 21, 21, 8); lawn(v, 18, 3, 21, 18, 8); tree(v, r, 5, 19, 9, 1.5); tree(v, r, 19, 5, 9, 1.5); tree(v, r, 19, 19, 9, 1.7); tree(v, r, 12, 19, 9, 1.2);
    let x0 = 4, x1 = 20, c = 0;
    for (let z = z0; z < z0 + H; z++) {
      const t = (z - z0) / H;
      const inset = Math.floor(5.5 * Math.pow(t, 1.7));
      x0 = 4 + inset; x1 = 20 - inset; c = t > 0.5 ? Math.floor((t - 0.5) * 12) : 0;
      const mech = (z - z0) % 27 >= 25, g = glassFn(s, go, boxCo(x1, x1), z0, z0 + H);
      for (let y = x0; y < x1; y++) for (let x = x0; x < x1; x++) if (x1 - 1 - x + (x1 - 1 - y) >= c) v.set(x, y, z, mech ? C((x + y) % 2 ? 0xe8ecf0 : 0xc8d0d8, SMOOTH) : at(g, x, y, z));
    }
    const zt = z0 + H;
    v.box(x0, x0, zt, x1, x1, zt + 1, C(FRAME));
    v.box(x0, x0, zt + 1, x1, x0 + 2, zt + 12, glassFn(s, go, boxCo(x1, x0 + 2), z0, zt + 12)); v.box(x0, x0 + 3, zt + 1, x0 + 2, x1, zt + 7, glassFn(s, go, boxCo(x0 + 2, x1), z0, zt + 12));
    v.box(x0, x0, zt + 12, x1, x0 + 2, zt + 13, C(0xd8f0ff, EMIT)); v.box(x0, x0 + 3, zt + 7, x0 + 2, x1, zt + 8, C(0xd8f0ff, EMIT));
    v.box(x0, x0, zt + 13, x0 + 1, x0 + 1, zt + 34, C(0xd0d4da)); v.set(x0, x0, zt + 34, C(0xff3b3b, EMIT)); v.set(x0, x0, zt + 24, C(0xff3b3b, EMIT));
    return v;
  },
  road: (r, d) => roadTile(r, d, [0x3c4048, 0x383c44, 0x40444c], { curb: [0xd0d2d4, 0xc4c6c8], dash: 0xf4f4ec }),
  pave: (r) => ground(r, [0xcfd1d3, 0xc5c7c9, 0xd7d9da], 0, { c: [0xb2b4b6, 0xbcc8bc], p: 0.06 }),
  bridge: (r, d) => bridgeTile(r, d, [0x3c4048, 0x40444c], 0xdfe3e8, 0, 0xf4f8ff),
};

export { e7, e8 };
