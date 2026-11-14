import { hash } from './rng';

// Material flags (stored in the top byte of a voxel colour).
export const EMIT = 2; // self-lit: unshaded, glows at night
export const SMOOTH = 4; // very little colour noise (glass, metal)
export const ROUGH = 8; // per-pixel dithering (foliage, grass, thatch)
export const WARM = 16; // window that lights up warm at night
export const COOL = 32; // window that lights up cool at night (WARM|COOL = pink)

export const C = (hex: number, flags = 0) => ((((flags | 1) << 24) | (hex & 0xffffff)) >>> 0);
export type Col = number | ((x: number, y: number, z: number) => number);

export interface Emitter { x: number; y: number; z: number; kind: string }

/** Tiny voxel canvas. x grows to screen lower-right, y to lower-left, z up. */
export class Vox {
  data: Uint32Array;
  emitters: Emitter[] = [];
  constructor(public w: number, public d: number, public h: number) {
    this.data = new Uint32Array(w * d * h);
  }
  get(x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.d || z >= this.h) return 0;
    return this.data[(z * this.d + y) * this.w + x];
  }
  set(x: number, y: number, z: number, c: number): void {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.d || z >= this.h) return;
    this.data[(z * this.d + y) * this.w + x] = c;
  }
  /** Fill [x0,x1) x [y0,y1) x [z0,z1). Colour 0 carves. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col): void {
    for (let z = z0; z < z1; z++)
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) this.set(x, y, z, typeof c === 'number' ? c : c(x, y, z));
  }
  emit(x: number, y: number, z: number, kind: string): void {
    this.emitters.push({ x, y, z, kind });
  }
}

export interface Rendered {
  canvas: HTMLCanvasElement;
  light: HTMLCanvasElement | null;
  ax: number; // anchor (logical px) = centre of the footprint on the ground plane
  ay: number;
  w: number; h: number; // logical size; the canvases are SS x larger
  emitters: { x: number; y: number; kind: string }[]; // relative to anchor
}

const PAD = 4;
/** Sprites are stored at SS x the logical pixel size, upscaled with an edge-smoothing filter. */
export const SS = 2;

/** Scale2x (EPX): doubles the image while rounding stair-steps into cleaner diagonals. */
function scale2x(src: Uint32Array, w: number, h: number): Uint32Array {
  const out = new Uint32Array(w * h * 4), W = w * 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const P = src[y * w + x];
      const A = y > 0 ? src[(y - 1) * w + x] : 0, D = y < h - 1 ? src[(y + 1) * w + x] : 0;
      const C4 = x > 0 ? src[y * w + x - 1] : 0, B = x < w - 1 ? src[y * w + x + 1] : 0;
      const o = y * 2 * W + x * 2;
      out[o] = C4 === A && C4 !== D && A !== B ? A : P;
      out[o + 1] = A === B && A !== C4 && B !== D ? B : P;
      out[o + W] = D === C4 && D !== B && C4 !== A ? C4 : P;
      out[o + W + 1] = B === D && B !== A && D !== C4 ? D : P;
    }
  return out;
}
const HALO: [number, number][] = [
  [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1],
  [-2, 0], [2, 0], [0, -2], [0, 2], [-3, 0], [3, 0], [0, -3], [0, 3],
];

