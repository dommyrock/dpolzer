/* ===================================================================== *
 * Galaxy Atlas — shared core: math, the seeded RNG, sky coordinates,
 * formatting and the catalog vocabularies every galaxy uses.
 * ===================================================================== */

export const TAU = Math.PI * 2, DEG = Math.PI / 180;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (t) => t * t * (3 - 2 * t);
export const nf = new Intl.NumberFormat('en-US');
export const fmtInt = (n) => nf.format(Math.round(n));
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export const sup = (n) => String(n).replace('-', '⁻').replace(/\d/g, (d) => SUP[d]);
export const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

/* ---------- seeded RNG: each galaxy reseeds, so it looks the same on every load ---------- */
let rs = 0;
export function seed(s) { rs = s >>> 0; }
export function rand() {
  rs = (rs + 0x6D2B79F5) >>> 0;
  let t = rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function gauss() { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rand()); }
export const range = (a, b) => a + (b - a) * rand();
export const logRange = (a, b) => Math.exp(range(Math.log(a), Math.log(b)));
export const irange = (a, b) => a + Math.floor(rand() * (b - a + 1));
export const pick = (a) => a[(rand() * a.length) | 0];
export function wIndex(ws) { let s = 0; for (const w of ws) s += w; let r = rand() * s; for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r <= 0) return i; } return ws.length - 1; }
/** Exponential disk radius with scale length h, starting at r0, cut at rMax. */
export function expR(r0, h, rMax) { let r; do { r = r0 - h * Math.log(1 - rand() * 0.99); } while (r > rMax); return r; }

/* ---------- sky coordinates ---------- */
const A_NGP = 192.85948 * DEG, D_NGP = 27.12825 * DEG, L_NCP = 122.93192 * DEG;
export function equatorial(l, b) { // galactic -> J2000 RA/Dec, degrees
  l *= DEG; b *= DEG;
  const dec = Math.asin(clamp(Math.sin(D_NGP) * Math.sin(b) + Math.cos(D_NGP) * Math.cos(b) * Math.cos(L_NCP - l), -1, 1));
  const y = Math.cos(b) * Math.sin(L_NCP - l);
  const x = Math.cos(D_NGP) * Math.sin(b) - Math.sin(D_NGP) * Math.cos(b) * Math.cos(L_NCP - l);
  let ra = (A_NGP + Math.atan2(y, x)) / DEG; ra = ((ra % 360) + 360) % 360;
  return { ra, dec: dec / DEG };
}
export function galFromEq(ra, dec) { // J2000 RA/Dec -> galactic, degrees
  ra *= DEG; dec *= DEG;
  const b = Math.asin(clamp(Math.sin(dec) * Math.sin(D_NGP) + Math.cos(dec) * Math.cos(D_NGP) * Math.cos(ra - A_NGP), -1, 1));
  const y = Math.cos(dec) * Math.sin(ra - A_NGP);
  const x = Math.sin(dec) * Math.cos(D_NGP) - Math.cos(dec) * Math.sin(D_NGP) * Math.cos(ra - A_NGP);
  let l = (L_NCP - Math.atan2(y, x)) / DEG; l = ((l % 360) + 360) % 360;
  return { l, b: b / DEG };
}
export const parseRA = (s) => { const [h, m = 0, x = 0] = s.split(' ').map(Number); return (h + m / 60 + x / 3600) * 15; };
export const parseDec = (s) => { const sg = s.trim()[0] === '-' ? -1 : 1; const [d, m = 0, x = 0] = s.replace(/^[+-]/, '').split(' ').map(Number); return sg * (d + m / 60 + x / 3600); };

/**
 * Sky position of a point in an external galaxy. The galaxy frame has its
 * disk in XZ with +Y the disk normal and +X the major axis; `sky` gives the
 * center's RA/Dec (deg), the major axis position angle (deg, N through E),
 * the inclination (deg, 0 = face-on) and the distance (kly). Small-angle
 * projection, which is plenty for objects arcminutes to a few degrees out.
 */
