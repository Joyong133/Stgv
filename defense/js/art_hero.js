'use strict';
// ───────────────────────── 영웅 아트 (애니메 셀 셰이딩 컷아웃 리그) ─────────────────────────
// 영웅은 머리 · 얼굴 · 눈 · 머리카락 가닥 · 몸통 · 2관절 팔 · 다리 · 장비 · 장식을 각각 그린다.
// 부위마다 "셀 셰이딩"(빛 받는 면 / 그림자 면이 딱 나뉘는 애니메 음영)과 색이 들어간 외곽선을 쓴다.
// 좌표: 발밑 (0,0), 오른쪽을 바라봄, 키 약 95.

const LINE_INK = '#1a0e24';
const lineOf = col => mix(col, LINE_INK, 0.7);
const shadeOf = col => mix(shade(col, -0.28), '#4a2a7a', 0.16);
const lightOf = col => shade(col, 0.38);

// 현재 경로를 셀 셰이딩으로 칠한다. bb: 경로의 대략적인 상자 [x, y, w, h]
function cel(c, base, bb, o) {
  o = o || {};
  c.fillStyle = base; c.fill();
  c.save(); c.clip();
  const [x, y, w, h] = bb;
  const ang = o.dir || 0;   // 0: 오른쪽 위에서 빛
  const g = ang === 1 ? c.createLinearGradient(x, y, x, y + h) : c.createLinearGradient(x + w, y + h * 0.3, x, y + h * 0.55);
  const cut = o.cut || 0.66;
  const hi = o.hi || lightOf(base), sh = o.sh || shadeOf(base);
  g.addColorStop(0, rgba(hi, o.hiA != null ? o.hiA : 0.6)); g.addColorStop(0.3, rgba(hi, 0));
  g.addColorStop(cut, rgba(sh, 0)); g.addColorStop(cut + 0.001, rgba(sh, 0.9)); g.addColorStop(1, rgba(shade(sh, -0.1), 1));
  c.fillStyle = g; c.fillRect(x - 3, y - 3, w + 6, h + 6);
  c.restore();
  c.lineWidth = o.lw || 1.6; c.strokeStyle = o.line || lineOf(base); c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
}
function flatLine(c, fill, line, lw) { c.fillStyle = fill; c.fill(); c.lineWidth = lw || 1.4; c.strokeStyle = line || lineOf(fill); c.lineJoin = 'round'; c.stroke(); }

// 가늘어지는 가닥 (머리카락 · 망토 자락 · 깃털)
function strandPath(c, x0, y0, x1, y1, w, bend) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  const mx = (x0 + x1) / 2 + nx * bend, my = (y0 + y1) / 2 + ny * bend;
  c.beginPath();
  c.moveTo(x0 + nx * w / 2, y0 + ny * w / 2);
  c.quadraticCurveTo(mx + nx * w * 0.42, my + ny * w * 0.42, x1, y1);
  c.quadraticCurveTo(mx - nx * w * 0.42, my - ny * w * 0.42, x0 - nx * w / 2, y0 - ny * w / 2);
  c.closePath();
}
// 굵기가 변하는 팔다리
function limbPath(c, x0, y0, x1, y1, r0, r1) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  c.beginPath();
  c.arc(x0, y0, r0, a + Math.PI / 2, a - Math.PI / 2);
  c.arc(x1, y1, r1, a - Math.PI / 2, a + Math.PI / 2);
  c.closePath();
}

// ───────────── 포즈 ─────────────
function basePose(def) {
  const P = { bob: 0, lean: 0, shift: 0, jump: 0, sq: 1, armF: 0.35, armB: -0.25, bendF: 0.5, bendB: 0.35, legF: 0, legB: 0,
    wa: -1.1, wb: -1.1, reach: 0, draw: 0, eyes: 'open', mouth: 'smile', glow: 0, smear: null,
    hideWpn: false, charge: 0, hairSwing: 0, stun: false, orb: null, muzzle: 0, headTilt: 0 };
  switch (def.weapon) {
    case 'staff': P.armF = 0.5; P.bendF = 0.9; P.wa = -1.45; break;
    case 'bow': P.armF = 0.45; P.bendF = 0.7; P.wa = -1.25; break;
    case 'spear': P.armF = 0.45; P.bendF = 0.9; P.wa = -1.3; break;
    case 'hammer': P.armF = 0.4; P.bendF = 0.9; P.wa = -0.95; break;
    case 'greatsword': P.armF = 0.3; P.bendF = 1.0; P.wa = -1.25; break;
    case 'scythe': P.armF = 0.45; P.bendF = 0.9; P.wa = -1.38; break;
    case 'daggers': P.armF = 0.6; P.armB = 0.5; P.bendF = 1.2; P.bendB = 1.2; P.wa = 0.35; P.wb = 0.55; break;
    case 'shuriken': P.armF = 0.4; P.bendF = 1.1; P.wa = -0.6; break;
    case 'chakram': P.armF = 0.5; P.bendF = 1.1; P.wa = -0.3; break;
    case 'orb': case 'book': P.armF = 0.85; P.bendF = 0.9; P.wa = -0.4; break;
    case 'gauntlet': P.armF = 0.9; P.bendF = 2.1; P.armB = 0.6; P.bendB = 2.0; P.wa = 0; break;
    case 'gun': P.armF = 0.35; P.bendF = 0.8; P.wa = 0.9; break;
  }
  return P;
}

// state: idle | attack | skill | stun | victory
function heroPose(def, state, p, t, aim = 0) {
  const P = basePose(def);
  const rest = { armF: P.armF, wa: P.wa, armB: P.armB, wb: P.wb, bendF: P.bendF, bendB: P.bendB };
  P.bob = Math.sin(t * 3.2) * 1.1;
  P.armF += Math.sin(t * 3.2 + 0.6) * 0.04;
  P.armB -= Math.sin(t * 3.2 + 0.6) * 0.04;
  P.hairSwing = Math.sin(t * 2.4) * 0.5;
  P.headTilt = Math.sin(t * 1.6) * 0.03;
  if ((t % 3.4) < 0.11) P.eyes = 'closed';
  aim = clamp(aim, -0.9, 0.9);
  if (state === 'attack' || state === 'skill') {
    const q = state === 'skill' ? seg(p, 0.2, 0.78) : p;
    attackPose(def, P, rest, q, aim);
    if (state === 'skill') {
      P.glow = Math.sin(Math.min(1, p * 1.25) * Math.PI) + 0.15;
      if (p < 0.18) { P.sq = 1 - 0.14 * Math.sin(seg(p, 0, 0.18) * Math.PI); P.bob += 3 * Math.sin(seg(p, 0, 0.18) * Math.PI); }
      P.jump = -Math.sin(seg(p, 0.12, 0.8) * Math.PI) * 26;
      if (p > 0.8) P.sq = 1 - 0.1 * Math.sin(seg(p, 0.8, 1) * Math.PI);
      P.eyes = 'angry'; P.mouth = 'shout';
      P.hairSwing = Math.sin(t * 14) * 1.5;
      P.legF = -0.25 * Math.sin(seg(p, 0.12, 0.8) * Math.PI); P.legB = 0.35 * Math.sin(seg(p, 0.12, 0.8) * Math.PI);
    }
  } else if (state === 'stun') {
    P.lean = Math.sin(t * 6) * 0.08; P.eyes = 'dizzy'; P.mouth = 'o'; P.stun = true; P.armF = 0.1; P.armB = -0.1; P.headTilt = Math.sin(t * 6) * 0.1;
  } else if (state === 'victory') {
    const j = Math.abs(Math.sin(t * 4));
    P.jump = -j * 12; P.armF = 2.7; P.bendF = 0.2; P.wa = -1.7; P.armB = -2.4; P.eyes = 'happy'; P.mouth = 'open';
    if (def.weapon === 'bow') P.wa = -1.6;
  }
  return P;
}

