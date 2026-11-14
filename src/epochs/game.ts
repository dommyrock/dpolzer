import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { Registry, counts, type Def } from './sprites';
import { World, N, CX, CY, RING, STEPS, DISTRICT_TINT, TINT_STRENGTH, epochOf, zoneOf, type Plan, type Tile } from './world';
import { clamp, hash, lerp, rng, smoothstep, type R } from './rng';
import { EPOCH_META } from './meta';
import { makeBody } from './space';

const TW = 16, TH = 8; // half tile size in art pixels
const FOG = [0.3, 0.39, 0.52];

interface Obj {
  id: string; idx: number; spr: Sprite; light: Sprite | null; def: Def;
  shown: boolean; dead: boolean; fogged: boolean;
}
interface Anim { delay: number; dur: number; t: number; start?: () => void; update?: (p: number) => void; end?: () => void; dead?: boolean }
interface Particle { spr: Sprite; vx: number; vy: number; g: number; life: number; max: number; a: number; grow: number }
interface Mover {
  kind: 'sheep' | 'veh' | 'fly' | 'cloud' | 'trip'; base: string; spr: Sprite; light: Sprite | null;
  x: number; y: number; dx: number; dy: number; nx: number; ny: number; speed: number; wait: number; alt: number; dir: number;
}

const backOut = (p: number) => { const c = 1.9; const q = p - 1; return 1 + (c + 1) * q * q * q + c * q * q; };
const rgb = (r: number, g: number, b: number) => (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);

export class Game {
  app = new Application();
  // the camera moves this container; as a render group its transform is applied on the GPU instead of re-walking every sprite
  world = new Container({ isRenderGroup: true });
  groundL = new Container();
  ringL = new Graphics();
  vehL = new Container({ isRenderGroup: true }); // ground traffic: flat on the roads, so it needs no depth sorting
  objL = new Container();
  // particles come and go every frame; a separate render group keeps that churn from rebuilding the whole scene
  fxL = new Container({ isRenderGroup: true });
  reg!: Registry;
  W!: World;
  step = -1;
  plan!: Plan;
  onBuilt?: (n: number) => void;

  private gSpr: (Sprite | null)[] = new Array(N * N).fill(null);
  private cliffs: Sprite[] = [];
  private gId: string[] = new Array(N * N).fill('');
  private gSeq = new Int32Array(N * N);
  private fog = new Float32Array(N * N).fill(1);
  private fogTo = new Uint8Array(N * N).fill(1);
  private objs = new Map<number, Obj>();
  private emitters = new Set<Obj>();
  private anims: Anim[] = [];
  private parts: Particle[] = [];
  private pool: Sprite[] = [];
  private movers: Mover[] = [];
  private water: number[] = [];
  private waterF = 0; private waterT = 0;
  private amb = [1, 1, 1]; private ambKey = -1; private night = 0; private nightKey = -1;
  private time = 9;
  private cam = { x: 0, y: 500, z: 3 }; private camTo = { x: 0, y: 500, z: 3 };
  private ripple: { t: number; max: number; color: number } | null = null;
  private rnd: R = rng(1);
  private roadSet = new Set<number>(); private freeSet = new Set<number>();
  private moverEpoch = -1;
  private destroyed = false;
  private evictT = 0;
  private dS = 0; // district colour strength for the current epoch
  private bodies: { c: Container; x: number; y: number; R: number; epoch: number; seed: number; items: Sprite[][]; on: boolean }[] = [];
  private rockets: { spr: Sprite; vy: number; t: number }[] = [];
  private moverKey = -1;

