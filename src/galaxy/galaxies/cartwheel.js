/* Cartwheel Galaxy: a ring galaxy ~500 Mly away (NASA/ESA JWST 2022) whose
 * ~150,000 ly outer ring was driven out by a head-on collision with a smaller
 * galaxy. An inner ring, spokes between the rings, and companions G1 and G2
 * about 146–149 kly (projected) to the northeast. */
import { TAU, gauss, range, rand, pick, CLUSTER } from '../core.js';
import { external, skyPos, hernquist, DUST } from './kit.js';

const sky = { ra: 9.42129, dec: -33.71625, pa: 0, incl: 40, dist: 500000 };
const R = 75, INNER = 20, SPOKES = 13;
const G1 = skyPos(sky, 146, 40, 'sky', 4), G2 = skyPos(sky, 149, 55, 'sky', -6);
const SPOKE_TH = Array.from({ length: SPOKES }, (_, k) => k / SPOKES * TAU + 0.21 * Math.sin(k * 2.3));

const ringPt = (r, w, h) => { const th = rand() * TAU, rr = r + gauss() * w; return { x: rr * Math.cos(th), y: gauss() * h, z: rr * Math.sin(th) }; };
const outer = (young) => ringPt(R - 2, young ? 2.2 : 3.6, young ? 0.5 : 1);
const inner = () => ringPt(INNER, 1.6, 0.8);
const spoke = () => { const t = rand(), r = INNER + 3 + t * (R - INNER - 8), th = pick(SPOKE_TH) + gauss() * 0.02 + t * 0.12; return { x: r * Math.cos(th), y: gauss() * 0.6, z: r * Math.sin(th) }; };
const nucleus = () => ({ x: gauss() * 3, y: gauss() * 2.2, z: gauss() * 3 });
function diskPt() { let r; do { r = -26 * Math.log(1 - rand() * 0.99); } while (r > R * 1.05); const th = rand() * TAU; return { x: r * Math.cos(th), y: gauss() * 1.2, z: r * Math.sin(th) }; }
const halo = () => hernquist(18, 0.8, 120);
const companion = (c, a) => { const p = hernquist(a, 0.7, a * 5); return { x: c.x + p.x, y: c.y + p.y, z: c.z + p.z }; };
let KNOTS = [];

const REGIONS = [
  { id: 'nucleus', label: 'Nucleus', short: 'Nucleus' },
  { id: 'inner', label: 'Inner ring', short: 'Inner ring' },
  { id: 'spokes', label: 'Spokes', short: 'Spokes' },
  { id: 'outer', label: 'Outer ring', short: 'Outer ring' },
  { id: 'g1', label: 'Companion G1', short: 'G1' },
  { id: 'g2', label: 'Companion G2', short: 'G2' },
  { id: 'halo', label: 'Halo', short: 'Halo' },
];
function regionOf(x, y, z) {
  if (Math.hypot(x - G1.x, y - G1.y, z - G1.z) < 14) return 4;
  if (Math.hypot(x - G2.x, y - G2.y, z - G2.z) < 12) return 5;
  const r = Math.hypot(x, z);
  if (Math.abs(y) > 6 || r > R + 9) return 6;
  if (r < 7) return 0;
  if (Math.abs(r - INNER) < 4.5) return 1;
  if (Math.abs(r - (R - 2)) < 7) return 3;
  return 2;
}