function attackPose(def, P, R, p, aim) {
  const th = Math.PI / 2 - aim;
  switch (def.anim) {
    case 'slash': {
      const heavy = def.weapon === 'hammer' || def.weapon === 'greatsword';
      const top = heavy ? -2.9 : -2.55, end = heavy ? 1.25 : 0.95;
      if (p < 0.42) {
        const e = easeOut(p / 0.42);
        P.armF = lerp(R.armF, 2.95, e); P.bendF = lerp(R.bendF, 0.25, e); P.wa = lerp(R.wa, top, e); P.lean = -0.14 * e; P.bob -= 1.5 * e;
        P.armB = lerp(R.armB, -0.9, e); P.eyes = 'angry'; P.legF = 0.15 * e; P.legB = -0.2 * e;
      } else if (p < 0.6) {
        const e = easeIn((p - 0.42) / 0.18);
        P.armF = lerp(2.95, 0.65, e); P.bendF = lerp(0.25, 0.4, e); P.wa = lerp(top, end, e); P.lean = lerp(-0.14, 0.2, e);
        P.armB = lerp(-0.9, 0.4, e); P.eyes = 'angry'; P.mouth = 'shout'; P.shift = 5 * e; P.legF = lerp(0.15, -0.3, e); P.legB = lerp(-0.2, 0.3, e);
        P.smear = { a0: top, a1: P.wa, k: 1 - e * 0.2, big: heavy };
        if (heavy) P.sq = 1 - 0.08 * e;
      } else {
        const e = easeInOut((p - 0.6) / 0.4);
        P.armF = lerp(0.65, R.armF, e); P.bendF = lerp(0.4, R.bendF, e); P.wa = lerp(end, R.wa, e); P.lean = lerp(0.2, 0, e);
        P.armB = lerp(0.4, R.armB, e); P.shift = 5 * (1 - e); P.legF = -0.3 * (1 - e); P.legB = 0.3 * (1 - e);
        if (p < 0.72) P.smear = { a0: top, a1: end, k: 1 - seg(p, 0.6, 0.72), big: heavy };
      }
      break;
    }
    case 'reap': {
      if (p < 0.45) {
        const e = easeOut(p / 0.45);
        P.armF = lerp(R.armF, 2.7, e); P.bendF = lerp(R.bendF, 0.3, e); P.wa = lerp(R.wa, -3.05, e); P.lean = -0.18 * e; P.armB = lerp(R.armB, 2.4, e); P.eyes = 'angry';
      } else if (p < 0.62) {
        const e = easeIn((p - 0.45) / 0.17);
        P.armF = lerp(2.7, 0.3, e); P.bendF = lerp(0.3, 0.5, e); P.wa = lerp(-3.05, 1.75, e); P.lean = lerp(-0.18, 0.24, e); P.armB = lerp(2.4, 0.2, e);
        P.smear = { a0: -3.05, a1: P.wa, k: 1, big: true }; P.eyes = 'angry'; P.mouth = 'shout'; P.shift = 6 * e;
      } else {
        const e = easeInOut((p - 0.62) / 0.38);
        P.armF = lerp(0.3, R.armF, e); P.bendF = lerp(0.5, R.bendF, e); P.wa = lerp(1.75, R.wa, e); P.lean = lerp(0.24, 0, e); P.armB = lerp(0.2, R.armB, e); P.shift = 6 * (1 - e);
        if (p < 0.75) P.smear = { a0: -3.05, a1: 1.75, k: 1 - seg(p, 0.62, 0.75), big: true };
      }
      break;
    }
    case 'thrust': {
      if (p < 0.45) {
        const e = easeOut(p / 0.45);
        P.armF = lerp(R.armF, th - 0.2, e); P.bendF = lerp(R.bendF, 0.6, e); P.wa = lerp(R.wa, aim, e); P.shift = -6 * e; P.lean = -0.1 * e; P.reach = -10 * e; P.eyes = 'angry';
        P.armB = lerp(R.armB, th - 0.4, e); P.legF = 0.2 * e;
      } else if (p < 0.6) {
        const e = easeBack((p - 0.45) / 0.15);
        P.armF = th; P.bendF = lerp(0.6, 0.05, e); P.wa = aim; P.shift = lerp(-6, 12, e); P.lean = lerp(-0.1, 0.16, e); P.reach = lerp(-10, 18, e); P.mouth = 'shout';
        P.armB = th - 0.4; P.eyes = 'angry'; P.thrustFx = e; P.legF = lerp(0.2, -0.4, e); P.legB = 0.3 * e;
      } else {
        const e = easeInOut((p - 0.6) / 0.4);
        P.armF = lerp(th, R.armF, e); P.bendF = lerp(0.05, R.bendF, e); P.wa = lerp(aim, R.wa, e); P.shift = lerp(12, 0, e); P.lean = lerp(0.16, 0, e); P.reach = lerp(18, 0, e);
        P.armB = lerp(th - 0.4, R.armB, e); P.legF = -0.4 * (1 - e); P.legB = 0.3 * (1 - e);
      }
      break;
    }
    case 'bow': {
      if (p < 0.12) { const e = easeOut(p / 0.12); P.armF = lerp(R.armF, th, e); P.bendF = lerp(R.bendF, 0.05, e); P.wa = lerp(R.wa, aim, e); P.armB = lerp(R.armB, th - 0.15, e); P.bendB = lerp(R.bendB, 1.8, e); }
      else if (p < 0.6) { const e = easeOut((p - 0.12) / 0.48); P.armF = th; P.bendF = 0.05; P.wa = aim; P.armB = th - 0.1; P.bendB = 1.8 + 0.9 * e; P.draw = e; P.lean = -0.05 * e; P.eyes = 'focus'; }
      else { const e = easeOut((p - 0.6) / 0.4); P.armF = lerp(th, R.armF, e * e); P.bendF = lerp(0.05, R.bendF, e); P.wa = lerp(aim, R.wa, e * e); P.armB = lerp(th - 0.5, R.armB, e); P.bendB = lerp(1.2, R.bendB, e); P.draw = 0; P.lean = lerp(-0.12, 0, e); P.shift = -3 * (1 - e); }
      break;
    }
    case 'shoot': {
      if (p < 0.3) { const e = easeOut(p / 0.3); P.armF = lerp(R.armF, th, e); P.bendF = lerp(R.bendF, 0.05, e); P.wa = lerp(R.wa, aim, e); P.armB = lerp(R.armB, th - 0.3, e); P.bendB = lerp(R.bendB, 1.3, e); P.eyes = 'focus'; }
      else if (p < 0.5) { const e = (p - 0.3) / 0.2; P.armF = th + 0.35 * Math.sin(Math.min(1, e * 2) * Math.PI); P.bendF = 0.05; P.wa = aim - 0.35 * Math.sin(Math.min(1, e * 2) * Math.PI); P.armB = th - 0.3; P.bendB = 1.3; P.shift = -4 * Math.sin(e * Math.PI); P.muzzle = e < 0.5 ? 1 - e * 2 : 0; P.eyes = 'angry'; }
      else { const e = easeInOut((p - 0.5) / 0.5); P.armF = lerp(th, R.armF, e); P.bendF = lerp(0.05, R.bendF, e); P.wa = lerp(aim, R.wa, e); P.armB = lerp(th - 0.3, R.armB, e); P.bendB = lerp(1.3, R.bendB, e); }
      break;
    }
    case 'punch': {
      // 앞손 잽 → 뒷손 스트레이트
      if (p < 0.15) { const e = easeOut(p / 0.15); P.armF = lerp(R.armF, 0.6, e); P.bendF = 2.4; P.lean = -0.08 * e; P.eyes = 'angry'; }
      else if (p < 0.35) { const e = easeBack((p - 0.15) / 0.2); P.armF = lerp(0.6, th, e); P.bendF = lerp(2.4, 0.05, e); P.shift = 8 * e; P.lean = 0.14 * e; P.mouth = 'shout'; P.punchFx = e; P.legF = -0.35 * e; P.legB = 0.25 * e; }
      else if (p < 0.45) { P.armF = th; P.bendF = 0.05; P.shift = 8; P.lean = 0.14; P.legF = -0.35; P.legB = 0.25; }
      else if (p < 0.62) { const e = easeBack((p - 0.45) / 0.17); P.armF = lerp(th, 0.7, e); P.bendF = lerp(0.05, 2.3, e); P.armB = lerp(R.armB, th, e); P.bendB = lerp(R.bendB, 0.05, e); P.shift = 8 + 6 * e; P.lean = 0.2; P.mouth = 'shout'; P.punchFxB = e; P.legF = -0.35; P.legB = 0.25; }
      else { const e = easeInOut((p - 0.62) / 0.38); P.armF = lerp(0.7, R.armF, e); P.bendF = lerp(2.3, R.bendF, e); P.armB = lerp(th, R.armB, e); P.bendB = lerp(0.05, R.bendB, e); P.shift = 14 * (1 - e); P.lean = 0.2 * (1 - e); P.legF = -0.35 * (1 - e); P.legB = 0.25 * (1 - e); }
      break;
    }
    case 'cast': {
      if (p < 0.5) {
        const e = easeOut(p / 0.5);
        P.armF = lerp(R.armF, 2.55, e); P.bendF = lerp(R.bendF, 0.3, e); P.wa = lerp(R.wa, -1.95, e); P.armB = lerp(R.armB, 1.8, e); P.bendB = lerp(R.bendB, 0.6, e); P.charge = e; P.lean = -0.08 * e; P.eyes = 'focus';
      } else if (p < 0.65) {
        const e = easeBack((p - 0.5) / 0.15);
        P.armF = lerp(2.55, th, e); P.bendF = lerp(0.3, 0.1, e); P.wa = lerp(-1.95, aim - 0.35, e); P.armB = lerp(1.8, 0.6, e); P.charge = 1 - e; P.lean = lerp(-0.08, 0.14, e); P.shift = 4 * e;
        P.mouth = 'shout'; P.eyes = 'angry';
      } else {
        const e = easeInOut((p - 0.65) / 0.35);
        P.armF = lerp(th, R.armF, e); P.bendF = lerp(0.1, R.bendF, e); P.wa = lerp(aim - 0.35, R.wa, e); P.armB = lerp(0.6, R.armB, e); P.lean = lerp(0.14, 0, e); P.shift = 4 * (1 - e);
      }
      if (def.weapon === 'orb') P.orb = { cast: p < 0.58 ? 0 : seg(p, 0.58, 0.7) };
      break;
    }
    case 'javelin': {
      if (p < 0.5) {
        const e = easeOut(p / 0.5);
        P.armF = lerp(R.armF, 2.75, e); P.bendF = lerp(R.bendF, 1.0, e); P.wa = lerp(R.wa, aim - 0.15, e); P.lean = -0.16 * e; P.armB = lerp(R.armB, 1.4, e); P.eyes = 'angry'; P.shift = -4 * e;
      } else if (p < 0.62) {
        const e = easeIn((p - 0.5) / 0.12);
        P.armF = lerp(2.75, 1.0, e); P.bendF = lerp(1.0, 0.1, e); P.wa = aim; P.lean = lerp(-0.16, 0.2, e); P.armB = lerp(1.4, -0.6, e); P.mouth = 'shout'; P.shift = lerp(-4, 8, e);
        P.hideWpn = e > 0.5;
      } else {
        const e = easeInOut((p - 0.62) / 0.38);
        P.armF = lerp(1.0, R.armF, e); P.bendF = lerp(0.1, R.bendF, e); P.lean = lerp(0.2, 0, e); P.armB = lerp(-0.6, R.armB, e); P.shift = lerp(8, 0, e);
        P.hideWpn = e < 0.75; P.wpnFade = seg(e, 0.75, 1);
      }
      break;
    }
    case 'throw': {
      if (p < 0.42) {
        const e = easeOut(p / 0.42);
        P.armF = lerp(R.armF, -1.4, e); P.bendF = lerp(R.bendF, 1.6, e); P.wa = lerp(R.wa, -2.4, e); P.lean = -0.12 * e; P.armB = lerp(R.armB, 1.3, e); P.eyes = 'focus';
      } else if (p < 0.58) {
        const e = easeIn((p - 0.42) / 0.16);
        P.armF = lerp(-1.4, 1.9 - aim, e); P.bendF = lerp(1.6, 0.1, e); P.wa = lerp(-2.4, aim, e); P.lean = lerp(-0.12, 0.18, e); P.armB = lerp(1.3, -0.8, e); P.shift = 5 * e;
        P.hideWpn = e > 0.6; P.smear = { a0: -1.4, a1: P.wa, k: 0.6, thin: true };
      } else {
        const e = easeInOut((p - 0.58) / 0.42);
        P.armF = lerp(1.9 - aim, R.armF, e); P.bendF = lerp(0.1, R.bendF, e); P.wa = lerp(aim, R.wa, e); P.lean = lerp(0.18, 0, e); P.armB = lerp(-0.8, R.armB, e); P.shift = 5 * (1 - e);
        P.hideWpn = e < 0.5;
      }
      break;
    }
    case 'dual': {
      if (p < 0.12) { const e = easeOut(p / 0.12); P.armF = lerp(R.armF, 2.6, e); P.bendF = lerp(R.bendF, 0.3, e); P.wa = lerp(R.wa, -2.2, e); P.eyes = 'angry'; P.lean = -0.08 * e; }
      else if (p < 0.3) { const e = easeIn((p - 0.12) / 0.18); P.armF = lerp(2.6, 0.4, e); P.bendF = 0.3; P.wa = lerp(-2.2, 1.2, e); P.smear = { a0: -2.2, a1: P.wa, k: 1, thin: true }; P.lean = lerp(-0.08, 0.15, e); P.shift = 6 * e; P.armB = lerp(R.armB, 2.4, e); P.bendB = 0.3; P.wb = lerp(R.wb, -2.2, e); }
      else if (p < 0.42) { P.armF = 0.4; P.bendF = 0.3; P.wa = 1.2; P.armB = 2.4; P.bendB = 0.3; P.wb = -2.2; P.shift = 6; P.lean = 0.12; }
      else if (p < 0.62) { const e = easeIn((p - 0.42) / 0.2); P.armF = 0.4; P.bendF = 0.3; P.wa = 1.2; P.armB = lerp(2.4, 0.9, e); P.bendB = 0.3; P.wb = lerp(-2.2, 1.5, e); P.smearB = { a0: -2.2, a1: P.wb, k: 1 }; P.lean = lerp(0.12, 0.2, e); P.shift = 6 + 4 * e; P.mouth = 'shout'; }
      else { const e = easeInOut((p - 0.62) / 0.38); P.armF = lerp(0.4, R.armF, e); P.bendF = lerp(0.3, R.bendF, e); P.wa = lerp(1.2, R.wa, e); P.armB = lerp(0.9, R.armB, e); P.bendB = lerp(0.3, R.bendB, e); P.wb = lerp(1.5, R.wb, e); P.shift = 10 * (1 - e); P.lean = 0.2 * (1 - e); }
      break;
    }
  }
}

const HIT_AT = { slash: [0.5], reap: [0.54], thrust: [0.52], bow: [0.6], cast: [0.58], javelin: [0.56], throw: [0.52], dual: [0.25, 0.55], punch: [0.3, 0.56], shoot: [0.32] };
const ACTION_TIME = { slash: 0.62, reap: 0.7, thrust: 0.6, bow: 0.66, cast: 0.75, javelin: 0.75, throw: 0.4, dual: 0.6, punch: 0.55, shoot: 0.5 };
const SKILL_TIME = 1.15, SKILL_HIT = 0.56;

// ───────────── 관절 계산 ─────────────
const UA = 8.5, FA = 8;   // 위팔 · 아래팔 길이
function armJoints(S, ang, bend) {
  const ex = S.x + Math.sin(ang) * UA, ey = S.y + Math.cos(ang) * UA;
  const a2 = ang + bend;
  return { ex, ey, hx: ex + Math.sin(a2) * FA, hy: ey + Math.cos(a2) * FA };
}
function handPos(S, ang, bend) { const j = armJoints(S, ang, bend == null ? 0.5 : bend); return { x: j.hx, y: j.hy }; }

// ───────────── 영웅 그리기 ─────────────
// o: { awake, star, t, face(1|-1), noAura, gear }
function drawHero(c, def, P, o) {
  const L = def.look, E = ELEMS[def.elem];
  const t = o.t || 0;
  c.save();
  if (o.face < 0) c.scale(-1, 1);
  c.translate(P.shift, P.jump);

  if (o.awake && !o.noAura) drawAwakenAura(c, E, t);
  else if (o.star >= 6 && !o.noAura) { const g = c.createRadialGradient(0, -40, 4, 0, -40, 50); g.addColorStop(0, rgba(E.glow, 0.28)); g.addColorStop(1, rgba(E.glow, 0)); c.fillStyle = g; circle(c, 0, -40, 50); c.fill(); }
  if (P.glow > 0) {
    const g = c.createRadialGradient(0, -40, 6, 0, -40, 72);
    g.addColorStop(0, rgba(E.light, 0.55 * P.glow)); g.addColorStop(0.5, rgba(E.color, 0.25 * P.glow)); g.addColorStop(1, rgba(E.color, 0));
    c.fillStyle = g; circle(c, 0, -40, 72); c.fill();
  }
  // 그림자
  c.save(); c.translate(0, -P.jump);
  const sh = 1 + P.jump / 80;
  c.fillStyle = 'rgba(10,0,20,0.3)'; c.beginPath(); c.ellipse(0, 1, 19 * sh, 5 * sh, 0, 0, TAU); c.fill();
  c.restore();

  c.scale(1, P.sq);
  const hipY = -21 + P.bob * 0.4;
  const K = { L, E, def, P, t, o, trim: o.awake ? '#ffe27a' : L.trim, metal: o.awake ? '#fff3c4' : '#e8eef8' };

  drawLegs(c, K, hipY);

  c.save();
  c.translate(0, hipY + P.bob * 0.6);
  c.rotate(P.lean);
  const SF = { x: 7, y: -22 }, SB = { x: -6.5, y: -22 };
  K.hx = 2; K.hy = -45;

  drawBackLayer(c, K);
  // 뒷팔
  drawArm(c, K, SB, P.armB, P.bendB, true);
  if (def.weapon === 'daggers' || def.weapon === 'gauntlet') drawWeaponAt(c, K, SB, P.armB, P.bendB, P.wb, true);
  if (def.weapon === 'book') drawBook(c, K, SB);
  if (P.smearB) drawSmear(c, K, SB, P.smearB, 30);

  drawTorso(c, K);
  drawFrontExtras(c, K);
  // 머리 (살짝 기울임)
  c.save(); c.translate(K.hx, K.hy + 12); c.rotate(P.headTilt + P.lean * -0.3); c.translate(-K.hx, -K.hy - 12);
  drawHead(c, K);
  c.restore();

  if (L.extras.includes('shield')) drawShield(c, K, SB);
  if (P.smear) drawSmear(c, K, SF, P.smear, { scythe: 58, hammer: 46, greatsword: 54 }[def.weapon] || 42);
  if (!P.hideWpn || P.wpnFade) {
    c.save(); if (P.hideWpn) c.globalAlpha *= P.wpnFade || 0;
    if (def.weapon !== 'gauntlet' && def.weapon !== 'book') drawWeaponAt(c, K, SF, P.armF, P.bendF, P.wa, false);
    c.restore();
  }
  drawArm(c, K, SF, P.armF, P.bendF, false);
  if (def.weapon === 'gauntlet') drawWeaponAt(c, K, SF, P.armF, P.bendF, 0, false);
  if (def.weapon === 'orb') drawOrb(c, K, SF);
  c.restore();

  if (P.stun) {
    for (let i = 0; i < 3; i++) {
      const a = t * 4 + i * TAU / 3;
      star5(c, Math.cos(a) * 16, -84 + Math.sin(a) * 5, 5, 2.2); flatLine(c, '#ffe14d', '#7a4a00', 1.2);
    }
  }
  c.restore();
}

function drawAwakenAura(c, E, t) {
  c.save();
  c.translate(0, -42);
  const pulse = 0.85 + Math.sin(t * 3) * 0.15;
  const g = c.createRadialGradient(0, 0, 6, 0, 0, 64 * pulse);
  g.addColorStop(0, rgba(E.light, 0.5)); g.addColorStop(0.55, rgba(E.color, 0.22)); g.addColorStop(1, rgba(E.color, 0));
  c.fillStyle = g; circle(c, 0, 0, 64 * pulse); c.fill();
  c.save(); c.scale(1, 0.33); c.translate(0, 126);
  c.rotate(t * 0.8);
  c.strokeStyle = rgba(E.light, 0.8); c.lineWidth = 2.2;
  circle(c, 0, 0, 40); c.stroke();
  c.lineWidth = 1; circle(c, 0, 0, 33); c.stroke();
  for (let i = 0; i < 12; i++) {
    c.rotate(TAU / 12);
    c.beginPath(); c.moveTo(35, 0); c.lineTo(40, -3); c.lineTo(45, 0); c.lineTo(40, 3); c.closePath(); c.fillStyle = rgba(i % 2 ? E.glow : '#ffffff', 0.85); c.fill();
  }
  c.restore();
  // 떠오르는 빛 입자
  for (let i = 0; i < 5; i++) {
    const k = (t * 0.6 + i / 5) % 1;
    c.fillStyle = rgba(E.light, (1 - k) * 0.9);
    circle(c, Math.sin(i * 2.3 + t) * 24, 30 - k * 70, 1.6 + (i % 2)); c.fill();
  }
  c.restore();
}

