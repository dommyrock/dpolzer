import { Game } from './game';
import { EPOCH_META, ROMAN, coinsAt, incomeAt, jumpCost, popAt, fmt } from './meta';
import { EPOCHS, ZONES } from './world';
import css from './ui.css?inline';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

const TEMPLATE = `
<div class="root">
  <div class="stars"></div>
  <div class="stage"></div>
  <div class="vignette"></div>
  <div class="hud tl">
    <div class="eyebrow"></div>
    <div class="name"></div>
    <div class="tag"></div>
  </div>
  <div class="hud tr">
    <div class="pill"><i class="coin"></i><b class="coins">0</b><span>coins</span><em class="gain"></em></div>
    <div class="pill"><i class="pop"></i><b class="people">0</b><span>citizens</span></div>
  </div>
  <div class="card"><small></small><strong></strong></div>
  <div class="loading">Growing the forest…</div>
  <div class="panel">
    <div class="row play-row">
      <button class="play" title="Play / pause (space)" aria-label="Play"><i></i></button>
      <div class="track">
        <div class="cells">${'<i></i>'.repeat(ZONES)}</div>
        <input type="range" min="1" max="${ZONES}" step="1" value="1" aria-label="Zone" />
      </div>
      <button class="jump" tabindex="-1"><span class="jl"></span><small></small><i>▶</i></button>
    </div>
    <div class="row peak-row">
      <div class="peak"><strong>Civilization peak reached</strong><span></span></div>
      <button class="again">Start over</button>
    </div>
    <div class="meta"><span class="zl"></span><div class="dots"></div><span class="keys"><kbd>←</kbd><kbd>→</kbd></span></div>
  </div>
</div>`;

export class GameLoop2dOrtho extends HTMLElement {
  private game: Game | null = null;
  private epoch = 1; private zone = 1;
  private playing = false; private timer = 0; private peakTimer = 0;
  private shown = { coins: 0, pop: 0 }; private raf = 0;
  private target = { coins: 0, pop: 0, income: 0, cap: 0 }; private last = 0;
  private ro?: ResizeObserver; private io?: IntersectionObserver;
  private $!: <T extends HTMLElement>(s: string) => T;

