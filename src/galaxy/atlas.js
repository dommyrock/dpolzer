/* ===================================================================== *
 * Galaxy Atlas — the 3D view.
 * Each galaxy is ~5–10k catalogued objects + tens of thousands of
 * unresolved field stars + haze, drawn as WebGL2 point sprites. Every
 * position is computed in the vertex shader from static per-object orbit
 * parameters and a few time uniforms, so the CPU never streams geometry;
 * it only runs one picking pass while the pointer is over the scene.
 *
 * Galaxies are built on demand: the Milky Way ships with the page, the
 * others are separate chunks imported the first time their tab is opened,
 * generated once and cached, then swapped into the same GPU buffers.
 * ===================================================================== */
import {
  TAU, DEG, clamp, smooth, fmtInt, esc, fmtLB, fmtDist, sci, sig, fmtMass, fmtPeriodVal, fmtSpin, fmtYears, fmtAgeGyr, fmtRA, fmtDec,
  TYPES, STAR, PLANET, PULSAR, NEBULA, CLUSTER, BH, GLYPH, CLASSES, GLOW, INK,
} from './core.js';
import { buildWorld, STRIDE } from './catalog.js';
import { mountHalo } from './back-fx.js';
import milkyWay from './galaxies/milky-way.js';

const $ = (s) => document.querySelector(s);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrowMQ = matchMedia('(max-width: 760px)');

/* ---------- the galaxies, in tab order ---------- */
const GALAXIES = [
  { id: 'milky-way', label: 'Milky Way', load: async () => milkyWay },
  { id: 'andromeda', label: 'Andromeda', load: () => import('./galaxies/andromeda.js').then((m) => m.default) },
  { id: 'triangulum', label: 'Triangulum', load: () => import('./galaxies/triangulum.js').then((m) => m.default) },
  { id: 'lmc', label: 'Large Magellanic Cloud', short: 'LMC', load: () => import('./galaxies/lmc.js').then((m) => m.default) },
  { id: 'whirlpool', label: 'Whirlpool', load: () => import('./galaxies/whirlpool.js').then((m) => m.default) },
  { id: 'sombrero', label: 'Sombrero', load: () => import('./galaxies/sombrero.js').then((m) => m.default) },
  { id: 'm87', label: 'Messier 87', short: 'M87', load: () => import('./galaxies/m87.js').then((m) => m.default) },
  { id: 'cartwheel', label: 'Cartwheel', load: () => import('./galaxies/cartwheel.js').then((m) => m.default) },
];
const worldCache = new Map();

/* ---------- the current world (swapped as a whole by useWorld) ---------- */
let G, OBJ, N = 0, NODE, typeOf, clsOf, regOf, distOf, FIELD, N_FIELD_ALL = 0, HAZE_DATA, N_HAZE = 0;
let PASS = new Uint8Array(0), MATCH = new Float32Array(0), REGIONS = [], TOTAL_POINTS = 0, galaxyId = '';
let HOME = { yaw: 0.42, pitch: 0.93, dist: 94 }, MAX_DIST = 320, SCALE = 1;

/* ===================================================================== *
 * WebGL2
 * ===================================================================== */
const canvas = $('#scene');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: true, powerPreference: 'high-performance' });

// Where a node is drawn, shared by the node shader (PT_VS) and the filter-match glow (MG_VS) so a
// glow can never drift off its object. Needs aA..aC and the pin and lens uniforms declared first.
const NODE_PLACE = `vec3 placeT(float pat, float epi, float orb) {
  float kind = aC.w;
  if (kind > 6.5) return aA.xyz;
  float ph = aB.x * epi + aB.y;
  float r = aA.x + aA.w * (cos(ph) - cos(aB.y));
  float th = aA.y + pat - aA.w * 1.4 / max(aA.x, 1.0) * (sin(ph) - sin(aB.y));
  float vy = aB.z * epi;
  vec3 p = vec3(r * cos(th), aA.z * cos(vy) + aB.w * sin(vy), r * sin(th));
  if (kind > 0.5 && kind < 1.5) {
    float pa = aC.z + orb * aC.y;
    p += vec3(cos(pa), 0.0, sin(pa)) * aC.x;
  }
  return p;
}
vec3 place(int id) {
  vec3 p = placeT(uPattern, uEpi, uOrbit);
  if (id == uPinA) p = mix(p, placeT(uPinAT.x, uPinAT.y, uPinAT.z), uPinAT.w);
  else if (id == uPinB) p = mix(p, placeT(uPinBT.x, uPinBT.y, uPinBT.z), uPinBT.w);
  return p;
}
// the cursor lens pushes objects aside in screen space; never the hovered or selected one
vec4 lensPush(vec4 clip, int id) {
  if (uLens <= 0.001 || id == uHover || id == uSel) return clip;
  vec2 sp = (clip.xy / clip.w * 0.5 + 0.5) * uView;
  vec2 dv = sp - uMouse;
  float d = length(dv);
  if (d >= uForceR) return clip;
  float s = 1.0 - d / uForceR; s = s * s * (3.0 - 2.0 * s);
  float f = uPush * s * uLens * (0.45 + 0.55 * clamp(uCamDist / clip.w, 0.4, 1.6));
  vec2 n = dv / max(d, 1e-3);
  sp += n * f + vec2(-n.y, n.x) * f * 0.25;
  clip.xy = (sp / uView * 2.0 - 1.0) * clip.w;
  return clip;
}
`;

const PT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aA;
layout(location=1) in vec4 aB;
layout(location=2) in vec4 aC;
layout(location=3) in vec4 aD;
layout(location=4) in float aMatch;
uniform mat4 uVP;
uniform vec2 uView;
uniform float uProj, uDpr, uPattern, uEpi, uOrbit, uReal, uMotion;
uniform vec2 uMouse;
uniform float uLens, uForceR, uHoverR, uPush;
uniform int uHover, uSel, uIdBase, uPinA, uPinB;
uniform vec4 uPinAT, uPinBT;
uniform float uDim, uFieldDim, uLight, uMaxPt, uCamDist, uMatchGlow;
uniform vec3 uGlow[32];
uniform vec3 uInk[32];
uniform vec3 uAccent;
uniform vec3 uFocus;
out vec3 vCol;
out float vA, vKind, vHover, vSpin, vMix;
${NODE_PLACE}
void main() {
  float kind = aC.w;
  int id = gl_VertexID + uIdBase;
  vKind = kind;
  vec4 clip = uVP * vec4(place(id), 1.0);
  if (clip.w < 1e-5) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
  float dist = clip.w;
  float m = aMatch;
  float keep = step(0.5, m), hl = step(1.5, m);
  float base = aD.x, px, alpha = 1.0;
  if (kind > 6.5) { px = base; alpha = 0.5 * uFieldDim; }
  else if (kind > 5.5) { px = base * clamp(pow(40.0 / dist, 0.35), 0.6, 2.2); alpha = 0.5 * clamp(80.0 / dist, 0.35, 1.0) * uFieldDim; }
  else if (kind > 2.5 && kind < 4.5) {
    float wpx = aC.x * uProj / dist / uDpr;
    px = max(base * clamp(pow(28.0 / dist, 0.3), 0.7, 1.6), min(wpx, 260.0));
    alpha = 0.95 * (1.0 - 0.8 * smoothstep(120.0, 260.0, wpx));
  }
  else { px = base * clamp(pow(28.0 / dist, 0.42), 0.75, 4.5); }
  float reveal = 1.0;
  if (kind > 0.5 && kind < 1.5) {
    reveal = smoothstep(3.0, 9.0, aC.x * uProj / dist / uDpr);
    if (hl > 0.5) reveal = max(reveal, 0.85);
  }
  alpha *= reveal * mix(uDim, 1.0, keep);
  px *= mix(0.85, 1.0, keep) * (1.0 + 0.25 * hl);
  alpha *= clamp(1.35 - dist / (uCamDist * 3.0 + 1.0), 0.4, 1.0);
  alpha *= mix(1.0, kind > 5.5 ? 0.42 : 0.9, uLight);
  float d = length((clip.xy / clip.w * 0.5 + 0.5) * uView - uMouse);
  float hov = 0.0;
  if (uLens > 0.001 && kind < 6.5) {
    clip = lensPush(clip, id);
    if (d < uHoverR) { float h = 1.0 - d / uHoverR; hov = h * h * (3.0 - 2.0 * h) * uLens * keep; }
  }
  float focus = (id == uHover || id == uSel) ? 1.0 : 0.0;
  // a filter match is drawn as a partly hovered object: the same look, at uMatchGlow strength
  float hot = max(focus, hl * uMatchGlow);
  if (focus > 0.5) hov = 0.0;
  int ci = int(aD.y + 0.5);
  vec3 glow = uGlow[ci], ink = uInk[ci];
  vec3 col = mix(glow, ink, uLight);
  col = mix(col, uAccent, hov * 0.7);
  alpha = min(alpha * (1.0 + hov * 0.8), 1.0);
  px *= 1.0 + hov * 0.35;
  if (hot > 0.0) {
    bool area = kind > 2.5 && kind < 4.5;
    px = mix(px, max(px * (area ? 1.15 : 1.7), 7.0), hot);
    alpha = mix(alpha, 1.0, hot);
    col = mix(col, area ? mix(col, uFocus, 0.6) : uFocus, hot);
  }
  if (kind < 0.5 || kind > 5.5) alpha *= 1.0 - uMotion * 0.22 * (0.5 + 0.5 * sin(uReal * (1.3 + aD.z * 2.7) + aD.z * 40.0));
  vSpin = aD.z * 6.2832;
  vMix = 0.0;
  if (kind > 1.5 && kind < 2.5) {
    float pulse = pow(0.5 + 0.5 * sin(uReal * aC.y * 6.2832 + aD.z * 30.0), 6.0);
    vMix = pulse * uMotion;
    alpha *= 0.75 + 0.45 * vMix;
    vSpin += uReal * (0.4 + aC.y * 0.3) * uMotion;
  }
  px = min(px * uDpr, uMaxPt);
  if (px < 1.0) { alpha *= px; px = 1.0; }
  if (alpha < 0.004) px = 0.0;
  gl_PointSize = px;
  gl_Position = clip;
  vCol = col; vA = alpha; vHover = focus;
}`;

const PT_FS = `#version 300 es
precision highp float;
in vec3 vCol;
in float vA, vKind, vHover, vSpin, vMix;
uniform float uLight;
out vec4 o;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float r = sqrt(r2);
  int k = int(vKind + 0.5);
  vec3 col = vCol;
  float a = 0.0, occl = 0.0;
  if (k == 0 || k == 6 || k == 7) {
    float core = exp(-r2 * 14.0);
    float glow = core + exp(-r * 5.0) * 0.45;
    float ink = smoothstep(0.62, 0.36, r) + exp(-r * 6.0) * 0.12;
    a = mix(glow, ink, uLight);
    col = mix(col, vec3(1.0), core * 0.22 * (1.0 - uLight));
  } else if (k == 1) {
    float disc = smoothstep(0.6, 0.46, r);
    float rim = exp(-pow((r - 0.8) / 0.07, 2.0)) * 0.45 * vHover;
    a = disc + rim + exp(-r * 6.0) * 0.12 * (1.0 - uLight);
    col *= mix(1.0, 0.72 + 0.4 * clamp(-(c.x + c.y) * 0.9, -1.0, 1.0), disc);
  } else if (k == 2) {
    float ca = cos(vSpin), sa = sin(vSpin);
    vec2 q = vec2(ca * c.x - sa * c.y, sa * c.x + ca * c.y);
    float beam = exp(-abs(q.y) * 20.0) * (1.0 - smoothstep(0.1, 1.0, abs(q.x)));
    float core = exp(-r2 * 26.0);
    a = core * 1.2 + beam * (0.5 + 0.7 * vMix) + exp(-r * 6.0) * 0.22;
    col = mix(col, vec3(1.0), core * 0.5 * (1.0 - uLight));
  } else if (k == 3) {
    float n = sin(c.x * 7.0 + vSpin) * sin(c.y * 6.0 - vSpin * 0.7) * 0.2;
    a = exp(-r2 * 3.2) * (0.38 + n) * (1.0 - r2);
  } else if (k == 4) {
    vec2 g = gl_PointCoord * 9.0;
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float h = fract(sin(dot(cell, vec2(12.9898, 78.233)) + vSpin) * 43758.5453);
    float star = step(0.82, h) * smoothstep(0.22, 0.05, length(f - (vec2(h, fract(h * 7.0)) - 0.5) * 0.4));
    a = exp(-r2 * 4.5) * 0.5 + star * exp(-r2 * 2.0) * 0.9;
  } else {
    float ring = exp(-pow((r - 0.46) / 0.075, 2.0));
    float disk = exp(-pow(c.y * 7.0, 2.0)) * smoothstep(1.0, 0.3, r) * 0.6;
    a = ring * 1.1 + disk;
    occl = smoothstep(0.38, 0.3, r);
  }
  a *= vA;
  vec3 rgb = col * a;
  float outA = a * uLight;
  if (occl > 0.0) {
    vec3 shadow = mix(vec3(0.0), vec3(0.07, 0.08, 0.15), uLight);
    rgb = rgb * (1.0 - occl) + shadow * occl * vA;
    outA = max(outA, occl * vA);
  }
  o = vec4(rgb, outA);
}`;

const HZ_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aA;
layout(location=1) in vec4 aB;
layout(location=2) in vec4 aC;
uniform mat4 uVP;
uniform float uPattern, uProj, uMaxPt, uLight, uCamDist, uDim;
out vec3 vCol;
out float vA, vDust;
void main() {
  float th = aA.y + uPattern;
  vec4 clip = uVP * vec4(aA.x * cos(th), aA.z, aA.x * sin(th), 1.0);
  if (clip.w < 1e-3) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
  float px = aA.w * uProj / clip.w;
  float a = aB.a * (1.0 - smoothstep(uMaxPt * 0.45, uMaxPt, px)) * smoothstep(0.3, 5.0, uCamDist) * uDim;
  a *= mix(1.0, aC.a > 0.5 ? 0.55 : 0.85, uLight);
  gl_PointSize = a < 0.002 ? 0.0 : min(px, uMaxPt);
  gl_Position = clip;
  vCol = mix(aB.rgb, aC.rgb, uLight);
  vA = a; vDust = aC.a;
}`;
const HZ_FS = `#version 300 es
precision highp float;
in vec3 vCol;
in float vA, vDust;
uniform vec3 uBg;
uniform float uLight;
out vec4 o;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 3.0) * (1.0 - r2) * vA;
  o = vDust > 0.5 ? vec4(uBg * a, a) : vec4(vCol * a, a * uLight);
}`;