// ───────────── 다리 ─────────────
function drawLegs(c, K, hipY) {
  const { L, P } = K;
  const pants = L.pants || (L.body === 'robe' ? shade(L.c1, -0.4) : shade(L.c2, -0.05));
  const boot = L.boot || shade(L.c2, -0.45);
  for (const [x, a, back] of [[-4.5, P.legB, true], [4.5, P.legF, false]]) {
    c.save(); c.translate(x, hipY); c.rotate(a);
    const pc = back ? shade(pants, -0.18) : pants, bc = back ? shade(boot, -0.2) : boot;
    if (L.body !== 'robe') { limbPath(c, 0, 0, 0.5, 10, 4.6, 3.8); cel(c, pc, [-5, -5, 10, 18], { lw: 1.4 }); }
    // 부츠: 정강이 + 발
    c.beginPath();
    c.moveTo(-4, 8); c.lineTo(4, 8); c.lineTo(4.5, 15); c.quadraticCurveTo(10, 15, 10.5, 18.5); c.lineTo(10.5, 20.5); c.lineTo(-4.5, 20.5); c.lineTo(-4.5, 15); c.closePath();
    cel(c, bc, [-5, 8, 16, 13], { lw: 1.4 });
    c.fillStyle = shade(bc, -0.4); c.fillRect(-4.5, 19, 15, 1.6);
    c.fillStyle = back ? shade(K.trim, -0.2) : K.trim; c.fillRect(-4.2, 8.4, 8.4, 2.2);
    c.fillStyle = rgba('#ffffff', 0.3); c.fillRect(1.5, 11, 1.6, 4);
    c.restore();
  }
}

// ───────────── 팔 (2관절) ─────────────
function drawArm(c, K, S, ang, bend, back) {
  const { L } = K;
  const j = armJoints(S, ang, bend);
  const sleeve = back ? shade(L.c1, -0.22) : L.c1;
  const glove = L.glove || (L.body === 'armor' ? K.metal : L.skin);
  const gl = back ? shade(glove, -0.18) : glove;
  // 아래팔 (장갑/팔뚝)
  limbPath(c, j.ex, j.ey, j.hx, j.hy, 3.7, 3.2);
  cel(c, L.body === 'armor' ? gl : (L.bracer ? (back ? shade(L.bracer, -0.2) : L.bracer) : (back ? shade(L.skin, -0.12) : L.skin)), [j.ex - 5, j.ey - 5, 12, 14], { lw: 1.3 });
  // 위팔 (소매)
  if (L.body === 'robe') {
    // 넓은 소매
    const a = Math.atan2(j.ey - S.y, j.ex - S.x);
    c.beginPath();
    c.moveTo(S.x + Math.cos(a + 1.6) * 4.5, S.y + Math.sin(a + 1.6) * 4.5);
    c.lineTo(j.ex + Math.cos(a + 1.9) * 6.5 + Math.cos(a) * 2, j.ey + Math.sin(a + 1.9) * 6.5 + Math.sin(a) * 2);
    c.quadraticCurveTo(j.ex + Math.cos(a) * 5, j.ey + Math.sin(a) * 5, j.ex + Math.cos(a - 1.9) * 6.5 + Math.cos(a) * 2, j.ey + Math.sin(a - 1.9) * 6.5 + Math.sin(a) * 2);
    c.lineTo(S.x + Math.cos(a - 1.6) * 4.5, S.y + Math.sin(a - 1.6) * 4.5);
    c.closePath();
    cel(c, sleeve, [S.x - 8, S.y - 8, 18, 18], { lw: 1.3 });
    c.strokeStyle = back ? shade(K.trim, -0.2) : K.trim; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(j.ex + Math.cos(a + 1.9) * 6 + Math.cos(a) * 2, j.ey + Math.sin(a + 1.9) * 6 + Math.sin(a) * 2);
    c.quadraticCurveTo(j.ex + Math.cos(a) * 4.5, j.ey + Math.sin(a) * 4.5, j.ex + Math.cos(a - 1.9) * 6 + Math.cos(a) * 2, j.ey + Math.sin(a - 1.9) * 6 + Math.sin(a) * 2); c.stroke();
  } else {
    limbPath(c, S.x, S.y, j.ex, j.ey, 4.6, 3.9);
    cel(c, sleeve, [S.x - 6, S.y - 6, 14, 16], { lw: 1.3 });
    const ca = Math.atan2(j.ey - S.y, j.ex - S.x) + Math.PI / 2;
    c.strokeStyle = back ? shade(K.trim, -0.25) : K.trim; c.lineWidth = 2.2; c.lineCap = 'butt';
    c.beginPath(); c.moveTo(j.ex - Math.cos(ca) * 3.6, j.ey - Math.sin(ca) * 3.6); c.lineTo(j.ex + Math.cos(ca) * 3.6, j.ey + Math.sin(ca) * 3.6); c.stroke(); c.lineCap = 'round';
  }
  // 어깨 갑옷
  if (L.body === 'armor' || L.extras.includes('shoulder')) {
    c.beginPath(); c.ellipse(S.x + (back ? -1 : 1), S.y + 1, 7, 5.5, back ? -0.3 : 0.3, Math.PI * 0.95, Math.PI * 2.05); c.closePath();
    cel(c, back ? shade(L.armorCol || L.c1, -0.15) : (L.armorCol || L.c1), [S.x - 8, S.y - 6, 16, 8], { lw: 1.3, dir: 1 });
    c.strokeStyle = K.trim; c.lineWidth = 1.4; c.beginPath(); c.ellipse(S.x + (back ? -1 : 1), S.y + 1, 5.5, 4, back ? -0.3 : 0.3, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
  }
  // 손
  c.beginPath(); c.ellipse(j.hx, j.hy, 3.5, 3.2, 0, 0, TAU);
  cel(c, gl, [j.hx - 4, j.hy - 4, 8, 8], { lw: 1.3 });
  return j;
}

// ───────────── 몸통 ─────────────
function torsoPath(c) {
  c.beginPath();
  c.moveTo(-9.5, -24); c.quadraticCurveTo(0, -27, 9.5, -24);
  c.quadraticCurveTo(11.5, -22, 10.5, -17); c.quadraticCurveTo(8.5, -10, 8, -6); c.quadraticCurveTo(10, -3, 10.5, 0);
  c.lineTo(-10.5, 0); c.quadraticCurveTo(-10, -3, -8, -6); c.quadraticCurveTo(-8.5, -10, -10.5, -17); c.quadraticCurveTo(-11.5, -22, -9.5, -24);
  c.closePath();
}
function drawTorso(c, K) {
  const { L, P } = K, trim = K.trim, c1 = L.c1, c2 = L.c2;
  const BB = [-12, -28, 24, 30];
  if (L.body === 'robe') {
    // 긴 로브 (밑단이 퍼짐)
    const sw = Math.sin(K.t * 3) * 1.2;
    c.beginPath();
    c.moveTo(-9.5, -24); c.quadraticCurveTo(0, -27, 9.5, -24);
    c.quadraticCurveTo(11, -14, 10, -6); c.quadraticCurveTo(14, 6, 16 + sw, 19);
    c.quadraticCurveTo(10, 21, 5, 19.5); c.quadraticCurveTo(0, 22, -5, 19.5); c.quadraticCurveTo(-10, 21, -16 + sw, 19);
    c.quadraticCurveTo(-14, 6, -10, -6); c.quadraticCurveTo(-11, -14, -9.5, -24); c.closePath();
    cel(c, c1, [-17, -28, 34, 50], { cut: 0.6 });
    // 앞섶 + 밑단 장식
    c.strokeStyle = trim; c.lineWidth = 2.4; c.beginPath(); c.moveTo(1, -24); c.quadraticCurveTo(3, -2, 4, 19.5); c.stroke();
    c.lineWidth = 2.2; c.beginPath(); c.moveTo(-15.5 + sw, 17.5); c.quadraticCurveTo(-10, 19.5, -5, 18); c.quadraticCurveTo(0, 20.5, 5, 18); c.quadraticCurveTo(10, 19.5, 15.5 + sw, 17.5); c.stroke();
    c.strokeStyle = rgba(shadeOf(c1), 0.7); c.lineWidth = 1; c.beginPath(); c.moveTo(-6, -2); c.quadraticCurveTo(-8, 8, -9, 17); c.moveTo(9, 0); c.quadraticCurveTo(10, 9, 11, 16); c.stroke();
    // 옷깃
    c.beginPath(); c.moveTo(-7, -25); c.lineTo(1, -17); c.lineTo(8, -25); c.quadraticCurveTo(0, -23, -7, -25); flatLine(c, c2, lineOf(c2), 1.2);
    // 허리띠 + 늘어진 끈
    c.beginPath(); c.moveTo(-10.5, -9); c.quadraticCurveTo(0, -7, 10.5, -9); c.lineTo(10.5, -5); c.quadraticCurveTo(0, -3, -10.5, -5); c.closePath(); cel(c, c2, [-11, -9, 22, 6], { lw: 1.2 });
    c.beginPath(); c.moveTo(-3, -5); c.quadraticCurveTo(-5, 2, -3 - sw, 8); c.lineTo(-1 - sw, 8); c.quadraticCurveTo(-2, 2, -1, -5); flatLine(c, c2, lineOf(c2), 1);
    c.beginPath(); c.arc(-2, -6, 2.6, 0, TAU); flatLine(c, trim, lineOf(trim), 1);
  } else if (L.body === 'coat') {
    // 셔츠
    torsoPath(c); cel(c, c2, BB);
    // 코트 앞자락 (양쪽)
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(s * 2, -25); c.quadraticCurveTo(s * 9.5, -26, s * 10.5, -18); c.quadraticCurveTo(s * 9, -9, s * 9.5, -4);
      c.quadraticCurveTo(s * 12, 6, s * 12.5, 13); c.lineTo(s * 5, 11); c.quadraticCurveTo(s * 4, 0, s * 3, -6); c.lineTo(s * 4.5, -14); c.closePath();
      cel(c, s < 0 ? shade(c1, -0.1) : c1, [-13, -27, 26, 41]);
    }
    // 옷깃 (라펠)
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 2, -25); c.lineTo(s * 4.5, -14); c.lineTo(s * 8, -20); c.closePath(); flatLine(c, shade(c1, 0.15), lineOf(c1), 1.1); }
    c.strokeStyle = trim; c.lineWidth = 1.5; c.beginPath(); c.moveTo(5, 11); c.quadraticCurveTo(4, 0, 3, -6); c.moveTo(-5, 11); c.quadraticCurveTo(-4, 0, -3, -6); c.stroke();
    c.beginPath(); c.moveTo(-9, -6.5); c.quadraticCurveTo(0, -5, 9, -6.5); c.lineTo(9, -3); c.quadraticCurveTo(0, -1.5, -9, -3); c.closePath(); cel(c, shade(c2, -0.4), [-9, -7, 18, 6], { lw: 1.1 });
    for (let i = 0; i < 3; i++) { c.fillStyle = trim; circle(c, 3.6, -21 + i * 5, 1.1); c.fill(); }
  } else if (L.body === 'armor') {
    // 허리 갑주 (치마형 판갑)
    for (const [x0, x1, d] of [[-11, -3.5, -1], [-3.8, 3.8, 0], [3.5, 11, 1]]) {
      c.beginPath(); c.moveTo(x0, -4); c.lineTo(x1, -4); c.lineTo(x1 + d * 1.5, 7); c.quadraticCurveTo((x0 + x1) / 2, 8.5, x0 + d * 1.5, 7); c.closePath();
      cel(c, L.c2, [x0, -4, x1 - x0, 12], { lw: 1.2, dir: 1 });
      c.strokeStyle = trim; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x0 + 1 + d, 5.5); c.quadraticCurveTo((x0 + x1) / 2, 7, x1 - 1 + d, 5.5); c.stroke();
    }
    torsoPath(c); cel(c, L.armorCol || c1, BB, { cut: 0.55 });
    // 흉갑 무늬
    c.strokeStyle = trim; c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(-8, -23.5); c.quadraticCurveTo(0, -15, 8, -23.5); c.stroke();
    c.lineWidth = 1.2; c.strokeStyle = rgba(lineOf(L.armorCol || c1), 0.7);
    c.beginPath(); c.moveTo(0, -18); c.lineTo(0, -8); c.moveTo(-7, -12); c.quadraticCurveTo(0, -9, 7, -12); c.stroke();
    c.fillStyle = rgba('#ffffff', 0.55); c.beginPath(); c.ellipse(5, -19, 2.4, 3.8, 0.3, 0, TAU); c.fill();
    // 속옷 깃
    c.beginPath(); c.moveTo(-5, -25.5); c.quadraticCurveTo(0, -22, 5, -25.5); c.lineTo(3, -27); c.quadraticCurveTo(0, -25, -3, -27); c.closePath(); flatLine(c, c2, lineOf(c2), 1);
    // 벨트
    c.beginPath(); c.moveTo(-9, -6.5); c.quadraticCurveTo(0, -5, 9, -6.5); c.lineTo(9.5, -3); c.quadraticCurveTo(0, -1.5, -9.5, -3); c.closePath(); cel(c, '#5a3a2a', [-10, -7, 20, 6], { lw: 1.1 });
    c.beginPath(); c.rect(-2.2, -6.2, 4.4, 3.8); flatLine(c, trim, lineOf(trim), 1);
    // 가슴 보석
    c.beginPath(); c.moveTo(0, -16.5); c.lineTo(2.2, -14); c.lineTo(0, -11.5); c.lineTo(-2.2, -14); c.closePath(); flatLine(c, K.E.color, lineOf(K.E.color), 1);
    c.fillStyle = '#ffffff'; c.fillRect(-0.8, -15.5, 1.2, 1.2);
  } else {
    // 경장: 짧은 치마/바지 자락 + 상의
    c.beginPath(); c.moveTo(-10, -5); c.lineTo(10, -5); c.quadraticCurveTo(12, 1, 12.5, 6); c.quadraticCurveTo(0, 8.5, -12.5, 6); c.quadraticCurveTo(-12, 1, -10, -5); c.closePath();
    cel(c, L.skirt || shade(c1, -0.12), [-13, -5, 26, 13], { dir: 1 });
    c.strokeStyle = trim; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-12, 4.8); c.quadraticCurveTo(0, 7.2, 12, 4.8); c.stroke();
    c.strokeStyle = rgba(shadeOf(c1), 0.8); c.lineWidth = 1; c.beginPath(); c.moveTo(-4, -4); c.lineTo(-5, 6); c.moveTo(4, -4); c.lineTo(5, 6); c.stroke();
    torsoPath(c); cel(c, c1, BB);
    // 대각선 끈 + 장식
    c.strokeStyle = shade(c2, -0.2); c.lineWidth = 2.6; c.beginPath(); c.moveTo(-9, -23); c.lineTo(8, -7); c.stroke();
    c.strokeStyle = lineOf(c2); c.lineWidth = 0.8; c.stroke();
    c.beginPath(); c.moveTo(-6, -25); c.quadraticCurveTo(0, -20, 6, -25); c.lineWidth = 1.4; c.strokeStyle = trim; c.stroke();
    c.beginPath(); c.moveTo(-9.5, -7); c.quadraticCurveTo(0, -5.5, 9.5, -7); c.lineTo(10, -3.5); c.quadraticCurveTo(0, -2, -10, -3.5); c.closePath(); cel(c, c2, [-10, -7, 20, 6], { lw: 1.1 });
    c.beginPath(); c.arc(1, -5, 2, 0, TAU); flatLine(c, trim, lineOf(trim), 1);
    // 허리 주머니
    c.beginPath(); pathRR(c, -10, -4, 5, 6, 1.5); cel(c, '#7a5232', [-10, -4, 5, 6], { lw: 1 });
  }
}

