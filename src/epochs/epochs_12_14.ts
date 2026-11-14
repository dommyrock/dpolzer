// Epochs 12-14: what the garden city gains as it reaches for space.
// 12 Spaceport City (launch orange), 13 Lunar Gateway (silver-blue), 14 Mars Frontier (rust).
import { hash, pick, irand, type R } from './rng';
import { C, EMIT, ROUGH, SMOOTH, WARM, COOL, Vox, T, type Col, mixc, onL, onR, cyl, ball } from './shapes';
import { GREEN } from './models_base';
import { type Extras } from './epochs_a';

// ================================ shared helpers ================================
type Face = 'L' | 'R';
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerpc = (a: number, b: number, t: number): number => {
  t = clamp01(t);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const shade = (c: number, k: number) => lerpc(c, k < 0 ? 0x000000 : 0xffffff, Math.abs(k));
const res = (c: Col, x: number, y: number, z: number) => (typeof c === 'number' ? c : c(x, y, z));
const faces = (v: Vox, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, c: Col) => {
  onL(v, y1 - 1, x0, x1, z0, z1, c); onR(v, x1 - 1, y0, y1, z0, z1, c);
};

// palette: ceramic white, cream, timber and sky glass carry over from the garden city
const WHITE = [0xf3f2ee, 0xe9e8e3], CREAM = [0xf0e8d6, 0xe6ddc9], TIMBER = [0xc39a68, 0xb38b5b];
const CONC = [0xd2d0c9, 0xc8c6bf, 0xcdcbc4], STEEL = 0xa9b1bd, DARK = 0x4a4f5a, HULL = 0xf0f2f6;
const WIN = 0x4f7f9e, SKY = 0x8fcbe2;
const ORANGE = 0xff7a2a, RED = 0xd8423a, BEACON = 0xff4a3a, PADLIGHT = 0xffc24a, GO = 0x6aff9a;
const SILVER = [0xd3deea, 0xc5d2e2], ICE = 0xa9c6e6, CYAN = 0x35e0ff;
const RUST = [0xb8562f, 0xa94b29, 0xc5653a], TERRA = [0xd58a5e, 0xc97c52], MARS = [0xb4502c, 0xa24424, 0xc46238, 0x93401f];

interface BandO { glass?: number; lit?: number; light?: number; seg?: number; gap?: number; m?: number; wh?: number; sill?: number; side?: Face }
/** Window bands on the two visible faces; the lit share varies per floor so lights cluster. */
function bands(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z0: number, floors: number, fh: number, o: BandO = {}): void {
  const lit = o.lit ?? 0.38, seg = o.seg ?? 2, gap = o.gap ?? 1, m = o.m ?? 1, wh = o.wh ?? fh - 1, sill = o.sill ?? 1, g = o.glass ?? WIN;
  for (let f = 0; f < floors; f++) {
    const zb = z0 + f * fh + sill, k = pick(r, [0.4, 1, 1, 1.6]);
    const cell = () => C(g, SMOOTH | (r() < lit * k ? o.light ?? WARM : 0));
    if (o.side !== 'R') for (let a = x0 + m; a < x1 - m; a += seg + gap) onL(v, y1 - 1, a, Math.min(a + seg, x1 - m), zb, zb + wh, cell());
    if (o.side !== 'L') for (let b = y0 + m; b < y1 - m; b += seg + gap) onR(v, x1 - 1, b, Math.min(b + seg, y1 - m), zb, zb + wh, cell());
  }
}
function parapet(v: Vox, x0: number, y0: number, x1: number, y1: number, z: number, c: Col, floor = 0xdcdad3): void {
  v.box(x0, y0, z, x1, y1, z + 1, c); v.box(x0 + 1, y0 + 1, z, x1 - 1, y1 - 1, z + 1, 0);
  v.box(x0 + 1, y0 + 1, z - 1, x1 - 1, y1 - 1, z, C(floor));
}
function mast(v: Vox, x: number, y: number, z: number, h: number, tip = BEACON, col = STEEL): void {
  v.box(x, y, z, x + 1, y + 1, z + h, C(col)); v.set(x, y, z + h, C(tip, EMIT));
}
function treeAt(v: Vox, x: number, y: number, z: number, rad = 2.2, s = 1, pal: number[] = GREEN): void {
  const th = 2 + Math.floor(rad / 2);
  v.box(x, y, z, x + 1, y + 1, z + th, C(0x6a4a30));
  ball(v, x + 0.5, y + 0.5, z + th + rad * 0.7, rad, rad * 0.85, (X, Y, Z) => C(pal[Math.min(pal.length - 1, 1 + Math.floor(hash(X, Y, Z, s) * 3.4))], ROUGH));
}
function hedge(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z: number, p = 0.85): void {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) if (r() < p) {
      v.set(x, y, z, C(GREEN[irand(r, 1, 3)], ROUGH));
      if (r() < 0.22) v.set(x, y, z + 1, C(GREEN[irand(r, 2, 4)], ROUGH));
    }
}
/** Greenery hanging down the two visible faces from a top edge. */
function vines(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z1: number, maxLen: number, dens = 0.5): void {
  for (let a = x0; a < x1; a++) if (r() < dens) for (let k = irand(r, 1, maxLen); k > 0; k--) v.set(a, y1 - 1, z1 - k, C(GREEN[irand(r, 1, 3)], ROUGH));
  for (let b = y0; b < y1; b++) if (r() < dens) for (let k = irand(r, 1, maxLen); k > 0; k--) v.set(x1 - 1, b, z1 - k, C(GREEN[irand(r, 1, 3)], ROUGH));
}
/** Planted roof terrace with a low parapet. */
function garden(v: Vox, r: R, x0: number, y0: number, x1: number, y1: number, z: number, wall: Col, trees = 1): void {
  parapet(v, x0, y0, x1, y1, z, wall, 0x8a7a5a);
  hedge(v, r, x0 + 1, y0 + 1, x1 - 1, y1 - 1, z, 0.75);
  for (let i = 0; i < trees; i++) treeAt(v, irand(r, x0 + 1, x1 - 3), irand(r, y0 + 1, y1 - 3), z, 1.5 + r() * 0.6, i + 3);
}
/** Ring of self-lit points. */
function lights(v: Vox, cx: number, cy: number, z: number, rad: number, n: number, col: number, ph = 0.4): void {
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + ph; v.set(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, z, C(col, EMIT)); }
}
/** Square prism with chamfered corners. */
function oct(v: Vox, cx: number, cy: number, hw: number, ch: number, z0: number, z1: number, c: Col): void {
  for (let y = Math.floor(cy - hw); y <= Math.ceil(cy + hw); y++)
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      const dx = Math.abs(x + 0.5 - cx), dy = Math.abs(y + 0.5 - cy);
      if (dx <= hw && dy <= hw && dx + dy <= 2 * hw - ch) for (let z = z0; z < z1; z++) v.set(x, y, z, res(c, x, y, z));
    }
}
/** Concrete apron with a planted border along the two back edges. */
function apron(v: Vox, r: R, S: number, cols = CONC, green = true): void {
  v.box(0, 0, 0, S, S, 1, mixc(cols, 0, 5));
  if (green) { hedge(v, r, 0, 0, S, 1, 1, 0.8); hedge(v, r, 0, 1, 1, S, 1, 0.8); }
}
/** Round landing deck with an edge stripe and a few lights. */
function padDisc(v: Vox, cx: number, cy: number, z: number, rad: number, light = PADLIGHT, deck = 0xc9ccd2, n = 4): void {
  cyl(v, cx, cy, rad, z, z + 1, (x, y) => { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); return C(d > rad - 1 ? WHITE[0] : deck); });
  lights(v, cx, cy, z, rad - 0.5, n, light);
}

// ---- space hardware --------------------------------------------------------------
/** A standing rocket in the same livery as the one the engine launches. Returns the tip height. */
function rocketAt(v: Vox, cx: number, cy: number, z0: number, L = 19, rad = 1.7, stripe = ORANGE): number {
  const o = Math.ceil(rad), fh = Math.round(rad * 3.5), nh = Math.round(rad * 3);
  cyl(v, cx, cy, rad * 0.66, z0, z0 + 3, C(DARK));
  for (const [x, y] of [[cx - o - 1, cy], [cx + o, cy], [cx, cy - o - 1], [cx, cy + o]]) v.box(x, y, z0, x + 1, y + 1, z0 + fh, C(RED));
  cyl(v, cx, cy, rad, z0 + 3, z0 + 3 + L, (_x, _y, z) => { const k = z - z0; return C(k % 7 === 0 ? 0x2a2f3a : k > 3 + L * 0.66 && k < 3 + L * 0.86 ? stripe : HULL); });
  for (let k = 0; k < nh; k++) cyl(v, cx, cy, Math.max(0.6, rad * (1 - k / nh)), z0 + 3 + L + k, z0 + 4 + L + k, C(k < nh * 0.6 ? HULL : RED));
  v.set(cx, cy + o - 1, z0 + 3 + Math.round(L * 0.48), C(0x1a2436, SMOOTH | COOL));
  return z0 + 3 + L + nh;
}
/** Candy-striped lattice service tower, 3x3 voxels. */
function gantry(v: Vox, x: number, y: number, z0: number, h: number, a = ORANGE, b = 0xeceef0): void {
  for (let k = 0; k < h; k++) {
    const z = z0 + k, c = C(k % 12 < 6 ? a : b);
    for (const [dx, dy] of [[0, 0], [2, 0], [0, 2], [2, 2]]) v.set(x + dx, y + dy, z, c);
    if (k % 6 === 5) v.box(x, y, z, x + 3, y + 3, z + 1, C(0x8a94a0));
    else if (k % 6 === 2) { v.set(x + 1, y + 2, z, c); v.set(x + 2, y + 1, z, c); }
  }
  v.box(x, y, z0 + h, x + 3, y + 3, z0 + h + 1, C(0x8a94a0));
  mast(v, x + 1, y + 1, z0 + h + 1, 4);
}
/** Parabolic dish with its vertex at (cx, cy, cz); the bowl opens along (ax, ay, az), toward the viewer when ax, ay > 0. */
function dish(v: Vox, cx: number, cy: number, cz: number, R0: number, ax = 0.5, ay = 0.5, az = 0.72, col = WHITE[0], feed = BEACON): void {
  const n = Math.hypot(ax, ay, az); ax /= n; ay /= n; az /= n;
  const f = R0 * 0.62, E = Math.ceil(R0) + 1;
  for (let z = Math.floor(cz - E); z <= cz + E; z++)
    for (let y = Math.floor(cy - E); y <= cy + E; y++)
      for (let x = Math.floor(cx - E); x <= cx + E; x++) {
        const px = x + 0.5 - cx, py = y + 0.5 - cy, pz = z + 0.5 - cz;
        const t = px * ax + py * ay + pz * az, q = px * px + py * py + pz * pz - t * t;
        if (q > R0 * R0) continue;
        const d = t - q / (4 * f);
        if (d < -0.75 || d > 0.75) continue;
        v.set(x, y, z, C(q > (R0 - 1.1) * (R0 - 1.1) ? col : d < -0.1 ? shade(col, -0.2) : lerpc(0xc9d3de, 0xe4e9ee, Math.sqrt(q) / R0)));
      }
  for (let t = 1; t < f; t += 0.5) v.set(cx + ax * t, cy + ay * t, cz + az * t, C(STEEL));
  v.set(cx + ax * f, cy + ay * f, cz + az * f, C(feed, EMIT));
}
/** Dish on a pedestal: `h` is the pedestal height. */
function dishOn(v: Vox, x: number, y: number, z: number, h: number, R0: number, ax = 0.5, ay = 0.5, az = 0.72, col = WHITE[0]): void {
  const w = R0 > 4.5 ? 2 : 1;
  v.box(x, y, z, x + w, y + w, z + h, C(STEEL));
  if (R0 > 3) v.box(x - 1, y - 1, z, x + w + 1, y + w + 1, z + 2, C(0xdcdad3));
  dish(v, x + w / 2, y + w / 2, z + h + 0.5, R0, ax, ay, az, col);
}
/** Parked shuttle: white wedge on skids with swept wings, a glass canopy and a glowing engine at the tail. `dir` is where the nose points. */
function shuttle(v: Vox, x: number, y: number, z: number, dir: 'x' | 'y', L = 8, glow = CYAN, acc = 0x7fa6d6): void {
  const b = (a0: number, c0: number, z0: number, a1: number, c1: number, z1: number, col: Col) =>
    (dir === 'x' ? v.box(x + a0, y + c0, z + z0, x + a1, y + c1, z + z1, col) : v.box(x + c0, y + a0, z + z0, x + c1, y + a1, z + z1, col));
  const w = Math.round(L * 0.5);
  b(2, 2, 0, 3, 4, 1, C(DARK)); b(L - 3, 2, 0, L - 2, 4, 1, C(DARK));
  b(1, 0, 1, w, 6, 2, C(0xb7c4d4)); b(w, 1, 1, w + 1, 5, 2, C(0xb7c4d4)); b(1, 0, 1, 2, 6, 2, C(acc));
  b(0, 2, 1, L, 4, 3, C(HULL)); b(L - 1, 2, 2, L, 4, 3, 0);
  b(L - 4, 2, 3, L - 2, 4, 4, C(0x3c9cc4, SMOOTH | COOL));
  b(0, 2, 3, 2, 4, 4, C(acc)); b(0, 2, 4, 1, 4, 5, C(acc));
  b(0, 2, 1, 1, 4, 3, C(glow, EMIT));
}
/** Parked quadcopter, 4x4 voxels. */
function drone(v: Vox, x: number, y: number, z: number, parcel?: number): void {
  let zz = z;
  if (parcel != null) { v.box(x + 1, y + 1, z, x + 3, y + 3, z + 1, C(parcel)); zz++; }
  v.box(x + 1, y + 1, zz, x + 3, y + 3, zz + 1, C(HULL));
  for (const [dx, dy] of [[0, 0], [3, 0], [0, 3], [3, 3]]) v.set(x + dx, y + dy, zz + 1, C(0x5a6070));
  v.set(x + 2, y + 2, zz + 1, C(GO, EMIT));
}
/** Storage sphere on legs with an equator band. */
function sphere(v: Vox, cx: number, cy: number, z: number, rad: number, band = ORANGE, col = WHITE[0]): void {
  const cz = z + 2 + rad;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) v.box(Math.floor(cx + dx * rad * 0.6), Math.floor(cy + dy * rad * 0.6), z, Math.floor(cx + dx * rad * 0.6) + 1, Math.floor(cy + dy * rad * 0.6) + 1, Math.floor(cz), C(STEEL));
  ball(v, cx, cy, cz, rad, rad, (_x, _y, zz) => C(zz === Math.floor(cz) ? band : zz > cz ? col : shade(col, -0.05), SMOOTH));
}
/** Ribbed cargo container, 3 wide and 3 high, white with a coloured end band. */
function crate(v: Vox, x0: number, y0: number, z: number, along: 'x' | 'y', len: number, band: number, col = HULL): void {
  const x1 = x0 + (along === 'x' ? len : 3), y1 = y0 + (along === 'x' ? 3 : len), dk = shade(col, -0.08);
  v.box(x0, y0, z, x1, y1, z + 3, (x, y, zz) => { const a = along === 'x' ? x - x0 : y - y0; return C(a === len - 1 || a === 1 ? band : zz === z + 2 ? col : a & 1 ? col : dk); });
}
/** Glass dome that shows its contents: a glazed far half, and only ribs and a few glints on the near half. */
function dome(v: Vox, cx: number, cy: number, z: number, rad: number, rz: number, frame = WHITE[0], pane = SKY, dens = 0.12, s = 0): void {
  for (let zz = z; zz <= z + rz + 1; zz++)
    for (let y = Math.floor(cy - rad); y <= cy + rad; y++)
      for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
        const dx = (x + 0.5 - cx) / rad, dy = (y + 0.5 - cy) / rad, dz = (zz + 0.5 - z) / rz, d = dx * dx + dy * dy + dz * dz;
        const ix = (x + 0.5 - cx) / (rad - 1.05), iy = (y + 0.5 - cy) / (rad - 1.05), iz = (zz + 0.5 - z) / (rz - 1.05);
        if (d > 1 || ix * ix + iy * iy + iz * iz < 1) continue;
        const ax = Math.abs(x + 0.5 - cx), ay = Math.abs(y + 0.5 - cy);
        const rib = rad > 5 ? ax < 0.6 || ay < 0.6 || Math.abs(ax - ay) < 0.7 || zz === z + Math.round(rz * 0.5) : ax < 1.1 && ay < 1.1;
        const back = x + y + 1 < cx + cy; // the far half is a solid glass backdrop, the near half only ribs and glints
        if (rib) v.set(x, y, zz, C(back ? shade(frame, -0.08) : frame));
        else if (back || hash(x, y, zz, s) < dens) v.set(x, y, zz, C(back ? shade(pane, -0.06) : pane, SMOOTH));
      }
}

