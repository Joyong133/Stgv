'use strict';
// ───────────────────────── 이펙트 · 파티클 · 데미지 숫자 ─────────────────────────

class FX {
  static get cap() { return FX._cap || 900; }
  static set cap(v) { FX._cap = v; }
  constructor() { this.parts = []; this.effects = []; this.texts = []; this.shake = 0; }

  clear() { this.parts.length = 0; this.effects.length = 0; this.texts.length = 0; }

  // ── 파티클 ──
  part(o) {
    if (this.parts.length > FX.cap) return;
    this.parts.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0.9, life: 0.6, t: 0, size: 3, color: '#fff', kind: 'spark', rot: 0, vr: 0, add: true, shrink: true }, o));
  }
  burst(x, y, color, n = 12, speed = 160, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = speed * (0.35 + Math.random() * 0.65);
      this.part(Object.assign({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), size: rand(2, 4.5), color }, o));
    }
  }
  elemBurst(x, y, elem, n = 10, speed = 150) {
    const E = ELEMS[elem];
    const kind = { fire: 'ember', water: 'drop', wind: 'leaf', light: 'mote', dark: 'wisp' }[elem];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = speed * (0.3 + Math.random() * 0.7);
      this.part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: rand(0.35, 0.8), size: rand(2.5, 5), color: Math.random() < 0.5 ? E.color : E.light,
        kind, g: kind === 'drop' ? 400 : kind === 'ember' ? -60 : 0, rot: Math.random() * TAU, vr: rand(-8, 8) });
    }
  }
  // ── 이펙트 (모양 있는 것) ──
  add(kind, o) { const e = Object.assign({ kind, t: 0, dur: 0.5 }, o); this.effects.push(e); return e; }

  text(x, y, str, color = '#fff', size = 20, o = {}) {
    if (this.texts.length > 120) this.texts.shift();
    this.texts.push(Object.assign({ x: x + rand(-6, 6), y, str: String(str), color, size, t: 0, dur: 0.85, vy: -55 }, o));
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      if (p.t >= p.life) { this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop(); continue; }
      const d = Math.pow(p.drag, dt * 10);
      p.vx *= d; p.vy *= d; p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]; e.t += dt;
      if (e.update) e.update(e, dt, this);
      if (e.t >= e.dur) this.effects.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const s = this.texts[i]; s.t += dt; s.y += s.vy * dt; s.vy *= Math.pow(0.1, dt);
      if (s.t >= s.dur) this.texts.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 30);
  }

  drawParts(c) {
    let add = false;
    for (const p of this.parts) {
      const k = 1 - p.t / p.life;
      if (p.add !== add) { c.globalCompositeOperation = p.add ? 'lighter' : 'source-over'; add = p.add; }
      c.globalAlpha = Math.min(1, k * 1.6);
      const s = p.shrink ? p.size * (0.4 + 0.6 * k) : p.size;
      c.fillStyle = p.color;
      switch (p.kind) {
        case 'drop': c.beginPath(); c.ellipse(p.x, p.y, s * 0.7, s * 1.1, 0, 0, TAU); c.fill(); break;
        case 'leaf': c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.beginPath(); c.ellipse(0, 0, s * 1.6, s * 0.7, 0, 0, TAU); c.fill(); c.restore(); break;
        case 'shard': c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.beginPath(); c.moveTo(0, -s * 1.8); c.lineTo(s * 0.7, 0); c.lineTo(0, s * 1.8); c.lineTo(-s * 0.7, 0); c.closePath(); c.fill(); c.restore(); break;
        case 'smoke': c.globalAlpha = k * 0.35; c.beginPath(); c.arc(p.x, p.y, p.size * (1.6 - k), 0, TAU); c.fill(); break;
        case 'star': star5(c, p.x, p.y, s * 1.4, s * 0.6, p.rot); c.fill(); break;
        case 'streak': c.strokeStyle = p.color; c.lineWidth = s * 0.6; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); c.stroke(); break;
        default: c.beginPath(); c.arc(p.x, p.y, s, 0, TAU); c.fill();
      }
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }

  drawEffects(c, layer) {
    for (const e of this.effects) {
      if ((e.layer || 'top') !== layer) continue;
      const p = clamp(e.t / e.dur, 0, 1);
      const fn = FX_DRAW[e.kind];
      if (fn) { c.save(); fn(c, e, p); c.restore(); }
    }
  }

  drawTexts(c) {
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const s of this.texts) {
      const p = s.t / s.dur;
      const sc = p < 0.15 ? 0.6 + easeBack(p / 0.15) * 0.4 : 1;
      c.globalAlpha = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
      c.font = `${Math.round(s.size * sc)}px "Black Han Sans", "Jua", sans-serif`;
      c.lineWidth = Math.max(3, s.size * 0.2); c.strokeStyle = s.stroke || '#1a0f1f'; c.lineJoin = 'round';
      c.strokeText(s.str, s.x, s.y); c.fillStyle = s.color; c.fillText(s.str, s.x, s.y);
    }
    c.globalAlpha = 1;
  }
}