const LN_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aP;
uniform mat4 uM;
out float vA;
void main() { gl_Position = uM * vec4(aP.xyz, 1.0); vA = aP.w; }`;
const LN_FS = `#version 300 es
precision highp float;
in float vA;
uniform vec3 uColor;
uniform float uLight;
out vec4 o;
void main() { o = vec4(uColor * vA, vA * uLight); }`;

const HL_VS = `#version 300 es
layout(location=0) in vec4 aP;
out float vA;
void main() { gl_Position = vec4(aP.xy, 0.0, 1.0); gl_PointSize = aP.z; vA = aP.w; }`;
const HL_FS = `#version 300 es
precision highp float;
in float vA;
uniform vec3 uColor;
uniform float uLight;
out vec4 o;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float a = (exp(-r2 * 4.0) * 0.8 + exp(-r2 * 18.0) * 0.7) * vA;
  o = vec4(mix(uColor, vec3(1.0), exp(-r2 * 18.0) * 0.35 * (1.0 - uLight)) * a, a * uLight);
}`;

// Filter matches get the hover halo: the same green glow sprites buildHalo draws around a
// hovered object, but placed on the GPU for every match at once (two layers, two draw calls).
// It skips the object's own reveal rules, so planets glow even before their orbits are visible.
// The hovered and selected objects are left out: buildHalo already draws their full halo.
const MG_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aA;
layout(location=1) in vec4 aB;
layout(location=2) in vec4 aC;
layout(location=3) in vec4 aD;
layout(location=4) in float aMatch;
uniform mat4 uVP;
uniform vec2 uView, uMouse;
uniform float uProj, uDpr, uPattern, uEpi, uOrbit, uReal, uMotion, uMaxPt, uCamDist, uLens, uForceR, uPush;
uniform int uHover, uSel, uPinA, uPinB;
uniform vec4 uPinAT, uPinBT;
uniform float uK, uC, uCap, uA, uPulse;
out float vA;
${NODE_PLACE}
void main() {
  int id = gl_VertexID;
  vec4 clip = vec4(0.0);
  if (aMatch > 1.5 && id != uHover && id != uSel) clip = uVP * vec4(place(id), 1.0);
  if (clip.w < 1e-5) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
  clip = lensPush(clip, id);
  float kind = aC.w, w = clip.w, px; // nodePxCss
  if (kind > 2.5 && kind < 4.5) px = max(aD.x * clamp(pow(28.0 / w, 0.3), 0.7, 1.6), min(aC.x * uProj / w / uDpr, 260.0)) * 1.15;
  else px = max(aD.x * clamp(pow(28.0 / w, 0.42), 0.75, 4.5) * 1.7, 7.0);
  float pulse = 1.0 + uPulse * sin(uReal * 3.2 + aD.z * 40.0) * uMotion;
  gl_PointSize = min(min(px * uK + uC, uCap) * pulse * uDpr, uMaxPt);
  gl_Position = clip;
  vA = uA;
}`;

// world-space points (web dots and particles); shares the halo fragment shader
const WP_VS = `#version 300 es
layout(location=0) in vec4 aP;
uniform mat4 uVP;
uniform float uSize;
out float vA;
void main() { vec4 c = uVP * vec4(aP.xyz, 1.0); gl_Position = c; gl_PointSize = c.w > 0.0 ? uSize : 0.0; vA = aP.w; }`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

let PT, HZ, LN, HL, WP, MG, vaoWebL, vaoWebP, webLBuf, webPBuf, vaoNode, vaoField, vaoHaze, vaoLine, vaoHalo, matchBuf, lineBuf, haloBuf, maxPt = 256;
let nodeBuf, fieldBuf, hazeBuf;
const HALO_MAX = 72, HALO = new Float32Array(HALO_MAX * 4);
let nHalo = 0, nRing = 0;
const MAX_SEG = 2400;
const LINE_DATA = new Float32Array(MAX_SEG * 2 * 4);
let glOK = false;

function vao(data, stride, attribs) {
  const v = gl.createVertexArray(); gl.bindVertexArray(v);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  attribs.forEach((n, k) => { gl.enableVertexAttribArray(k); gl.vertexAttribPointer(k, n, gl.FLOAT, false, stride * 4, k * 16); });
  return [v, b];
}
function initGL() {
  if (!gl) return false;
  try {
    PT = program(PT_VS, PT_FS); HZ = program(HZ_VS, HZ_FS); LN = program(LN_VS, LN_FS); HL = program(HL_VS, HL_FS); WP = program(WP_VS, HL_FS);
  } catch (e) { console.error(e); return false; }
  try { MG = program(MG_VS, HL_FS); } catch (e) { console.error(e); MG = null; } // optional: matches keep their tint
  [vaoNode, nodeBuf] = vao(NODE, STRIDE, [4, 4, 4, 4]);
  matchBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, matchBuf); gl.bufferData(gl.ARRAY_BUFFER, MATCH, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 4, 0);
  [vaoField, fieldBuf] = vao(FIELD, STRIDE, [4, 4, 4, 4]);
  gl.disableVertexAttribArray(4);
  [vaoHaze, hazeBuf] = vao(HAZE_DATA, 12, [4, 4, 4]);
  vaoHalo = gl.createVertexArray(); gl.bindVertexArray(vaoHalo);
  haloBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, haloBuf); gl.bufferData(gl.ARRAY_BUFFER, HALO.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
  vaoWebL = gl.createVertexArray(); gl.bindVertexArray(vaoWebL);
  webLBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, webLBuf); gl.bufferData(gl.ARRAY_BUFFER, WEB_L.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
  vaoWebP = gl.createVertexArray(); gl.bindVertexArray(vaoWebP);
  webPBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, webPBuf); gl.bufferData(gl.ARRAY_BUFFER, WEB_P.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
  vaoLine = gl.createVertexArray(); gl.bindVertexArray(vaoLine);
  lineBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf); gl.bufferData(gl.ARRAY_BUFFER, LINE_DATA.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
  gl.bindVertexArray(null);
  maxPt = Math.min(gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64, 384);
  gl.useProgram(PT.p);
  gl.uniform3fv(PT.u.uGlow, new Float32Array(GLOW.flat()));
  gl.uniform3fv(PT.u.uInk, new Float32Array(INK.flat()));
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  return true;
}
/** Re-upload the current world into the existing buffers; the VAOs keep their attribute layout. */
function uploadWorld() {
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, nodeBuf); gl.bufferData(gl.ARRAY_BUFFER, NODE, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, matchBuf); gl.bufferData(gl.ARRAY_BUFFER, MATCH, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, fieldBuf); gl.bufferData(gl.ARRAY_BUFFER, FIELD, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, hazeBuf); gl.bufferData(gl.ARRAY_BUFFER, HAZE_DATA, gl.STATIC_DRAW);
}

/* ---------- matrices ---------- */
const P = new Float32Array(16), V = new Float32Array(16), VP = new Float32Array(16), ID = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function perspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nfv = 1 / (near - far);
  out.fill(0); out[0] = f / aspect; out[5] = f; out[10] = (far + near) * nfv; out[11] = -1; out[14] = 2 * far * near * nfv;
}
function lookAt(out, ex, ey, ez, cx, cy, cz) {
  let zx = ex - cx, zy = ey - cy, zz = ez - cz, l = Math.hypot(zx, zy, zz) || 1;
  zx /= l; zy /= l; zz /= l;
  let xx = zz, xy = 0, xz = -zx; l = Math.hypot(xx, xz) || 1; xx /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * ex + xy * ey + xz * ez); out[13] = -(yx * ex + yy * ey + yz * ez); out[14] = -(zx * ex + zy * ey + zz * ez); out[15] = 1;
}
function mul(out, a, b) {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
}

/* ===================================================================== *
 * State
 * ===================================================================== */
const FOV = 50 * DEG, MIN_DIST = 0.0035;
const cam = { yaw: HOME.yaw, pitch: HOME.pitch + 0.2, dist: reducedMotion ? HOME.dist : 165, tx: 0, ty: 0, tz: 0,
  gYaw: HOME.yaw, gPitch: HOME.pitch, gDist: HOME.dist, gtx: 0, gty: 0, gtz: 0, follow: -1, vYaw: 0, vPitch: 0 };
const T = { myr: 0, pattern: 0, epi: 0, orbit: 0, speed: reducedMotion ? 0 : 1, lastSpeed: 1 };
const S = { q: '', tokens: [], type: new Set(), cls: new Set(), region: new Set(), distMax: Infinity, hide: false, ring: false };
let filtering = false, matchCount = 0;
let hover = -1, sel = -1, navOpen = !narrowMQ.matches;
let cssW = 1, cssH = 1, dpr = 1, dprCap = 2, shiftNdc = 0, camEye = [0, 0, 0];
let light = 0, lightTarget = 0, bg = [0.02, 0.024, 0.047];
let lastInteract = performance.now();
const pointer = { x: 0, y: 0, sx: 0, sy: 0, inside: false, mouse: true, down: false, dragging: false, pan: false, downHover: -1, startX: 0, startY: 0, lx: 0, ly: 0, t0: 0 };
const touches = new Map();
let lens = 0, pinchD = 0;
let pickX = -1, pickY = -1;

/* ---------- world position of node i at the current time (mirrors the shader) ---------- */
const W = { x: 0, y: 0, z: 0 };
const PINS = [{ id: -1, pat: 0, epi: 0, orb: 0, mix: 0 }, { id: -1, pat: 0, epi: 0, orb: 0, mix: 0 }];
const PW = { x: 0, y: 0, z: 0 };
function nodeWorld(i, out) {
  nodeWorldAt(i, T.pattern, T.epi, T.orbit, out);
  for (const pin of PINS) {
    if (pin.id !== i || pin.mix <= 0) continue;
    nodeWorldAt(i, pin.pat, pin.epi, pin.orb, PW);
    out.x += (PW.x - out.x) * pin.mix; out.y += (PW.y - out.y) * pin.mix; out.z += (PW.z - out.z) * pin.mix;
    break;
  }
  return out;
}
// The hovered object is pinned where it was when the cursor found it; when the cursor leaves,
// it glides back into the galaxy's motion. Everything else keeps moving.
function updatePins(dt) {
  const A = PINS[0], B = PINS[1];
  if (hover !== A.id) {
    if (hover >= 0 && hover === B.id) { const t = { ...A }; Object.assign(A, B); Object.assign(B, t); }
    else {
      if (A.id >= 0) Object.assign(B, A);
      if (hover >= 0) Object.assign(A, { id: hover, pat: T.pattern, epi: T.epi, orb: T.orbit, mix: 1 });
      else { A.id = -1; A.mix = 0; }
    }
  }
  if (A.id >= 0) A.mix += (1 - A.mix) * (1 - Math.exp(-dt * 10));
  if (B.id >= 0) { B.mix *= Math.exp(-dt * 4); if (B.mix < 0.003) { B.id = -1; B.mix = 0; } }
}
function nodeWorldAt(i, pat, epi, orb, out) {
  const j = i * STRIDE, D = NODE;
  const A = D[j + 3], p0 = D[j + 5];
  let r = D[j], th = D[j + 1] + pat;
  if (A !== 0) { const ph = D[j + 4] * epi + p0; r += A * (Math.cos(ph) - Math.cos(p0)); th -= A * 1.4 / Math.max(D[j], 1) * (Math.sin(ph) - Math.sin(p0)); }
  let y = D[j + 2];
  if (D[j + 6] !== 0) { const vy = D[j + 6] * epi; y = D[j + 2] * Math.cos(vy) + D[j + 7] * Math.sin(vy); }
  out.x = r * Math.cos(th); out.y = y; out.z = r * Math.sin(th);
  if (D[j + 11] === 1) { const pa = D[j + 10] + orb * D[j + 9]; out.x += Math.cos(pa) * D[j + 8]; out.z += Math.sin(pa) * D[j + 8]; }
  return out;
}
const SP = { x: 0, y: 0, w: 0 };
function project(x, y, z, out) {
  const m = VP;
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (cw < 1e-5) return false;
  out.x = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / cw * 0.5 + 0.5) * cssW;
  out.y = (0.5 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / cw * 0.5) * cssH;
  out.w = cw;
  return true;
}
const projScale = () => P[5] * cssH / 2; // css px per world unit at distance 1

