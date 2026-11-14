import { hash, pick, type R } from './rng';
import { C, EMIT, ROUGH, SMOOTH, WARM, COOL, Vox, type Col } from './voxel';

export const T = 8; // voxels per tile edge
export type Maker = (r: R, lvl: number) => Vox;

const res = (c: Col, x: number, y: number, z: number) => (typeof c === 'number' ? c : c(x, y, z));

/** Random per-voxel mix of a few shades: gives brick / stone / thatch texture. */
export const mixc = (cols: number[], flags = 0, s = 0): Col => (x, y, z) =>
  C(cols[Math.floor(hash(x, y, z, s) * cols.length)], flags);

/** Horizontal courses (planks, siding). */
export const courses = (cols: number[], flags = 0): Col => (_x, _y, z) => C(cols[z % cols.length], flags);

export const onL = (v: Vox, yf: number, a0: number, a1: number, z0: number, z1: number, c: Col) =>
  v.box(a0, yf, z0, a1, yf + 1, z1, c);
export const onR = (v: Vox, xf: number, b0: number, b1: number, z0: number, z1: number, c: Col) =>
  v.box(xf, b0, z0, xf + 1, b1, z1, c);

/** Gable roof, ridge running along `along`. Returns the ridge height. */
export function gable(
  v: Vox, x0: number, y0: number, x1: number, y1: number, z: number,
  along: 'x' | 'y', roof: number[], fill: Col, ov = 1, flags = 0,
): number {
  let k = 0;
  if (along === 'x') {
    let lo = y0 - ov, hi = y1 - 1 + ov;
    while (lo <= hi) {
      const c = C(roof[k % roof.length], flags);
      for (let x = x0 - ov; x < x1 + ov; x++) { v.set(x, lo, z + k, c); v.set(x, hi, z + k, c); }
      for (let y = lo + 1; y < hi; y++) for (let x = x0; x < x1; x++) v.set(x, y, z + k, res(fill, x, y, z + k));
      lo++; hi--; k++;
    }
  } else {
    let lo = x0 - ov, hi = x1 - 1 + ov;
    while (lo <= hi) {
      const c = C(roof[k % roof.length], flags);
      for (let y = y0 - ov; y < y1 + ov; y++) { v.set(lo, y, z + k, c); v.set(hi, y, z + k, c); }
      for (let x = lo + 1; x < hi; x++) for (let y = y0; y < y1; y++) v.set(x, y, z + k, res(fill, x, y, z + k));
      lo++; hi--; k++;
    }
  }
  return z + k;
}

/** Hip / pyramid roof. `maxK` truncates it (mansard). Returns top height. */
export function hip(
  v: Vox, x0: number, y0: number, x1: number, y1: number, z: number,
  roof: number[], ov = 1, maxK = 99, flags = 0,
): number {
  let k = 0;
  let a0 = x0 - ov, a1 = x1 + ov, b0 = y0 - ov, b1 = y1 + ov;
  while (a0 < a1 && b0 < b1 && k < maxK) {
    v.box(a0, b0, z + k, a1, b1, z + k + 1, C(roof[k % roof.length], flags));
    a0++; a1--; b0++; b1--; k++;
  }
  return z + k;
}

export function cyl(v: Vox, cx: number, cy: number, r: number, z0: number, z1: number, c: Col): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) for (let z = z0; z < z1; z++) v.set(x, y, z, res(c, x, y, z));
    }
}

export function cone(v: Vox, cx: number, cy: number, r: number, z0: number, h: number, cols: number[], flags = 0): void {
  for (let k = 0; k < h; k++) cyl(v, cx, cy, Math.max(0.6, r * (1 - k / h)), z0 + k, z0 + k + 1, C(cols[k % cols.length], flags));
}

export function ball(v: Vox, cx: number, cy: number, cz: number, rx: number, rz: number, c: Col): void {
  for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
    for (let y = Math.floor(cy - rx); y <= Math.ceil(cy + rx); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / rx, dz = (z + 0.5 - cz) / rz;
        if (dx * dx + dy * dy + dz * dz <= 1) v.set(x, y, z, res(c, x, y, z));
      }
}