// ───────────── 머리 ─────────────
function facePath(c, hx, hy) {
  c.beginPath();
  c.moveTo(hx - 20, hy - 1);
  c.arc(hx, hy - 2, 20.2, Math.PI * 1.02, Math.PI * 1.98);
  c.bezierCurveTo(hx + 21.5, hy + 8, hx + 17, hy + 17, hx + 8, hy + 20.5);
  c.quadraticCurveTo(hx + 4, hy + 22, hx, hy + 20.5);
  c.bezierCurveTo(hx - 10, hy + 18, hx - 19, hy + 11, hx - 20, hy - 1);
  c.closePath();
}

function drawHead(c, K) {
  const { L, P, hx, hy } = K;
  const hs = L.hairStyle;
  // 목
  c.beginPath(); c.rect(-2.5, -29, 7, 7); c.fillStyle = shade(L.skin, -0.22); c.fill();
  // 귀
  if (L.extras.includes('elfEars')) {
    c.beginPath(); c.moveTo(hx - 14, hy + 2); c.quadraticCurveTo(hx - 26, hy - 6, hx - 32, hy - 14); c.quadraticCurveTo(hx - 24, hy + 2, hx - 15, hy + 10); c.closePath();
    cel(c, L.skin, [hx - 32, hy - 14, 18, 24], { lw: 1.3 });
  } else if (hs !== 'hood' && hs !== 'helm') {
    c.beginPath(); c.ellipse(hx - 17, hy + 5, 3.6, 5, -0.2, 0, TAU); cel(c, L.skin, [hx - 21, hy, 8, 10], { lw: 1.2 });
    c.strokeStyle = shade(L.skin, -0.3); c.lineWidth = 1; c.beginPath(); c.arc(hx - 17, hy + 5, 2, -1, 1.5); c.stroke();
  }
  // 얼굴
  facePath(c, hx, hy);
  const g = c.createLinearGradient(hx + 20, 0, hx - 20, 0);
  g.addColorStop(0, shade(L.skin, 0.08)); g.addColorStop(0.5, L.skin); g.addColorStop(0.8, L.skin); g.addColorStop(0.801, shade(L.skin, -0.1)); g.addColorStop(1, shade(L.skin, -0.14));
  c.fillStyle = g; c.fill();
  // 앞머리 그림자 (이마)
  c.save(); c.clip();
  c.fillStyle = rgba(mix(shade(L.skin, -0.3), '#7a3a5a', 0.25), 0.55);
  c.beginPath(); c.moveTo(hx - 22, hy - 6); c.quadraticCurveTo(hx, hy + 1, hx + 24, hy - 2); c.lineTo(hx + 24, hy - 30); c.lineTo(hx - 22, hy - 30); c.closePath(); c.fill();
  c.restore();
  facePath(c, hx, hy);
  c.lineWidth = 1.5; c.strokeStyle = lineOf(L.skin); c.stroke();

  drawFace(c, K);
  drawHairFront(c, K);
}

// 애니메 눈. o = 바깥 눈꼬리 방향(+1 오른쪽, -1 왼쪽), sc = 가로 압축(먼 쪽 눈)
function drawEye(c, K, x, y, w, h, o, sc) {
  const { L, P, def } = K;
  const eyeC = L.eye, type = L.eyeType || 'round', fem = L.g === 'f';
  const ink = mix(shade(eyeC, -0.75), '#140a1c', 0.55);
  c.save(); c.translate(x, y);
  const mk = fn => { c.save(); c.scale(o * sc, 1); fn(); c.restore(); };   // 눈꼬리 방향 기준 좌표로 경로 만들기
  if (P.eyes === 'closed' || P.eyes === 'happy' || P.eyes === 'dizzy') {
    c.strokeStyle = ink; c.lineCap = 'round'; c.lineJoin = 'round';
    if (P.eyes === 'dizzy') {
      c.lineWidth = 1.4; c.beginPath();
      for (let a = 0; a < 10; a += 0.35) { const r = a * 0.55 * Math.min(1, w / 10); c.lineTo(Math.cos(a) * r * sc, Math.sin(a) * r); }
      c.stroke();
    } else if (P.eyes === 'happy') {
      c.lineWidth = 2.2; mk(() => { c.beginPath(); c.moveTo(-w * 0.48, h * 0.12); c.quadraticCurveTo(0, -h * 0.42, w * 0.5, h * 0.08); }); c.stroke();
    } else {
      c.lineWidth = 2.2; mk(() => { c.beginPath(); c.moveTo(-w * 0.5, 0); c.quadraticCurveTo(0, h * 0.32, w * 0.52, -h * 0.04); }); c.stroke();
      c.lineWidth = 1.1; mk(() => { c.beginPath(); c.moveTo(w * 0.42, 0); c.lineTo(w * 0.62, h * 0.12); c.moveTo(w * 0.25, h * 0.1); c.lineTo(w * 0.35, h * 0.26); }); c.stroke();
    }
    c.restore(); return;
  }
  const tilt = type === 'sharp' ? 0.2 : type === 'calm' ? 0.02 : 0.08;
  const drop = (P.eyes === 'angry' ? 0.34 : P.eyes === 'focus' ? 0.2 : 0) + (type === 'calm' ? 0.14 : 0);
  const lidY = -h * (0.56 - drop * 0.6);
  const inX = -w * 0.5, inY = -h * 0.02, outX = w * 0.52, outY = -h * (0.16 + tilt) + drop * h * 0.15;
  const shape = () => mk(() => {
    c.beginPath(); c.moveTo(inX, inY);
    c.bezierCurveTo(inX + w * 0.12, lidY, outX - w * 0.3, lidY - h * 0.06, outX, outY);
    c.bezierCurveTo(outX + w * 0.03, h * 0.22, w * 0.22, h * 0.52, -w * 0.02, h * 0.5);
    c.bezierCurveTo(-w * 0.32, h * 0.48, inX - w * 0.02, h * 0.24, inX, inY);
    c.closePath();
  });
  // 흰자
  shape();
  const sg = c.createLinearGradient(0, -h * 0.5, 0, h * 0.5); sg.addColorStop(0, '#d9d4ec'); sg.addColorStop(0.35, '#ffffff'); sg.addColorStop(1, '#f4f2ff');
  c.fillStyle = sg; c.fill();
  c.save(); c.clip();
  // 홍채
  const gx = w * 0.05 * sc, gy = h * 0.06, rx = w * 0.4 * sc, ry = h * 0.46;
  const ig = c.createLinearGradient(0, gy - ry, 0, gy + ry);
  ig.addColorStop(0, shade(eyeC, -0.7)); ig.addColorStop(0.32, shade(eyeC, -0.28)); ig.addColorStop(0.68, eyeC); ig.addColorStop(1, shade(eyeC, 0.55));
  c.beginPath(); c.ellipse(gx, gy, rx, ry, 0, 0, TAU); c.fillStyle = ig; c.fill();
  // 홍채 결 (방사선)
  c.strokeStyle = rgba(shade(eyeC, 0.5), 0.35); c.lineWidth = 0.5;
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; c.beginPath(); c.moveTo(gx + Math.cos(a) * rx * 0.45, gy + Math.sin(a) * ry * 0.45); c.lineTo(gx + Math.cos(a) * rx * 0.85, gy + Math.sin(a) * ry * 0.85); c.stroke(); }
  // 아래쪽 반사광 (초승달)
  c.beginPath(); c.ellipse(gx, gy + ry * 0.55, rx * 0.66, ry * 0.32, 0, 0, TAU); c.fillStyle = rgba(shade(eyeC, 0.7), 0.75); c.fill();
  // 동공
  const pg = c.createRadialGradient(gx, gy - ry * 0.05, 0, gx, gy - ry * 0.05, rx * 0.55);
  pg.addColorStop(0, rgba(shade(eyeC, -0.85), 1)); pg.addColorStop(0.75, rgba(shade(eyeC, -0.8), 0.9)); pg.addColorStop(1, rgba(shade(eyeC, -0.6), 0));
  c.beginPath(); c.ellipse(gx, gy - ry * 0.05, rx * 0.5, ry * 0.56, 0, 0, TAU); c.fillStyle = pg; c.fill();
  // 홍채 테두리
  c.beginPath(); c.ellipse(gx, gy, rx, ry, 0, 0, TAU); c.lineWidth = 0.9; c.strokeStyle = rgba(ink, 0.9); c.stroke();
  if (K.o.awake) { c.save(); c.globalCompositeOperation = 'lighter'; c.beginPath(); c.ellipse(gx, gy + ry * 0.3, rx * 0.8, ry * 0.5, 0, 0, TAU); c.fillStyle = rgba(ELEMS[def.elem].light, 0.35); c.fill(); c.restore(); }
  // 눈꺼풀 그림자
  const lg = c.createLinearGradient(0, -h * 0.55, 0, -h * 0.05); lg.addColorStop(0, 'rgba(60,30,80,0.55)'); lg.addColorStop(1, 'rgba(60,30,80,0)');
  c.fillStyle = lg; c.fillRect(-w, -h, w * 2, h * 0.95);
  c.restore();
  // 하이라이트
  c.fillStyle = '#ffffff';
  c.beginPath(); c.ellipse(gx - rx * 0.38, gy - ry * 0.32, rx * 0.36, ry * 0.26, -0.5, 0, TAU); c.fill();
  c.beginPath(); c.arc(gx + rx * 0.45, gy + ry * 0.38, rx * 0.17, 0, TAU); c.fill();
  c.globalAlpha *= 0.85; c.beginPath(); c.arc(gx - rx * 0.05, gy + ry * 0.12, rx * 0.08, 0, TAU); c.fill(); c.globalAlpha /= 0.85;
  if (fem || K.o.awake) { c.fillStyle = K.o.awake ? ELEMS[def.elem].light : '#ffffff'; star5(c, gx + rx * 0.35, gy - ry * 0.45, rx * 0.2, rx * 0.07, 0); c.fill(); }
  // 쌍꺼풀 선
  c.strokeStyle = rgba(ink, 0.55); c.lineWidth = 0.8; c.lineCap = 'round';
  mk(() => { c.beginPath(); c.moveTo(inX + w * 0.15, lidY * 0.88 - h * 0.08); c.quadraticCurveTo(0, lidY - h * 0.14, outX - w * 0.05, outY - h * 0.16); }); c.stroke();
  // 위 속눈썹 (안쪽은 가늘고 바깥으로 갈수록 두꺼움 + 눈꼬리 뻗침)
  mk(() => {
    c.beginPath();
    c.moveTo(inX - w * 0.02, inY + h * 0.02);
    c.bezierCurveTo(inX + w * 0.12, lidY - h * 0.03, outX - w * 0.3, lidY - h * 0.1, outX + w * 0.04, outY - h * 0.02);
    const fl = type === 'sharp' ? 0.32 : 0.2;
    c.lineTo(outX + w * fl, outY - h * (fem ? 0.2 : 0.1));
    c.lineTo(outX + w * 0.08, outY + h * 0.08);
    c.bezierCurveTo(outX - w * 0.3, lidY + h * 0.12, inX + w * 0.12, lidY + h * 0.14, inX, inY);
    c.closePath();
  });
  c.fillStyle = ink; c.fill();
  if (fem) {
    c.strokeStyle = ink; c.lineWidth = 1;
    mk(() => { c.beginPath(); c.moveTo(outX - w * 0.05, outY - h * 0.08); c.lineTo(outX + w * 0.12, outY - h * 0.34); c.moveTo(outX - w * 0.22, lidY + h * 0.02); c.lineTo(outX - w * 0.14, lidY - h * 0.2); }); c.stroke();
  }
  // 아래 속눈썹
  c.strokeStyle = rgba(ink, 0.5); c.lineWidth = 0.8;
  mk(() => { c.beginPath(); c.moveTo(outX - w * 0.04, h * 0.22); c.quadraticCurveTo(w * 0.3, h * 0.44, w * 0.12, h * 0.5); }); c.stroke();
  c.restore();
}

function drawFace(c, K) {
  const { L, P, hx, hy } = K;
  // 볼터치 + 빗금
  const blush = (bx, by, rx) => {
    const g = c.createRadialGradient(bx, by, 0, bx, by, rx);
    g.addColorStop(0, 'rgba(255,105,130,0.45)'); g.addColorStop(1, 'rgba(255,105,130,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(bx, by, rx, rx * 0.55, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(230,80,110,0.45)'; c.lineWidth = 0.7;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(bx - rx * 0.4 + i * rx * 0.35, by + rx * 0.2); c.lineTo(bx - rx * 0.2 + i * rx * 0.35, by - rx * 0.2); c.stroke(); }
  };
  blush(hx - 4, hy + 15, 5.5);
  blush(hx + 15.5, hy + 14.5, 3.4);
  // 눈썹
  const ang = P.eyes === 'angry' ? 0.38 : P.eyes === 'focus' ? 0.18 : L.eyeType === 'sharp' ? 0.12 : -0.08;
  const bc = shade(L.hair, -0.5);
  c.lineCap = 'round'; c.strokeStyle = bc;
  c.lineWidth = 1.7; c.beginPath(); c.moveTo(hx - 10, hy - 1 - 2.5 * Math.sin(-ang)); c.quadraticCurveTo(hx - 4, hy - 3.5, hx + 2.5, hy - 1.2 + 2.5 * Math.sin(-ang)); c.stroke();
  c.lineWidth = 1.4; c.beginPath(); c.moveTo(hx + 10, hy - 1 + 1.5 * Math.sin(-ang)); c.quadraticCurveTo(hx + 14, hy - 3, hx + 17.5, hy - 1.5 - 1.5 * Math.sin(-ang)); c.stroke();
  // 눈 (가까운 눈은 크게 왼쪽, 먼 눈은 좁게 오른쪽 윤곽 가까이)
  drawEye(c, K, hx - 3.5, hy + 7.5, 11.5, 13.5, -1, 1);
  drawEye(c, K, hx + 13.8, hy + 7.3, 10.5, 13, 1, 0.66);
  // 코
  c.strokeStyle = rgba(shade(L.skin, -0.4), 0.85); c.lineWidth = 0.9; c.beginPath(); c.moveTo(hx + 8.6, hy + 12.4); c.lineTo(hx + 9.6, hy + 13.4); c.stroke();
  c.fillStyle = rgba('#ffffff', 0.6); c.beginPath(); c.arc(hx + 8.2, hy + 11.4, 0.6, 0, TAU); c.fill();
  if (L.extras.includes('mask')) return;
  const mx = hx + 6, my = hy + 17.2;
  c.lineWidth = 1.2; c.strokeStyle = LINE_INK; c.lineCap = 'round';
  c.beginPath();
  if (P.mouth === 'shout') { c.moveTo(mx - 3, my - 1); c.quadraticCurveTo(mx, my - 2, mx + 3, my - 1); c.quadraticCurveTo(mx + 1, my + 4, mx - 2, my + 2.5); c.closePath(); c.fillStyle = '#8a2a3a'; c.fill(); c.stroke(); c.fillStyle = '#ff8a9a'; c.beginPath(); c.ellipse(mx - 0.3, my + 1.8, 1.4, 0.8, 0, 0, TAU); c.fill(); c.fillStyle = '#ffffff'; c.fillRect(mx - 2, my - 1, 3.5, 0.9); }
  else if (P.mouth === 'open') { c.moveTo(mx - 3, my - 1); c.quadraticCurveTo(mx, my + 4.5, mx + 3, my - 1); c.closePath(); c.fillStyle = '#c23a4a'; c.fill(); c.stroke(); c.fillStyle = '#ff8a9a'; c.beginPath(); c.ellipse(mx, my + 1.8, 1.3, 0.7, 0, 0, TAU); c.fill(); }
  else if (P.mouth === 'o') { c.ellipse(mx, my + 0.5, 1.4, 1.8, 0, 0, TAU); c.stroke(); }
  else if (L.mouth === 'smirk') { c.moveTo(mx - 2.2, my); c.quadraticCurveTo(mx + 0.5, my + 0.8, mx + 2.6, my - 1.4); c.stroke(); }
  else if (L.mouth === 'cat') { c.moveTo(mx - 2.6, my - 0.6); c.quadraticCurveTo(mx - 1.3, my + 1.2, mx, my - 0.2); c.quadraticCurveTo(mx + 1.3, my + 1.2, mx + 2.6, my - 0.6); c.stroke(); }
  else { c.moveTo(mx - 2.2, my - 0.5); c.quadraticCurveTo(mx, my + 1.3, mx + 2.2, my - 0.7); c.stroke(); }
}