/* ===================================================================== *
 * UI: facets, results, card, tooltip
 * ===================================================================== */
const el = {
  q: $('#q'), suggest: $('#suggest'), matchN: $('#matchN'), totalN: $('#totalN'), clearAll: $('#clearAll'),
  fType: $('#fType'), fClass: $('#fClass'), fRegion: $('#fRegion'),
  fDist: $('#fDist'), distOut: $('#distOut'), hideOthers: $('#hideOthers'), webOn: $('#webOn'),
  results: $('#results'), resTitle: $('#resTitle'), resMeta: $('#resMeta'), resMore: $('#resMore'),
  card: $('#card'), tip: $('#tip'), labels: $('#labels'), hint: $('#hint'), hud: $('#hud'),
  clock: $('#clock'), play: $('#play'), playIcon: $('#playIcon'), speedSeg: $('#speedSeg'), themeBtn: $('#themeBtn'), themeIcon: $('#themeIcon'),
  navOpen: $('#navOpen'), navClose: $('#navClose'), resetView: $('#resetView'), brandSub: $('#brandSub'),
  brandName: $('#brandName'), gtabs: $('#gtabs'), gfacts: $('#gfacts'), gblurb: $('#gblurb'), about: $('#about'), distTitle: $('#distTitle'),
  ring: $('#ringToggle'),
};

function countBy(arr, n) { const c = new Array(n).fill(0); for (let i = 0; i < N; i++) if (arr[i] >= 0) c[arr[i]]++; return c; }
const chipHTML = (f, v, label, n, dot, extra = '', glyph = '') =>
  `<button class="chip ${extra}" type="button" aria-pressed="false" data-f="${f}" data-v="${v}" style="--dot:${dot}">${glyph || '<i class="dot"></i>'}${esc(label)}${n != null ? `<span class="n">${fmtInt(n)}</span>` : ''}</button>`;
/** Facets, counts, suggestions and the galaxy facts for the current world. */
function renderFacets() {
  const cntType = countBy(typeOf, TYPES.length);
  const cntCls = countBy(clsOf.map((c, i) => (typeOf[i] === STAR ? c : -1)), CLASSES.length), cntReg = countBy(regOf, REGIONS.length);
  el.fType.innerHTML = TYPES.map((t, i) => (cntType[i] ? chipHTML('type', i, t.label, cntType[i], t.color, '', GLYPH[i]) : '')).join('');
  el.fClass.innerHTML = CLASSES.map((c, i) => `<button class="chip cls" type="button" aria-pressed="false" data-f="cls" data-v="${i}" style="--dot:${c.css}" title="${c.label || `Class ${c.id}: ${fmtInt(c.t[0])}–${fmtInt(c.t[1])} K`} · ${fmtInt(cntCls[i])} stars"><i class="dot"></i>${c.id}</button>`).join('');
  el.fRegion.innerHTML = REGIONS.map((r, i) => (cntReg[i] ? chipHTML('region', i, r.short, cntReg[i], 'var(--muted)') : '')).join('');
  el.suggest.innerHTML = G.suggest.map((s) => `<button class="chip" type="button" data-q="${esc(s)}">${esc(s)}</button>`).join('');
  el.totalN.textContent = fmtInt(N);
  el.brandName.textContent = G.name;
  el.brandSub.textContent = `${fmtInt(N)} objects · ${G.kind}`;
  el.gfacts.innerHTML = G.facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  el.gblurb.textContent = G.blurb;
  const nLm = OBJ.reduce((n, o) => n + (o.landmark && o.type !== PLANET ? 1 : 0), 0);
  el.about.firstChild.textContent = `Generated in your browser: ${nLm} landmarks use published positions and values; every other object is simulated. Orbits and sizes are enlarged so you can see them. `;
  el.distTitle.textContent = G.distTitle;
  el.fDist.setAttribute('aria-label', `Maximum ${G.distTitle.toLowerCase()}`);
}

const FACET_SET = { type: S.type, cls: S.cls, region: S.region };
function toggleFacet(f, v) { const set = FACET_SET[f]; if (set.has(v)) set.delete(v); else set.add(v); applyFilters(); }
document.querySelector('.nav-body').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.f) toggleFacet(b.dataset.f, +b.dataset.v);
  else if (b.dataset.q != null) { el.q.value = b.dataset.q; onQuery(true); }
  else if (b.dataset.i != null) { const i = +b.dataset.i; select(i, true); if (narrowMQ.matches) setNav(false); }
});
function clearFilters() {
  el.q.value = ''; S.q = ''; S.tokens = [];
  Object.values(FACET_SET).forEach((s) => s.clear());
  el.fDist.value = 1000; S.distMax = Infinity;
}
el.clearAll.addEventListener('click', () => { clearFilters(); applyFilters(); });
let qTimer = 0;
function onQuery(now) {
  clearTimeout(qTimer);
  const run = () => { S.q = el.q.value; S.tokens = S.q.trim().toLowerCase().split(/\s+/).filter(Boolean); applyFilters(); };
  if (now) run(); else qTimer = setTimeout(run, 70);
}
el.q.addEventListener('input', () => onQuery(false));
const distFromSlider = (v) => { const [lo, hi] = G.distRange; return v >= 1000 ? Infinity : lo * Math.pow(hi / lo, v / 1000); };
el.fDist.addEventListener('input', () => { S.distMax = distFromSlider(+el.fDist.value); applyFilters(); });
el.hideOthers.addEventListener('change', () => { S.hide = el.hideOthers.checked; if (S.hide && sel >= 0 && !PASS[sel]) deselect(); });
el.ring.addEventListener('change', () => { S.ring = el.ring.checked; });
el.webOn.addEventListener('change', () => { web.on = el.webOn.checked; web.g = null; web.focus = -1; web.fade = 0; tipFor = -1; });

function applyFilters() {
  const tk = S.tokens;
  filtering = tk.length > 0 || S.type.size || S.cls.size || S.region.size || S.distMax < Infinity;
  let count = 0;
  for (let i = 0; i < N; i++) {
    let ok = (S.type.size === 0 || S.type.has(typeOf[i]))
      && (S.cls.size === 0 || (typeOf[i] === STAR && S.cls.has(clsOf[i])))
      && (S.region.size === 0 || S.region.has(regOf[i]))
      && distOf[i] <= S.distMax;
    if (ok && tk.length) { const h = OBJ[i].hay; for (let t = 0; t < tk.length; t++) if (!h.includes(tk[t])) { ok = false; break; } }
    PASS[i] = ok ? 1 : 0;
    MATCH[i] = ok ? (filtering ? 2 : 1) : 0;
    count += ok;
  }
  matchCount = count;
  if (glOK) { gl.bindBuffer(gl.ARRAY_BUFFER, matchBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, MATCH); }
  el.matchN.textContent = fmtInt(count);
  el.clearAll.disabled = !filtering;
  for (const b of document.querySelectorAll('.nav-body .chip[data-f]')) {
    const set = FACET_SET[b.dataset.f];
    b.setAttribute('aria-pressed', String(set.has(+b.dataset.v)));
  }
  el.distOut.textContent = S.distMax === Infinity ? 'Any distance' : `Within ${fmtDist(S.distMax)}`;
  renderResults();
  if (sel >= 0 && !PASS[sel] && S.hide) deselect();
}

function renderResults() {
  let rows, total;
  if (!filtering) {
    rows = OBJ.filter((o) => o.landmark && o.type !== PLANET).sort((a, b) => a.d - b.d).map((o) => o.i);
    total = rows.length;
    el.resTitle.textContent = 'Landmarks';
  } else {
    const q0 = S.tokens[0] || '';
    const idx = [];
    for (let i = 0; i < N; i++) if (PASS[i]) idx.push(i);
    total = idx.length;
    const key = (i) => { const n = OBJ[i].name.toLowerCase(); return (q0 && n.startsWith(q0) ? 0 : q0 && n.includes(q0) ? 1 : 2) * 1e5 - OBJ[i].prom; };
    rows = idx.map((i) => [key(i), i]).sort((a, b) => a[0] - b[0]).slice(0, 60).map((p) => p[1]);
    el.resTitle.textContent = 'In focus';
  }
  el.resMeta.textContent = filtering ? `${fmtInt(total)} found` : `${total} · ${G.ref === 'sun' ? 'nearest first' : 'center outward'}`;
  el.results.innerHTML = rows.map((i) => {
    const o = OBJ[i];
    return `<li><button class="res" type="button" data-i="${i}"${i === sel ? ' aria-current="true"' : ''}><span class="g" style="--dot:${TYPES[o.type].color}">${GLYPH[o.type]}</span><span class="nm">${esc(o.name)}</span><span class="ds">${o.sun ? 'here' : fmtDist(o.d)}</span><span class="sb">${esc(o.sub)} · ${esc(REGIONS[o.region].short)}</span></button></li>`;
  }).join('');
  el.resMore.hidden = total <= rows.length;
  el.resMore.textContent = `Showing ${rows.length} of ${fmtInt(total)}. Refine the search to narrow it down.`;
}

/* ---------- tooltip ---------- */
let tipFor = -1, tipW = 0, tipH = 0;
function tipHTML(i) {
  const o = OBJ[i];
  const rows = [];
  rows.push([G.refLabel, o.sun ? 'You are here' : fmtDist(o.d)]);
  if (o.type === STAR) rows.push(['Type', o.sp || '—'], ['Temperature', o.teff ? `${fmtInt(Math.round(o.teff / 10) * 10)} K` : '—']);
  else if (o.type === PLANET) rows.push(['Host', OBJ[o.host].name], ['Year', o.extra.period != null ? fmtPeriodVal(o.extra.period) : 'not measured']);
  else if (o.type === PULSAR) rows.push(['Spin period', fmtSpin(o.extra.period)]);
  else if (o.type === NEBULA) { if (o.extra.diam != null) rows.push(['Diameter', `${sig(o.extra.diam)} ly`]); }
  else if (o.type === CLUSTER) rows.push(o.extra.members != null ? ['Members', `≈ ${fmtInt(o.extra.members)}`] : ['Kind', o.extra.ckind]);
  else if (o.type === BH) rows.push(['Mass', o.mass != null ? fmtMass(o.mass) : 'not measured']);
  rows.push(['Region', REGIONS[o.region].short]);
  if (web.on) {
    const g = webGroup(), n = Math.min(6, g.ids.length - (g.local.has(i) ? 1 : 0));
    if (n > 0) rows.push(['Linked', n === 1 ? 'nearest real landmark' : `${n} nearest real landmarks`]);
  }
  return `<div class="k"><span class="eyebrow">${esc(o.sub)}</span></div><div class="n">${esc(o.name)}</div>`
    + rows.map(([k, v]) => `<div class="row"><span>${k}</span><b>${esc(v)}</b></div>`).join('')
    + `<div class="tfoot">Click for details</div>`;
}
function placeTip() {
  if (hover < 0 || pointer.dragging) { if (!el.tip.hidden) el.tip.hidden = true; tipFor = -1; return; }
  if (tipFor !== hover) {
    el.tip.innerHTML = tipHTML(hover); el.tip.hidden = false; tipFor = hover;
    tipW = el.tip.offsetWidth; tipH = el.tip.offsetHeight;
  }
  let x = pointer.x + 18, y = pointer.y + 18;
  if (x + tipW > innerWidth - 12) x = pointer.x - tipW - 18;
  if (y + tipH > innerHeight - 12) y = pointer.y - tipH - 18;
  el.tip.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
}

