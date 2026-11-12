/* Triangulum (M33): SA(s)cd, 883 kpc away, D25 ≈ 61 kly. A flocculent spiral
 * rich in H II regions, with no bulge to speak of. PA 22°, i 52° (Kam et al.
 * 2017). */
import { NEBULA, CLUSTER, BH } from '../core.js';
import { external, spiral, skyPos } from './kit.js';

const sky = { ra: 23.46208, dec: 30.66017, pa: 22, incl: 52, dist: 2880 };
const shape = spiral({
  R: 30.5,
  bulge: { sx: 0.9, sy: 0.7 },
  bar: null,
  disk: { r0: 0.5, h: 9, thick: 0.4 },
  arms: { n: 2, pitch: 26, rRef: 8, phase: 1.1, rMin: 2.5, rMax: 32, h: 12, w0: 1.4, w1: 0.17, weights: [1.25, 1] },
  rings: [],
  halo: { r0: 3, h: 7, flat: 0.8 },
  knots: 320,
  regionNames: {
    bulge: ['Nucleus', 'Nucleus'], arms: [['Northern arm', 'N arm'], ['Southern arm', 'S arm']],
    ring: [], disk: ['Flocculent disk', 'Disk'], halo: ['Halo', 'Halo'],
  },
  hazeHII: 420, hazeArms: 1300, hazeDust: 700, hazeBulge: 60,
});

export default external({
  ...shape,
  id: 'triangulum', name: 'Triangulum Galaxy', short: 'Triangulum', code: 'M33', starCat: 'LGGS',
  seed: 0x33c0ffee, total: 6000, R: 30.5, sky,
  counts: { bh: 12, neb: 320, cl: 140 },
  starMix: [0.04, 0.08, 0.5],
  knotShare: 0.55,
  globShare: 0.2,
  field: { n: 30000, sky: 2400, mix: [0.06, 0.1, 0.5] },
  home: { yaw: 0.3, pitch: 0.95, dist: 60 },
  period: 260,
  kind: 'Spiral · SA(s)cd',
  facts: [
    ['Type', 'SA(s)cd flocculent spiral'],
    ['Diameter', '≈ 61,000 ly (D25)'],
    ['vs Milky Way', '≈ 0.7× as wide'],
    ['Stars', '30–40 billion'],
    ['Central black hole', 'none detected'],
    ['Distance', '2.9 million ly'],
  ],
  blurb: 'The third-largest member of the Local Group: a loose, patchy spiral with very bright star-forming regions and no central bulge or bar.',
  suggest: ['NGC 604', 'H II', 'X-7', 'supergiant', 'open cluster'],
  centerLabel: 'M33 nucleus',
  regionLabels: [['Northern arm', 18, 1.1 - Math.log(18 / 8) / Math.tan(26 * Math.PI / 180)], ['Southern arm', 18, 1.1 + Math.PI - Math.log(18 / 8) / Math.tan(26 * Math.PI / 180)]],
  landmarks: [
    { name: 'M33 nucleus', alt: [], type: CLUSTER, center: true, sub: 'Nuclear star cluster', extra: { ckind: 'Nuclear star cluster' }, world: 0.3, blurb: 'A dense nuclear star cluster. Unlike most large galaxies, Triangulum shows no sign of a supermassive black hole at its center.' },
    { name: 'NGC 604', alt: [], type: NEBULA, sub: 'Giant H II region', at: skyPos(sky, 9.7, 45), extra: { nebKind: 'H II region', diam: 1520, line: 'Hα 656.3 nm', age: 'about 3 million years' }, world: 1.3, blurb: 'One of the largest star-forming regions in the Local Group, about 1,500 light-years across and lit by more than 200 hot young stars.' },
    { name: 'NGC 595', alt: [], type: NEBULA, sub: 'H II region', at: skyPos(sky, 3.5, 315), extra: { nebKind: 'H II region', diam: 840, line: 'Hα 656.3 nm', age: 'a few million years' }, world: 0.8, blurb: 'The second-brightest H II region in Triangulum, about 840 light-years across.' },
    { name: 'M33 X-7', alt: [], type: BH, sub: 'Eclipsing X-ray binary', at: skyPos(sky, 6.9, 225), mass: 15.65, extra: { bhKind: 'X-ray binary', companion: 'O-type giant of about 70 M☉' }, blurb: 'A 15.7 M☉ black hole eclipsed every 3.45 days by a 70 M☉ companion, one of the heaviest stellar black holes measured (Orosz et al. 2007).' },
    { name: 'IC 133', alt: [], type: NEBULA, sub: 'H II region with water maser', at: skyPos(sky, 12.9, 315), extra: { nebKind: 'H II region', line: 'H₂O maser 22 GHz' }, world: 0.5, blurb: 'A star-forming region whose water masers gave M33 a geometric distance, by tracking their motion across the sky (Brunthaler et al. 2005).' },
  ],
});
