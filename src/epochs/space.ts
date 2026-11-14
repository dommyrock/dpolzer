// The Moon and Mars: dithered pixel-art spheres drawn straight onto a canvas.
import { fbm, hash, noise } from './rng';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const PAL = {
  moon: [0x232733, 0x424755, 0x676c7a, 0x9296a2, 0xbfc2c9, 0xe4e6ea],
  mars: [0x34160f, 0x5f2617, 0x8f3e24, 0xbd5c35, 0xdb8752, 0xf2bd8e],
};

/** `R` is the radius in art pixels; the canvas is drawn in 2x2 blocks to match the sprite scale. */
export function makeBody(kind: 'moon' | 'mars', R: number, seed: number): HTMLCanvasElement {
  const S = R * 2 + 2, pal = PAL[kind];
  const craters: [number, number, number][] = [];
  for (let i = 0; i < (kind === 'moon' ? 30 : 10); i++) {
    const a = hash(i, seed, 1) * 6.283, rr = Math.sqrt(hash(i, seed, 2)) * 0.85;
    craters.push([Math.cos(a) * rr, Math.sin(a) * rr, 0.04 + hash(i, seed, 3) * (kind === 'moon' ? 0.13 : 0.07)]);
  }
  const c = document.createElement('canvas');
  c.width = c.height = S * 2;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S * 2, S * 2), px = new Uint32Array(img.data.buffer);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (x - S / 2 + 0.5) / R, dy = (y - S / 2 + 0.5) / R, d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      let alb = 0.62 + (fbm(x * 0.05, y * 0.05, seed) - 0.5) * 0.75;
      if (kind === 'mars') {
        if (noise(x * 0.025 + 3, y * 0.06, seed + 4) > 0.62) alb -= 0.2; // dark plains
        if (dy < -0.82 + noise(x * 0.09, 1, seed) * 0.1) alb = 1.5; // polar cap
      } else if (noise(x * 0.03, y * 0.03, seed + 2) > 0.6) alb -= 0.16; // maria
      for (const [cx, cy, cr] of craters) {
        const dd = Math.hypot(dx - cx, dy - cy) / cr;
        if (dd < 0.85) alb -= 0.2 * (1 - dd * 0.6);
        else if (dd < 1.1) alb += dx - cx + (dy - cy) > 0 ? 0.14 : -0.04; // lit far rim
      }
      const light = Math.max(0, -0.48 * dx - 0.55 * dy + 0.68 * nz);
      const v = alb * (0.08 + light * 1.2);
      const idx = Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length + (BAYER[(x & 3) + (y & 3) * 4] / 16 - 0.5) * 0.9)));
      const col = pal[idx];
      const abgr = (0xff000000 | ((col & 0xff) << 16) | (col & 0xff00) | (col >> 16)) >>> 0;
      const o = y * 2 * S * 2 + x * 2;
      px[o] = px[o + 1] = px[o + S * 2] = px[o + S * 2 + 1] = abgr;
    }
  ctx.putImageData(img, 0, 0);
  return c;
}