/* ---------- detail card ---------- */
/** A planet's name without its host's prefix ("TRAPPIST-1 e" → "e"). */
const planetShort = (p, sys) => (p.name.startsWith(sys.name + ' ') ? p.name.slice(sys.name.length + 1) : p.name);
const tempPos = (t) => clamp((Math.log(t) - Math.log(2400)) / (Math.log(40000) - Math.log(2400)), 0, 1) * 100;
function renderCard(i) {
  const o = OBJ[i];
  const host = o.host >= 0 ? OBJ[o.host] : null;
  const rows = [];
  const add = (k, v) => rows.push(`<dt>${k}</dt><dd>${v}</dd>`);
  if (o.type === STAR) {
    add('Spectral type', esc(o.sp || '—'));
    add('Temperature', o.teff ? `${fmtInt(Math.round(o.teff / 10) * 10)} K` : 'not measured');
    add('Mass', o.mass != null ? fmtMass(o.mass) : 'not measured'); add('Radius', o.radius ? `${sig(o.radius)} R☉` : 'not measured');
    if (o.lum != null) add('Luminosity', `${sig(o.lum)} L☉`);
    if (o.age != null) add('Age', fmtAgeGyr(o.age));
  } else if (o.type === PLANET) {
    const e = o.extra;
    add('Host star', `<button type="button" data-goto="${host.i}">${esc(host.name)}</button>`);
    add('Planet type', esc(o.sub === 'Planet candidate' ? `${e.ptype} (candidate)` : e.ptype));
    add('Orbital period', e.period != null ? fmtPeriodVal(e.period) : 'not measured'); add('Orbit radius', e.a != null ? `${sig(e.a)} AU` : 'not measured');
    add('Mass', e.mass != null ? `${sig(e.mass)} M⊕` : 'not measured'); add('Radius', e.radius != null ? `${sig(e.radius)} R⊕` : 'not measured');
    add('Equilibrium temp.', e.teq != null ? `${fmtInt(e.teq)} K` : 'not measured'); add('Habitable zone', e.hz ? 'Yes' : 'No');
  } else if (o.type === PULSAR) {
    const e = o.extra;
    add('Kind', esc(e.pkind)); add('Spin period', fmtSpin(e.period));
    if (e.field != null) add('Surface field', `${sci(e.field)} G`);
    if (e.charAge != null) add('Characteristic age', fmtYears(e.charAge));
  } else if (o.type === NEBULA) {
    const e = o.extra;
    add('Kind', esc(e.nebKind));
    if (e.diam != null) add('Diameter', `${sig(e.diam)} ly`);
    if (e.line) add('Brightest line', esc(e.line));
    if (e.age) add('Age', esc(e.age));
  } else if (o.type === CLUSTER) {
    const e = o.extra;
    add('Kind', esc(e.ckind));
    if (e.members != null) add('Members', `≈ ${fmtInt(e.members)}`);
    if (e.age) add('Age', esc(e.age));
    if (e.diam != null) add('Diameter', `${sig(e.diam)} ly`);
    if (e.feh) add('Metallicity [Fe/H]', esc(e.feh));
  } else if (o.type === BH) {
    add('Kind', esc(o.extra.bhKind)); add('Mass', o.mass != null ? fmtMass(o.mass) : 'not measured'); add('Companion', esc(o.extra.companion));
  }
  if (G.ref === 'sun') {
    if (!o.sun) { add('From the Sun', fmtDist(o.d)); add('Galactic l, b', fmtLB(o)); }
  } else add('From Earth', fmtDist(o.earth));
  if (!o.sun) { add('RA (J2000)', fmtRA(o.ra)); add('Dec (J2000)', fmtDec(o.dec)); }
  add('From the center', fmtDist(o.gc));
  add('Region', esc(REGIONS[o.region].label));
  let temp = '';
  if (o.type === STAR && o.teff) {
    temp = `<div class="tbar" aria-label="Surface temperature ${fmtInt(o.teff)} K on a scale from 2,400 to 40,000 K">
      <div class="facet-row"><span class="eyebrow">Surface temperature</span><span class="mono" style="font-size:11px;color:var(--muted)">${fmtInt(Math.round(o.teff / 10) * 10)} K</span></div>
      <div class="bar"><span class="mk" style="left:${tempPos(o.teff).toFixed(1)}%"></span></div>
      <div class="scale"><span>2,400 K · cool</span><span>hot · 40,000 K</span></div></div>`;
  }
  const sys = o.type === PLANET ? host : o;
  let plist = '';
  if (sys.planets.length) {
    plist = `<div class="plist"><div class="facet-row"><span class="eyebrow">${o.type === PLANET ? 'Same system' : 'Planets'}</span><span class="meta mono" style="font-size:11px;color:var(--muted)">${sys.planets.length}</span></div><div class="chips">${
      sys.planets.map((pi) => { const short = planetShort(OBJ[pi], sys); return `<button class="chip" type="button" data-goto="${pi}" aria-pressed="${pi === i}" style="--dot:var(--c-k)">${esc(short)}</button>`; }).join('')}</div></div>`;
  }
  el.card.innerHTML = `
    <div class="card-head"><span class="eyebrow">${esc(TYPES[o.type].one)} · ${esc(o.sub)}</span>
      <button class="icon-btn" type="button" data-act="close" aria-label="Close details"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m4 4 8 8M12 4l-8 8"/></svg></button></div>
    <div class="card-body scroll">
      <h2${o.name.length > 18 ? ' class="long"' : ''}>${esc(o.name)}</h2>
      ${o.alt.length ? `<p class="ids">${o.alt.map(esc).join(' · ')}</p>` : ''}
      ${o.sun ? '<p class="here">You are here</p>' : ''}
      <p class="blurb">${esc(o.blurb)}</p>
      ${temp}
      <dl class="stats">${rows.join('')}</dl>
      ${plist}
      <div class="card-actions">
        <button class="btn" type="button" data-act="fly">Fly to</button>
        ${o.sun ? '' : '<button class="btn ghost" type="button" data-act="copy">Copy coordinates</button>'}
      </div>
    </div>`;
  el.card.hidden = false;
}
el.card.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.goto != null) select(+b.dataset.goto, true);
  else if (b.dataset.act === 'close') deselect();
  else if (b.dataset.act === 'fly') flyTo(sel, true);
  else if (b.dataset.act === 'copy') {
    const o = OBJ[sel];
    const text = `${o.name}: RA ${fmtRA(o.ra)}, Dec ${fmtDec(o.dec)} (J2000)` + (G.ref === 'sun' ? `; l ${o.l.toFixed(3)}°, b ${o.b.toFixed(3)}°` : ` · ${G.name}`);
    const done = () => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy coordinates'; }, 1400); };
    try { navigator.clipboard.writeText(text).then(done, () => { b.textContent = text; }); } catch { b.textContent = text; }
  }
});

