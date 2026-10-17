'use strict';
// ───────────────────────── 소리 (WebAudio로 직접 합성) ─────────────────────────
const Sound = {
  ctx: null, master: null, noiseBuf: null, on: true, last: {},
  // 같은 소리를 너무 자주 겹쳐 내지 않도록 최소 간격(초)
  gap: { rifle: 0.05, flame: 0.12, cannon: 0.1, siege: 0.12, spine: 0.06, claw: 0.06, hit: 0.08, sunken: 0.15, boom: 0.08, bigboom: 0.2, squish: 0.06, bigsquish: 0.2, death: 0.08, heal: 0.4, alert: 1, error: 0.3 },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? 0.45 : 0;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },
  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.value = v ? 0.45 : 0;
    Store.set('kf.sound', v);
  },
  // 월드 위치의 소리: 화면에서 멀수록 작게
  at(name, x, y) {
    if (!this.ctx || !this.on || G.state !== 'play') return;
    const c = G.cam, vw = View.vw, vh = View.vh;
    const dx = Math.max(c.x - x, 0, x - (c.x + vw)), dy = Math.max(c.y - y, 0, y - (c.y + vh));
    const d = Math.hypot(dx, dy);
    if (d > 500) return;
    this.play(name, 1 - d / 500);
  },
  play(name, vol = 1) {
    if (!this.ctx || !this.on) return;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] || 0) < (this.gap[name] || 0.03)) return;
    this.last[name] = now;
    const S = this;
    switch (name) {
      case 'rifle': S.noise(0.06, 'bandpass', 2400, 1.2, 0.35 * vol, now); S.tone('square', 180, 90, 0.04, 0.08 * vol, now); break;
      case 'flame': S.noise(0.32, 'lowpass', 900, 0.8, 0.4 * vol, now, 600); break;
      case 'cannon': S.noise(0.25, 'lowpass', 700, 0.7, 0.55 * vol, now); S.tone('sine', 120, 45, 0.22, 0.4 * vol, now); break;
      case 'siege': S.noise(0.5, 'lowpass', 500, 0.6, 0.7 * vol, now); S.tone('sine', 90, 30, 0.45, 0.55 * vol, now); break;
      case 'spine': S.tone('triangle', 1400, 380, 0.07, 0.18 * vol, now); break;
      case 'claw': S.noise(0.05, 'highpass', 2500, 0.9, 0.25 * vol, now); S.tone('square', 260, 140, 0.04, 0.06 * vol, now); break;
      case 'hit': S.noise(0.05, 'bandpass', 1200, 1, 0.25 * vol, now); break;
      case 'sunken': S.noise(0.2, 'lowpass', 400, 0.9, 0.45 * vol, now); S.tone('sine', 160, 60, 0.18, 0.3 * vol, now); break;
      case 'boom': S.noise(0.45, 'lowpass', 900, 0.7, 0.55 * vol, now); S.tone('sine', 110, 35, 0.35, 0.35 * vol, now); break;
      case 'bigboom': S.noise(1.0, 'lowpass', 600, 0.6, 0.8 * vol, now); S.tone('sine', 80, 25, 0.8, 0.5 * vol, now); break;
      case 'squish': S.noise(0.16, 'bandpass', 700, 2, 0.35 * vol, now); S.tone('sawtooth', 220, 70, 0.14, 0.08 * vol, now); break;
      case 'bigsquish': S.noise(0.5, 'bandpass', 380, 1.5, 0.6 * vol, now); S.tone('sawtooth', 140, 40, 0.45, 0.15 * vol, now); break;
      case 'death': S.noise(0.12, 'bandpass', 1500, 1.5, 0.2 * vol, now); S.tone('square', 300, 120, 0.12, 0.05 * vol, now); break;
      case 'heal': S.tone('sine', 880, 1320, 0.18, 0.06 * vol, now); break;
      case 'siegeDone': S.tone('square', 90, 60, 0.12, 0.12 * vol, now); S.noise(0.15, 'bandpass', 800, 3, 0.2 * vol, now); break;
      case 'select': S.tone('square', 660, 660, 0.04, 0.05, now); S.tone('square', 990, 990, 0.05, 0.04, now + 0.045); break;
      case 'ack': S.tone('square', 520, 780, 0.06, 0.05, now); break;
      case 'error': S.tone('square', 170, 150, 0.12, 0.12, now); S.tone('square', 140, 120, 0.14, 0.12, now + 0.13); break;
      case 'place': S.tone('triangle', 300, 300, 0.05, 0.12, now); S.noise(0.08, 'bandpass', 1800, 2, 0.15, now + 0.04); break;
      case 'ready': S.tone('triangle', 660, 880, 0.08, 0.1, now); break;
      case 'load': S.tone('triangle', 400, 300, 0.08, 0.12, now); break;
      case 'stim': S.noise(0.25, 'highpass', 3000, 0.7, 0.18, now); S.tone('sine', 300, 700, 0.2, 0.08, now); break;
      case 'complete': [523, 659, 784].forEach((f, i) => S.tone('triangle', f, f, 0.12, 0.12, now + i * 0.09)); break;
      case 'alert': [880, 660, 880, 660].forEach((f, i) => S.tone('square', f, f, 0.1, 0.07, now + i * 0.12)); break;
      case 'victory': [392, 523, 659, 784, 1046].forEach((f, i) => S.tone('triangle', f, f, 0.3, 0.14, now + i * 0.16)); break;
      case 'defeat': [392, 330, 262, 196].forEach((f, i) => S.tone('sawtooth', f, f * 0.98, 0.4, 0.08, now + i * 0.25)); break;
    }
  },
  tone(type, f0, f1, dur, vol, t0) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  },
  noise(dur, ftype, freq, q, vol, t0, sweep) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf;
    f.type = ftype; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);
    g.gain.setValueAtTime(Math.max(0.0002, vol), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
  },
};
