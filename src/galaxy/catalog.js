/* ===================================================================== *
 * Catalog generation. One call builds a galaxy's whole world from its
 * definition (src/galaxy/galaxies/*.js): the landmarks with published
 * values, every generated object, the GPU-packed node buffer, the
 * unresolved field stars and the haze.
 *
 * A definition G supplies the shape and the vocabulary:
 *   seed, total, counts { bh, psr, neb, cl, planets }
 *   init()            reset any RNG-driven model state (star-forming knots…)
 *   pos(kind)         a position {x,y,z} in kly for kind = core | halo | disk | arm | young | knot
 *   regions, regionOf(x, y, z)
 *   locate(p)         { l, b, d, ra, dec, earth? }: d is the distance from G.ref
 *   landmarks, landmarkPos(L)
 *   names             catalog-style names for generated objects
 *   haze(h)           pushes glow and dust sprites through h.haze / h.hazeR
 * and optional tuning (starMix, knotShare, globShare, isoShare, nebMix,
 * classW, enlarge, motion, colorScale, field, extraField).
 * ===================================================================== */
import {
  TAU, clamp, rand, gauss, range, logRange, irange, pick, wIndex, seed, fmtInt, sig, fmtDist, sci, fmtSpin, fmtPeriod,
  TYPES, STAR, PLANET, PULSAR, NEBULA, CLUSTER, BH, CLASSES, CLS, CLASS_W, RAD_GLOW, RAD_INK, radial, radSlot,
  C_ROCKY, C_GAS, C_ICE, C_HA, C_OIII, C_SNR, C_PSR, C_BH, C_OPEN, C_GLOB, C_EARTH, C_HOTJ,
} from './core.js';

export const STRIDE = 16;

let G = null, OBJ = [], usedNames = new Set();

function uniqueName(fn) {
  for (let t = 0; t < 40; t++) { const n = fn(); if (!usedNames.has(n)) { usedNames.add(n); return n; } }
  // position-based names repeat for crowded far galaxies; the suffix must still be unique
  const b = fn(), r = irange(2, 99);
  let n = `${b}-${r}`;
  for (let k = r + 1; usedNames.has(n); k++) n = `${b}-${k}`;
  usedNames.add(n); return n;
}
export const digits = (n) => { let s = ''; for (let i = 0; i < n; i++) s += (rand() * 10) | 0; return s; };
const orbitDrawn = (aAU) => 0.0011 * Math.pow(aAU, 0.35); // kly; heavily enlarged so orbits are visible
const orbitSpeed = (r) => 1.6 * Math.pow(r / 0.001, -1.5); // rad per second at 1×

function motionRandom(p, comp) {
  const r = Math.hypot(p.x, p.z), k = G.motion ?? 1;
  return {
    epiA: (comp === 'halo' ? range(0.6, 1.6) : range(0.12, 0.62)) * (r < 5 * k ? 0.6 : 1) * k,
    epiK: irange(1, 4), epiP: rand() * TAU,
    vK: irange(2, 6), y1: gauss() * (comp === 'halo' ? 1.2 : comp === 'core' ? 0.5 : 0.14) * k,
  };
}
const MOTION_FIXED = { epiA: 0, epiK: 0, epiP: 0, vK: 0, y1: 0 };

function place(o, p) {
  o.x = p.x; o.y = p.y; o.z = p.z;
  const g = G.locate(p);
  o.l = g.l; o.b = g.b; o.d = g.d; o.ra = g.ra; o.dec = g.dec;
  if (g.earth != null) o.earth = g.earth;
  o.gc = Math.hypot(p.x, p.y, p.z);
  o.region = G.regionOf(p.x, p.y, p.z);
}

function base(type, sub) {
  return { i: OBJ.length, type, sub, name: '', alt: [], tags: [], host: -1, planets: [], extra: {}, cls: -1, lc: '', motion: MOTION_FIXED, landmark: false, color: 0, size: 1, world: 0, maxOrb: 0, prom: 0 };
}
function push(o) { o.i = OBJ.length; OBJ.push(o); return o; }