function toCanvas(buf: Uint32Array, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  new Uint32Array(img.data.buffer).set(buf);
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Painter's-algorithm isometric render: every voxel is a 4x4 pixel "cube"
 * (4x2 top, 2x2 left, 2x2 right). 8 voxels span one 32x16 ground tile.
 * `baseZ` is the voxel height that should sit on the ground plane.
 */
export function render(v: Vox, seed: number, baseZ = 0): Rendered {
  const { w, d } = v;
  let h = 1;
  outer: for (let z = v.h - 1; z >= 0; z--) {
    const off = z * w * d;
    for (let i = 0; i < w * d; i++) if (v.data[off + i]) { h = z + 1; break outer; }
  }
  const cw = (w + d) * 2 + PAD * 2;
  const ch = w + d + h * 2 + 2 + PAD * 2;
  const ox = PAD + d * 2, oy = PAD + h * 2;
  const buf = new Uint32Array(cw * ch);
  const lbuf = new Uint32Array(cw * ch);
  let hasLight = false;

  for (let s = 0; s <= w + d - 2; s++) {
    for (let x = Math.max(0, s - d + 1); x <= Math.min(w - 1, s); x++) {
      const y = s - x;
      for (let z = 0; z < h; z++) {
        const c = v.data[(z * d + y) * w + x];
        if (!c) continue;
        const top = !v.get(x, y, z + 1), lf = !v.get(x, y + 1, z), rt = !v.get(x + 1, y, z);
        if (!top && !lf && !rt) continue;
        const fl = c >>> 24;
        const cr = (c >> 16) & 255, cg = (c >> 8) & 255, cb = c & 255;
        const emit = (fl & EMIT) !== 0, rough = (fl & ROUGH) !== 0;
        const ns = rough ? 0.13 : fl & SMOOTH ? 0.02 : 0.055;
        const hv = hash(x, y, z, seed);
        const vn = hv < 0.22 ? -ns : hv > 0.78 ? ns : 0;
        const px = ox + (x - y) * 2 - 2, py = oy + (x + y) - (z + 1) * 2;
        const lit = fl & (WARM | COOL);
        const lcol = lit === (WARM | COOL) ? 0xffd88aff : lit === WARM ? 0xff8ad9ff : 0xffffe69f; // ABGR
        const put = (X: number, Y: number, f: number, side: boolean) => {
          const i = Y * cw + X;
          if (emit) {
            const col = (0xff000000 | (cb << 16) | (cg << 8) | cr) >>> 0;
            buf[i] = col; lbuf[i] = col; hasLight = true;
            return;
          }
          let n = vn;
          if (rough) { const hp = hash(X, Y, seed); n = hp < 0.25 ? -ns : hp > 0.75 ? ns : 0; }
          const m = f * (1 + n);
          const r = Math.min(255, cr * m), g = Math.min(255, cg * m);
          const b = Math.min(255, cb * (f + (1 - f) * 0.22) * (1 + n));
          buf[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
          if (lit && side) { lbuf[i] = lcol; hasLight = true; } else lbuf[i] = 0;
        };
        if (top) {
          let f = 1;
          if (v.get(x - 1, y, z + 1) || v.get(x, y + 1, z + 1)) f = 0.74;
          else if (v.get(x + 1, y, z + 1) || v.get(x, y - 1, z + 1)) f = 0.9;
          for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) put(px + i, py + j, f, false);
        }
        const g0 = z === 0 && baseZ === 0 ? 0.93 : 1;
        if (lf) for (let j = 2; j < 4; j++) for (let i = 0; i < 2; i++) put(px + i, py + j, 0.86 * g0, true);
        if (rt) for (let j = 2; j < 4; j++) for (let i = 2; i < 4; i++) put(px + i, py + j, 0.64 * g0, true);
      }
    }
  }

  const canvas = toCanvas(scale2x(buf, cw, ch), cw * SS, ch * SS);
  let light: HTMLCanvasElement | null = null;
  if (hasLight) {
    const raw = toCanvas(scale2x(lbuf, cw, ch), cw * SS, ch * SS);
    light = document.createElement('canvas');
    light.width = cw * SS; light.height = ch * SS;
    const ctx = light.getContext('2d')!;
    ctx.globalAlpha = 0.085;
    for (const [dx, dy] of HALO) ctx.drawImage(raw, dx * SS, dy * SS);
    ctx.globalAlpha = 1;
    ctx.drawImage(raw, 0, 0);
  }
  const ax = ox + (w - d), ay = oy + (w + d) / 2 - baseZ * 2;
  return {
    canvas, light, ax, ay, w: cw, h: ch,
    emitters: v.emitters.map((e) => ({ x: ox + (e.x - e.y) * 2 - ax, y: oy + (e.x + e.y) - e.z * 2 - ay, kind: e.kind })),
  };
}