export function skyProject(sky, x, y, z) {
  const i = sky.incl * DEG, pa = sky.pa * DEG;
  const a = x;                                    // along the major axis
  const b = y * Math.sin(i) - z * Math.cos(i);    // along the projected minor axis
  const los = y * Math.cos(i) + z * Math.sin(i);  // toward the observer
  const north = a * Math.cos(pa) - b * Math.sin(pa), east = a * Math.sin(pa) + b * Math.cos(pa);
  const dec = sky.dec + north / sky.dist / DEG;
  const ra = (((sky.ra + east / sky.dist / DEG / Math.cos(sky.dec * DEG)) % 360) + 360) % 360;
  return { ra, dec, earth: sky.dist - los };
}

export const p2 = (n) => String(n).padStart(2, '0');
export function sexa(v) { const a = Math.abs(v); let D = Math.floor(a), M = Math.floor((a - D) * 60), S = (a - D - M / 60) * 3600; if (S >= 59.95) { S = 0; M += 1; } if (M >= 60) { M = 0; D += 1; } return [D, M, S]; }
export function fmtRA(ra) { const [H, M, S] = sexa(ra / 15); return `${p2(H)}h ${p2(M)}m ${S.toFixed(1).padStart(4, '0')}s`; }
export function fmtDec(dec) { const [D, M, S] = sexa(dec); return `${dec < 0 ? '−' : '+'}${p2(D)}° ${p2(M)}′ ${p2(Math.floor(S))}″`; }
export const hhmm = (ra) => { const [H, M] = sexa(ra / 15); return p2(H) + p2(M); };
export const ddmm = (dec) => { const [D, M] = sexa(dec); return (dec < 0 ? '-' : '+') + p2(D) + p2(M); };
/** IAU-style "Jhhmmss.s±ddmmss" designation. */
export function jname(ra, dec) {
  const [H, M, S] = sexa(ra / 15), [D, DM, DS] = sexa(dec);
  return `J${p2(H)}${p2(M)}${Math.min(S, 59.9).toFixed(1).padStart(4, '0')}${dec < 0 ? '-' : '+'}${p2(D)}${p2(DM)}${p2(Math.min(Math.floor(DS), 59))}`;
}

/* ---------- formatting ---------- */
export function fmtDist(kly) {
  if (kly < 1e-6) return '0';
  if (kly < 0.0995) return `${(kly * 1000).toFixed(1)} ly`;
  if (kly < 1) return `${fmtInt(kly * 1000)} ly`;
  if (kly < 10) return `${kly.toFixed(2)} kly`;
  if (kly < 1000) return `${kly.toFixed(1)} kly`;
  return `${(kly / 1000).toFixed(kly < 1e5 ? 2 : 0)} Mly`;
}
export function sci(v) { const e = Math.floor(Math.log10(v)); const m = v / Math.pow(10, e); return `${m.toFixed(1)} × 10${sup(e)}`; }
export function sig(v) { if (v == null) return '—'; if (v >= 1000) return fmtInt(Number(v.toPrecision(3))); if (v >= 1) return String(Number(v.toPrecision(3))); return String(Number(v.toPrecision(2))); }
export function fmtMass(m) { if (m >= 1e9) return `${(m / 1e9).toFixed(1)} billion M☉`; if (m >= 1e5) return `${(m / 1e6).toFixed(1)} million M☉`; return `${sig(m)} M☉`; }
export function fmtPeriod(dy) { if (dy < 1) return `${(dy * 24).toFixed(1)}-hour`; if (dy < 1000) return `${dy < 10 ? dy.toFixed(2) : dy.toFixed(1)}-day`; return `${(dy / 365.25).toFixed(1)}-year`; }
export function fmtPeriodVal(dy) { if (dy < 1) return `${(dy * 24).toFixed(1)} h`; if (dy < 1000) return `${dy < 10 ? dy.toFixed(2) : dy.toFixed(1)} days`; return `${(dy / 365.25).toFixed(1)} years`; }
export function fmtSpin(s) { return s < 0.1 ? `${(s * 1000).toFixed(2)} ms` : `${s.toFixed(3)} s`; }
export function fmtYears(y) { if (y >= 1e9) return `${(y / 1e9).toFixed(1)} Gyr`; if (y >= 1e6) return `${(y / 1e6).toFixed(1)} Myr`; if (y >= 1e3) return `${(y / 1e3).toFixed(1)} kyr`; return `${fmtInt(y)} yr`; }
export function fmtAgeGyr(g) { return g < 0.1 ? `${fmtInt(g * 1000)} Myr` : `${g.toFixed(g < 1 ? 2 : 1)} Gyr`; }
export const fmtLB = (o) => `${o.l.toFixed(2)}°, ${o.b < 0 ? '−' : '+'}${Math.abs(o.b).toFixed(2)}°`;

