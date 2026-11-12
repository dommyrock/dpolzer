/* ===================================================================== *
 * Milky Way — barred spiral (SBbc), seen from the Sun.
 * Disk in the XZ plane, +Y = north galactic pole, units kly. The Sun sits
 * 26.7 kly out (GRAVITY Collaboration 2019: R0 = 8.18 kpc); four log-spiral
 * arms with a 12.5° pitch (Reid et al. 2019), a 27°-tilted central bar,
 * the Orion Spur and an outer warp. Rotation is clockwise seen from the
 * north pole, as in the real Milky Way.
 * ===================================================================== */
import {
  TAU, DEG, clamp, rand, gauss, range, irange, pick, wrapPi, expR, galFromEq, equatorial, parseRA, parseDec, sexa, p2, hhmm, ddmm,
  STAR, PULSAR, NEBULA, CLUSTER, BH, CLS,
} from '../core.js';
import { digits } from '../catalog.js';

const R0 = 26.7;
const SUN = { x: 0, y: 0.068, z: R0 };
const TANP = Math.tan(12.5 * DEG);
const ARM_STEP = Math.exp(TANP * Math.PI / 2);
const ARMS = [12, 12 * ARM_STEP, 12 * ARM_STEP ** 2, 12 * ARM_STEP ** 3]
  .map((rc, k) => ({ rc, major: k % 2 === 1, alpha: Math.PI / 2 + Math.log(rc / 10) / TANP }));
const armTheta = (k, r) => ARMS[k].alpha - Math.log(r / 10) / TANP;
const SPUR_T = Math.tan(11 * DEG);
const spurTheta = (r) => Math.PI / 2 - Math.log(r / R0) / SPUR_T;
const BAR_A = 117 * DEG, BAR_HALF = 14, BAR_MINOR = 4.6;
const warpY = (r, th) => (r > 30 ? 0.07 * (r - 30) * Math.sin(th - 0.5) : 0);

function sampleArm(k, young) {
  const A = ARMS[k];
  const rMin = A.major ? 9 : 10.5, rMax = A.major ? 52 : (k === 0 ? 54 : 47);
  let r;
  do { r = rMin - 12 * Math.log(1 - rand() * 0.985); } while (r > rMax);
  const w = (0.45 + 0.03 * r) * (young ? 0.6 : 1);
  const th = armTheta(k, r) + gauss() * w / r;
  const rr = r + gauss() * w * 0.4;
  const hy = (young ? 0.14 : 0.32) * (1 + Math.max(0, r - 28) * 0.045);
  return { x: rr * Math.cos(th), y: gauss() * hy + warpY(rr, th), z: rr * Math.sin(th) };
}
function sampleSpur(young) {
  const r = range(23.6, 30.8);
  const th = spurTheta(r) + gauss() * (young ? 0.45 : 0.75) / r;
  return { x: r * Math.cos(th), y: gauss() * (young ? 0.12 : 0.25), z: r * Math.sin(th) };
}
function sampleBar() {
  const u = clamp(gauss() * 5.6, -BAR_HALF, BAR_HALF);
  const v = gauss() * 1.7 * (1 - Math.abs(u) / BAR_HALF * 0.4);
  const c = Math.cos(BAR_A), s = Math.sin(BAR_A);
  return { x: u * c - v * s, y: gauss() * (0.7 + 0.5 * Math.abs(u) / BAR_HALF), z: u * s + v * c };
}
const sampleBulge = () => ({ x: gauss() * 2.4, y: gauss() * 1.7, z: gauss() * 2.4 });
function sampleDisk() {
  const r = expR(3, 10, 56);
  const th = rand() * TAU;
  return { x: r * Math.cos(th), y: gauss() * 0.45 * (1 + Math.max(0, r - 28) * 0.04) + warpY(r, th), z: r * Math.sin(th) };
}
function sampleHalo() {
  const r = 6 - 14 * Math.log(1 - rand() * 0.995);
  const u = range(-1, 1), ph = rand() * TAU, q = Math.sqrt(1 - u * u);
  return { x: r * q * Math.cos(ph), y: r * u * 0.8, z: r * q * Math.sin(ph) };
}
function sampleArmAny(young) {
  if (rand() < 0.08) return sampleSpur(young);
  const k = rand() < 0.62 ? (rand() < 0.5 ? 1 : 3) : (rand() < 0.5 ? 0 : 2);
  return sampleArm(k, young);
}
let KNOTS = [];
function sampleKnot() { const c = pick(KNOTS); return { x: c.x + gauss() * 0.42, y: c.y + gauss() * 0.1, z: c.z + gauss() * 0.42 }; }

