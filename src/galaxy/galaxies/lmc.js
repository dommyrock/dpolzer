/* Large Magellanic Cloud: SB(s)m, 49.59 kpc away (Pietrzyński et al. 2019),
 * ≈ 32 kly across. An off-center bar ~14 kly long, one spiral arm and the
 * Tarantula Nebula. i 26°, line of nodes 154.5° (van der Marel &
 * Kallivayalil 2014). */
import { gauss, range, rand, irange, hhmm, ddmm, STAR, PULSAR, NEBULA, CLUSTER, BH, C_SNR } from '../core.js';
import { digits } from '../catalog.js';
import { external, spiral, skyPos } from './kit.js';

const sky = { ra: 80.894, dec: -69.756, pa: 154.5, incl: 26.2, dist: 161.7 };
const TARANTULA = skyPos(sky, 4.2, 45);
const shape = spiral({
  R: 16.1,
  bulge: { sx: 0.9, sy: 0.7, share: 0.15 },
  bar: { angle: -10, half: 7, minor: 2.2, cx: 1.1, cz: -0.6 },
  disk: { r0: 0.5, h: 6.2, thick: 0.45, flare: 0.8 },
  arms: { n: 1, pitch: 24, rRef: 6, phase: 2.2, rMin: 4, rMax: 16, h: 7, w0: 0.9, w1: 0.16 },
  rings: [],
  halo: { r0: 2, h: 5, flat: 0.75 },
  knots: 130,
  regionNames: {
    bulge: ['Bar center', 'Bar center'], bar: ['Stellar bar', 'Bar'], arms: [['Northern arm', 'Arm']],
    ring: [], disk: ['Disk', 'Disk'], halo: ['Outskirts', 'Outskirts'],
  },
  hazeBulge: 260, hazeArms: 380, hazeHII: 220, hazeDust: 260,
  extraHaze({ haze }) {
    // the Tarantula glows brighter than anything else in the Local Group
    for (let k = 0; k < 70; k++) haze({ x: TARANTULA.x + gauss() * 0.35, y: gauss() * 0.12, z: TARANTULA.z + gauss() * 0.35 }, range(0.25, 0.8), [1.0, 0.4, 0.62], range(0.1, 0.18), [0.72, 0.17, 0.36]);
  },
});