/* ---- planets ---- */
const PLANET_TYPE = {
  'Rocky': { color: C_ROCKY, size: 1.3 }, 'Super-Earth': { color: C_ROCKY, size: 1.5 }, 'Mini-Neptune': { color: C_ICE, size: 1.7 },
  'Ice giant': { color: C_ICE, size: 2.0 }, 'Gas giant': { color: C_GAS, size: 2.5 }, 'Hot Jupiter': { color: C_HOTJ, size: 2.4 },
};
function addPlanet(host, spec, k) {
  const o = base(PLANET, 'Exoplanet');
  o.name = spec.n; usedNames.add(spec.n);
  o.alt = spec.alt || [];
  o.host = host.i;
  o.sub = host.sun ? (spec.t === 'Rocky' ? 'Terrestrial planet' : spec.t) : (spec.sub || spec.t);
  o.extra = { ptype: spec.t, a: spec.a, period: spec.p, mass: spec.m, radius: spec.r, teq: spec.teq, hz: !!spec.hz };
  o.tags = [spec.t.toLowerCase(), ...(spec.hz ? ['habitable zone'] : []), ...(spec.t === 'Hot Jupiter' ? ['hot jupiter'] : []), ...(spec.tags || [])];
  o.blurb = spec.blurb || planetBlurb(o, host);
  const pt = PLANET_TYPE[spec.t];
  o.color = spec.n === 'Earth' ? C_EARTH : pt.color;
  o.size = pt.size * range(0.92, 1.08);
  o.orbR = orbitDrawn(spec.aDraw ?? spec.a);
  o.orbW = orbitSpeed(o.orbR);
  o.orbP = rand() * TAU;
  o.landmark = host.landmark;
  o.motion = host.motion;
  ['x', 'y', 'z', 'l', 'b', 'd', 'gc', 'region', 'ra', 'dec', 'earth'].forEach((f) => { o[f] = host[f]; });
  o.cls = host.cls;
  o.prom = (host.landmark ? 900 : 0) + (spec.hz ? 5 : 0) + 1 - k * 0.01;
  push(o);
  host.planets.push(o.i);
  host.maxOrb = Math.max(host.maxOrb, o.orbR);
  return o;
}
function planetBlurb(o, host) {
  const e = o.extra;
  const t = e.ptype === 'Hot Jupiter' ? 'A hot Jupiter' : `A${/^[AEIOU]/.test(e.ptype) ? 'n' : ''} ${e.ptype.toLowerCase()}`;
  return `${t} on a ${fmtPeriod(e.period)} orbit around ${host.name}${e.hz ? ', inside its habitable zone' : ''}.`;
}

/* ---- landmarks: published positions and values ---- */
function addLandmarks() {
  for (const L of G.landmarks) {
    const o = base(L.type, L.sub);
    o.name = L.name; usedNames.add(L.name);
    o.alt = L.alt || []; o.landmark = true; o.sun = !!L.sun; o.center = !!L.center;
    o.blurb = L.blurb || '';
    o.extra = L.extra || {};
    o.tags = [...(L.tags || [])];
    place(o, G.landmarkPos(L));
    const enlarge = G.enlarge ?? 6;
    if (L.type === STAR) {
      o.cls = CLS[L.cls]; o.lc = L.lc || 'V'; o.sp = L.sp; o.teff = L.teff; o.mass = L.mass; o.radius = L.radius; o.lum = L.lum; o.age = L.age;
      o.color = o.cls;
      o.size = CLASSES[o.cls].size * (/^I[ab]|^Ia|^Ib|^II$/.test(o.lc) ? 1.75 : o.lc === 'III' ? 1.3 : 1) * (o.sun ? 1.25 : 1.1);
      o.tags.push(L.sub.toLowerCase());
    } else if (L.type === PULSAR) {
      o.color = C_PSR; o.size = o.extra.pkind === 'Magnetar' ? 2.6 : 2.2;
      o.tags.push(o.extra.pkind.toLowerCase());
    } else if (L.type === NEBULA) {
      o.color = o.extra.nebKind === 'Planetary nebula' ? C_OIII : o.extra.nebKind === 'Supernova remnant' ? C_SNR : C_HA;
      o.world = Math.max(0.12, (o.extra.diam ?? 0) / 1000 * enlarge); o.size = 9;
      o.tags.push(o.extra.nebKind.toLowerCase());
    } else if (L.type === CLUSTER) {
      o.color = /Globular/.test(o.extra.ckind) ? C_GLOB : C_OPEN;
      o.world = Math.max(0.1, (o.extra.diam ?? 0) / 1000 * Math.max(4, enlarge * 0.66)); o.size = 7;
      o.tags.push(o.extra.ckind.toLowerCase());
    } else if (L.type === BH) {
      o.color = C_BH; o.mass = L.mass; o.size = o.center ? 6 : 3.2;
      o.tags.push((o.extra.bhKind || '').toLowerCase());
    }
    if (L.color != null) o.color = L.color;
    if (L.world != null) o.world = L.world;
    o.prom = 1000 + (o.sun ? 100 : 0) + (o.center ? 90 : 0);
    push(o);
    if (L.planets) L.planets.forEach((spec, k) => { addPlanet(o, spec, k); });
  }
}