// ───────────── 머리카락 ─────────────
function hairFill(c, L, y0, y1) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, shade(L.hair, 0.22)); g.addColorStop(0.55, L.hair); g.addColorStop(1, shade(L.hair, -0.22));
  return g;
}
function hairStrand(c, K, x0, y0, x1, y1, w, bend) {
  const L = K.L;
  strandPath(c, x0, y0, x1, y1, w, bend);
  c.fillStyle = hairFill(c, L, Math.min(y0, y1), Math.max(y0, y1)); c.fill();
  c.lineWidth = 1.2; c.strokeStyle = lineOf(L.hair); c.stroke();
}

const BANGS = {
  std:   [[-11, -15, -13, -1, 9, -2.5], [-5, -17, -6, 1, 10, -2], [2, -18, 2, 2, 10, -1], [9, -17, 9.5, 0, 9, 1.5], [15, -14, 18.5, -2, 8, 2.5]],
  spiky: [[-11, -15, -15, -1, 10, -4], [-5, -17, -8, 1.5, 10, -3], [2, -18, 1, 2.5, 10, -1], [9, -17, 10, 0.5, 10, 2], [15, -14, 21, -3, 9, 3.5]],
  side:  [[-11, -15, -12, -2, 9, -1], [-5, -17, 1, -1, 11, 3], [2, -18, 9, 0, 11, 3], [9, -17, 16, -1, 10, 3], [15, -14, 21.5, -2, 7, 2]],
  blunt: [[-12, -15, -13, 0, 9, 0], [-6, -17, -6, 1, 9, 0], [0, -18, 0, 1, 9, 0], [6, -17, 6, 1, 9, 0], [12, -16, 12.5, 0, 9, 0], [17, -13, 18.5, -1, 7, 0]],
};

function hairCapPath(c, hx, hy) {
  c.beginPath();
  c.moveTo(hx - 22.5, hy + 6);
  c.bezierCurveTo(hx - 27, hy - 26, hx + 26, hy - 32, hx + 24, hy - 1);
  c.quadraticCurveTo(hx + 21, hy - 10, hx + 15, hy - 14);
  c.quadraticCurveTo(hx + 2, hy - 20, hx - 11, hy - 15);
  c.quadraticCurveTo(hx - 18, hy - 10, hx - 22.5, hy + 6);
  c.closePath();
}
function drawHairCap(c, K, hx, hy) {
  const L = K.L;
  hairCapPath(c, hx, hy);
  c.fillStyle = hairFill(c, L, hy - 28, hy + 6); c.fill();
  c.lineWidth = 1.4; c.strokeStyle = lineOf(L.hair); c.stroke();
  c.save(); hairCapPath(c, hx, hy); c.clip();
  // 머리카락 결 (가닥 그림자)
  c.strokeStyle = rgba(shade(L.hair, -0.4), 0.55); c.lineWidth = 1; c.lineCap = 'round';
  for (const [x0, x1] of [[-14, -19], [-6, -12], [3, 0], [11, 14], [18, 21]]) { c.beginPath(); c.moveTo(hx + x0 * 0.4, hy - 27); c.quadraticCurveTo(hx + (x0 + x1) / 2, hy - 22, hx + x1, hy - 10); c.stroke(); }
  // 엔젤 링: 머리를 감싸는 부드러운 초승달 광택
  const hl = shade(L.hair, 0.7);
  const g = c.createLinearGradient(hx - 18, 0, hx + 20, 0);
  g.addColorStop(0, rgba(hl, 0)); g.addColorStop(0.3, rgba(hl, 0.75)); g.addColorStop(0.65, rgba(hl, 0.75)); g.addColorStop(1, rgba(hl, 0));
  c.beginPath(); c.arc(hx + 1, hy - 3, 19.5, -2.75, -0.45); c.arc(hx + 1, hy - 1, 16.5, -0.5, -2.7, true); c.closePath();
  c.fillStyle = g; c.fill();
  c.fillStyle = rgba('#ffffff', 0.8);
  c.beginPath(); c.ellipse(hx - 4, hy - 19.5, 3.2, 1.1, -0.35, 0, TAU); c.fill();
  c.restore();
}

function drawHairFront(c, K) {
  const { L, P, hx, hy, t, def, o } = K;
  const hs = L.hairStyle, ex = L.extras;
  if (hs === 'hood') { drawHood(c, K); return; }
  if (hs === 'helm') { drawHelm(c, K); return; }
  // 옆머리
  const sw = P.hairSwing * 0.6;
  hairStrand(c, K, hx - 17, hy - 8, hx - 19 - sw, hy + 20, 9, -2);
  hairStrand(c, K, hx + 19, hy - 8, hx + 21 - sw * 0.5, hy + 17, 7, 1.5);
  // 앞머리
  const B = BANGS[L.bangs || (hs === 'spiky' ? 'spiky' : (hs === 'pony' || hs === 'long') ? 'side' : hs === 'bob' ? 'blunt' : 'std')];
  for (const [rx, ry, tx, ty, w, bend] of B) hairStrand(c, K, hx + rx, hy + ry, hx + tx, hy + ty, w, bend);
  drawHairCap(c, K, hx, hy);
  // 바보털
  if (L.ahoge !== false && hs !== 'short') {
    const a = Math.sin(t * 3) * 1.5;
    c.beginPath(); c.moveTo(hx - 2, hy - 26); c.quadraticCurveTo(hx + 4 + a, hy - 40, hx + 10 + a, hy - 36); c.quadraticCurveTo(hx + 4, hy - 34, hx + 2, hy - 25.5); c.closePath();
    c.fillStyle = shade(L.hair, 0.15); c.fill(); c.lineWidth = 1.1; c.strokeStyle = lineOf(L.hair); c.stroke();
  }
  drawHeadgear(c, K);
}

function drawHood(c, K) {
  const { L, hx, hy } = K;
  hairStrand(c, K, hx + 2, hy - 15, hx + 4, hy + 1, 9, -1);
  hairStrand(c, K, hx + 9, hy - 14, hx + 11, hy + 2, 8, 1);
  hairStrand(c, K, hx - 5, hy - 13, hx - 6, hy + 4, 8, -1);
  c.beginPath();
  c.moveTo(hx + 22, hy + 6);
  c.bezierCurveTo(hx + 30, hy - 26, hx - 22, hy - 36, hx - 28, hy - 4);
  c.quadraticCurveTo(hx - 30, hy + 18, hx - 14, hy + 26);
  c.lineTo(hx - 10, hy + 14);
  c.quadraticCurveTo(hx - 12, hy - 14, hx + 6, hy - 16);
  c.quadraticCurveTo(hx + 19, hy - 14, hx + 22, hy + 6);
  c.closePath();
  cel(c, L.c1, [hx - 30, hy - 32, 60, 58], { cut: 0.5 });
  c.strokeStyle = K.trim; c.lineWidth = 1.8; c.beginPath(); c.moveTo(hx - 10, hy + 14); c.quadraticCurveTo(hx - 12, hy - 14, hx + 6, hy - 16); c.quadraticCurveTo(hx + 19, hy - 14, hx + 22, hy + 6); c.stroke();
  c.strokeStyle = rgba(shadeOf(L.c1), 0.8); c.lineWidth = 1; c.beginPath(); c.moveTo(hx - 8, hy - 28); c.quadraticCurveTo(hx - 22, hy - 18, hx - 22, hy + 8); c.stroke();
}

function drawHelm(c, K) {
  const { L, hx, hy, t } = K;
  const sw = Math.sin(t * 3) * 2;
  // 깃털 장식
  for (let i = 0; i < 3; i++) { strandPath(c, hx - 2, hy - 24, hx - 30 + sw - i * 3, hy - 30 + i * 8, 9 - i * 2, -4); flatLine(c, i % 2 ? '#ff7a6a' : '#e0283a', '#6a0a14', 1.1); }
  c.beginPath();
  c.moveTo(hx - 22, hy + 10);
  c.bezierCurveTo(hx - 26, hy - 30, hx + 28, hy - 32, hx + 24, hy + 2);
  c.lineTo(hx + 21, hy - 2); c.lineTo(hx - 1, hy - 3); c.lineTo(hx - 4, hy + 18); c.lineTo(hx - 19, hy + 20); c.closePath();
  cel(c, '#dfe6f2', [hx - 26, hy - 30, 54, 50], { cut: 0.6 });
  c.fillStyle = K.trim; c.beginPath(); c.rect(hx - 1.5, hy - 27, 4, 24); c.fill(); c.strokeStyle = lineOf(K.trim); c.lineWidth = 1; c.stroke();
  c.strokeStyle = K.trim; c.lineWidth = 1.6; c.beginPath(); c.moveTo(hx - 1, hy - 3); c.lineTo(hx + 21, hy - 2); c.stroke();
  c.fillStyle = rgba('#ffffff', 0.6); c.beginPath(); c.ellipse(hx + 9, hy - 16, 6, 2.5, -0.4, 0, TAU); c.fill();
  hairStrand(c, K, hx + 3, hy - 3, hx + 6, hy + 5, 6, 1);
  hairStrand(c, K, hx + 9, hy - 3, hx + 12, hy + 4, 6, 1);
  hairStrand(c, K, hx + 15, hy - 3, hx + 18, hy + 3, 5, 1);
}