export default external({
  ...shape,
  id: 'lmc', name: 'Large Magellanic Cloud', short: 'the LMC', code: 'LMC',
  seed: 0x1c5a9b07, total: 7000, R: 16.1, sky,
  counts: { bh: 10, psr: 25, neb: 280, cl: 320 },
  starMix: [0.2, 0.25, 0.74],
  knotShare: 0.45,
  globShare: 0.05,
  enlarge: 3,
  field: { n: 30000, sky: 2400, mix: [0.3, 0.34, 0.78] },
  home: { yaw: 0.2, pitch: 1.05, dist: 32 },
  period: 250,
  kind: 'Magellanic spiral · SB(s)m',
  facts: [
    ['Type', 'SB(s)m Magellanic spiral'],
    ['Diameter', '≈ 32,000 ly'],
    ['vs Milky Way', '≈ 0.4× as wide'],
    ['Stars', '≈ 20 billion'],
    ['Central black hole', 'none measured'],
    ['Distance', '162,000 ly (±1%)'],
  ],
  blurb: 'A satellite of the Milky Way with an off-center bar and a single spiral arm. Its distance is known to about 1%, from eclipsing binaries.',
  suggest: ['Tarantula', '1987A', 'R136', 'pulsar', 'X-1', 'supergiant'],
  centerLabel: 'Bar center',
  regionLabels: [['Stellar bar', 5, -0.17], ['30 Doradus', Math.hypot(TARANTULA.x, TARANTULA.z) + 1.4, Math.atan2(TARANTULA.z, TARANTULA.x)], ['Northern arm', 12, 2.2 - Math.log(2) / Math.tan(24 * Math.PI / 180)]],
  names: {
    star: (o) => (rand() < 0.3 ? `Sk -${69 + irange(-3, 3)} ${irange(1, 280)}` : `Gaia DR3 46${digits(17)}`),
    bh: (o) => `CXO J${hhmm(o.ra)}${ddmm(o.dec)}`,
    neb: (o, kind) => (kind === 'H II region' ? `LHA 120-N ${irange(1, 220)}` : kind === 'Planetary nebula' ? `SMP LMC ${irange(1, 102)}` : `MCSNR J${hhmm(o.ra)}${ddmm(o.dec)}`),
    cl: (o, glob) => (glob ? `NGC ${irange(1466, 2257)}` : rand() < 0.5 ? `SL ${irange(1, 900)}` : `NGC ${irange(1650, 2200)}`),
  },
  landmarks: [
    { name: 'Tarantula Nebula', alt: ['30 Doradus', 'NGC 2070'], type: NEBULA, sub: 'Giant H II region', at: TARANTULA, extra: { nebKind: 'H II region', diam: 1000, line: 'Hα 656.3 nm', age: 'about 2 million years' }, world: 1.2, blurb: 'The most active star-forming region in the Local Group, roughly 650 to 1,900 light-years across depending on where you draw its edge.' },
    { name: 'R136', alt: ['RMC 136'], type: CLUSTER, sub: 'Super star cluster', at: { x: TARANTULA.x + 0.05, y: 0.02, z: TARANTULA.z - 0.05 }, extra: { ckind: 'Super star cluster', age: 'about 1–2 million years' }, world: 0.18, blurb: 'The young, dense cluster at the heart of the Tarantula that powers its glow, home to the most massive stars known.' },
    { name: 'R136a1', alt: [], type: STAR, sub: 'Wolf–Rayet star', at: { x: TARANTULA.x + 0.06, y: 0.025, z: TARANTULA.z - 0.04 }, cls: 'O', lc: 'Ia', sp: 'WN5h', teff: null, mass: 200, radius: null, lum: null, age: null, tags: ['most massive star', 'wolf-rayet'], blurb: 'The most massive star known: about 150–230 M☉ today (Kalari et al. 2022), and perhaps over 250 M☉ when it formed.' },
    { name: 'SN 1987A', alt: [], type: NEBULA, sub: 'Supernova remnant', at: skyPos(sky, 3.2, 45), extra: { nebKind: 'Supernova remnant', line: 'Hα + [O III]', age: 'about 39 years' }, color: C_SNR, world: 0.25, blurb: 'The nearest supernova seen since the telescope was invented, in February 1987, and the first detected through its neutrinos.' },
    { name: 'N11', alt: ['LHA 120-N 11'], type: NEBULA, sub: 'H II region', at: skyPos(sky, 11.8, 315), extra: { nebKind: 'H II region', diam: 1000, line: 'Hα 656.3 nm', age: 'a few million years' }, world: 0.8, blurb: 'The second-largest star-forming complex in the LMC, a chain of nebulae blown open by successive generations of stars.' },
    { name: 'N44', alt: ['LHA 120-N 44'], type: NEBULA, sub: 'Superbubble', at: skyPos(sky, 5.1, 0), extra: { nebKind: 'H II region', diam: 1000, line: 'Hα 656.3 nm', age: 'about 5 million years' }, world: 0.8, blurb: 'A superbubble about 1,000 light-years across, carved by the winds and supernovae of a central star cluster.' },
    { name: 'PSR J0540-6919', alt: ['PSR B0540-69'], type: PULSAR, sub: 'Young pulsar', at: skyPos(sky, 4.3, 90), extra: { pkind: 'Radio pulsar', period: 0.0505 }, blurb: 'A young pulsar spinning about 20 times a second, often called the Crab’s twin.' },
    { name: 'LMC X-1', alt: [], type: BH, sub: 'Stellar-mass black hole', at: skyPos(sky, 3.9, 90), mass: 10.91, extra: { bhKind: 'X-ray binary', companion: 'O-type giant' }, blurb: 'A persistent X-ray binary with a 10.9 M☉ black hole (Orosz et al. 2009).' },
    { name: 'LMC X-3', alt: [], type: BH, sub: 'Stellar-mass black hole', at: skyPos(sky, 16.6, 0), mass: 6.98, extra: { bhKind: 'X-ray binary', companion: 'B-type star' }, blurb: 'A 7 M☉ black hole in the LMC’s outskirts, one of the first black hole binaries found outside the Milky Way (Orosz et al. 2014).' },
    { name: 'NGC 1850', alt: [], type: CLUSTER, sub: 'Young massive cluster', at: skyPos(sky, 4.6, 315), extra: { ckind: 'Young massive cluster', age: 'about 100 million years' }, world: 0.3, blurb: 'A rich double cluster of about 42,000 M☉, around 100 million years old.' },
  ],
});
