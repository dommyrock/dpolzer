/* ===================================================================== *
 * Shape kit for the galaxies other than the Milky Way.
 *
 * external(cfg) fills in what every external galaxy shares: distances are
 * measured from the galaxy's center, sky positions come from projecting the
 * galaxy frame onto the sky at its real RA/Dec, position angle, inclination
 * and distance, and generated objects get position-based designations.
 *
 * spiral(cfg) is a parametric disk galaxy: bulge, optional bar, exponential
 * disk, log-spiral arms, optional star-forming rings, a stellar halo and
 * star-forming knots. elliptical(cfg) is a Hernquist-profile spheroid.
 * Units are kly throughout; the disk lies in XZ with +Y its normal.
 * ===================================================================== */
import {
  TAU, DEG, clamp, rand, gauss, range, irange, pick, wIndex, wrapPi, expR, skyProject, galFromEq, jname, hhmm, ddmm, CLASS_W,
} from '../core.js';

export const at = (r, thDeg, y = 0) => ({ x: r * Math.cos(thDeg * DEG), y, z: r * Math.sin(thDeg * DEG) });

/** Shared defaults for a galaxy seen from outside. cfg.sky = { ra, dec, pa, incl, dist } (deg, kly). */
export function external(cfg) {
  const code = cfg.code;
  const names = {
    star: (o) => `${cfg.starCat || code} ${jname(o.ra, o.dec)}`,
    bh: (o, iso) => (iso ? `${code} ULX-${irange(1, 99)}` : `CXO ${jname(o.ra, o.dec)}`),
    psr: (o) => `PSR J${hhmm(o.ra)}${ddmm(o.dec)}`,
    neb: (o, kind) => `${code} ${kind === 'H II region' ? 'HII' : kind === 'Planetary nebula' ? 'PN' : 'SNR'} ${irange(1, 2999)}`,
    cl: (o, glob) => `${code} ${glob ? 'GC' : 'C'} ${irange(1, 1999)}`,
    host: (o) => o.name,
    ...(cfg.names || {}),
  };
  return {
    ref: 'center', refLabel: 'From the center', refPhrase: `from the center of ${cfg.short || cfg.name}`, distTitle: 'Distance from the center',
    distRange: [0.02 * cfg.R, 1.6 * cfg.R],
    ring: true,
    colorScale: 45 / cfg.R,
    motion: clamp(cfg.R / 50, 0.35, 1.4),
    enlarge: 4,
    scale: cfg.R / 50,
    locate(p) {
      const s = skyProject(cfg.sky, p.x, p.y, p.z);
      const g = galFromEq(s.ra, s.dec);
      return { l: g.l, b: g.b, d: Math.hypot(p.x, p.y, p.z), ra: s.ra, dec: s.dec, earth: s.earth };
    },
    landmarkPos(L) { return L.at ? { ...L.at } : { x: 0, y: 0, z: 0 }; },
    ...cfg,
    counts: { bh: 0, psr: 0, neb: 0, cl: 0, planets: 0, ...cfg.counts },
    names,
  };
}

/* ---------- haze helpers ---------- */
const HII = [1.0, 0.36, 0.58], HII_INK = [0.72, 0.17, 0.36];
const OIII = [0.35, 0.9, 0.85], OIII_INK = [0.05, 0.5, 0.5];
export const DUST = [[0, 0, 0], [0, 0, 0]];

/**
 * A disk galaxy. cfg:
 *   R            visible radius
 *   bulge        { sx, sy, share? }        Gaussian bulge (share of 'core' draws that are bulge vs bar)
 *   bar          { angle, half, minor, cx?, cz? } | null
 *   disk         { r0, h, thick, flare? }
 *   arms         { n, pitch, rRef, phase, rMin, rMax, w0, w1, weights?, spur? } | null
 *   rings        [{ r, w, share, thick? }]   star-forming rings (share of young draws)
 *   halo         { r0, h, flat }
 *   knots        number of star-forming knots
 *   warp         amplitude (kly per kly beyond 0.6 R)
 *   regionNames  { bulge, bar, arms: [...], ring: [...], disk, halo }
 */