/* ===================================================================== *
 * Catalog vocabularies (shared by every galaxy)
 * ===================================================================== */
export const TYPES = [
  { id: 'star', label: 'Stars', one: 'Star', color: 'var(--c-g)' },
  { id: 'planet', label: 'Planets', one: 'Planet', color: 'var(--c-k)' },
  { id: 'pulsar', label: 'Pulsars', one: 'Pulsar', color: 'var(--accent)' },
  { id: 'nebula', label: 'Nebulae', one: 'Nebula', color: 'var(--halpha)' },
  { id: 'cluster', label: 'Clusters', one: 'Cluster', color: 'var(--c-a)' },
  { id: 'bh', label: 'Black holes', one: 'Black hole', color: 'var(--muted)' },
];
export const STAR = 0, PLANET = 1, PULSAR = 2, NEBULA = 3, CLUSTER = 4, BH = 5;
export const GLYPH = [
  '<svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.4" fill="currentColor" opacity=".2"/><circle cx="7" cy="7" r="2.6" fill="currentColor"/></svg>',
  '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor"><circle cx="7" cy="7" r="3" fill="currentColor" stroke="none"/><ellipse cx="7" cy="7" rx="6.2" ry="2" transform="rotate(-22 7 7)" stroke-width="1.1"/></svg>',
  '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M1.5 12.5 12.5 1.5" stroke-width="1.1" opacity=".75"/><circle cx="7" cy="7" r="2.4" fill="currentColor" stroke="none"/></svg>',
  '<svg viewBox="0 0 14 14"><circle cx="5.6" cy="7.4" r="4.4" fill="currentColor" opacity=".45"/><circle cx="8.8" cy="6" r="3.6" fill="currentColor" opacity=".7"/></svg>',
  '<svg viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="7" r="1.6"/><circle cx="3.4" cy="5" r="1.2"/><circle cx="10.4" cy="4.4" r="1.2"/><circle cx="4.6" cy="10.4" r="1.2"/><circle cx="10" cy="9.8" r="1.2"/></svg>',
  '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor"><circle cx="7" cy="7" r="4.6" stroke-width="1.6"/><circle cx="7" cy="7" r="2.4" fill="currentColor" opacity=".25" stroke="none"/></svg>',
];

export const CLASSES = [
  { id: 'O', t: [30000, 50000], m: [16, 60], size: 3.4, css: 'var(--c-o)' },
  { id: 'B', t: [10000, 30000], m: [2.1, 16], size: 2.9, css: 'var(--c-b)' },
  { id: 'A', t: [7500, 10000], m: [1.4, 2.1], size: 2.45, css: 'var(--c-a)' },
  { id: 'F', t: [6000, 7500], m: [1.04, 1.4], size: 2.15, css: 'var(--c-f)' },
  { id: 'G', t: [5200, 6000], m: [0.8, 1.04], size: 1.95, css: 'var(--c-g)' },
  { id: 'K', t: [3700, 5200], m: [0.45, 0.8], size: 1.75, css: 'var(--c-k)' },
  { id: 'M', t: [2400, 3700], m: [0.08, 0.45], size: 1.5, css: 'var(--c-m)' },
  { id: 'WD', t: [5000, 40000], m: [0.5, 1.1], size: 1.3, css: 'var(--c-wd)', label: 'White dwarf' },
];
export const CLS = Object.fromEntries(CLASSES.map((c, i) => [c.id, i]));
/** Spectral class mix of a young (arm), mixed (disk) and old (bulge, halo, elliptical) population. */
export const CLASS_W = {
  arm: [0.02, 0.09, 0.09, 0.11, 0.13, 0.2, 0.3, 0.04],
  disk: [0.002, 0.025, 0.05, 0.1, 0.14, 0.23, 0.39, 0.06],
  old: [0, 0, 0.01, 0.05, 0.15, 0.32, 0.4, 0.07],
};