/* ---- stars ---- */
function starSub(cls, lc) {
  const id = CLASSES[cls].id;
  if (id === 'WD') return 'White dwarf';
  if (lc === 'III') return id === 'K' ? 'Orange giant' : id === 'M' ? 'Red giant' : 'Giant';
  if (lc === 'IV') return id === 'G' ? 'Yellow subgiant' : 'Subgiant';
  if (/^I/.test(lc)) return id === 'M' || id === 'K' ? 'Red supergiant' : id === 'F' || id === 'G' ? 'Yellow supergiant' : id === 'A' ? 'White supergiant' : 'Blue supergiant';
  return { O: 'Blue main-sequence star', B: 'Blue main-sequence star', A: 'White main-sequence star', F: 'Yellow-white dwarf', G: 'Yellow dwarf', K: 'Orange dwarf', M: 'Red dwarf' }[id];
}
const classWeights = (comp) => (G.classW ? G.classW(comp) : comp === 'arm' ? CLASS_W.arm : comp === 'disk' ? CLASS_W.disk : CLASS_W.old);
function makeStar() {
  const u = rand(), [mc, mh, md] = G.starMix || [0.17, 0.21, 0.41];
  let comp, p;
  if (u < mc) { comp = 'core'; p = G.pos('core'); }
  else if (u < mh) { comp = 'halo'; p = G.pos('halo'); }
  else if (u < md) { comp = 'disk'; p = G.pos('disk'); }
  else { comp = 'arm'; p = rand() < (G.knotShare ?? 0.3) ? G.pos('knot') : G.pos('arm'); }
  const cls = wIndex(classWeights(comp));
  const C = CLASSES[cls], id = C.id;
  let lc = 'V';
  if (id === 'WD') lc = '';
  else if ((id === 'K' || id === 'M') && rand() < (comp === 'core' || comp === 'halo' ? 0.25 : 0.09)) lc = 'III';
  else if ((id === 'O' || id === 'B') && rand() < 0.18) lc = rand() < 0.5 ? 'Ia' : 'Ib';
  else if (id === 'A' && rand() < 0.05) lc = 'Ib';
  else if (id === 'M' && comp === 'arm' && rand() < 0.012) lc = 'Iab';
  else if ((id === 'F' || id === 'G') && rand() < 0.08) lc = 'IV';

  const o = base(STAR, '');
  o.cls = cls; o.lc = lc;
  const f = rand();
  let teff, mass, radius;
  if (id === 'WD') {
    teff = logRange(5000, 40000); mass = range(0.5, 1.1); radius = 0.0125 * Math.pow(mass, -1 / 3) * range(0.85, 1.1);
  } else {
    teff = Math.exp(Math.log(C.t[0]) + (Math.log(C.t[1]) - Math.log(C.t[0])) * f);
    mass = Math.exp(Math.log(C.m[0]) + (Math.log(C.m[1]) - Math.log(C.m[0])) * f);
    if (lc === 'V' || lc === 'IV') { radius = mass < 1 ? Math.pow(mass, 0.8) : Math.pow(mass, 0.57); if (lc === 'IV') radius *= range(1.5, 2.6); }
    else if (lc === 'III') { teff = id === 'K' ? range(3900, 4900) : range(3300, 3900); mass = range(0.9, 3); radius = logRange(10, 80); }
    else if (id === 'M') { teff = range(3300, 3900); mass = range(10, 25); radius = logRange(300, 1200); }
    else { mass = range(12, 40); radius = id === 'O' ? logRange(12, 30) : id === 'B' ? logRange(25, 90) : logRange(60, 200); }
  }
  const lum = radius * radius * Math.pow(teff / 5772, 4);
  let age;
  if (id === 'WD') age = range(1, 12);
  else {
    const life = 10 * Math.pow(mass, -2.5);
    if (/^I/.test(lc)) age = Math.min(life, logRange(0.004, 0.03));
    else age = Math.min(life * range(0.1, 0.95), (comp === 'halo' ? 13 : comp === 'core' ? 12 : 10) * range(0.3, 1));
    if (comp === 'halo') age = Math.max(age, Math.min(life * 0.95, range(10, 13)));
  }
  o.teff = teff; o.mass = mass; o.radius = radius; o.lum = lum; o.age = age;
  if (id === 'WD') o.sp = `DA${(50400 / teff).toFixed(1)}`;
  else {
    const range0 = lc === 'III' ? (id === 'K' ? [3900, 4900] : [3300, 3900]) : C.t;
    const ft = (Math.log(teff) - Math.log(range0[0])) / (Math.log(range0[1]) - Math.log(range0[0]));
    let dg = clamp(Math.floor((1 - ft) * 10), 0, 9); if (id === 'O') dg = Math.max(3, dg);
    o.sp = `${id}${dg}${lc}`;
  }
  o.sub = starSub(cls, lc);
  o.color = cls;
  o.size = C.size * (lc === 'III' ? 1.3 : /^I/.test(lc) ? 1.75 : 1) * range(0.88, 1.12);
  place(o, p);
  o.motion = motionRandom(p, comp);
  o.tags.push(o.sub.toLowerCase());
  if (rand() < 0.3) o.tags.push('binary');
  if (rand() < (/^I/.test(lc) ? 0.5 : 0.08)) o.tags.push('variable');
  if (comp === 'halo') o.tags.push('metal-poor');
  if ((id === 'O' || id === 'B') && rand() < 0.04) o.tags.push('runaway');
  o.name = uniqueName(() => G.names.star(o));
  G.names.starAlt?.(o);
  o.prom = Math.log10(Math.max(lum, 1e-4)) + 2;
  return o;
}

