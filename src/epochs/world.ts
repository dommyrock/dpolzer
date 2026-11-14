import { hash, fbm, noise, rng, pick, clamp } from './rng';

export const N = 160, CX = 80, CY = 80;
export const EPOCHS = 14, ZONES = 5, STEPS = EPOCHS * ZONES;
/** Outer radius (in tiles) of each epoch's ring of land. After epoch 5 the city spreads to twice the size. */
export const RING = [4.6, 7.6, 10.6, 13.6, 16.6, 23, 31, 40, 49.5, 59.4, 64.6, 69, 73, 76.6];

export const epochOf = (step: number) => Math.floor(step / ZONES) + 1;
export const zoneOf = (step: number) => (step % ZONES) + 1;

export interface Tile {
  i: number; x: number; y: number;
  water: boolean; zone: number; // unlock step, 99 = never (outer wilds)
  biome: 0 | 1 | 2; // grass, forest, sand
  dist: number; edge: boolean;
  sx: number; sy: number; // street class on this column / row: 0 none, 1 main, 2 minor, 3 arterial
  psize: number; origin: number; // parcel size + origin tile index
  special: '' | 'hero' | 'sec' | 'mega'; secIdx: number;
  dn: number; // where in the building-type lists this tile's district draws from (0..1)
  dk: number; // district kind: 0 high-rise core, 1 mid-rise, 2 low-rise, 3 park, 4 plaza
  dt: number; // district colour index into DISTRICT_TINT
  shore: boolean; lake: boolean; // lake = still water that only the arterial roads bridge
  h1: number; h2: number; h3: number; h4: number; hc: number;
}

export interface Plan { ground: string[]; obj: string[]; objN: Uint8Array; locked: Uint8Array; roads: number[]; free: number[] }

/** Each district washes its buildings and ground with one of these, so the city reads as coloured quarters from afar. */
export const DISTRICT_TINT: [number, number, number][] = [
  [1, 1, 1], [1, 0.84, 0.68], [0.7, 0.86, 1], [1, 0.74, 0.86], [0.74, 1, 0.8], [1, 0.94, 0.6], [0.84, 0.76, 1],
];
/** How strongly that wash is applied in each epoch. */
export const TINT_STRENGTH = [0, 0, 0, 0.25, 0.3, 0.45, 0.55, 0.6, 0.55, 0.55, 0.75, 0.75, 0.75, 0.75];

type Counts = (E: number) => { small: number; large: number; huge: number; mega: number; fill: number; sec: number };

const OCC = [0.34, 0.42, 0.56, 0.76, 0.86, 0.9, 0.9, 0.9, 0.93, 0.93, 0.9, 0.9, 0.9, 0.9];
const LARGE = [0.3, 0.38, 0.48, 0.62, 0.72, 0.76, 0.82, 0.86, 0.9, 0.92, 0.9, 0.9, 0.9, 0.9];
const TREE = [0.3, 0.2, 0.18, 0.1, 0.09, 0.05, 0.1, 0.12, 0.06, 0.05, 0.24, 0.2, 0.18, 0.18];
const FILL = [0.2, 0.55, 0.42, 0.26, 0.26, 0.22, 0.26, 0.26, 0.24, 0.24, 0.3, 0.28, 0.28, 0.28];

export class World {
  tiles: (Tile | null)[] = new Array(N * N).fill(null);
  order: number[] = []; // land tiles, back to front