function radial(c, x, y, r, inner, outer, a = 1) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(inner, a)); g.addColorStop(0.45, rgba(outer, a * 0.6)); g.addColorStop(1, rgba(outer, 0));
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
}

// 각 이펙트 그리기. e: 이펙트 데이터, p: 진행도 0..1
const FX_DRAW = {
  // 원형 충격파
  ring(c, e, p) {
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 1 - p;
    c.strokeStyle = e.color; c.lineWidth = (e.w || 6) * (1 - p) + 1;
    c.beginPath(); c.ellipse(e.x, e.y, e.r * easeOut(p), e.r * easeOut(p) * (e.flat || 0.5), 0, 0, TAU); c.stroke();
  },
  flash(c, e, p) {
    c.globalCompositeOperation = 'lighter';
    radial(c, e.x, e.y, e.r * (0.6 + p * 0.6), e.inner || '#ffffff', e.color, 1 - p);
  },
  // 근접 베기 자국 (초승달)
  slash(c, e, p) {
    c.translate(e.x, e.y); c.rotate(e.rot || 0); if (e.flip) c.scale(1, -1);
    const r = e.r * (0.8 + 0.3 * easeOut(p));
    const a0 = -1.3, a1 = lerp(-1.3, 1.3, easeOut(Math.min(1, p * 2.2)));
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = p < 0.4 ? 1 : 1 - (p - 0.4) / 0.6;
    c.beginPath(); c.arc(0, 0, r, a0, a1); c.arc(-r * 0.25, 0, r * 0.82, a1, a0, true); c.closePath();
    const g = c.createLinearGradient(-r, 0, r, 0); g.addColorStop(0, rgba(e.color, 0.2)); g.addColorStop(1, '#ffffff');
    c.fillStyle = g; c.fill();
    c.strokeStyle = rgba(e.color, 0.9); c.lineWidth = 2; c.stroke();
  },
  // 큰 불꽃 초승달 (레온 스킬)
  crescent(c, e, p) {
    c.translate(e.x, e.y); c.scale(1, 0.55); c.rotate(e.rot + easeOut(p) * 3.6);
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
    for (let k = 0; k < 3; k++) {
      const r = e.r * (0.5 + 0.5 * easeOut(p)) * (1 - k * 0.12);
      c.beginPath(); c.arc(0, 0, r, 0, 2.6); c.arc(-r * 0.15, 0, r * 0.78, 2.6, 0, true); c.closePath();
      c.fillStyle = rgba(k === 0 ? e.color : k === 1 ? e.color2 : '#ffffff', 0.7 - k * 0.15); c.fill();
      c.rotate(TAU / 3);
    }
  },
  // 하늘에서 떨어지는 운석
  meteor(c, e, p) {
    const fall = seg(p, 0, 0.55);
    if (fall < 1) {
      const x = lerp(e.x - 200, e.x, easeIn(fall)), y = lerp(e.y - 520, e.y, easeIn(fall));
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) radial(c, x - (x - (e.x - 200)) * i * 0.05, y - (y - (e.y - 520)) * i * 0.05, 34 - i * 4, '#ffe08a', '#ff4a1a', 0.8 - i * 0.12);
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#5a2a1a'; c.beginPath(); c.arc(x, y, 14, 0, TAU); c.fill(); c.strokeStyle = '#ffb03a'; c.lineWidth = 3; c.stroke();
    } else {
      const q = seg(p, 0.55, 1);
      c.globalCompositeOperation = 'lighter';
      radial(c, e.x, e.y, e.r * (0.6 + q * 0.8), '#fff0c0', '#ff5a1a', 1 - q);
      c.globalAlpha = 1 - q; c.strokeStyle = '#ffb03a'; c.lineWidth = 8 * (1 - q);
      c.beginPath(); c.ellipse(e.x, e.y, e.r * 1.4 * easeOut(q), e.r * 0.7 * easeOut(q), 0, 0, TAU); c.stroke();
    }
  },
  // 빛기둥
  pillar(c, e, p) {
    c.globalCompositeOperation = 'lighter';
    const w = e.w * (p < 0.15 ? p / 0.15 : 1 - Math.max(0, (p - 0.5) / 0.5));
    const g = c.createLinearGradient(e.x - w, 0, e.x + w, 0);
    g.addColorStop(0, rgba(e.color, 0)); g.addColorStop(0.5, rgba('#ffffff', 0.95)); g.addColorStop(1, rgba(e.color, 0));
    c.fillStyle = g; c.fillRect(e.x - w, e.y - 720, w * 2, 720);
    radial(c, e.x, e.y, w * 2.2, '#ffffff', e.color, 1 - p);
    c.globalAlpha = 1 - p; c.strokeStyle = e.color; c.lineWidth = 4;
    c.beginPath(); c.ellipse(e.x, e.y, w * 2.5 * easeOut(p), w * 0.9 * easeOut(p), 0, 0, TAU); c.stroke();
  },
  // 회오리
  tornado(c, e, p) {
    const fade = p < 0.1 ? p / 0.1 : p > 0.85 ? (1 - p) / 0.15 : 1;
    c.translate(e.x, e.y);
    c.globalAlpha = fade;
    for (let i = 0; i < 9; i++) {
      const y = -i * 13, r = 12 + i * 5.5, a = e.t * 12 + i * 0.7;
      c.strokeStyle = rgba(i % 2 ? '#c8ffe0' : '#3ad17a', 0.75);
      c.lineWidth = 4;
      c.beginPath(); c.ellipse(Math.sin(a * 0.3) * 4, y, r, r * 0.3, 0, a % TAU, a % TAU + 4.2); c.stroke();
    }
    c.globalCompositeOperation = 'lighter';
    radial(c, 0, -50, 70, '#e0fff0', '#3ad17a', 0.25 * fade);
  },
  // 해일 (물결)
  tide(c, e, p) {
    c.translate(e.x, e.y);
    const r = e.r * easeOut(p);
    c.globalAlpha = 1 - p * p;
    c.scale(1, 0.5);
    for (let k = 0; k < 3; k++) {
      c.strokeStyle = k === 1 ? '#ffffff' : '#5cc8ff'; c.lineWidth = 10 - k * 3;
      c.beginPath();
      for (let a = 0; a <= TAU + 0.01; a += 0.2) { const rr = r - k * 12 + Math.sin(a * 6 + e.t * 10) * 6; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.stroke();
    }
  },
  // 눈보라 영역
  blizzard(c, e, p) {
    const fade = p < 0.15 ? p / 0.15 : 1 - Math.max(0, (p - 0.6) / 0.4);
    c.translate(e.x, e.y); c.scale(1, 0.5);
    c.globalAlpha = fade * 0.55;
    const g = c.createRadialGradient(0, 0, 0, 0, 0, e.r); g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#9ee3ff'); g.addColorStop(1, 'rgba(158,227,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, e.r, 0, TAU); c.fill();
    c.globalAlpha = fade; c.strokeStyle = '#e6f8ff'; c.lineWidth = 3;
    c.rotate(e.t * 2); for (let i = 0; i < 6; i++) { c.rotate(TAU / 6); c.beginPath(); c.moveTo(e.r * 0.3, 0); c.lineTo(e.r * 0.95, 0); c.stroke(); }
  },
  // 거대한 성창이 내리꽂힘
  spear(c, e, p) {
    const fall = seg(p, 0, 0.35);
    if (fall < 1) {
      const y = lerp(e.y - 600, e.y - 10, easeIn(fall));
      c.translate(e.x, y);
      c.globalCompositeOperation = 'lighter';
      radial(c, 0, -40, 50, '#ffffff', '#ffd23f', 0.6);
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#fff6c0'; c.strokeStyle = OL; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(0, 30); c.lineTo(-10, 0); c.lineTo(-4, 0); c.lineTo(-4, -110); c.lineTo(4, -110); c.lineTo(4, 0); c.lineTo(10, 0); c.closePath(); c.fill(); c.stroke();
    } else {
      const q = seg(p, 0.35, 1);
      c.globalCompositeOperation = 'lighter';
      radial(c, e.x, e.y, e.r * (0.5 + q), '#ffffff', '#ffd23f', 1 - q);
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8; c.strokeStyle = rgba('#fff3a0', 1 - q); c.lineWidth = 4;
        c.beginPath(); c.moveTo(e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 10); c.lineTo(e.x + Math.cos(a) * e.r * 1.2 * easeOut(q), e.y + Math.sin(a) * e.r * 0.6 * easeOut(q)); c.stroke();
      }
      if (q < 0.6) { c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1 - q / 0.6; c.fillStyle = '#fff6c0'; c.fillRect(e.x - 4, e.y - 90, 8, 80); }
    }
  },
  // 저주 문양 (바닥)
  curse(c, e, p) {
    const fade = p < 0.2 ? p / 0.2 : 1 - Math.max(0, (p - 0.6) / 0.4);
    c.translate(e.x, e.y); c.scale(1, 0.45); c.rotate(e.t * 1.5);
    c.globalAlpha = fade; c.globalCompositeOperation = 'lighter';
    c.strokeStyle = '#c77dff'; c.lineWidth = 4;
    c.beginPath(); c.arc(0, 0, e.r, 0, TAU); c.stroke();
    c.beginPath(); c.arc(0, 0, e.r * 0.75, 0, TAU); c.stroke();
    c.beginPath(); for (let i = 0; i <= 5; i++) { const a = i * TAU * 2 / 5 - Math.PI / 2; c.lineTo(Math.cos(a) * e.r * 0.75, Math.sin(a) * e.r * 0.75); } c.stroke();
    radial(c, 0, 0, e.r, '#ff7ae6', '#3d0d6b', 0.35 * fade);
  },
  // 사신의 거대한 낫 궤적
  reap(c, e, p) {
    c.translate(e.x, e.y); c.scale(e.face, 0.6);
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = p < 0.5 ? 1 : 1 - (p - 0.5) / 0.5;
    const a1 = lerp(-2.8, 1.4, easeOut(Math.min(1, p * 2)));
    c.beginPath(); c.arc(0, 0, e.r, -2.8, a1); c.arc(0, 0, e.r * 0.62, a1, -2.8, true); c.closePath();
    const g = c.createRadialGradient(0, 0, e.r * 0.6, 0, 0, e.r); g.addColorStop(0, 'rgba(61,13,107,0)'); g.addColorStop(0.7, 'rgba(166,77,255,0.6)'); g.addColorStop(1, '#ffffff');
    c.fillStyle = g; c.fill();
  },
  // 번개 / 연결선
  bolt(c, e, p) {
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - p;
    c.strokeStyle = e.color; c.lineWidth = 3;
    c.beginPath(); c.moveTo(e.x, e.y);
    const n = 6;
    for (let i = 1; i <= n; i++) { const k = i / n; c.lineTo(lerp(e.x, e.x2, k) + (i < n ? rand(-10, 10) : 0), lerp(e.y, e.y2, k) + (i < n ? rand(-10, 10) : 0)); }
    c.stroke();
  },
  // 잔상 (닌자 질풍 난무, 암살자)
  dashline(c, e, p) {
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - p;
    c.strokeStyle = e.color; c.lineWidth = 6 * (1 - p) + 1;
    c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(e.x2, e.y2); c.stroke();
    c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.stroke();
  },
  // 축복 (영웅 위 빛)
  bless(c, e, p) {
    c.globalCompositeOperation = 'lighter';
    const a = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8;
    radial(c, e.x, e.y - 40, 50, '#ffffff', '#ffd23f', a * 0.7);
    c.globalAlpha = a; c.strokeStyle = '#fff3a0'; c.lineWidth = 3;
    c.beginPath(); c.ellipse(e.x, e.y - 90 + p * 20, 16, 5, 0, 0, TAU); c.stroke();
  },
  heal(c, e, p) {
    c.globalCompositeOperation = 'lighter';
    radial(c, e.x, e.y, e.r * (0.5 + p), '#ffffff', '#5cffb0', 1 - p);
    c.globalAlpha = 1 - p; c.fillStyle = '#c8ffe0';
    for (let i = 0; i < 6; i++) { const x = e.x + Math.cos(i) * 30, y = e.y - p * 60 - i * 6; c.fillRect(x - 2, y - 7, 4, 14); c.fillRect(x - 7, y - 2, 14, 4); }
  },
  // 등장 마법진 (영웅 배치)
  summon(c, e, p) {
    c.translate(e.x, e.y); c.scale(1, 0.4); c.rotate(p * 4);
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - p;
    c.strokeStyle = e.color; c.lineWidth = 4;
    c.beginPath(); c.arc(0, 0, 40 + p * 20, 0, TAU); c.stroke();
    star5(c, 0, 0, 36 + p * 18, 15 + p * 8); c.stroke();
  },
  // 보스 경고 붉은 화면
  vignette(c, e, p) {
    const a = Math.sin(p * Math.PI) * (e.a || 0.5);
    const g = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, rgba(e.color || '#ff0000', a));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  },
  // 물대포 · 빛줄기 (직선)
  beam(c, e, p) {
    const a = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
    const ang = Math.atan2(e.y2 - e.y, e.x2 - e.x), len = Math.hypot(e.x2 - e.x, e.y2 - e.y);
    c.translate(e.x, e.y); c.rotate(ang);
    c.globalCompositeOperation = 'lighter';
    const w = e.w * (0.6 + a * 0.4);
    const g = c.createLinearGradient(0, -w, 0, w);
    g.addColorStop(0, rgba(e.color, 0)); g.addColorStop(0.3, rgba(e.color, 0.7 * a)); g.addColorStop(0.5, rgba('#ffffff', a)); g.addColorStop(0.7, rgba(e.color, 0.7 * a)); g.addColorStop(1, rgba(e.color, 0));
    c.fillStyle = g; c.fillRect(0, -w, len, w * 2);
    for (let i = 0; i < 6; i++) { const x = ((e.t * 900 + i * 90) % len); c.fillStyle = rgba(e.light, a * 0.8); c.beginPath(); c.ellipse(x, Math.sin(i * 3 + e.t * 20) * w * 0.4, 14, 3, 0, 0, TAU); c.fill(); }
    radial(c, 0, 0, w * 1.6, '#ffffff', e.color, a);
  },
  // 회전 칼날 바람 (라일라)
  whirl(c, e, p) {
    const fade = p < 0.08 ? p / 0.08 : p > 0.9 ? (1 - p) / 0.1 : 1;
    c.translate(e.x, e.y + 30); c.scale(1, 0.5);
    c.globalAlpha = fade; c.globalCompositeOperation = 'lighter';
    c.rotate(e.t * 9);
    for (let i = 0; i < 6; i++) {
      c.rotate(TAU / 6);
      c.fillStyle = rgba(i % 2 ? '#b8ffcf' : '#3ad17a', 0.65);
      c.beginPath(); c.arc(0, 0, e.r * 1.6, 0, 0.7); c.arc(0, 0, e.r * 1.2, 0.7, 0, true); c.closePath(); c.fill();
    }
    radial(c, 0, 0, e.r * 1.8, '#e0fff0', '#3ad17a', 0.18 * fade);
  },
  // 그림자 칼날 (암살자 스킬)
  xslash(c, e, p) {
    c.translate(e.x, e.y); c.rotate(e.rot);
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - p;
    const l = 46 * easeOut(Math.min(1, p * 3));
    c.strokeStyle = '#e2b8ff'; c.lineWidth = 6 * (1 - p) + 1.5;
    c.beginPath(); c.moveTo(-l, -l * 0.3); c.lineTo(l, l * 0.3); c.stroke();
    c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.stroke();
  },
};