function drawHeadgear(c, K) {
  const { L, hx, hy, t, def, o } = K;
  const ex = L.extras, E = ELEMS[def.elem];
  if (ex.includes('witchHat')) {
    c.beginPath(); c.ellipse(hx + 1, hy - 20, 31, 7, -0.12, 0, TAU); cel(c, shade(L.c1, -0.15), [hx - 30, hy - 27, 62, 14], { dir: 1 });
    c.beginPath(); c.moveTo(hx - 15, hy - 22); c.quadraticCurveTo(hx - 6, hy - 52, hx - 26 + Math.sin(t * 2) * 2, hy - 60); c.quadraticCurveTo(hx + 6, hy - 50, hx + 16, hy - 23); c.closePath();
    cel(c, L.c1, [hx - 26, hy - 60, 42, 38]);
    c.beginPath(); c.moveTo(hx - 14, hy - 26); c.quadraticCurveTo(hx, hy - 29, hx + 15.5, hy - 27); c.lineTo(hx + 16, hy - 22.5); c.quadraticCurveTo(hx, hy - 24, hx - 14.5, hy - 21.5); c.closePath(); flatLine(c, L.trim, lineOf(L.trim), 1);
    star5(c, hx + 3, hy - 24.5, 4, 1.8); flatLine(c, E.light, lineOf(E.color), 0.8);
  }
  if (ex.includes('pirateHat')) {
    c.beginPath(); c.moveTo(hx - 30, hy - 14); c.quadraticCurveTo(hx - 10, hy - 6, hx + 28, hy - 16); c.quadraticCurveTo(hx + 24, hy - 24, hx + 18, hy - 26);
    c.quadraticCurveTo(hx + 8, hy - 42, hx - 4, hy - 38); c.quadraticCurveTo(hx - 18, hy - 40, hx - 22, hy - 24); c.quadraticCurveTo(hx - 28, hy - 22, hx - 30, hy - 14); c.closePath();
    cel(c, '#2a2a3a', [hx - 30, hy - 42, 58, 36]);
    c.strokeStyle = K.trim; c.lineWidth = 1.6; c.beginPath(); c.moveTo(hx - 28, hy - 15); c.quadraticCurveTo(hx - 10, hy - 8, hx + 26, hy - 17); c.stroke();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(hx + 1, hy - 27, 3.5, 0, TAU); c.fill(); c.fillStyle = LINE_INK; c.fillRect(hx - 0.5, hy - 26, 1, 2);
    strandPath(c, hx - 14, hy - 32, hx - 32, hy - 44, 7, -4); flatLine(c, E.light, lineOf(E.color), 1);
  }
  if (ex.includes('tiara')) {
    c.beginPath(); c.moveTo(hx - 8, hy - 17); c.lineTo(hx - 2, hy - 25); c.lineTo(hx + 2, hy - 20); c.lineTo(hx + 7, hy - 29); c.lineTo(hx + 12, hy - 20); c.lineTo(hx + 16, hy - 25); c.lineTo(hx + 20, hy - 15); c.quadraticCurveTo(hx + 6, hy - 19, hx - 8, hy - 17); c.closePath();
    cel(c, '#eaf6ff', [hx - 8, hy - 29, 28, 14], { lw: 1.1 });
    c.beginPath(); c.moveTo(hx + 7, hy - 25); c.lineTo(hx + 9.5, hy - 21.5); c.lineTo(hx + 7, hy - 18); c.lineTo(hx + 4.5, hy - 21.5); c.closePath(); flatLine(c, E.color, lineOf(E.color), 0.8);
  }
  if (ex.includes('crown')) {
    c.beginPath(); c.moveTo(hx - 9, hy - 22); c.lineTo(hx - 10, hy - 32); c.lineTo(hx - 4, hy - 27); c.lineTo(hx + 1, hy - 35); c.lineTo(hx + 6, hy - 27); c.lineTo(hx + 12, hy - 32); c.lineTo(hx + 11, hy - 21); c.quadraticCurveTo(hx + 1, hy - 24, hx - 9, hy - 22); c.closePath();
    cel(c, '#ffd23f', [hx - 10, hy - 35, 22, 14], { lw: 1.1 });
    for (const [x, col] of [[-4, '#ff3a5a'], [1, '#3a8aff'], [6, '#3ad17a']]) { c.fillStyle = col; circle(c, hx + x, hy - 24.5, 1.4); c.fill(); }
  }
  if (ex.includes('headband')) {
    c.beginPath(); c.moveTo(hx - 21, hy - 8); c.quadraticCurveTo(hx, hy - 17, hx + 23, hy - 8); c.lineTo(hx + 23, hy - 4); c.quadraticCurveTo(hx, hy - 13, hx - 21, hy - 4); c.closePath();
    cel(c, '#e83a2a', [hx - 21, hy - 17, 44, 13], { lw: 1.1 });
    const w = Math.sin(t * 6) * 3;
    strandPath(c, hx - 20, hy - 6, hx - 38, hy + 2 + w, 5, 2); flatLine(c, '#e83a2a', '#6a0a0a', 1);
    strandPath(c, hx - 20, hy - 6, hx - 34, hy + 10 + w, 4, 1); flatLine(c, '#c4281b', '#6a0a0a', 1);
  }
  if (ex.includes('veil')) {
    c.save(); c.globalAlpha *= 0.75;
    c.beginPath(); c.moveTo(hx + 4, hy + 10); c.quadraticCurveTo(hx + 16, hy + 8, hx + 22, hy + 10); c.lineTo(hx + 20, hy + 22); c.quadraticCurveTo(hx + 10, hy + 26, hx + 2, hy + 20); c.closePath();
    flatLine(c, mix(L.c1, '#ffffff', 0.5), lineOf(L.c1), 0.9); c.restore();
    c.fillStyle = K.trim; for (let i = 0; i < 4; i++) { circle(c, hx + 5 + i * 5, hy + 10.5, 1); c.fill(); }
  }
  if (ex.includes('wingHelm')) {
    for (let i = 0; i < 3; i++) { strandPath(c, hx - 15, hy - 10 + i * 2, hx - 36 + i * 2, hy - 30 + i * 8, 8 - i, -4); flatLine(c, '#ffffff', '#6a7a9a', 1); }
    c.beginPath(); c.moveTo(hx - 13, hy - 18); c.quadraticCurveTo(hx + 4, hy - 26, hx + 21, hy - 13); c.lineWidth = 3.6; c.strokeStyle = K.metal; c.stroke(); c.lineWidth = 1; c.strokeStyle = lineOf('#b8c0d0'); c.stroke();
    c.fillStyle = E.color; circle(c, hx + 4, hy - 21.5, 2); c.fill();
  }
  if (ex.includes('horns')) {
    for (const [dx, s] of [[-8, 0.85], [8, 1]]) {
      c.beginPath(); c.moveTo(hx + dx - 4, hy - 20); c.quadraticCurveTo(hx + dx - 3, hy - 36 * s, hx + dx + 10 * s, hy - 40 * s); c.quadraticCurveTo(hx + dx + 2, hy - 30, hx + dx + 4, hy - 19); c.closePath();
      cel(c, '#3a2440', [hx + dx - 4, hy - 40, 16, 22], { lw: 1.2 });
    }
  }
  if (ex.includes('halo') || o.awake) {
    c.save(); c.translate(hx + 2, hy - 33 + Math.sin(t * 2.5) * 1.5); c.scale(1, 0.3);
    c.lineWidth = 4.5; c.strokeStyle = o.awake ? E.light : '#fff3a0'; circle(c, 0, 0, 15); c.stroke();
    c.lineWidth = 1.5; c.strokeStyle = o.awake ? E.color : '#ffcf3f'; circle(c, 0, 0, 15); c.stroke();
    c.restore();
  }
  if (ex.includes('monocle')) { c.lineWidth = 1.4; c.strokeStyle = '#d8b23a'; circle(c, hx + 10.5, hy + 5, 6.8); c.stroke(); c.beginPath(); c.moveTo(hx + 5, hy + 9); c.quadraticCurveTo(hx + 2, hy + 18, hx + 4, hy + 24); c.lineWidth = 0.8; c.stroke(); }
  if (ex.includes('mask')) {
    c.beginPath(); c.moveTo(hx - 8, hy + 9); c.quadraticCurveTo(hx + 10, hy + 7, hx + 21, hy + 7); c.quadraticCurveTo(hx + 19, hy + 18, hx + 8, hy + 21); c.quadraticCurveTo(hx - 3, hy + 19, hx - 8, hy + 9); c.closePath();
    cel(c, L.c1, [hx - 8, hy + 7, 30, 14], { lw: 1.2, dir: 1 });
    c.strokeStyle = K.trim; c.lineWidth = 1; c.beginPath(); c.moveTo(hx - 6, hy + 10); c.quadraticCurveTo(hx + 10, hy + 8.5, hx + 20, hy + 8.5); c.stroke();
  }
  if (ex.includes('catEars')) {
    for (const [dx, s2] of [[-10, 0.85], [9, 1]]) {
      c.beginPath(); c.moveTo(hx + dx - 7 * s2, hy - 19); c.lineTo(hx + dx - 2, hy - 36 * s2); c.lineTo(hx + dx + 7 * s2, hy - 20); c.closePath();
      cel(c, L.hair, [hx + dx - 8, hy - 36, 16, 17], { lw: 1.2 });
      c.beginPath(); c.moveTo(hx + dx - 3.5 * s2, hy - 21); c.lineTo(hx + dx - 2, hy - 31 * s2); c.lineTo(hx + dx + 3.5 * s2, hy - 21.5); c.closePath(); c.fillStyle = '#ff9ab0'; c.fill();
    }
  }
  if (ex.includes('flowerPin')) {
    c.save(); c.translate(hx - 13, hy - 13);
    for (let i = 0; i < 5; i++) { c.rotate(TAU / 5); c.beginPath(); c.ellipse(0, -3.6, 2.4, 3.6, 0, 0, TAU); flatLine(c, '#fff0f6', '#c4688a', 0.8); }
    c.fillStyle = '#ffd23f'; circle(c, 0, 0, 1.8); c.fill(); c.restore();
  }
  if (ex.includes('ribbon')) {
    c.save(); c.translate(hx - 15, hy - 16); c.rotate(-0.4);
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-10, -8, -11, 1); c.quadraticCurveTo(-6, 4, 0, 0); c.moveTo(0, 0); c.quadraticCurveTo(10, -8, 11, 1); c.quadraticCurveTo(6, 4, 0, 0);
    cel(c, K.trim, [-11, -8, 22, 12], { lw: 1.1 });
    strandPath(c, -1, 1, -5, 11, 3, -1); flatLine(c, shade(K.trim, -0.1), lineOf(K.trim), 0.9);
    strandPath(c, 1, 1, 5, 10, 3, 1); flatLine(c, shade(K.trim, -0.1), lineOf(K.trim), 0.9);
    c.beginPath(); c.arc(0, 0, 2.2, 0, TAU); flatLine(c, shade(K.trim, 0.2), lineOf(K.trim), 0.9);
    c.restore();
  }
  if (ex.includes('eyepatch')) {
    c.strokeStyle = '#1a1020'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(hx - 20, hy - 4); c.lineTo(hx + 20, hy + 2); c.stroke();
    c.beginPath(); c.moveTo(hx - 9.5, hy + 2.5); c.quadraticCurveTo(hx - 3.5, hy + 0.5, hx + 2.5, hy + 2.5); c.quadraticCurveTo(hx + 2.5, hy + 12, hx - 3.5, hy + 14); c.quadraticCurveTo(hx - 9.5, hy + 12, hx - 9.5, hy + 2.5); c.closePath(); cel(c, '#2a2026', [hx - 10, hy, 13, 14], { lw: 1.2 });
  }
  if (ex.includes('skullPin')) {
    c.beginPath(); c.arc(hx - 13, hy - 14, 3.6, 0, TAU); flatLine(c, '#f2ead8', '#5a4a3a', 1);
    c.fillStyle = LINE_INK; circle(c, hx - 14, hy - 14.5, 0.9); c.fill(); circle(c, hx - 11.8, hy - 14.5, 0.9); c.fill();
  }
}

// 뒤쪽 레이어: 날개 · 망토 · 뒷머리 · 화살통
function drawBackLayer(c, K) {
  const { L, P, t, def, o, hx, hy } = K;
  const ex = L.extras, E = ELEMS[def.elem];
  const wave = Math.sin(t * 4) * 3 + P.hairSwing * 2 - P.shift * 0.6;
  // 날개 (천사 / 각성 빛)
  if (ex.includes('wings') || (o.awake && def.elem === 'light' && !ex.includes('wings'))) {
    const flap = Math.sin(t * 5) * 0.12;
    for (const s of [0.82, 1]) {
      c.save(); c.translate(-4, -22); c.rotate(-0.25 + flap * s); c.scale(s, s);
      for (let i = 0; i < 5; i++) { strandPath(c, -2, 2, -50 + i * 6, -26 + i * 9, 12 - i, -6 + i); flatLine(c, i % 2 ? '#ffffff' : (o.awake ? E.light : '#e6eef8'), '#7a8aaa', 1); }
      c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-14, -26, -40, -32, -46, -22); c.quadraticCurveTo(-24, -16, -4, 6); c.closePath(); flatLine(c, '#ffffff', '#7a8aaa', 1.2);
      c.restore();
    }
  }
  if (ex.includes('batWings') || (o.awake && def.elem === 'dark' && !ex.includes('batWings'))) {
    const flap = Math.sin(t * 6) * 0.15;
    c.save(); c.translate(-4, -20); c.rotate(-0.1 + flap);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(-16, -28); c.lineTo(-46, -24); c.quadraticCurveTo(-36, -14, -42, -4); c.quadraticCurveTo(-31, -7, -29, 4); c.quadraticCurveTo(-19, -1, -14, 10); c.closePath();
    cel(c, '#4a1a6a', [-46, -28, 46, 38], { cut: 0.5 });
    c.strokeStyle = rgba('#c77dff', 0.7); c.lineWidth = 1; c.beginPath(); c.moveTo(-16, -28); c.lineTo(-36, -10); c.moveTo(-16, -28); c.lineTo(-24, 0); c.stroke();
    c.restore();
  }
  if (o.awake && (def.elem === 'fire' || def.elem === 'water' || def.elem === 'wind')) {
    const flap = Math.sin(t * 4) * 0.1;
    c.save(); c.translate(-4, -22); c.rotate(-0.25 + flap);
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) { strandPath(c, 0, 0, -44 - i * 3, -30 + i * 12, 11, -6); c.fillStyle = rgba(i % 2 ? E.color : E.light, 0.45); c.fill(); }
    c.restore();
  }
  // 망토
  if (ex.includes('cape') || ex.includes('tatteredCape') || ex.includes('leafCape')) {
    const col = ex.includes('leafCape') ? '#3f8f3a' : ex.includes('tatteredCape') ? '#22142e' : (L.capeCol || shade(L.c1, -0.12));
    const inner = ex.includes('leafCape') ? '#7dcf5a' : ex.includes('tatteredCape') ? '#5a2a7a' : (o.awake ? '#ffd23f' : L.trim);
    // 안감
    c.beginPath(); c.moveTo(-7, -24); c.quadraticCurveTo(-20 - wave, -4, -20 - wave * 1.3, 20); c.lineTo(-12 - wave, 21); c.quadraticCurveTo(-12, 0, 2, -24); c.closePath(); flatLine(c, shade(inner, -0.25), lineOf(inner), 1);
    c.beginPath();
    c.moveTo(-8, -25);
    c.quadraticCurveTo(-25 - wave, -4, -24 - wave * 1.3, 20);
    if (ex.includes('tatteredCape')) { c.lineTo(-19 - wave, 14); c.lineTo(-15 - wave, 22); c.lineTo(-11 - wave * 0.6, 13); c.lineTo(-6, 21); c.lineTo(-3, 12); }
    else if (ex.includes('leafCape')) { for (let i = 0; i < 4; i++) { c.quadraticCurveTo(-22 - wave + i * 5, 24, -19 - wave + i * 5, 18); } }
    else c.quadraticCurveTo(-14 - wave, 23, -3, 18);
    c.lineTo(5, -24); c.closePath();
    cel(c, col, [-26, -26, 32, 48], { cut: 0.45 });
    c.strokeStyle = rgba(shadeOf(col), 0.9); c.lineWidth = 1; c.beginPath(); c.moveTo(-6, -18); c.quadraticCurveTo(-14 - wave, 0, -14 - wave, 18); c.stroke();
  }
  if (ex.includes('quiver')) {
    c.save(); c.translate(-9, -16); c.rotate(-0.5);
    c.beginPath(); pathRR(c, -4.5, -15, 9, 24, 3); cel(c, '#8a5a32', [-5, -15, 10, 24], { lw: 1.2 });
    c.fillStyle = K.trim; c.fillRect(-4.5, -12, 9, 2);
    for (let i = 0; i < 3; i++) { strandPath(c, -2.5 + i * 2.5, -15, -2.5 + i * 2.5, -23, 3.5, 0); flatLine(c, E.color, lineOf(E.color), 0.8); }
    c.restore();
  }
  if (L.body === 'coat') {
    // 코트 뒷자락
    c.beginPath(); c.moveTo(-9, -8); c.quadraticCurveTo(-20 - wave, 4, -18 - wave * 1.2, 16); c.lineTo(-6, 12); c.lineTo(-3, -4); c.closePath();
    cel(c, shade(L.c1, -0.25), [-20, -8, 18, 24], { cut: 0.4 });
  }
  // 뒷머리
  drawHairBack(c, K);
}

