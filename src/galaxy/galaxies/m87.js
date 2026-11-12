/* Messier 87: E+0-1 giant elliptical in the Virgo Cluster, 16.4 Mpc away,
 * D25 ≈ 132 × 105 kly. About 12,000 globular clusters, a relativistic jet at
 * least 4,900 ly long, and M87*, the first black hole imaged (EHT 2019). */
import { TAU, gauss, range, rand, irange, NEBULA, BH, CLASS_W, C_PSR } from '../core.js';
import { external, hernquist, oldOnly } from './kit.js';

const sky = { ra: 187.70593, dec: 12.39112, pa: 0, incl: 0, dist: 53500 };
const R = 66, Q = 0.9, JET = 4.9;
const core = () => hernquist(2.5, Q, 12);
const body = () => hernquist(11, Q, R * 1.05);
const halo = () => hernquist(24, Q, R * 1.25);

const REGIONS = [
  { id: 'core', label: 'Core', short: 'Core' },
  { id: 'inner', label: 'Inner galaxy', short: 'Inner' },
  { id: 'envelope', label: 'Outer envelope', short: 'Envelope' },
  { id: 'jet', label: 'Relativistic jet', short: 'Jet' },
];
function regionOf(x, y, z) {
  if (y > 0.05 && y < JET + 0.5 && Math.hypot(x, z) < 0.07) return 3;
  const r = Math.hypot(x, y / Q, z);
  return r < 6 ? 0 : r < 30 ? 1 : 2;
}
// a point on the jet: a narrow cone along +Y, brightest in knots
const jetPoint = () => { const y = 0.02 + Math.pow(rand(), 0.8) * JET, w = 0.03 + y * 0.025, th = rand() * TAU; return { x: Math.cos(th) * w * Math.abs(gauss()), y, z: Math.sin(th) * w * Math.abs(gauss()) }; };

export default external({
  id: 'm87', name: 'Messier 87', short: 'M87', code: 'M87',
  seed: 0x87e7e087, total: 10000, R, sky,
  counts: { bh: 20, neb: 40, cl: 1500 },
  starMix: [0.25, 0.45, 1],
  classW: oldOnly,
  globShare: 1,
  nebMix: [0, 0.75],
  colorScale: 0.32,
  field: { n: 50000, sky: 2400, extra: 1600, mix: [0.25, 0.45, 1] },
  home: { yaw: 0.5, pitch: 0.45, dist: 150 },
  period: 1600,
  kind: 'Giant elliptical · E0',
  facts: [
    ['Type', 'E+0-1 pec giant elliptical'],
    ['Diameter', '≈ 132,000 ly (D25)'],
    ['vs Milky Way', '≈ 1.5× as wide'],
    ['Globular clusters', '≈ 12,000 (Milky Way: ~150)'],
    ['Central black hole', 'M87* · 6.5 billion M☉'],
    ['Distance', '53.5 million ly'],
  ],
  blurb: 'A giant elliptical at the center of the Virgo Cluster. Its black hole launches a jet thousands of light-years long, and swarms of globular clusters orbit it.',
  suggest: ['jet', 'globular', 'M87*', 'giant'],
  centerLabel: 'M87* · center',
  regions: REGIONS,
  regionOf,
  regionLabels: [['Core', 4, 0.6], ['Inner galaxy', 22, 2.4], ['Outer envelope', 52, 4.4]],
  pos(kind) { return kind === 'core' ? core() : kind === 'halo' ? halo() : body(); },
  names: { cl: () => `M87 GC ${irange(1, 12000)}` },
  landmarks: [
    { name: 'M87*', alt: ['Pōwehi', 'Virgo A nucleus'], type: BH, center: true, sub: 'Supermassive black hole', mass: 6.5e9, extra: { bhKind: 'Supermassive, jet-launching', companion: 'Hot accretion flow' }, blurb: 'The first black hole ever imaged, by the Event Horizon Telescope in 2019: a ring of light around a shadow, from a 6.5 billion M☉ black hole.' },
    { name: 'HST-1', alt: ['M87 jet knot HST-1'], type: NEBULA, sub: 'Jet knot', at: { x: 0, y: 0.22, z: 0 }, extra: { nebKind: 'Relativistic jet knot', line: 'Synchrotron', age: '—' }, color: C_PSR, world: 0.12, blurb: 'A knot about 220 light-years down the jet that flared dramatically in the 2000s and shows apparent superluminal motion.' },
    { name: 'Knot A', alt: ['M87 jet knot A'], type: NEBULA, sub: 'Jet knot', at: { x: 0.04, y: 3.2, z: 0.02 }, extra: { nebKind: 'Relativistic jet knot', line: 'Synchrotron', age: '—' }, color: C_PSR, world: 0.3, blurb: 'The brightest knot in the outer jet, about 3,200 light-years from the core.' },
  ],
  haze({ haze, hazeR }) {
    for (let k = 0; k < 10; k++) hazeR({ x: gauss() * 1, y: gauss() * 0.9, z: gauss() * 1 }, range(8, 16), 0.07);
    for (let k = 0; k < 500; k++) hazeR(core(), range(3, 7), range(0.035, 0.05));
    for (let k = 0; k < 900; k++) hazeR(body(), range(6, 14), range(0.02, 0.035));
    for (let k = 0; k < 300; k++) hazeR(halo(), range(14, 28), 0.012);
    for (let k = 0; k < 160; k++) { const p = jetPoint(); haze(p, range(0.12, 0.45), [0.45, 0.75, 1.0], range(0.12, 0.25), [0.1, 0.3, 0.75]); }
  },
  extraField(push) { for (let k = 0; k < 1600; k++) push(jetPoint(), 'disk', 14, range(0.7, 1.3)); },
  motion: 0.9,
});