/* ---------- selection & camera moves ---------- */
function systemOf(i) { return OBJ[i].type === PLANET ? OBJ[i].host : i; }
function focusDist(i) {
  const o = OBJ[i], sys = OBJ[systemOf(i)];
  if (sys.planets.length) return Math.max(sys.maxOrb * 5.5, 0.006);
  switch (o.type) {
    case STAR: return 0.5;
    case PULSAR: return 0.35;
    case NEBULA: case CLUSTER: return Math.max(0.25, o.world * 9);
    case BH: return o.center ? 4 * SCALE : 0.4;
    default: return 1;
  }
}
let tween = null;
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function flyTo(i, full) {
  cam.follow = systemOf(i);
  const fd = focusDist(i);
  const d1 = full ? fd : clamp(cam.dist * 0.55, fd, cam.dist);
  nodeWorld(cam.follow, W);
  const ox = cam.tx - W.x, oy = cam.ty - W.y, oz = cam.tz - W.z;
  const zoomSpan = Math.abs(Math.log(d1 / cam.dist));
  const panSpan = Math.min(Math.hypot(ox, oy, oz) / Math.max(cam.dist, 1e-6), 2);
  const dur = reducedMotion ? 0.3 : clamp(1.1 + 0.24 * zoomSpan + 0.4 * panSpan, 1.2, 3.4);
  tween = { t0: performance.now(), dur: dur * 1000, d0: cam.dist, d1, ox, oy, oz };
  cam.gDist = d1;
  lastInteract = performance.now();
}
function stopTween() {
  if (!tween) return;
  tween = null; cam.gDist = cam.dist;
  if (cam.follow < 0) { cam.gtx = cam.tx; cam.gty = cam.ty; cam.gtz = cam.tz; }
}
function select(i, full) {
  sel = i;
  renderCard(i);
  flyTo(i, full);
  el.results.querySelectorAll('.res').forEach((b) => { if (+b.dataset.i === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
}
function deselect() {
  cam.follow = -1; stopTween();
  sel = -1; el.card.hidden = true;
  el.results.querySelectorAll('.res[aria-current]').forEach((b) => b.removeAttribute('aria-current'));
}
function resetView() {
  deselect();
  cam.gtx = cam.gty = cam.gtz = 0; cam.gYaw = HOME.yaw; cam.gPitch = HOME.pitch; cam.gDist = HOME.dist;
}

/* ===================================================================== *
 * Labels (DOM, positioned each frame)
 * ===================================================================== */
function mkLabel(text, cls) { const d = document.createElement('div'); d.className = 'lbl ' + (cls || ''); d.innerHTML = `<i></i><span>${esc(text)}</span>`; el.labels.appendChild(d); return { el: d, w: text.length * 6.6 + 22, shown: false, op: -1 }; }
let REGION_LABELS = [], LM_LABELS = [];
function buildLabels() {
  for (const L of [...REGION_LABELS, ...LM_LABELS]) L.el.remove();
  REGION_LABELS = G.regionLabels.map(([t, r, th]) => ({ ...mkLabel(t, 'region'), r, th }));
  LM_LABELS = OBJ.filter((o) => o.landmark && o.type !== PLANET).map((o) => ({ ...mkLabel(o.sun ? 'Sun · you are here' : o.center && G.centerLabel ? G.centerLabel : o.name, o.sun ? 'here' : ''), i: o.i, pri: o.sun ? 3 : o.center ? 2 : 1 }));
}
const RING_R = 50; // the Milky Way's disk, ~100,000 ly across, drawn to scale behind other galaxies
const RING_LABEL = mkLabel('Milky Way disk · 100,000 ly', 'region ring');
let ringFade = 0;
const PL_LABELS = Array.from({ length: 10 }, () => ({ ...mkLabel('', 'planet'), i: -1 }));
function setLabel(L, x, y, op) {
  if (op <= 0.01) { if (L.shown) { L.el.style.opacity = '0'; L.shown = false; } return; }
  L.el.style.transform = `translate3d(${(x + 4).toFixed(1)}px, ${(y - 5).toFixed(1)}px, 0)`;
  if (!L.shown || Math.abs(L.op - op) > 0.02) { L.el.style.opacity = op.toFixed(2); L.op = op; }
  L.shown = true;
}
const placed = [];
function overlaps(x, y, w) { for (const r of placed) if (x < r.x + r.w && x + w > r.x && y < r.y + 14 && y + 14 > r.y) return true; return false; }
function updateLabels() {
  placed.length = 0;
  const cosP = Math.cos(T.pattern), sinP = Math.sin(T.pattern);
  // sun + landmarks
  const zd = cam.dist / SCALE;
  const regionOp = smooth(clamp((zd - 16) / 22, 0, 1)) * (1 - smooth(clamp((zd - 220) / 80, 0, 1)));
  const cand = [];
  for (const L of LM_LABELS) {
    const o = OBJ[L.i];
    nodeWorld(L.i, W);
    if (!project(W.x, W.y, W.z, SP) || SP.x < -40 || SP.x > cssW + 40 || SP.y < -20 || SP.y > cssH + 20) { setLabel(L, 0, 0, 0); continue; }
    let op;
    if (L.pri >= 2) op = 1;
    else {
      const dt = Math.hypot(W.x - cam.tx, W.y - cam.ty, W.z - cam.tz);
      op = zd < 30 ? smooth(clamp(1.6 - dt / Math.max(cam.dist * 1.1, 0.02), 0, 1)) : 0;
    }
    if (filtering && !PASS[L.i]) op *= 0.15;
    if (L.i === sel) op = 0;
    cand.push({ L, x: SP.x, y: SP.y, op, pri: L.pri + (op > 0.5 ? 0.5 : 0) });
  }
  cand.sort((a, b) => b.pri - a.pri);
  let shown = 0;
  for (const c of cand) {
    if (c.op > 0.01 && shown < 22 && !overlaps(c.x + 4, c.y - 7, c.L.w)) { placed.push({ x: c.x + 4, y: c.y - 7, w: c.L.w }); setLabel(c.L, c.x, c.y, c.op); shown++; }
    else setLabel(c.L, 0, 0, 0);
  }
  for (const L of REGION_LABELS) {
    const th = L.th, x = L.r * Math.cos(th) * cosP - L.r * Math.sin(th) * sinP, z = L.r * Math.cos(th) * sinP + L.r * Math.sin(th) * cosP;
    if (regionOp > 0.01 && project(x, 0, z, SP) && !overlaps(SP.x - L.w / 2, SP.y - 7, L.w)) { setLabel(L, SP.x - L.w / 2, SP.y, regionOp * 0.9); placed.push({ x: SP.x - L.w / 2, y: SP.y - 7, w: L.w }); }
    else setLabel(L, 0, 0, 0);
  }
  // the Milky Way scale ring, labelled on its far side (which sits highest on screen)
  const rx = -Math.sin(cam.yaw) * RING_R, rz = -Math.cos(cam.yaw) * RING_R;
  if (ringFade > 0.01 && project(rx, 0, rz, SP) && !overlaps(SP.x - RING_LABEL.w / 2, SP.y - 7, RING_LABEL.w)) setLabel(RING_LABEL, SP.x - RING_LABEL.w / 2, SP.y - 10, ringFade * 0.85);
  else setLabel(RING_LABEL, 0, 0, 0);
  // planets of the selected system once their orbits are visible
  const sys = sel >= 0 ? OBJ[systemOf(sel)] : null;
  PL_LABELS.forEach((L, k) => {
    const pi = sys && sys.planets[k];
    if (pi == null) { setLabel(L, 0, 0, 0); return; }
    if (L.i !== pi) { L.i = pi; L.el.lastChild.textContent = planetShort(OBJ[pi], sys); }
    nodeWorld(pi, W);
    const orbPx = NODE[pi * STRIDE + 8] * projScale() / Math.max(cam.dist, 1e-6);
    const op = smooth(clamp((orbPx - 6) / 10, 0, 1));
    if (op > 0.01 && project(W.x, W.y, W.z, SP)) setLabel(L, SP.x, SP.y, op * 0.9); else setLabel(L, 0, 0, 0);
  });
}

/* ===================================================================== *
 * Picking, link lines, orbits
 * ===================================================================== */
const CLICK_SLOP = 10;
const PICK_R = 14, HOVER_R = 72, FORCE_R = 125, LINK_R = 44, PUSH = 24, HOLD_R = 24;
const CAND_MAX = 4096;
const cI = new Int32Array(CAND_MAX), cX = new Float32Array(CAND_MAX), cY = new Float32Array(CAND_MAX), cD = new Float32Array(CAND_MAX), cWv = new Float32Array(CAND_MAX);
let nCand = 0, nLinkVerts = 0, nOrbitVerts = 0;
// slop: extra px of hit radius, used for clicks and taps so they don't need hover-perfect aim
function pickAt(mx, my, wantCandidates, slop = 0) {
  let best = -1, bestS = Infinity;
  nCand = 0;
  const ps = projScale();
  const hr2 = HOVER_R * HOVER_R;
  for (let i = 0; i < N; i++) {
    if (filtering && !PASS[i]) continue;
    const j = i * STRIDE;
    nodeWorld(i, W);
    if (!project(W.x, W.y, W.z, SP)) continue;
    if (NODE[j + 11] === 1 && NODE[j + 8] * ps / SP.w < 4 && !filtering) continue;
    const dx = SP.x - mx, dy = SP.y - my, d2 = dx * dx + dy * dy;
    if (d2 > hr2) continue;
    if (wantCandidates && nCand < CAND_MAX) { cI[nCand] = i; cX[nCand] = SP.x; cY[nCand] = SP.y; cD[nCand] = d2; cWv[nCand] = SP.w; nCand++; }
    const pr = PICK_R + NODE[j + 12] * 1.5 + slop + (OBJ[i].landmark ? 8 : 0); // points of interest are easier to hit
    if (d2 < pr * pr) { const s = d2 - NODE[j + 12] * 6 + (OBJ[i].landmark ? -40 : 0); if (s < bestS) { bestS = s; best = i; } }
  }
  return best;
}
const order = new Int32Array(CAND_MAX);
const dX = new Float32Array(120), dY = new Float32Array(120), dH = new Float32Array(120);
function buildLinks() {
  nLinkVerts = 0;
  if (lens < 0.02 || nCand < 2) return;
  for (let k = 0; k < nCand; k++) order[k] = k;
  const ord = order.subarray(0, nCand).sort((a, b) => cD[a] - cD[b]);
  const K = Math.min(nCand, 110);
  const mx = pointer.sx, my = pointer.sy;
  for (let k = 0; k < K; k++) {
    const c = ord[k];
    let x = cX[c], y = cY[c];
    const dx = x - mx, dy = y - my, d = Math.hypot(dx, dy) || 1e-3;
    if (cI[c] !== hover && cI[c] !== sel && d < FORCE_R) {
      let s = 1 - d / FORCE_R; s = s * s * (3 - 2 * s);
      const f = PUSH * s * lens * (0.45 + 0.55 * clamp(cam.dist / cWv[c], 0.4, 1.6));
      const nx = dx / d, ny = dy / d;
      x += nx * f - ny * f * 0.25; y += ny * f + nx * f * 0.25;
    }
    dX[k] = x; dY[k] = y;
    dH[k] = cI[c] === hover ? 1 : (d < HOVER_R ? smooth(1 - d / HOVER_R) * lens : 0);
  }
  let v = 0;
  const L = LINE_DATA;
  for (let a = 0; a < K; a++) {
    if (dH[a] < 0.02) continue;
    for (let b = a + 1; b < K; b++) {
      const ddx = dX[a] - dX[b], ddy = dY[a] - dY[b], dd = Math.hypot(ddx, ddy);
      if (dd > LINK_R) continue;
      const al = 0.55 * (1 - dd / LINK_R) * Math.min(dH[a], dH[b]);
      if (al < 0.01) continue;
      if (v + 2 > MAX_SEG * 2 - 800) break;
      L[v * 4] = dX[a] / cssW * 2 - 1; L[v * 4 + 1] = 1 - dY[a] / cssH * 2; L[v * 4 + 2] = 0; L[v * 4 + 3] = al; v++;
      L[v * 4] = dX[b] / cssW * 2 - 1; L[v * 4 + 1] = 1 - dY[b] / cssH * 2; L[v * 4 + 2] = 0; L[v * 4 + 3] = al; v++;
    }
  }
  nLinkVerts = v;
}
function nodePxCss(i, w) {
  const j = i * STRIDE, kind = NODE[j + 11], base = NODE[j + 12];
  if (kind === 3 || kind === 4) return Math.max(base * clamp(Math.pow(28 / w, 0.3), 0.7, 1.6), Math.min(NODE[j + 8] * projScale() / w, 260)) * 1.15;
  return Math.max(base * clamp(Math.pow(28 / w, 0.42), 0.75, 4.5) * 1.7, 7);
}
/* ===================================================================== *
 * Hover web: links that only ever end on real points, the landmarks. Every
 * landmark links to its 2 nearest fellow landmarks in the galaxy's own frame
 * (built once per galaxy, on first hover), and the hovered or selected object
 * gets spokes to its 6 nearest landmarks. Per frame the CPU only re-places the members (they move with the
 * galaxy) and uploads one line buffer and one point buffer.
 * ===================================================================== */
const MAX_WEB_EDGES = 9000, MAX_WEB_PTS = 4800, WEB_PARTICLES = 420;
const WEB_L = new Float32Array(MAX_WEB_EDGES * 2 * 4), WEB_P = new Float32Array(MAX_WEB_PTS * 4);
let webLm = null;
const web = { on: true, g: null, fade: 0, focus: -1, spokes: [], nL: 0, nDots: 0, nP: 0, cpu: 0, cpuN: 0, cpuShown: 0, pos: new Float32Array(0) };
// the only group: every landmark (planets share their host's position, so they're left out)
const inWeb = (j) => OBJ[j].landmark && OBJ[j].type !== PLANET;
function webGroup() {
  if (webLm) return webLm;
  const t0 = performance.now();
  const ids = [];
  for (let j = 0; j < N; j++) if (inWeb(j)) ids.push(j);
  const n = ids.length, xs = new Float32Array(n), ys = new Float32Array(n), zs = new Float32Array(n), maxD2 = (7 * SCALE) ** 2;
  ids.forEach((id, k) => { const o = OBJ[id]; xs[k] = o.x; ys[k] = o.y; zs[k] = o.z; });
  const seen = new Set(), edges = [];
  for (let a = 0; a < n; a++) {
    let b1 = -1, d1 = Infinity, b2 = -1, d2 = Infinity;
    const ax = xs[a], ay = ys[a], az = zs[a];
    for (let b = 0; b < n; b++) {
      if (b === a) continue;
      const dx = xs[b] - ax, dy = ys[b] - ay, dz = zs[b] - az, d = dx * dx + dy * dy + dz * dz;
      if (d < 1e-10) continue; // planets of one host share its position
      if (d < d1) { b2 = b1; d2 = d1; b1 = b; d1 = d; } else if (d < d2) { b2 = b; d2 = d; }
    }
    // no links longer than 7 kly (scaled to the galaxy), so sparse halo members don't throw lines across the view
    for (const [b, db] of [[b1, d1], [b2, d2]]) { if (b < 0 || db > maxD2) continue; const lo = Math.min(a, b), hi = Math.max(a, b), h = lo * n + hi; if (!seen.has(h)) { seen.add(h); edges.push(lo, hi); } }
  }
  webLm = { ids: Int32Array.from(ids), local: new Map(ids.map((id, k) => [id, k])), edges: Int32Array.from(edges), xs, ys, zs, buildMs: performance.now() - t0 };
  return webLm;
}
const WH = { x: 0, y: 0, z: 0 };
function updateWeb(dt, now) {
  const t0 = performance.now();
  const focusI = !web.on ? -1 : (hover >= 0 ? hover : sel);
  if (focusI >= 0) {
    const g = webGroup();
    if (g !== web.g) { web.g = g; web.fade = 0; }
    if (focusI !== web.focus) {
      // the focus object also gets 6 spokes to its nearest fellow members (in landmark mode the
      // focus is often a generated object outside the group: it still gets spokes to the nearest landmarks)
      web.focus = focusI;
      const a = g.local.get(focusI), near = [], fo = OBJ[focusI];
      const ax = a != null ? g.xs[a] : fo.x, ay = a != null ? g.ys[a] : fo.y, az = a != null ? g.zs[a] : fo.z;
      for (let b = 0; b < g.ids.length; b++) {
        if (b === a) continue;
        const dx = g.xs[b] - ax, dy = g.ys[b] - ay, dz = g.zs[b] - az, d = dx * dx + dy * dy + dz * dz;
        if (d < 1e-10) continue;
        near.push([d, b]); if (near.length > 6) { near.sort((p, q) => p[0] - q[0]); near.length = 6; }
      }
      web.spokes = near.map((p) => p[1]);
    }
    web.fade += (1 - web.fade) * (1 - Math.exp(-dt * 7));
  } else {
    web.fade *= Math.exp(-dt * 6);
    if (web.fade < 0.01) { web.g = null; web.focus = -1; web.nL = web.nDots = web.nP = 0; return; }
  }
  const g = web.g;
  if (!g) return;
  const n = g.ids.length;
  if (web.pos.length < n * 3) web.pos = new Float32Array(n * 3);
  const P3 = web.pos;
  for (let k = 0; k < n; k++) { nodeWorld(g.ids[k], W); P3[k * 3] = W.x; P3[k * 3 + 1] = W.y; P3[k * 3 + 2] = W.z; }
  const fa = g.local.get(web.focus);
  if (fa != null) { WH.x = P3[fa * 3]; WH.y = P3[fa * 3 + 1]; WH.z = P3[fa * 3 + 2]; }
  else if (web.focus >= 0) nodeWorld(web.focus, WH);
  const R = Math.max(cam.dist * 0.9, 2);
  const ok = (k) => !filtering || PASS[g.ids[k]];
  // links: faint everywhere, brighter near the focus object
  let v = 0;
  const L = WEB_L, E = g.edges;
  const near = (x, y, z) => { const d = Math.hypot(x - WH.x, y - WH.y, z - WH.z); return 1 - smooth(clamp(d / R, 0, 1)); };
  const line = (a, b, al) => {
    if (v + 2 > MAX_WEB_EDGES * 2) return;
    L[v * 4] = P3[a * 3]; L[v * 4 + 1] = P3[a * 3 + 1]; L[v * 4 + 2] = P3[a * 3 + 2]; L[v * 4 + 3] = al; v++;
    L[v * 4] = P3[b * 3]; L[v * 4 + 1] = P3[b * 3 + 1]; L[v * 4 + 2] = P3[b * 3 + 2]; L[v * 4 + 3] = al; v++;
  };
  for (let e = 0; e < E.length; e += 2) {
    const a = E[e], b = E[e + 1];
    if (!ok(a) || !ok(b)) continue;
    const mx = (P3[a * 3] + P3[b * 3]) / 2, my = (P3[a * 3 + 1] + P3[b * 3 + 1]) / 2, mz = (P3[a * 3 + 2] + P3[b * 3 + 2]) / 2;
    line(a, b, web.fade * (0.07 + 0.3 * near(mx, my, mz)));
  }
  if (fa != null) for (const b of web.spokes) if (ok(b)) line(fa, b, web.fade * 0.6);
  if (fa == null && web.focus >= 0) for (const b of web.spokes) {
    if (!ok(b) || v + 2 > MAX_WEB_EDGES * 2) continue;
    L[v * 4] = WH.x; L[v * 4 + 1] = WH.y; L[v * 4 + 2] = WH.z; L[v * 4 + 3] = web.fade * 0.6; v++;
    L[v * 4] = P3[b * 3]; L[v * 4 + 1] = P3[b * 3 + 1]; L[v * 4 + 2] = P3[b * 3 + 2]; L[v * 4 + 3] = web.fade * 0.6; v++;
  }
  web.nL = v;
  // member dots, then particles running outward from the focus along the links
  let q = 0;
  const Pp = WEB_P;
  for (let k = 0; k < n && q < MAX_WEB_PTS - WEB_PARTICLES; k++) {
    if (!ok(k)) continue;
    Pp[q * 4] = P3[k * 3]; Pp[q * 4 + 1] = P3[k * 3 + 1]; Pp[q * 4 + 2] = P3[k * 3 + 2];
    Pp[q * 4 + 3] = web.fade * (0.22 + 0.4 * near(P3[k * 3], P3[k * 3 + 1], P3[k * 3 + 2])); q++;
  }
  web.nDots = q;
  const t = reducedMotion ? 0 : now / 1000;
  const step = Math.max(1, Math.floor(E.length / 2 / WEB_PARTICLES));
  for (let e = 0, m = 0; e < E.length && q < MAX_WEB_PTS; e += 2 * step, m++) {
    let a = E[e], b = E[e + 1];
    if (!ok(a) || !ok(b)) continue;
    const da = Math.hypot(P3[a * 3] - WH.x, P3[a * 3 + 1] - WH.y, P3[a * 3 + 2] - WH.z);
    const db = Math.hypot(P3[b * 3] - WH.x, P3[b * 3 + 1] - WH.y, P3[b * 3 + 2] - WH.z);
    if (db < da) { const tmp = a; a = b; b = tmp; }
    const u = (t * 0.35 + (m * 0.618034) % 1) % 1;
    Pp[q * 4] = P3[a * 3] + (P3[b * 3] - P3[a * 3]) * u;
    Pp[q * 4 + 1] = P3[a * 3 + 1] + (P3[b * 3 + 1] - P3[a * 3 + 1]) * u;
    Pp[q * 4 + 2] = P3[a * 3 + 2] + (P3[b * 3 + 2] - P3[a * 3 + 2]) * u;
    Pp[q * 4 + 3] = web.fade * Math.sin(u * Math.PI) * (0.35 + 0.55 * near(Pp[q * 4], Pp[q * 4 + 1], Pp[q * 4 + 2]));
    q++;
  }
  web.nP = q - web.nDots;
  web.cpu += performance.now() - t0; web.cpuN++;
}
function drawWeb(light) {
  if (!web.g || (web.nL === 0 && web.nDots + web.nP === 0)) return;
  const ink = [0.92 - 0.82 * light, 0.95 - 0.82 * light, 1.0 - 0.8 * light];
  if (web.nL > 0) {
    gl.useProgram(LN.p);
    gl.uniformMatrix4fv(LN.u.uM, false, VP); gl.uniform3f(LN.u.uColor, ink[0], ink[1], ink[2]); gl.uniform1f(LN.u.uLight, light);
    gl.bindVertexArray(vaoWebL); gl.bindBuffer(gl.ARRAY_BUFFER, webLBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, WEB_L, 0, web.nL * 4);
    gl.drawArrays(gl.LINES, 0, web.nL);
  }
  const np = web.nDots + web.nP;
  if (np > 0) {
    gl.useProgram(WP.p);
    gl.uniformMatrix4fv(WP.u.uVP, false, VP); gl.uniform3f(WP.u.uColor, ink[0], ink[1], ink[2]); gl.uniform1f(WP.u.uLight, light);
    gl.bindVertexArray(vaoWebP); gl.bindBuffer(gl.ARRAY_BUFFER, webPBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, WEB_P, 0, np * 4);
    gl.uniform1f(WP.u.uSize, 3 * dpr); gl.drawArrays(gl.POINTS, 0, web.nDots);
    gl.uniform1f(WP.u.uSize, 3.6 * dpr); gl.drawArrays(gl.POINTS, web.nDots, web.nP);
  }
}

/* The green glow around a hovered or selected object (CPU sprites, buildHalo) and around
 * filter matches (GPU pass in draw): one definition. Size = min(objectPx * k + c, cap). */
const HOVER_HALO = [{ k: 2.2, c: 20, cap: 90, a: 0.42 }, { k: 1.3, c: 7, cap: 60, a: 0.6 }];
const HALO_PULSE = 0.06;
const MATCH_GLOW = 0.4; // a filter match gets this share of the hover look
function putHalo(x, y, size, a) {
  if (nHalo >= HALO_MAX) return;
  const k = nHalo * 4;
  HALO[k] = x / cssW * 2 - 1; HALO[k + 1] = 1 - y / cssH * 2; HALO[k + 2] = size * dpr; HALO[k + 3] = a; nHalo++;
}
function buildHalo(now) {
  nHalo = 0;
  const t = reducedMotion ? 0 : now / 1000;
  // selected: a ring of orbiting particles (accent)
  if (sel >= 0) {
    nodeWorld(sel, W);
    if (project(W.x, W.y, W.z, SP)) {
      const R = nodePxCss(sel, SP.w) * 0.5 + 12;
      for (let k = 0; k < 32; k++) {
        const a = k / 32 * TAU + t * 0.55;
        const rr = R + 5 + Math.sin(t * 1.7 + k * 1.3) * 2.2;
        const sweep = 0.5 + 0.5 * Math.sin(a * 3 - t * 2.1);
        putHalo(SP.x + Math.cos(a) * rr, SP.y + Math.sin(a) * rr, 3.2 + sweep * 2.2, 0.45 + 0.55 * sweep);
      }
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * TAU - t * 0.9;
        const rr = R * 0.62 + Math.sin(t * 2.3 + k) * 1.2;
        putHalo(SP.x + Math.cos(a) * rr, SP.y + Math.sin(a) * rr, 2.4, 0.55 + 0.3 * Math.sin(t * 3 + k * 2));
      }
      for (let k = 0; k < 2; k++) {
        const a = t * 1.25 + k * Math.PI;
        putHalo(SP.x + Math.cos(a) * (R + 5), SP.y + Math.sin(a) * (R + 5), 6, 1);
      }
    }
  }
  nRing = nHalo;
  // hovered and selected: the object itself in bright green with a small glow around it
  for (const i of [sel, hover === sel ? -1 : hover]) {
    if (i < 0) continue;
    nodeWorld(i, W);
    if (!project(W.x, W.y, W.z, SP)) continue;
    const px = nodePxCss(i, SP.w);
    const pulse = 1 + HALO_PULSE * Math.sin(t * 3.2);
    HOVER_HALO.forEach((L, k) => putHalo(SP.x, SP.y, Math.min(px * L.k + L.c, L.cap) * (k === 0 ? pulse : 1), L.a));
    putHalo(SP.x, SP.y, Math.max(Math.min(px * 0.95, 40), 7), 1); // the bright core: hover and selection only
  }
}
function buildOrbits() {
  nOrbitVerts = 0;
  const sysI = sel >= 0 ? systemOf(sel) : hover >= 0 ? systemOf(hover) : -1;
  if (sysI < 0) return;
  const sys = OBJ[sysI];
  if (!sys.planets.length) return;
  const ps = projScale();
  nodeWorld(sysI, W);
  const hx = W.x, hy = W.y, hz = W.z;
  let v = nLinkVerts;
  const L = LINE_DATA, SEG = 96;
  for (const pi of sys.planets) {
    const R = NODE[pi * STRIDE + 8];
    const al = 0.32 * smooth(clamp((R * ps / Math.max(cam.dist, 1e-6) - 4) / 12, 0, 1)) * (pi === sel ? 1.8 : 1);
    if (al < 0.01) continue;
    for (let s = 0; s < SEG; s++) {
      if (v + 2 > MAX_SEG * 2 - RING_VERTS) break;
      const a0 = s / SEG * TAU, a1 = (s + 1) / SEG * TAU;
      L[v * 4] = hx + Math.cos(a0) * R; L[v * 4 + 1] = hy; L[v * 4 + 2] = hz + Math.sin(a0) * R; L[v * 4 + 3] = al; v++;
      L[v * 4] = hx + Math.cos(a1) * R; L[v * 4 + 1] = hy; L[v * 4 + 2] = hz + Math.sin(a1) * R; L[v * 4 + 3] = al; v++;
    }
  }
  nOrbitVerts = v - nLinkVerts;
}
// the Milky Way's disk as a dashed circle in the galaxy plane, for scale
const RING_DASHES = 72, RING_VERTS = RING_DASHES * 2;
let nRingVerts = 0;
function buildRing(dt) {
  ringFade += ((S.ring ? 1 : 0) - ringFade) * (1 - Math.exp(-dt * 5));
  nRingVerts = 0;
  if (ringFade < 0.01) return;
  let v = nLinkVerts + nOrbitVerts;
  const L = LINE_DATA, al = 0.4 * ringFade;
  for (let s = 0; s < RING_DASHES; s++) {
    const a0 = s / RING_DASHES * TAU, a1 = a0 + TAU / RING_DASHES * 0.55;
    L[v * 4] = Math.cos(a0) * RING_R; L[v * 4 + 1] = 0; L[v * 4 + 2] = Math.sin(a0) * RING_R; L[v * 4 + 3] = al; v++;
    L[v * 4] = Math.cos(a1) * RING_R; L[v * 4 + 1] = 0; L[v * 4 + 2] = Math.sin(a1) * RING_R; L[v * 4 + 3] = al; v++;
  }
  nRingVerts = RING_VERTS;
}

/* ===================================================================== *
 * Input
 * ===================================================================== */
function markInteract() { lastInteract = performance.now(); if (!el.hint.classList.contains('gone')) el.hint.classList.add('gone'); }
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  pointer.mouse = e.pointerType === 'mouse';
  pointer.down = true; pointer.dragging = false;
  pointer.downHover = e.pointerType === 'mouse' ? hover : -1;
  pointer.pan = e.shiftKey || e.button === 2 || e.ctrlKey;
  pointer.startX = pointer.lx = e.clientX; pointer.startY = pointer.ly = e.clientY; pointer.t0 = performance.now();
  if (touches.size === 2) { const [a, b] = [...touches.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); }
  cam.vYaw = cam.vPitch = 0;
});
canvas.addEventListener('pointermove', (e) => {
  pointer.x = e.clientX; pointer.y = e.clientY;
  pointer.inside = e.pointerType !== 'touch';
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!pointer.down) return;
  if (touches.size === 2) {
    const [a, b] = [...touches.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    stopTween();
    if (pinchD > 0) cam.gDist = clamp(cam.gDist * pinchD / d, MIN_DIST, MAX_DIST);
    pinchD = d; pointer.dragging = true; markInteract();
    return;
  }
  const dx = e.clientX - pointer.lx, dy = e.clientY - pointer.ly;
  pointer.lx = e.clientX; pointer.ly = e.clientY;
  if (!pointer.dragging && Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY) < 4) return;
  pointer.dragging = true; canvas.classList.add('dragging'); markInteract();
  if (pointer.pan) {
    if (cam.follow >= 0) { cam.follow = -1; stopTween(); cam.gtx = cam.tx; cam.gty = cam.ty; cam.gtz = cam.tz; }
    const k = cam.dist * 0.0013;
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    cam.gtx += (-cy * dx - sy * dy) * k; cam.gtz += (sy * dx - cy * dy) * k;
  } else {
    cam.gYaw -= dx * 0.0055; cam.gPitch = clamp(cam.gPitch + dy * 0.0045, -1.45, 1.45);
    cam.vYaw = -dx * 0.0055; cam.vPitch = dy * 0.0045;
  }
});
function endPointer(e) {
  touches.delete(e.pointerId);
  if (touches.size > 0) {
    // a pinch just ended: drag on from where the remaining finger is, not from the second finger's start
    pinchD = 0;
    const [t] = touches.values(); pointer.lx = t.x; pointer.ly = t.y;
    return;
  }
  const wasDrag = pointer.dragging;
  pointer.down = false; pointer.dragging = false; canvas.classList.remove('dragging');
  if (e.type === 'pointercancel') return;
  if (!wasDrag && performance.now() - pointer.t0 < 600) {
    // the object under the cursor when the button went down (or still now); otherwise pick
    // fresh with a wider radius, which also covers taps and clicks during a camera flight
    let i = e.pointerType === 'mouse' ? (hover >= 0 ? hover : pointer.downHover) : -1;
    if (i < 0) i = pickAt(e.clientX, e.clientY, false, CLICK_SLOP);
    if (i >= 0) select(i, false); else if (sel >= 0) deselect();
    markInteract();
  } else if (!reducedMotion) {
    cam.gYaw += cam.vYaw * 8; cam.gPitch = clamp(cam.gPitch + cam.vPitch * 8, -1.45, 1.45);
  }
  if (e.pointerType !== 'mouse') pointer.inside = false;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { if (!pointer.down) pointer.inside = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const k = e.ctrlKey ? 0.012 : 0.0013;
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  stopTween();
  cam.gDist = clamp(cam.gDist * Math.exp(dy * k), MIN_DIST, MAX_DIST);
  markInteract();
}, { passive: false });
canvas.addEventListener('dblclick', () => { if (hover >= 0) select(hover, true); });