/* ---- black holes, pulsars, nebulae, clusters ---- */
function makeBH() {
  const iso = rand() < (G.isoShare ?? 0.3);
  const p = iso ? G.pos('core') : (rand() < 0.6 ? G.pos('arm') : G.pos('disk'));
  const o = base(BH, iso ? 'Isolated black hole' : 'Stellar-mass black hole');
  place(o, p);
  o.motion = motionRandom(p, 'disk');
  o.mass = range(5, 21);
  o.extra = iso ? { bhKind: 'Isolated (found by microlensing)', companion: 'None' } : { bhKind: rand() < 0.15 ? 'Microquasar' : 'X-ray binary', companion: pick(['K-type dwarf', 'M-type dwarf', 'B-type giant', 'G-type subgiant', 'O-type supergiant']) };
  if (o.extra.bhKind === 'Microquasar') o.sub = 'Microquasar';
  o.name = uniqueName(() => G.names.bh(o, iso));
  o.color = C_BH; o.size = 3;
  o.tags.push(o.extra.bhKind.toLowerCase().split(' (')[0]);
  o.prom = 6;
  return o;
}
function makePulsar() {
  const u = rand();
  const kind = u < 0.08 ? 'Magnetar' : u < 0.2 ? 'Millisecond pulsar' : 'Radio pulsar';
  const p = kind === 'Magnetar' ? G.pos('young') : G.pos('disk');
  if (kind !== 'Magnetar') p.y += gauss() * 0.7 * (G.motion ?? 1);
  const o = base(PULSAR, kind);
  place(o, p);
  o.motion = motionRandom(p, 'disk');
  const period = kind === 'Magnetar' ? range(2, 12) : kind === 'Millisecond pulsar' ? logRange(0.0014, 0.01) : logRange(0.05, 5);
  o.extra = {
    pkind: kind, period,
    field: kind === 'Magnetar' ? logRange(1e14, 2e15) : kind === 'Millisecond pulsar' ? logRange(1e8, 1e9) : logRange(1e11, 1e13),
    charAge: kind === 'Magnetar' ? logRange(300, 3e4) : kind === 'Millisecond pulsar' ? logRange(1e9, 1e10) : logRange(1e3, 1e8),
  };
  o.name = uniqueName(() => G.names.psr(o, kind));
  G.names.psrAlt?.(o, kind);
  o.color = C_PSR; o.size = kind === 'Magnetar' ? 2.6 : 2.1;
  o.tags.push(kind.toLowerCase());
  if (rand() < 0.15) o.tags.push('binary');
  o.prom = 4;
  return o;
}
function makeNebula() {
  const u = rand(), [mh, mp] = G.nebMix || [0.55, 0.83];
  const kind = u < mh ? 'H II region' : u < mp ? 'Planetary nebula' : 'Supernova remnant';
  const p = kind === 'H II region' ? (rand() < 0.6 ? G.pos('knot') : G.pos('young')) : kind === 'Planetary nebula' ? G.pos('disk') : (rand() < 0.6 ? G.pos('young') : G.pos('disk'));
  const o = base(NEBULA, kind);
  place(o, p);
  o.motion = motionRandom(p, 'arm');
  const diam = kind === 'H II region' ? logRange(20, 300) : kind === 'Planetary nebula' ? range(0.5, 3) : logRange(10, 150);
  o.extra = {
    nebKind: kind, diam,
    line: kind === 'H II region' ? 'Hα 656.3 nm' : kind === 'Planetary nebula' ? '[O III] 500.7 nm' : 'Hα + [O III]',
    age: kind === 'H II region' ? `about ${range(1, 10).toFixed(0)} million years` : kind === 'Planetary nebula' ? `about ${fmtInt(Math.round(logRange(3000, 30000) / 100) * 100)} years` : `about ${fmtInt(Math.round(logRange(300, 40000) / 10) * 10)} years`,
  };
  o.name = uniqueName(() => G.names.neb(o, kind));
  o.color = kind === 'Planetary nebula' ? C_OIII : kind === 'Supernova remnant' ? C_SNR : C_HA;
  const enlarge = G.enlarge ?? 6;
  o.world = Math.max(0.1 * (G.motion ?? 1), diam / 1000 * (kind === 'Planetary nebula' ? 40 : enlarge));
  o.size = kind === 'Planetary nebula' ? 5 : 8;
  o.tags.push(kind.toLowerCase());
  o.prom = 3;
  return o;
}
function makeCluster() {
  const glob = rand() < (G.globShare ?? 0.32);
  const p = glob ? (rand() < 0.75 ? G.pos('halo') : G.pos('core')) : (rand() < 0.5 ? G.pos('knot') : G.pos('young'));
  const o = base(CLUSTER, glob ? 'Globular cluster' : 'Open cluster');
  place(o, p);
  o.motion = motionRandom(p, glob ? 'halo' : 'arm');
  const diam = glob ? range(60, 250) : range(6, 40);
  const ageY = glob ? range(10.5, 13.2) * 1e9 : logRange(5e6, 2e9);
  o.extra = {
    ckind: glob ? 'Globular cluster' : 'Open cluster', diam,
    members: glob ? Math.round(logRange(5e4, 1.5e6) / 1000) * 1000 : Math.round(logRange(40, 3000) / 10) * 10,
    age: ageY >= 1e9 ? `about ${(ageY / 1e9).toFixed(1)} billion years` : `about ${fmtInt(Math.round(ageY / 1e6))} million years`,
    feh: (glob ? range(-2.3, -0.4) : range(-0.3, 0.3)).toFixed(2).replace('-', '−').replace(/^(\d)/, '+$1'),
  };
  o.name = uniqueName(() => G.names.cl(o, glob));
  o.color = glob ? C_GLOB : C_OPEN;
  o.world = Math.max(0.08, diam / 1000 * 4);
  o.size = glob ? 6 : 5;
  o.tags.push(o.extra.ckind.toLowerCase());
  o.prom = glob ? 5 : 3;
  return o;
}