/* ---------- regions ---------- */
const REGIONS = [
  { id: 'bulge', label: 'Galactic Bulge', short: 'Bulge' },
  { id: 'bar', label: 'Central Bar', short: 'Bar' },
  { id: 'norma', label: 'Norma Arm', short: 'Norma' },
  { id: 'scutum', label: 'Scutum–Centaurus Arm', short: 'Scutum–Centaurus' },
  { id: 'sagittarius', label: 'Sagittarius–Carina Arm', short: 'Sagittarius–Carina' },
  { id: 'orion', label: 'Orion Spur', short: 'Orion Spur' },
  { id: 'perseus', label: 'Perseus Arm', short: 'Perseus' },
  { id: 'outer', label: 'Outer Arm', short: 'Outer' },
  { id: 'disk', label: 'Inter-arm disk', short: 'Inter-arm' },
  { id: 'halo', label: 'Stellar Halo', short: 'Halo' },
];
const RG = Object.fromEntries(REGIONS.map((r, i) => [r.id, i]));
const ARM_REGION = [RG.norma, RG.scutum, RG.sagittarius, RG.perseus];
function regionOf(x, y, z) {
  const r = Math.hypot(x, z);
  if (Math.abs(y) > 3.2 || r > 58) return RG.halo;
  if (r < 4.2) return RG.bulge;
  const c = Math.cos(BAR_A), s = Math.sin(BAR_A);
  const bx = x * c + z * s, bz = -x * s + z * c;
  if ((bx / BAR_HALF) ** 2 + (bz / BAR_MINOR) ** 2 < 1) return RG.bar;
  const th = Math.atan2(z, x);
  let best = RG.disk, bestD = 2.6 + r * 0.03;
  if (r > 8.5) {
    for (let k = 0; k < 4; k++) {
      const d = Math.abs(wrapPi(th - armTheta(k, r))) * r;
      if (d < bestD) { bestD = d; best = k === 0 && r > 30 ? RG.outer : ARM_REGION[k]; }
    }
  }
  if (r > 23.2 && r < 31) {
    const d = Math.abs(wrapPi(th - spurTheta(r))) * r;
    if (d < Math.min(bestD, 2.2)) best = RG.orion;
  }
  return best;
}

/* ---------- coordinates seen from the Sun ---------- */
function galactic(x, y, z) {
  const vx = x - SUN.x, vy = y - SUN.y, vz = z - SUN.z;
  const d = Math.hypot(vx, vy, vz);
  if (d < 1e-9) return { l: 0, b: 0, d: 0 };
  let l = Math.atan2(-vx, -vz) / DEG; if (l < 0) l += 360;
  return { l, b: Math.asin(vy / d) / DEG, d };
}
function fromGalactic(l, b, d) {
  l *= DEG; b *= DEG;
  return { x: SUN.x - d * Math.cos(b) * Math.sin(l), y: SUN.y + d * Math.sin(b), z: SUN.z - d * Math.cos(b) * Math.cos(l) };
}
function locate(p) {
  const g = galactic(p.x, p.y, p.z);
  const e = equatorial(g.l, g.b);
  return { l: g.l, b: g.b, d: g.d, ra: e.ra, dec: e.dec };
}

/* ---------- names for generated objects ---------- */
function twoMass(ra, dec) {
  const [H, M, S] = sexa(ra / 15), [D, DM, DS] = sexa(dec);
  return `2MASS J${p2(H)}${p2(M)}${Math.min(S, 59.99).toFixed(2).padStart(5, '0')}${dec < 0 ? '-' : '+'}${p2(D)}${p2(DM)}${Math.min(DS, 59.9).toFixed(1).padStart(4, '0')}`;
}
const gName = (prefix, l, b) => `${prefix}${l.toFixed(1).padStart(5, '0')}${b < 0 ? '-' : '+'}${Math.abs(b).toFixed(1).padStart(4, '0')}`;
const RG_CORE = (o) => o.region === RG.bulge || o.region === RG.bar;
const names = {
  star(o) {
    const { ra, dec } = o;
    if (o.cls === CLS.WD) return `WD ${hhmm(ra)}${dec < 0 ? '-' : '+'}${String(Math.round(Math.abs(dec) * 10)).padStart(3, '0')}`;
    if (o.d < 0.08 && (o.cls === CLS.M || o.cls === CLS.K)) return rand() < 0.6 ? `Gliese ${irange(1, 915)}` : `LHS ${irange(1, 5000)}`;
    if (o.d < 1.2 && rand() < 0.55) return `HD ${irange(1000, 359000)}`;
    if (o.d < 1.8 && rand() < 0.5) return `HIP ${irange(100, 118200)}`;
    if (o.d < 4 && rand() < 0.35) return `TYC ${irange(1, 9537)}-${irange(1, 2000)}-1`;
    if ((o.cls === CLS.M || o.lc === 'III') && rand() < 0.5) return twoMass(ra, dec);
    return `Gaia DR3 ${irange(1, 6)}${digits(18)}`;
  },
  starAlt(o) {
    if (/^HD /.test(o.name) && rand() < 0.6) o.alt.push(`HIP ${irange(100, 118200)}`);
    if (!/^Gaia/.test(o.name)) o.alt.push(`Gaia DR3 ${irange(1, 6)}${digits(18)}`);
  },
  host(h, hot) {
    const inKepler = h.l > 65 && h.l < 90 && h.b > 4 && h.b < 22;
    return hot ? pick([() => `WASP-${irange(1, 190)}`, () => `HAT-P-${irange(1, 70)}`, () => `KELT-${irange(1, 26)}`, () => `XO-${irange(1, 7)}`])()
      : h.d < 0.15 && h.cls === CLS.M ? `GJ ${irange(1000, 4400)}`
      : inKepler ? `Kepler-${irange(1, 1980)}` : pick([() => `TOI-${irange(100, 7500)}`, () => `K2-${irange(2, 420)}`, () => `TOI-${irange(100, 7500)}`])();
  },
  bh(o, iso) {
    return iso
      ? `${pick(['OGLE', 'MOA', 'KMT'])}-${irange(2011, 2025)}-BLG-${String(irange(1, 1999)).padStart(4, '0')}`
      : pick([
        () => `MAXI J${hhmm(o.ra)}${o.dec < 0 ? '-' : '+'}${String(Math.round(Math.abs(o.dec) * 10)).padStart(3, '0')}`,
        () => `Swift J${hhmm(o.ra)}.${irange(0, 9)}${ddmm(o.dec)}`,
        () => `XTE J${hhmm(o.ra)}${o.dec < 0 ? '-' : '+'}${String(Math.round(Math.abs(o.dec) * 10)).padStart(3, '0')}`,
        () => `4U ${hhmm(o.ra)}${o.dec < 0 ? '-' : '+'}${p2(Math.round(Math.abs(o.dec)))}`,
      ])();
  },
  psr(o, kind) { return kind === 'Magnetar' ? `SGR J${hhmm(o.ra)}${ddmm(o.dec)}` : `PSR J${hhmm(o.ra)}${ddmm(o.dec)}`; },
  psrAlt(o, kind) { if (kind === 'Radio pulsar' && rand() < 0.4) o.alt.push(`PSR B${hhmm((o.ra + 359.3) % 360)}${o.dec < 0 ? '-' : '+'}${p2(Math.round(Math.abs(o.dec)))}`); },
  neb(o, kind) {
    return kind === 'Planetary nebula' ? gName('PN G', o.l, o.b)
      : kind === 'Supernova remnant' ? gName('SNR G', o.l, o.b)
      : pick([() => `Sh2-${irange(1, 313)}`, () => `RCW ${irange(1, 182)}`, () => `NGC ${irange(1000, 7840)}`, () => `IC ${irange(1, 5386)}`, () => gName('G', o.l, o.b)])();
  },
  cl(o, glob) {
    return glob
      ? (RG_CORE(o) ? pick([() => `Terzan ${irange(1, 12)}`, () => `NGC ${irange(5000, 6800)}`, () => `ESO ${irange(100, 600)}-SC${p2(irange(1, 9))}`])() : pick([() => `NGC ${irange(100, 7100)}`, () => `Palomar ${irange(1, 15)}`])())
      : pick([() => `NGC ${irange(100, 7800)}`, () => `Collinder ${irange(1, 471)}`, () => `Berkeley ${irange(1, 104)}`, () => `Trumpler ${irange(1, 37)}`, () => `King ${irange(1, 27)}`, () => `Melotte ${irange(1, 245)}`])();
  },
};

