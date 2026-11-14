export type R = () => number;

function mix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Deterministic integer hash -> [0,1). */
export function hash(a: number, b = 0, c = 0, d = 0): number {
  return mix(mix(mix(mix((a | 0) + 0x9e3779b9) + (b | 0)) + (c | 0)) + (d | 0)) / 4294967296;
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return mix(h);
}

export function rng(seed: number): R {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(r: R, a: T[]): T => a[Math.floor(r() * a.length)];
export const irand = (r: R, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise in [0,1). */
export function noise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = smooth(x - xi), fy = smooth(y - yi);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export function fbm(x: number, y: number, seed: number): number {
  return noise(x, y, seed) * 0.6 + noise(x * 2.1, y * 2.1, seed + 7) * 0.28 + noise(x * 4.3, y * 4.3, seed + 13) * 0.12;
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => smooth(clamp((v - a) / (b - a), 0, 1));
