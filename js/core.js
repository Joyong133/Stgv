'use strict';
// ───────────────────────── 기본 설정 ─────────────────────────
const W = 640, H = 480;      // 논리 해상도
const PX = 2;                // 도트 1픽셀 = 논리 2픽셀
const TS = 32;               // 타일 크기 (논리 픽셀)
const VIEW_W = W / TS, VIEW_H = H / TS;
const FONT = '"Jua", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let frameCount = 0;

function resize() {
  const app = document.getElementById('app');
  const touch = document.body.classList.contains('touch');
  const padH = touch ? 150 : 34;
  const availW = Math.max(200, app.clientWidth - 32);
  const availH = Math.max(150, app.clientHeight - 24 - padH);
  let cw = Math.min(availW, availH * 4 / 3);
  cw = Math.floor(cw);
  const ch = Math.floor(cw * 3 / 4);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  const k = canvas.width / W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);

// ───────────────────────── 유틸 ─────────────────────────
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const randf = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const chance = p => Math.random() < p;
const DIRS = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
const fmt = n => Math.floor(n).toLocaleString('ko-KR');
// 받침에 맞는 조사 붙이기: josa('단풍이', '은/는') → '단풍이는'
function josa(word, pair) {
  const [a, b] = pair.split('/');
  const c = String(word).charCodeAt(String(word).length - 1);
  if (!(c >= 0xac00 && c <= 0xd7a3)) return word + (pair === '으로/로' ? '(으)로' : `${a}(${b})`);
  const jong = (c - 0xac00) % 28;
  if (pair === '으로/로') return word + (jong === 0 || jong === 8 ? '로' : '으로');
  return word + (jong ? a : b);
}

// 프레임 단위 타이머 → async 스크립트에서 await wait(n)
const Timers = [];
function wait(frames) { return new Promise(res => Timers.push({ t: Math.max(1, Math.round(frames)), res })); }
function tickTimers() {
  for (let i = Timers.length - 1; i >= 0; i--) {
    if (--Timers[i].t <= 0) { const r = Timers[i].res; Timers.splice(i, 1); r(); }
  }
}

// ───────────────────────── 입력 ─────────────────────────
const Input = {
  held: {}, pressed: {}, holdTime: {}, runToggle: false,
  codes: {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    KeyZ: 'ok', Space: 'ok', Enter: 'ok', NumpadEnter: 'ok',
    KeyX: 'cancel', Escape: 'cancel', Backspace: 'cancel',
    ShiftLeft: 'run', ShiftRight: 'run', KeyM: 'sound'
  },
  down(k) {
    if (!this.held[k]) { this.pressed[k] = true; this.holdTime[k] = 0; }
    this.held[k] = true;
    Sound.init();
    if (k === 'sound') Sound.toggle();
  },
  up(k) { this.held[k] = false; },
  // 메뉴용: 처음 한 번 + 길게 누르면 반복
  rep(k) {
    if (this.pressed[k]) return true;
    const t = this.holdTime[k] || 0;
    return this.held[k] && t > 16 && t % 5 === 0;
  },
  isRun() { return !!this.held.run !== this.runToggle; },
  endFrame() {
    for (const k in this.held) if (this.held[k]) this.holdTime[k] = (this.holdTime[k] || 0) + 1;
    this.pressed = {};
  },
  dir() {
    // 가장 최근에 누른 방향 우선
    let best = null, bt = 1e9;
    for (const d of ['up', 'down', 'left', 'right']) {
      if (this.held[d] && this.holdTime[d] < bt) { bt = this.holdTime[d]; best = d; }
    }
    return best;
  }
};
window.addEventListener('keydown', e => {
  if (document.activeElement && document.activeElement.id === 'nameInput') return;
  const k = Input.codes[e.code];
  if (!k) return;
  e.preventDefault();
  if (!e.repeat) Input.down(k);
});
window.addEventListener('keyup', e => {
  const k = Input.codes[e.code];
  if (k) Input.up(k);
});
window.addEventListener('blur', () => { Input.held = {}; });