/* ===================================================================== *
 * Landmarks: published positions and values (approximate where the
 * literature disagrees). Everything else is generated.
 * ===================================================================== */
const SOLAR = [
  ['Mercury', 0.387, 87.97, 0.055, 0.383, 440, 'Rocky', 'The smallest planet and the closest to the Sun.'],
  ['Venus', 0.723, 224.7, 0.815, 0.949, 230, 'Rocky', 'A rocky planet under a crushing carbon-dioxide atmosphere.'],
  ['Earth', 1.0, 365.25, 1, 1, 255, 'Rocky', 'Home. The only world known to host life.'],
  ['Mars', 1.524, 687, 0.107, 0.532, 210, 'Rocky', 'A cold desert world with the tallest volcano in the Solar System, Olympus Mons.'],
  ['Jupiter', 5.203, 4333, 317.8, 11.21, 110, 'Gas giant', 'The largest planet in the Solar System.'],
  ['Saturn', 9.537, 10759, 95.2, 9.45, 81, 'Gas giant', 'A gas giant known for its bright ring system.'],
  ['Uranus', 19.19, 30687, 14.5, 4.01, 58, 'Ice giant', 'An ice giant tipped on its side, with an axial tilt of 98°.'],
  ['Neptune', 30.07, 60190, 17.1, 3.88, 47, 'Ice giant', 'The outermost planet, with the fastest winds measured in the Solar System.'],
].map(([n, a, p, m, r, teq, t, blurb]) => ({ n, a, p, m, r, teq, t, blurb, hz: n === 'Earth' }));
const TRAPPIST = [
  ['b', 0.01154, 1.51, 1.374, 1.116, 400], ['c', 0.0158, 2.42, 1.308, 1.097, 342], ['d', 0.02227, 4.05, 0.388, 0.788, 288],
  ['e', 0.02925, 6.1, 0.692, 0.92, 251], ['f', 0.03849, 9.21, 1.039, 1.045, 219], ['g', 0.04683, 12.35, 1.321, 1.129, 199], ['h', 0.06189, 18.77, 0.326, 0.755, 173],
].map(([l, a, p, m, r, teq]) => ({ n: 'TRAPPIST-1 ' + l, a, p, m, r, teq, t: 'Rocky', hz: 'efg'.includes(l) }));

