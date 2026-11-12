/* Sombrero (M104): SA(s)a seen nearly edge-on (i ≈ 84°), 9.55 Mpc away
 * (McQuinn et al. 2016), D25 ≈ 95 kly. A huge bulge and halo with a thin disk
 * and a dust ring ~26 kly in radius (Vlahakis et al. 2008). */
import { TAU, gauss, range, rand, BH } from '../core.js';
import { external, spiral, DUST } from './kit.js';

const sky = { ra: 189.99763, dec: -11.62306, pa: 90, incl: 84, dist: 31100 };
const RING = 25.7;
const shape = spiral({
  R: 47,
  bulge: { sx: 8.5, sy: 7 },
  bar: null,
  disk: { r0: 3, h: 19, thick: 0.45, flare: 0.4 },
  arms: { n: 2, pitch: 6, rRef: 20, phase: 0, rMin: 12, rMax: 48, h: 20, w0: 0.8, w1: 0.04 },
  rings: [{ r: RING - 1.5, w: 1.6, share: 0.55, thick: 0.18 }],
  halo: { r0: 6, h: 20, flat: 0.88 },
  knots: 90,
  regionNames: {
    bulge: ['Bulge', 'Bulge'], arms: [['Disk arms', 'Arms']],
    ring: [['Dust ring', 'Dust ring']], disk: ['Thin disk', 'Disk'], halo: ['Halo', 'Halo'],
  },
  hazeBulge: 700, hazeArms: 700, hazeHII: 60, hazeDust: 200,
  extraHaze({ haze, hazeR }) {
    // the famous dark lane: dust concentrated in a thin ring
    for (let k = 0; k < 1500; k++) {
      const r = RING + gauss() * 1.6, th = rand() * TAU;
      haze({ x: r * Math.cos(th), y: gauss() * 0.15, z: r * Math.sin(th) }, range(1.2, 2.6), DUST[0], range(0.22, 0.38), DUST[1], 1);
    }
    // a bright, extended spheroid
    for (let k = 0; k < 300; k++) hazeR({ x: gauss() * 14, y: gauss() * 11, z: gauss() * 14 }, range(6, 12), 0.022);
  },
});

export default external({
  ...shape,
  id: 'sombrero', name: 'Sombrero Galaxy', short: 'M104', code: 'M104',
  seed: 0x104b0b04, total: 8000, R: 47, sky,
  counts: { bh: 15, neb: 60, cl: 650 },
  starMix: [0.42, 0.62, 0.8],
  globShare: 0.96,
  nebMix: [0.3, 0.8],
  colorScale: 0.55,
  field: { n: 46000, sky: 2400, mix: [0.42, 0.6, 0.8] },
  home: { yaw: 0, pitch: 0.1, dist: 115 },
  period: 330,
  kind: 'Unbarred spiral · SA(s)a',
  facts: [
    ['Type', 'SA(s)a, almost edge-on'],
    ['Diameter', '≈ 95,000 ly (D25)'],
    ['vs Milky Way', '≈ 1.1× as wide'],
    ['Globular clusters', '1,200–2,000'],
    ['Central black hole', '≈ 0.7–1 billion M☉'],
    ['Distance', '31 million ly'],
  ],
  blurb: 'A bright bulge cut by a dark dust lane, seen only 6° from edge-on. The disk is thin, and the bulge and halo hold most of its stars.',
  suggest: ['globular', 'dust ring', 'giant'],
  centerLabel: 'M104 nucleus',
  regionLabels: [['Dust ring', RING + 3, 0.3], ['Bulge', 9, 2.2], ['Halo', 40, 4]],
  landmarks: [
    { name: 'M104 nucleus', alt: ['Sombrero central black hole'], type: BH, center: true, sub: 'Supermassive black hole', mass: 1e9, extra: { bhKind: 'Supermassive', companion: 'Dense stellar bulge' }, blurb: 'One of the first supermassive black holes weighed from stellar motions: about a billion M☉ (Kormendy et al. 1996). Later models give about 660 million (Jardel et al. 2011).' },
  ],
});