function setupTouch() {
  const mark = () => { if (!document.body.classList.contains('touch')) { document.body.classList.add('touch'); resize(); } };
  window.addEventListener('touchstart', mark, { passive: true, once: true });
  if (matchMedia('(pointer: coarse)').matches) mark();
  document.querySelectorAll('#pad [data-key]').forEach(btn => {
    const k = btn.dataset.key;
    if (k === 'sound' || k === 'run') {
      btn.addEventListener('click', () => {
        Sound.init();
        if (k === 'sound') { Sound.toggle(); btn.classList.toggle('on', !Sound.muted); }
        else { Input.runToggle = !Input.runToggle; btn.classList.toggle('on', Input.runToggle); }
      });
      return;
    }
    const press = e => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); btn.classList.add('on'); Input.down(k); };
    const release = e => { e.preventDefault(); btn.classList.remove('on'); Input.up(k); };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
    btn.addEventListener('contextmenu', e => e.preventDefault());
  });
  // 캔버스를 탭하면 확인 버튼처럼 동작 (제목 화면 등)
  canvas.addEventListener('pointerdown', () => { Sound.init(); if (Game.scene === 'title' || Game.scene === 'ending') Input.down('ok'); });
  canvas.addEventListener('pointerup', () => Input.up('ok'));
}

// ───────────────────────── 사운드 (WebAudio로 직접 합성) ─────────────────────────
const NOTE = (() => {
  const names = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  return s => {
    const m = /^([A-G])([#b]?)(\d)$/.exec(s);
    if (!m) return 0;
    let n = names[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (parseInt(m[3]) - 4) * 12;
    return 440 * Math.pow(2, n / 12);
  };
})();

const Sound = {
  ac: null, master: null, muted: false, song: null, songName: null, timer: null,
  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    try {
      this.ac = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ac.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ac.destination);
      if (this.songName) { const n = this.songName; this.songName = null; this.bgm(n); }
    } catch (e) { this.ac = null; }
  },
  toggle() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    try { localStorage.setItem('maple_rpg_mute', this.muted ? '1' : '0'); } catch (e) { /* 저장 불가 */ }
  },
  tone(freq, dur, type = 'square', vol = 0.12, when = 0, slide = 0) {
    if (!this.ac || !freq) return;
    const t = this.ac.currentTime + when;
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.15, when = 0, hp = 800) {
    if (!this.ac) return;
    const t = this.ac.currentTime + when;
    const len = Math.floor(this.ac.sampleRate * dur);
    const buf = this.ac.createBuffer(1, len, this.ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ac.createBufferSource(); src.buffer = buf;
    const f = this.ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = this.ac.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },
  sfx(name) {
    if (!this.ac) return;
    switch (name) {
      case 'cursor': this.tone(880, 0.05, 'square', 0.05); break;
      case 'ok': this.tone(660, 0.06, 'square', 0.07); this.tone(990, 0.08, 'square', 0.07, 0.05); break;
      case 'cancel': this.tone(440, 0.08, 'square', 0.06); this.tone(330, 0.08, 'square', 0.06, 0.05); break;
      case 'buzz': this.tone(140, 0.15, 'sawtooth', 0.08); break;
      case 'hit': this.noise(0.12, 0.25, 0, 1200); this.tone(220, 0.1, 'square', 0.08, 0, -120); break;
      case 'crit': this.noise(0.18, 0.3, 0, 900); this.tone(520, 0.15, 'sawtooth', 0.1, 0, -300); break;
      case 'magic': this.tone(660, 0.25, 'triangle', 0.12, 0, 600); this.tone(990, 0.25, 'sine', 0.08, 0.05, 400); break;
      case 'hurt': this.tone(180, 0.18, 'sawtooth', 0.1, 0, -90); this.noise(0.1, 0.15); break;
      case 'miss': this.tone(500, 0.1, 'sine', 0.06, 0, -200); break;
      case 'heal': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.09, i * 0.06)); break;
      case 'coin': this.tone(988, 0.06, 'square', 0.06); this.tone(1319, 0.14, 'square', 0.06, 0.06); break;
      case 'portal': this.tone(300, 0.35, 'sine', 0.12, 0, 900); this.tone(450, 0.35, 'triangle', 0.06, 0.05, 900); break;
      case 'levelup': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.18, 'square', 0.07, i * 0.08)); break;
      case 'encounter': [880, 660, 880, 660, 1320].forEach((f, i) => this.tone(f, 0.07, 'square', 0.07, i * 0.05)); break;
      case 'win': [784, 784, 784, 1047].forEach((f, i) => this.tone(f, i === 3 ? 0.4 : 0.1, 'square', 0.08, i * 0.12)); break;
      case 'die': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.1, i * 0.18)); break;
      case 'quest': [659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.1, i * 0.1)); break;
      case 'buff': this.tone(400, 0.3, 'sine', 0.1, 0, 800); this.tone(600, 0.3, 'sine', 0.06, 0.1, 800); break;
      case 'boom': this.noise(0.5, 0.35, 0, 200); this.tone(90, 0.5, 'sawtooth', 0.12, 0, -50); break;
    }
  },
  // 배경음: 직접 만든 짧은 루프. 'A4-2' = 라4를 8분음표 2개 길이로, 'r-1' = 쉼표
  bgm(name) {
    if (this.songName === name) return;
    this.stopBgm();
    this.songName = name;
    const song = SONGS[name];
    if (!song || !this.ac) return;
    const parse = s => s.trim().split(/\s+/).map(tok => { const [n, l] = tok.split('-'); return [n === 'r' ? 0 : NOTE(n), parseFloat(l || '1')]; });
    const tracks = song.tracks.map(tr => ({ notes: parse(tr.n), type: tr.type, vol: tr.vol, i: 0, next: 0 }));
    const step = 60 / song.bpm / 2; // 8분음표 길이(초)
    const start = this.ac.currentTime + 0.1;
    tracks.forEach(t => { t.next = start; });
    const self = this;
    this.timer = setInterval(() => {
      if (!self.ac) return;
      const horizon = self.ac.currentTime + 0.3;
      for (const t of tracks) {
        while (t.next < horizon) {
          const [f, l] = t.notes[t.i];
          if (f) self.tone(f, l * step * 0.92, t.type, t.vol, t.next - self.ac.currentTime);
          t.next += l * step;
          t.i = (t.i + 1) % t.notes.length;
        }
      }
    }, 60);
  },
  stopBgm() { if (this.timer) clearInterval(this.timer); this.timer = null; this.songName = null; }
};
try { Sound.muted = localStorage.getItem('maple_rpg_mute') === '1'; } catch (e) { /* 무시 */ }

