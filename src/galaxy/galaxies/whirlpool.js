/* Whirlpool (M51a): SA(s)bc pec, a grand-design spiral interacting with
 * NGC 5195. Distance 8.58 Mpc (McQuinn et al. 2016, TRGB); other estimates run
 * 7.2–9.5 Mpc. PA 173°, i 22° (Colombo et al. 2014). */
import { gauss, range, rand, NEBULA, CLUSTER, BH, C_SNR } from '../core.js';
import { external, spiral, skyPos } from './kit.js';

const sky = { ra: 202.46958, dec: 47.19525, pa: 173, incl: 22, dist: 27980 };
const COMP = skyPos(sky, 35.9, 0, 'sky', -3);
const PITCH = 19, RREF = 14, TANP = Math.tan(PITCH * Math.PI / 180);
const rC = Math.hypot(COMP.x, COMP.z), thC = Math.atan2(COMP.z, COMP.x);
const PHASE = thC + Math.log(rC / RREF) / TANP; // arm 0 runs into the companion
const armAt = (k, r) => PHASE + k * Math.PI - Math.log(r / RREF) / TANP;
const shape = spiral({
  R: 44,
  bulge: { sx: 1.8, sy: 1.3 },
  bar: null,
  disk: { r0: 1, h: 17, thick: 0.6 },
  arms: { n: 2, pitch: PITCH, rRef: RREF, phase: PHASE, rMin: 4, rMax: rC - 2, h: 26, w0: 0.7, w1: 0.05 },
  rings: [],
  halo: { r0: 5, h: 12, flat: 0.8 },
  knots: 180,
  satellites: [{ label: 'NGC 5195 (companion)', short: 'NGC 5195', c: COMP, rad: 7.5, field: 3600, haze: 90 }],
  regionNames: {
    bulge: ['Nucleus', 'Nucleus'], arms: [['Arm toward NGC 5195', 'Arm 1'], ['Opposite arm', 'Arm 2']],
    ring: [], disk: ['Inter-arm disk', 'Inter-arm'], halo: ['Halo & tidal debris', 'Halo'],
  },
  hazeHII: 360, hazeArms: 1700, hazeDust: 1300,
  extraField(push) {
    // the tidal bridge from the end of arm 1 into NGC 5195
    for (let k = 0; k < 1200; k++) {
      const t = rand(), r = rC - 6 + t * 6, th = armAt(0, r) + gauss() * 0.04;
      push({ x: r * Math.cos(th) + gauss() * 0.8, y: COMP.y * t + gauss() * 0.4, z: r * Math.sin(th) + gauss() * 0.8 }, 'disk', 28 + ((rand() * 3) | 0), range(0.5, 1));
    }
  },
});

export default external({
  ...shape,
  id: 'whirlpool', name: 'Whirlpool Galaxy', short: 'M51', code: 'M51',
  seed: 0x51f00d51, total: 8000, R: 44, sky,
  counts: { bh: 30, neb: 280, cl: 120, planets: 0 },
  starMix: [0.08, 0.12, 0.38],
  globShare: 0.35,
  field: { n: 40000, sky: 2400, extra: 4800 },
  home: { yaw: 0.2, pitch: 1.12, dist: 105 },
  period: 280,
  kind: 'Grand-design spiral · SA(s)bc pec',
  facts: [
    ['Type', 'SA(s)bc pec, Seyfert 2 nucleus'],
    ['Diameter', '≈ 77,000–91,000 ly (D25)'],
    ['vs Milky Way', '≈ 0.9× as wide'],
    ['Companion', 'NGC 5195 (M51b)'],
    ['Distance', '≈ 28 million ly'],
  ],
  blurb: 'The archetypal grand-design spiral. Its two sharp arms were likely raised by the gravity of NGC 5195, which is caught at the end of one of them.',
  suggest: ['NGC 5195', 'supernova', 'ULS-1', 'H II', 'supergiant'],
  centerLabel: 'M51a nucleus',
  regionLabels: [['Arm 1', 24, armAt(0, 24)], ['Arm 2', 24, armAt(1, 24)], ['NGC 5195', rC + 8, thC]],
  landmarks: [
    { name: 'M51a nucleus', alt: ['NGC 5194 nucleus'], type: BH, center: true, sub: 'Seyfert 2 nucleus', mass: null, extra: { bhKind: 'Active galactic nucleus (Seyfert 2)', companion: 'Dusty circumnuclear disk' }, blurb: 'A low-luminosity active nucleus: a supermassive black hole feeding quietly behind a screen of dust.' },
    { name: 'NGC 5195', alt: ['M51b'], type: CLUSTER, sub: 'Companion galaxy', at: COMP, extra: { ckind: 'Interacting companion galaxy' }, world: 2, blurb: 'The smaller galaxy tugging on the Whirlpool, about 36,000 light-years (projected) north of its nucleus, at the tip of one spiral arm.' },
    { name: 'SN 2005cs', alt: [], type: NEBULA, sub: 'Type II-P supernova', at: skyPos(sky, 10.2, 180), extra: { nebKind: 'Supernova (Type II-P)', line: 'Hα', age: '21 years' }, color: C_SNR, world: 0.3, blurb: 'A core-collapse supernova whose progenitor star was identified in archival Hubble images.' },
    { name: 'SN 2011dh', alt: [], type: NEBULA, sub: 'Type IIb supernova', at: skyPos(sky, 21.2, 135), extra: { nebKind: 'Supernova (Type IIb)', line: 'Hα', age: '15 years' }, color: C_SNR, world: 0.3, blurb: 'A supernova from a yellow supergiant, caught within a day of exploding.' },
    { name: 'SN 1994I', alt: [], type: NEBULA, sub: 'Type Ic supernova', at: skyPos(sky, 2.5, 135), extra: { nebKind: 'Supernova (Type Ic)', line: 'none (no hydrogen)', age: '32 years' }, color: C_SNR, world: 0.3, blurb: 'One of the best-observed stripped-envelope supernovae, close to the nucleus.' },
    { name: 'M51-ULS-1', alt: [], type: BH, sub: 'X-ray binary', at: skyPos(sky, 13.0, 270), mass: null, extra: { bhKind: 'X-ray binary (neutron star or black hole)', companion: 'Massive blue star' }, blurb: 'A bright X-ray binary that dimmed for about three hours in 2012, as if something planet-sized passed in front of it.',
      planets: [{ n: 'M51-ULS-1b', t: 'Gas giant', sub: 'Planet candidate', a: null, aDraw: 12, p: null, m: null, r: 7.7, teq: null, tags: ['planet candidate', 'transit'], blurb: 'The first planet candidate found in another galaxy: a transit in X-rays by an object slightly smaller than Saturn (Di Stefano et al. 2021). Unconfirmed.' }] },
  ],
});
