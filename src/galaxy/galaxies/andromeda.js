/* Andromeda (M31): SAB(s)b, 765 kpc away (Riess et al. 2012), D25 ≈ 152 kly.
 * Two tightly wound arms, the ~10 kpc star-forming "ring of fire", a large
 * bulge and the satellites M32 and M110. Orientation: PA 37.7°, i 77.7°
 * (Corbelli et al. 2010). */
import { irange, p2, STAR, CLUSTER, BH } from '../core.js';
import { external, spiral, skyPos } from './kit.js';

const sky = { ra: 10.68471, dec: 41.26875, pa: 37.7, incl: 77.7, dist: 2495 };
const M32 = skyPos(sky, 17.6, 180, 'sky', -2), M110 = skyPos(sky, 26.5, 315, 'sky', 4);
const shape = spiral({
  R: 76,
  bulge: { sx: 5.4, sy: 4.2, share: 0.8 },
  bar: { angle: 20, half: 10, minor: 3.4 },
  disk: { r0: 4, h: 26, thick: 0.9 },
  arms: { n: 2, pitch: 8, rRef: 20, phase: 0.4, rMin: 12, rMax: 80, h: 34, w0: 0.9, w1: 0.05 },
  rings: [{ r: 32, w: 2.4, share: 0.36 }],
  halo: { r0: 10, h: 30, flat: 0.8 },
  knots: 170,
  warp: 0.04,
  satellites: [
    { label: 'M32 (satellite)', short: 'M32', c: M32, rad: 3.2, field: 1600, haze: 50 },
    { label: 'M110 (satellite)', short: 'M110', c: M110, rad: 8.5, field: 2200, haze: 70 },
  ],
  regionNames: {
    bulge: ['Bulge', 'Bulge'], bar: ['Inner bar', 'Bar'],
    arms: [['Northern arm', 'N arm'], ['Southern arm', 'S arm']], ring: [['Ring of fire (10 kpc ring)', 'Ring of fire']],
    disk: ['Outer disk', 'Disk'], halo: ['Stellar halo', 'Halo'],
  },
});

export default external({
  ...shape,
  id: 'andromeda', name: 'Andromeda Galaxy', short: 'Andromeda', code: 'M31', starCat: 'LGGS',
  seed: 0x31a5d0e1, total: 10000, R: 76, sky,
  counts: { bh: 40, neb: 260, cl: 450 },
  globShare: 0.6,
  field: { n: 50000, sky: 2400, extra: 3800 },
  home: { yaw: 0.6, pitch: 0.32, dist: 150 },
  period: 300,
  kind: 'Barred spiral · SAB(s)b',
  facts: [
    ['Type', 'SAB(s)b barred spiral'],
    ['Diameter', '≈ 152,000 ly (D25)'],
    ['vs Milky Way', '≈ 1.7× wider'],
    ['Stars', '≈ 1 trillion'],
    ['Central black hole', 'M31* · 140 million M☉'],
    ['Distance', '2.5 million ly'],
  ],
  blurb: 'The nearest large galaxy, seen almost edge-on from Earth. Its star formation runs in a ring about 10 kpc out; M32 and M110 are two of its satellites.',
  suggest: ['ring of fire', 'cepheid', 'nova', 'globular', 'M32', 'supergiant'],
  centerLabel: 'M31* · center',
  regionLabels: [['Ring of fire', 32, 2.2], ['Bulge', 0.1, 0], ['M32', Math.hypot(M32.x, M32.z), Math.atan2(M32.z, M32.x)], ['M110', Math.hypot(M110.x, M110.z), Math.atan2(M110.z, M110.x)], ['Outer disk', 58, 3.9]],
  names: { cl: (o, glob) => (glob ? `B${p2(irange(1, 99))}${irange(0, 9)}` : `M31 OC ${irange(1, 2999)}`) },
  landmarks: [
    { name: 'M31*', alt: ['Andromeda central black hole'], type: BH, center: true, sub: 'Supermassive black hole', mass: 1.4e8, extra: { bhKind: 'Supermassive', companion: 'A disk of old stars (the double nucleus P1/P2)' }, blurb: 'The black hole at the heart of Andromeda, about 140 million solar masses (Bender et al. 2005), some 30 times heavier than Sgr A*.' },
    { name: 'M32', alt: ['NGC 221', 'Le Gentil'], type: CLUSTER, sub: 'Satellite galaxy', at: M32, extra: { ckind: 'Dwarf elliptical satellite galaxy', diam: 6500 }, world: 1.6, blurb: 'A compact dwarf elliptical about 17,600 light-years (projected) south of Andromeda’s nucleus, stripped by its host.' },
    { name: 'M110', alt: ['NGC 205'], type: CLUSTER, sub: 'Satellite galaxy', at: M110, extra: { ckind: 'Dwarf elliptical satellite galaxy', diam: 17000 }, world: 3, blurb: 'A dwarf elliptical satellite about 26,500 light-years (projected) northwest of the nucleus.' },
    { name: 'NGC 206', alt: [], type: CLUSTER, sub: 'Star cloud', at: skyPos(sky, 29.2, 225), extra: { ckind: 'Star cloud', diam: 3000, age: 'tens of millions of years' }, world: 1, blurb: 'The brightest star cloud in Andromeda, a rich patch of young blue stars about 3,000 light-years across in the southwestern disk.' },
    { name: 'Mayall II', alt: ['G1', 'Andromeda’s Parasol'], type: CLUSTER, sub: 'Globular cluster', at: skyPos(sky, 110.6, 225, 'sky', -6), extra: { ckind: 'Globular cluster', age: 'about 12 billion years' }, world: 0.6, blurb: 'Possibly the most massive globular cluster in the Local Group, 110,000 light-years (projected) out in Andromeda’s halo. It may be the stripped core of a dwarf galaxy.' },
    { name: 'M31-V1', alt: ['Hubble’s variable'], type: STAR, sub: 'Cepheid variable', at: skyPos(sky, 11.4, 270), cls: 'F', lc: 'Ib', sp: 'Cepheid', teff: null, mass: null, radius: null, lum: null, age: null, tags: ['variable', 'cepheid'], blurb: 'The Cepheid Edwin Hubble found in 1923. Its 31.4-day pulse gave a distance far beyond the Milky Way, proving Andromeda is a galaxy of its own.' },
    { name: 'M31N 2008-12a', alt: [], type: STAR, sub: 'Recurrent nova', at: skyPos(sky, 35.5, 45), cls: 'WD', lc: '', sp: 'Recurrent nova', teff: null, mass: null, radius: null, lum: null, age: null, tags: ['nova', 'variable'], blurb: 'A white dwarf that erupts as a nova about once a year, the most frequent recurrent nova known (Darnley et al. 2016).' },
  ],
});