const LANDMARKS = [
  { name: 'Sun', alt: ['Sol'], type: STAR, sun: true, sub: 'Yellow dwarf', sp: 'G2V', cls: 'G', teff: 5772, mass: 1, radius: 1, lum: 1, age: 4.6, blurb: 'Our star, a G2V main-sequence star about 26,700 light-years from the galactic center, on the inner edge of the Orion Spur.', planets: SOLAR },
  { name: 'Sagittarius A*', alt: ['Sgr A*'], type: BH, center: true, sub: 'Supermassive black hole', mass: 4.3e6, extra: { bhKind: 'Supermassive', companion: 'The S-star cluster' }, blurb: 'The supermassive black hole at the center of the Milky Way, about 4.3 million times the mass of the Sun. The Event Horizon Telescope published its image in 2022.' },
  { name: 'Proxima Centauri', alt: ['Alpha Centauri C', 'GJ 551'], type: STAR, ra: '14 29 42.9', dec: '-62 40 46', d: 0.00424, sub: 'Red dwarf', sp: 'M5.5Ve', cls: 'M', teff: 3042, mass: 0.122, radius: 0.154, lum: 0.0017, age: 4.85, blurb: 'The nearest star to the Sun, a red dwarf 4.24 light-years away. Its planet Proxima b orbits in the habitable zone.', planets: [{ n: 'Proxima b', a: 0.0485, p: 11.19, m: 1.07, r: null, teq: 234, t: 'Rocky', hz: true, blurb: 'The nearest known exoplanet, at least as massive as Earth, in its star\'s habitable zone.' }] },
  { name: "Barnard's Star", alt: ['GJ 699'], type: STAR, ra: '17 57 48.5', dec: '+04 41 36', d: 0.00596, sub: 'Red dwarf', sp: 'M4V', cls: 'M', teff: 3195, mass: 0.16, radius: 0.19, lum: 0.0035, age: 10, blurb: 'A red dwarf six light-years away with the largest proper motion of any star in the sky.' },
  { name: 'Sirius', alt: ['Alpha Canis Majoris', 'HD 48915'], type: STAR, ra: '06 45 08.9', dec: '-16 42 58', d: 0.0086, sub: 'White main-sequence star', sp: 'A1V', cls: 'A', teff: 9940, mass: 2.06, radius: 1.71, lum: 25.4, age: 0.24, blurb: 'The brightest star in the night sky, with a white-dwarf companion, Sirius B.' },
  { name: 'Epsilon Eridani', alt: ['Ran', 'HD 22049'], type: STAR, ra: '03 32 55.8', dec: '-09 27 30', d: 0.0105, sub: 'Orange dwarf', sp: 'K2V', cls: 'K', teff: 5084, mass: 0.82, radius: 0.74, lum: 0.34, age: 0.6, blurb: 'A young orange dwarf 10.5 light-years away, wrapped in a dusty debris disk.' },
  { name: 'Tau Ceti', alt: ['HD 10700'], type: STAR, ra: '01 44 04.1', dec: '-15 56 15', d: 0.0119, sub: 'Yellow dwarf', sp: 'G8V', cls: 'G', teff: 5344, mass: 0.78, radius: 0.79, lum: 0.52, age: 5.8, blurb: 'A nearby Sun-like star 11.9 light-years away and a frequent target in the search for habitable planets.' },
  { name: 'Vega', alt: ['Alpha Lyrae', 'HD 172167'], type: STAR, ra: '18 36 56.3', dec: '+38 47 01', d: 0.025, sub: 'White main-sequence star', sp: 'A0V', cls: 'A', teff: 9602, mass: 2.1, radius: 2.36, lum: 40, age: 0.45, blurb: 'A rapidly rotating A0V star in Lyra and a historic zero point of the magnitude scale.' },
  { name: 'Arcturus', alt: ['Alpha Boötis', 'HD 124897'], type: STAR, ra: '14 15 39.7', dec: '+19 10 57', d: 0.0367, sub: 'Orange giant', sp: 'K1.5III', cls: 'K', lc: 'III', teff: 4286, mass: 1.08, radius: 25.4, lum: 170, age: 7.1, blurb: 'An orange giant in Boötes and the brightest star in the northern celestial hemisphere.' },
  { name: 'Aldebaran', alt: ['Alpha Tauri', 'HD 29139'], type: STAR, ra: '04 35 55.2', dec: '+16 30 33', d: 0.0653, sub: 'Orange giant', sp: 'K5III', cls: 'K', lc: 'III', teff: 3900, mass: 1.16, radius: 45, lum: 439, age: 6.4, blurb: 'An orange giant that marks the eye of Taurus. It lies in front of the Hyades cluster.' },
  { name: 'Betelgeuse', alt: ['Alpha Orionis', 'HD 39801'], type: STAR, ra: '05 55 10.3', dec: '+07 24 25', d: 0.548, sub: 'Red supergiant', sp: 'M1–M2Ia-ab', cls: 'M', lc: 'Ia', teff: 3600, mass: 16.5, radius: 764, lum: 100000, age: 0.01, blurb: "The red supergiant on Orion's shoulder. It dimmed sharply in 2019–2020 after shedding a cloud of dust." },
  { name: 'Rigel', alt: ['Beta Orionis', 'HD 34085'], type: STAR, ra: '05 14 32.3', dec: '-08 12 06', d: 0.86, sub: 'Blue supergiant', sp: 'B8Ia', cls: 'B', lc: 'Ia', teff: 12100, mass: 21, radius: 78.9, lum: 120000, age: 0.008, blurb: "The blue supergiant at Orion's foot, roughly 120,000 times as luminous as the Sun." },
  { name: 'Antares', alt: ['Alpha Scorpii', 'HD 148478'], type: STAR, ra: '16 29 24.5', dec: '-26 25 55', d: 0.55, sub: 'Red supergiant', sp: 'M1.5Iab', cls: 'M', lc: 'Iab', teff: 3570, mass: 13, radius: 680, lum: 76000, age: 0.012, blurb: 'The red supergiant at the heart of Scorpius. Its name means rival of Mars.' },
  { name: 'Polaris', alt: ['Alpha Ursae Minoris', 'HD 8890'], type: STAR, ra: '02 31 49.1', dec: '+89 15 51', d: 0.433, sub: 'Yellow supergiant', sp: 'F7Ib', cls: 'F', lc: 'Ib', teff: 6015, mass: 5.4, radius: 37.5, lum: 1260, age: 0.07, blurb: 'The North Star, a Cepheid variable supergiant in a triple system.' },
  { name: 'Canopus', alt: ['Alpha Carinae', 'HD 45348'], type: STAR, ra: '06 23 57.1', dec: '-52 41 45', d: 0.31, sub: 'Bright giant', sp: 'A9II', cls: 'A', lc: 'II', teff: 7400, mass: 8, radius: 71, lum: 10700, age: 0.025, blurb: 'The second-brightest star in the night sky, a bright giant in Carina.' },
  { name: 'Deneb', alt: ['Alpha Cygni', 'HD 197345'], type: STAR, ra: '20 41 25.9', dec: '+45 16 49', d: 2.6, sub: 'White supergiant', sp: 'A2Ia', cls: 'A', lc: 'Ia', teff: 8525, mass: 19, radius: 203, lum: 196000, age: 0.01, blurb: 'A white supergiant in Cygnus and one of the most luminous stars visible to the naked eye.' },
  { name: 'VY Canis Majoris', alt: ['HD 58061'], type: STAR, ra: '07 22 58.3', dec: '-25 46 03', d: 3.9, sub: 'Red hypergiant', sp: 'M5eIa', cls: 'M', lc: 'Ia', teff: 3490, mass: 17, radius: 1420, lum: 270000, age: 0.008, blurb: 'One of the largest known stars, a red hypergiant about 1,400 times the radius of the Sun.' },
  { name: 'Eta Carinae', alt: ['HD 93308'], type: STAR, ra: '10 45 03.6', dec: '-59 41 04', d: 7.5, sub: 'Luminous blue variable', sp: 'LBV', cls: 'B', lc: 'Ia', teff: null, mass: 100, radius: null, lum: 5000000, age: 0.003, blurb: 'A luminous blue variable binary. Its Great Eruption in the 1840s briefly made it the second-brightest star in the sky.' },
  { name: '51 Pegasi', alt: ['Helvetios', 'HD 217014'], type: STAR, ra: '22 57 28.0', dec: '+20 46 08', d: 0.0506, sub: 'Yellow subgiant', sp: 'G2IV', cls: 'G', lc: 'IV', teff: 5768, mass: 1.11, radius: 1.15, lum: 1.36, age: 6.1, blurb: 'The first Sun-like star found to host an exoplanet, in 1995.', planets: [{ n: '51 Pegasi b', alt: ['Dimidium'], a: 0.0527, p: 4.23, m: 146, r: null, teq: 1250, t: 'Hot Jupiter', blurb: 'The first exoplanet found around a Sun-like star (1995), a hot Jupiter on a 4.2-day orbit.' }] },
  { name: 'TRAPPIST-1', alt: ['2MASS J23062928-0502285'], type: STAR, ra: '23 06 29.3', dec: '-05 02 29', d: 0.0405, sub: 'Red dwarf', sp: 'M8V', cls: 'M', teff: 2566, mass: 0.09, radius: 0.119, lum: 0.00055, age: 7.6, blurb: 'An ultracool red dwarf 40 light-years away with seven Earth-sized planets.', planets: TRAPPIST },
  { name: 'Kepler-452', alt: ['KOI-7016'], type: STAR, ra: '19 44 01', dec: '+44 16 39', d: 1.8, sub: 'Yellow dwarf', sp: 'G2V', cls: 'G', teff: 5757, mass: 1.04, radius: 1.11, lum: 1.2, age: 6, planets: [{ n: 'Kepler-452 b', a: 1.046, p: 384.8, m: null, r: 1.63, teq: 265, t: 'Super-Earth', hz: true, blurb: 'A super-Earth on a 385-day orbit around a Sun-like star, near the inner edge of its habitable zone.' }] },
  { name: 'Kepler-186', alt: ['KOI-571'], type: STAR, ra: '19 54 36.7', dec: '+43 57 18', d: 0.579, sub: 'Red dwarf', sp: 'M1V', cls: 'M', teff: 3755, mass: 0.54, radius: 0.52, lum: 0.055, age: 4, planets: [{ n: 'Kepler-186 f', a: 0.432, p: 129.9, m: null, r: 1.17, teq: 188, t: 'Rocky', hz: true, blurb: "The first Earth-sized planet found in another star's habitable zone (2014)." }] },
  { name: 'Kepler-22', alt: ['KOI-87'], type: STAR, ra: '19 16 52.2', dec: '+47 53 04', d: 0.64, sub: 'Yellow dwarf', sp: 'G5V', cls: 'G', teff: 5518, mass: 0.97, radius: 0.98, lum: 0.79, age: 4, planets: [{ n: 'Kepler-22 b', a: 0.849, p: 289.9, m: null, r: 2.4, teq: 262, t: 'Mini-Neptune', hz: true, blurb: "Kepler's first confirmed planet in a habitable zone (2011)." }] },
  { name: 'Kepler-442', alt: ['KOI-4742'], type: STAR, ra: '19 01 28.0', dec: '+39 16 48', d: 1.19, sub: 'Orange dwarf', sp: 'K5V', cls: 'K', teff: 4402, mass: 0.61, radius: 0.6, lum: 0.12, age: 2.9, planets: [{ n: 'Kepler-442 b', a: 0.409, p: 112.3, m: null, r: 1.34, teq: 233, t: 'Rocky', hz: true, blurb: "A rocky planet slightly larger than Earth in its star's habitable zone." }] },
  { name: 'Kepler-16', alt: ['KOI-1611'], type: STAR, ra: '19 16 18.2', dec: '+51 45 27', d: 0.245, sub: 'Orange dwarf binary', sp: 'K7V + M', cls: 'K', teff: 4450, mass: 0.69, radius: 0.65, lum: 0.15, age: 3, tags: ['binary'], planets: [{ n: 'Kepler-16 b', a: 0.705, p: 228.8, m: 105.8, r: 8.45, teq: 188, t: 'Gas giant', tags: ['circumbinary'], blurb: 'A Saturn-mass planet that orbits both stars of a binary.' }] },
  { name: 'Crab Nebula', alt: ['M1', 'NGC 1952'], type: NEBULA, ra: '05 34 31.9', dec: '+22 00 52', d: 6.52, sub: 'Supernova remnant', extra: { nebKind: 'Supernova remnant', diam: 11, line: 'Hα + [O III]', age: 'about 970 years' }, blurb: 'The remnant of the supernova that Chinese astronomers recorded in 1054. A pulsar spins at its center.' },
  { name: 'Crab Pulsar', alt: ['PSR B0531+21', 'PSR J0534+2200'], type: PULSAR, ra: '05 34 31.9', dec: '+22 00 52', d: 6.5, sub: 'Young radio pulsar', extra: { pkind: 'Radio pulsar', period: 0.0337, field: 3.8e12, charAge: 1240 }, blurb: 'The neutron star left by the 1054 supernova, spinning 30 times a second.' },
  { name: 'Vela Pulsar', alt: ['PSR B0833-45', 'PSR J0835-4510'], type: PULSAR, ra: '08 35 20.6', dec: '-45 10 35', d: 0.959, sub: 'Radio pulsar', extra: { pkind: 'Radio pulsar', period: 0.0893, field: 3.4e12, charAge: 11300 }, blurb: 'A young pulsar known for frequent glitches, sudden jumps in its spin rate.' },
  { name: 'PSR B1919+21', alt: ['PSR J1921+2153', 'CP 1919'], type: PULSAR, ra: '19 21 44.8', dec: '+21 53 02', d: 2.3, sub: 'Radio pulsar', extra: { pkind: 'Radio pulsar', period: 1.3373, field: 1.4e12, charAge: 1.6e7 }, blurb: 'The first pulsar ever discovered, found by Jocelyn Bell Burnell in 1967.' },
  { name: 'PSR J0437-4715', alt: [], type: PULSAR, ra: '04 37 15.9', dec: '-47 15 09', d: 0.511, sub: 'Millisecond pulsar', extra: { pkind: 'Millisecond pulsar', period: 0.005757, field: 5.8e8, charAge: 1.6e9 }, blurb: 'The nearest and brightest millisecond pulsar, spinning 174 times a second.' },
  { name: 'SGR 1806-20', alt: ['SGR J1808-2024'], type: PULSAR, ra: '18 08 39.3', dec: '-20 24 40', d: 28, sub: 'Magnetar', extra: { pkind: 'Magnetar', period: 7.56, field: 2e15, charAge: 240 }, blurb: 'A magnetar whose giant flare in December 2004 was the brightest burst ever seen from beyond the Solar System.' },
  { name: 'Orion Nebula', alt: ['M42', 'NGC 1976'], type: NEBULA, ra: '05 35 17.3', dec: '-05 23 28', d: 1.344, sub: 'H II region', extra: { nebKind: 'H II region', diam: 24, line: 'Hα 656.3 nm', age: 'about 2 million years' }, blurb: "The nearest large star-forming region, visible to the naked eye in Orion's sword." },
  { name: 'Eagle Nebula', alt: ['M16', 'NGC 6611'], type: NEBULA, ra: '18 18 48', dec: '-13 49 00', d: 5.7, sub: 'H II region', extra: { nebKind: 'H II region', diam: 70, line: 'Hα 656.3 nm', age: 'about 5 million years' }, blurb: 'A star-forming region in Serpens, home of the Pillars of Creation.' },
  { name: 'Lagoon Nebula', alt: ['M8', 'NGC 6523'], type: NEBULA, ra: '18 03 37', dec: '-24 23 12', d: 4.1, sub: 'H II region', extra: { nebKind: 'H II region', diam: 110, line: 'Hα 656.3 nm', age: 'about 2 million years' }, blurb: 'A giant H II region in Sagittarius, bright enough to see with binoculars.' },
  { name: 'Carina Nebula', alt: ['NGC 3372'], type: NEBULA, ra: '10 45 08.5', dec: '-59 52 04', d: 7.55, sub: 'H II region', extra: { nebKind: 'H II region', diam: 230, line: 'Hα 656.3 nm', age: 'about 3 million years' }, blurb: 'One of the largest diffuse nebulae in the sky. It surrounds Eta Carinae.' },
  { name: 'Ring Nebula', alt: ['M57', 'NGC 6720'], type: NEBULA, ra: '18 53 35.1', dec: '+33 01 45', d: 2.28, sub: 'Planetary nebula', extra: { nebKind: 'Planetary nebula', diam: 2.6, line: '[O III] 500.7 nm', age: 'about 4,000 years' }, blurb: 'A planetary nebula in Lyra, the shell cast off by a dying Sun-like star.' },
  { name: 'Helix Nebula', alt: ['NGC 7293'], type: NEBULA, ra: '22 29 38.5', dec: '-20 50 14', d: 0.655, sub: 'Planetary nebula', extra: { nebKind: 'Planetary nebula', diam: 2.9, line: '[O III] 500.7 nm', age: 'about 10,000 years' }, blurb: 'One of the nearest planetary nebulae, about 650 light-years away.' },
  { name: "Cat's Eye Nebula", alt: ['NGC 6543'], type: NEBULA, ra: '17 58 33.4', dec: '+66 37 59', d: 3.3, sub: 'Planetary nebula', extra: { nebKind: 'Planetary nebula', diam: 0.65, line: '[O III] 500.7 nm', age: 'about 1,000 years' }, blurb: 'A planetary nebula with an intricate layered structure, imaged in detail by Hubble.' },
  { name: 'Cassiopeia A', alt: ['Cas A', '3C 461'], type: NEBULA, ra: '23 23 24', dec: '+58 48 54', d: 11.1, sub: 'Supernova remnant', extra: { nebKind: 'Supernova remnant', diam: 10, line: 'Hα + [O III]', age: 'about 350 years' }, blurb: 'A young supernova remnant whose explosion light reached Earth around 1680, and one of the brightest radio sources in the sky.' },
  { name: 'Pleiades', alt: ['M45', 'Seven Sisters'], type: CLUSTER, ra: '03 47 24', dec: '+24 07 00', d: 0.444, sub: 'Open cluster', extra: { ckind: 'Open cluster', members: 1000, age: 'about 100 million years', diam: 17, feh: '+0.03' }, blurb: 'The Seven Sisters, a young open cluster about 100 million years old.' },
  { name: 'Hyades', alt: ['Melotte 25'], type: CLUSTER, ra: '04 27 00', dec: '+15 52 00', d: 0.153, sub: 'Open cluster', extra: { ckind: 'Open cluster', members: 400, age: 'about 625 million years', diam: 20, feh: '+0.13' }, blurb: 'The nearest open cluster to the Sun, about 153 light-years away.' },
  { name: 'Omega Centauri', alt: ['NGC 5139'], type: CLUSTER, ra: '13 26 47.3', dec: '-47 28 46', d: 17.1, sub: 'Globular cluster', extra: { ckind: 'Globular cluster', members: 10000000, age: 'about 12 billion years', diam: 150, feh: '−1.5' }, blurb: 'The largest globular cluster in the Milky Way, about 10 million stars. It is probably the core of a disrupted dwarf galaxy.' },
  { name: '47 Tucanae', alt: ['NGC 104'], type: CLUSTER, ra: '00 24 05.7', dec: '-72 04 53', d: 14.7, sub: 'Globular cluster', extra: { ckind: 'Globular cluster', members: 1000000, age: 'about 12 billion years', diam: 120, feh: '−0.72' }, blurb: 'The second-brightest globular cluster, next to the Small Magellanic Cloud in the sky.' },
  { name: 'Hercules Cluster', alt: ['M13', 'NGC 6205'], type: CLUSTER, ra: '16 41 41.2', dec: '+36 27 35', d: 22.2, sub: 'Globular cluster', extra: { ckind: 'Globular cluster', members: 300000, age: 'about 11.7 billion years', diam: 145, feh: '−1.53' }, blurb: 'The great globular cluster in Hercules, target of the 1974 Arecibo message.' },
  { name: 'Westerlund 1', alt: ['Wd 1'], type: CLUSTER, ra: '16 47 04', dec: '-45 51 00', d: 13, sub: 'Super star cluster', extra: { ckind: 'Young massive cluster', members: 50000, age: 'about 4 million years', diam: 6, feh: '+0.0' }, blurb: 'One of the most massive young star clusters in the Milky Way, only a few million years old.' },
  { name: 'Cygnus X-1', alt: ['HDE 226868', 'V1357 Cyg'], type: BH, ra: '19 58 21.7', dec: '+35 12 06', d: 7.2, sub: 'Stellar-mass black hole', mass: 21.2, extra: { bhKind: 'X-ray binary', companion: 'O9.7 blue supergiant' }, blurb: 'The first source widely accepted as a black hole, about 21 times the mass of the Sun.' },
  { name: 'V404 Cygni', alt: ['GS 2023+338'], type: BH, ra: '20 24 03.8', dec: '+33 52 02', d: 7.8, sub: 'Stellar-mass black hole', mass: 9, extra: { bhKind: 'X-ray binary', companion: 'K-type subgiant' }, blurb: "A black hole paired with a star below the Sun's mass. It flared in 2015." },
  { name: 'GRS 1915+105', alt: ['V1487 Aql'], type: BH, ra: '19 15 11.6', dec: '+10 56 44', d: 28, sub: 'Microquasar', mass: 12.4, extra: { bhKind: 'Microquasar', companion: 'K-type giant' }, blurb: 'A microquasar whose jets appear to move faster than light, an effect called superluminal motion.' },
  { name: 'A0620-00', alt: ['V616 Mon'], type: BH, ra: '06 22 44.5', dec: '-00 20 45', d: 3.3, sub: 'Stellar-mass black hole', mass: 6.6, extra: { bhKind: 'X-ray binary', companion: 'K-type dwarf' }, blurb: 'One of the nearest known black holes, about 3,300 light-years away.' },
];