function drawHairBack(c, K) {
  const { L, P, t, hx, hy } = K;
  const hs = L.hairStyle;
  const sw = P.hairSwing * 2 - P.shift * 0.5;
  // 기본 뒷머리 덩어리
  if (hs !== 'helm') {
    c.beginPath(); c.ellipse(hx - 4, hy - 1, 23, 22.5, 0.15, 0, TAU);
    if (hs === 'hood') { cel(c, shade(K.L.c1, -0.2), [hx - 28, hy - 24, 50, 46]); }
    else { c.fillStyle = hairFill(c, L, hy - 24, hy + 22); c.fill(); c.lineWidth = 1.4; c.strokeStyle = lineOf(L.hair); c.stroke(); }
  }
  if (hs === 'long') {
    const ends = [[-22, 44, 13, -3], [-14, 48, 13, -2], [-4, 46, 12, 0], [6, 40, 11, 2]];
    for (const [dx, dy, w, b] of ends) hairStrand(c, K, hx + dx * 0.4 - 4, hy - 4, hx + dx - sw * (1 + dy / 60), hy + dy, w + 6, b - sw * 0.5);
  } else if (hs === 'pony') {
    const s2 = sw + Math.sin(t * 5) * 2;
    c.save(); c.translate(hx - 17, hy - 14);
    hairStrand(c, K, 0, 0, -22 - s2, 8, 13, -6);
    hairStrand(c, K, -4, 2, -18 - s2 * 1.4, 32, 12, -5);
    hairStrand(c, K, -6, 2, -26 - s2 * 1.5, 26, 9, 4);
    c.beginPath(); c.ellipse(0, 0, 3.4, 4.2, 0.3, 0, TAU); flatLine(c, K.trim, lineOf(K.trim), 1);
    c.restore();
  } else if (hs === 'twin') {
    const s2 = sw * 0.8 + Math.sin(t * 4.4) * 1.5;
    for (const [dx, k] of [[-17, 1], [9, 0.85]]) {
      c.save(); c.translate(hx + dx, hy - 10);
      hairStrand(c, K, 0, 0, -8 * k - s2, 34 * k, 12 * k, -4);
      hairStrand(c, K, 2, 0, 3 - s2 * 1.2, 38 * k, 10 * k, 3);
      // 리본
      c.beginPath(); c.moveTo(0, 0); c.lineTo(-6, -5); c.lineTo(-6, 4); c.closePath(); c.moveTo(0, 0); c.lineTo(6, -5); c.lineTo(6, 4); c.closePath();
      flatLine(c, K.trim, lineOf(K.trim), 1);
      c.restore();
    }
  } else if (hs === 'spiky') {
    const sp = [[-2.6, 30], [-2.2, 34], [-1.8, 32], [-1.35, 26], [-3.0, 24], [2.9, 20]];
    for (const [a, l] of sp) {
      const bx = hx - 4, by = hy - 6;
      hairStrand(c, K, bx, by, bx + Math.cos(a + P.hairSwing * 0.04) * l, by + Math.sin(a + P.hairSwing * 0.04) * l, 15, -3);
    }
  } else if (hs === 'bob') {
    // 턱선까지 오는 단발 (끝이 안으로 말림)
    c.beginPath();
    c.moveTo(hx - 22, hy - 6); c.quadraticCurveTo(hx - 28 - sw * 0.3, hy + 10, hx - 22 - sw * 0.4, hy + 20);
    c.quadraticCurveTo(hx - 12, hy + 26, hx - 4, hy + 20); c.lineTo(hx + 4, hy); c.closePath();
    c.fillStyle = hairFill(c, L, hy - 6, hy + 24); c.fill(); c.lineWidth = 1.3; c.strokeStyle = lineOf(L.hair); c.stroke();
    c.strokeStyle = rgba(shade(L.hair, -0.4), 0.6); c.lineWidth = 1; c.beginPath(); c.moveTo(hx - 18, hy + 2); c.quadraticCurveTo(hx - 20, hy + 14, hx - 14, hy + 21); c.stroke();
  } else if (hs === 'bun') {
    // 만두 머리 2개 + 짧은 꼬리
    for (const [dx, dy, r] of [[-14, -20, 8.5], [8, -26, 8]]) {
      c.beginPath(); c.arc(hx + dx, hy + dy, r, 0, TAU); c.fillStyle = hairFill(c, L, hy + dy - r, hy + dy + r); c.fill(); c.lineWidth = 1.3; c.strokeStyle = lineOf(L.hair); c.stroke();
      c.strokeStyle = rgba(shade(L.hair, -0.4), 0.6); c.lineWidth = 0.9; c.beginPath(); c.arc(hx + dx, hy + dy, r * 0.6, 3.6, 5.6); c.stroke();
      c.fillStyle = rgba('#ffffff', 0.35); c.beginPath(); c.ellipse(hx + dx + 2, hy + dy - 3, 3, 1.6, -0.5, 0, TAU); c.fill();
    }
    hairStrand(c, K, hx - 16, hy - 14, hx - 24 - sw, hy + 14, 7, -3);
  } else if (hs === 'short') {
    hairStrand(c, K, hx - 16, hy, hx - 24 - sw * 0.3, hy + 12, 12, -2);
    hairStrand(c, K, hx - 8, hy + 4, hx - 14 - sw * 0.3, hy + 18, 10, -1);
  }
}

function drawFrontExtras(c, K) {
  const { L, P, t } = K;
  const ex = L.extras;
  const fl = Math.sin(t * 6) * 3 - P.shift;
  if (ex.includes('furCollar')) {
    c.beginPath();
    for (let i = 0; i <= 10; i++) { const a = Math.PI + i * Math.PI / 10; c.lineTo(Math.cos(a) * 13, -25 + Math.sin(a) * 4.5 + (i % 2) * 3); }
    c.closePath(); cel(c, '#f6fbff', [-13, -30, 26, 9], { lw: 1.2, dir: 1 });
  }
  for (const k of ['scarfFire', 'scarfWind', 'scarfDark']) {
    if (!ex.includes(k)) continue;
    const col = k === 'scarfFire' ? '#ffcf3f' : k === 'scarfWind' ? '#3fae6a' : '#6a2a9a';
    strandPath(c, -5, -25, -36 - fl * 1.6, -18 + Math.sin(t * 7) * 3, 7, -3); cel(c, shade(col, -0.1), [-40, -28, 36, 16], { lw: 1.2 });
    strandPath(c, -4, -24, -26 - fl, -10 + Math.sin(t * 7 + 1) * 3, 6, 2); cel(c, shade(col, -0.2), [-30, -26, 26, 18], { lw: 1.2 });
    c.beginPath(); pathRR(c, -10, -28.5, 21, 7, 3.5); cel(c, col, [-10, -29, 21, 8], { lw: 1.2, dir: 1 });
  }
  if (ex.includes('hoodDown')) {
    c.beginPath(); c.moveTo(-11, -24); c.quadraticCurveTo(-22, -20, -16, -12); c.quadraticCurveTo(-6, -18, 2, -25); c.closePath(); cel(c, shade(L.c1, -0.08), [-22, -25, 24, 14], { lw: 1.2 });
  }
}

function drawShield(c, K, S) {
  const h = handPos(S, K.P.armB, K.P.bendB);
  c.save(); c.translate(h.x + 3, h.y - 4);
  c.beginPath(); c.moveTo(0, -15); c.quadraticCurveTo(13, -13, 13, -8); c.quadraticCurveTo(13, 9, 0, 17); c.quadraticCurveTo(-13, 9, -13, -8); c.quadraticCurveTo(-13, -13, 0, -15); c.closePath();
  cel(c, '#eef2fa', [-13, -15, 26, 32], { cut: 0.6 });
  c.beginPath(); c.moveTo(0, -11); c.quadraticCurveTo(9, -10, 9, -6); c.quadraticCurveTo(9, 6, 0, 12.5); c.quadraticCurveTo(-9, 6, -9, -6); c.quadraticCurveTo(-9, -10, 0, -11); c.closePath();
  c.strokeStyle = K.trim; c.lineWidth = 1.6; c.stroke();
  c.fillStyle = K.trim; c.fillRect(-1.6, -9, 3.2, 18); c.fillRect(-6.5, -3, 13, 3.2);
  c.fillStyle = K.E.color; circle(c, 0, -1.4, 2.2); c.fill();
  c.restore();
}

function drawOrb(c, K, S) {
  const { E, P, t } = K;
  const h = handPos(S, P.armF, P.bendF);
  const fly = P.orb ? P.orb.cast : 0;
  if (P.orb && fly > 0.9) return;
  const x = h.x + 8 + fly * 30, y = h.y - 12 + Math.sin(t * 3) * 2 - fly * 4;
  const r = 7 + (P.charge || 0) * 3;
  const g = c.createRadialGradient(x - 2, y - 2, 1, x, y, r * 2.4);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, E.light); g.addColorStop(0.6, rgba(E.color, 0.55)); g.addColorStop(1, rgba(E.color, 0));
  c.fillStyle = g; circle(c, x, y, r * 2.4); c.fill();
  c.beginPath(); c.arc(x, y, r, 0, TAU); cel(c, E.color, [x - r, y - r, r * 2, r * 2], { lw: 1.2, hi: '#ffffff' });
  for (let i = 0; i < 3; i++) { const a = t * 3 + i * TAU / 3; c.fillStyle = E.light; circle(c, x + Math.cos(a) * (r + 6), y + Math.sin(a) * (r + 6) * 0.5, 1.6); c.fill(); }
}

function drawBook(c, K, S) {
  const { E, P, t } = K;
  const h = handPos(S, P.armB, P.bendB);
  const x = h.x + 14, y = h.y - 14 + Math.sin(t * 2.5) * 2.5;
  const g = c.createRadialGradient(x, y, 1, x, y, 26); g.addColorStop(0, rgba(E.light, 0.45 + (P.charge || 0) * 0.4)); g.addColorStop(1, rgba(E.color, 0));
  c.fillStyle = g; circle(c, x, y, 26); c.fill();
  c.save(); c.translate(x, y); c.rotate(-0.15);
  c.beginPath(); c.moveTo(-12, -6); c.quadraticCurveTo(-6, -9, 0, -6); c.quadraticCurveTo(6, -9, 12, -6); c.lineTo(12, 6); c.quadraticCurveTo(6, 3, 0, 6); c.quadraticCurveTo(-6, 3, -12, 6); c.closePath();
  flatLine(c, '#f4ead2', '#5a3a2a', 1.1);
  c.strokeStyle = rgba(E.color, 0.9); c.lineWidth = 0.8;
  for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-9, -3 + i * 3); c.lineTo(-3, -3.5 + i * 3); c.moveTo(3, -3.5 + i * 3); c.lineTo(9, -3 + i * 3); c.stroke(); }
  c.beginPath(); c.moveTo(-13, 6.5); c.quadraticCurveTo(-6, 4, 0, 7.5); c.quadraticCurveTo(6, 4, 13, 6.5); c.lineTo(13, 8); c.quadraticCurveTo(6, 5.5, 0, 9); c.quadraticCurveTo(-6, 5.5, -13, 8); c.closePath(); flatLine(c, '#3a1a4a', '#1a0a20', 0.8);
  c.restore();
  for (let i = 0; i < 3; i++) { const k = (t * 0.8 + i / 3) % 1; c.fillStyle = rgba(E.light, 1 - k); c.font = '6px serif'; c.fillText('ᚱᚢᚾ'[i], x - 6 + i * 6, y - 8 - k * 16); }
}

function drawWeaponAt(c, K, S, ang, bend, wa, back) {
  const h = handPos(S, ang, bend);
  c.save(); c.translate(h.x, h.y); c.rotate(wa);
  drawWeapon(c, K, back, ang + bend);
  c.restore();
}