/** Battlements around the top edge of a box. */
export function crenel(v: Vox, x0: number, y0: number, x1: number, y1: number, z: number, c: Col): void {
  for (let x = x0; x < x1; x++) if ((x - x0) % 2 === 0) { v.set(x, y0, z, res(c, x, y0, z)); v.set(x, y1 - 1, z, res(c, x, y1 - 1, z)); }
  for (let y = y0; y < y1; y++) if ((y - y0) % 2 === 0) { v.set(x0, y, z, res(c, x0, y, z)); v.set(x1 - 1, y, z, res(c, x1 - 1, y, z)); }
}

export interface FacadeO {
  glass?: number; lit?: number; light?: number | ((r: R) => number);
  ww?: number; gap?: number; wh?: number; sill?: number; m?: number;
}

/** Window grid on the two visible faces of a box. */
export function facade(
  v: Vox, r: R, x0: number, y0: number, x1: number, y1: number,
  z0: number, floors: number, fh: number, o: FacadeO = {},
): void {
  const glass = o.glass ?? 0x2c3e55, lit = o.lit ?? 0.45;
  const ww = o.ww ?? 1, gap = o.gap ?? 2, wh = o.wh ?? 2, sill = o.sill ?? 1, m = o.m ?? 1;
  const win = () => {
    if (r() >= lit) return C(glass, SMOOTH);
    const l = typeof o.light === 'function' ? o.light(r) : o.light ?? WARM;
    return C(glass, SMOOTH | l);
  };
  for (let f = 0; f < floors; f++) {
    const zb = z0 + f * fh + sill;
    for (let a = x0 + m; a + ww <= x1 - m; a += ww + gap) onL(v, y1 - 1, a, a + ww, zb, zb + wh, win());
    for (let b = y0 + m; b + ww <= y1 - m; b += ww + gap) onR(v, x1 - 1, b, b + ww, zb, zb + wh, win());
  }
}

export interface HouseO {
  n: 1 | 2 | 3; w: number; d: number; floors: number; fh?: number;
  wall: Col; roof: number[]; roofType: 'gable' | 'hip' | 'flat' | 'mansard';
  roofFlags?: number; gfill?: Col; ov?: number; along?: 'x' | 'y';
  timber?: number; base?: Col; door?: number; chimney?: number; smoke?: boolean;
  win?: FacadeO; h?: number;
}

/** Parametric house: walls, optional timber frame, windows, door, roof, chimney. */
export function house(r: R, o: HouseO, into?: { v: Vox; x0: number; y0: number }): Vox {
  const S = o.n * T, fh = o.fh ?? 4, zb = o.base ? 1 : 0, H = o.floors * fh + zb;
  const v = into?.v ?? new Vox(S, S, o.h ?? H + S + 12);
  const x0 = into ? into.x0 : (S - o.w) >> 1, y0 = into ? into.y0 : (S - o.d) >> 1;
  const x1 = x0 + o.w, y1 = y0 + o.d;
  v.box(x0, y0, 0, x1, y1, H, o.wall);
  if (o.base) v.box(x0, y0, 0, x1, y1, 1, o.base);
  facade(v, r, x0, y0, x1, y1, zb, o.floors, fh, o.win);
  if (o.timber != null) {
    const t = C(o.timber);
    for (let z = 0; z < H; z++) { v.set(x0, y1 - 1, z, t); v.set(x1 - 1, y1 - 1, z, t); v.set(x1 - 1, y0, z, t); }
    for (let f = 1; f <= o.floors; f++) {
      const z = zb + f * fh - 1;
      for (let x = x0; x < x1; x++) v.set(x, y1 - 1, z, t);
      for (let y = y0; y < y1; y++) v.set(x1 - 1, y, z, t);
    }
  }
  const dw = o.w >= 9 ? 2 : 1, dx = x0 + ((o.w - dw) >> 1);
  onL(v, y1 - 1, dx, dx + dw, zb, zb + 3, C(o.door ?? 0x4a3020));
  let top = H;
  const along = o.along ?? (o.w >= o.d ? 'x' : 'y');
  const rf = o.roofFlags ?? 0;
  if (o.roofType === 'gable') top = gable(v, x0, y0, x1, y1, H, along, o.roof, o.gfill ?? o.wall, o.ov ?? 1, rf);
  else if (o.roofType === 'hip') top = hip(v, x0, y0, x1, y1, H, o.roof, o.ov ?? 1, 99, rf);
  else if (o.roofType === 'mansard') {
    top = hip(v, x0, y0, x1, y1, H, o.roof, 0, 3, rf);
    v.box(x0 + 3, y0 + 3, top - 1, x1 - 3, y1 - 3, top, C(o.roof[o.roof.length - 1]));
  } else {
    v.box(x0, y0, H, x1, y1, H + 1, C(o.roof[0]));
    v.box(x0 + 1, y0 + 1, H, x1 - 1, y1 - 1, H + 1, 0);
    v.box(x0 + 1, y0 + 1, H - 1, x1 - 1, y1 - 1, H, C(o.roof[1] ?? o.roof[0]));
    top = H + 1;
  }
  if (o.chimney != null) {
    const cx = x0 + 1 + Math.floor(r() * Math.max(1, o.w - 3)), cy = y0 + 1 + Math.floor(r() * Math.max(1, o.d - 3));
    v.box(cx, cy, H, cx + 1, cy + 1, top + 2, C(o.chimney));
    if (o.smoke) v.emit(cx, cy, top + 3, 'smoke');
  }
  return v;
}

