/* ===================================================================== *
 * Hover effect for the back link: the same orbiting particle ring the
 * galaxy view draws around a selected object (buildHalo in atlas.js),
 * traced around the button's pill shape instead of a circle.
 *   - 32 particles orbiting just outside the edge, with a brightness sweep
 *   - 12 smaller ones hugging the edge, counter-rotating
 *   - 2 bright comets
 * Each particle uses the halo shader's falloff (HL_FS), pre-rendered once
 * per theme into a sprite. Draws into a small canvas around the link and
 * only animates while visible, so it costs nothing at rest.
 * ===================================================================== */
import { TAU, clamp, smooth } from './core.js';

const PAD = 24; // room around the button for the ring

function sprite(rgb, light) {
  // the halo fragment shader: two Gaussian lobes, a white-hot core in the dark theme
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const cx = (x + 0.5) / S * 2 - 1, cy = (y + 0.5) / S * 2 - 1, r2 = cx * cx + cy * cy, o = (y * S + x) * 4;
    if (r2 > 1) continue;
    const a = Math.min(1, Math.exp(-r2 * 4) * 0.8 + Math.exp(-r2 * 18) * 0.7);
    const wh = light ? 0 : Math.exp(-r2 * 18) * 0.35;
    img.data[o] = (rgb[0] + (255 - rgb[0]) * wh) | 0;
    img.data[o + 1] = (rgb[1] + (255 - rgb[1]) * wh) | 0;
    img.data[o + 2] = (rgb[2] + (255 - rgb[2]) * wh) | 0;
    img.data[o + 3] = (a * 255) | 0;
  }
  g.putImageData(img, 0, 0);
  return c;
}
function readAccent() {
  const cs = getComputedStyle(document.documentElement);
  const light = cs.getPropertyValue('--scene-light').trim() === '1';
  const m = /^#?([0-9a-f]{6})$/i.exec(cs.getPropertyValue('--accent').trim());
  const n = m ? parseInt(m[1], 16) : 0x62f0d8;
  return { rgb: [n >> 16 & 255, n >> 8 & 255, n & 255], light };
}

export function mountHalo(link) {
  const cv = document.createElement('canvas');
  cv.className = 'halo-fx';
  cv.setAttribute('aria-hidden', 'true');
  link.appendChild(cv);
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let on = false, p = 0, raf = 0, last = 0, spr = null, light = false, key = '';

  // a point `off` px outside the pill (width w, height h, centered at cx, cy), at s ∈ [0, 1) of its perimeter
  const pill = (w, h, off, s, cx, cy) => {
    const rr = h / 2 + off, L = Math.max(0, w - h), P = 2 * L + TAU * rr;
    let d = (((s % 1) + 1) % 1) * P;
    if (d < L) return [cx - L / 2 + d, cy - rr];
    d -= L;
    if (d < Math.PI * rr) { const a = -Math.PI / 2 + d / rr; return [cx + L / 2 + Math.cos(a) * rr, cy + Math.sin(a) * rr]; }
    d -= Math.PI * rr;
    if (d < L) return [cx + L / 2 - d, cy + rr];
    d -= L;
    const a = Math.PI / 2 + d / rr;
    return [cx - L / 2 + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  };
  const dot = (x, y, size, a) => {
    if (a <= 0.004 || size <= 0) return;
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(spr, x - size / 2, y - size / 2, size, size);
  };

  const frame = (now) => {
    const dt = clamp((now - last) / 1000, 0, 0.05); // a rAF stamp can predate the hover event
    last = now;
    p += ((on ? 1 : 0) - p) * Math.min(1, dt * 7);
    const r = link.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    const W = r.width + PAD * 2, H = r.height + PAD * 2;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    if (p < 0.01 && !on) { raf = 0; return; }
    const k = smooth(Math.min(1, p)), t = reducedMotion ? 0 : now / 1000;
    const cx = W / 2, cy = H / 2, w = r.width, h = r.height, grow = (1 - k) * 8;
    ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * TAU + t * 0.55;
      const sweep = 0.5 + 0.5 * Math.sin(a * 3 - t * 2.1);
      const [x, y] = pill(w, h, 5 + grow + Math.sin(t * 1.7 + i * 1.3) * 2.2, a / TAU, cx, cy);
      dot(x, y, (3.2 + sweep * 2.2) * k, (0.45 + 0.55 * sweep) * k);
    }
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU - t * 0.9;
      const [x, y] = pill(w, h, 1 + grow * 0.5 + Math.sin(t * 2.3 + i) * 1.2, a / TAU, cx, cy);
      dot(x, y, 2.4 * k, (0.55 + 0.3 * Math.sin(t * 3 + i * 2)) * k);
    }
    for (let i = 0; i < 2; i++) {
      const [x, y] = pill(w, h, 5 + grow, (t * 1.25 + i * Math.PI) / TAU, cx, cy);
      dot(x, y, 6 * k, k);
    }
    raf = requestAnimationFrame(frame);
  };
  const set = (v) => {
    on = v;
    if (v) {
      // pick up the theme's accent (dark: additive glow, light: printed ink), as the scene does
      const acc = readAccent(), next = acc.rgb.join() + acc.light;
      if (next !== key) { key = next; light = acc.light; spr = sprite(acc.rgb, light); }
    }
    if (!raf && spr) { last = performance.now(); raf = requestAnimationFrame(frame); }
  };
  link.addEventListener('mouseenter', () => set(true));
  link.addEventListener('mouseleave', () => set(false));
  link.addEventListener('focus', () => set(true));
  link.addEventListener('blur', () => set(false));
}