export function spiral(cfg) {
  const { R, bulge, bar, disk, arms, rings = [], halo, knots: nKnots = 120, warp = 0, satellites = [] } = cfg;
  const tanP = arms ? Math.tan(arms.pitch * DEG) : 1;
  const armTheta = (k, r) => arms.phase + k * TAU / arms.n - Math.log(r / arms.rRef) / tanP;
  const warpY = (r, th) => (r > 0.6 * R ? warp * (r - 0.6 * R) * Math.sin(th - 0.5) : 0);
  const barC = bar ? { c: Math.cos(bar.angle * DEG), s: Math.sin(bar.angle * DEG), cx: bar.cx || 0, cz: bar.cz || 0 } : null;

  function sampleArm(k, young) {
    let r;
    do { r = arms.rMin - arms.h * Math.log(1 - rand() * 0.985); } while (r > arms.rMax);
    const w = (arms.w0 + arms.w1 * r) * (young ? 0.6 : 1);
    const th = armTheta(k, r) + gauss() * w / r;
    const rr = r + gauss() * w * 0.4;
    const hy = (young ? disk.thick * 0.35 : disk.thick * 0.75) * (1 + Math.max(0, r - 0.55 * R) / R * 1.5);
    return { x: rr * Math.cos(th), y: gauss() * hy + warpY(rr, th), z: rr * Math.sin(th) };
  }
  function sampleRing(ring, young) {
    const r = ring.r + gauss() * ring.w * (young ? 0.6 : 1), th = rand() * TAU;
    return { x: r * Math.cos(th), y: gauss() * (ring.thick ?? disk.thick * 0.4), z: r * Math.sin(th) };
  }
  function sampleArmAny(young) {
    for (const ring of rings) if (rand() < ring.share) return sampleRing(ring, young);
    if (!arms) return sampleDisk();
    const k = arms.weights ? wIndex(arms.weights) : (rand() * arms.n) | 0;
    return sampleArm(k, young);
  }
  function sampleBar() {
    const u = clamp(gauss() * bar.half * 0.4, -bar.half, bar.half);
    const v = gauss() * bar.minor * 0.37 * (1 - Math.abs(u) / bar.half * 0.4);
    return { x: barC.cx + u * barC.c - v * barC.s, y: gauss() * (bulge.sy * 0.4 + 0.3 * bulge.sy * Math.abs(u) / bar.half), z: barC.cz + u * barC.s + v * barC.c };
  }
  const sampleBulge = () => ({ x: gauss() * bulge.sx, y: gauss() * bulge.sy, z: gauss() * bulge.sx });
  function sampleDisk() {
    const r = expR(disk.r0, disk.h, R * 1.12);
    const th = rand() * TAU;
    return { x: r * Math.cos(th), y: gauss() * disk.thick * (1 + Math.max(0, r - 0.55 * R) / R * (disk.flare ?? 1.2)) + warpY(r, th), z: r * Math.sin(th) };
  }
  function sampleHalo() {
    const r = halo.r0 - halo.h * Math.log(1 - rand() * 0.995);
    const u = range(-1, 1), ph = rand() * TAU, q = Math.sqrt(1 - u * u);
    return { x: r * q * Math.cos(ph), y: r * u * halo.flat, z: r * q * Math.sin(ph) };
  }
  let KNOTS = [];
  const knotJ = R * 0.008;
  function sampleKnot() { const c = pick(KNOTS); return { x: c.x + gauss() * knotJ, y: c.y + gauss() * knotJ * 0.25, z: c.z + gauss() * knotJ }; }

  /* regions */
  const rn = cfg.regionNames;
  const REGIONS = [];
  const add = (label, short) => { REGIONS.push({ id: label, label, short: short || label }); return REGIONS.length - 1; };
  const RG_BULGE = add(rn.bulge[0], rn.bulge[1]);
  const RG_BAR = bar ? add(rn.bar[0], rn.bar[1]) : -1;
  const RG_ARMS = arms ? rn.arms.map(([l, s]) => add(l, s)) : [];
  const RG_RINGS = rings.map((_, i) => add(rn.ring[i][0], rn.ring[i][1]));
  const RG_DISK = add(rn.disk[0], rn.disk[1]);
  const RG_HALO = add(rn.halo[0], rn.halo[1]);
  const RG_SATS = satellites.map((sat) => add(sat.label, sat.short));
  const bulgeR = bulge.sx * 1.6;
  const sampleSat = (sat) => { const p = hernquist(sat.rad * 0.3, sat.q ?? 0.8, sat.rad * 1.6); return { x: sat.c.x + p.x, y: sat.c.y + p.y, z: sat.c.z + p.z }; };
  function regionOf(x, y, z) {
    for (let i = 0; i < satellites.length; i++) { const c = satellites[i].c; if (Math.hypot(x - c.x, y - c.y, z - c.z) < satellites[i].rad * 1.7) return RG_SATS[i]; }
    const r = Math.hypot(x, z);
    if (Math.abs(y) > Math.max(disk.thick * 6, bulge.sy * 1.8) || r > R * 1.15) return RG_HALO;
    if (Math.hypot(r, y) < bulgeR) return RG_BULGE;
    if (bar) {
      const dx = x - barC.cx, dz = z - barC.cz;
      const bx = dx * barC.c + dz * barC.s, bz = -dx * barC.s + dz * barC.c;
      if ((bx / bar.half) ** 2 + (bz / bar.minor) ** 2 < 1) return RG_BAR;
    }
    for (let i = 0; i < rings.length; i++) if (Math.abs(r - rings[i].r) < rings[i].w * 1.6) return RG_RINGS[i];
    if (arms && r > arms.rMin * 0.8) {
      const th = Math.atan2(z, x);
      let best = -1, bestD = (arms.w0 + arms.w1 * r) * 2.2;
      for (let k = 0; k < arms.n; k++) {
        const d = Math.abs(wrapPi(th - armTheta(k, r))) * r;
        if (d < bestD) { bestD = d; best = k; }
      }
      if (best >= 0) return RG_ARMS[Math.min(best, RG_ARMS.length - 1)];
    }
    return RG_DISK;
  }

  function haze({ haze: h, hazeR }) {
    const s = R / 50;
    for (let k = 0; k < 8; k++) hazeR({ x: gauss() * 0.6 * s, y: gauss() * 0.3 * s, z: gauss() * 0.6 * s }, range(5, 9) * Math.max(bulge.sx / 2.4, 0.5) * Math.sqrt(s), 0.06);
    for (let k = 0; k < (cfg.hazeBulge ?? 380); k++) hazeR(bar && rand() < 0.5 ? sampleBar() : sampleBulge(), range(2.4, 6) * Math.max(bulge.sx / 2.4, 0.5), range(0.03, 0.05));
    for (let k = 0; k < (cfg.hazeArms ?? 1500); k++) hazeR(sampleArmAny(false), range(1.6, 4.2) * s, range(0.035, 0.06));
    for (let k = 0; k < (cfg.hazeHII ?? 280); k++) h(sampleKnot(), range(0.5, 1.4) * s, HII, range(0.08, 0.15), HII_INK);
    for (let k = 0; k < 70; k++) h(sampleKnot(), range(0.6, 1.2) * s, OIII, range(0.05, 0.08), OIII_INK);
    for (let k = 0; k < 320; k++) hazeR(sampleDisk(), range(3, 7) * s, 0.022);
    for (let k = 0; k < (cfg.hazeDust ?? 1100); k++) {
      const q = bar && rand() < 0.12 ? sampleBar() : sampleArmAny(true);
      const sc = rand() < 0.12 ? 1 : 0.94;
      h({ x: q.x * sc, y: q.y * 0.5, z: q.z * sc }, range(0.8, 2.2) * s, DUST[0], range(0.16, 0.3), DUST[1], 1);
    }
    for (const sat of satellites) {
      for (let k = 0; k < 4; k++) h({ x: sat.c.x + gauss() * sat.rad * 0.08, y: sat.c.y + gauss() * sat.rad * 0.06, z: sat.c.z + gauss() * sat.rad * 0.08 }, sat.rad * range(0.5, 0.9), [1.0, 0.8, 0.55], 0.05, [0.62, 0.45, 0.18]);
      for (let k = 0; k < (sat.haze ?? 60); k++) h(sampleSat(sat), sat.rad * range(0.25, 0.6), [1.0, 0.78, 0.5], range(0.025, 0.045), [0.6, 0.44, 0.16]);
    }
    cfg.extraHaze?.({ haze: h, hazeR, sampleBulge, sampleDisk, sampleArmAny, sampleKnot });
  }
  function extraField(pushField) {
    for (const sat of satellites) for (let k = 0; k < sat.field; k++) pushField(sampleSat(sat), 'disk', rand() < 0.5 ? 4 + ((rand() * 3) | 0) : 29 - ((rand() * 3) | 0), range(0.5, 1.1));
    cfg.extraField?.(pushField);
  }

  return {
    regions: REGIONS,
    regionOf,
    armTheta,
    init() {
      KNOTS = [];
      for (let i = 0; i < nKnots; i++) KNOTS.push(sampleArmAny(true));
    },
    pos(kind) {
      switch (kind) {
        case 'core': return bar && rand() >= (bulge.share ?? 0.55) ? sampleBar() : sampleBulge();
        case 'halo': return sampleHalo();
        case 'disk': return sampleDisk();
        case 'arm': return sampleArmAny(false);
        case 'young': return sampleArmAny(true);
        default: return sampleKnot();
      }
    },
    haze,
    extraField,
    sampleBulge, sampleDisk, sampleHalo, sampleArmAny, sampleSat,
  };
}