  constructor(public seed: number, private counts: Counts) {
    const r = rng(seed);
    const ringOff = RING.map(() => r() * Math.PI * 2);
    // two rivers: one close to the first camp, one far out
    const a1 = r() * Math.PI, a2 = a1 + Math.PI / 2 + (r() - 0.5) * 0.7;
    const rivers = [
      { dx: Math.cos(a1), dy: Math.sin(a1), off: 7.8, ph: r() * 6, w: 1.05 },
      { dx: Math.cos(a2), dy: Math.sin(a2), off: -(30 + r() * 6), ph: r() * 6, w: 1.5 },
    ];
    // streets: irregular grid. One arterial column + row run the full island and reach the city from all sides.
    const sxs = new Uint8Array(N), sys = new Uint8Array(N);
    for (const arr of [sxs, sys]) {
      arr[CX - 2] = 1; arr[CX + 2] = 3;
      for (const dir of [1, -1]) {
        let p = CX + 2 * dir, i = 0;
        for (;;) { p += dir * pick(r, [4, 5, 5, 6]); if (p < 1 || p > N - 2) break; arr[p] = ++i % 2 === 0 ? 1 : 2; }
      }
    }
    // districts: Voronoi cells, each with a character (how tall, how green), a slice of the building lists and a colour
    const cells = [{ x: CX, y: CY, k: 0, tb: r(), ti: 0 }];
    for (let i = 0; i < 64; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 77, u = r();
      const k = u < 0.2 - (d / 77) * 0.08 ? 0 : u < 0.5 ? 1 : u < 0.76 ? 2 : u < 0.93 ? 3 : 4;
      cells.push({ x: CX + Math.cos(a) * d, y: CY + Math.sin(a) * d, k, tb: r(), ti: 1 + Math.floor(r() * 6) });
    }
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const ex = x + 0.5 - CX, ey = y + 0.5 - CY, d0 = Math.hypot(ex, ey);
        if (d0 > 78 + (fbm(x * 0.13, y * 0.13, seed + 1) - 0.5) * 2.3) continue;
        const hero = x >= CX - 1 && x <= CX + 1 && y >= CY - 1 && y <= CY + 1;
        const rr = d0 + (fbm(x * 0.17, y * 0.17, seed + 2) - 0.5) * 1.7;
        let e = RING.findIndex((v) => rr < v);
        let zone = 99;
        if (e >= 0) {
          const th = Math.atan2(ey, ex) + ringOff[e] + (noise(x * 0.2, y * 0.2, seed + 4) - 0.5) * 0.5;
          const f = (((th / (Math.PI * 2)) % 1) + 1) % 1;
          zone = e * 5 + Math.floor(f * 5);
        }
        if (hero) { zone = 0; e = 0; }
        let water = false, near = false;
        for (const rv of rivers) {
          const qx = CX - rv.dy * rv.off, qy = CY + rv.dx * rv.off;
          const along = (x - qx) * rv.dx + (y - qy) * rv.dy;
          const across = (x - qx) * -rv.dy + (y - qy) * rv.dx + Math.sin(along * 0.3 + rv.ph) * 1.9 + (noise(x * 0.3, y * 0.3, seed + 5) - 0.5) * 1.2;
          if (Math.abs(across) < rv.w) water = true;
          if (Math.abs(across) < rv.w + 1.2) near = true;
        }
        // a few ponds
        const river = water;
        if (noise(x * 0.11, y * 0.11, seed + 8) > 0.9 && d0 > 12) water = true;
        if (noise(x * 0.045, y * 0.045, seed + 18) > 0.8 && d0 > 15) water = true; // lakes
        if (hero) water = false;
        const f1 = fbm(x * 0.09, y * 0.09, seed + 3);
        const sandy = near || noise(x * 0.07, y * 0.07, seed + 6) > 0.78 || d0 > 77.2;
        const i = y * N + x;
        const wx = x + (noise(x * 0.15, y * 0.15, seed + 20) - 0.5) * 5, wy = y + (noise(x * 0.15, y * 0.15, seed + 21) - 0.5) * 5;
        let cell = cells[0], cd = 1e9;
        for (const q of cells) { const dd = (q.x - wx) ** 2 + (q.y - wy) ** 2; if (dd < cd) { cd = dd; cell = q; } }
        this.tiles[i] = {
          i, x, y, water, zone, biome: sandy ? 2 : f1 > 0.43 ? 1 : 0, dist: d0, edge: false,
          sx: sxs[x], sy: sys[y], psize: 1, origin: i, special: '', secIdx: 0,
          dn: cell.tb, dk: cell.k, dt: cell.ti, shore: near, lake: water && !river && !hero,
          h1: hash(x, y, seed, 1), h2: hash(x, y, seed, 2), h3: hash(x, y, seed, 3), h4: hash(x, y, seed, 4), hc: hash(x >> 1, y >> 1, seed, 5),
        };
      }
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? null : this.tiles[y * N + x]);
    const taken = new Uint8Array(N * N);
    // hero plot
    const ho = (CY - 1) * N + (CX - 1);
    for (let y = CY - 1; y <= CY + 1; y++) for (let x = CX - 1; x <= CX + 1; x++) { const t = at(x, y)!; t.psize = 3; t.origin = ho; t.special = 'hero'; taken[t.i] = 1; }
    const lot = (t: Tile | null, zone: number): t is Tile => !!t && !t.water && !t.sx && !t.sy && !taken[t.i] && t.zone === zone;
    const claim = (t: Tile, n: number): boolean => {
      const q: Tile[] = [];
      for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) { const o = at(t.x + dx, t.y + dy); if (!lot(o, t.zone)) return false; q.push(o); }
      for (const o of q) { o.psize = n; o.origin = t.i; taken[o.i] = 1; }
      return true;
    };
    for (const t of this.tiles) if (t) t.edge = !at(t.x + 1, t.y) || !at(t.x, t.y + 1);
    // 3x3 plots for megastructures (outer city only), then 2x2 plots
    for (const t of this.tiles) if (t && t.zone !== 99 && t.zone >= 15 && hash(t.x, t.y, seed, 7) < 0.1) claim(t, 3);
    for (const t of this.tiles) if (t && t.zone !== 99 && hash(t.x, t.y, seed, 6) < 0.66) claim(t, 2);
    // three supertall plots spread around the mid city; they rise in the last three zones of the final epoch
    const ma = r() * Math.PI * 2;
    for (let m = 0; m < 3; m++) {
      const tx = CX + Math.cos(ma + (m * Math.PI * 2) / 3) * 25, ty = CY + Math.sin(ma + (m * Math.PI * 2) / 3) * 25;
      let best: Tile | null = null, bd = 1e9;
      for (const t of this.tiles) {
        if (!t || t.psize !== 3 || t.origin !== t.i || t.special || t.zone > 44) continue;
        const d = Math.hypot(t.x + 1.5 - tx, t.y + 1.5 - ty);
        if (d < bd) { bd = d; best = t; }
      }
      if (best) for (const t of this.tiles) if (t && t.origin === (best as Tile).i) { t.special = 'mega'; t.secIdx = m; }
    }
    // secondary landmark plots: more of them as the rings get bigger
    let k = 0;
    for (let ring = 1; ring < RING.length; ring++) {
      const n = ring < 5 ? ring % 2 : ring - 3;
      const cand = this.tiles.filter((t): t is Tile => !!t && t.psize === 2 && t.origin === t.i && Math.floor(t.zone / 5) === ring).sort((a, b) => b.h2 - a.h2);
      for (const best of cand.slice(0, n)) { for (const t of this.tiles) if (t && t.origin === best.i) { t.special = 'sec'; t.secIdx = k; } k++; }
    }
    this.order = this.tiles.filter((t): t is Tile => !!t).sort((a, b) => a.x + a.y - (b.x + b.y) || a.x - b.x).map((t) => t.i);
  }

  private wild(t: Tile, dens: number, biome: number = t.biome): string {
    if (t.h1 >= dens) return '';
    const k = t.h4, v = Math.floor(t.h2 * 97);
    if (biome === 2) return k < 0.45 ? `palm:${v % 2}` : k < 0.75 ? `rock:${v % 2}` : `bush:${v % 4}`;
    if (biome === 0) return k < 0.4 ? `bush:${v % 4}` : k < 0.65 ? `oak:${v % 6}` : k < 0.85 ? `blossom:${v % 3}` : `rock:${v % 2}`;
    return k < 0.52 ? `oak:${v % 6}` : k < 0.78 ? `pine:${v % 4}` : k < 0.87 ? `blossom:${v % 3}` : k < 0.94 ? `autumn:${v % 3}` : `bush:${v % 4}`;
  }

  /** The whole city is a pure function of (seed, step) so the slider can scrub freely. */
  plan(step: number): Plan {
    const E = epochOf(step), p = `e${E}:`, c = this.counts(E);
    const ground: string[] = new Array(N * N).fill(''), obj: string[] = new Array(N * N).fill('');
    const objN = new Uint8Array(N * N), locked = new Uint8Array(N * N);
    const roads: number[] = [], free: number[] = [];
    const nat = (t: Tile, tree: boolean) =>
      t.biome === 2 ? `sand:${Math.floor(t.h4 * 4)}` : t.biome === 1 && tree ? `forest:${Math.floor(t.h4 * 4)}` : `grass:${Math.floor(t.h4 * 6)}`;
    const rad = RING[E - 1] + 1;
    const green = E >= 11; // biophilic epochs keep living ground between buildings
    // which street classes carry a road here: arterials always, mains reach one ring ahead of the city
    const on = (cls: number, lock: boolean, ring: number) =>
      cls === 3 ? true : cls === 1 ? E >= 2 && (!lock || ring <= E) : cls === 2 ? !lock && E >= 4 : false;
    // pick a building type so that neighbourhoods share a look but still mix
    const kind = (t: Tile, n: number) => Math.floor(((((t.dn + (t.h4 - 0.5) * 0.36) % 1) + 1) % 1) * n);
    for (const i of this.order) {
      const t = this.tiles[i]!;
      const lock = t.zone > step, ring = Math.floor(t.zone / 5);
      locked[i] = lock ? 1 : 0;
      const rx = on(t.sx, lock, ring), ry = on(t.sy, lock, ring);
      if (t.water) {
        if (t.lake ? (t.sx === 3 || t.sy === 3) : rx || ry) { ground[i] = `${p}bridge:${(t.lake ? t.sy === 3 : ry) ? 1 : 2}`; roads.push(i); }
        else ground[i] = `water:${(t.x + t.y * 3) & 3}`;
        continue;
      }
      if (rx || ry) { ground[i] = `${p}road:${rx && ry ? 0 : ry ? 1 : 2}:${(t.x + t.y) & 1}`; roads.push(i); continue; }
      if (lock) {
        const tr = this.wild(t, t.biome === 1 ? 0.74 : t.biome === 0 ? 0.18 : 0.2);
        obj[i] = tr; objN[i] = 1; ground[i] = nat(t, tr !== '');
        continue;
      }
      const age = step - t.zone, dev = Math.min(1, 0.25 + age * 0.15);
      const cen = clamp(1 - t.dist / rad, 0, 1);
      const pave = `${p}pave:${Math.floor(t.h4 * 3)}`;
      const o = this.tiles[t.origin]!;
      const dk = o.dk >= 3 && E < 4 ? 2 : o.dk;
      const park = dk === 3 || (o.shore && E >= 6); // green districts and riverside promenades
      const plaza = dk === 4;
      // skyline: tall only in the core districts and towards the centre, low elsewhere
      const lvl = (h: number) => Math.floor(clamp([1.75, 0.95, 0.15, 0, 0.3][dk] + cen * 0.55 + (h - 0.5) * 0.9 + (dev - 1) * 1.1, 0, 2.999));
      if (t.special === 'hero') { ground[i] = pave; if (t.origin === i) { obj[i] = `${p}hero`; objN[i] = 3; } continue; }
      if (t.special === 'sec') { ground[i] = pave; if (t.origin === i) { obj[i] = `${p}c${t.secIdx % c.sec}`; objN[i] = 2; } continue; }
      // supertalls: one per zone at the end of epoch 10, standing from then on
      if (t.special === 'mega' && c.mega > 0 && (E > 10 || zoneOf(step) >= 3 + t.secIdx)) {
        ground[i] = pave;
        if (t.origin === i) { obj[i] = `${p}m${t.secIdx % c.mega}`; objN[i] = 3; }
        continue;
      }
      const big = !park && o.h2 < LARGE[E - 1] * (dev * 1.25 - 0.22) * [1, 0.85, 0.22, 0, 0.12][dk];
      if (t.psize === 3 && c.huge > 0 && big) {
        ground[i] = pave;
        if (t.origin === i) { obj[i] = `${p}h${kind(o, c.huge)}:${o.h1 < 0.5 ? 0 : 1}`; objN[i] = 3; }
        continue;
      }
      if (t.psize === 2 && big) {
        ground[i] = pave;
        if (t.origin === i) { obj[i] = `${p}l${kind(o, c.large)}:${lvl(o.h3)}:${o.h1 < 0.5 ? 0 : 1}`; objN[i] = 2; }
        continue;
      }
      objN[i] = 1;
      const tree = park ? 0.5 : plaza ? 0.04 : TREE[E - 1] + (dk === 2 ? 0.1 : 0);
      const fillP = plaza ? 0.42 : FILL[E - 1];
      if (t.h1 < dev * OCC[E - 1] * (park ? 0.08 : [1, 0.92, 0.75, 0.08, 0.2][dk])) {
        ground[i] = pave;
        obj[i] = `${p}s${kind(t, c.small)}:${lvl(t.h2)}:${t.h3 < 0.5 ? 0 : 1}`;
      } else if (t.h3 < tree) {
        obj[i] = this.wild(t, 1, t.biome === 2 ? 2 : 1); ground[i] = E >= 9 && !park && !green ? pave : nat(t, true);
      } else if (t.h3 < tree + fillP) {
        obj[i] = `${p}f${Math.floor(t.hc * c.fill)}:${t.h2 < 0.5 ? 0 : 1}`; ground[i] = (E >= 6 && !park && !green) || plaza ? pave : nat(t, false);
      } else { ground[i] = (E >= 7 && !park && !green) || plaza ? pave : nat(t, false); free.push(i); }
    }
    return { ground, obj, objN, locked, roads, free };
  }
}