addEventListener('keydown', (e) => {
  const ae = document.activeElement;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ae?.tagName || '');
  // Space on a focused button, link or tab activates it; only steal it for play/pause elsewhere
  const onControl = !!ae?.closest?.('button, a[href], [role="button"], [role="tab"]');
  if (e.key === '/' && !typing) { e.preventDefault(); if (!navOpen) setNav(true); el.q.focus(); el.q.select(); }
  else if (e.key === 'Escape') {
    if (typing && el.q.value) { el.q.value = ''; onQuery(true); }
    else if (typing) document.activeElement.blur();
    else if (sel >= 0) deselect();
  } else if (e.key === ' ' && !typing && !onControl) { e.preventDefault(); togglePlay(); }
});

/* ---------- toolbar ---------- */
const PLAY_SVG = '<path d="M5 3.4v9.2a.6.6 0 0 0 .9.5l7.3-4.6a.6.6 0 0 0 0-1L5.9 2.9a.6.6 0 0 0-.9.5Z"/>';
const PAUSE_SVG = '<rect x="4" y="3.5" width="2.6" height="9" rx="1"/><rect x="9.4" y="3.5" width="2.6" height="9" rx="1"/>';
function syncTime() {
  el.playIcon.innerHTML = T.speed > 0 ? PAUSE_SVG : PLAY_SVG;
  el.play.setAttribute('aria-label', T.speed > 0 ? 'Pause galactic time' : 'Play galactic time');
  el.speedSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.speed === (T.speed || T.lastSpeed) && T.speed > 0)));
}
function togglePlay() { if (T.speed > 0) { T.lastSpeed = T.speed; T.speed = 0; } else T.speed = T.lastSpeed || 1; syncTime(); }
el.play.addEventListener('click', togglePlay);
el.speedSeg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; T.speed = T.lastSpeed = +b.dataset.speed; syncTime(); });
el.resetView.addEventListener('click', resetView);
syncTime();