// 모두 이 게임을 위해 새로 쓴 짧은 곡들
const SONGS = {
  title: { bpm: 96, tracks: [
    { type: 'triangle', vol: 0.09, n: 'E5-2 G5-2 C6-3 B5-1 A5-2 G5-2 E5-4 F5-2 A5-2 D6-3 C6-1 B5-2 G5-2 A5-4 G5-2 E5-2 C5-2 E5-2 F5-2 E5-2 D5-4 E5-2 G5-2 C6-2 D6-2 C6-8' },
    { type: 'sine', vol: 0.1, n: 'C3-4 G3-4 A2-4 E3-4 F2-4 C3-4 G2-4 G3-4 C3-4 E3-4 A2-4 G2-4 F2-4 G2-4 C3-8' }
  ] },
  town: { bpm: 120, tracks: [
    { type: 'square', vol: 0.045, n: 'G4-1 C5-1 E5-2 D5-1 C5-1 D5-2 E5-1 G5-1 A5-2 G5-2 E5-2 F5-1 E5-1 D5-2 C5-1 D5-1 E5-2 C5-2 A4-2 G4-2 r-2 G4-1 C5-1 E5-2 D5-1 C5-1 D5-2 E5-1 G5-1 C6-2 B5-2 A5-2 G5-1 F5-1 E5-2 D5-2 E5-2 C5-4 r-2' },
    { type: 'triangle', vol: 0.1, n: 'C3-2 G3-2 C3-2 G3-2 F2-2 C3-2 F2-2 C3-2 G2-2 D3-2 G2-2 D3-2 C3-2 G3-2 C3-2 G2-2 C3-2 G3-2 C3-2 G3-2 F2-2 C3-2 F2-2 C3-2 G2-2 D3-2 G2-2 B2-2 C3-2 G2-2 C3-4' }
  ] },
  field: { bpm: 132, tracks: [
    { type: 'square', vol: 0.045, n: 'D5-1 r-1 D5-1 E5-1 F#5-2 A5-2 G5-1 F#5-1 E5-2 D5-2 r-2 B4-1 r-1 B4-1 C#5-1 D5-2 F#5-2 E5-4 r-4 D5-1 r-1 D5-1 E5-1 F#5-2 A5-2 B5-2 A5-1 G5-1 F#5-2 E5-2 D5-1 E5-1 F#5-2 E5-2 C#5-2 D5-4 r-4' },
    { type: 'triangle', vol: 0.1, n: 'D3-2 A3-2 D3-2 A3-2 G2-2 D3-2 G2-2 D3-2 B2-2 F#3-2 B2-2 F#3-2 A2-2 E3-2 A2-2 E3-2 D3-2 A3-2 D3-2 A3-2 G2-2 D3-2 G2-2 D3-2 A2-2 E3-2 A2-2 C#3-2 D3-2 A2-2 D3-4' }
  ] },
  forest: { bpm: 100, tracks: [
    { type: 'triangle', vol: 0.09, n: 'A4-2 C5-2 E5-2 A5-2 G5-3 E5-1 D5-4 F5-2 E5-2 D5-2 C5-2 B4-4 r-4 A4-2 C5-2 E5-2 A5-2 B5-3 G5-1 E5-4 F5-2 D5-2 B4-2 G#4-2 A4-6 r-2' },
    { type: 'sine', vol: 0.1, n: 'A2-4 E3-4 F2-4 C3-4 D3-4 A2-4 E2-4 E3-4 A2-4 E3-4 G2-4 D3-4 D3-4 E3-4 A2-8' }
  ] },
  cave: { bpm: 84, tracks: [
    { type: 'triangle', vol: 0.09, n: 'E4-2 r-2 G4-2 F#4-2 E4-4 B3-4 C4-2 r-2 D4-2 E4-2 B3-8 E4-2 r-2 G4-2 A4-2 B4-4 A4-2 G4-2 F#4-2 G4-2 F#4-2 D#4-2 E4-8' },
    { type: 'sine', vol: 0.12, n: 'E2-8 C2-8 A1-8 B1-8 E2-8 C2-8 D2-8 E2-8' }
  ] },
  battle: { bpm: 150, tracks: [
    { type: 'square', vol: 0.045, n: 'A4-1 A4-1 C5-1 A4-1 E5-2 D5-1 C5-1 B4-1 B4-1 D5-1 B4-1 G5-2 F5-1 E5-1 A4-1 A4-1 C5-1 E5-1 A5-2 G5-1 F5-1 E5-2 D5-2 E5-4 F5-1 F5-1 A5-1 F5-1 C6-2 B5-1 A5-1 G5-1 G5-1 B5-1 G5-1 D6-2 C6-1 B5-1 A5-2 E5-2 C5-2 B4-2 A4-4 r-4' },
    { type: 'triangle', vol: 0.11, n: 'A2-1 A3-1 A2-1 A3-1 A2-1 A3-1 A2-1 A3-1 G2-1 G3-1 G2-1 G3-1 G2-1 G3-1 G2-1 G3-1 F2-1 F3-1 F2-1 F3-1 F2-1 F3-1 F2-1 F3-1 E2-1 E3-1 E2-1 E3-1 E2-1 E3-1 E2-1 E3-1 F2-1 F3-1 F2-1 F3-1 F2-1 F3-1 F2-1 F3-1 G2-1 G3-1 G2-1 G3-1 G2-1 G3-1 G2-1 G3-1 A2-1 A3-1 E2-1 E3-1 A2-1 A3-1 E2-1 E3-1 A2-2 E2-2 A2-4' }
  ] },
  boss: { bpm: 160, tracks: [
    { type: 'sawtooth', vol: 0.035, n: 'D5-1 r-1 D5-1 F5-1 E5-1 D5-1 C#5-2 D5-1 r-1 D5-1 A5-1 G5-1 F5-1 E5-2 D5-1 r-1 D5-1 F5-1 A5-2 Bb5-2 A5-2 G5-2 F5-2 E5-2 Bb5-1 r-1 Bb5-1 A5-1 G5-1 F5-1 E5-2 F5-1 E5-1 D5-1 C#5-1 D5-4' },
    { type: 'triangle', vol: 0.12, n: 'D2-1 D3-1 D2-1 D3-1 D2-1 D3-1 D2-1 D3-1 Bb1-1 Bb2-1 Bb1-1 Bb2-1 Bb1-1 Bb2-1 Bb1-1 Bb2-1 G1-1 G2-1 G1-1 G2-1 A1-1 A2-1 A1-1 A2-1 Bb1-1 Bb2-1 Bb1-1 Bb2-1 A1-1 A2-1 A1-1 A2-1 D2-2 A1-2 D2-4' }
  ] },
  victory: { bpm: 140, tracks: [
    { type: 'square', vol: 0.05, n: 'C5-1 E5-1 G5-1 C6-3 A5-1 B5-1 C6-4 G5-2 A5-2 F5-2 G5-2 E5-6 r-2' },
    { type: 'triangle', vol: 0.1, n: 'C3-4 F3-4 G3-4 C3-4 F2-4 G2-4 C3-8' }
  ] },
  ending: { bpm: 88, tracks: [
    { type: 'triangle', vol: 0.1, n: 'G4-2 C5-2 E5-2 G5-2 F5-3 E5-1 D5-4 E5-2 F5-2 G5-2 A5-2 G5-6 r-2 A5-2 G5-2 F5-2 E5-2 D5-3 C5-1 D5-4 E5-2 D5-2 B4-2 D5-2 C5-8' },
    { type: 'sine', vol: 0.1, n: 'C3-4 E3-4 F2-4 G2-4 C3-4 F3-4 E3-4 C3-4 F2-4 C3-4 G2-4 B2-4 C3-4 G2-4 C3-8' }
  ] }
};