  connectedCallback(): void {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${css}</style>${TEMPLATE}`;
    this.$ = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this.$('.dots').innerHTML = Array.from({ length: EPOCHS }, () => '<i></i>').join('');

    const input = this.$<HTMLInputElement>('input');
    input.addEventListener('input', () => { this.stop(); this.go(this.epoch, +input.value); });
    this.$('.jump').addEventListener('click', () => { if (this.canJump()) this.go(this.epoch + 1, 1); });
    this.$('.play').addEventListener('click', () => (this.playing ? this.stop() : this.play()));
    this.$('.again').addEventListener('click', () => { this.stop(); this.go(1, 1); });
    window.addEventListener('keydown', this.onKey);

    const seed = parseInt(this.getAttribute('seed') ?? '', 10) || 20261114;
    const game = new Game();
    this.game = game;
    game.init(this.$('.stage'), seed).then(() => {
      game.onBuilt = (n) => this.gain(n);
      this.$('.loading').remove();
      this.go(1, 1, true);
      this.ro = new ResizeObserver(() => game.resize());
      this.ro.observe(this);
      // stop rendering while scrolled out of view
      this.io = new IntersectionObserver(([en]) => (en.isIntersecting ? game.app.ticker.start() : game.app.ticker.stop()));
      this.io.observe(this);
      if (this.hasAttribute('autoplay')) this.play();
    });
  }

  /** Arrow keys step through zones from anywhere on the page (except while typing in a form field). */
  private onKey = (e: KeyboardEvent): void => {
    const t = e.composedPath()[0] as HTMLElement | undefined;
    const own = !!t && this.shadowRoot!.contains(t);
    if (e.metaKey || e.ctrlKey || e.altKey || !this.game) return;
    if (!own && t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key === 'ArrowRight') { this.stop(); this.advance(); }
    else if (e.key === 'ArrowLeft') { this.stop(); if (this.zone > 1) this.go(this.epoch, this.zone - 1); }
    else if (e.key === ' ' && own && t!.tagName !== 'BUTTON') this.playing ? this.stop() : this.play(); // only when the game has focus, so Space still scrolls the page
    else return;
    e.preventDefault();
  };

  disconnectedCallback(): void {
    window.removeEventListener('keydown', this.onKey);
    this.stop(); this.ro?.disconnect(); this.io?.disconnect(); cancelAnimationFrame(this.raf);
    this.game?.destroy(); this.game = null;
  }

  private canJump(): boolean { return this.zone === ZONES && this.epoch < EPOCHS; }
  private advance(): void {
    if (this.zone < ZONES) this.go(this.epoch, this.zone + 1);
    else if (this.epoch < EPOCHS) this.go(this.epoch + 1, 1);
  }

  private go(epoch: number, zone: number, first = false): void {
    const jumped = epoch !== this.epoch || first;
    this.epoch = epoch; this.zone = zone;
    const step = (epoch - 1) * ZONES + zone - 1;
    this.game?.setStep(step);
    const m = EPOCH_META[epoch - 1], root = this.$('.root');
    root.style.setProperty('--acc', hex(m.accent));
    root.style.setProperty('--fill', `${((zone - 1) / (ZONES - 1)) * 100}%`);
    root.dataset.era = epoch >= 12 ? 'space' : epoch === 11 ? 'nature' : epoch >= 9 ? 'neon' : epoch >= 6 ? 'city' : 'nature';
    this.$('.eyebrow').textContent = `Epoch ${ROMAN[epoch - 1]} of ${ROMAN[EPOCHS - 1]}  ·  Zone ${zone} / ${ZONES}`;
    this.$('.name').textContent = m.name;
    this.$('.tag').textContent = m.tag;
    this.$<HTMLInputElement>('input').value = String(zone);
    this.$('.cells').querySelectorAll('i').forEach((c, i) => { c.classList.toggle('on', i < zone); c.classList.toggle('cur', i === zone - 1); });
    this.$('.zl').textContent = `Zone ${zone}/${ZONES}`;
    this.$('.dots').querySelectorAll('i').forEach((d, i) => { d.classList.toggle('done', i < epoch - 1); d.classList.toggle('cur', i === epoch - 1); });
    // jump button
    const jump = this.$('.jump');
    jump.classList.toggle('show', this.canJump());
    jump.tabIndex = this.canJump() ? 0 : -1;
    if (epoch < EPOCHS) { this.$('.jl').textContent = `Jump to Epoch ${ROMAN[epoch]}`; jump.querySelector('small')!.textContent = `${EPOCH_META[epoch].name} · spend ${fmt(jumpCost(epoch))}`; }
    // peak
    clearTimeout(this.peakTimer);
    const peak = epoch === EPOCHS && zone === ZONES;
    if (peak) {
      this.$('.peak span').textContent = `${EPOCHS} epochs · ${EPOCHS * ZONES} zones · ${fmt(popAt(step))} citizens`;
      this.peakTimer = window.setTimeout(() => root.classList.add('peaked'), first ? 0 : 1900);
    } else root.classList.remove('peaked');
    if (jumped) this.card(epoch);
    if (jumped && !first && epoch > 1) this.note(`−${fmt(jumpCost(epoch - 1))} spent`, true);
    this.count(coinsAt(epoch, zone), popAt(step), incomeAt(epoch, zone), zone < ZONES ? coinsAt(epoch, zone + 1) * 0.9 : coinsAt(epoch, zone), first);
    if (this.playing) this.schedule();
  }

  private card(epoch: number): void {
    const c = this.$('.card');
    c.querySelector('small')!.textContent = `Epoch ${ROMAN[epoch - 1]}`;
    c.querySelector('strong')!.textContent = EPOCH_META[epoch - 1].name;
    c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
  }

  private gain(n: number): void { if (n > 0 && !this.$('.gain').classList.contains('spend')) this.note(`+${n} built`, false); }

  private note(text: string, spend: boolean): void {
    const g = this.$('.gain');
    g.textContent = text;
    g.classList.toggle('spend', spend);
    g.classList.remove('show'); void g.offsetWidth; g.classList.add('show');
    if (spend) setTimeout(() => g.classList.remove('spend'), 1700);
  }

  /** Ease the counters to their new values, then let the treasury trickle up while the player waits. */
  private count(coins: number, pop: number, income: number, cap: number, instant: boolean): void {
    this.target = { coins, pop, income, cap };
    if (instant) this.shown = { coins, pop };
    const pill = this.$('.pill');
    pill.classList.remove('bump'); void pill.offsetWidth; if (!instant) pill.classList.add('bump');
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    const f = (now: number) => {
      const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
      const t = this.target, k = 1 - Math.exp(-dt * 4.5);
      t.coins = Math.min(Math.max(t.coins, t.cap), t.coins + t.income * dt);
      this.shown.coins += (t.coins - this.shown.coins) * k;
      this.shown.pop += (t.pop - this.shown.pop) * k;
      this.$('.coins').textContent = fmt(Math.abs(this.shown.coins - t.coins) < 0.6 ? t.coins : this.shown.coins);
      this.$('.people').textContent = fmt(this.shown.pop);
      this.raf = requestAnimationFrame(f);
    };
    this.raf = requestAnimationFrame(f);
  }

  // ---- autoplay ---------------------------------------------------------------
  private play(): void {
    if (this.epoch === EPOCHS && this.zone === ZONES) this.go(1, 1);
    this.playing = true; this.$('.play').classList.add('on'); this.schedule();
  }
  private stop(): void { this.playing = false; clearTimeout(this.timer); this.shadowRoot && this.$('.play').classList.remove('on'); }
  private schedule(): void {
    clearTimeout(this.timer);
    if (this.epoch === EPOCHS && this.zone === ZONES) { this.stop(); return; }
    this.timer = window.setTimeout(() => this.advance(), this.zone === ZONES ? 3000 : this.zone === 1 ? 3200 : 2300);
  }
}

if (!customElements.get('game-loop-2d-ortho')) customElements.define('game-loop-2d-ortho', GameLoop2dOrtho);