/* ---------- nav open/close ---------- */
function setNav(open) {
  navOpen = open;
  document.body.classList.toggle('nav-hidden', !open);
  el.navOpen.hidden = open;
}
el.navClose.addEventListener('click', () => setNav(false));
el.navOpen.addEventListener('click', () => setNav(true));
narrowMQ.addEventListener('change', () => setNav(!narrowMQ.matches));
setNav(navOpen);

/* ---------- theme ---------- */
function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  lightTarget = cs.getPropertyValue('--scene-light').trim() === '1' ? 1 : 0;
  const hex = cs.getPropertyValue('--void').trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (m) { const n = parseInt(m[1], 16); bgTarget = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  el.themeBtn.setAttribute('aria-label', lightTarget ? 'Switch to dark theme' : 'Switch to light theme');
  el.themeIcon.innerHTML = lightTarget
    ? '<path d="M13 9.6A5.5 5.5 0 0 1 6.4 3a5.5 5.5 0 1 0 6.6 6.6Z"/>'
    : '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>';
}
let bgTarget = bg.slice();
el.themeBtn.addEventListener('click', () => {
  document.documentElement.setAttribute('data-theme', lightTarget ? 'dark' : 'light');
});
new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
matchMedia('(prefers-color-scheme: light)').addEventListener('change', readTheme);
readTheme();
light = lightTarget; bg = bgTarget.slice();


/* ===================================================================== *
 * Galaxies: tabs, on-demand loading, and swapping the world
 * ===================================================================== */
/** Point every module-level binding at world w; reset what depends on object indices. */
function useWorld(w) {
  ({ G, OBJ, N, NODE, typeOf, clsOf, regOf, distOf, FIELD, HAZE_DATA } = w);
  N_FIELD_ALL = w.nField; N_HAZE = w.nHaze;
  PASS = new Uint8Array(N).fill(1);
  MATCH = new Float32Array(N).fill(1);
  REGIONS = G.regions;
  TOTAL_POINTS = N + N_FIELD_ALL + N_HAZE;
  HOME = G.home; SCALE = G.scale; MAX_DIST = Math.max(320, HOME.dist * 3.4);
  galaxyId = G.id;
  hover = -1; sel = -1; tipFor = -1; el.tip.hidden = true; el.card.hidden = true;
  cam.follow = -1; tween = null;
  for (const pin of PINS) { pin.id = -1; pin.mix = 0; }
  for (const L of PL_LABELS) L.i = -1; // label text is cached by object index, which the new world reuses
  webLm = null; web.g = null; web.focus = -1; web.fade = 0; web.nL = web.nDots = web.nP = 0;
  nCand = 0; nLinkVerts = 0; nOrbitVerts = 0;
  S.ring = !!G.ring; el.ring.checked = S.ring; ringFade = S.ring ? 1 : 0;
  clearFilters();
  renderFacets();
  buildLabels();
  document.title = `${G.name} · Galaxy 3D simulation`;
}
/** Camera to the galaxy's home view, coming in from further out unless motion is reduced. */
function homeCamera(intro) {
  cam.tx = cam.ty = cam.tz = cam.gtx = cam.gty = cam.gtz = 0;
  cam.yaw = cam.gYaw = HOME.yaw; cam.gPitch = HOME.pitch; cam.gDist = HOME.dist;
  cam.pitch = HOME.pitch + (intro && !reducedMotion ? 0.2 : 0);
  cam.dist = intro && !reducedMotion ? HOME.dist * 1.75 : HOME.dist;
  cam.vYaw = cam.vPitch = 0;
}