export type Crown = (v: Vox, x0: number, y0: number, x1: number, y1: number, z: number, r: R) => void;

export interface TowerO {
  n: number; segs: [number, number, number][]; // [w, d, floors]
  fh?: number; wall: Col; slab?: Col; trim?: number; crown?: Crown; win?: FacadeO;
  each?: (v: Vox, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, i: number) => void;
}

/** Stacked, centred box segments with window grids: everything from offices to megatowers. */
export function tower(r: R, o: TowerO): Vox {
  const S = o.n * T, fh = o.fh ?? 3;
  let H = 0;
  for (const s of o.segs) H += s[2] * fh + 1;
  const v = new Vox(S, S, H + 44);
  let z = 0, last = [0, 0, S, S];
  o.segs.forEach(([w, d, fl], i) => {
    const x0 = (S - w) >> 1, y0 = (S - d) >> 1, x1 = x0 + w, y1 = y0 + d, hh = fl * fh;
    v.box(x0, y0, z, x1, y1, z + hh, o.wall);
    facade(v, r, x0, y0, x1, y1, z, fl, fh, { sill: 0, wh: fh - 1, gap: 1, ...o.win });
    if (o.trim != null) {
      const t = C(o.trim, EMIT);
      for (let zz = z; zz < z + hh; zz++) v.set(x1 - 1, y1 - 1, zz, t);
      if (i === o.segs.length - 1) {
        for (let x = x0; x < x1; x++) v.set(x, y1 - 1, z + hh - 1, t);
        for (let y = y0; y < y1; y++) v.set(x1 - 1, y, z + hh - 1, t);
      }
    }
    o.each?.(v, x0, y0, x1, y1, z, z + hh, i);
    z += hh;
    if (o.slab) { v.box(x0, y0, z, x1, y1, z + 1, o.slab); z++; }
    last = [x0, y0, x1, y1];
  });
  o.crown?.(v, last[0], last[1], last[2], last[3], z, r);
  return v;
}

// ---- crowns -----------------------------------------------------------------
export const antenna = (h: number, beacon = 0xff3b3b): Crown => (v, x0, y0, x1, y1, z) => {
  const cx = (x0 + x1) >> 1, cy = (y0 + y1) >> 1;
  v.box(cx, cy, z, cx + 1, cy + 1, z + h, C(0xb4b8c0));
  v.set(cx, cy, z + h, C(beacon, EMIT));
};

export const roofJunk: Crown = (v, x0, y0, x1, y1, z, r) => {
  const n = 1 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const x = x0 + 1 + Math.floor(r() * Math.max(1, x1 - x0 - 4)), y = y0 + 1 + Math.floor(r() * Math.max(1, y1 - y0 - 4));
    v.box(x, y, z, x + 2, y + 2, z + 1 + Math.floor(r() * 2), C(pick(r, [0x9aa0a8, 0x7c838c, 0xb8bcc2])));
  }
};

export const both = (...cs: Crown[]): Crown => (v, x0, y0, x1, y1, z, r) => cs.forEach((c) => c(v, x0, y0, x1, y1, z, r));

/** Stepped pyramid crown + needle. */
export const spire = (cols: number[], needle: number, tip = 0xffe9a8): Crown => (v, x0, y0, x1, y1, z) => {
  let k = 0;
  while (x1 - x0 > 2 * k + 1 && y1 - y0 > 2 * k + 1) {
    v.box(x0 + k, y0 + k, z + k * 2, x1 - k, y1 - k, z + k * 2 + 2, C(cols[k % cols.length]));
    k++;
  }
  const cx = (x0 + x1) >> 1, cy = (y0 + y1) >> 1;
  v.box(cx, cy, z + k * 2, cx + 1, cy + 1, z + k * 2 + needle, C(0xc8ccd4));
  v.set(cx, cy, z + k * 2 + needle, C(tip, EMIT));
};

