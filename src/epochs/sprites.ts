import { ImageSource, Rectangle, Texture } from 'pixi.js';
import { render, SS, type Rendered } from './voxel';
import { baseItems, seeded, type Item } from './models_base';
import { CATS } from './catalog';

export { CATS };
export const counts = (E: number) => {
  const c = CATS[E - 1];
  return { small: c.small.length, large: c.large.length, huge: c.huge?.length ?? 0, mega: c.mega?.length ?? 0, fill: c.fill.length, sec: c.sec.length };
};

export interface Def {
  tex: Texture; light: Texture | null;
  ax: number; ay: number; w: number; h: number;
  emitters: { x: number; y: number; kind: string }[];
}

export function epochItems(E: number): Item[] {
  const c = CATS[E - 1], p = `e${E}:`, it: Item[] = [];
  c.small.forEach((m, i) => { for (let l = 0; l < 3; l++) for (let k = 0; k < 2; k++) it.push([`${p}s${i}:${l}:${k}`, (r) => m(r, l)]); });
  c.large.forEach((m, i) => { for (let l = 0; l < 3; l++) for (let k = 0; k < 2; k++) it.push([`${p}l${i}:${l}:${k}`, (r) => m(r, l)]); });
  (c.huge ?? []).forEach((m, i) => { for (let k = 0; k < 2; k++) it.push([`${p}h${i}:${k}`, (r) => m(r, 1 + k)]); });
  (c.mega ?? []).forEach((m, i) => it.push([`${p}m${i}`, (r) => m(r, 2)]));
  c.fill.forEach((m, i) => { for (let k = 0; k < 2; k++) it.push([`${p}f${i}:${k}`, (r) => m(r, 0)]); });
  c.sec.forEach((m, i) => it.push([`${p}c${i}`, (r) => m(r, 1)]));
  it.push([`${p}hero`, (r) => c.hero(r, 2)]);
  for (let d = 0; d < 3; d++) for (let k = 0; k < 2; k++) it.push([`${p}road:${d}:${k}`, (r) => c.road(r, d), 2]);
  for (let k = 0; k < 3; k++) it.push([`${p}pave:${k}`, (r) => c.pave(r), 2]);
  for (const d of [1, 2]) it.push([`${p}bridge:${d}`, (r) => c.bridge(r, d), 2]);
  return it;
}

export const renderItem = ([id, make, baseZ]: Item, seed: number): Rendered => {
  const rnd = seeded(id, seed);
  return render(make(rnd), Math.floor(rnd() * 1e9), baseZ ?? 0);
};

const groupOf = (id: string) => (id.charCodeAt(0) === 101 && id.indexOf(':') <= 3 ? parseInt(id.slice(1), 10) : 0);
const PAGE = 4096, GUT = 4;

/** Builds sprite groups lazily (0 = shared, 1..10 = epochs), each packed into atlas pages. */
export class Registry {
  defs = new Map<string, Def>();
  built = new Set<number>();
  private pages = new Map<number, { sources: ImageSource[]; ids: string[] }>();
  constructor(public seed: number) {}

  ensure(g: number): void {
    if (this.built.has(g) || g < 0 || g > CATS.length) return;
    this.built.add(g);
    const items = g === 0 ? baseItems() : epochItems(g);
    const rendered = items.map((it) => ({ id: it[0], r: renderItem(it, this.seed) }));
    // shelf-pack every canvas (sprite + optional light layer) into 4096px pages
    const rects: { c: HTMLCanvasElement; x: number; y: number; page: number }[] = [];
    for (const e of rendered) { rects.push({ c: e.r.canvas, x: 0, y: 0, page: 0 }); if (e.r.light) rects.push({ c: e.r.light, x: 0, y: 0, page: 0 }); }
    const sorted = [...rects].sort((a, b) => b.c.height - a.c.height);
    let x = GUT, y = GUT, rowH = 0, page = 0;
    const heights: number[] = [];
    for (const q of sorted) {
      if (x + q.c.width + GUT > PAGE) { x = GUT; y += rowH + GUT; rowH = 0; }
      if (y + q.c.height + GUT > PAGE) { heights[page] = y; page++; x = GUT; y = GUT; rowH = 0; }
      q.x = x; q.y = y; q.page = page; x += q.c.width + GUT; rowH = Math.max(rowH, q.c.height);
      heights[page] = y + rowH + GUT;
    }
    const sources = heights.map((hh, pi) => {
      let H = 64;
      while (H < hh) H *= 2;
      const atlas = document.createElement('canvas');
      atlas.width = PAGE; atlas.height = H;
      const ctx = atlas.getContext('2d')!;
      for (const q of rects) if (q.page === pi) ctx.drawImage(q.c, q.x, q.y);
      return new ImageSource({ resource: atlas, resolution: SS, scaleMode: 'linear', autoGenerateMipmaps: true, mipmapFilter: 'linear' });
    });
    const pos = new Map(rects.map((q) => [q.c, q]));
    const tex = (c: HTMLCanvasElement) => {
      const q = pos.get(c)!;
      return new Texture({ source: sources[q.page], frame: new Rectangle(q.x / SS, q.y / SS, c.width / SS, c.height / SS) });
    };
    for (const e of rendered)
      this.defs.set(e.id, { tex: tex(e.r.canvas), light: e.r.light ? tex(e.r.light) : null, ax: e.r.ax, ay: e.r.ay, w: e.r.w, h: e.r.h, emitters: e.r.emitters });
    this.pages.set(g, { sources, ids: rendered.map((e) => e.id) });
  }

  /** Free GPU memory of epochs that are no longer on screen. */
  evict(keep: Set<number>): void {
    for (const [g, pg] of this.pages) {
      if (g === 0 || keep.has(g)) continue;
      for (const id of pg.ids) { const d = this.defs.get(id); d?.tex.destroy(); d?.light?.destroy(); this.defs.delete(id); }
      for (const s of pg.sources) s.destroy();
      this.pages.delete(g); this.built.delete(g);
    }
  }

  get(id: string): Def {
    this.ensure(groupOf(id));
    const d = this.defs.get(id);
    if (!d) throw new Error(`missing sprite: ${id}`);
    return d;
  }
}