function drawWeapon(c, K, back, forearm) {
  const { def, E, P, o } = K;
  const glowA = o.awake ? 0.9 : o.star >= 5 ? 0.5 : 0;
  const gold = o.awake ? '#ffe27a' : '#d8b23a';
  const blade = (x0, x1, w, tipLen) => {
    c.beginPath(); c.moveTo(x0, -w); c.lineTo(x1, -w * 0.8); c.lineTo(x1 + tipLen, 0); c.lineTo(x1, w * 0.8); c.lineTo(x0, w); c.closePath();
    const g = c.createLinearGradient(0, -w, 0, w); g.addColorStop(0, '#ffffff'); g.addColorStop(0.48, shade(E.color, 0.55)); g.addColorStop(0.52, shade(E.color, 0.2)); g.addColorStop(1, shade(E.color, -0.1));
    c.fillStyle = g; c.fill(); c.lineWidth = 1.3; c.strokeStyle = lineOf(E.color); c.stroke();
  };
  switch (def.weapon) {
    case 'sword': {
      limbPath(c, -8, 0, 2, 0, 2.3, 2.3); cel(c, '#6a3a24', [-9, -3, 12, 6], { lw: 1.1 });
      c.beginPath(); c.arc(-9, 0, 2.6, 0, TAU); flatLine(c, gold, lineOf(gold), 1);
      c.beginPath(); c.moveTo(1, -8); c.quadraticCurveTo(4, -4, 3.5, 0); c.quadraticCurveTo(4, 4, 1, 8); c.lineTo(5.5, 6); c.lineTo(5.5, -6); c.closePath(); cel(c, gold, [1, -8, 5, 16], { lw: 1.1 });
      blade(5.5, 38, 3.8, 9);
      c.fillStyle = rgba(E.light, 0.9); c.fillRect(7, -0.7, 26, 1.4);
      if (glowA) { c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = rgba(E.glow, glowA * 0.5); c.lineWidth = 6; c.beginPath(); c.moveTo(8, 0); c.lineTo(44, 0); c.stroke(); c.restore(); }
      break;
    }
    case 'greatsword': {
      limbPath(c, -12, 0, 2, 0, 2.6, 2.6); cel(c, '#3a3a5a', [-13, -3, 16, 6], { lw: 1.1 });
      c.beginPath(); c.arc(-13, 0, 3, 0, TAU); flatLine(c, gold, lineOf(gold), 1);
      c.beginPath(); c.moveTo(1, -11); c.quadraticCurveTo(6, -6, 4, 0); c.quadraticCurveTo(6, 6, 1, 11); c.lineTo(7, 8); c.lineTo(7, -8); c.closePath(); cel(c, gold, [1, -11, 6, 22], { lw: 1.1 });
      c.beginPath(); c.moveTo(7, -6); c.lineTo(46, -5); c.lineTo(58, 0); c.lineTo(46, 5); c.lineTo(7, 6); c.closePath();
      const g = c.createLinearGradient(0, -6, 0, 6); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#dfe8ff'); g.addColorStop(0.51, '#a8b8e0'); g.addColorStop(1, '#8a9ac8');
      c.fillStyle = g; c.fill(); c.lineWidth = 1.4; c.strokeStyle = '#3a4a7a'; c.stroke();
      c.fillStyle = E.color; c.fillRect(10, -1.5, 30, 3);
      c.fillStyle = '#3a8aff'; circle(c, 4, 0, 2.2); c.fill();
      if (glowA) { c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = rgba(E.glow, glowA * 0.55); c.lineWidth = 9; c.beginPath(); c.moveTo(10, 0); c.lineTo(56, 0); c.stroke(); c.restore(); }
      break;
    }
    case 'hammer': {
      limbPath(c, -10, 0, 30, 0, 2.4, 2.4); cel(c, '#7a4a2a', [-10, -3, 40, 6], { lw: 1.1 });
      c.fillStyle = gold; c.fillRect(-2, -2.6, 3, 5.2);
      c.save(); c.translate(32, 0);
      c.beginPath(); pathRR(c, -7.5, -14, 15, 28, 4); cel(c, '#eef2fa', [-8, -14, 16, 28], { cut: 0.6 });
      c.beginPath(); c.rect(-7.5, -3.5, 15, 7); flatLine(c, o.awake ? '#ffd23f' : E.color, lineOf(E.color), 1);
      star5(c, 0, 0, 4.4, 1.9, 0); flatLine(c, '#fff3a0', '#a67a00', 0.8);
      if (glowA) { c.fillStyle = rgba(E.glow, glowA * 0.35); circle(c, 0, 0, 19); c.fill(); }
      c.restore();
      break;
    }
    case 'staff': {
      limbPath(c, -18, 0, 36, 0, 2.2, 2.2); cel(c, '#8a5a32', [-18, -3, 54, 6], { lw: 1.1 });
      c.fillStyle = gold; c.fillRect(-4, -2.6, 2.5, 5.2); c.fillRect(30, -3, 3, 6);
      c.save(); c.translate(42, 0);
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(-8, 0); c.quadraticCurveTo(-4, s * 12, 6, s * 8); c.quadraticCurveTo(-2, s * 6, -4, 0); c.closePath(); flatLine(c, gold, lineOf(gold), 1); }
      const ch = 1 + (P.charge || 0) * 1.4;
      const g = c.createRadialGradient(0, 0, 1, 0, 0, 14 * ch);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, E.light); g.addColorStop(1, rgba(E.color, 0));
      c.fillStyle = g; circle(c, 0, 0, 14 * ch); c.fill();
      c.beginPath(); c.moveTo(0, -6); c.lineTo(4.5, 0); c.lineTo(0, 6); c.lineTo(-4.5, 0); c.closePath(); cel(c, E.color, [-5, -6, 10, 12], { lw: 1, hi: '#ffffff' });
      c.restore();
      break;
    }
    case 'spear': {
      const r = P.reach || 0;
      c.save(); c.translate(r, 0);
      limbPath(c, -24, 0, 46, 0, 2.1, 2.1); cel(c, def.elem === 'light' ? '#f0e6c8' : '#34507a', [-24, -3, 70, 6], { lw: 1.1 });
      c.fillStyle = gold; c.fillRect(38, -3, 6, 6); c.fillRect(-2, -2.5, 3, 5);
      c.beginPath(); c.moveTo(44, -6); c.quadraticCurveTo(52, -6, 58, -2.5); c.lineTo(72, 0); c.lineTo(58, 2.5); c.quadraticCurveTo(52, 6, 44, 6); c.lineTo(47, 0); c.closePath();
      const g = c.createLinearGradient(0, -6, 0, 6); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, shade(E.color, 0.5)); g.addColorStop(0.51, shade(E.color, 0.15)); g.addColorStop(1, E.color);
      c.fillStyle = g; c.fill(); c.lineWidth = 1.2; c.strokeStyle = lineOf(E.color); c.stroke();
      strandPath(c, 40, 0, 30, 9 + Math.sin(K.t * 6) * 2, 4, 2); flatLine(c, E.color, lineOf(E.color), 0.8);
      if (P.thrustFx) { c.fillStyle = rgba(E.light, 0.6 * (1 - P.thrustFx * 0.5)); c.beginPath(); c.moveTo(72, 0); c.lineTo(40, -10); c.lineTo(18, 0); c.lineTo(40, 10); c.closePath(); c.fill(); }
      if (glowA) { c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = rgba(E.glow, glowA * 0.6); c.lineWidth = 5; c.beginPath(); c.moveTo(48, 0); c.lineTo(70, 0); c.stroke(); c.restore(); }
      c.restore();
      break;
    }
    case 'scythe': {
      limbPath(c, -16, 0, 50, 0, 2.2, 2.2); cel(c, '#2a1a34', [-16, -3, 66, 6], { lw: 1.1 });
      c.fillStyle = '#c77dff'; c.fillRect(-4, -2.6, 3, 5.2); c.fillRect(44, -3, 4, 6);
      c.save(); c.translate(50, 0);
      c.scale(1, -1);
      c.beginPath(); c.moveTo(0, -3); c.quadraticCurveTo(-3, -36, -38, -42); c.quadraticCurveTo(-14, -30, -7, 3); c.closePath();
      const g = c.createLinearGradient(-38, -42, 0, 0); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#c8bce0'); g.addColorStop(1, '#6a5a8a');
      c.fillStyle = g; c.fill(); c.lineWidth = 1.3; c.strokeStyle = '#2a1a3a'; c.stroke();
      c.strokeStyle = rgba(E.color, 0.95); c.lineWidth = 1.8; c.beginPath(); c.moveTo(-2, -5); c.quadraticCurveTo(-6, -31, -32, -39); c.stroke();
      c.beginPath(); c.arc(-2, -1, 3, 0, TAU); flatLine(c, '#ff3a6a', '#5a0a20', 0.8);
      if (glowA) { c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = rgba(E.glow, glowA * 0.5); c.lineWidth = 7; c.beginPath(); c.moveTo(-2, -6); c.quadraticCurveTo(-6, -31, -32, -39); c.stroke(); c.restore(); }
      c.restore();
      break;
    }
    case 'bow': {
      const d = P.draw || 0, pull = -4 - d * 16;
      c.beginPath(); c.moveTo(-1, -29); c.quadraticCurveTo(15, -22, 6, -6); c.lineTo(6, 6); c.quadraticCurveTo(15, 22, -1, 29);
      c.lineCap = 'round'; c.lineWidth = 5.5; c.strokeStyle = lineOf(def.elem === 'water' ? '#cfefff' : '#8a4a24'); c.stroke();
      c.lineWidth = 3.4; c.strokeStyle = def.elem === 'water' ? '#e6f8ff' : def.elem === 'fire' ? '#c45a2a' : '#7aa83a'; c.stroke();
      c.lineWidth = 1.2; c.strokeStyle = rgba('#ffffff', 0.6); c.beginPath(); c.moveTo(1, -26); c.quadraticCurveTo(12, -20, 5, -7); c.stroke();
      c.beginPath(); pathRR(c, 3, -6, 6, 12, 2); flatLine(c, gold, lineOf(gold), 1);
      for (const y of [-29, 29]) { c.beginPath(); c.arc(-1, y, 2.4, 0, TAU); flatLine(c, o.awake ? '#ffd23f' : E.color, lineOf(E.color), 0.8); }
      c.lineWidth = 0.9; c.strokeStyle = '#f4f4f4'; c.beginPath(); c.moveTo(-1, -28); c.lineTo(pull, 0); c.lineTo(-1, 28); c.stroke();
      if (d > 0.05) {
        c.strokeStyle = '#6a4a2a'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(pull, 0); c.lineTo(pull + 34, 0); c.stroke();
        c.beginPath(); c.moveTo(pull + 41, 0); c.lineTo(pull + 32, -3.5); c.lineTo(pull + 32, 3.5); c.closePath(); flatLine(c, E.light, lineOf(E.color), 0.8);
        c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = rgba(E.light, 0.5 * d); circle(c, pull + 37, 0, 6 + d * 5); c.fill(); c.restore();
      }
      break;
    }
    case 'daggers': {
      limbPath(c, -5, 0, 2, 0, 2, 2); cel(c, '#3a2a3a', [-5, -2, 8, 4], { lw: 1 });
      c.beginPath(); c.moveTo(1, -5); c.lineTo(3.5, -5); c.lineTo(3.5, 5); c.lineTo(1, 5); c.closePath(); flatLine(c, E.color, lineOf(E.color), 0.9);
      c.beginPath(); c.moveTo(3.5, -3.2); c.quadraticCurveTo(16, -4.5, 27, 0); c.quadraticCurveTo(16, 2, 3.5, 3.2); c.closePath();
      const g = c.createLinearGradient(0, -4, 0, 3); g.addColorStop(0, '#ffffff'); g.addColorStop(1, shade(E.color, 0.2)); c.fillStyle = g; c.fill(); c.lineWidth = 1.1; c.strokeStyle = lineOf(E.color); c.stroke();
      break;
    }
    case 'shuriken': case 'chakram': {
      c.save(); c.translate(6, 0); c.rotate((K.t || 0) * 6);
      if (def.weapon === 'shuriken') {
        c.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 2.5 : 8.5, a = i * Math.PI / 4; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath();
        cel(c, '#dfe6ee', [-9, -9, 18, 18], { lw: 1.1 });
        c.fillStyle = E.color; circle(c, 0, 0, 1.8); c.fill();
      } else {
        c.beginPath(); c.arc(0, 0, 10, 0, TAU); c.arc(0, 0, 6, 0, TAU, true);
        c.fillStyle = '#e8f2ee'; c.fill('evenodd'); c.lineWidth = 1.1; c.strokeStyle = lineOf(E.color); c.stroke();
        for (let i = 0; i < 4; i++) { c.rotate(TAU / 4); c.beginPath(); c.moveTo(9, -2); c.lineTo(14, 0); c.lineTo(9, 2); c.closePath(); flatLine(c, E.color, lineOf(E.color), 0.8); }
      }
      c.restore();
      break;
    }
    case 'gun': {
      // 화승총 (플린트락)
      c.beginPath(); c.moveTo(-6, 1); c.quadraticCurveTo(-12, 7, -10, 11); c.lineTo(-4, 9); c.lineTo(1, 3); c.lineTo(2, -2); c.closePath(); cel(c, '#7a4a28', [-12, -2, 14, 13], { lw: 1.1 });
      c.beginPath(); pathRR(c, -2, -3.5, 30, 5.5, 2); cel(c, '#5a5a6a', [-2, -4, 30, 6], { lw: 1.1, dir: 1 });
      c.fillStyle = gold; c.fillRect(2, -4, 4, 7); c.fillRect(24, -4.2, 3, 6.4);
      c.beginPath(); c.moveTo(0, -4); c.lineTo(3, -8); c.lineTo(5, -7); c.lineTo(3, -3); c.closePath(); flatLine(c, '#8a8a9a', '#2a2a3a', 0.8);
      c.fillStyle = E.color; c.fillRect(8, -2.4, 12, 1.4);
      if (P.muzzle > 0) {
        c.save(); c.globalCompositeOperation = 'lighter'; c.translate(30, -1);
        c.fillStyle = rgba('#ffffff', P.muzzle); star5(c, 0, 0, 10 * P.muzzle + 4, 4, 0); c.fill();
        c.fillStyle = rgba(E.light, P.muzzle); circle(c, 4, 0, 9 * P.muzzle); c.fill(); c.restore();
      }
      break;
    }
    case 'gauntlet': {
      // 팔에 끼운 건틀릿: 손 위치에 큰 주먹
      c.beginPath(); pathRR(c, -6, -5.5, 11, 11, 3.5); cel(c, back ? shade('#c4281b', -0.2) : '#c4281b', [-6, -6, 11, 11], { lw: 1.2 });
      c.fillStyle = gold; c.fillRect(-6, -1, 11, 2);
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(4.5, -4 + i * 3.5); c.lineTo(8, -2.8 + i * 3.5); c.lineTo(4.5, -1.6 + i * 3.5); c.closePath(); flatLine(c, '#eef2fa', '#3a3a4a', 0.7); }
      if ((back ? P.punchFxB : P.punchFx) > 0) {
        const k = back ? P.punchFxB : P.punchFx;
        c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = rgba(E.light, 0.7 * (1 - k * 0.4)); c.beginPath(); c.ellipse(10, 0, 12 * k, 7 * k, 0, 0, TAU); c.fill(); c.restore();
      }
      if (glowA) { c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = rgba(E.glow, glowA * 0.4); circle(c, 0, 0, 10); c.fill(); c.restore(); }
      break;
    }
  }
}

function drawSmear(c, K, S, sm, len) {
  const E = K.E, o = K.o;
  const a0 = sm.a0, a1 = sm.a1;
  if (Math.abs(a1 - a0) < 0.2) return;
  const r1 = len + (sm.big ? 14 : 6), r0 = sm.thin ? len - 10 : len * 0.45;
  c.save(); c.translate(S.x, S.y);
  c.globalCompositeOperation = 'lighter';
  c.beginPath(); c.arc(0, 0, r1, a0, a1, a1 < a0); c.arc(0, 0, r0, a1, a0, a1 >= a0); c.closePath();
  const g = c.createRadialGradient(0, 0, r0, 0, 0, r1);
  g.addColorStop(0, rgba(E.color, 0)); g.addColorStop(0.6, rgba(E.color, 0.45 * sm.k)); g.addColorStop(1, rgba(o.awake ? '#ffffff' : E.light, 0.95 * sm.k));
  c.fillStyle = g; c.fill();
  c.restore();
}

// ───────────── 초상화 캐시 ─────────────
const ArtCache = {};
function heroPortrait(def, awake, size = 128) {
  const key = 'p_' + def.id + (awake ? '_a' : '') + '_' + size;
  if (ArtCache[key]) return ArtCache[key];
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const E = ELEMS[def.elem];
  const g = c.createRadialGradient(size * 0.55, size * 0.38, 4, size * 0.5, size * 0.5, size * 0.8);
  g.addColorStop(0, shade(E.color, 0.45)); g.addColorStop(0.55, shade(E.color, -0.2)); g.addColorStop(1, shade(E.dark, -0.45));
  c.fillStyle = g; c.fillRect(0, 0, size, size);
  c.save(); c.translate(size * 0.55, size * 0.4); c.globalAlpha = 0.16;
  for (let i = 0; i < 14; i++) { c.rotate(TAU / 14); c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(0, 0); c.lineTo(size, -size * 0.1); c.lineTo(size, size * 0.1); c.fill(); }
  c.restore();
  // 문양 원
  c.save(); c.globalAlpha = 0.18; c.strokeStyle = '#ffffff'; c.lineWidth = size / 40; circle(c, size * 0.55, size * 0.4, size * 0.36); c.stroke(); c.restore();
  const s = size / 64;
  c.save(); c.translate(size * 0.46, size * 1.48); c.scale(s, s);
  const P = basePose(def); P.eyes = 'open';
  if (def.weapon === 'bow') P.wa = -1.3;
  drawHero(c, def, P, { awake, star: awake ? 6 : 3, t: 0.6, face: 1, noAura: true });
  c.restore();
  // 아래 그림자 그라데이션
  const bg = c.createLinearGradient(0, size * 0.65, 0, size); bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(1, 'rgba(0,0,0,0.35)');
  c.fillStyle = bg; c.fillRect(0, 0, size, size);
  ArtCache[key] = cv;
  return cv;
}
function portraitURL(def, awake, size = 128) {
  const key = 'u_' + def.id + (awake ? '_a' : '') + '_' + size;
  if (!ArtCache[key]) ArtCache[key] = heroPortrait(def, awake, size).toDataURL();
  return ArtCache[key];
}