/** Hernquist sphere of scale a (kly), flattened by q along Y, cut at rMax. */
export function hernquist(a, q, rMax) {
  let r;
  do { const s = Math.sqrt(rand() * 0.999); r = a * s / (1 - s); } while (r > rMax);
  const u = range(-1, 1), ph = rand() * TAU, w = Math.sqrt(1 - u * u);
  return { x: r * w * Math.cos(ph), y: r * u * q, z: r * w * Math.sin(ph) };
}

/** Old-population class weights for everything (ellipticals, lenticular bulges). */
export const oldOnly = () => CLASS_W.old;

/**
 * Galaxy-frame position of an object seen `sep` kly (projected) from the
 * center at position angle `paDeg` (N through E). 'disk' puts it in the disk
 * plane (deprojected); 'sky' puts it in the plane of the sky through the
 * center (satellites, halo objects). Inverse of skyProject's offsets.
 */
export function skyPos(sky, sep, paDeg, mode = 'disk', y0 = 0) {
  const pa = sky.pa * DEG, i = sky.incl * DEG;
  const north = sep * Math.cos(paDeg * DEG), east = sep * Math.sin(paDeg * DEG);
  const a = north * Math.cos(pa) + east * Math.sin(pa), b = -north * Math.sin(pa) + east * Math.cos(pa);
  if (mode === 'disk') return { x: a, y: y0, z: -b / Math.max(Math.cos(i), 0.3) };
  return { x: a, y: b * Math.sin(i) + y0, z: -b * Math.cos(i) };
}
