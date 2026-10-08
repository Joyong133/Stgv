'use strict';
// ───────────────────────── 공용 도구: 수학 · 저장 · 사운드 ─────────────────────────

const W = 1280, H = 720;              // 설계 해상도 (가로 모드)
const TAU = Math.PI * 2;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const easeOut = t => 1 - (1 - t) * (1 - t);
const easeIn = t => t * t;
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeBack = t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);   // t 가 [a,b] 구간에서 0→1

function fmt(n) {
  n = Math.floor(n);
  if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e5) return Math.floor(n / 1e3) + 'K';
  return n.toLocaleString('ko-KR');
}

// 색 섞기 (#rrggbb)
function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgb2hex(r, g, b) { return '#' + ((1 << 24) | (clamp(r | 0, 0, 255) << 16) | (clamp(g | 0, 0, 255) << 8) | clamp(b | 0, 0, 255)).toString(16).slice(1); }
function mix(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)); }
const shade = (c, t) => (t < 0 ? mix(c, '#000000', -t) : mix(c, '#ffffff', t));
function rgba(h, a) { const c = hex2rgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

// ───────────────────────── 저장 ─────────────────────────
// 안드로이드 앱에서는 SharedPreferences(네이티브)에, 브라우저에서는 localStorage 에 저장한다.
// 두 곳 모두에 쓰고, 읽을 때는 더 최근(저장 시각 기준) 것을 쓴다.
const Store = {
  KEY: 'guardian_defense_save_v1',
  bridge: (typeof window !== 'undefined' && window.AndroidBridge) || null,
  read() {
    let a = null, b = null;
    try { if (this.bridge) a = JSON.parse(this.bridge.load(this.KEY) || 'null'); } catch (e) { a = null; }
    try { b = JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch (e) { b = null; }
    if (a && b) return (a.savedAt || 0) >= (b.savedAt || 0) ? a : b;
    return a || b;
  },
  write(obj) {
    obj.savedAt = Date.now();
    const s = JSON.stringify(obj);
    try { if (this.bridge) this.bridge.save(this.KEY, s); } catch (e) { /* 무시 */ }
    try { localStorage.setItem(this.KEY, s); } catch (e) { /* 무시 */ }
  },
  clear() {
    try { if (this.bridge) this.bridge.save(this.KEY, ''); } catch (e) { /* 무시 */ }
    try { localStorage.removeItem(this.KEY); } catch (e) { /* 무시 */ }
  },
};

// ───────────────────────── 사운드 (WebAudio 합성) ─────────────────────────
const Sound = {
  ctx: null, master: null, sfxGain: null, bgmGain: null, noiseBuf: null,
  sfxOn: true, bgmOn: true, bgmTimer: null, bgmName: null, step: 0, lastPlay: {},

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.55; this.sfxGain.connect(this.master);
    this.bgmGain = this.ctx.createGain(); this.bgmGain.gain.value = 0.22; this.bgmGain.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.bgmName) this.playBgm(this.bgmName, true);
  },

  tone(freq, dur, type = 'sine', vol = 0.3, slide = 0, delay = 0, dest) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  },

  noise(dur, freq = 1200, q = 1, vol = 0.3, sweep = 1, delay = 0, type = 'bandpass') {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxGain);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  },

  // 같은 소리가 한 프레임에 수십 번 겹치지 않도록 최소 간격을 둔다
  play(name) {
    if (!this.ctx || !this.sfxOn) return;
    const now = performance.now();
    const gap = { hit: 45, arrow: 40, slash: 50, coin: 60, magic: 60, die: 50 }[name] || 25;
    if (now - (this.lastPlay[name] || 0) < gap) return;
    this.lastPlay[name] = now;
    switch (name) {
      case 'click': this.tone(880, 0.06, 'triangle', 0.18, 1.4); break;
      case 'tap': this.tone(620, 0.05, 'sine', 0.15, 1.2); break;
      case 'slash': this.noise(0.16, 2600, 1.2, 0.35, 0.35); this.tone(300, 0.08, 'sawtooth', 0.05, 0.5); break;
      case 'heavy': this.noise(0.25, 600, 0.8, 0.5, 0.3); this.tone(110, 0.25, 'square', 0.12, 0.5); break;
      case 'arrow': this.noise(0.12, 3800, 2, 0.18, 0.5); break;
      case 'magic': this.tone(660, 0.18, 'sine', 0.12, 1.8); this.tone(990, 0.14, 'triangle', 0.06, 1.5, 0.03); break;
      case 'fire': this.noise(0.35, 500, 0.6, 0.45, 0.4); this.tone(90, 0.3, 'sawtooth', 0.08, 0.6); break;
      case 'ice': this.tone(1760, 0.2, 'triangle', 0.1, 0.7); this.tone(2350, 0.25, 'sine', 0.07, 0.8, 0.05); break;
      case 'wind': this.noise(0.4, 900, 3, 0.25, 2.5); break;
      case 'holy': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.08, 1, i * 0.04)); break;
      case 'dark': this.tone(160, 0.45, 'sawtooth', 0.09, 0.5); this.noise(0.4, 300, 2, 0.2, 0.6); break;
      case 'hit': this.noise(0.06, 1500, 1, 0.22, 0.6); break;
      case 'crit': this.noise(0.1, 2200, 1, 0.35, 0.4); this.tone(1200, 0.08, 'square', 0.06, 0.6); break;
      case 'die': this.tone(260, 0.16, 'square', 0.05, 0.4); this.noise(0.12, 900, 1, 0.12, 0.5); break;
      case 'boom': this.noise(0.6, 300, 0.7, 0.6, 0.25); this.tone(70, 0.5, 'sine', 0.35, 0.5); break;
      case 'thunder': this.noise(0.5, 1800, 0.5, 0.5, 0.2); this.tone(60, 0.5, 'sawtooth', 0.15, 0.6); break;
      case 'coin': this.tone(1320, 0.07, 'square', 0.05); this.tone(1760, 0.12, 'square', 0.05, 1, 0.06); break;
      case 'deploy': this.tone(392, 0.12, 'triangle', 0.15); this.tone(587, 0.18, 'triangle', 0.15, 1, 0.08); this.noise(0.2, 400, 1, 0.2, 0.5); break;
      case 'upgrade': [523, 659, 784].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.12, 1, i * 0.07)); break;
      case 'skill': this.tone(330, 0.5, 'sawtooth', 0.06, 3); this.tone(660, 0.4, 'sine', 0.12, 2, 0.05); this.noise(0.4, 2000, 1, 0.15, 3); break;
      case 'castle': this.tone(180, 0.3, 'square', 0.12, 0.6); this.noise(0.2, 400, 1, 0.3, 0.4); break;
      case 'wave': [392, 392, 523].forEach((f, i) => this.tone(f, 0.22, 'square', 0.07, 1, i * 0.16)); break;
      case 'boss': [110, 104, 98].forEach((f, i) => this.tone(f, 0.6, 'sawtooth', 0.14, 1, i * 0.35)); this.tone(55, 1.4, 'sine', 0.3); break;
      case 'clear': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.12, 1, i * 0.09)); break;
      case 'victory': [523, 523, 523, 659, 587, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 'square', 0.07, 1, [0, .12, .24, .36, .6, .72, .84, 1.1][i])); break;
      case 'defeat': [392, 370, 349, 262].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.12, 1, i * 0.32)); break;
      case 'summon': this.tone(220, 1.2, 'sawtooth', 0.05, 4); this.noise(1.2, 600, 1, 0.2, 6); break;
      case 'star': this.tone(1568, 0.3, 'triangle', 0.1); this.tone(2093, 0.4, 'sine', 0.08, 1, 0.08); break;
      case 'legend': [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone(f, 0.6, 'triangle', 0.1, 1, i * 0.07)); break;
      case 'error': this.tone(200, 0.15, 'square', 0.08, 0.8); break;
    }
  },

  // 간단한 루프 배경음: 코드 진행 + 베이스 + 아르페지오
  BGMS: {
    lobby: { bpm: 92, wave: 'triangle', prog: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]], lead: [76, 74, 72, 71, 72, 74, 76, 79] },
    battle: { bpm: 132, wave: 'square', prog: [[50, 53, 57], [48, 52, 55], [46, 50, 53], [45, 49, 52]], lead: [74, 72, 69, 72, 74, 77, 76, 72] },
    boss: { bpm: 148, wave: 'sawtooth', prog: [[45, 48, 52], [46, 49, 53], [45, 48, 52], [44, 47, 51]], lead: [69, 70, 69, 67, 69, 72, 70, 69] },
  },
  playBgm(name, force) {
    if (this.bgmName === name && !force && this.bgmTimer) return;
    this.bgmName = name;
    if (this.bgmTimer) { clearInterval(this.bgmTimer); this.bgmTimer = null; }
    if (!this.ctx || !name) return;
    const b = this.BGMS[name]; if (!b) return;
    this.step = 0;
    const stepDur = 60 / b.bpm / 2;
    const midi = m => 440 * Math.pow(2, (m - 69) / 12);
    this.bgmTimer = setInterval(() => {
      if (!this.bgmOn || !this.ctx || this.ctx.state !== 'running') { this.step++; return; }
      const s = this.step++, bar = Math.floor(s / 8) % b.prog.length, chord = b.prog[bar], i = s % 8;
      if (i === 0) chord.forEach(n => this.tone(midi(n), stepDur * 7.5, 'sine', 0.05, 1, 0, this.bgmGain));
      if (i % 2 === 0) this.tone(midi(chord[0] - 12), stepDur * 1.6, b.wave === 'sawtooth' ? 'sawtooth' : 'triangle', 0.12, 1, 0, this.bgmGain);
      this.tone(midi(chord[i % 3] + 12), stepDur * 0.9, b.wave, 0.025, 1, 0, this.bgmGain);
      if ((s >> 3) % 2 === 1 && i % 2 === 0) this.tone(midi(b.lead[(i + bar * 2) % 8]), stepDur * 1.8, 'triangle', 0.05, 1, 0, this.bgmGain);
      if (name !== 'lobby' && i % 4 === 2) this.noise(0.05, 7000, 1, 0.04, 1, 0, 'highpass');
    }, stepDur * 1000);
  },
};

// DOM 도우미
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