// ================================ EPOCH 12: Spaceport City ======================
/** Launch mount: raised concrete table with a flame trench opening toward +x. Returns the deck height. */
function launchTable(v: Vox, cx: number, cy: number, x0: number, y0: number, x1: number, y1: number): number {
  const zt = 4;
  v.box(x0, y0, 1, x1, y1, zt, mixc(CONC, 0, 2));
  faces(v, x0, y0, x1, y1, zt - 1, zt, (x, y) => C((x + y) & 1 ? 0xf0b030 : 0x3a3c42)); // hazard edge
  v.box(cx + 2, cy - 2, 1, x1, cy + 2, zt, 0); // trench mouth
  v.box(cx + 2, cy - 2, 0, x1 + 1, cy + 2, 1, (x, y) => C(hash(x, y, 3) < 0.4 ? 0x4a4440 : 0x5c5651));
  onR(v, cx + 1, cy - 2, cy + 2, 1, zt, C(0x34363c));
  for (let y = y0; y < y1; y++) for (let x = x0; x < Math.min(x1, cx + 2); x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d < 3.6 && d > 2.6) v.set(x, y, zt - 1, C(0x5a5e68)); else if (d <= 2.6) v.set(x, y, zt - 1, C(hash(x, y, 9) < 0.5 ? 0x77726c : 0x8a857e));
  }
  lights(v, cx, cy, zt - 1, 3.1, 4, PADLIGHT, 0.8);
  return zt;
}
function waterTower(v: Vox, x: number, y: number, z: number, h: number): void {
  for (const [dx, dy] of [[0, 0], [3, 0], [0, 3], [3, 3]]) v.box(x + dx, y + dy, z, x + dx + 1, y + dy + 1, z + h, C(STEEL));
  for (let k = 3; k < h; k += 4) { v.box(x, y + 3, z + k, x + 4, y + 4, z + k + 1, C(STEEL)); v.box(x + 3, y, z + k, x + 4, y + 4, z + k + 1, C(STEEL)); }
  cyl(v, x + 2, y + 2, 3, z + h, z + h + 5, (_x, _y, zz) => C(zz === z + h + 2 ? ORANGE : WHITE[0], SMOOTH));
  cyl(v, x + 2, y + 2, 2, z + h + 5, z + h + 6, C(WHITE[1]));
}