function renderTabs() {
  el.gtabs.innerHTML = GALAXIES.map((g) => `<button type="button" role="tab" id="tab-${g.id}" data-g="${g.id}" aria-selected="false" tabindex="-1"${g.short ? ` title="${esc(g.label)}"` : ''}><span class="full">${esc(g.label)}</span>${g.short ? `<span class="short" aria-hidden="true">${esc(g.short)}</span>` : ''}</button>`).join('');
}
function markTab(id) {
  for (const b of el.gtabs.querySelectorAll('[role="tab"]')) {
    const on = b.dataset.g === id;
    b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
    if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
let switching = null;
// The URL is never rewritten, so a reload or a fresh visit always opens the Milky Way;
// an explicit link such as /galaxy-3d/#m87 still opens that galaxy.
async function switchGalaxy(id) {
  const entry = GALAXIES.find((g) => g.id === id) || GALAXIES[0];
  if (entry.id === galaxyId) {
    // back to the galaxy already on screen: drop any pending switch, keep its state
    if (switching) { switching = null; el.gtabs.removeAttribute('aria-busy'); document.body.classList.remove('switching'); }
    markTab(entry.id);
    return;
  }
  markTab(entry.id);
  const ticket = {};
  switching = ticket;
  document.body.classList.add('switching');
  el.gtabs.setAttribute('aria-busy', 'true');
  try {
    const [def] = await Promise.all([entry.load(), new Promise((r) => setTimeout(r, reducedMotion ? 0 : 260))]);
    if (switching !== ticket) return; // a newer click won
    let w = worldCache.get(entry.id);
    if (!w) { w = buildWorld(def); worldCache.set(entry.id, w); }
    useWorld(w);
    if (glOK) uploadWorld();
    homeCamera(true);
    applyFilters();
  } catch (err) {
    console.error(err);
    markTab(galaxyId);
  } finally {
    if (switching === ticket) {
      switching = null;
      el.gtabs.removeAttribute('aria-busy');
      requestAnimationFrame(() => document.body.classList.remove('switching'));
    }
  }
}
el.gtabs.addEventListener('click', (e) => { const b = e.target.closest('[role="tab"]'); if (b) switchGalaxy(b.dataset.g); });
el.gtabs.addEventListener('keydown', (e) => {
  const tabs = [...el.gtabs.querySelectorAll('[role="tab"]')];
  const k = tabs.indexOf(document.activeElement);
  if (k < 0) return;
  const to = e.key === 'ArrowRight' ? (k + 1) % tabs.length : e.key === 'ArrowLeft' ? (k - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
  if (to < 0) return;
  e.preventDefault();
  tabs[to].focus();
  switchGalaxy(tabs[to].dataset.g);
});
addEventListener('hashchange', () => { const id = location.hash.slice(1); if (GALAXIES.some((g) => g.id === id)) switchGalaxy(id); });

/* ===================================================================== *
 * Frame loop
 * ===================================================================== */
function resize() {
  cssW = Math.max(1, canvas.clientWidth); cssH = Math.max(1, canvas.clientHeight);
  dpr = Math.min(devicePixelRatio || 1, dprCap);
  canvas.width = Math.max(1, Math.round(cssW * dpr)); canvas.height = Math.max(1, Math.round(cssH * dpr));
  if (glOK) gl.viewport(0, 0, canvas.width, canvas.height);
}
addEventListener('resize', resize);

let last = performance.now(), fpsT = last, fpsN = 0, fps = 0, slowWindows = 0, clockShown = '';
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  fpsN++;
  if (now - fpsT > 600) {
    fps = fpsN * 1000 / (now - fpsT); fpsN = 0; fpsT = now;
    if (fps < 42 && dprCap > 1) { if (++slowWindows >= 3) { dprCap = Math.max(1, dprCap - 0.5); resize(); slowWindows = 0; } } else slowWindows = 0;
    if (web.cpuN) { web.cpuShown = web.cpu / web.cpuN; web.cpu = 0; web.cpuN = 0; }
    const w = web.g && web.fade > 0.5 ? `\nweb ${fmtInt(web.g.ids.length)} objects, ${fmtInt(web.nL / 2)} links, ${web.cpuShown.toFixed(2)} ms/frame (built in ${web.g.buildMs.toFixed(1)} ms)` : '';
    el.hud.textContent = `${Math.round(fps)} fps · ${fmtInt(TOTAL_POINTS)} points · WebGL2 · ${dpr.toFixed(1)}× pixels${w}`;
  }

  // time
  const zoomSlow = clamp(Math.pow(cam.dist / (25 * SCALE), 0.8), 0.01, 1);
  T.myr += dt * 0.8 * T.speed * zoomSlow;
  T.pattern = (T.myr / G.period * TAU) % TAU;
  T.epi = (T.myr / 120 * TAU) % TAU;
  T.orbit += dt * Math.sqrt(T.speed);
  const cs = (T.myr).toFixed(1);
  if (cs !== clockShown) { const [ip, fp] = cs.split('.'); el.clock.textContent = fmtInt(+ip) + '.' + fp; clockShown = cs; }

  // camera
  if (!pointer.down && !reducedMotion && sel < 0 && hover < 0 && now - lastInteract > 7000) cam.gYaw += dt * 0.012;
  const k = 1 - Math.exp(-dt * (reducedMotion ? 30 : 5.5));
  cam.yaw += (cam.gYaw - cam.yaw) * k; cam.pitch += (cam.gPitch - cam.pitch) * k;
  let off = 0;
  if (tween) {
    // eased flight: the object glides to the centre in the first ~60%, the zoom runs the whole way
    const u = clamp((now - tween.t0) / tween.dur, 0, 1);
    const zp = easeIO(u);
    off = 1 - easeIO(clamp(u / 0.62, 0, 1));
    cam.dist = Math.exp(Math.log(tween.d0) + (Math.log(tween.d1) - Math.log(tween.d0)) * zp);
    if (u >= 1) { tween = null; off = 0; }
  } else {
    cam.dist = Math.exp(Math.log(cam.dist) + (Math.log(cam.gDist) - Math.log(cam.dist)) * k);
  }
  if (cam.follow >= 0) {
    // ride along with the object (it moves with the galaxy)
    nodeWorld(cam.follow, W);
    const o = tween || { ox: 0, oy: 0, oz: 0 };
    cam.tx = W.x + o.ox * off; cam.ty = W.y + o.oy * off; cam.tz = W.z + o.oz * off;
    cam.gtx = W.x; cam.gty = W.y; cam.gtz = W.z;
  } else {
    cam.tx += (cam.gtx - cam.tx) * k; cam.ty += (cam.gty - cam.ty) * k; cam.tz += (cam.gtz - cam.tz) * k;
  }
  const cp = Math.cos(cam.pitch);
  camEye = [cam.tx + cam.dist * cp * Math.sin(cam.yaw), cam.ty + cam.dist * Math.sin(cam.pitch), cam.tz + cam.dist * cp * Math.cos(cam.yaw)];
  perspective(P, FOV, cssW / cssH, Math.max(cam.dist * 0.02, 1e-4), cam.dist * 30 + 2600);
  const navPx = navOpen && !narrowMQ.matches ? 316 + 30 : 0;
  shiftNdc += ((navPx / cssW) - shiftNdc) * k;
  P[8] = -shiftNdc;
  lookAt(V, camEye[0], camEye[1], camEye[2], cam.tx, cam.ty, cam.tz);
  mul(VP, P, V);

  // pointer smoothing + lens
  const lensTarget = pointer.inside && pointer.mouse && !pointer.dragging ? 1 : 0;
  lens += (lensTarget - lens) * (1 - Math.exp(-dt * 6));
  const ks = 1 - Math.exp(-dt * 14);
  pointer.sx += (pointer.x - pointer.sx) * ks; pointer.sy += (pointer.y - pointer.sy) * ks;

  // theme crossfade
  const kl = 1 - Math.exp(-dt * 7);
  light += (lightTarget - light) * kl;
  for (let c = 0; c < 3; c++) bg[c] += (bgTarget[c] - bg[c]) * kl;

  // picking
  const prevHover = hover;
  if (pointer.inside && pointer.mouse && !pointer.down && !tween) {
    const next = pickAt(pointer.x, pointer.y, true);
    const moved = pointer.x !== pickX || pointer.y !== pickY;
    pickX = pointer.x; pickY = pointer.y;
    hover = next;
    // keep the current object while the cursor stays near it, unless another one is clearly closer
    if (prevHover >= 0 && next !== prevHover && (!filtering || PASS[prevHover])) {
      nodeWorld(prevHover, W);
      if (project(W.x, W.y, W.z, SP)) {
        const dp = Math.hypot(SP.x - pointer.x, SP.y - pointer.y);
        let dn = Infinity;
        if (next >= 0) { nodeWorld(next, W); if (project(W.x, W.y, W.z, SP)) dn = Math.hypot(SP.x - pointer.x, SP.y - pointer.y); }
        // with the mouse still, objects drifting under the cursor never steal the hover
        if (dp < HOLD_R + NODE[prevHover * STRIDE + 12] * 2 && (!moved || dn > dp * 0.4)) hover = prevHover;
      }
    }
  } else if (!pointer.down || pointer.dragging || touches.size > 1) { hover = -1; nCand = 0; }
  // (a press that hasn't become a drag keeps its hover, so the click can open it)
  if (hover !== prevHover) canvas.classList.toggle('pointing', hover >= 0);
  updatePins(dt);
  buildLinks();
  buildOrbits();
  buildRing(dt);
  buildHalo(now);
  updateWeb(dt, now);

  draw(now);
  placeTip();
  updateLabels();
}

// uniforms the node shader and the match glow share: both place nodes through NODE_PLACE
function placeUniforms(u, ps, real) {
  gl.uniformMatrix4fv(u.uVP, false, VP);
  gl.uniform2f(u.uView, canvas.width, canvas.height);
  gl.uniform1f(u.uProj, ps); gl.uniform1f(u.uDpr, dpr);
  gl.uniform1f(u.uPattern, T.pattern); gl.uniform1f(u.uEpi, T.epi); gl.uniform1f(u.uOrbit, T.orbit); gl.uniform1f(u.uReal, real);
  gl.uniform1f(u.uMotion, reducedMotion ? 0 : 1);
  gl.uniform2f(u.uMouse, pointer.sx * dpr, (cssH - pointer.sy) * dpr);
  gl.uniform1f(u.uLens, lens); gl.uniform1f(u.uForceR, FORCE_R * dpr); gl.uniform1f(u.uPush, PUSH * dpr);
  gl.uniform1f(u.uMaxPt, maxPt); gl.uniform1f(u.uCamDist, cam.dist);
}
function focusUniforms(u) {
  const [pa, pb] = PINS;
  gl.uniform1i(u.uHover, hover); gl.uniform1i(u.uSel, sel);
  gl.uniform1i(u.uPinA, pa.mix > 0 ? pa.id : -1); gl.uniform4f(u.uPinAT, pa.pat, pa.epi, pa.orb, pa.mix);
  gl.uniform1i(u.uPinB, pb.mix > 0 ? pb.id : -1); gl.uniform4f(u.uPinBT, pb.pat, pb.epi, pb.orb, pb.mix);
}
const MATCH_GLOW_MAX = 2000; // above this a filter is the whole galaxy; the shader tint is enough
const ACCENT_DARK = [0.38, 0.94, 0.85], ACCENT_LIGHT = [0.04, 0.54, 0.54];
const FOCUS_DARK = [0.45, 1.0, 0.5], FOCUS_LIGHT = [0.0, 0.58, 0.24];
function draw(now) {
  gl.clearColor(bg[0], bg[1], bg[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const ps = projScale() * dpr;
  const real = (now / 1000) % 3600;
  const accent = ACCENT_DARK.map((v, c) => v + (ACCENT_LIGHT[c] - v) * light);
  const focus = FOCUS_DARK.map((v, c) => v + (FOCUS_LIGHT[c] - v) * light);
  const fieldDim = filtering ? 0.28 : 1;
  // filter matches: MATCH_GLOW of the hover look, eased off as matches grow (×1 at ≤10, ×0.6 at ~1,000)
  const matchGlow = filtering && matchCount > 0 ? MATCH_GLOW * clamp(1.2 - 0.2 * Math.log10(matchCount), 0.55, 1) : 0;

  gl.useProgram(HZ.p);
  gl.uniformMatrix4fv(HZ.u.uVP, false, VP);
  gl.uniform1f(HZ.u.uPattern, T.pattern); gl.uniform1f(HZ.u.uProj, ps); gl.uniform1f(HZ.u.uMaxPt, maxPt);
  gl.uniform1f(HZ.u.uLight, light); gl.uniform1f(HZ.u.uCamDist, cam.dist); gl.uniform1f(HZ.u.uDim, filtering ? 0.45 : 1);
  gl.uniform3f(HZ.u.uBg, bg[0], bg[1], bg[2]);
  gl.bindVertexArray(vaoHaze);
  gl.drawArrays(gl.POINTS, 0, N_HAZE);

  gl.useProgram(PT.p);
  const u = PT.u;
  placeUniforms(u, ps, real);
  gl.uniform1f(u.uHoverR, HOVER_R * dpr);
  gl.uniform1f(u.uDim, S.hide ? 0 : 0.07); gl.uniform1f(u.uFieldDim, fieldDim); gl.uniform1f(u.uMatchGlow, matchGlow); gl.uniform1f(u.uLight, light);
  gl.uniform3f(u.uAccent, accent[0], accent[1], accent[2]); gl.uniform3f(u.uFocus, focus[0], focus[1], focus[2]);

  gl.uniform1i(u.uIdBase, 1 << 20); gl.uniform1i(u.uHover, -1); gl.uniform1i(u.uSel, -1); gl.uniform1i(u.uPinA, -1); gl.uniform1i(u.uPinB, -1);
  gl.bindVertexArray(vaoField);
  gl.vertexAttrib1f(4, 1);
  gl.drawArrays(gl.POINTS, 0, N_FIELD_ALL);

  const nl = nLinkVerts + nOrbitVerts + nRingVerts;
  if (nl > 0) {
    gl.bindVertexArray(vaoLine);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, LINE_DATA, 0, nl * 4);
    gl.useProgram(LN.p);
    gl.uniform1f(LN.u.uLight, light);
    if (nRingVerts > 0) {
      const ink = 0.62 - 0.5 * light;
      gl.uniformMatrix4fv(LN.u.uM, false, VP);
      gl.uniform3f(LN.u.uColor, ink + 0.05, ink + 0.1, ink + 0.25);
      gl.drawArrays(gl.LINES, nLinkVerts + nOrbitVerts, nRingVerts);
    }
    if (nOrbitVerts > 0) {
      gl.uniformMatrix4fv(LN.u.uM, false, VP);
      gl.uniform3f(LN.u.uColor, accent[0] * 0.8 + 0.1, accent[1] * 0.8 + 0.1, accent[2] * 0.8 + 0.1);
      gl.drawArrays(gl.LINES, nLinkVerts, nOrbitVerts);
    }
    if (nLinkVerts > 0) {
      gl.uniformMatrix4fv(LN.u.uM, false, ID);
      gl.uniform3f(LN.u.uColor, accent[0], accent[1], accent[2]);
      gl.drawArrays(gl.LINES, 0, nLinkVerts);
    }
    gl.useProgram(PT.p);
  }

  drawWeb(light);
  gl.useProgram(PT.p);
  gl.uniform1i(u.uIdBase, 0);
  focusUniforms(u);
  gl.bindVertexArray(vaoNode);
  gl.drawArrays(gl.POINTS, 0, N);

  // filter matches: the hover halo's layers (HOVER_HALO) at matchGlow strength, skipped for huge matches
  if (MG && filtering && matchCount > 0 && matchCount <= MATCH_GLOW_MAX) {
    const g = MG.u;
    gl.useProgram(MG.p);
    placeUniforms(g, ps, real);
    focusUniforms(g);
    gl.uniform3f(g.uColor, focus[0], focus[1], focus[2]); gl.uniform1f(g.uLight, light);
    HOVER_HALO.forEach((L, k) => {
      gl.uniform1f(g.uK, L.k); gl.uniform1f(g.uC, L.c); gl.uniform1f(g.uCap, L.cap); gl.uniform1f(g.uA, L.a * matchGlow);
      gl.uniform1f(g.uPulse, k === 0 ? HALO_PULSE : 0);
      gl.drawArrays(gl.POINTS, 0, N);
    });
  }

  if (nHalo > 0) {
    gl.useProgram(HL.p);
    gl.uniform1f(HL.u.uLight, light);
    gl.bindVertexArray(vaoHalo);
    gl.bindBuffer(gl.ARRAY_BUFFER, haloBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, HALO, 0, nHalo * 4);
    if (nHalo > nRing) { gl.uniform3f(HL.u.uColor, focus[0], focus[1], focus[2]); gl.drawArrays(gl.POINTS, nRing, nHalo - nRing); }
    if (nRing > 0) { gl.uniform3f(HL.u.uColor, accent[0], accent[1], accent[2]); gl.drawArrays(gl.POINTS, 0, nRing); }
  }
}

/* ===================================================================== *
 * Boot
 * ===================================================================== */
async function boot() {
  renderTabs();
  const back = $('.back-link');
  if (back) mountHalo(back);
  const hashId = location.hash.slice(1);
  let entry = GALAXIES.find((g) => g.id === hashId) || GALAXIES[0];
  markTab(entry.id);
  let def;
  try { def = await entry.load(); } catch (err) {
    // the hash named a galaxy whose chunk did not load: start on the Milky Way, which ships with the page
    console.error(err);
    entry = GALAXIES[0]; markTab(entry.id);
    def = await entry.load();
  }
  const w = buildWorld(def);
  worldCache.set(entry.id, w);
  useWorld(w);
  homeCamera(true);
  glOK = initGL();
  resize();
  applyFilters();
  if (glOK) {
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); });
    // preventDefault above asks for a restore; rebuild programs and buffers from the current world
    canvas.addEventListener('webglcontextrestored', () => { glOK = initGL(); resize(); });
    requestAnimationFrame(frame);
  } else {
    const f = document.createElement('div');
    f.className = 'fallback';
    f.innerHTML = '<div class="glass">This browser did not provide WebGL2, which the 3D galaxy needs.</div>';
    document.body.appendChild(f);
  }
}
boot();