/* ---- planetary systems for generated stars (only where planets are actually found) ---- */
function planetSpec(hostO, aAU) {
  let t;
  const u = rand();
  if (aAU < 0.1 && u < 0.25) t = 'Hot Jupiter';
  else { const v = rand(); t = v < 0.3 ? 'Rocky' : v < 0.52 ? 'Super-Earth' : v < 0.77 ? 'Mini-Neptune' : v < 0.87 ? 'Ice giant' : 'Gas giant'; }
  if ((t === 'Gas giant' || t === 'Ice giant') && aAU < 0.3) t = 'Mini-Neptune';
  const r = { 'Rocky': range(0.5, 1.5), 'Super-Earth': range(1.5, 2.0), 'Mini-Neptune': range(2.0, 4.0), 'Ice giant': range(4, 8), 'Gas giant': range(8, 15), 'Hot Jupiter': range(10, 20) }[t];
  let m = t === 'Rocky' || t === 'Super-Earth' ? 0.9 * Math.pow(r, 3.45) : t === 'Mini-Neptune' || t === 'Ice giant' ? 2.7 * Math.pow(r, 1.3) : logRange(60, 3000);
  if (rand() < 0.35) m = null; // transit-only: radius known, mass not measured
  const p = 365.25 * Math.sqrt(Math.pow(aAU, 3) / Math.max(hostO.mass, 0.08));
  const teq = hostO.teff * Math.sqrt(hostO.radius * 0.00465 / (2 * aAU)) * 0.915;
  return { a: aAU, p, m, r, teq, t, hz: teq >= 180 && teq <= 270 && (t === 'Rocky' || t === 'Super-Earth') };
}
function addPlanetSystems(firstStar, nStars, count) {
  let plLeft = count, guard = 0;
  while (plLeft > 0 && guard++ < 200000) {
    const h = OBJ[firstStar + Math.floor(rand() * nStars)];
    if (h.planets.length || h.cls < CLS.F || h.cls > CLS.M || (h.lc !== 'V' && h.lc !== 'IV')) continue;
    if (rand() > 0.2 + 0.8 * Math.exp(-h.d / 6)) continue;
    let n = [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 5, 6][(rand() * 21) | 0];
    n = Math.min(n, plLeft);
    const as = [];
    let a = logRange(0.025, 0.4);
    for (let k = 0; k < n; k++) { as.push(a); a *= range(1.45, 2.6); }
    const specs = as.map((aa) => planetSpec(h, aa));
    const hot = specs.some((s) => s.t === 'Hot Jupiter');
    const old = h.name;
    usedNames.delete(old);
    h.name = uniqueName(() => G.names.host(h, hot));
    h.alt.unshift(old);
    h.tags.push('planet host');
    specs.forEach((s, k) => { s.n = `${h.name} ${'bcdefgh'[k]}`; addPlanet(h, s, k); });
    plLeft -= n;
  }
}