export const x12: Extras = {
  small: [
    (r, lvl) => { // spaceport control tower
      const v = new Vox(T, T, 44);
      const H = 12 + lvl * 7 + irand(r, 0, 2);
      v.box(1, 1, 0, 7, 6, 3, mixc(WHITE)); bands(v, r, 1, 1, 7, 6, 0, 1, 3, { wh: 1, sill: 1 }); hedge(v, r, 1, 1, 7, 6, 3, 0.7);
      cyl(v, 4, 4, 1.5, 0, H, (_x, _y, z) => C(z % 6 === 5 ? WHITE[1] : WHITE[0]));
      cyl(v, 4, 4, 2.4, H, H + 1, C(ORANGE)); cyl(v, 4, 4, 3.3, H + 1, H + 2, C(WHITE[0]));
      cyl(v, 4, 4, 3.3, H + 2, H + 4, (x, y) => C(SKY, SMOOTH | ((x * 3 + y) % 4 === 0 ? COOL : (x + y) % 3 === 0 ? WARM : 0)));
      cyl(v, 4, 4, 3.6, H + 4, H + 5, C(WHITE[0])); cyl(v, 4, 4, 2, H + 5, H + 6, C(WHITE[1]));
      mast(v, 4, 4, H + 6, 4 + lvl); v.set(2, 3, H + 6, C(STEEL)); v.set(2, 3, H + 7, C(WHITE[0]));
      return v;
    },
    (r, lvl) => { // house with a rooftop drone port
      const v = new Vox(T, T, 30);
      const wall = pick(r, [WHITE, CREAM, TIMBER]), fl = 1 + lvl, H = fl * 4;
      v.box(1, 1, 0, 7, 7, H, mixc(wall));
      bands(v, r, 1, 1, 7, 7, 0, fl, 4, { wh: 2, sill: 1, seg: 1, gap: 1, lit: 0.45 });
      onL(v, 6, 3, 5, 0, 3, C(0x8a5a3a));
      faces(v, 1, 1, 7, 7, H - 1, H, C(wall === TIMBER ? WHITE[0] : TIMBER[0]));
      vines(v, r, 1, 1, 7, 7, H - 1, 3, 0.35);
      v.box(3, 3, H, 5, 5, H + 2, C(STEEL));
      padDisc(v, 4, 4, H + 2, 3.9, PADLIGHT, 0xc9ccd2, 3);
      faces(v, 0, 0, 8, 8, H + 2, H + 3, 0); cyl(v, 4, 4, 3.9, H + 2, H + 3, (x, y) => { const d = Math.hypot(x + 0.5 - 4, y + 0.5 - 4); return C(d > 3.3 ? ORANGE : d > 2.5 ? WHITE[0] : 0xc9ccd2); });
      lights(v, 4, 4, H + 2, 3.4, 3, PADLIGHT, r() * 6);
      if (r() < 0.75) drone(v, 2, 2, H + 3, r() < 0.5 ? pick(r, [0xc8a070, ORANGE]) : undefined);
      return v;
    },
    (r, lvl) => { // sounding-rocket workshop
      const v = new Vox(T, T, 34);
      const wall = pick(r, [WHITE, CREAM]), h = 5 + lvl;
      v.box(1, 1, 0, 7, 5, h, mixc(wall));
      for (let k = 0; k < 2; k++) v.box(1, 1 + k, h + k, 7, 5 - k, h + k + 1, C(k ? 0x8fb86a : TIMBER[1], k ? ROUGH : 0));
      onL(v, 4, 2, 4, 0, 4, C(TIMBER[0])); onL(v, 4, 5, 6, 2, 4, C(WIN, SMOOTH | (r() < 0.5 ? WARM : 0)));
      onR(v, 6, 2, 4, 2, 4, C(WIN, SMOOTH | (r() < 0.5 ? WARM : 0)));
      v.box(4, 5, 0, 8, 8, 1, C(CONC[0]));
      const L = 8 + lvl * 4;
      v.box(5, 6, 1, 7, 8, 2, C(DARK));
      for (const [x, y] of [[4, 6], [7, 6], [5, 5]]) v.box(x, y, 1, x + 1, y + 1, 4, C(RED));
      cyl(v, 6, 7, 1.2, 2, 2 + L, (_x, _y, z) => C(z % 6 === 0 ? 0x2a2f3a : z > L - 2 && z < L + 1 ? ORANGE : HULL));
      v.set(5, 6, 2 + L, C(HULL)); v.set(5, 6, 3 + L, C(RED));
      for (let z = 1; z < L; z++) v.set(3, 7, z, C(z % 4 < 2 ? ORANGE : 0xeceef0));
      v.set(4, 7, L - 2, C(STEEL)); v.set(3, 7, L, C(BEACON, EMIT));
      return v;
    },
  ],
  large: [
    (r, lvl) => { // tracking-dish station
      const v = new Vox(16, 16, 60);
      apron(v, r, 16, [0xd8d6cf, 0xcfcdc6]);
      const R0 = 5.6 + lvl * 0.9, ph = 9 + lvl * 5;
      oct(v, 7, 7, 3.5, 2, 1, 4, mixc(WHITE)); faces(v, 4, 4, 11, 11, 2, 3, C(ORANGE));
      cyl(v, 7, 7, 2, 4, ph, (_x, _y, z) => C(z % 5 === 4 ? WHITE[1] : WHITE[0]));
      cyl(v, 7, 7, 2.6, ph, ph + 1, C(STEEL));
      dish(v, 7.5, 7.5, ph + 2.5, R0, 0.5, 0.5, 0.78 - lvl * 0.06);
      v.box(10, 11, 1, 15, 15, 5 + lvl, mixc(pick(r, [WHITE, CREAM]), 0, 3));
      bands(v, r, 10, 11, 15, 15, 1, 1, 4, { wh: 2, sill: 1, light: COOL, lit: 0.5 });
      garden(v, r, 10, 11, 15, 15, 5 + lvl, C(WHITE[1]), 0);
      if (lvl > 0) dishOn(v, 2, 12, 1, 4, 2.6, 0.3, 0.6, 0.7);
      treeAt(v, 13, 3, 1, 2, 2); if (lvl < 2) treeAt(v, 2, 13 - lvl * 9, 1, 1.8, 5);
      mast(v, 14, 9, 1, 8 + lvl * 3);
      return v;
    },
    (r, lvl) => { // fuel sphere farm
      const v = new Vox(16, 16, 60);
      apron(v, r, 16);
      const band = pick(r, [ORANGE, ORANGE, 0xf0b030]);
      const spots: [number, number][] = [[4, 4], [12, 4], [4, 12]];
      spots.forEach(([x, y], i) => {
        if (lvl === 2 && i === 0) { // cryogenic columns
          for (const [dx, dy, hh] of [[-1, -1, 34], [3, -1, 28], [-1, 3, 24]]) {
            cyl(v, x + dx, y + dy, 1.6, 1, hh, (_x, _y, z) => C(z % 8 === 7 ? STEEL : z > hh - 4 ? band : WHITE[0], SMOOTH));
            ball(v, x + dx, y + dy, hh, 1.6, 1.4, C(WHITE[1], SMOOTH));
          }
        } else sphere(v, x, y, 1, 3.5, band);
      });
      for (let x = 4; x < 13; x++) v.set(x, 8, 1, C(x % 4 === 0 ? 0xf0b030 : STEEL)); // pipe run
      for (let y = 5; y < 13; y++) v.set(8, y, 1, C(y % 4 === 0 ? 0xf0b030 : STEEL));
      v.box(10, 10, 1, 15, 15, 5, mixc(WHITE)); bands(v, r, 10, 10, 15, 15, 1, 1, 4, { wh: 2, sill: 1, lit: 0.4 });
      faces(v, 10, 10, 15, 15, 4, 5, C(band)); garden(v, r, 10, 10, 15, 15, 5, C(WHITE[1]), 0);
      const vh = 10 + lvl * 6;
      v.box(8, 2, 1, 9, 3, vh, C(STEEL)); v.set(8, 2, vh, C(WHITE[0])); v.emit(8.5, 2.5, vh + 1, 'smoke');
      treeAt(v, 1, 14, 1, 1.6, 4);
      return v;
    },
    (r, lvl) => { // drone delivery hub: a stack of landing ports around a sorting core
      const v = new Vox(16, 16, 96);
      const wall = pick(r, [WHITE, CREAM]), n = 3 + lvl * 2, H = 10 + n * 8;
      apron(v, r, 16, [0xd8d6cf, 0xcfcdc6], false);
      v.box(2, 2, 1, 14, 12, 8, mixc(wall)); // depot
      bands(v, r, 2, 2, 14, 12, 1, 2, 3, { wh: 2, sill: 1, lit: 0.4 });
      onL(v, 11, 4, 12, 1, 4, (x) => C(x % 3 === 0 ? WHITE[1] : 0x6a7684)); onL(v, 11, 3, 13, 4, 5, C(ORANGE));
      for (let x = 3; x < 13; x++) v.set(x, 12, 4, C(x & 1 ? ORANGE : WHITE[0])); // awning
      garden(v, r, 2, 2, 14, 12, 8, C(wall[1]), 1);
      v.box(4, 3, 8, 10, 9, H, mixc(wall, 0, 2)); // core
      bands(v, r, 4, 3, 10, 9, 9, Math.floor((H - 10) / 4), 4, { wh: 2, sill: 1, seg: 1, gap: 1, lit: 0.3, light: COOL });
      for (let z = 8; z < H; z++) v.set(9, 8, z, C(z % 8 < 4 ? ORANGE : WHITE[0]));
      for (let i = 0; i < n; i++) { // cantilevered ports, alternating sides
        const z = 14 + i * 8, side = i % 2;
        const cx = side ? 7 : 12.5, cy = side ? 11.5 : 6;
        if (side) v.box(6, 9, z - 1, 8, 11, z, C(STEEL)); else v.box(10, 5, z - 1, 12, 7, z, C(STEEL));
        cyl(v, cx, cy, 3, z - 1, z, C(ORANGE)); padDisc(v, cx, cy, z, 3, PADLIGHT, 0xc9ccd2, 3);
        if (r() < 0.75) drone(v, Math.floor(cx - 2), Math.floor(cy - 2), z + 1, r() < 0.6 ? pick(r, [0xc8a070, ORANGE, 0xe8dcc0]) : undefined);
      }
      parapet(v, 4, 3, 10, 9, H, C(wall[1])); padDisc(v, 7, 6, H, 2.6, GO, 0xc9ccd2, 3); mast(v, 4, 3, H + 1, 7);
      vines(v, r, 4, 3, 10, 9, H, 5, 0.4);
      for (const [x, y] of [[1, 13], [5, 13], [10, 13]]) v.box(x, y, 1, x + 2, y + 2, 2 + (x & 1), C(pick(r, [0xc8a070, 0xb89060, ORANGE])));
      treeAt(v, 14, 13, 1, 1.6, 6);
      return v;
    },
    (r, lvl) => { // space museum with a rocket on display
      const v = new Vox(16, 16, 64);
      apron(v, r, 16, [0xdedcd4, 0xd5d3cb], false);
      const fl = 2 + lvl, H = 1 + fl * 4, wall = pick(r, [WHITE, CREAM]);
      v.box(1, 1, 1, 15, 9, H, mixc(wall));
      onL(v, 8, 2, 14, 1, H - 1, (x, _y, z) => C(x % 4 === 1 || z % 4 === 0 ? WHITE[0] : SKY, SMOOTH | (x % 4 !== 1 && z % 4 !== 0 && hash(x >> 2, z >> 2, 5) < 0.4 ? WARM : 0)));
      bands(v, r, 1, 1, 15, 9, 1, fl, 4, { wh: 2, sill: 1, side: 'R', lit: 0.4 });
      for (let k = 0; k < 3; k++) v.box(1 + k, 1, H + k, 15 - k, 9, H + k + 1, k < 2 ? mixc(wall, 0, k) : C(0x9cc070, ROUGH)); // stepped vault
      onL(v, 8, 3, 13, H, H + 2, C(SKY, SMOOTH)); onL(v, 8, 6, 10, H - 1, H + 1, C(ORANGE));
      onL(v, 8, 7, 9, 1, 4, C(0x34485a, SMOOTH | WARM));
      vines(v, r, 1, 1, 15, 9, H, 3, 0.3);
      v.box(2, 10, 1, 7, 15, 2, C(0xb8b6ae)); // plinth
      rocketAt(v, 4, 12, 2, 19 + lvl * 4, lvl === 2 ? 2.3 : 1.7);
      // a capsule and a satellite on stands
      v.box(11, 12, 1, 12, 13, 3, C(STEEL)); ball(v, 11.5, 12.5, 4.5, 1.8, 1.6, (_x, _y, z) => C(z > 4 ? HULL : 0x6a4a3a));
      v.box(9, 14, 1, 10, 15, 4, C(STEEL)); v.box(8, 14, 4, 11, 15, 5, (x) => C(x === 9 ? 0xe8c860 : 0x2c4f82, SMOOTH));
      treeAt(v, 13, 13, 1, 1.7, 7); hedge(v, r, 7, 10, 15, 11, 1, 0.7);
      return v;
    },
  ],
  huge: [
    (r, lvl) => { // launch complex: an active pad and the next rocket waiting in its gantry
      const v = new Vox(24, 24, 84);
      apron(v, r, 24);
      for (let k = 0; k < 24; k++) for (const d of [-1, 0, 1]) { // crawlerways
        if (k > 12) { v.set(17 + d, k, 0, C(0xb4a890)); v.set(k, 17 + d, 0, C(0xb4a890)); }
      }
      // active pad (right): the engine's rocket stands here
      const zt = launchTable(v, 17, 8, 12, 3, 23, 13);
      gantry(v, 12, 7, zt, 30 + lvl * 2);
      for (const zz of [zt + 11, zt + 21]) v.box(14, 8, zz, 16, 9, zz + 1, C(STEEL));
      v.emit(17, 8, zt, 'launch'); v.emit(22, 8, 2, 'smoke');
      // waiting pad (left)
      v.box(3, 12, 1, 12, 22, 3, mixc(CONC, 0, 4)); faces(v, 3, 12, 12, 22, 2, 3, (x, y) => C((x + y) & 1 ? 0xf0b030 : 0x3a3c42));
      gantry(v, 6, 12, 3, 32 + lvl * 3);
      rocketAt(v, 7, 17, 3, 19 + (lvl > 1 ? 4 : 0), lvl > 1 ? 2.3 : 1.7);
      for (const zz of [14, 24]) v.box(7, 14, zz, 8, 16, zz + 1, C(STEEL));
      lights(v, 7, 17, 2, 4.2, 4, PADLIGHT, 0.2);
      // support: water tower, propellant spheres, blockhouse
      waterTower(v, 2, 2, 1, 16 + lvl * 4);
      sphere(v, 10, 4, 1, 2.5); sphere(v, 3, 10, 1, 2.5, 0xf0b030);
      v.box(17, 17, 1, 23, 23, 6, mixc(WHITE)); bands(v, r, 17, 17, 23, 23, 1, 1, 5, { wh: 2, sill: 2, light: COOL, lit: 0.6 });
      faces(v, 17, 17, 23, 23, 5, 6, C(ORANGE)); garden(v, r, 17, 17, 23, 23, 6, C(WHITE[1]), 1);
      for (const [x, y] of [[23, 1], [1, 23]]) mast(v, x, y, 1, 40 + lvl * 4, BEACON, 0xc4cad2);
      return v;
    },
    (r, lvl) => { // vehicle assembly hall with a heavy rocket rolling out
      const v = new Vox(24, 24, 120);
      apron(v, r, 24, CONC, false);
      const H = 62 + lvl * 16, wall = mixc(WHITE, 0, 1);
      v.box(1, 1, 1, 19, 15, H, wall);
      // panel seams and a painted stripe
      for (let z = 9; z < H; z += 8) faces(v, 1, 1, 19, 15, z, z + 1, C(0xdddcd6));
      for (const x of [2, 3, 14, 15, 16]) onL(v, 14, x, x + 1, 9, H - 2, (_x, _y, z) => C(x === 3 || x === 15 ? (z % 8 === 4 ? 0x5a8fb0 : 0xcfd6dc) : 0xe1e0da, x === 3 || x === 15 ? SMOOTH : 0));
      onR(v, 18, 9, 13, 8, H - 4, (_x, _y, z) => C(z > H - 20 ? ORANGE : 0xe2e1db));
      onR(v, 18, 3, 7, 8, H - 4, (_x, y, z) => C(z % 8 === 1 ? 0xcfd3d8 : y === 4 || y === 5 ? 0xd9dde2 : 0xe2e5e9)); // closed door
      // open door with the bay lights inside
      const dz = H - 8;
      v.box(5, 12, 1, 12, 15, dz, 0);
      v.box(5, 11, 1, 12, 12, dz, (x, _y, z) => C(z % 9 === 4 && x % 2 === 0 ? 0x4a6a80 : 0x2c3640, z % 9 === 4 && x % 2 === 0 ? SMOOTH | WARM : 0));
      v.box(5, 12, 0, 12, 15, 1, C(0xa8a49c));
      for (let z = 1; z < dz; z += 6) { v.set(5, 13, z, C(ORANGE)); v.set(11, 13, z, C(ORANGE)); }
      onL(v, 14, 4, 13, dz, dz + 2, C(ORANGE));
      bands(v, r, 1, 1, 19, 15, 1, 2, 3, { wh: 1, sill: 1, side: 'R', lit: 0.5 });
      // roof
      parapet(v, 1, 1, 19, 15, H, C(WHITE[1])); v.box(3, 3, H, 8, 8, H + 3, C(0xdcdad3)); hedge(v, r, 9, 2, 18, 9, H, 0.8);
      dishOn(v, 14, 11, H, 3, 2.8); mast(v, 4, 4, H + 3, 10);
      // crawler with the rocket and its umbilical tower
      const L = 26 + lvl * 6;
      v.box(4, 16, 0, 13, 23, 1, C(0xb4a890));
      v.box(5, 17, 1, 12, 22, 4, (x, y, z) => C(z === 1 ? (x + y) & 1 ? 0x3a3c42 : 0x55585f : z === 3 ? 0x9aa0a8 : 0x7c838c));
      rocketAt(v, 9, 20, 4, L, 2.3);
      for (const [bx, by] of [[6, 20], [12, 20]]) { cyl(v, bx, by, 1.2, 4, 4 + Math.round(L * 0.5), C(shade(HULL, -0.04))); v.set(bx - 1, by - 1, 4 + Math.round(L * 0.5), C(RED)); v.set(bx, by, 4 + Math.round(L * 0.5), C(RED)); }
      gantry(v, 5, 17, 4, L + 2);
      // low annex with a planted roof
      v.box(19, 4, 1, 23, 14, 8, mixc(CREAM)); bands(v, r, 19, 4, 23, 14, 1, 2, 3, { wh: 2, sill: 1, lit: 0.4 }); garden(v, r, 19, 4, 23, 14, 8, C(CREAM[1]), 1);
      vines(v, r, 1, 1, 19, 15, H, 7, 0.25);
      treeAt(v, 20, 18, 1, 2.2, 3); treeAt(v, 16, 20, 1, 1.8, 4); treeAt(v, 21, 21, 1, 1.6, 5);
      return v;
    },
  ],
  fill: [
    (r) => { // parcel drone locker
      const v = new Vox(T, T, 12);
      v.box(1, 2, 0, 7, 5, 5, C(WHITE[0]));
      for (let x = 1; x < 7; x++) for (let z = 1; z < 4; z++) v.set(x, 4, z, C(x % 2 ? (hash(x, z, 4) < 0.3 ? ORANGE : 0xdfe3e8) : 0xc8ccd2));
      v.box(1, 2, 5, 7, 5, 6, C(ORANGE)); v.set(6, 4, 4, C(GO, EMIT));
      if (r() < 0.6) drone(v, 2, 2, 6, 0xc8a070); else v.box(2, 5, 0, 4, 7, 2, C(0xc8a070));
      return v;
    },
    (r) => { // small dish
      const v = new Vox(T, T, 16);
      dishOn(v, 3, 3, 0, 3 + irand(r, 0, 2), 2.9, 0.4 + r() * 0.3, 0.6 - r() * 0.2, 0.7);
      v.box(6, 1, 0, 8, 3, 2, C(0xdcdad3)); v.set(6, 2, 2, C(ORANGE));
      return v;
    },
    (r) => { // weather mast
      const v = new Vox(T, T, 26);
      const h = 14 + irand(r, 0, 4);
      v.box(2, 2, 0, 5, 5, 1, C(CONC[0]));
      for (let z = 1; z < h; z++) v.set(3, 3, z, C(z % 6 < 3 ? ORANGE : 0xeceef0));
      v.box(2, 3, h - 3, 5, 4, h - 2, C(STEEL)); v.set(1, 3, h - 2, C(WHITE[0])); v.set(5, 3, h - 2, C(WHITE[0]));
      v.set(3, 3, h, C(BEACON, EMIT));
      v.box(5, 5, 0, 7, 7, 3, C(WHITE[0])); v.box(5, 5, 3, 7, 7, 4, C(WHITE[1])); onL(v, 6, 5, 7, 1, 2, C(0xb8bcc2));
      for (let k = 0; k < 4; k++) v.set(3 + k, 2, 6 + k, C(k === 3 ? ORANGE : 0xffffff)); // windsock
      return v;
    },
    (r) => { // viewing stand
      const v = new Vox(T, T, 12);
      const aw = pick(r, [ORANGE, 0xf0b030, WHITE[0]]);
      for (let k = 0; k < 3; k++) v.box(1, 1 + k * 2, 0, 7, 3 + k * 2, 3 - k, C(k & 1 ? 0xd8d6cf : 0xcac8c1));
      for (let x = 1; x < 7; x++) for (let k = 0; k < 3; k++) if (r() < 0.45) v.set(x, 1 + k * 2, 3 - k, C(pick(r, [0xd8423a, 0x2f6fb0, 0xf0e0c0, 0x4a9a6a, 0xe8c860])));
      for (const x of [1, 6]) v.box(x, 1, 3, x + 1, 2, 8, C(STEEL));
      v.box(0, 0, 8, 8, 4, 9, (x) => C(x & 1 ? aw : WHITE[0]));
      return v;
    },
  ],
  sec: [
    (r) => { // launch pad: an empty mount over its flame trench, the next rocket waiting in the gantry behind
      const v = new Vox(16, 16, 64);
      apron(v, r, 16);
      v.box(1, 2, 1, 8, 9, 2, mixc(CONC, 0, 4));
      gantry(v, 6, 1, 2, 34);
      rocketAt(v, 4, 5, 2);
      for (const zz of [13, 23]) v.box(5, 3, zz, 7, 4, zz + 1, C(STEEL));
      const zt = launchTable(v, 11, 12, 7, 8, 15, 16);
      v.emit(11, 12, zt, 'launch'); v.emit(15, 12, 2, 'smoke');
      sphere(v, 12, 4, 1, 2.5);
      mast(v, 15, 0, 1, 40, BEACON, 0xc4cad2); mast(v, 0, 15, 1, 40, BEACON, 0xc4cad2);
      v.box(1, 11, 1, 5, 15, 4, mixc(WHITE)); onL(v, 14, 2, 4, 2, 3, C(WIN, SMOOTH | COOL)); faces(v, 1, 11, 5, 15, 3, 4, C(ORANGE));
      return v;
    },
    (r) => { // mission control
      const v = new Vox(16, 16, 60);
      apron(v, r, 16, [0xdedcd4, 0xd5d3cb], false);
      v.box(1, 1, 1, 15, 15, 10, mixc(WHITE));
      bands(v, r, 1, 1, 15, 15, 1, 3, 3, { wh: 2, sill: 0, seg: 3, gap: 1, light: COOL, lit: 0.5 });
      onL(v, 14, 4, 12, 1, 8, (x, _y, z) => C(x % 4 === 3 || z === 4 ? WHITE[0] : 0x3f7fa6, SMOOTH | (hash(x >> 2, z >> 2, 3) < 0.7 ? COOL : 0))); // control room glazing
      faces(v, 1, 1, 15, 15, 9, 10, C(ORANGE));
      garden(v, r, 1, 1, 15, 15, 10, C(WHITE[1]), 0);
      v.box(2, 2, 10, 11, 10, 19, mixc(CREAM, 0, 2));
      bands(v, r, 2, 2, 11, 10, 10, 3, 3, { wh: 2, sill: 0, lit: 0.45 });
      faces(v, 2, 2, 11, 10, 18, 19, C(TIMBER[0]));
      parapet(v, 2, 2, 11, 10, 19, C(CREAM[1]));
      vines(v, r, 2, 2, 11, 10, 19, 4, 0.4); vines(v, r, 1, 1, 15, 15, 10, 3, 0.3);
      dishOn(v, 5, 5, 19, 8, 5.4, 0.25, 0.55, 0.8);
      dishOn(v, 12, 4, 10, 4, 3, 0.7, 0.1, 0.7); dishOn(v, 4, 12, 10, 3, 2.6, 0.1, 0.6, 0.8);
      mast(v, 2, 2, 19, 16); v.box(2, 2, 30, 3, 3, 31, C(ORANGE));
      treeAt(v, 12, 11, 10, 1.8, 2);
      return v;
    },
  ],
};