  async init(host: HTMLElement, seed: number): Promise<void> {
    await this.app.init({ resizeTo: host, backgroundAlpha: 0, antialias: false, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2), preference: 'webgl' });
    host.appendChild(this.app.canvas);
    this.rnd = rng(seed ^ 0x5bd1e995);
    this.reg = new Registry(seed);
    this.reg.ensure(0);
    this.W = new World(seed, counts);
    this.objL.sortableChildren = true;
    this.world.addChild(this.groundL, this.ringL, this.vehL, this.objL, this.fxL);
    this.app.stage.addChild(this.world);
    // the Moon (epoch 13) and Mars (epoch 14) hang beyond the island's far edges
    const oy = (CX + CY + 1) * TH;
    for (const [kind, x, y, R, epoch] of [['moon', 1250, oy - 1050, 200, 13], ['mars', -1300, oy - 1120, 260, 14]] as const) {
      const c = new Container();
      const s = new Sprite(Texture.from(makeBody(kind, R / 2, seed + epoch)));
      s.anchor.set(0.5); c.addChild(s); c.position.set(x, y); c.visible = false; c.sortableChildren = true;
      this.world.addChildAt(c, 0);
      this.bodies.push({ c, x, y, R, epoch, seed: seed + epoch, items: [], on: false });
    }
    for (const i of this.W.order) {
      const t = this.W.tiles[i]!;
      const px = (t.x - t.y) * TW, py = (t.x + t.y + 1) * TH;
      if (t.edge) {
        const d = this.reg.get(`cliff:${Math.floor(t.h3 * 4)}`);
        const c = new Sprite(d.tex); c.anchor.set(d.ax / d.w, d.ay / d.h); c.position.set(px, py);
        this.groundL.addChild(c); this.cliffs.push(c);
      }
      const s = new Sprite(Texture.EMPTY); s.position.set(px, py);
      this.groundL.addChild(s); this.gSpr[i] = s;
    }
    this.app.ticker.add((tk) => this.tick(Math.min(0.05, tk.deltaMS / 1000)));
  }

  destroy(): void { this.destroyed = true; this.app.destroy(true, { children: true }); }

  // ---- step / diff ----------------------------------------------------------
  setStep(step: number, instant = false): void {
    step = clamp(step, 0, STEPS - 1);
    if (step === this.step) return;
    const prev = this.step;
    const E = epochOf(step), jump = prev >= 0 && epochOf(prev) !== E;
    if (prev < 0) instant = true;
    this.reg.ensure(E);
    const retint = this.dS !== TINT_STRENGTH[E - 1];
    this.dS = TINT_STRENGTH[E - 1];
    const plan = this.W.plan(step);
    this.plan = plan; this.step = step;
    this.roadSet = new Set(plan.roads); this.freeSet = new Set(plan.free);
    this.water = [];
    let built = 0;
    for (const i of this.W.order) {
      const t = this.W.tiles[i]!;
      const fresh = t.zone === step && prev < step;
      const inner = RING[E - 2] ?? 0;
      const delay = instant ? 0 : jump ? (t.dist / RING[E - 1]) * 1.5 : fresh ? 0.1 + clamp((t.dist - inner) / (RING[E - 1] - inner), 0, 1) * 0.7 + t.h2 * 0.35 : t.h2 * 0.55;
      // ground
      const gid = plan.ground[i];
      if (gid.startsWith('water')) this.water.push(i);
      if (gid !== this.gId[i]) {
        this.gId[i] = gid;
        const seq = ++this.gSeq[i], s = this.gSpr[i]!, by = (t.x + t.y + 1) * TH;
        const swap = () => { const d = this.reg.get(gid); s.texture = d.tex; s.anchor.set(d.ax / d.w, d.ay / d.h); };
        if (instant) { swap(); s.y = by; }
        else this.anims.push({ delay, dur: 0.28, t: 0, start: () => { if (this.gSeq[i] === seq) swap(); }, update: (p) => { if (this.gSeq[i] === seq) s.y = by - Math.sin(p * Math.PI) * 3; } });
      }
      // fog
      if (plan.locked[i] !== this.fogTo[i]) {
        const to = plan.locked[i]; this.fogTo[i] = to;
        const from = this.fog[i];
        if (instant) { this.fog[i] = to; this.tintTile(i); }
        else this.anims.push({ delay, dur: 0.6, t: 0, update: (p) => { if (this.fogTo[i] === to) { this.fog[i] = lerp(from, to, p); this.tintTile(i); } } });
      }
      // object
      const want = plan.obj[i], have = this.objs.get(i);
      if ((have?.id ?? '') !== want) {
        if (have) this.removeObj(have, instant ? -1 : delay);
        if (want) { this.addObj(t, want, plan.objN[i], instant ? -1 : delay + 0.07, jump); if (want.charCodeAt(0) === 101 && /:(s|l|c|h|m)/.test(want)) built++; }
        else this.objs.delete(i);
      }
    }
    if (instant || retint) for (const i of this.W.order) this.tintTile(i);
    if (jump && !instant) this.ripple = { t: 0, max: RING[E - 1] + 3, color: EPOCH_META[E - 1].accent };
    clearTimeout(this.evictT);
    this.evictT = window.setTimeout(() => { if (!this.destroyed) this.reg.evict(new Set([epochOf(this.step), epochOf(this.step) + 1])); }, 7000);
    this.updateBodies(E, zoneOf(step), instant);
    this.setCamera(instant);
    this.spawnMovers(E);
    if (!instant) this.onBuilt?.(built);
    // warm the next epoch's sprites so the jump is instant
    if (E < 10) setTimeout(() => { if (!this.destroyed) this.reg.ensure(E + 1); }, 900);
  }

  private tintOf(i: number): number {
    const f = this.fog[i], a = this.amb, d = DISTRICT_TINT[this.W.tiles[i]!.dt], s = this.dS * (1 - f);
    return rgb(a[0] * lerp(1, FOG[0], f) * lerp(1, d[0], s), a[1] * lerp(1, FOG[1], f) * lerp(1, d[1], s), a[2] * lerp(1, FOG[2], f) * lerp(1, d[2], s));
  }
  private tintTile(i: number): void {
    const c = this.tintOf(i);
    this.gSpr[i]!.tint = c;
    const o = this.objs.get(i);
    if (o) o.spr.tint = c;
  }

  private addObj(t: Tile, id: string, n: number, delay: number, jump: boolean): void {
    const def = this.reg.get(id);
    const spr = new Sprite(def.tex);
    spr.anchor.set(def.ax / def.w, def.ay / def.h);
    const nat = id.charCodeAt(0) !== 101;
    const jx = nat ? Math.round((t.h3 - 0.5) * 8) : 0, jy = nat ? Math.round((t.h4 - 0.5) * 4) : 0;
    spr.position.set((t.x - t.y) * TW + jx, (t.x + t.y + n) * TH + jy);
    spr.zIndex = (t.x + t.y + 2 * (n - 1)) * 8;
    spr.tint = this.tintOf(t.i);
    let light: Sprite | null = null;
    if (def.light) {
      light = new Sprite(def.light); light.anchor.copyFrom(spr.anchor); light.position.copyFrom(spr.position);
      light.zIndex = spr.zIndex + 1; light.alpha = this.lightAlpha();
    }
    const o: Obj = { id, idx: t.i, spr, light, def, shown: false, dead: false, fogged: false };
    this.objs.set(t.i, o);
    const show = () => {
      if (o.dead) return;
      o.shown = true;
      this.objL.addChild(spr); if (light) this.objL.addChild(light);
      if (def.emitters.length) this.emitters.add(o);
    };
    if (delay < 0) { show(); return; }
    const big = !nat && /:(s|l|c|h|m)/.test(id);
    this.anims.push({
      delay, dur: big ? 0.42 : 0.3, t: 0,
      start: () => {
        show();
        if (o.dead || !big) return;
        const E = epochOf(this.step);
        const cols = E >= 11 ? [0xffffff, 0xa0ff9a, 0x8fdcd0] : E >= 9 ? [0x35e0ff, 0xff4fc0, 0xf4f8ff] : E >= 6 ? [0xb8b4aa, 0x8a847c] : [0xd8c8a0, 0xb8a47c];
        const k = Math.min(10, 3 + n * 2);
        for (let j = 0; j < k; j++) this.emit(spr.x + (this.rnd() - 0.5) * 22 * n, spr.y - 2 - this.rnd() * 4, cols[j % cols.length], { vx: (this.rnd() - 0.5) * 40, vy: -18 - this.rnd() * 26, g: 90, life: 0.45 + this.rnd() * 0.25, size: 2, a: 0.9 });
        if (!jump && this.rnd() < 0.6) this.emit(spr.x, spr.y - def.ay * 0.6, 0xffd24a, { vx: 0, vy: -34, g: 0, life: 0.9, size: 3, a: 1 });
      },
      update: (p) => {
        if (o.dead) return;
        const e = backOut(p);
        spr.scale.set(1 + (1 - p) * 0.18, Math.max(0.02, e));
        if (light) { light.scale.copyFrom(spr.scale); }
      },
    });
  }

  private removeObj(o: Obj, delay: number): void {
    o.dead = true;
    this.emitters.delete(o);
    if (this.objs.get(o.idx) === o) this.objs.delete(o.idx);
    const kill = () => { o.spr.destroy(); o.light?.destroy(); };
    if (!o.shown || delay < 0) { kill(); return; }
    this.anims.push({ delay, dur: 0.16, t: 0, update: (p) => { o.spr.scale.y = 1 - p; o.spr.alpha = 1 - p * 0.6; if (o.light) { o.light.scale.y = 1 - p; o.light.alpha *= 1 - p; } }, end: kill });
  }

  // ---- particles ------------------------------------------------------------
  private emit(x: number, y: number, color: number, o: { vx: number; vy: number; g: number; life: number; size: number; a: number; grow?: number }): void {
    if (this.parts.length > 1300) return;
    const spr = this.pool.pop() ?? new Sprite(Texture.WHITE);
    spr.anchor.set(0.5); spr.tint = color; spr.width = spr.height = o.size; spr.position.set(x, y); spr.alpha = o.a;
    this.fxL.addChild(spr);
    this.parts.push({ spr, vx: o.vx, vy: o.vy, g: o.g, life: 0, max: o.life, a: o.a, grow: o.grow ?? 0 });
  }

  // ---- camera ---------------------------------------------------------------
  private setCamera(instant: boolean): void {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const i of this.W.order) {
      const t = this.W.tiles[i]!;
      if (t.zone > this.step) continue;
      const px = (t.x - t.y) * TW, py = (t.x + t.y + 1) * TH;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    const E = epochOf(this.step);
    for (const b of this.bodies) if (b.on) { x0 = Math.min(x0, b.x - b.R * 0.9); x1 = Math.max(x1, b.x + b.R * 0.9); y0 = Math.min(y0, b.y - b.R * 0.6); }
    const top = [26, 30, 40, 50, 60, 66, 100, 130, 170, 220, 230, 230, 230, 230][E - 1] * 0.75;
    const pad = 70;
    const vw = this.app.screen.width, vh = this.app.screen.height;
    const availH = Math.max(120, vh - 250), availW = Math.max(160, vw - 40);
    const z = clamp(Math.min(availW / (x1 - x0 + pad * 2), availH / (y1 - y0 + top + pad * 1.4)), 0.16, 3.6);
    this.camTo = { x: (x0 + x1) / 2, y: (y0 + y1 - top) / 2, z };
    if (instant) this.cam = { ...this.camTo };
  }

  // ---- ambient life ---------------------------------------------------------
  private mk(id: string, layer: Container): { spr: Sprite; light: Sprite | null } {
    const d = this.reg.get(id);
    const spr = new Sprite(d.tex); spr.anchor.set(d.ax / d.w, d.ay / d.h); layer.addChild(spr);
    let light: Sprite | null = null;
    if (d.light) { light = new Sprite(d.light); light.anchor.copyFrom(spr.anchor); layer.addChild(light); }
    return { spr, light };
  }
  private setTex(m: Mover, id: string): void {
    const d = this.reg.get(id);
    m.spr.texture = d.tex; m.spr.anchor.set(d.ax / d.w, d.ay / d.h);
    if (m.light && d.light) { m.light.texture = d.light; m.light.anchor.copyFrom(m.spr.anchor); }
  }

  private spawnMovers(E: number): void {
    const key = E * 10 + (E >= 13 ? zoneOf(this.step) : 0);
    if (key === this.moverKey) return;
    this.moverKey = key; this.moverEpoch = E;
    for (const m of this.movers) { m.spr.destroy(); m.light?.destroy(); }
    this.movers = [];
    const r = this.rnd;
    const add = (kind: Mover['kind'], base: string, layer: Container, speed: number, alt = 0) => {
      const first = kind === 'sheep' ? 'sheep:1' : kind === 'veh' ? `${base}:1:0` : base;
      const { spr, light } = this.mk(first, layer);
      const m: Mover = { kind, base, spr, light, x: -1, y: -1, dx: 0, dy: 0, nx: 0, ny: 0, speed, wait: r() * 2, alt, dir: 1 };
      spr.visible = false; if (light) light.visible = false;
      this.movers.push(m);
    };
    const sheep = [4, 9, 8, 4][E - 1] ?? 0;
    for (let i = 0; i < sheep; i++) add('sheep', 'sheep', this.vehL, 0.45);
    const veh = [3, 5, 7, 10, 14, 26, 44, 64, 84, 100, 100, 110, 120, 130][E - 1];
    for (let i = 0; i < veh; i++) {
      const kind = E <= 5 ? 'cart' : E === 6 ? (i % 3 === 0 ? 'tram' : 'cart') : E <= 8 ? (E === 7 && i % 7 === 0 ? 'tram' : 'car') : i % 4 === 0 && E === 9 ? 'car' : 'hover';
      add('veh', `veh:${kind}`, this.vehL, kind === 'cart' ? 0.7 + r() * 0.3 : kind === 'tram' ? 1.4 : kind === 'car' ? 2 + r() : 3 + r() * 1.5);
    }
    const clouds = E <= 5 ? 5 : E <= 7 ? 9 : E === 11 ? 10 : 4;
    for (let i = 0; i < clouds; i++) add('cloud', `cloud:${i % 3}`, this.fxL, 0.25 + r() * 0.2, 70 + r() * 60);
    const fly = [0, 0, 0, 0, 0, 0, 0, 4, 18, 36, 44, 64, 80, 96][E - 1];
    for (let i = 0; i < fly; i++) add('fly', `fly:${E === 8 ? 0 : E >= 11 ? [3, 3, 0, 4, 1][i % 5] : i % 3}`, this.fxL, 3.5 + r() * 4, 46 + r() * (E >= 9 ? 150 : 60));
    // shuttles running between the city and each world that has been reached
    this.bodies.forEach((b, bi) => {
      if (!b.on) return;
      const n = E > b.epoch ? 14 : 3 + zoneOf(this.step) * 3;
      for (let i = 0; i < n; i++) { add('trip', `fly:${i % 3 === 0 ? 1 : 4}`, this.fxL, 240 + r() * 160); this.movers[this.movers.length - 1].dir = bi; }
    });
  }

  private road(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < N && y < N && this.roadSet.has(y * N + x); }

  private moveMovers(dt: number): void {
    const r = this.rnd, E = epochOf(this.step), rad = RING[E - 1];
    for (const m of this.movers) {
      if (m.kind === 'trip') { this.moveTrip(m, dt); continue; }
      if (m.kind === 'veh' || m.kind === 'sheep') {
        const set = m.kind === 'veh' ? this.roadSet : this.freeSet;
        const here = m.ny * N + m.nx;
        if (m.x < 0 || !set.has(here)) { // (re)spawn
          const list = m.kind === 'veh' ? this.plan.roads : this.plan.free;
          if (!list.length) { m.spr.visible = false; if (m.light) m.light.visible = false; continue; }
          const i = list[Math.floor(r() * list.length)];
          m.x = m.nx = i % N; m.y = m.ny = Math.floor(i / N); m.dx = m.dy = 0;
        }
        m.spr.visible = true; if (m.light) m.light.visible = true;
        if (m.wait > 0) m.wait -= dt;
        else {
          const tx = m.nx - m.x, ty = m.ny - m.y, d = Math.hypot(tx, ty), stepLen = m.speed * dt;
          if (d <= stepLen) {
            m.x = m.nx; m.y = m.ny;
            const opts: [number, number][] = [];
            for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
              const ok = m.kind === 'veh' ? this.road(m.x + ax, m.y + ay) : this.freeSet.has((m.y + ay) * N + m.x + ax);
              if (ok && !(ax === -m.dx && ay === -m.dy)) opts.push([ax, ay]);
            }
            let ch: [number, number] | undefined = opts.find(([ax, ay]) => ax === m.dx && ay === m.dy);
            if (!ch || r() < 0.3) ch = opts[Math.floor(r() * opts.length)];
            if (!ch) {
              if (m.kind === 'veh' && (m.dx || m.dy)) ch = [-m.dx, -m.dy]; // dead end: U-turn
              else { ch = [0, 0]; m.wait = 1 + r() * 3; }
            }
            m.dx = ch[0]; m.dy = ch[1];
            if (m.dx || m.dy || m.kind === 'sheep') { m.nx = m.x + m.dx; m.ny = m.y + m.dy; } else { m.nx = -1; m.ny = 0; }
            if (m.kind === 'sheep' && (m.dx || m.dy)) m.wait = r() < 0.6 ? 1 + r() * 4 : 0;
            const dir = m.dx !== 0 ? 1 : m.dy !== 0 ? 2 : m.dir;
            if (dir !== m.dir) { m.dir = dir; this.setTex(m, m.kind === 'sheep' ? `sheep:${dir}` : `${m.base}:${dir}:${Math.floor(hash(this.movers.indexOf(m), 3) * 3)}`); }
          } else { m.x += (tx / d) * stepLen; m.y += (ty / d) * stepLen; }
        }
        const lane = m.kind === 'veh' ? 0.2 : 0;
        const fx = m.x - m.dy * lane, fy = m.y + m.dx * lane;
        m.spr.position.set((fx - fy) * TW, (fx + fy + 1) * TH);
        m.spr.tint = rgb(this.amb[0], this.amb[1], this.amb[2]);
      } else {
        if (m.x < 0 || Math.hypot(m.x - CX, m.y - CY) > rad + 9) {
          const first = m.x < 0, rr = rad + 7;
          if (m.kind === 'cloud') { // drift towards screen-right
            m.dx = 0.7; m.dy = -0.7;
            const k = (r() - 0.5) * 2 * rad * 0.7, back = first ? (r() - 0.5) * 2 * rad * 0.7 : rr * 0.95;
            m.x = CX - 0.7 * back + 0.7 * k; m.y = CY + 0.7 * back + 0.7 * k;
          } else {
            const ax = r() < 0.5, s = r() < 0.5 ? 1 : -1;
            m.dx = ax ? s : 0; m.dy = ax ? 0 : s;
            const off = (r() - 0.5) * 2 * rad * 0.8, back = first ? (r() - 0.5) * 2 * rad : rr * 0.95;
            m.x = ax ? CX - s * back : CX + off; m.y = ax ? CY + off : CY - s * back;
            this.setTex(m, m.base);
          }
        }
        m.x += m.dx * m.speed * dt; m.y += m.dy * m.speed * dt;
        const bob = m.kind === 'fly' ? Math.sin(this.time * 3 + m.alt) * 1.5 : 0;
        m.spr.position.set((m.x - m.y) * TW, (m.x + m.y + 1) * TH - m.alt + bob);
        if (m.kind === 'cloud') { m.spr.alpha = 0.82 - this.night * 0.45; }
        else m.spr.tint = rgb(this.amb[0], this.amb[1], this.amb[2]);
      }
      if (m.light) { m.light.position.copyFrom(m.spr.position); m.light.zIndex = m.spr.zIndex + 1; m.light.alpha = Math.max(0.5, this.night); }
    }
  }

  // ---- frame ----------------------------------------------------------------
  private lightAlpha(): number { const g = EPOCH_META[epochOf(Math.max(0, this.step)) - 1].glow ?? 0; return g + (1 - g) * this.night; }

  /** A shuttle on the city <-> Moon / Mars run. Works in screen space, not tile space. */
  private moveTrip(m: Mover, dt: number): void {
    const b = this.bodies[m.dir], r = this.rnd;
    const pickEnd = (toBody: boolean) => {
      if (toBody) { m.nx = b.x + (r() - 0.5) * b.R; m.ny = b.y - b.R * 0.15 + (r() - 0.5) * b.R * 0.3; }
      else { const a = r() * 6.283, rr = r() * RING[9] * 0.7, tx = CX + Math.cos(a) * rr, ty = CY + Math.sin(a) * rr; m.nx = (tx - ty) * TW; m.ny = (tx + ty + 1) * TH - 90 - r() * 120; }
    };
    if (m.x === -1 && m.y === -1) { // first frame: start somewhere along the route
      pickEnd(false); const cx = m.nx, cy = m.ny; pickEnd(true);
      const f = r(); m.x = cx + (m.nx - cx) * f; m.y = cy + (m.ny - cy) * f; m.dx = 1;
      if (r() < 0.5) { m.dx = 0; m.nx = cx; m.ny = cy; }
    }
    if (m.wait > 0) { m.wait -= dt; m.spr.visible = false; if (m.light) m.light.visible = false; return; }
    const tx = m.nx - m.x, ty = m.ny - m.y, d = Math.hypot(tx, ty), st = m.speed * dt;
    if (d <= st) { m.x = m.nx; m.y = m.ny; m.dx = m.dx ? 0 : 1; pickEnd(m.dx === 1); m.wait = 0.6 + r() * 2.4; return; }
    m.x += (tx / d) * st; m.y += (ty / d) * st;
    m.spr.visible = true; m.spr.position.set(m.x, m.y);
    if (m.light) { m.light.visible = true; m.light.position.set(m.x, m.y); m.light.alpha = 0.9; }
    if (r() < dt * 16) this.emit(m.x, m.y + 2, r() < 0.5 ? 0xbfefff : 0xffffff, { vx: -(tx / d) * 12, vy: -(ty / d) * 12, g: 0, life: 0.7, size: 2, a: 0.7 });
  }

  /** Show the Moon / Mars once reached and grow a base on each, a few buildings per zone. */
  private updateBodies(E: number, zone: number, instant: boolean): void {
    for (const b of this.bodies) {
      const on = E >= b.epoch;
      if (on !== b.on) {
        b.on = on; b.c.visible = on;
        if (on && !instant) { b.c.alpha = 0; b.c.scale.set(0.7); this.anims.push({ delay: 0.4, dur: 2.2, t: 0, update: (p) => { const e = 1 - Math.pow(1 - p, 3); b.c.alpha = e; b.c.scale.set(0.7 + 0.3 * e); } }); }
        else { b.c.alpha = 1; b.c.scale.set(1); }
      }
      const want = !on ? 0 : E > b.epoch ? 30 : 2 + zone * 5;
      while (b.items.length > want) for (const s of b.items.pop()!) s.destroy();
      while (b.items.length < want) {
        const i = b.items.length;
        const a = hash(i, b.seed, 11) * 6.283, rr = Math.sqrt(hash(i, b.seed, 12));
        const x = Math.round(Math.cos(a) * rr * b.R * 0.62 - b.R * 0.08), y = Math.round(-b.R * 0.12 + Math.sin(a) * rr * b.R * 0.36);
        const { spr, light } = this.mk(`col:${Math.floor(hash(i, b.seed, 13) * 5)}`, b.c);
        const set = light ? [spr, light] : [spr];
        for (const s of set) { s.position.set(x, y); s.zIndex = y * 2 + (s === light ? 1 : 0) + 10000; }
        b.items.push(set);
        if (!instant) this.anims.push({ delay: 0.5 + hash(i, 5) * 1.2, dur: 0.4, t: 0, start: () => {}, update: (p) => { if (!spr.destroyed) for (const s of set) s.scale.set(1 + (1 - p) * 0.2, Math.max(0.02, backOut(p))); } });
        if (!instant) for (const s of set) s.scale.y = 0.02;
      }
    }
  }

  private launch(x: number, y: number): void {
    const d = this.reg.get('rocket:0');
    const spr = new Sprite(d.tex); spr.anchor.set(d.ax / d.w, d.ay / d.h); spr.position.set(x, y);
    this.fxL.addChild(spr);
    this.rockets.push({ spr, vy: 0, t: 0 });
  }

  private tick(dt: number): void {
    if (this.step < 0) return;
    this.time += dt;
    const E = epochOf(this.step), meta = EPOCH_META[E - 1];

    // animations
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      if (a.delay > 0) { a.delay -= dt; if (a.delay > 0) continue; a.start?.(); a.start = undefined; }
      else if (a.start) { a.start(); a.start = undefined; }
      a.t += dt;
      const p = Math.min(1, a.t / a.dur);
      a.update?.(p);
      if (p >= 1) { a.end?.(); this.anims[i] = this.anims[this.anims.length - 1]; this.anims.pop(); }
    }

    // day / night
    const v = 0.5 - 0.5 * Math.cos((this.time / 56) * Math.PI * 2);
    const thr = 1 - meta.night;
    const night = smoothstep(thr - 0.14, thr + 0.14, v);
    const dusk = Math.max(0, 1 - Math.abs(night - 0.4) / 0.4);
    const nc = E === 9 || E === 10 ? [0.6, 0.58, 0.9] : [0.62, 0.66, 0.92];
    const amb = [lerp(1, nc[0], night) + dusk * 0.06, lerp(1, nc[1], night) - dusk * 0.05, lerp(1, nc[2], night) - dusk * 0.12];
    this.night = night; this.amb = amb.map((c) => clamp(c, 0, 1));
    const key = rgb(Math.round(this.amb[0] * 40) / 40, Math.round(this.amb[1] * 40) / 40, Math.round(this.amb[2] * 40) / 40);
    if (key !== this.ambKey) {
      this.ambKey = key;
      for (const i of this.W.order) this.tintTile(i);
      const fogged = rgb(this.amb[0] * 0.75, this.amb[1] * 0.78, this.amb[2] * 0.85);
      for (const c of this.cliffs) c.tint = fogged;
    }
    const la = this.lightAlpha(), lk = Math.round(la * 40);
    if (lk !== this.nightKey) {
      this.nightKey = lk;
      for (const o of this.objs.values()) if (o.light) { o.light.alpha = la; o.light.visible = la > 0.02; }
    }

    // water shimmer
    this.waterT += dt;
    if (this.waterT > 0.42) {
      this.waterT = 0; this.waterF++;
      for (const i of this.water) if (this.gId[i].startsWith('water')) this.gSpr[i]!.texture = this.reg.get(`water:${(this.waterF + i) & 3}`).tex;
    }

    // smoke + sparks
    const rate = Math.min(1, 140 / Math.max(1, this.emitters.size));
    for (const o of this.emitters) {
      if (this.fog[o.idx] > 0.5) continue;
      for (const e of o.def.emitters) {
        const x = o.spr.x + e.x, y = o.spr.y + e.y;
        if (e.kind === 'launch') { if (o.shown && this.rockets.length < 5 && this.rnd() < dt * 0.07) this.launch(x, y); continue; }
        if (this.rnd() > dt * 1.5 * rate) continue;
        if (e.kind === 'mist') { this.emit(x + (this.rnd() - 0.5) * 8, y, 0xffffff, { vx: (this.rnd() - 0.5) * 8, vy: -5 - this.rnd() * 5, g: 0, life: 1 + this.rnd(), size: 2, a: 0.55, grow: 2 }); continue; }
        if (e.kind === 'smoke') {
          const g = E === 6 ? 0.45 : 0.8;
          this.emit(x, y, rgb(g * this.amb[0], g * this.amb[1], g * this.amb[2]), { vx: 3 + this.rnd() * 4, vy: -9 - this.rnd() * 5, g: 0, life: 1.6 + this.rnd(), size: 2, a: 0.5, grow: 2.2 });
        } else this.emit(x + (this.rnd() - 0.5) * 6, y, E >= 11 ? 0xbfffe0 : E >= 9 ? [0x35e0ff, 0xff4fc0][Math.floor(this.rnd() * 2)] : 0xffc94a, { vx: (this.rnd() - 0.5) * 14, vy: -22 - this.rnd() * 14, g: 0, life: 0.8, size: 1, a: 1 });
      }
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life += dt;
      if (p.life >= p.max) { this.fxL.removeChild(p.spr); this.pool.push(p.spr); this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop(); continue; }
      p.vy += p.g * dt; p.spr.x += p.vx * dt; p.spr.y += p.vy * dt;
      const k = p.life / p.max;
      p.spr.alpha = p.a * (1 - k * k);
      if (p.grow) p.spr.width = p.spr.height = 2 + p.grow * k;
    }

    this.moveMovers(dt);

    // rockets: a short ignition, then they climb out of sight
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const k = this.rockets[i], s = k.spr;
      k.t += dt;
      if (k.t > 0.9) { k.vy -= (120 + k.t * 90) * dt; s.y += k.vy * dt; }
      else s.x += (this.rnd() - 0.5) * 0.6;
      for (let j = 0; j < 2; j++) this.emit(s.x + (this.rnd() - 0.5) * 4, s.y + 2, [0xfff2b0, 0xffb03a, 0xff6a2a][Math.floor(this.rnd() * 3)], { vx: (this.rnd() - 0.5) * 26, vy: 40 + this.rnd() * 50, g: 0, life: 0.35 + this.rnd() * 0.3, size: 3, a: 1 });
      if (this.rnd() < dt * 22) this.emit(s.x, s.y + 6, 0xdfe4ea, { vx: (this.rnd() - 0.5) * 16, vy: 8, g: 0, life: 2 + this.rnd(), size: 3, a: 0.5, grow: 6 });
      if (k.vy < -900 || k.t > 9) { s.destroy(); this.rockets.splice(i, 1); }
    }

    // epoch ripple
    this.ringL.clear();
    if (this.ripple) {
      const rp = this.ripple;
      rp.t += dt;
      const d = (rp.t / 1.5) * (rp.max - 3);
      if (d > rp.max) this.ripple = null;
      else for (let k = 0; k < 3; k++) {
        const dd = d - k * 1.3;
        if (dd <= 0) continue;
        this.ringL.ellipse(0, (CX + CY) * TH, dd * 22.6, dd * 11.3).stroke({ width: 2.5 - k * 0.7, color: k === 0 ? 0xffffff : rp.color, alpha: (1 - d / rp.max) * (0.85 - k * 0.25) });
      }
    }

    // camera
    const k = 1 - Math.exp(-dt * 2.4);
    this.cam.x = lerp(this.cam.x, this.camTo.x, k); this.cam.y = lerp(this.cam.y, this.camTo.y, k);
    this.cam.z = Math.exp(lerp(Math.log(this.cam.z), Math.log(this.camTo.z), k));
    const vw = this.app.screen.width, vh = this.app.screen.height;
    this.world.scale.set(this.cam.z);
    this.world.position.set(Math.round(vw / 2 - this.cam.x * this.cam.z), Math.round((vh - 90) / 2 - this.cam.y * this.cam.z));
  }

  resize(): void { if (this.step >= 0) this.setCamera(false); }
}