export default {
  id: 'milky-way',
  name: 'Milky Way',
  code: 'MW',
  seed: 0x2f6b9a1d,
  total: 10000,
  counts: { bh: 24, psr: 150, neb: 230, cl: 190, planets: 1130 },
  ref: 'sun', refLabel: 'From the Sun', refPhrase: 'from the Sun', distTitle: 'Distance from the Sun',
  distRange: [0.01, 100],
  home: { yaw: 0.42, pitch: 0.93, dist: 94 },
  scale: 1,
  period: 230,
  kind: 'Barred spiral · SBbc',
  facts: [
    ['Type', 'Barred spiral (SBbc)'],
    ['Disk diameter', '≈ 87,000–100,000 ly'],
    ['Stars', '100–400 billion'],
    ['Central black hole', 'Sgr A* · 4.3 million M☉'],
    ['Distance', 'You are here'],
  ],
  blurb: 'Our home galaxy, seen from the Sun’s position 26,700 light-years out: four spiral arms, a central bar and the Orion Spur we live in.',
  suggest: ['habitable', 'hot jupiter', 'supergiant', 'magnetar', 'globular', 'Kepler'],
  regions: REGIONS,
  regionOf,
  regionLabels: [
    ['Perseus Arm', 40, armTheta(3, 40)], ['Scutum–Centaurus Arm', 31, armTheta(1, 31)], ['Sagittarius–Carina Arm', 34, armTheta(2, 34)],
    ['Norma Arm', 17, armTheta(0, 17)], ['Outer Arm', 50, armTheta(0, 50)], ['Orion Spur', 29.5, spurTheta(29.5)], ['Central Bar', 12, BAR_A + Math.PI],
  ],
  init() {
    KNOTS = [];
    for (let i = 0; i < 150; i++) KNOTS.push(rand() < 0.1 ? sampleSpur(true) : sampleArm(i % 4, true));
  },
  pos(kind) {
    switch (kind) {
      case 'core': return rand() < 0.55 ? sampleBulge() : sampleBar();
      case 'halo': return sampleHalo();
      case 'disk': return sampleDisk();
      case 'arm': return sampleArmAny(false);
      case 'young': return sampleArmAny(true);
      default: return sampleKnot();
    }
  },
  locate,
  landmarks: LANDMARKS,
  landmarkPos(L) {
    if (L.sun) return { ...SUN };
    if (L.center) return { x: 0, y: 0, z: 0 };
    const g = galFromEq(parseRA(L.ra), parseDec(L.dec));
    return fromGalactic(g.l, g.b, L.d);
  },
  names,
  haze({ haze, hazeR }) {
    for (let k = 0; k < 8; k++) hazeR({ x: gauss() * 0.6, y: gauss() * 0.3, z: gauss() * 0.6 }, range(7, 13), 0.06);
    for (let k = 0; k < 380; k++) hazeR(rand() < 0.5 ? sampleBulge() : sampleBar(), range(2.4, 6), range(0.03, 0.05));
    for (let k = 0; k < 1500; k++) hazeR(sampleArmAny(false), range(1.6, 4.2), range(0.035, 0.06));
    for (let k = 0; k < 280; k++) haze(sampleKnot(), range(0.5, 1.4), [1.0, 0.36, 0.58], range(0.08, 0.15), [0.72, 0.17, 0.36]);
    for (let k = 0; k < 70; k++) haze(sampleKnot(), range(0.6, 1.2), [0.35, 0.9, 0.85], range(0.05, 0.08), [0.05, 0.5, 0.5]);
    for (let k = 0; k < 320; k++) hazeR(sampleDisk(), range(3, 7), 0.022);
    for (let k = 0; k < 1100; k++) {
      const q = rand() < 0.12 ? sampleBar() : sampleArm((rand() * 4) | 0, true);
      const s = rand() < 0.12 ? 1 : 0.94;
      haze({ x: q.x * s, y: q.y * 0.5, z: q.z * s }, range(0.8, 2.2), [0, 0, 0], range(0.16, 0.3), [0, 0, 0], 1);
    }
  },
};