// ───────────────────────── 그리기 헬퍼 ─────────────────────────
const UI = {
  bgTop: 'rgba(42, 52, 86, 0.95)', bgBot: 'rgba(22, 27, 48, 0.95)',
  border: '#c9d4f0', borderDark: '#0b0e1a', text: '#f4f6ff', dim: '#9aa5c8',
  accent: '#ff9a1f', accent2: '#ffcf5a', hp: '#ff4d5e', mp: '#3d8bff', exp: '#ffd23f', good: '#7ee081', bad: '#ff6b6b'
};

function text(str, x, y, o = {}) {
  ctx.font = `${o.size || 18}px ${FONT}`;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.base || 'top';
  if (o.outline !== false) {
    ctx.lineWidth = o.lw || 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = o.outline || 'rgba(8,10,20,0.85)';
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = o.color || UI.text;
  ctx.fillText(str, x, y);
}
function textWidth(str, size = 18) { ctx.font = `${size}px ${FONT}`; return ctx.measureText(str).width; }

// 한글은 글자 단위로 줄바꿈
function wrapText(str, maxW, size = 18) {
  ctx.font = `${size}px ${FONT}`;
  const out = [];
  for (const para of String(str).split('\n')) {
    let line = '';
    for (const ch of para) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line) {
        // 공백 기준으로 깔끔하게 끊을 수 있으면 끊는다
        const sp = line.lastIndexOf(' ');
        if (sp > line.length * 0.6) { out.push(line.slice(0, sp)); line = line.slice(sp + 1) + ch; }
        else { out.push(line); line = ch === ' ' ? '' : ch; }
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawWindow(x, y, w, h, o = {}) {
  ctx.save();
  roundRect(x, y, w, h, 8);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, o.top || UI.bgTop); g.addColorStop(1, o.bot || UI.bgBot);
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = UI.borderDark; ctx.stroke();
  roundRect(x + 2, y + 2, w - 4, h - 4, 6);
  ctx.lineWidth = 2; ctx.strokeStyle = o.border || UI.border; ctx.stroke();
  // 위쪽 하이라이트
  ctx.globalAlpha = 0.12; ctx.fillStyle = '#fff';
  roundRect(x + 4, y + 4, w - 8, Math.min(14, h / 3), 4); ctx.fill();
  ctx.restore();
}

function drawCursorBar(x, y, w, h) {
  ctx.save();
  const pulse = 0.75 + Math.sin(frameCount * 0.15) * 0.25;
  roundRect(x, y, w, h, 5);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, `rgba(255,190,80,${0.55 * pulse})`); g.addColorStop(1, `rgba(230,110,20,${0.55 * pulse})`);
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255,220,140,${pulse})`; ctx.stroke();
  ctx.restore();
}

function drawBar(x, y, w, h, ratio, color, label) {
  ratio = clamp(ratio, 0, 1);
  ctx.fillStyle = '#0c0f1c'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#2a2f45'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color; ctx.fillRect(x, y, Math.round(w * ratio), h);
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x, y, Math.round(w * ratio), Math.max(1, h / 3));
  if (label) text(label, x + w / 2, y + h / 2 + 1, { size: Math.max(11, h - 2), align: 'center', base: 'middle', lw: 3 });
}