export default external({
  id: 'cartwheel', name: 'Cartwheel Galaxy', short: 'the Cartwheel', code: 'Cartwheel',
  seed: 0xca27e1, total: 6000, R, sky,
  counts: { bh: 24, neb: 320, cl: 100 },
  starMix: [0.1, 0.16, 0.3],
  knotShare: 0.4,
  globShare: 0.25,
  colorScale: 0.6,
  enlarge: 12,
  field: { n: 34000, sky: 2400, extra: 5000 },
  home: { yaw: 0.9, pitch: 0.75, dist: 165 },
  period: 360,
  kind: 'Ring galaxy · S pec',
  facts: [
    ['Type', 'Ring galaxy (S pec)'],
    ['Outer ring', '≈ 150,000 ly across'],
    ['vs Milky Way', '≈ 1.5–1.7× as wide'],
    ['Origin', 'Head-on collision ~ hundreds of Myr ago'],
    ['Distance', '≈ 500 million ly'],
  ],
  blurb: 'A smaller galaxy plunged through this one, and the shock spread outward like a ripple in a pond. New stars now form in the expanding outer ring.',
  suggest: ['outer ring', 'H II', 'G1', 'supergiant'],
  centerLabel: 'Cartwheel nucleus',
  regions: REGIONS,
  regionOf,
  regionLabels: [['Outer ring', R + 5, 1.2], ['Inner ring', INNER + 4, 3.6], ['Spokes', 45, SPOKE_TH[4]]],
  init() { KNOTS = []; for (let i = 0; i < 160; i++) KNOTS.push(outer(true)); },
  pos(kind) {
    switch (kind) {
      case 'core': return rand() < 0.6 ? nucleus() : inner();
      case 'halo': return halo();
      case 'disk': return diskPt();
      case 'arm': { const u = rand(); return u < 0.55 ? outer(false) : u < 0.85 ? spoke() : inner(); }
      case 'young': return rand() < 0.88 ? outer(true) : spoke();
      default: { const c = pick(KNOTS); return { x: c.x + gauss() * 0.9, y: c.y + gauss() * 0.25, z: c.z + gauss() * 0.9 }; }
    }
  },
  landmarks: [
    { name: 'Cartwheel nucleus', alt: ['ESO 350-40 nucleus'], type: CLUSTER, center: true, sub: 'Galactic nucleus', extra: { ckind: 'Old stellar nucleus' }, world: 2, blurb: 'The bright, dusty core left behind at the center after the collision.' },
    { name: 'G1', alt: ['PGC 2249'], type: CLUSTER, sub: 'Companion galaxy', at: G1, extra: { ckind: 'Companion galaxy' }, world: 4, blurb: 'One of the two small companions about 146,000 light-years (projected) to the northeast.' },
    { name: 'G2', alt: ['PGC 2252'], type: CLUSTER, sub: 'Companion galaxy', at: G2, extra: { ckind: 'Companion galaxy' }, world: 3.5, blurb: 'The second companion, about 149,000 light-years (projected) away. The galaxy that actually punched through the Cartwheel may be a third, more distant one.' },
  ],
  haze({ haze, hazeR }) {
    for (let k = 0; k < 6; k++) hazeR({ x: gauss() * 1.5, y: gauss() * 1, z: gauss() * 1.5 }, range(10, 16), 0.06);
    for (let k = 0; k < 220; k++) hazeR(nucleus(), range(3, 7), range(0.03, 0.05));
    for (let k = 0; k < 300; k++) haze(inner(), range(3, 6), [1.0, 0.75, 0.48], range(0.03, 0.05), [0.62, 0.44, 0.16]);
    for (let k = 0; k < 500; k++) haze(spoke(), range(2.5, 5), [0.85, 0.82, 0.9], range(0.018, 0.03), [0.4, 0.42, 0.55]);
    for (let k = 0; k < 1600; k++) haze(outer(false), range(3, 7), [0.42, 0.62, 1.0], range(0.03, 0.055), [0.16, 0.3, 0.72]);
    for (let k = 0; k < 420; k++) { const c = pick(KNOTS); haze({ x: c.x + gauss() * 0.8, y: c.y, z: c.z + gauss() * 0.8 }, range(1, 2.6), [1.0, 0.36, 0.58], range(0.08, 0.15), [0.72, 0.17, 0.36]); }
    for (let k = 0; k < 500; k++) { const p = rand() < 0.5 ? inner() : spoke(); haze({ x: p.x * 0.96, y: p.y * 0.5, z: p.z * 0.96 }, range(1.2, 2.8), DUST[0], range(0.12, 0.24), DUST[1], 1); }
    for (const [c, a] of [[G1, 3.2], [G2, 2.6]]) for (let k = 0; k < 50; k++) haze(companion(c, a), range(2, 5), [1.0, 0.8, 0.55], range(0.03, 0.05), [0.6, 0.44, 0.16]);
    for (let k = 0; k < 180; k++) hazeR(diskPt(), range(5, 10), 0.012);
  },
  extraField(push) {
    for (let k = 0; k < 2800; k++) push(companion(G1, 3.2), 'disk', 4 + ((rand() * 3) | 0), range(0.5, 1));
    for (let k = 0; k < 2200; k++) push(companion(G2, 2.6), 'disk', 4 + ((rand() * 3) | 0), range(0.5, 1));
  },
});