// ================================ EPOCH 13: Lunar Gateway =======================
const BLUE = 0x7fa6d6, DEEP = 0x56789f, PAVE13 = [0xdde2e8, 0xd3d9e0], DECK = 0x76839a;
/** Round tower segment with glazed floors. Returns the top height. */
function drum(v: Vox, cx: number, cy: number, rad: number, z0: number, floors: number, fh: number, wall: Col, o: { glass?: number; lit?: number; light?: number; s?: number } = {}): number {
  const g = o.glass ?? WIN, lit = o.lit ?? 0.38, s = o.s ?? 0;
  cyl(v, cx, cy, rad, z0, z0 + floors * fh, (x, y, z) => {
    if ((z - z0) % fh === fh - 1 || (x + y) % 3 === 0) return res(wall, x, y, z);
    return C(g, SMOOTH | (hash(x >> 1, y >> 1, Math.floor((z - z0) / fh), s) < lit ? o.light ?? WARM : 0));
  });
  return z0 + floors * fh;
}
/** Observatory dome with an open slit and the telescope looking out toward the viewer. */
function scopeDome(v: Vox, cx: number, cy: number, z: number, rad: number, col = SILVER): void {
  ball(v, cx, cy, z, rad, rad, (x, y, zz) => {
    if (zz < z) return 0;
    const across = Math.abs(x - y - (cx - cy) + 0.0), front = x + y + 1 - cx - cy;
    if (across < 1.2 && front > -rad * 0.5 && zz > z + 1) return C(0x27303e);
    return C(zz % 3 === 0 ? col[1] : col[0], SMOOTH);
  });
  const w = rad > 3.5 ? 2 : 1;
  for (let t = rad * 0.3; t < rad + 1.2; t += 0.5) { const x = Math.floor(cx - w / 2 + t * 0.42), y = Math.floor(cy - w / 2 + t * 0.42), zz = Math.floor(z + t * 0.8); v.box(x, y, zz, x + w, y + w, zz + w, C(t > rad + 0.4 ? 0x5a6a80 : HULL)); }
  cyl(v, cx, cy, rad + 0.4, z - 1, z, C(BLUE));
}