function genBlurb(o) {
  const reg = G.regions[o.region].label, dist = `${fmtDist(o.d)} ${G.refPhrase}`;
  switch (o.type) {
    case STAR: return `${/^[AEIOU]/.test(o.sub) ? 'An' : 'A'} ${o.sub.toLowerCase()} of type ${o.sp} in the ${reg}, ${dist}.`;
    case PULSAR: return o.extra.pkind === 'Magnetar' ? `A magnetar with a surface field near ${sci(o.extra.field)} G, spinning once every ${fmtSpin(o.extra.period)}.` : `${o.extra.pkind === 'Millisecond pulsar' ? 'A millisecond pulsar' : 'A radio pulsar'} spinning once every ${fmtSpin(o.extra.period)}, ${dist}.`;
    case NEBULA: return `${o.extra.nebKind === 'H II region' ? 'An H II region' : 'A ' + o.extra.nebKind.toLowerCase()} about ${sig(o.extra.diam)} light-years across, glowing in ${o.extra.line}.`;
    case CLUSTER: return `${o.extra.ckind === 'Globular cluster' ? 'A globular cluster' : 'An open cluster'} of about ${fmtInt(o.extra.members)} stars, ${o.extra.age} old.`;
    case BH: return o.extra.companion === 'None' ? `A ${o.mass.toFixed(1)} M☉ black hole with no companion, detected when it bent the light of a background star.` : `A ${o.mass.toFixed(1)} M☉ black hole pulling gas from a ${o.extra.companion}.`;
    default: return '';
  }
}