/** Vertical neon sign hanging off a wall. */
export function vsign(v: Vox, r: R, x: number, y: number, z0: number, len: number, cols: number[]): void {
  const c = pick(r, cols);
  for (let k = 0; k < len; k++) v.set(x, y, z0 + k, k % 3 === 2 ? C(0x14141c) : C(c, EMIT));
}

/** Glowing billboard / video wall painted onto a face. */
export function screen(v: Vox, r: R, face: 'L' | 'R', f: number, a0: number, a1: number, z0: number, z1: number, cols: number[]): void {
  const ph = Math.floor(r() * 7);
  for (let a = a0; a < a1; a++)
    for (let z = z0; z < z1; z++) {
      const c = C(cols[(((a + ph) >> 1) + ((z >> 1) * 2) + (hash(a >> 1, z >> 1, ph) < 0.25 ? 1 : 0)) % cols.length], EMIT);
      if (face === 'L') v.set(a, f, z, c); else v.set(f, a, z, c);
    }
}

// ---- nature -------------------------------------------------------------------
export function blobTree(
  r: R, pal: number[],
  o: { trunkH: number; rad: number; squash?: number; blossom?: number[]; bp?: number; trunk?: number; blobs?: number; size?: number },
): Vox {
  const S = o.size ?? 16, c0 = S / 2;
  const v = new Vox(S, S, 34);
  const s = Math.floor(r() * 1e6);
  if (o.trunkH > 0) v.box(c0 - 1, c0 - 1, 0, c0 + (o.rad > 3.4 ? 1 : 0), c0 + (o.rad > 3.4 ? 1 : 0), o.trunkH + 2, mixc([o.trunk ?? 0x5a3d28, 0x4a3020], 0, s));
  const nb = o.blobs ?? 2 + Math.floor(r() * 2);
  for (let i = 0; i < nb; i++) {
    const rx = o.rad * (0.72 + r() * 0.36), rz = rx * (o.squash ?? 0.85);
    const cx = c0 + (r() - 0.5) * o.rad * 0.9, cy = c0 + (r() - 0.5) * o.rad * 0.9;
    const cz = o.trunkH + rz * 0.75 + (r() - 0.3) * 2;
    for (let z = Math.floor(cz - rz); z <= cz + rz; z++)
      for (let y = Math.floor(cy - rx); y <= cy + rx; y++)
        for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / rx, dz = (z + 0.5 - cz) / rz;
          const hv = hash(x, y, z, s);
          if (z < 1 || dx * dx + dy * dy + dz * dz > 1 - hv * 0.3) continue;
          const li = 0.48 + 0.34 * dz + 0.16 * (dy - dx) + (hash(x, y, z, s + 1) - 0.5) * 0.34;
          let col = pal[Math.max(0, Math.min(pal.length - 1, Math.floor(li * pal.length)))];
          if (o.blossom && hash(x, y, z, s + 2) < (o.bp ?? 0.14)) col = o.blossom[Math.floor(hv * o.blossom.length)];
          v.set(x, y, z, C(col, ROUGH));
        }
  }
  return v;
}

export function pine(r: R, pal: number[], h: number): Vox {
  const v = new Vox(12, 12, 30);
  v.box(5, 5, 0, 7, 7, 3, C(0x4a3020));
  const tiers = 3 + Math.floor(r() * 2);
  let z = 2;
  for (let t = 0; t < tiers; t++) {
    const rad = 4.4 - t * (3.2 / tiers), th = Math.round(h / tiers) + 1;
    for (let k = 0; k < th; k++)
      cyl(v, 6, 6, Math.max(0.7, rad * (1 - (k / th) * 0.75)), z + k, z + k + 1, (x, y, zz) =>
        C(pal[Math.max(0, Math.min(pal.length - 1, Math.floor((0.35 + 0.1 * (y - x) + hash(x, y, zz, t) * 0.5) * pal.length)))], ROUGH));
    z += th - 1;
  }
  return v;
}

export { C, EMIT, ROUGH, SMOOTH, WARM, COOL, Vox };
export type { Col };