export const x13: Extras = {
  small: [
    (r, lvl) => { // astronomer's house with a rooftop dome
      const v = new Vox(T, T, 34);
      const wall = pick(r, [WHITE, CREAM, SILVER]), fl = 1 + lvl + irand(r, 0, 1), H = fl * 4;
      v.box(1, 1, 0, 7, 7, H, mixc(wall));
      bands(v, r, 1, 1, 7, 7, 0, fl, 4, { wh: 2, sill: 1, seg: 1, gap: 1, lit: 0.45 });
      onL(v, 6, 3, 5, 0, 3, C(0x6a86a8));
      faces(v, 1, 1, 7, 7, H - 1, H, C(BLUE)); parapet(v, 1, 1, 7, 7, H, C(wall[1]));
      vines(v, r, 1, 1, 7, 7, H, 3, 0.4);
      scopeDome(v, 3.5, 3.5, H + 1, 2.7); hedge(v, r, 5, 5, 7, 7, H, 0.9);
      return v;
    },
    (r, lvl) => { // crew capsule stack
      const v = new Vox(T, T, 44);
      const n = 2 + lvl * 2 + irand(r, 0, 1), s = irand(r, 0, 99), band = pick(r, [BLUE, ICE, DEEP]);
      cyl(v, 4, 4, 3, 0, 1, C(PAVE13[1]));
      let z = 1;
      for (let i = 0; i < n; i++) {
        const dx = hash(i, s) < 0.5 ? 0 : 1, dy = hash(i, s, 1) < 0.5 ? 0 : 1, cx = 3.5 + dx, cy = 3.5 + dy;
        cyl(v, cx, cy, 2, z, z + 1, C(STEEL));
        cyl(v, cx, cy, 3.2, z + 1, z + 4, (x, y, zz) => (zz === z + 2 && (x + y) % 2 === 0 ? C(0x44688a, SMOOTH | (hash(x, y, i, s) < 0.45 ? (hash(x, i, s) < 0.5 ? COOL : WARM) : 0)) : C(zz === z + 3 ? WHITE[0] : zz === z + 1 ? band : SILVER[0])));
        if (hash(i, s, 2) < 0.5) for (let k = 0; k < 5; k++) { const a = hash(i, k, s) * 6.28; v.set(cx + Math.cos(a) * 2.8, cy + Math.sin(a) * 2.8, z + 4, C(GREEN[1 + (k % 3)], ROUGH)); }
        z += 4;
      }
      cyl(v, 4, 4, 2, z, z + 1, C(WHITE[1])); if (r() < 0.35) mast(v, 4, 4, z + 1, 3, CYAN); else hedge(v, r, 3, 3, 5, 5, z + 1, 0.9);
      return v;
    },
    (r, lvl) => { // vertiport stop: a shuttle pod waiting on a mast platform
      const v = new Vox(T, T, 40);
      const H = 9 + lvl * 6 + irand(r, 0, 2);
      v.box(0, 0, 0, 8, 8, 1, mixc(PAVE13)); hedge(v, r, 0, 0, 8, 1, 1, 0.8); hedge(v, r, 0, 1, 1, 8, 1, 0.8);
      v.box(3, 3, 1, 5, 5, H, C(SILVER[0])); // lift shaft
      for (let z = 2; z < H - 1; z++) { v.set(4, 4, z, C(SKY, SMOOTH | (z % 5 === 2 ? COOL : 0))); if (z % 6 === 0) faces(v, 3, 3, 5, 5, z, z + 1, C(BLUE)); }
      v.box(4, 5, 1, 7, 7, 4, C(WHITE[0])); onL(v, 6, 5, 6, 1, 3, C(WIN, SMOOTH | WARM)); v.box(4, 5, 4, 7, 7, 5, C(BLUE));
      cyl(v, 4, 4, 2.4, H - 1, H, C(BLUE)); padDisc(v, 4, 4, H, 3.9, CYAN, DECK, 3);
      if (r() < 0.8) shuttle(v, 1, 1, H + 1, r() < 0.5 ? 'x' : 'y', 6);
      return v;
    },
  ],
  large: [
    (r, lvl) => { // lunar research institute under a telescope dome
      const v = new Vox(16, 16, 70);
      v.box(0, 0, 0, 16, 16, 1, mixc(PAVE13)); hedge(v, r, 0, 0, 16, 1, 1, 0.8); hedge(v, r, 0, 1, 1, 16, 1, 0.8);
      const fl = 2 + lvl * 2, R0 = 5.4 + lvl * 0.3, wall = pick(r, [WHITE, CREAM]);
      const lh = 1 + (1 + lvl) * 4;
      v.box(9, 2, 1, 15, 15, lh, mixc(wall)); bands(v, r, 9, 2, 15, 15, 1, 1 + lvl, 4, { wh: 2, sill: 1, light: COOL, lit: 0.4 });
      faces(v, 9, 2, 15, 15, lh - 1, lh, C(BLUE)); garden(v, r, 9, 2, 15, 15, lh, C(wall[1]), 1);
      v.box(2, 9, 1, 9, 15, 6, mixc(wall, 0, 3)); bands(v, r, 2, 9, 9, 15, 1, 1, 5, { wh: 2, sill: 2, side: 'L' }); garden(v, r, 2, 9, 9, 15, 6, C(wall[1]), 0);
      const zt = drum(v, 6, 6, R0 - 0.4, 1, fl, 4, mixc(SILVER, 0, 2), { lit: 0.35, light: COOL, s: irand(r, 0, 99) });
      scopeDome(v, 6, 6, zt + 1, R0);
      if (lvl > 0) scopeDome(v, 12.5, 5.5, lh + 1, 2.4);
      mast(v, 13, 12, lh, 7 + lvl * 3, CYAN);
      vines(v, r, 9, 2, 15, 15, lh, 3, 0.3);
      return v;
    },
    (r, lvl) => { // cargo transfer yard: lunar containers, a portal crane and loader drones
      const v = new Vox(16, 16, 50);
      apron(v, r, 16, [0xd5d8dc, 0xcbced3]);
      const cols = [BLUE, ICE, DEEP, ORANGE, 0x6ad08a, BLUE];
      for (const y0 of [1, 5]) for (const x0 of [1, 8]) {
        const n = irand(r, 1, 2 + lvl);
        for (let k = 0; k < n; k++) crate(v, x0 + (k === n - 1 && r() < 0.3 ? 1 : 0), y0, 1 + k * 3, 'x', 6, pick(r, cols));
        if (r() < 0.45) drone(v, x0 + 1, y0, 1 + n * 3);
      }
      const hz = 15 + lvl * 4; // portal crane
      for (const x of [0, 15]) { v.box(x, 10, 1, x + 1, 12, hz, (_x, _y, z) => C(z % 6 < 3 ? BLUE : WHITE[0])); v.box(x, 9, 1, x + 1, 13, 2, C(DARK)); }
      v.box(0, 10, hz, 16, 12, hz + 1, (x) => C(x % 4 === 0 ? BLUE : WHITE[0])); mast(v, 15, 11, hz + 1, 3, CYAN);
      const tx = irand(r, 4, 8);
      v.box(tx, 10, hz - 1, tx + 4, 12, hz, C(DARK)); for (let z = hz - 5; z < hz - 1; z++) v.set(tx + 2, 11, z, C(STEEL));
      crate(v, tx - 1, 10, hz - 8, 'x', 6, pick(r, cols));
      v.box(10, 13, 1, 15, 16, 5, mixc(WHITE)); onL(v, 15, 11, 14, 2, 4, C(WIN, SMOOTH | COOL)); garden(v, r, 10, 13, 15, 16, 5, C(WHITE[1]), 0);
      padDisc(v, 4, 14, 1, 2.4, CYAN, DECK, 3); drone(v, 2, 12, 2, pick(r, [ICE, 0xc8a070]));
      return v;
    },
    (r, lvl) => { // shuttle works: engineering block over a vaulted hangar
      const v = new Vox(16, 16, 70);
      v.box(0, 0, 0, 16, 16, 1, mixc(PAVE13)); hedge(v, r, 0, 0, 16, 1, 1, 0.8);
      const wall = pick(r, [WHITE, SILVER]), fl = 4 + lvl * 4, H = 1 + fl * 3;
      v.box(2, 1, 1, 14, 6, H, mixc(wall));
      bands(v, r, 2, 1, 14, 6, 1, fl, 3, { wh: 2, sill: 1, lit: 0.36, light: COOL });
      onR(v, 13, 3, 4, 1, H, C(BLUE)); faces(v, 2, 1, 14, 6, H - 1, H, C(BLUE));
      garden(v, r, 2, 1, 14, 6, H, C(wall[1]), 1); vines(v, r, 2, 1, 14, 6, H, 5, 0.4);
      dishOn(v, 11, 2, H, 3, 2.6, 0.2, 0.5, 0.8); mast(v, 3, 2, H, 8, CYAN);
      const wh = 3 + lvl; // vault
      for (let x = 1; x < 15; x++) {
        const dx = x + 0.5 - 8, top = 1 + wh + Math.round(Math.sqrt(Math.max(0, 49 - dx * dx)) * 0.7);
        v.box(x, 6, 1, x + 1, 13, top, (_x, y) => C(y % 3 === 0 ? BLUE : SILVER[x & 1]));
        if (x > 2 && x < 13) { v.box(x, 9, 1, x + 1, 13, top - 2, 0); v.box(x, 8, 1, x + 1, 9, top - 2, C(x % 3 === 0 ? 0x4a6078 : 0x2a3442, x % 3 === 0 ? SMOOTH | WARM : 0)); }
      }
      v.box(3, 9, 0, 13, 16, 1, C(DECK));
      shuttle(v, 5, 8, 1, 'y', 8);
      for (const x of [2, 13]) v.set(x, 13, 1, C(CYAN, EMIT));
      treeAt(v, 14, 14, 1, 1.6, 2); treeAt(v, 0, 14, 1, 1.4, 3);
      return v;
    },
  ],
  huge: [
    (r, lvl) => { // sky-dock tower: ring platforms where the lunar shuttles berth
      const v = new Vox(24, 24, 190);
      const H = 100 + lvl * 20, s = irand(r, 0, 999);
      v.box(0, 0, 0, 24, 24, 1, mixc(PAVE13));
      oct(v, 12, 12, 10.5, 5, 1, 8, mixc(WHITE));
      faces(v, 2, 2, 22, 22, 2, 4, (x, y) => C(WIN, SMOOTH | (hash(x >> 1, y >> 1, s) < 0.5 ? COOL : 0))); faces(v, 2, 2, 22, 22, 6, 7, C(BLUE));
      for (let y = 2; y < 22; y++) for (let x = 2; x < 22; x++) if (v.get(x, y, 7) && r() < 0.8) v.set(x, y, 8, C(GREEN[irand(r, 1, 3)], ROUGH));
      treeAt(v, 18, 16, 8, 2, 1); treeAt(v, 15, 19, 8, 1.7, 2); treeAt(v, 19, 7, 8, 1.6, 3); treeAt(v, 6, 19, 8, 1.8, 4);
      const radAt = (z: number) => 5.4 - 2.2 * (z / H);
      for (let z = 8; z < H; z++) {
        const rad = radAt(z), k = (z - 8) % 4, tz = (z - 8) % 28;
        cyl(v, 12, 12, rad, z, z + 1, (x, y) => {
          if (tz >= 26) return C(BLUE);
          if (k === 3 || (x + y) % 3 === 0) return C(WHITE[(x + y + z) & 1]);
          return C(z > H * 0.5 ? 0x5f95b8 : WIN, SMOOTH | (hash(x >> 1, y >> 1, z >> 2, s) < 0.34 ? (hash(z >> 2, s) < 0.6 ? COOL : WARM) : 0));
        });
        if (tz === 25) for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2; if (hash(i, z, s) < 0.75) v.set(12 + Math.cos(a) * (rad + 0.7), 12 + Math.sin(a) * (rad + 0.7), z, C(GREEN[1 + (i % 3)], ROUGH)); }
      }
      const rings: [number, number][] = [[Math.round(H * 0.34), 11], [Math.round(H * 0.6), 10], [Math.round(H * 0.84), 7.4]];
      rings.forEach(([z, out], i) => {
        const inn = radAt(z);
        for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
          const d = Math.hypot(x + 0.5 - 12, y + 0.5 - 12);
          if (d <= inn) continue;
          if (d <= out - 1.5) v.set(x, y, z - 1, C(d < inn + 2 ? STEEL : ICE));
          if (d <= out) v.set(x, y, z, C(d > out - 1 ? WHITE[0] : (x + y) % 5 === 0 ? 0x6b788f : DECK));
        }
        lights(v, 12, 12, z, out - 0.5, i < 2 ? 10 : 6, CYAN, i);
        if (i < 2) {
          shuttle(v, 8, 12 + Math.ceil(inn) + (i ? 0 : 1), z + 1, 'x', 8);
          if (i === 0 || r() < 0.6) shuttle(v, 12 + Math.ceil(inn) + (i ? 0 : 1), 7, z + 1, 'y', 8, CYAN, ORANGE);
        } else { drone(v, 15, 15, z + 1); drone(v, 7, 16, z + 1, ICE); }
      });
      const rt = radAt(H);
      cyl(v, 12, 12, rt + 1.6, H, H + 1, C(WHITE[0]));
      cyl(v, 12, 12, rt + 2.2, H + 1, H + 3, (x, y) => C(SKY, SMOOTH | ((x + y) % 3 === 0 ? COOL : 0)));
      cyl(v, 12, 12, rt + 2.6, H + 3, H + 4, C(WHITE[0])); cyl(v, 12, 12, rt, H + 4, H + 6, C(SILVER[1]));
      for (let z = H + 6; z < H + 22; z++) v.set(12, 12, z, C((z - H) % 5 === 0 ? BLUE : STEEL));
      v.set(12, 12, H + 22, C(CYAN, EMIT)); lights(v, 12.5, 12.5, H + 12, 2, 4, CYAN);
      return v;
    },
    (r, lvl) => { // mass driver: a launch rail that throws cargo sleds toward the Moon
      const v = new Vox(24, 24, 100);
      apron(v, r, 24, PAVE13);
      const HT = 30 + lvl * 12;
      const zAt = (y: number) => 4 + HT * Math.pow(Math.max(0, 17 - y) / 17, 1.8);
      for (let y = 23; y >= 0; y--) {
        const z = Math.round(zAt(y)), zn = y > 0 ? Math.round(zAt(y - 1)) : z + 1;
        if (y % 5 === 1) { v.box(6, y, 1, 8, y + 1, z - 1, C(WHITE[0])); v.box(5, y, 1, 9, y + 1, 2, C(WHITE[1])); for (let zz = 6; zz < z - 2; zz += 6) v.box(6, y, zz, 8, y + 1, zz + 1, C(BLUE)); }
        v.box(6, y, z - 1, 8, y + 1, Math.max(z + 1, zn), C(y & 1 ? SILVER[0] : SILVER[1]));
        v.box(8, y, z - 1, 9, y + 1, Math.max(z, zn - 1), C(DEEP)); v.box(5, y, z - 1, 6, y + 1, Math.max(z, zn - 1), C(DEEP));
        if (y % 3 === 0 && y < 16) { // accelerator hoop
          const c = C(y % 6 === 0 ? BLUE : WHITE[0]);
          for (let dz = -2; dz < 5; dz++) { v.set(4, y, z + dz, c); v.set(9, y, z + dz, c); }
          for (let x = 4; x < 10; x++) { v.set(x, y, z + 4, x === 6 || x === 7 ? C(CYAN, EMIT) : c); v.set(x, y, z - 2, c); }
        }
      }
      // cargo sled on the level section
      v.box(5, 18, 5, 9, 23, 7, C(HULL)); v.box(6, 17, 5, 8, 18, 6, C(HULL)); v.box(6, 18, 7, 8, 20, 8, C(0x3c9cc4, SMOOTH | COOL));
      v.box(5, 22, 5, 9, 23, 7, C(CYAN, EMIT)); v.box(5, 20, 6, 9, 21, 7, C(ORANGE));
      v.emit(7, 0, Math.round(zAt(0)) + 3, 'spark');
      // power hall with a control cab, and the capacitor bank
      const hh = 10 + lvl * 3;
      v.box(12, 2, 1, 23, 13, hh, mixc(WHITE)); bands(v, r, 12, 2, 23, 13, 1, Math.floor((hh - 1) / 3), 3, { wh: 2, sill: 1, light: COOL, lit: 0.45 });
      faces(v, 12, 2, 23, 13, hh - 1, hh, C(BLUE)); garden(v, r, 12, 2, 23, 13, hh, C(WHITE[1]), 2); vines(v, r, 12, 2, 23, 13, hh, 3, 0.3);
      v.box(18, 3, hh, 22, 7, hh + 5, mixc(SILVER)); v.box(17, 2, hh + 5, 23, 8, hh + 6, C(WHITE[0]));
      v.box(17, 2, hh + 6, 23, 8, hh + 8, (x, y) => C(SKY, SMOOTH | ((x + y) % 2 ? COOL : 0))); v.box(17, 2, hh + 8, 23, 8, hh + 9, C(WHITE[0])); mast(v, 20, 5, hh + 9, 6, CYAN);
      for (const x of [13, 17, 21]) { cyl(v, x, 16, 1.6, 1, 9, (_x, _y, z) => C(z === 7 ? BLUE : z % 3 === 0 ? SILVER[1] : SILVER[0], SMOOTH)); ball(v, x, 16, 9, 1.6, 1.3, C(WHITE[0], SMOOTH)); }
      for (let x = 10; x < 22; x++) v.set(x, 18, 1, C(x % 4 === 0 ? BLUE : STEEL));
      treeAt(v, 13, 20, 1, 2, 1); treeAt(v, 1, 20, 1, 1.8, 2); treeAt(v, 2, 9, 1, 1.6, 3); treeAt(v, 19, 21, 1, 2.2, 4); treeAt(v, 1, 14, 1, 1.5, 5);
      return v;
    },
  ],
  fill: [
    (r) => { // moon-rock monument
      const v = new Vox(T, T, 14);
      cyl(v, 4, 4, 3.4, 0, 1, C(PAVE13[0])); cyl(v, 4, 4, 2, 1, 3, C(WHITE[0])); v.box(2, 5, 1, 6, 6, 2, C(BLUE));
      const s = irand(r, 0, 99);
      ball(v, 4, 4, 5.4, 2.4 + r() * 0.4, 2.3, (x, y, z) => C(hash(x, y, z, s) < 0.16 ? 0x6f7480 : hash(x >> 1, y, z, s) < 0.5 ? 0xaab0ba : 0x8f95a0, ROUGH));
      v.set(1, 6, 1, C(CYAN, EMIT)); v.set(6, 1, 1, C(CYAN, EMIT));
      return v;
    },
    (r) => { // shuttle stop pad
      const v = new Vox(T, T, 12);
      padDisc(v, 4, 4, 0, 3.9, CYAN, DECK, 4);
      if (r() < 0.55) shuttle(v, 1, 1, 1, r() < 0.5 ? 'x' : 'y', 6);
      else { v.box(1, 1, 1, 2, 2, 7, C(STEEL)); v.box(1, 1, 7, 3, 2, 9, C(BLUE)); v.set(1, 1, 9, C(CYAN, EMIT)); v.box(3, 4, 1, 6, 5, 2, C(WHITE[0])); }
      return v;
    },
    (r) => { // radio beacon
      const v = new Vox(T, T, 26);
      const h = 13 + irand(r, 0, 5);
      v.box(3, 3, 0, 6, 6, 2, C(WHITE[0]));
      for (let z = 2; z < h; z++) { v.set(4, 4, z, C(STEEL)); if (z % 4 === 1) { cyl(v, 4.5, 4.5, 1.6, z, z + 1, C(z % 8 === 1 ? ICE : WHITE[0])); v.set(4, 4, z, C(STEEL)); } }
      v.set(4, 4, h, C(CYAN, EMIT)); v.set(4, 4, h + 1, C(0xf4f8ff, EMIT));
      hedge(v, r, 1, 6, 4, 7, 0, 0.9);
      return v;
    },
  ],
  sec: [
    (r) => { // Moon gate: an upright launch loop
      const v = new Vox(16, 16, 50);
      v.box(0, 0, 0, 16, 16, 1, mixc(PAVE13));
      const Rt = 7.6, Rz = 15.2, zc = 4 + Rz, inn = 0.72;
      for (let k = 0; k < 3; k++) oct(v, 8, 8, 5 - k, 2, 1 + k, 2 + k, C(k === 1 ? BLUE : WHITE[k & 1]));
      for (const [x, y] of [[12, 2], [2, 12]]) { v.box(x, y, 1, x + 2, y + 2, 9, C(SILVER[0])); v.box(x, y, 4, x + 2, y + 2, 5, C(BLUE)); }
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        if (x + y !== 15 && x + y !== 16) continue;
        const t = (x - y + (x + y === 15 ? 0 : 0)) / 2;
        for (let z = 3; z < zc + Rz + 1; z++) {
          const u = t / Rt, w = (z + 0.5 - zc) / Rz, e = Math.hypot(u, w);
          if (e > 1 || e < inn) continue;
          const seg = Math.floor(((Math.atan2(w, u) + Math.PI) / (Math.PI * 2)) * 32);
          v.set(x, y, z, e < inn + 0.07 ? (seg % 4 === 1 ? C(CYAN, EMIT) : C(DEEP)) : seg % 8 === 0 ? C(BLUE) : e > 0.92 ? C(WHITE[0]) : C(SILVER[seg & 1]));
        }
      }
      v.set(8, 8, Math.round(zc + Rz) + 1, C(CYAN, EMIT));
      for (let k = 0; k < 4; k++) { v.set(10 + k * 2, 9 + k * 2, 1, C(CYAN, EMIT)); v.set(9 + k * 2, 10 + k * 2, 1, C(CYAN, EMIT)); }
      padDisc(v, 12, 13, 1, 3, CYAN, DECK, 0); shuttle(v, 9, 10, 2, 'x', 6);
      treeAt(v, 2, 2, 1, 2, 1); treeAt(v, 5, 1, 1, 1.5, 2); treeAt(v, 1, 6, 1, 1.6, 3);
      hedge(v, r, 0, 0, 16, 1, 1, 0.8); hedge(v, r, 0, 1, 1, 16, 1, 0.8);
      v.emit(8, 8, zc, 'spark');
      return v;
    },
    (r) => { // gateway terminal: round hall, control spire and two shuttles at their docking arms
      const v = new Vox(16, 16, 60);
      v.box(0, 0, 0, 16, 16, 1, mixc(PAVE13));
      const s = irand(r, 0, 99);
      padDisc(v, 13, 6, 1, 3.6, CYAN, DECK, 3); padDisc(v, 6, 13, 1, 3.6, CYAN, DECK, 3);
      const zt = drum(v, 5.5, 5.5, 4.8, 1, 3, 4, mixc(WHITE), { glass: 0x4f86ad, lit: 0.5, light: COOL, s });
      cyl(v, 5.5, 5.5, 5.2, zt, zt + 1, C(BLUE)); cyl(v, 5.5, 5.5, 4.4, zt + 1, zt + 2, C(WHITE[0]));
      for (let i = 0; i < 16; i++) { const a = (i / 16) * 6.283; if (r() < 0.7) v.set(5.5 + Math.cos(a) * 3.6, 5.5 + Math.sin(a) * 3.6, zt + 2, C(GREEN[1 + (i % 3)], ROUGH)); }
      const th = zt + 18;
      cyl(v, 5.5, 5.5, 1.5, zt + 2, th, (_x, _y, z) => C(z % 6 === 0 ? BLUE : SILVER[0]));
      cyl(v, 5.5, 5.5, 3.2, th, th + 1, C(WHITE[0])); cyl(v, 5.5, 5.5, 3.6, th + 1, th + 3, (x, y) => C(SKY, SMOOTH | ((x + y) % 3 === 0 ? COOL : 0)));
      cyl(v, 5.5, 5.5, 3.9, th + 3, th + 4, C(WHITE[0])); cyl(v, 5.5, 5.5, 2, th + 4, th + 5, C(SILVER[1])); mast(v, 5, 5, th + 5, 6, CYAN);
      // docking arms and shuttles
      v.box(9, 5, 4, 13, 7, 6, (x) => C(x % 2 ? SKY : WHITE[0], x % 2 ? SMOOTH | COOL : 0)); v.box(12, 5, 2, 13, 7, 4, C(STEEL));
      v.box(5, 9, 4, 7, 13, 6, (_x, y) => C(y % 2 ? SKY : WHITE[0], y % 2 ? SMOOTH | COOL : 0)); v.box(5, 12, 2, 7, 13, 4, C(STEEL));
      shuttle(v, 10, 2, 2, 'y', 8); shuttle(v, 2, 10, 2, 'x', 8, pick(r, [CYAN, 0xffa030]));
      treeAt(v, 13, 13, 1, 1.9, 1); hedge(v, r, 11, 11, 16, 16, 1, 0.5);
      return v;
    },
  ],
};
// ================================ EPOCH 14: Mars Frontier =======================
const PAVE14 = [0xe0d8cc, 0xd6cec2], SOLAR = [0x23406a, 0x2c4f82];
const soil = (s = 0): Col => (x, y, z) => C(MARS[Math.floor(hash(x, y, z, s) * MARS.length)], ROUGH);
/** Six-wheeled rover, 5x3 voxels. */
function rover(v: Vox, x: number, y: number, z: number, dir: 'x' | 'y'): void {
  const b = (a0: number, c0: number, z0: number, a1: number, c1: number, z1: number, col: Col) =>
    (dir === 'x' ? v.box(x + a0, y + c0, z + z0, x + a1, y + c1, z + z1, col) : v.box(x + c0, y + a0, z + z0, x + c1, y + a1, z + z1, col));
  for (const a of [0, 2, 4]) b(a, 0, 0, a + 1, 3, 1, C(0x2e3138));
  b(0, 0, 1, 5, 3, 2, C(HULL)); b(1, 0, 1, 2, 3, 2, C(RUST[0]));
  b(3, 0, 2, 5, 3, 3, C(0x3c9cc4, SMOOTH | COOL)); b(0, 0, 2, 3, 3, 3, C(SOLAR[0], SMOOTH));
  b(0, 1, 3, 1, 2, 5, C(STEEL)); b(0, 1, 5, 1, 2, 6, C(WHITE[0]));
}
/** Rust terrain with a few crop rows, to sit under a glass dome. */
function marsGarden(v: Vox, r: R, cx: number, cy: number, z: number, rad: number, s: number): void {
  for (let y = Math.floor(cy - rad); y <= cy + rad; y++)
    for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > rad) continue;
      const h = 1 + (hash(x >> 1, y >> 1, s) < 0.28 && d < rad - 1.5 ? 1 : 0);
      v.box(x, y, z, x + 1, y + 1, z + h, soil(s));
      if (h === 1 && (x + y) % 3 === 0 && d < rad - 1 && r() < 0.85) v.set(x, y, z + 1, C(GREEN[irand(r, 2, 4)], ROUGH));
    }
}
function flag(v: Vox, x: number, y: number, z: number, h: number, col = RUST[0]): void {
  v.box(x, y, z, x + 1, y + 1, z + h, C(STEEL));
  v.box(x + 1, y, z + h - 3, x + 4, y + 1, z + h, (X, _y, Z) => C((Z - z - h + 3) === 1 ? WHITE[0] : col));
}