/* ===================================================================== *
 * Build
 * ===================================================================== */
export function buildWorld(def) {
  const t0 = performance.now();
  G = def; OBJ = []; usedNames = new Set();
  seed(G.seed);
  G.init?.();

  addLandmarks();
  const c = G.counts;
  for (let k = 0; k < c.bh; k++) push(makeBH());
  for (let k = 0; k < c.psr; k++) push(makePulsar());
  for (let k = 0; k < c.neb; k++) push(makeNebula());
  for (let k = 0; k < c.cl; k++) push(makeCluster());
  const firstStar = OBJ.length;
  const nStars = G.total - OBJ.length - c.planets;
  for (let k = 0; k < nStars; k++) push(makeStar());
  if (c.planets > 0) addPlanetSystems(firstStar, nStars, c.planets);

  // blurbs + search text
  const N = OBJ.length;
  for (const o of OBJ) {
    if (!o.blurb) o.blurb = genBlurb(o);
    const host = o.host >= 0 ? OBJ[o.host] : null;
    o.hay = [o.name, ...o.alt, TYPES[o.type].one, o.sub, o.sp || '', G.regions[o.region].label,
      ...o.tags, host ? host.name : '', o.cls >= 0 ? `class ${CLASSES[o.cls].id}` : ''].join(' ').toLowerCase();
  }

  /* ---- pack per-object GPU data: 16 floats per object
   *  [0..3]  r0, θ0, y0, epicycle amplitude
   *  [4..7]  epicycle k, epicycle phase, vertical k, vertical amp 2
   *  [8..11] orbit radius | world size, orbit speed | pulse rate, orbit phase, kind
   *  [12..15] size px, color slot, seed, (unused) ---- */
  const NODE = new Float32Array(N * STRIDE);
  const typeOf = new Uint8Array(N);
  const clsOf = new Int8Array(N), regOf = new Uint8Array(N), distOf = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const o = OBJ[i], m = o.motion, j = i * STRIDE;
    const host = o.host >= 0 ? OBJ[o.host] : o;
    NODE[j] = Math.hypot(host.x, host.z); NODE[j + 1] = Math.atan2(host.z, host.x); NODE[j + 2] = host.y; NODE[j + 3] = m.epiA;
    NODE[j + 4] = m.epiK; NODE[j + 5] = m.epiP; NODE[j + 6] = m.vK; NODE[j + 7] = m.y1;
    if (o.type === PLANET) { NODE[j + 8] = o.orbR; NODE[j + 9] = o.orbW; NODE[j + 10] = o.orbP; }
    else if (o.type === PULSAR) { NODE[j + 9] = o.extra.pkind === 'Millisecond pulsar' ? 3.2 : o.extra.pkind === 'Magnetar' ? 0.35 : clamp(0.9 / Math.sqrt(o.extra.period), 0.5, 2.8); }
    else NODE[j + 8] = o.world;
    NODE[j + 11] = o.type;
    NODE[j + 12] = o.size; NODE[j + 13] = o.color; NODE[j + 14] = rand();
    typeOf[i] = o.type; clsOf[i] = o.cls; regOf[i] = o.region; distOf[i] = o.d;
  }

  /* ---- unresolved field stars + distant sky (non-interactive) ---- */
  const fieldCfg = G.field || {};
  const nField = fieldCfg.n ?? 46000, nSky = fieldCfg.sky ?? 2400, nExtra = fieldCfg.extra ?? 0;
  const [fc, fh, fd] = fieldCfg.mix || [0.22, 0.28, 0.5];
  const cs = G.colorScale ?? 1;
  const FIELD = new Float32Array((nField + nSky + nExtra) * STRIDE);
  let j = 0;
  for (let k = 0; k < nSky; k++, j += STRIDE) {
    const u = range(-1, 1), ph = rand() * TAU, q = Math.sqrt(1 - u * u), R = range(700, 1100);
    FIELD[j] = R * q * Math.cos(ph); FIELD[j + 1] = R * u; FIELD[j + 2] = R * q * Math.sin(ph);
    FIELD[j + 11] = 7; FIELD[j + 12] = range(0.6, 1.25); FIELD[j + 13] = wIndex(CLASS_W.disk); FIELD[j + 14] = rand();
  }
  const pushField = (p, comp, colorSlot, size = range(0.55, 1.25)) => {
    if (j >= FIELD.length) return;
    const m = motionRandom(p, comp);
    FIELD[j] = Math.hypot(p.x, p.z); FIELD[j + 1] = Math.atan2(p.z, p.x); FIELD[j + 2] = p.y; FIELD[j + 3] = m.epiA;
    FIELD[j + 4] = m.epiK; FIELD[j + 5] = m.epiP; FIELD[j + 6] = m.vK; FIELD[j + 7] = m.y1;
    FIELD[j + 11] = 6; FIELD[j + 12] = size; FIELD[j + 13] = colorSlot; FIELD[j + 14] = rand();
    j += STRIDE;
  };
  for (let k = 0; k < nField; k++) {
    const u = rand();
    let p, comp, cw;
    if (u < fc) { comp = 'core'; p = G.pos('core'); cw = classWeights('core'); }
    else if (u < fh) { comp = 'halo'; p = G.pos('halo'); cw = classWeights('halo'); }
    else if (u < fd) { comp = 'disk'; p = G.pos('disk'); cw = classWeights('disk'); }
    else { comp = 'arm'; p = rand() < 0.25 ? G.pos('knot') : rand() < 0.3 ? G.pos('young') : G.pos('arm'); cw = classWeights('arm'); }
    const rr = (Math.hypot(p.x, p.z) + Math.abs(p.y)) * Math.exp(gauss() * 0.18) * cs;
    pushField(p, comp, rand() < 0.12 ? wIndex(cw) : radSlot(rr));
  }
  if (nExtra) G.extraField?.(pushField);
  const nFieldAll = j / STRIDE;

  /* ---- haze (galactic glow) + dust lanes: 12 floats each ---- */
  const HAZE = [];
  const haze = (p, size, glow, a, ink, dust = 0) => {
    HAZE.push(Math.hypot(p.x, p.z), Math.atan2(p.z, p.x), p.y, size, glow[0], glow[1], glow[2], a, ink[0], ink[1], ink[2], dust);
  };
  const hazeR = (p, size, a) => {
    const r = Math.hypot(p.x, p.z) * Math.exp(gauss() * 0.12) * cs;
    haze(p, size, radial(RAD_GLOW, r), a * (r > 20 ? 1.6 : 1), radial(RAD_INK, r));
  };
  G.haze({ haze, hazeR });
  const HAZE_DATA = new Float32Array(HAZE);

  return {
    G, OBJ, N, NODE, typeOf, clsOf, regOf, distOf,
    FIELD, nField: nFieldAll, HAZE_DATA, nHaze: HAZE_DATA.length / 12,
    buildMs: performance.now() - t0,
  };
}