/* radial color ramp (red core -> blue rim), in Milky Way kly; galaxies rescale r */
const RAD_R = [0, 4, 9, 15, 22, 30, 45];
export const RAD_GLOW = [[1.0, 0.24, 0.18], [1.0, 0.38, 0.2], [1.0, 0.6, 0.3], [1.0, 0.83, 0.5], [0.78, 0.85, 1.0], [0.42, 0.62, 1.0], [0.3, 0.5, 1.0]];
export const RAD_INK = [[0.62, 0.1, 0.08], [0.66, 0.2, 0.08], [0.66, 0.36, 0.1], [0.6, 0.47, 0.18], [0.36, 0.42, 0.58], [0.16, 0.3, 0.72], [0.12, 0.25, 0.74]];
export function radial(tbl, r) {
  if (r <= RAD_R[0]) return tbl[0].slice();
  for (let k = 1; k < RAD_R.length; k++) if (r < RAD_R[k]) { const t = (r - RAD_R[k - 1]) / (RAD_R[k] - RAD_R[k - 1]); return tbl[k - 1].map((v, c) => v + (tbl[k][c] - v) * t); }
  return tbl[tbl.length - 1].slice();
}
export function radSlot(r) { let best = 0; for (let k = 1; k < RAD_R.length; k++) if (Math.abs(RAD_R[k] - r) < Math.abs(RAD_R[best] - r)) best = k; return 25 + best; }

/* WebGL palette: index = color slot. glow = dark theme (additive light), ink = light theme (printed atlas). */
export const GLOW = [
  [0.62, 0.71, 1.0], [0.68, 0.76, 1.0], [0.83, 0.87, 1.0], [0.97, 0.96, 1.0], [1.0, 0.94, 0.84], [1.0, 0.81, 0.59], [1.0, 0.66, 0.42], [0.89, 0.93, 1.0],
  [0.86, 0.68, 0.52], [0.95, 0.8, 0.58], [0.56, 0.85, 1.0], [1.0, 0.38, 0.54], [0.38, 0.94, 0.85], [0.75, 0.55, 1.0], [0.55, 0.9, 1.0], [1.0, 0.62, 0.32],
  [0.7, 0.82, 1.0], [1.0, 0.86, 0.62], [0.36, 0.62, 1.0], [1.0, 0.55, 0.35],
  [1.0, 0.2, 0.26], [1.0, 0.5, 0.2], [1.0, 0.84, 0.3], [0.2, 0.5, 1.0], [0.72, 0.77, 0.95], // 20–24: unused, keep the slots
  ...RAD_GLOW,
];
export const INK = [
  [0.17, 0.31, 0.84], [0.25, 0.4, 0.86], [0.35, 0.45, 0.72], [0.48, 0.47, 0.58], [0.66, 0.47, 0.12], [0.77, 0.38, 0.11], [0.72, 0.25, 0.12], [0.44, 0.53, 0.71],
  [0.55, 0.36, 0.22], [0.62, 0.45, 0.2], [0.12, 0.45, 0.7], [0.76, 0.16, 0.35], [0.04, 0.54, 0.54], [0.45, 0.25, 0.75], [0.1, 0.45, 0.75], [0.8, 0.35, 0.1],
  [0.25, 0.38, 0.75], [0.6, 0.42, 0.12], [0.1, 0.38, 0.85], [0.8, 0.3, 0.12],
  [0.83, 0.11, 0.27], [0.85, 0.38, 0.1], [0.56, 0.42, 0.0], [0.08, 0.33, 0.86], [0.43, 0.45, 0.54],
  ...RAD_INK,
];
export const C_ROCKY = 8, C_GAS = 9, C_ICE = 10, C_HA = 11, C_OIII = 12, C_SNR = 13, C_PSR = 14, C_BH = 15, C_OPEN = 16, C_GLOB = 17, C_EARTH = 18, C_HOTJ = 19;