export const x14: Extras = {
  small: [
    (r, lvl) => { // rover garage with the crew room above
      const v = new Vox(T, T, 30);
      const wall = pick(r, [WHITE, TERRA, CREAM]), H = 5 + lvl * 4;
      v.box(0, 5, 0, 8, 8, 1, soil(irand(r, 0, 9)));
      v.box(1, 1, 0, 7, 5, H, mixc(wall));
      onL(v, 4, 2, 6, 0, 4, (_x, _y, z) => C(z === 3 ? RUST[0] : z & 1 ? 0x8a94a0 : 0x7a8490));
      if (lvl > 0) bands(v, r, 1, 1, 7, 5, 5, lvl, 4, { wh: 2, sill: 1, seg: 1, gap: 1, lit: 0.45 });
      onR(v, 6, 2, 4, 1, 3, C(WIN, SMOOTH | (r() < 0.5 ? WARM : 0)));
      faces(v, 1, 1, 7, 5, H - 1, H, C(wall === TERRA ? WHITE[0] : RUST[0]));
      v.box(1, 1, H, 7, 5, H + 1, (x, y) => C(SOLAR[(x + y) & 1], SMOOTH)); v.box(5, 1, H, 7, 5, H + 1, C(wall[1])); hedge(v, r, 5, 2, 7, 4, H + 1, 0.8);
      if (r() < 0.8) rover(v, 2, 5, 1, 'x'); else v.box(2, 6, 1, 4, 8, 3, C(WHITE[1]));
      return v;
    },
    (r, lvl) => { // pilot housing: white flats with terracotta balconies
      const v = new Vox(T, T, 44);
      const fl = 2 + lvl * 3 + irand(r, 0, 1), H = fl * 3, t = pick(r, [TERRA[0], RUST[0], RUST[2]]);
      oct(v, 4, 4, 3, 1.4, 0, H, mixc(WHITE));
      for (let f = 0; f < fl; f++) {
        const z = f * 3;
        onL(v, 6, 2, 6, z, z + 1, C(f % 3 === 0 ? t : CREAM[1])); onR(v, 6, 2, 6, z, z + 1, C(f % 3 === 0 ? t : CREAM[1]));
        for (const a of [2, 4]) { onL(v, 6, a, a + 1, z + 1, z + 3, C(WIN, SMOOTH | (r() < 0.4 ? WARM : 0))); onR(v, 6, a, a + 1, z + 1, z + 3, C(WIN, SMOOTH | (r() < 0.4 ? WARM : 0))); }
        if (r() < 0.3) v.set(3, 7, z + 1, C(GREEN[irand(r, 1, 3)], ROUGH));
      }
      onL(v, 6, 3, 4, 0, 2, C(0x7a4a34));
      oct(v, 4, 4, 3, 1.4, H, H + 1, C(t)); oct(v, 4, 4, 2, 1, H, H + 1, C(0x8a7a5a)); hedge(v, r, 2, 2, 6, 6, H + 1, 0.6);
      if (r() < 0.3) v.box(2, 2, H + 1, 3, 3, H + 4 + lvl, C(STEEL));
      return v;
    },
    (r, lvl) => { // terraforming greenhouse pod
      const v = new Vox(T, T, 36);
      const s = irand(r, 0, 99), fl = lvl * 2 + (lvl ? irand(r, 0, 1) : 0);
      cyl(v, 4, 4, 3.9, 0, 2, (_x, _y, z) => C(z ? TERRA[0] : TERRA[1]));
      let z = 2;
      if (fl) { z = drum(v, 4, 4, 3, 2, fl, 4, mixc(WHITE), { lit: 0.4, s }); cyl(v, 4, 4, 3.9, z, z + 1, C(RUST[0])); z++; }
      marsGarden(v, r, 4, 4, z, 3, s);
      treeAt(v, 3, 3, z + 1, 1.5, s);
      dome(v, 4, 4, z, 3.9, 6.5, WHITE[0], SKY, 0.12, s);
      return v;
    },
  ],
  large: [
    (r, lvl) => { // colony training campus: a mock Mars base in the yard
      const v = new Vox(16, 16, 60);
      const s = irand(r, 0, 99), wall = pick(r, [WHITE, CREAM]), fl = 3 + lvl * 3, H = 1 + fl * 3;
      v.box(0, 0, 0, 16, 16, 1, soil(s));
      for (let i = 0; i < 9; i++) { const x = irand(r, 0, 15), y = irand(r, 7, 15); v.set(x, y, 1, C(MARS[3], ROUGH)); }
      v.box(1, 1, 1, 15, 6, H, mixc(wall));
      bands(v, r, 1, 1, 15, 6, 1, fl, 3, { wh: 2, sill: 1, lit: 0.38 });
      for (const a of [1, 5, 10, 14]) onL(v, 5, a, a + 1, 1, H, C(RUST[0]));
      faces(v, 1, 1, 15, 6, H - 1, H, C(RUST[0])); garden(v, r, 1, 1, 15, 6, H, C(wall[1]), 1); vines(v, r, 1, 1, 15, 6, H, 4, 0.3);
      dishOn(v, 12, 2, H, 3, 2.5, 0.3, 0.5, 0.8);
      // habitat tube, dome and connecting tunnel
      v.box(1, 9, 1, 9, 12, 3, C(HULL)); v.box(1, 10, 3, 9, 11, 4, C(HULL)); v.box(1, 9, 3, 9, 12, 4, (_x, y) => (y === 10 ? C(RUST[0]) : C(WHITE[1])));
      for (let x = 2; x < 9; x += 2) v.set(x, 11, 2, C(0x1a2436, SMOOTH | (r() < 0.6 ? WARM : COOL)));
      v.box(9, 10, 1, 11, 11, 3, C(STEEL));
      cyl(v, 12.5, 10.5, 2.9, 1, 2, C(WHITE[1])); marsGarden(v, r, 12.5, 10.5, 1, 2, s); dome(v, 12.5, 10.5, 1, 2.9, 4.6, WHITE[0], SKY, 0.12, s);
      rover(v, 3, 13, 1, 'x'); flag(v, 13, 14, 1, 9);
      v.box(9, 14, 1, 11, 16, 2, C(SOLAR[0], SMOOTH)); v.box(6, 7, 1, 8, 8, 2, C(SOLAR[1], SMOOTH));
      return v;
    },
    (r, lvl) => { // fusion fuel plant: a glowing torus around the reactor column
      const v = new Vox(16, 16, 80);
      apron(v, r, 16, PAVE14);
      const glow = pick(r, [0xffb060, 0x7fe8ff, 0xff9ad8]), cx = 7.5, cy = 7.5, R0 = 4.7, tr = 2.1, cz = 6.5 + lvl, hc = 24 + lvl * 10;
      for (const [x, y] of [[3, 3], [11, 3], [3, 11], [11, 11]]) v.box(x, y, 1, x + 1, y + 1, Math.floor(cz), C(STEEL));
      for (let z = Math.floor(cz - tr); z <= cz + tr; z++)
        for (let y = 0; y < 16; y++)
          for (let x = 0; x < 16; x++) {
            const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy) - R0, dz = z + 0.5 - cz;
            if (d * d + dz * dz > tr * tr) continue;
            const seg = Math.floor((Math.atan2(dy, dx) + Math.PI) * (12 / Math.PI));
            v.set(x, y, z, seg % 6 === 0 ? C(RUST[0]) : dz > -0.6 && dz < 0.6 && d > tr - 1.1 ? C(glow, EMIT) : C(WHITE[0], SMOOTH));
          }
      cyl(v, cx, cy, 2.2, 1, hc, (x, y, z) => C(z % 9 === 8 ? RUST[0] : z > cz + 3 && z % 3 === 1 && (x + y) % 2 === 0 ? 0x2a3a4a : WHITE[(z >> 1) & 1], SMOOTH));
      for (let z = Math.floor(cz) + 4; z < hc - 2; z += 2) v.set(8, 9, z, C(glow, EMIT));
      ball(v, cx, cy, hc, 2.6, 2.2, C(WHITE[0], SMOOTH)); cyl(v, cx, cy, 2.9, hc - 1, hc, C(RUST[0])); mast(v, 7, 7, hc + 2, 7, glow);
      for (const [x, y, h] of [[13.5, 12.5, 9], [12.5, 2.5, 7 + lvl * 3]]) { cyl(v, x, y, 1.9, 1, h, (_x, _y, z) => C(z === h - 2 ? RUST[0] : z % 3 === 0 ? WHITE[1] : WHITE[0], SMOOTH)); ball(v, x, y, h, 1.9, 1.4, C(WHITE[0], SMOOTH)); }
      v.box(1, 12, 1, 6, 15, 5, mixc(CREAM)); onL(v, 14, 2, 5, 2, 4, C(WIN, SMOOTH | COOL)); faces(v, 1, 12, 6, 15, 4, 5, C(RUST[0])); garden(v, r, 1, 12, 6, 15, 5, C(CREAM[1]), 0);
      for (let x = 6; x < 13; x++) v.set(x, 13, 1, C(x % 3 === 0 ? RUST[0] : STEEL));
      v.emit(cx, cy, hc + 9, 'spark');
      return v;
    },
    (r, lvl) => { // frontier habitat tower: terracotta fins, sky gardens and greenhouse pods
      const v = new Vox(16, 16, 150);
      const fl = 12 + lvl * 9 + irand(r, 0, 2), H = 5 + fl * 3, s = irand(r, 0, 99), t = pick(r, [RUST[0], TERRA[0], RUST[2]]);
      v.box(1, 1, 0, 15, 15, 5, mixc(TERRA, 0, 1));
      faces(v, 1, 1, 15, 15, 1, 4, (x, y) => C((x + y) % 4 === 0 ? TERRA[1] : WIN, (x + y) % 4 === 0 ? 0 : SMOOTH | (hash(x, y, s) < 0.5 ? WARM : 0)));
      garden(v, r, 1, 1, 15, 15, 5, C(WHITE[0]), 2);
      v.box(3, 3, 5, 13, 13, H, mixc(WHITE, 0, 2));
      bands(v, r, 3, 3, 13, 13, 5, fl, 3, { wh: 2, sill: 1, seg: 2, gap: 1, lit: 0.34 });
      for (const a of [7, 8]) { onL(v, 12, a, a + 1, 5, H, C(t)); onR(v, 12, a, a + 1, 5, H, C(t)); }
      for (let z = 5 + 8; z < H; z += 9) faces(v, 3, 3, 13, 13, z, z + 1, C(t));
      for (let k = 0, z = 5 + 15; z < H - 8; z += 18, k++) {
        if (k % 2 === 0) { // sky garden cut into the corner
          v.box(9, 9, z, 13, 13, z + 6, 0); v.box(9, 9, z - 1, 13, 13, z, C(0x8a7a5a)); hedge(v, r, 9, 9, 13, 13, z, 0.85); treeAt(v, 10, 10, z, 1.6, k + 2);
          v.box(8, 8, z, 9, 13, z + 6, C(WHITE[1])); v.box(9, 8, z, 13, 9, z + 6, C(WHITE[1]));
        } else { // greenhouse pod
          const L = k % 4 === 1;
          const [x0, y0, x1, y1] = L ? [4, 13, 10, 15] : [13, 4, 15, 10];
          v.box(x0, y0, z, x1, y1, z + 1, C(t)); v.box(x0, y0, z + 1, x1, y1, z + 4, (x, y, zz) => ((L ? x : y) % 2 === 0 || zz === z + 3 ? C(WHITE[0]) : hash(x, y, zz, s) < 0.5 ? C(GREEN[2], ROUGH) : C(SKY, SMOOTH)));
        }
      }
      parapet(v, 3, 3, 13, 13, H, C(t)); vines(v, r, 3, 3, 13, 13, H, 6, 0.4);
      cyl(v, 8, 8, 4.6, H, H + 1, C(WHITE[1])); marsGarden(v, r, 8, 8, H + 1, 3.6, s); dome(v, 8, 8, H + 1, 4.6, 6, WHITE[0], SKY, 0.12, s);
      mast(v, 4, 4, H, 9, BEACON);
      return v;
    },
  ],
  huge: [
    (r, lvl) => { // interplanetary liner port: the Mars ship docked in its cradle
      const v = new Vox(24, 24, 90);
      apron(v, r, 24, PAVE14);
      const s = irand(r, 0, 99), ax = 8, cz = 14 + lvl, R0 = 5.2, t = pick(r, [RUST[0], RUST[2], TERRA[0]]);
      // boarding tower behind the ship, with a bridge to the hull
      const th = cz + 14 + lvl * 6;
      v.box(17, 2, 1, 22, 7, th, mixc(WHITE, 0, 4)); bands(v, r, 17, 2, 22, 7, 1, Math.floor((th - 2) / 3), 3, { wh: 2, sill: 1, seg: 1, gap: 1, lit: 0.4 });
      onL(v, 6, 19, 20, 1, th, (_x, _y, z) => C(SKY, SMOOTH | (z % 7 === 3 ? COOL : 0))); faces(v, 17, 2, 22, 7, th - 1, th, C(t));
      parapet(v, 17, 2, 22, 7, th, C(WHITE[1])); mast(v, 18, 3, th, 8, BEACON); hedge(v, r, 18, 3, 21, 6, th, 0.7);
      v.box(12, 9, cz - 1, 19, 11, cz + 2, (x, _y, z) => C(z === cz - 1 || x % 2 === 0 ? WHITE[0] : SKY, z === cz - 1 || x % 2 === 0 ? 0 : SMOOTH | COOL));
      v.box(18, 7, 1, 20, 11, cz - 1, (_x, _y, z) => C(z % 6 === 0 ? t : WHITE[1]));
      for (const y of [7, 17]) { // cradle saddles
        for (const x of [1, 13]) v.box(x, y, 1, x + 2, y + 2, cz - 1, (_x, _y, z) => C(z % 5 === 0 ? t : WHITE[0]));
        v.box(1, y, cz - 7, 15, y + 2, cz - 5, C(WHITE[1]));
      }
      const Rr = 8.3; // habitat ring around the stern
      for (let z = 1; z < cz + Rr + 2; z++) for (let x = 0; x < 18; x++) {
        const d = Math.hypot(x + 0.5 - ax, z + 0.5 - cz), seg = Math.floor((Math.atan2(z + 0.5 - cz, x + 0.5 - ax) + Math.PI) * (12 / Math.PI));
        if (Math.abs(d - Rr) < 1.1) for (const y of [3, 4]) v.set(x, y, z, seg % 6 === 0 ? C(t) : C(WHITE[seg & 1]));
        else if (d < Rr && (Math.abs(x + 0.5 - ax) < 0.6 || Math.abs(z + 0.5 - cz) < 0.6)) v.set(x, 3, z, C(STEEL));
      }
      for (let y = 1; y < 24; y++) { // hull
        const k = y > 17 ? 1 - Math.pow((y - 17) / 7, 2) * 0.72 : y < 3 ? 0.7 + y * 0.1 : 1, rr = R0 * k;
        for (let z = Math.floor(cz - rr); z <= cz + rr; z++) for (let x = Math.floor(ax - rr); x <= ax + rr; x++) {
          const dx = (x + 0.5 - ax) / rr, dz = (z + 0.5 - cz) / (rr * 0.9);
          if (dx * dx + dz * dz > 1) continue;
          const zz = z - cz;
          v.set(x, y, z, y >= 20 && zz >= 0 ? C(0x3c9cc4, SMOOTH | COOL) : y < 3 ? C(y === 1 ? 0x3a3f4a : t) : (zz === 0 || zz === 2) && y % 2 === 0 && y > 5 && y < 19 ? C(0x1a2a3e, SMOOTH | (hash(y, zz, s) < 0.55 ? WARM : 0))
            : zz === -2 || y === 19 || y === 5 ? C(t) : C(y % 4 === 0 ? 0xe2e5ea : HULL));
        }
      }
      v.box(8, 7, cz + 5, 9, 13, cz + 10, (_x, y, z) => C(SOLAR[(y + z) & 1], SMOOTH)); // dorsal radiator
      // terminal
      v.box(15, 16, 1, 23, 23, 8, mixc(CREAM)); bands(v, r, 15, 16, 23, 23, 1, 2, 3, { wh: 2, sill: 1, lit: 0.45 }); faces(v, 15, 16, 23, 23, 7, 8, C(t));
      garden(v, r, 15, 16, 23, 23, 8, C(CREAM[1]), 2);
      for (let y = 2; y < 23; y += 4) { v.set(0, y, 1, C(PADLIGHT, EMIT)); v.set(15, y + 1, 1, C(PADLIGHT, EMIT)); }
      treeAt(v, 20, 12, 1, 2, 1); treeAt(v, 22, 9, 1, 1.6, 3);
      v.emit(9, 1, 3, 'smoke');
      return v;
    },
    (r, lvl) => { // deep-space antenna array
      const v = new Vox(24, 24, 90);
      apron(v, r, 24, PAVE14);
      const s = irand(r, 0, 99), ph = 16 + lvl * 7, R0 = 9.2 + lvl * 0.6, tilt = 0.74 + r() * 0.1;
      for (let i = 0; i < 26; i++) { const x = irand(r, 1, 22), y = irand(r, 1, 22); v.set(x, y, 0, C(MARS[i % 4], ROUGH)); }
      oct(v, 10, 10, 4.5, 2.4, 1, 6, mixc(WHITE)); faces(v, 6, 6, 15, 15, 2, 4, (x, y) => C(WIN, SMOOTH | (hash(x, y, s) < 0.5 ? COOL : 0))); oct(v, 10, 10, 4.5, 2.4, 6, 7, C(RUST[0]));
      cyl(v, 10, 10, 2.6, 7, ph, (_x, _y, z) => C(z % 7 === 6 ? RUST[0] : WHITE[(z >> 1) & 1]));
      cyl(v, 10, 10, 3.4, ph, ph + 2, C(STEEL));
      dish(v, 10.5, 10.5, ph + 4, R0, 0.5, 0.5, tilt);
      dishOn(v, 20, 4, 1, 6 + lvl * 2, 3.8, 0.5, 0.5, tilt); dishOn(v, 4, 20, 1, 5 + lvl * 2, 3.8, 0.5, 0.5, tilt);
      v.box(15, 15, 1, 23, 22, 6, mixc(CREAM)); bands(v, r, 15, 15, 23, 22, 1, 1, 5, { wh: 2, sill: 2, light: COOL, lit: 0.6 }); faces(v, 15, 15, 23, 22, 5, 6, C(RUST[0]));
      garden(v, r, 15, 15, 23, 22, 6, C(CREAM[1]), 1); dishOn(v, 17, 17, 6, 3, 2.4, 0.5, 0.5, tilt);
      mast(v, 22, 21, 6, 12, BEACON);
      treeAt(v, 2, 3, 1, 2, 1); treeAt(v, 12, 20, 1, 1.8, 2);
      return v;
    },
  ],
  fill: [
    (r) => { // rover on display
      const v = new Vox(T, T, 10);
      v.box(1, 2, 0, 7, 6, 1, C(PAVE14[1])); v.box(1, 2, 1, 7, 6, 2, soil(irand(r, 0, 9)));
      rover(v, r() < 0.5 ? 1 : 2, 3, 2, 'x'); v.set(7, 6, 0, C(PADLIGHT, EMIT));
      return v;
    },
    (r) => { // red-rock garden
      const v = new Vox(T, T, 12);
      const s = irand(r, 0, 99);
      cyl(v, 4, 4, 3.8, 0, 1, soil(s));
      ball(v, 3 + r(), 3 + r(), 1, 2.2, 2.6 + r(), soil(s + 1)); ball(v, 5.5, 5 + r(), 0.5, 1.5, 1.6, soil(s + 2));
      for (let i = 0; i < 6; i++) { const x = irand(r, 1, 6), y = irand(r, 4, 7); if (!v.get(x, y, 1)) { v.set(x, y, 1, C(GREEN[irand(r, 2, 4)], ROUGH)); if (r() < 0.4) v.set(x, y, 2, C(GREEN[3], ROUGH)); } }
      return v;
    },
    (r) => { // flag plaza
      const v = new Vox(T, T, 16);
      cyl(v, 4, 4, 3.8, 0, 1, (x, y) => C(Math.hypot(x + 0.5 - 4, y + 0.5 - 4) > 2.8 ? TERRA[0] : PAVE14[(x + y) & 1]));
      flag(v, 3, 3, 1, 10 + irand(r, 0, 2), pick(r, [RUST[0], RUST[2], ORANGE]));
      lights(v, 4, 4, 0, 3.3, 3, PADLIGHT, r() * 6); hedge(v, r, 5, 5, 7, 6, 1, 0.9);
      return v;
    },
  ],
  sec: [
    (r) => { // orbital-elevator anchor: the cable rises out of sight
      const v = new Vox(16, 16, 232);
      v.box(0, 0, 0, 16, 16, 1, mixc(PAVE14));
      const s = irand(r, 0, 99);
      let z = 1;
      for (let t = 0; t < 5; t++) {
        const hw = 7.6 - t * 1.25, z0 = z;
        oct(v, 8, 8, hw, hw * 0.45, z, z + 6, (x, y, zz) => (zz === z0 + 5 ? C(RUST[t % 3]) : zz > z0 + 1 && zz < z0 + 4 && (x + y) % 3 !== 0 ? C(WIN, SMOOTH | (hash(x >> 1, y >> 1, t, s) < 0.4 ? WARM : 0)) : C(WHITE[(x + y) & 1])));
        z += 6;
        for (let i = 0; i < 40; i++) { const a = (i / 40) * 6.283, x = 8 + Math.cos(a) * (hw - 0.6), y = 8 + Math.sin(a) * (hw - 0.6); if (v.get(Math.floor(x), Math.floor(y), z - 1) && !v.get(Math.floor(x), Math.floor(y), z + 1) && r() < 0.75) v.set(x, y, z, C(GREEN[irand(r, 1, 3)], ROUGH)); }
      }
      cyl(v, 8, 8, 2, z, z + 3, C(STEEL));
      const top = 222;
      for (let zz = z; zz < top; zz++) {
        const c = C(zz % 8 < 4 ? 0xd6dbe2 : 0xbfc6cf);
        v.set(7, 8, zz, c); v.set(8, 7, zz, c);
        if (zz % 8 === 0 && zz < top - 12) { v.set(7, 7, zz, C(STEEL)); v.set(8, 8, zz, C(STEEL)); }
        if (zz % 40 === 20) v.set(8, 8, zz, C(BEACON, EMIT));
      }
      for (const zc of [irand(r, 50, 80), irand(r, 120, 170)]) { // climbers
        v.box(6, 6, zc, 10, 10, zc + 7, (x, y, zz) => C(zz === zc || zz === zc + 6 ? RUST[0] : zz === zc + 3 ? 0x3c9cc4 : HULL, zz === zc + 3 ? SMOOTH | COOL : 0));
        v.box(7, 7, zc - 1, 9, 9, zc, C(DARK)); v.set(9, 9, zc - 1, C(PADLIGHT, EMIT)); v.box(7, 7, zc + 7, 9, 9, zc + 8, C(WHITE[1]));
      }
      for (const [x, y] of [[1, 1], [14, 1], [1, 14]]) treeAt(v, x, y, 1, 1.5, x + y);
      v.set(7, 8, top, C(0xf4f8ff, EMIT));
      return v;
    },
    (r) => { // Mars biome dome: red soil and the first crops under glass
      const v = new Vox(16, 16, 44);
      v.box(0, 0, 0, 16, 16, 1, mixc(PAVE14));
      const s = irand(r, 0, 99);
      cyl(v, 8, 8, 7.9, 1, 3, (_x, _y, z) => C(z === 2 ? WHITE[0] : RUST[0]));
      marsGarden(v, r, 8, 8, 2, 6.9, s);
      ball(v, 5, 6, 3, 2.6, 2.8, soil(s + 4)); // a mesa
      v.box(9, 5, 3, 12, 8, 5, C(HULL)); v.box(9, 5, 5, 12, 8, 6, C(RUST[0])); v.set(11, 7, 4, C(0x1a2436, SMOOTH | WARM)); v.set(10, 7, 4, C(0x1a2436, SMOOTH | COOL));
      rover(v, 5, 11, 3, 'x'); flag(v, 11, 11, 3, 6);
      treeAt(v, 12, 10, 3, 1.4, 2); treeAt(v, 8, 12, 3, 1.2, 3);
      dome(v, 8, 8, 2, 7.9, 11.5, WHITE[0], SKY, 0.12, s);
      v.box(14, 7, 1, 16, 10, 4, C(WHITE[0])); onR(v, 15, 8, 9, 1, 3, C(0x6a4a3a)); v.box(14, 7, 4, 16, 10, 5, C(RUST[0]));
      cyl(v, 2, 13.5, 1.5, 1, 20, (_x, _y, z) => C(z % 6 === 5 ? RUST[0] : WHITE[(z >> 1) & 1], SMOOTH)); cyl(v, 2, 13.5, 2.2, 20, 21, C(WHITE[0])); mast(v, 1, 13, 21, 5, BEACON);
      return v;
    },
  ],
  hero: (r) => { // the spire: a space elevator and sky launch tower, the climax of the city
    const v = new Vox(24, 24, 272);
    const HT = 196, s = irand(r, 0, 999);
    const hwAt = (z: number) => 3.4 + 6.6 * Math.pow(1 - Math.min(1, z / HT), 1.15);
    v.box(0, 0, 0, 24, 24, 1, mixc(PAVE14));
    oct(v, 12, 12, 11.6, 5, 1, 8, mixc(WHITE, 0, 9));
    faces(v, 0, 0, 24, 24, 2, 5, (x, y) => C((x + y) % 4 === 0 ? WHITE[1] : WIN, (x + y) % 4 === 0 ? 0 : SMOOTH | (hash(x >> 1, y >> 1, s) < 0.5 ? WARM : 0)));
    faces(v, 0, 0, 24, 24, 6, 7, C(RUST[0]));
    for (let y = 1; y < 23; y++) for (let x = 1; x < 23; x++) if (v.get(x, y, 7) && r() < 0.85) v.set(x, y, 8, C(GREEN[irand(r, 1, 3)], ROUGH));
    for (const [x, y, k] of [[19, 14, 2.2], [14, 19, 2], [20, 9, 1.7], [9, 20, 1.8], [18, 19, 1.5]]) treeAt(v, x, y, 8, k, x);
    for (let z = 8; z < HT; z++) {
      const hw = hwAt(z), b = z % 30;
      oct(v, 12, 12, hw, hw * 0.5, z, z + 1, (x, y) => {
        if (b >= 28) return C(RUST[(x + y) % 3]);
        if (z % 4 === 1 && (x + y) % 2 === 0 && b < 26) return C(lerpc(WIN, 0x7fb6d2, z / HT), SMOOTH | (hash(x, y, z, s) < 0.4 ? (hash(z >> 2, s) < 0.65 ? WARM : COOL) : 0));
        return C(z % 4 === 3 ? WHITE[1] : 0xf8f7f3);
      });
      if (b < 27) { // glazed elevator tracks up the two visible faces
        const f = Math.floor(12 + hw - 0.5), g = C(z % 6 === 0 ? 0xe8eef2 : 0x6fb4d0, SMOOTH | (z % 6 === 3 ? COOL : 0));
        for (const a of [11, 12]) { v.set(a, f, z, g); v.set(f, a, z, g); }
      }
      if (b === 27 && z > 30) for (let i = 0; i < 44; i++) { // hanging garden ring
        const a = (i / 44) * Math.PI * 2;
        if (Math.cos(a) + Math.sin(a) < -0.3 || hash(i, z, s) > 0.8) continue;
        const x = 12 + Math.cos(a) * (hw + 0.8), y = 12 + Math.sin(a) * (hw + 0.8);
        for (let k = 0; k <= Math.floor(hash(i, z, s + 1) * 4); k++) v.set(x, y, z - k, C(GREEN[1 + ((i + k) % 3)], ROUGH));
      }
    }
    for (let z = 1; z < 84; z++) { // buttress fins
      const reach = Math.round(11.5 - (11.5 - hwAt(z) - 0.5) * Math.pow(z / 84, 0.5));
      const edge = (zz: number) => C(zz % 10 < 2 ? RUST[0] : WHITE[0]);
      v.box(11, 12, z, 13, 12 + reach, z + 1, C(WHITE[1])); v.box(12, 11, z, 12 + reach, 13, z + 1, C(WHITE[1]));
      v.box(11, 11 + reach, z, 13, 12 + reach, z + 1, edge(z)); v.box(11 + reach, 11, z, 12 + reach, 13, z + 1, edge(z));
      if (z % 14 === 7) { v.set(12, 11 + reach, z, C(PADLIGHT, EMIT)); v.set(11 + reach, 12, z, C(PADLIGHT, EMIT)); }
    }
    // sky docks
    ([[96, 11.7], [140, 10.4], [172, 8.8]] as [number, number][]).forEach(([z, out], i) => {
      const inn = hwAt(z);
      for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
        const d = Math.hypot(x + 0.5 - 12, y + 0.5 - 12);
        if (d <= inn - 0.5) continue;
        if (d <= out - 1.6) v.set(x, y, z - 1, C(d < inn + 1.5 ? STEEL : RUST[1]));
        if (d <= out) v.set(x, y, z, C(d > out - 1 ? WHITE[0] : (x + y) % 5 === 0 ? 0x6b788f : DECK));
      }
      lights(v, 12, 12, z, out - 0.5, i < 2 ? 10 : 6, i === 1 ? CYAN : PADLIGHT, i);
      if (i < 2) { shuttle(v, 8, 12 + Math.floor(inn), z + 1, 'x', 8, CYAN, RUST[0]); shuttle(v, 12 + Math.floor(inn), 7, z + 1, 'y', 7, CYAN, ORANGE); }
      else { drone(v, 16, 15, z + 1); drone(v, 8, 17, z + 1, TERRA[0]); }
    });
    // flanking booster towers, bridged to the shaft
    const side = (cx: number, cy: number, h: number) => {
      for (let z = 8; z < h; z++) {
        const rad = z > h - 9 ? 0.5 + (2.9 * (h - z)) / 9 : 2.9;
        cyl(v, cx, cy, rad, z, z + 1, (x, y) => (z > h - 9 || z % 16 === 0 ? C(RUST[z > h - 9 ? 0 : 1]) : z % 4 === 1 && (x + y) % 2 === 0 ? C(WIN, SMOOTH | (hash(x, y, z, s) < 0.4 ? WARM : 0)) : C(z % 4 === 3 ? WHITE[1] : 0xf8f7f3)));
      }
      v.set(cx, cy, h, C(BEACON, EMIT));
      for (const zz of [Math.round(h * 0.45), Math.round(h * 0.78)]) for (let t = 0; t <= 16; t++) {
        const x = Math.floor(cx + ((12 - cx) * t) / 16), y = Math.floor(cy + ((12 - cy) * t) / 16);
        v.box(x, y, zz, x + 1, y + 1, zz + 2, t % 3 === 1 ? C(0x6fb4d0, SMOOTH | COOL) : C(WHITE[0]));
      }
    };
    side(3.5, 20.5, 112); side(20.5, 3.5, 96);
    // climber cars on the visible faces
    for (const [z, L] of [[112, true], [152, false], [60, false]] as [number, boolean][]) {
      const f = Math.floor(12 + hwAt(z));
      const c: Col = (_x, _y, zz) => C(zz === z || zz === z + 5 ? RUST[0] : zz === z + 3 ? 0x3c9cc4 : HULL, zz === z + 3 ? SMOOTH | COOL : 0);
      if (L) v.box(11, f, z, 13, f + 2, z + 6, c); else v.box(f, 11, z, f + 2, 13, z + 6, c);
    }
    // sky launch pad on a bracket over the forecourt
    const zp = 36;
    for (let t = 0; t < 8; t++) v.box(13 + t, 13 + t, zp - 2 - Math.max(0, 5 - t), 15 + t, 15 + t, zp, C(WHITE[1]));
    cyl(v, 19, 19, 4, zp - 1, zp, C(RUST[0])); padDisc(v, 19, 19, zp, 4, PADLIGHT, 0x8a8f98, 6);
    v.emit(19, 19, zp + 1, 'launch');
    // crown: counterweight station, cable and beacons
    const rt = hwAt(HT);
    cyl(v, 12, 12, rt + 2, HT, HT + 1, C(WHITE[0])); cyl(v, 12, 12, rt + 2.6, HT + 1, HT + 4, (x, y) => C(SKY, SMOOTH | ((x + y) % 3 === 0 ? COOL : WARM)));
    cyl(v, 12, 12, rt + 3, HT + 4, HT + 5, C(WHITE[0])); cyl(v, 12, 12, rt + 1, HT + 5, HT + 7, C(RUST[0]));
    hedge(v, r, 9, 9, 15, 15, HT + 5, 0.5);
    for (let z = HT + 7; z < HT + 64; z++) {
      const w = z < HT + 26 ? 2 : 1;
      v.box(12 - (w >> 1), 12 - (w >> 1), z, 12 - (w >> 1) + w, 12 - (w >> 1) + w, z + 1, C((z - HT) % 10 < 2 ? RUST[0] : (z & 1) ? 0xe6e9ee : 0xcfd5dc));
      if ((z - HT) % 14 === 8) v.set(12, 12, z, C(BEACON, EMIT));
    }
    ball(v, 12, 12, HT + 34, 3.4, 3, (_x, _y, z) => C(z === HT + 34 ? 0x3c9cc4 : z === HT + 32 ? RUST[0] : HULL, z === HT + 34 ? SMOOTH | COOL : SMOOTH));
    lights(v, 12, 12, HT + 34, 4.2, 6, PADLIGHT, 0.3); lights(v, 12.5, 12.5, HT + 50, 2.4, 4, CYAN, 0.8);
    v.set(12, 12, HT + 64, C(0xf4f8ff, EMIT)); v.set(12, 12, HT + 65, C(0xf4f8ff, EMIT));
    v.emit(12, 12, HT + 66, 'spark');
    return v;
  },
};
