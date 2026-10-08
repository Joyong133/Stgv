'use strict';
// ───────────────────────── 캐릭터 아트 ─────────────────────────
// 모든 캐릭터는 부위(머리 · 머리카락 · 몸통 · 팔 · 다리 · 무기 · 장식)로 나뉜 "컷아웃" 리그로 그린다.
// 부위마다 외곽선 · 음영 · 하이라이트를 넣고, 포즈 값(팔 각도 · 무기 각도 · 기울기 등)을 바꿔 동작을 만든다.
// 좌표 단위: 발밑이 (0,0), 오른쪽을 바라보는 기준, 키 약 100.

const OL = '#1d1226';   // 외곽선 색
const OLW = 2.4;

function pathRR(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
function fillStroke(c, fill, lw = OLW) {
  c.fillStyle = fill; c.fill();
  c.lineWidth = lw; c.strokeStyle = OL; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
}
function capsule(c, x1, y1, x2, y2, r, fill) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  c.beginPath();
  c.arc(x1, y1, r, a + Math.PI / 2, a - Math.PI / 2);
  c.arc(x2, y2, r, a - Math.PI / 2, a + Math.PI / 2);
  c.closePath();
  fillStroke(c, fill);
}
function vgrad(c, y0, y1, a, b) { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); }
function star5(c, x, y, r1, r2, rot = -Math.PI / 2) {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? r2 : r1, a = rot + i * Math.PI / 5; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  c.closePath();
}

// ───────────── 포즈 ─────────────
// armF/armB: 팔 각도 (0=아래, +는 앞쪽으로 회전, π=위)  wa: 무기의 절대 각도 (캔버스 각, 0=오른쪽)
function basePose(def) {
  const P = { bob: 0, lean: 0, shift: 0, jump: 0, sq: 1, armF: 0.4, armB: -0.3, legF: 0, legB: 0,
    wa: -1.1, wb: -1.1, reach: 0, draw: 0, eyes: 'open', mouth: 'smile', glow: 0, smear: null,
    hideWpn: false, charge: 0, hairSwing: 0, stun: false, orb: null };
  switch (def.weapon) {
    case 'staff': P.armF = 0.55; P.wa = -1.42; break;
    case 'bow': P.armF = 0.5; P.wa = -1.2; break;
    case 'spear': P.armF = 0.5; P.wa = -1.28; break;
    case 'hammer': P.armF = 0.45; P.wa = -0.95; break;
    case 'scythe': P.armF = 0.5; P.wa = -1.35; break;
    case 'daggers': P.armF = 0.6; P.armB = 0.5; P.wa = 0.35; P.wb = 0.5; break;
    case 'shuriken': P.armF = 0.5; P.wa = -0.6; break;
    case 'orb': P.armF = 0.9; P.wa = -0.6; break;
  }
  return P;
}

// state: idle | attack | skill | stun | victory   p: 동작 진행도 0..1   aim: 목표 방향 (라디안, 0=정면)
function heroPose(def, state, p, t, aim = 0) {
  const P = basePose(def);
  const rest = { armF: P.armF, wa: P.wa, armB: P.armB, wb: P.wb };
  // 숨쉬기 · 눈 깜빡임
  P.bob = Math.sin(t * 3.2) * 1.1;
  P.armF += Math.sin(t * 3.2 + 0.6) * 0.04;
  P.hairSwing = Math.sin(t * 2.4) * 0.5;
  if ((t % 3.4) < 0.11) P.eyes = 'closed';
  aim = clamp(aim, -0.9, 0.9);

  if (state === 'attack' || state === 'skill') {
    const q = state === 'skill' ? seg(p, 0.2, 0.78) : p;
    attackPose(def, P, rest, q, aim);
    if (state === 'skill') {
      P.glow = Math.sin(Math.min(1, p * 1.25) * Math.PI) * 1 + 0.15;
      if (p < 0.18) { P.sq = 1 - 0.14 * Math.sin(seg(p, 0, 0.18) * Math.PI); P.bob += 3 * Math.sin(seg(p, 0, 0.18) * Math.PI); }
      P.jump = -Math.sin(seg(p, 0.12, 0.8) * Math.PI) * 26;
      if (p > 0.8) P.sq = 1 - 0.1 * Math.sin(seg(p, 0.8, 1) * Math.PI);
      P.eyes = 'angry'; P.mouth = 'shout';
      P.hairSwing = Math.sin(t * 14) * 1.5;
    }
  } else if (state === 'stun') {
    P.lean = Math.sin(t * 6) * 0.08; P.eyes = 'dizzy'; P.mouth = 'o'; P.stun = true;
    P.armF = 0.1; P.armB = -0.1;
  } else if (state === 'victory') {
    const j = Math.abs(Math.sin(t * 4));
    P.jump = -j * 12; P.armF = 2.7; P.wa = -1.7; P.armB = -2.4; P.eyes = 'happy'; P.mouth = 'open';
    if (def.weapon === 'bow') P.wa = -1.6;
  }
  return P;
}

function attackPose(def, P, rest, p, aim) {
  const R = rest;
  switch (def.anim) {
    case 'slash': {
      const heavy = def.weapon === 'hammer';
      if (p < 0.42) {
        const e = easeOut(p / 0.42);
        P.armF = lerp(R.armF, 2.95, e); P.wa = lerp(R.wa, heavy ? -2.9 : -2.55, e); P.lean = -0.14 * e; P.bob -= 1.5 * e;
        P.armB = lerp(R.armB, -0.9, e); P.eyes = 'angry';
      } else if (p < 0.6) {
        const e = easeIn((p - 0.42) / 0.18);
        P.armF = lerp(2.95, 0.65, e); P.wa = lerp(heavy ? -2.9 : -2.55, heavy ? 1.25 : 0.95, e); P.lean = lerp(-0.14, 0.2, e);
        P.armB = lerp(-0.9, 0.4, e); P.eyes = 'angry'; P.mouth = 'shout'; P.shift = 5 * e;
        P.smear = { a0: heavy ? -2.9 : -2.55, a1: P.wa, k: 1 - e * 0.2 };
        if (heavy) P.sq = 1 - 0.08 * e;
      } else {
        const e = easeInOut((p - 0.6) / 0.4);
        P.armF = lerp(0.65, R.armF, e); P.wa = lerp(heavy ? 1.25 : 0.95, R.wa, e); P.lean = lerp(0.2, 0, e);
        P.armB = lerp(0.4, R.armB, e); P.shift = 5 * (1 - e);
        if (p < 0.72) P.smear = { a0: heavy ? -2.9 : -2.55, a1: heavy ? 1.25 : 0.95, k: 1 - seg(p, 0.6, 0.72) };
      }
      break;
    }
    case 'reap': {
      if (p < 0.45) {
        const e = easeOut(p / 0.45);
        P.armF = lerp(R.armF, 2.7, e); P.wa = lerp(R.wa, -3.05, e); P.lean = -0.18 * e; P.armB = lerp(R.armB, 2.4, e); P.eyes = 'angry';
      } else if (p < 0.62) {
        const e = easeIn((p - 0.45) / 0.17);
        P.armF = lerp(2.7, 0.3, e); P.wa = lerp(-3.05, 1.75, e); P.lean = lerp(-0.18, 0.24, e); P.armB = lerp(2.4, 0.2, e);
        P.smear = { a0: -3.05, a1: P.wa, k: 1, big: true }; P.eyes = 'angry'; P.mouth = 'shout'; P.shift = 6 * e;
      } else {
        const e = easeInOut((p - 0.62) / 0.38);
        P.armF = lerp(0.3, R.armF, e); P.wa = lerp(1.75, R.wa, e); P.lean = lerp(0.24, 0, e); P.armB = lerp(0.2, R.armB, e); P.shift = 6 * (1 - e);
        if (p < 0.75) P.smear = { a0: -3.05, a1: 1.75, k: 1 - seg(p, 0.62, 0.75), big: true };
      }
      break;
    }
    case 'thrust': {
      const th = Math.PI / 2 - aim;
      if (p < 0.45) {
        const e = easeOut(p / 0.45);
        P.armF = lerp(R.armF, th - 0.2, e); P.wa = lerp(R.wa, aim, e); P.shift = -6 * e; P.lean = -0.1 * e; P.reach = -10 * e; P.eyes = 'angry';
        P.armB = lerp(R.armB, th - 0.4, e);
      } else if (p < 0.6) {
        const e = easeBack((p - 0.45) / 0.15);
        P.armF = th; P.wa = aim; P.shift = lerp(-6, 12, e); P.lean = lerp(-0.1, 0.16, e); P.reach = lerp(-10, 18, e); P.mouth = 'shout';
        P.armB = th - 0.4; P.eyes = 'angry'; P.thrustFx = e;
      } else {
        const e = easeInOut((p - 0.6) / 0.4);
        P.armF = lerp(th, R.armF, e); P.wa = lerp(aim, R.wa, e); P.shift = lerp(12, 0, e); P.lean = lerp(0.16, 0, e); P.reach = lerp(18, 0, e);
        P.armB = lerp(th - 0.4, R.armB, e);
      }
      break;
    }
    case 'bow': {
      const th = Math.PI / 2 - aim;
      if (p < 0.12) { const e = easeOut(p / 0.12); P.armF = lerp(R.armF, th, e); P.wa = lerp(R.wa, aim, e); P.armB = lerp(R.armB, th - 0.15, e); }
      else if (p < 0.6) { const e = easeOut((p - 0.12) / 0.48); P.armF = th; P.wa = aim; P.armB = th - 0.15 - 0.15 * e; P.draw = e; P.lean = -0.05 * e; P.eyes = 'focus'; }
      else { const e = easeOut((p - 0.6) / 0.4); P.armF = lerp(th, R.armF, e * e); P.wa = lerp(aim, R.wa, e * e); P.armB = lerp(th - 0.5, R.armB, e); P.draw = 0; P.lean = lerp(-0.12, 0, e); P.shift = -3 * (1 - e); P.released = 1 - e; }
      break;
    }
    case 'cast': {
      const th = Math.PI / 2 - aim;
      if (p < 0.5) {
        const e = easeOut(p / 0.5);
        P.armF = lerp(R.armF, 2.55, e); P.wa = lerp(R.wa, -1.95, e); P.armB = lerp(R.armB, 1.8, e); P.charge = e; P.lean = -0.08 * e; P.eyes = 'focus';
      } else if (p < 0.65) {
        const e = easeBack((p - 0.5) / 0.15);
        P.armF = lerp(2.55, th, e); P.wa = lerp(-1.95, aim - 0.35, e); P.armB = lerp(1.8, 0.6, e); P.charge = 1 - e; P.lean = lerp(-0.08, 0.14, e); P.shift = 4 * e;
        P.mouth = 'shout'; P.eyes = 'angry';
      } else {
        const e = easeInOut((p - 0.65) / 0.35);
        P.armF = lerp(th, R.armF, e); P.wa = lerp(aim - 0.35, R.wa, e); P.armB = lerp(0.6, R.armB, e); P.lean = lerp(0.14, 0, e); P.shift = 4 * (1 - e);
      }
      if (def.weapon === 'orb') P.orb = { x: 0, y: 0, cast: p < 0.58 ? 0 : seg(p, 0.58, 0.7) };
      break;
    }
    case 'javelin': {
      if (p < 0.5) {
        const e = easeOut(p / 0.5);
        P.armF = lerp(R.armF, 2.75, e); P.wa = lerp(R.wa, aim - 0.15, e); P.lean = -0.16 * e; P.armB = lerp(R.armB, 1.4, e); P.eyes = 'angry'; P.shift = -4 * e;
      } else if (p < 0.62) {
        const e = easeIn((p - 0.5) / 0.12);
        P.armF = lerp(2.75, 1.0, e); P.wa = aim; P.lean = lerp(-0.16, 0.2, e); P.armB = lerp(1.4, -0.6, e); P.mouth = 'shout'; P.shift = lerp(-4, 8, e);
        P.hideWpn = e > 0.5;
      } else {
        const e = easeInOut((p - 0.62) / 0.38);
        P.armF = lerp(1.0, R.armF, e); P.lean = lerp(0.2, 0, e); P.armB = lerp(-0.6, R.armB, e); P.shift = lerp(8, 0, e);
        P.hideWpn = e < 0.75; P.wpnFade = seg(e, 0.75, 1);
      }
      break;
    }
    case 'throw': {
      if (p < 0.42) {
        const e = easeOut(p / 0.42);
        P.armF = lerp(R.armF, -1.4, e); P.wa = lerp(R.wa, -2.4, e); P.lean = -0.12 * e; P.armB = lerp(R.armB, 1.3, e); P.eyes = 'focus';
      } else if (p < 0.58) {
        const e = easeIn((p - 0.42) / 0.16);
        P.armF = lerp(-1.4, 1.9 - aim, e); P.wa = lerp(-2.4, aim, e); P.lean = lerp(-0.12, 0.18, e); P.armB = lerp(1.3, -0.8, e); P.shift = 5 * e;
        P.hideWpn = e > 0.6; P.smear = { a0: -1.4, a1: P.wa, k: 0.6, thin: true };
      } else {
        const e = easeInOut((p - 0.58) / 0.42);
        P.armF = lerp(1.9 - aim, R.armF, e); P.wa = lerp(aim, R.wa, e); P.lean = lerp(0.18, 0, e); P.armB = lerp(-0.8, R.armB, e); P.shift = 5 * (1 - e);
        P.hideWpn = e < 0.5;
      }
      break;
    }
    case 'dual': {
      // 앞손 → 뒷손 연속 베기
      if (p < 0.12) { const e = easeOut(p / 0.12); P.armF = lerp(R.armF, 2.6, e); P.wa = lerp(R.wa, -2.2, e); P.eyes = 'angry'; P.lean = -0.08 * e; }
      else if (p < 0.3) { const e = easeIn((p - 0.12) / 0.18); P.armF = lerp(2.6, 0.4, e); P.wa = lerp(-2.2, 1.2, e); P.smear = { a0: -2.2, a1: P.wa, k: 1, thin: true }; P.lean = lerp(-0.08, 0.15, e); P.shift = 6 * e; P.armB = lerp(R.armB, 2.4, e); P.wb = lerp(R.wb, -2.2, e); }
      else if (p < 0.42) { P.armF = 0.4; P.wa = 1.2; P.armB = 2.4; P.wb = -2.2; P.shift = 6; P.lean = 0.12; }
      else if (p < 0.62) { const e = easeIn((p - 0.42) / 0.2); P.armF = 0.4; P.wa = 1.2; P.armB = lerp(2.4, 0.9, e); P.wb = lerp(-2.2, 1.5, e); P.smearB = { a0: -2.2, a1: P.wb, k: 1 }; P.lean = lerp(0.12, 0.2, e); P.shift = 6 + 4 * e; P.mouth = 'shout'; }
      else { const e = easeInOut((p - 0.62) / 0.38); P.armF = lerp(0.4, R.armF, e); P.wa = lerp(1.2, R.wa, e); P.armB = lerp(0.9, R.armB, e); P.wb = lerp(1.5, R.wb, e); P.shift = 10 * (1 - e); P.lean = 0.2 * (1 - e); }
      break;
    }
  }
}

// 각 동작에서 실제로 공격이 나가는 시점 (진행도)
const HIT_AT = { slash: [0.5], reap: [0.54], thrust: [0.52], bow: [0.6], cast: [0.58], javelin: [0.56], throw: [0.52], dual: [0.25, 0.55] };
const ACTION_TIME = { slash: 0.62, reap: 0.7, thrust: 0.6, bow: 0.66, cast: 0.75, javelin: 0.75, throw: 0.4, dual: 0.6 };
const SKILL_TIME = 1.15, SKILL_HIT = 0.56;

// ───────────── 영웅 그리기 ─────────────
// o: { awake, star, t, face(1|-1), alpha, noAura }
function drawHero(c, def, P, o) {
  const L = def.look, E = ELEMS[def.elem];
  const t = o.t || 0;
  c.save();
  if (o.face < 0) c.scale(-1, 1);
  c.translate(P.shift, P.jump);

  // 각성 오라 / 6성 빛
  if (o.awake && !o.noAura) drawAwakenAura(c, E, t, P.glow);
  else if (o.star >= 6 && !o.noAura) { const g = c.createRadialGradient(0, -40, 4, 0, -40, 50); g.addColorStop(0, rgba(E.glow, 0.28)); g.addColorStop(1, rgba(E.glow, 0)); c.fillStyle = g; circle(c, 0, -40, 50); c.fill(); }
  if (P.glow > 0) {
    const g = c.createRadialGradient(0, -40, 6, 0, -40, 70);
    g.addColorStop(0, rgba(E.light, 0.55 * P.glow)); g.addColorStop(0.5, rgba(E.color, 0.25 * P.glow)); g.addColorStop(1, rgba(E.color, 0));
    c.fillStyle = g; circle(c, 0, -40, 70); c.fill();
  }

  // 그림자 (점프 시 작아짐)
  c.save(); c.translate(0, -P.jump);
  const sh = 1 + P.jump / 80;
  c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(0, 1, 20 * sh, 5 * sh, 0, 0, TAU); c.fill();
  c.restore();

  c.scale(1, P.sq);
  const hipY = -20 + P.bob * 0.4;
  const metal = o.awake ? mix(L.trim, '#fff3b0', 0.3) : L.trim;
  const trim = o.awake ? '#ffe27a' : L.trim;

  // 다리
  drawLegs(c, L, P, hipY);

  // 상체 프레임 (엉덩이 기준 회전)
  c.save();
  c.translate(0, hipY + P.bob * 0.6);
  c.rotate(P.lean);
  const hx = 2, hy = -48;        // 머리 중심
  const SF = { x: 7, y: -25 }, SB = { x: -7, y: -25 };

  drawBackExtras(c, def, L, P, t, hx, hy, o);
  // 뒷손 + 뒷손 무기
  drawArm(c, L, SB, P.armB, 15, true);
  if (def.weapon === 'daggers') drawWeaponAt(c, def, SB, P.armB, P.wb, P, o, true);
  if (P.smearB) drawSmear(c, def, SB, P.smearB, 30, o);

  drawTorso(c, L, P, trim, o);
  drawFrontExtras(c, def, L, P, t, trim, o);
  drawHead(c, def, L, P, t, hx, hy, o, metal);

  if (L.extras.includes('shield')) drawShield(c, L, SB, P, trim);

  // 앞손 + 무기
  if (P.smear) drawSmear(c, def, SF, P.smear, def.weapon === 'scythe' ? 58 : def.weapon === 'hammer' ? 44 : 42, o);
  if (!P.hideWpn || P.wpnFade) {
    c.save(); if (P.hideWpn) c.globalAlpha *= P.wpnFade || 0;
    drawWeaponAt(c, def, SF, P.armF, P.wa, P, o, false);
    c.restore();
  }
  drawArm(c, L, SF, P.armF, 15, false);
  if (def.weapon === 'orb') drawOrb(c, def, SF, P, t, o);
  c.restore();

  if (P.stun) {
    for (let i = 0; i < 3; i++) {
      const a = t * 4 + i * TAU / 3;
      c.fillStyle = '#ffe14d'; star5(c, Math.cos(a) * 16, -82 + Math.sin(a) * 5, 5, 2.2); fillStroke(c, '#ffe14d', 1.4);
    }
  }
  c.restore();
}

function drawAwakenAura(c, E, t, glow) {
  c.save();
  c.translate(0, -42);
  const pulse = 0.85 + Math.sin(t * 3) * 0.15;
  const g = c.createRadialGradient(0, 0, 6, 0, 0, 62 * pulse);
  g.addColorStop(0, rgba(E.light, 0.5)); g.addColorStop(0.55, rgba(E.color, 0.22)); g.addColorStop(1, rgba(E.color, 0));
  c.fillStyle = g; circle(c, 0, 0, 62 * pulse); c.fill();
  // 회전하는 문양 고리
  c.save(); c.scale(1, 0.35); c.translate(0, 120);
  c.rotate(t * 0.8);
  c.strokeStyle = rgba(E.light, 0.75); c.lineWidth = 2.2;
  circle(c, 0, 0, 40); c.stroke();
  for (let i = 0; i < 8; i++) {
    c.rotate(TAU / 8);
    c.beginPath(); c.moveTo(34, 0); c.lineTo(46, -4); c.lineTo(46, 4); c.closePath(); c.fillStyle = rgba(E.glow, 0.8); c.fill();
  }
  c.restore();
  c.restore();
}

function drawLegs(c, L, P, hipY) {
  const pants = L.body === 'robe' ? shade(L.c1, -0.35) : shade(L.c2, -0.1);
  const boot = shade(L.c2, -0.45);
  const legs = [[-5, P.legB, true], [5, P.legF, false]];
  for (const [x, a, back] of legs) {
    c.save(); c.translate(x, hipY); c.rotate(a);
    const col = back ? shade(pants, -0.18) : pants;
    if (L.body !== 'robe') capsule(c, 0, 0, 0, 12, 5, col);
    // 부츠
    pathRR(c, -5.5, 10, 12.5, 9.5, 4); fillStroke(c, back ? shade(boot, -0.2) : boot);
    c.fillStyle = rgba('#ffffff', 0.18); c.fillRect(-3.5, 12, 7, 2);
    c.restore();
  }
}

function drawArm(c, L, S, ang, len, back) {
  const hx = S.x + Math.sin(ang) * len, hy = S.y + Math.cos(ang) * len;
  const sleeve = back ? shade(L.c1, -0.25) : L.c1;
  capsule(c, S.x, S.y, S.x + Math.sin(ang) * len * 0.62, S.y + Math.cos(ang) * len * 0.62, 5.2, sleeve);
  c.beginPath(); c.arc(hx, hy, 4.6, 0, TAU); fillStroke(c, back ? shade(L.skin, -0.12) : L.skin);
  return { x: hx, y: hy };
}
const handPos = (S, ang, len = 15) => ({ x: S.x + Math.sin(ang) * len, y: S.y + Math.cos(ang) * len });

function drawTorso(c, L, P, trim, o) {
  const c1 = L.c1, c2 = L.c2;
  if (L.body === 'robe') {
    // 긴 로브
    c.beginPath();
    c.moveTo(-11, -30); c.quadraticCurveTo(0, -34, 11, -30);
    c.lineTo(15, 16); c.quadraticCurveTo(0, 21 + Math.sin(P.bob) * 1, -15, 16); c.closePath();
    fillStroke(c, vgrad(c, -32, 18, shade(c1, 0.15), shade(c1, -0.25)));
    c.fillStyle = trim; c.fillRect(-1.6, -28, 3.2, 42);
    c.beginPath(); c.moveTo(-15, 13); c.quadraticCurveTo(0, 18, 15, 13); c.lineWidth = 3; c.strokeStyle = trim; c.stroke();
    // 허리띠
    pathRR(c, -12, -12, 24, 5, 2); fillStroke(c, c2, 1.8);
    c.beginPath(); c.arc(0, -9.5, 3, 0, TAU); fillStroke(c, trim, 1.4);
  } else if (L.body === 'coat') {
    // 뒤로 날리는 코트 자락
    c.beginPath(); c.moveTo(-10, -10); c.quadraticCurveTo(-22 - Math.sin(P.bob * 2) * 2, 4, -18, 14); c.lineTo(-4, 6); c.closePath();
    fillStroke(c, shade(c1, -0.25));
    pathRR(c, -12, -31, 24, 30, 7); fillStroke(c, vgrad(c, -31, 0, shade(c1, 0.12), shade(c1, -0.2)));
    c.beginPath(); c.moveTo(1, -31); c.lineTo(5, -2); c.lineTo(10, -31); c.closePath(); c.fillStyle = c2; c.fill();
    c.strokeStyle = trim; c.lineWidth = 2; c.beginPath(); c.moveTo(1, -30); c.lineTo(4, -3); c.stroke();
    pathRR(c, -12, -8, 24, 5, 2); fillStroke(c, shade(c2, -0.3), 1.8);
  } else if (L.body === 'armor') {
    // 갑옷: 흉갑 + 허리 갑주
    for (let i = -1; i <= 1; i += 2) { c.beginPath(); c.moveTo(i * 3, -6); c.lineTo(i * 13, -5); c.lineTo(i * 12, 6); c.lineTo(i * 3, 5); c.closePath(); fillStroke(c, shade(c2, -0.1)); }
    pathRR(c, -12.5, -32, 25, 28, 8); fillStroke(c, vgrad(c, -32, -4, shade(c1, 0.25), shade(c1, -0.22)));
    c.beginPath(); c.moveTo(-8, -27); c.quadraticCurveTo(0, -17, 8, -27); c.lineWidth = 2.2; c.strokeStyle = trim; c.stroke();
    c.fillStyle = rgba('#ffffff', 0.35); pathRR(c, -8, -29, 5, 9, 2.5); c.fill();
    pathRR(c, -13, -9, 26, 5, 2); fillStroke(c, shade(c2, -0.35), 1.8);
    c.beginPath(); c.arc(0, -6.5, 3, 0, TAU); fillStroke(c, trim, 1.4);
  } else {
    // 경장 (튜닉)
    pathRR(c, -11.5, -31, 23, 29, 7); fillStroke(c, vgrad(c, -31, -2, shade(c1, 0.15), shade(c1, -0.2)));
    c.strokeStyle = shade(c2, -0.3); c.lineWidth = 3; c.beginPath(); c.moveTo(-9, -29); c.lineTo(8, -8); c.stroke();
    c.beginPath(); c.moveTo(-11, -4); c.lineTo(-13, 4); c.lineTo(13, 4); c.lineTo(11, -4); c.closePath(); fillStroke(c, shade(c1, -0.15));
    pathRR(c, -12, -8, 24, 4.5, 2); fillStroke(c, c2, 1.6);
    c.fillStyle = trim; c.fillRect(-2, -7.5, 4, 3.5);
  }
}

function drawHead(c, def, L, P, t, hx, hy, o, metal) {
  const R = 22;
  const hs = L.hairStyle;
  // 목
  c.fillStyle = shade(L.skin, -0.2); c.fillRect(-3, -33, 7, 6);
  // 귀 (엘프)
  if (L.extras.includes('elfEars')) {
    c.beginPath(); c.moveTo(hx - 12, hy + 2); c.lineTo(hx - 30, hy - 10); c.lineTo(hx - 14, hy + 9); c.closePath(); fillStroke(c, L.skin, 2);
  }
  // 귀 (사람) — 얼굴 뒤에 살짝 보이게
  if (!L.extras.includes('elfEars') && hs !== 'hood' && hs !== 'helm') { c.beginPath(); c.ellipse(hx - 19, hy + 5, 4, 5.5, 0, 0, TAU); fillStroke(c, shade(L.skin, -0.05), 1.8); }
  // 얼굴
  c.beginPath(); c.ellipse(hx, hy, R, R - 1, 0, 0, TAU);
  const g = c.createRadialGradient(hx + 5, hy - 2, 4, hx, hy, R + 2);
  g.addColorStop(0, shade(L.skin, 0.12)); g.addColorStop(1, shade(L.skin, -0.08));
  fillStroke(c, g);

  drawFace(c, def, L, P, t, hx, hy, o);
  drawHair(c, def, L, P, t, hx, hy, R, o, metal);
}

function drawFace(c, def, L, P, t, hx, hy, o) {
  const eyeC = o.awake ? mix(L.eye, '#ffffff', 0.15) : L.eye;
  const eyes = [[hx + 10, hy + 4, 1], [hx - 2, hy + 4, 0.82]];
  // 볼터치
  c.fillStyle = 'rgba(255,110,120,0.28)';
  c.beginPath(); c.ellipse(hx + 14, hy + 12, 4, 2.4, 0, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(hx - 4, hy + 12, 3, 2, 0, 0, TAU); c.fill();
  for (const [ex, ey, s] of eyes) {
    c.save(); c.translate(ex, ey); c.scale(s, 1);
    if (P.eyes === 'closed' || P.eyes === 'happy') {
      c.beginPath();
      if (P.eyes === 'happy') c.arc(0, 2, 4, Math.PI * 1.1, Math.PI * 1.9); else c.arc(0, -1, 4, Math.PI * 0.15, Math.PI * 0.85);
      c.lineWidth = 2.4; c.strokeStyle = OL; c.stroke();
    } else if (P.eyes === 'dizzy') {
      c.lineWidth = 2; c.strokeStyle = OL; c.beginPath(); c.moveTo(-3, -3); c.lineTo(3, 3); c.moveTo(3, -3); c.lineTo(-3, 3); c.stroke();
    } else {
      const narrow = P.eyes === 'angry' || P.eyes === 'focus' ? 0.78 : 1;
      c.beginPath(); c.ellipse(0, 0, 4.4, 5.8 * narrow, 0, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
      const ig = c.createLinearGradient(0, -5, 0, 5); ig.addColorStop(0, shade(eyeC, -0.45)); ig.addColorStop(1, shade(eyeC, 0.35));
      c.beginPath(); c.ellipse(0.8, 0.4, 3.4, 4.8 * narrow, 0, 0, TAU); c.fillStyle = ig; c.fill();
      c.beginPath(); c.ellipse(1, 0.6, 1.6, 2.4 * narrow, 0, 0, TAU); c.fillStyle = shade(eyeC, -0.65); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(-0.6, -1.8, 1.4, 0, TAU); c.fill();
      c.beginPath(); c.arc(2, 2.2, 0.7, 0, TAU); c.fill();
      if (o.awake) { c.fillStyle = rgba(ELEMS[def.elem].light, 0.5); c.beginPath(); c.ellipse(0.8, 0.4, 3.4, 4.8 * narrow, 0, 0, TAU); c.fill(); }
      // 속눈썹
      c.lineWidth = 2.2; c.strokeStyle = OL; c.beginPath(); c.ellipse(0, 0, 4.6, 5.9 * narrow, 0, Math.PI * 1.08, Math.PI * 1.95); c.stroke();
    }
    c.restore();
  }
  // 눈썹
  c.lineWidth = 1.8; c.strokeStyle = shade(L.hair, -0.4);
  const ang = P.eyes === 'angry' ? 0.35 : P.eyes === 'focus' ? 0.18 : -0.08;
  c.beginPath(); c.moveTo(hx + 6, hy - 4 - 2 * Math.sin(-ang)); c.lineTo(hx + 14, hy - 4 + 2 * Math.sin(-ang) - 1); c.stroke();
  c.beginPath(); c.moveTo(hx - 5, hy - 4 + 1 * Math.sin(-ang)); c.lineTo(hx + 1, hy - 4 - 1.5 * Math.sin(-ang)); c.stroke();
  // 입
  if (L.extras.includes('mask')) return;
  c.lineWidth = 1.7; c.strokeStyle = OL;
  const mx = hx + 7, my = hy + 14;
  c.beginPath();
  if (P.mouth === 'shout') { c.ellipse(mx, my + 1, 2.8, 2.6, 0, 0, TAU); c.fillStyle = '#7a1f2c'; c.fill(); c.stroke(); }
  else if (P.mouth === 'open') { c.arc(mx, my - 0.5, 2.8, 0, Math.PI); c.closePath(); c.fillStyle = '#c23a4a'; c.fill(); c.stroke(); }
  else if (P.mouth === 'o') { c.ellipse(mx, my + 1, 1.6, 2, 0, 0, TAU); c.stroke(); }
  else { c.arc(mx, my - 2, 2.6, Math.PI * 0.2, Math.PI * 0.8); c.stroke(); }
}

function hairPathCap(c, hx, hy, R) {
  c.beginPath();
  c.moveTo(hx - R - 1, hy + 8);
  c.bezierCurveTo(hx - R - 4, hy - R - 8, hx + R + 8, hy - R - 8, hx + R + 2, hy + 3);
  // 앞머리: 뾰족한 가닥들 (오른쪽 → 왼쪽)
  const P = [[R - 3, -9], [15, 1], [11, -10], [6, 0], [2, -11], [-3, -1], [-7, -10]];
  let px = hx + R + 2, py = hy + 3;
  for (const [dx, dy] of P) {
    const x = hx + dx, y = hy + dy;
    c.quadraticCurveTo((px + x) / 2 + (dy < 0 ? 1.5 : -1.5), (py + y) / 2, x, y);
    px = x; py = y;
  }
  c.quadraticCurveTo(hx - 12, hy - 4, hx - R - 1, hy + 8);
  c.closePath();
}

function drawHair(c, def, L, P, t, hx, hy, R, o, metal) {
  const hair = L.hair, hs = L.hairStyle;
  const hg = c.createLinearGradient(0, hy - R, 0, hy + 10);
  hg.addColorStop(0, shade(hair, 0.25)); hg.addColorStop(1, shade(hair, -0.2));
  if (hs === 'hood') {
    // 후드 (얼굴 앞만 열림)
    c.beginPath();
    c.moveTo(hx + R + 2, hy + 4);
    c.bezierCurveTo(hx + R + 8, hy - R - 10, hx - R - 14, hy - R - 14, hx - R - 10, hy + 6);
    c.quadraticCurveTo(hx - R - 6, hy + 22, hx - 10, hy + 24);
    c.lineTo(hx - 6, hy + 10);
    c.quadraticCurveTo(hx - 4, hy - 12, hx + 10, hy - 12);
    c.quadraticCurveTo(hx + 20, hy - 10, hx + R + 2, hy + 4);
    c.closePath();
    fillStroke(c, vgrad(c, hy - R - 10, hy + 22, shade(L.c1, 0.25), shade(L.c1, -0.2)));
    c.strokeStyle = L.trim; c.lineWidth = 1.6; c.beginPath(); c.moveTo(hx - 6, hy + 10); c.quadraticCurveTo(hx - 4, hy - 12, hx + 10, hy - 12); c.stroke();
    // 앞머리 몇 가닥
    c.beginPath(); c.moveTo(hx - 2, hy - 11); c.lineTo(hx + 4, hy - 1); c.lineTo(hx + 6, hy - 11); c.lineTo(hx + 12, hy - 2); c.lineTo(hx + 14, hy - 11); c.closePath(); fillStroke(c, hg, 1.6);
    return;
  }
  if (hs === 'helm') {
    // 투구 + 깃털 장식
    const sw = Math.sin(t * 3) * 2;
    c.beginPath(); c.moveTo(hx - 4, hy - R - 2); c.quadraticCurveTo(hx - 24 + sw, hy - R - 18, hx - 34 + sw, hy - R + 4); c.quadraticCurveTo(hx - 18, hy - R - 2, hx - 6, hy - R + 6); c.closePath();
    fillStroke(c, vgrad(c, hy - R - 18, hy - R + 6, '#ff5a5a', '#a01a2a'), 2);
    c.beginPath();
    c.moveTo(hx - R - 2, hy + 8);
    c.bezierCurveTo(hx - R - 4, hy - R - 8, hx + R + 6, hy - R - 8, hx + R + 3, hy + 2);
    c.lineTo(hx + R - 2, hy - 2); c.lineTo(hx - 2, hy - 2); c.lineTo(hx - 4, hy + 16); c.lineTo(hx - R + 2, hy + 18); c.closePath();
    fillStroke(c, vgrad(c, hy - R - 6, hy + 18, shade('#e9edf5', 0.2), '#8f9bb3'));
    c.fillStyle = metal; c.fillRect(hx - 3, hy - R - 5, 4, R + 2);
    c.strokeStyle = OL; c.lineWidth = 1.4; c.strokeRect(hx - 3, hy - R - 5, 4, R + 2);
    c.fillStyle = rgba('#ffffff', 0.45); c.beginPath(); c.ellipse(hx + 8, hy - 14, 7, 3, -0.4, 0, TAU); c.fill();
    // 투구 아래 머리카락
    c.beginPath(); c.moveTo(hx + 2, hy - 2); c.lineTo(hx + 6, hy + 6); c.lineTo(hx + 9, hy - 2); c.lineTo(hx + 13, hy + 4); c.lineTo(hx + 16, hy - 2); c.closePath(); fillStroke(c, hg, 1.6);
    return;
  }
  // 앞쪽 머리 덩어리
  hairPathCap(c, hx, hy, R);
  fillStroke(c, hg);
  // 하이라이트 띠
  c.strokeStyle = rgba('#ffffff', 0.45); c.lineWidth = 2.4;
  c.beginPath(); c.arc(hx + 2, hy - 2, R - 6, -2.4, -1.5); c.stroke();
  if (hs === 'spiky') {
    const sp = [[-0.6, 14], [-1.3, 17], [-2.0, 16], [-2.6, 13], [0.2, 10]];
    for (const [a, l] of sp) {
      const bx = hx + Math.cos(a - Math.PI / 2 + 0.5) * (R - 4), by = hy - 4 + Math.sin(a - Math.PI / 2 + 0.5) * (R - 4);
      const ang = a - Math.PI / 2 - 0.2 + P.hairSwing * 0.05;
      c.beginPath();
      c.moveTo(bx + Math.cos(ang + 1.5) * 6, by + Math.sin(ang + 1.5) * 6);
      c.lineTo(bx + Math.cos(ang) * (l + 8), by + Math.sin(ang) * (l + 8));
      c.lineTo(bx + Math.cos(ang - 1.5) * 6, by + Math.sin(ang - 1.5) * 6);
      c.closePath(); fillStroke(c, hg, 2);
    }
    hairPathCap(c, hx, hy, R); c.fillStyle = hg; c.fill();
  }
  // 모자 · 장식
  const ex = L.extras;
  if (ex.includes('witchHat')) {
    c.beginPath(); c.ellipse(hx + 1, hy - R + 4, R + 12, 6, -0.12, 0, TAU); fillStroke(c, shade(L.c1, -0.2));
    c.beginPath(); c.moveTo(hx - 14, hy - R + 2); c.quadraticCurveTo(hx - 6, hy - R - 34, hx - 26 + Math.sin(t * 2) * 2, hy - R - 40); c.quadraticCurveTo(hx + 6, hy - R - 30, hx + 16, hy - R + 1); c.closePath();
    fillStroke(c, vgrad(c, hy - R - 40, hy - R, shade(L.c1, 0.1), shade(L.c1, -0.25)));
    c.fillStyle = L.trim; c.beginPath(); c.moveTo(hx - 13, hy - R - 2); c.lineTo(hx + 15, hy - R - 3); c.lineTo(hx + 14, hy - R + 2); c.lineTo(hx - 13, hy - R + 3); c.fill();
    c.fillStyle = ELEMS[def.elem].light; star5(c, hx + 2, hy - R - 1, 3.4, 1.5); c.fill();
  }
  if (ex.includes('tiara')) {
    c.beginPath(); c.moveTo(hx - 6, hy - R + 2); c.lineTo(hx, hy - R - 6); c.lineTo(hx + 4, hy - R); c.lineTo(hx + 9, hy - R - 9); c.lineTo(hx + 14, hy - R); c.lineTo(hx + 19, hy - R - 5); c.lineTo(hx + 22, hy - R + 4); c.closePath();
    fillStroke(c, '#e6f6ff', 1.6); c.fillStyle = ELEMS[def.elem].color; circle(c, hx + 9, hy - R - 2, 2.4); c.fill();
  }
  if (ex.includes('wingHelm')) {
    c.beginPath(); c.moveTo(hx - 14, hy - 12); c.quadraticCurveTo(hx - 28, hy - 30, hx - 36, hy - 26); c.quadraticCurveTo(hx - 28, hy - 20, hx - 34, hy - 16); c.quadraticCurveTo(hx - 24, hy - 12, hx - 16, hy - 4); c.closePath();
    fillStroke(c, '#ffffff', 1.8);
    c.beginPath(); c.moveTo(hx - 12, hy - R + 2); c.quadraticCurveTo(hx + 4, hy - R - 8, hx + 20, hy - R + 4); c.lineWidth = 4; c.strokeStyle = metal; c.stroke();
  }
  if (ex.includes('horns')) {
    for (const [dx, s] of [[-8, 0.85], [8, 1]]) {
      c.beginPath(); c.moveTo(hx + dx - 4, hy - R + 4); c.quadraticCurveTo(hx + dx - 2, hy - R - 16 * s, hx + dx + 10 * s, hy - R - 18 * s); c.quadraticCurveTo(hx + dx + 2, hy - R - 6, hx + dx + 4, hy - R + 5); c.closePath();
      fillStroke(c, vgrad(c, hy - R - 18, hy - R + 4, '#3a2440', '#140a18'), 1.8);
    }
  }
  if (ex.includes('halo') || o.awake) {
    const E = ELEMS[def.elem];
    c.save(); c.translate(hx + 2, hy - R - 10 + Math.sin(t * 2.5) * 1.5);
    c.scale(1, 0.32);
    c.lineWidth = 4; c.strokeStyle = o.awake ? E.light : '#fff3a0'; circle(c, 0, 0, 14); c.stroke();
    c.lineWidth = 1.5; c.strokeStyle = o.awake ? E.color : '#ffcf3f'; circle(c, 0, 0, 14); c.stroke();
    c.restore();
  }
  if (ex.includes('monocle')) { c.lineWidth = 1.6; c.strokeStyle = '#d8b23a'; circle(c, hx + 10, hy + 4, 6.5); c.stroke(); }
  if (ex.includes('mask')) {
    c.beginPath(); c.moveTo(hx - 6, hy + 8); c.quadraticCurveTo(hx + 10, hy + 6, hx + R + 1, hy + 6); c.quadraticCurveTo(hx + R - 2, hy + 18, hx + 8, hy + 20); c.quadraticCurveTo(hx - 2, hy + 18, hx - 6, hy + 8); c.closePath();
    fillStroke(c, vgrad(c, hy + 6, hy + 20, shade(L.c1, 0.2), shade(L.c1, -0.2)), 1.8);
  }
}

function drawBackExtras(c, def, L, P, t, hx, hy, o) {
  const ex = L.extras, E = ELEMS[def.elem];
  const wave = Math.sin(t * 4) * 3 + P.hairSwing * 2 - P.shift * 0.6;
  // 날개
  if (ex.includes('wings') || (o.awake && (def.elem === 'light'))) {
    const flap = Math.sin(t * 5) * 0.12;
    for (const s of [0.8, 1]) {
      c.save(); c.translate(-4, -26); c.rotate(-0.2 + flap * s); c.scale(s, s);
      c.beginPath(); c.moveTo(0, 0);
      c.bezierCurveTo(-20, -30, -46, -34, -54, -20);
      c.quadraticCurveTo(-44, -16, -50, -8); c.quadraticCurveTo(-38, -6, -42, 4); c.quadraticCurveTo(-26, 2, -26, 12); c.quadraticCurveTo(-12, 6, 0, 6);
      c.closePath();
      fillStroke(c, vgrad(c, -34, 12, '#ffffff', o.awake ? E.light : '#dce6f5'), 2);
      c.restore();
    }
  }
  if (ex.includes('batWings') || (o.awake && def.elem === 'dark' && !ex.includes('batWings'))) {
    const flap = Math.sin(t * 6) * 0.15;
    c.save(); c.translate(-4, -24); c.rotate(-0.1 + flap);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(-18, -26); c.lineTo(-44, -22); c.quadraticCurveTo(-36, -12, -40, -4); c.quadraticCurveTo(-30, -6, -28, 4); c.quadraticCurveTo(-18, 0, -14, 10); c.closePath();
    fillStroke(c, vgrad(c, -26, 10, '#5a2a7a', '#1a0a24'), 2);
    c.restore();
  }
  if (o.awake && (def.elem === 'fire' || def.elem === 'water' || def.elem === 'wind') && !ex.includes('wings')) {
    // 각성: 속성 에너지 날개
    const flap = Math.sin(t * 4) * 0.1;
    c.save(); c.translate(-4, -26); c.rotate(-0.25 + flap); c.globalAlpha *= 0.85;
    for (let i = 0; i < 4; i++) {
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-20 - i * 6, -30 + i * 10, -40 - i * 4, -26 + i * 14); c.quadraticCurveTo(-24, -8 + i * 6, 0, 4);
      c.fillStyle = rgba(i % 2 ? E.color : E.light, 0.55); c.fill();
    }
    c.restore();
  }
  // 망토
  if (ex.includes('cape') || ex.includes('tatteredCape') || ex.includes('leafCape')) {
    const col = ex.includes('leafCape') ? '#3f8f3a' : ex.includes('tatteredCape') ? '#1a1020' : shade(L.c1, -0.15);
    const inner = ex.includes('leafCape') ? '#7dcf5a' : ex.includes('tatteredCape') ? '#5a2a7a' : (o.awake ? '#ffd23f' : L.trim);
    c.beginPath();
    c.moveTo(-9, -30);
    c.quadraticCurveTo(-24 - wave, -6, -22 - wave * 1.3, 18);
    if (ex.includes('tatteredCape')) { c.lineTo(-17 - wave, 12); c.lineTo(-13 - wave, 20); c.lineTo(-9 - wave * 0.6, 12); c.lineTo(-4, 19); }
    else c.quadraticCurveTo(-12 - wave, 22, -2, 16);
    c.lineTo(6, -28); c.closePath();
    fillStroke(c, vgrad(c, -30, 20, shade(col, 0.1), shade(col, -0.3)));
    c.strokeStyle = inner; c.lineWidth = 2; c.beginPath(); c.moveTo(-9, -29); c.quadraticCurveTo(-22 - wave, -6, -21 - wave * 1.3, 16); c.stroke();
  }
  if (ex.includes('quiver')) {
    c.save(); c.translate(-10, -22); c.rotate(-0.5);
    pathRR(c, -4, -14, 9, 22, 3); fillStroke(c, '#7a4a28', 2);
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-2 + i * 3, -14); c.lineTo(-3 + i * 3, -21); c.lineTo(i * 3, -21); c.closePath(); fillStroke(c, ELEMS[def.elem].color, 1.2); }
    c.restore();
  }
  // 뒷머리
  const hs = L.hairStyle, hg = vgrad(c, hy - 20, hy + 40, shade(L.hair, 0.15), shade(L.hair, -0.3));
  if (hs === 'long') {
    c.beginPath();
    c.moveTo(hx - 20, hy - 10);
    c.quadraticCurveTo(hx - 28 - P.hairSwing, hy + 24, hx - 22 - P.hairSwing * 2, hy + 42);
    c.quadraticCurveTo(hx - 12, hy + 36, hx - 6, hy + 44);
    c.quadraticCurveTo(hx + 2, hy + 30, hx + 12, hy + 24);
    c.lineTo(hx + 16, hy); c.closePath();
    fillStroke(c, hg);
  } else if (hs === 'pony') {
    const sw = P.hairSwing * 2 + Math.sin(t * 5) * 2 - P.shift * 0.5;
    c.beginPath();
    c.moveTo(hx - 16, hy - 16);
    c.quadraticCurveTo(hx - 38 - sw, hy - 18, hx - 34 - sw * 1.5, hy + 18);
    c.quadraticCurveTo(hx - 30 - sw, hy + 4, hx - 18, hy - 2); c.closePath();
    fillStroke(c, hg);
    c.fillStyle = L.trim; circle(c, hx - 18, hy - 12, 3.5); c.fill();
  } else if (hs === 'twin') {
    const sw = P.hairSwing * 1.5 + Math.sin(t * 4.4) * 1.5;
    for (const [dx, s] of [[-14, 1], [6, 0.8]]) {
      c.beginPath();
      c.moveTo(hx + dx, hy - 12);
      c.quadraticCurveTo(hx + dx - 14 * s - sw, hy + 10, hx + dx - 10 * s - sw * 1.4, hy + 34 * s);
      c.quadraticCurveTo(hx + dx - 2 - sw, hy + 16, hx + dx + 6, hy - 6); c.closePath();
      fillStroke(c, hg);
    }
  } else if (hs === 'short' || hs === 'spiky') {
    c.beginPath(); c.ellipse(hx - 6, hy - 2, R0 + 1, R0 - 2, 0.2, 0, TAU); fillStroke(c, hg);
  }
}
const R0 = 20;

function drawFrontExtras(c, def, L, P, t, trim, o) {
  const ex = L.extras;
  const fl = Math.sin(t * 6) * 3 - P.shift;
  if (ex.includes('shoulder')) {
    c.beginPath(); c.ellipse(7, -27, 9, 6, 0.2, Math.PI, TAU); c.closePath(); fillStroke(c, vgrad(c, -33, -24, shade(L.c2, 0.3), shade(L.c2, -0.2)), 2);
    c.fillStyle = trim; c.fillRect(1, -27, 13, 2);
  }
  if (ex.includes('furCollar')) {
    c.beginPath();
    for (let i = 0; i <= 8; i++) { const a = Math.PI + i * Math.PI / 8; c.lineTo(Math.cos(a) * 14, -30 + Math.sin(a) * 5 + (i % 2) * 3); }
    c.closePath(); fillStroke(c, '#f4fbff', 1.8);
  }
  for (const k of ['scarfFire', 'scarfWind', 'scarfDark']) {
    if (!ex.includes(k)) continue;
    const col = k === 'scarfFire' ? '#ffcf3f' : k === 'scarfWind' ? '#3fae6a' : '#6a2a9a';
    c.beginPath(); c.moveTo(-6, -31); c.quadraticCurveTo(-24 - fl, -30, -36 - fl * 1.6, -24 + Math.sin(t * 7) * 3); c.lineTo(-34 - fl * 1.5, -18); c.quadraticCurveTo(-20, -24, -6, -26); c.closePath();
    fillStroke(c, shade(col, -0.1), 2);
    pathRR(c, -10, -33, 22, 7, 3); fillStroke(c, col, 2);
  }
  if (ex.includes('hoodDown')) {
    c.beginPath(); c.moveTo(-12, -30); c.quadraticCurveTo(-22, -26, -16, -18); c.quadraticCurveTo(-6, -24, 2, -30); c.closePath(); fillStroke(c, shade(L.c1, -0.1), 2);
  }
}

function drawShield(c, L, S, P, trim) {
  const h = handPos(S, P.armB);
  c.save(); c.translate(h.x + 4, h.y - 4);
  c.beginPath(); c.moveTo(0, -14); c.quadraticCurveTo(12, -12, 12, -8); c.quadraticCurveTo(12, 8, 0, 16); c.quadraticCurveTo(-12, 8, -12, -8); c.quadraticCurveTo(-12, -12, 0, -14); c.closePath();
  fillStroke(c, vgrad(c, -14, 16, '#f4f6fb', '#9aa6c0'));
  c.fillStyle = trim; c.fillRect(-1.6, -10, 3.2, 20); c.fillRect(-7, -3, 14, 3.2);
  c.restore();
}

function drawOrb(c, def, S, P, t, o) {
  const E = ELEMS[def.elem];
  const h = handPos(S, P.armF);
  const fly = P.orb ? P.orb.cast : 0;
  const x = h.x + 8 + fly * 30, y = h.y - 12 + Math.sin(t * 3) * 2 - fly * 4;
  if (P.orb && fly > 0.9) return;
  const r = 7 + (P.charge || 0) * 3;
  const g = c.createRadialGradient(x - 2, y - 2, 1, x, y, r * 2.2);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, E.light); g.addColorStop(0.6, rgba(E.color, 0.6)); g.addColorStop(1, rgba(E.color, 0));
  c.fillStyle = g; circle(c, x, y, r * 2.2); c.fill();
  c.beginPath(); c.arc(x, y, r, 0, TAU); fillStroke(c, vgrad(c, y - r, y + r, E.light, E.dark), 1.8);
  // 궤도 룬
  for (let i = 0; i < 3; i++) { const a = t * 3 + i * TAU / 3; c.fillStyle = E.light; circle(c, x + Math.cos(a) * (r + 6), y + Math.sin(a) * (r + 6) * 0.5, 1.6); c.fill(); }
}

// 무기의 손잡이를 손 위치에 두고 wa 각도로 그린다
function drawWeaponAt(c, def, S, armAng, wa, P, o, back) {
  const h = handPos(S, armAng);
  c.save(); c.translate(h.x, h.y); c.rotate(wa);
  drawWeapon(c, def, P, o, back);
  c.restore();
}

function drawWeapon(c, def, P, o, back) {
  const E = ELEMS[def.elem];
  const glowA = o.awake ? 0.9 : o.star >= 5 ? 0.5 : 0;
  const metal = o.awake ? '#fff6d0' : '#e6edf6';
  switch (def.weapon) {
    case 'sword': {
      // 손잡이 + 가드 + 칼날
      capsule(c, -8, 0, 2, 0, 2.6, '#5a3020');
      pathRR(c, 1, -7, 5, 14, 2); fillStroke(c, o.awake ? '#ffd23f' : '#c9a43a', 1.8);
      c.beginPath(); c.moveTo(6, -4.2); c.lineTo(38, -3.2); c.lineTo(46, 0); c.lineTo(38, 3.2); c.lineTo(6, 4.2); c.closePath();
      fillStroke(c, vgrad(c, -4, 4, '#ffffff', shade(E.color, 0.35)));
      c.fillStyle = rgba(E.color, 0.75); c.beginPath(); c.moveTo(8, -1); c.lineTo(38, -0.6); c.lineTo(38, 1.2); c.lineTo(8, 1.4); c.fill();
      if (glowA) { c.strokeStyle = rgba(E.glow, glowA * 0.6); c.lineWidth = 5; c.beginPath(); c.moveTo(8, 0); c.lineTo(42, 0); c.stroke(); }
      break;
    }
    case 'hammer': {
      capsule(c, -10, 0, 30, 0, 2.6, '#6a4528');
      c.save(); c.translate(32, 0);
      pathRR(c, -7, -13, 14, 26, 4); fillStroke(c, vgrad(c, -13, 13, '#ffffff', '#a9b4c8'));
      c.fillStyle = o.awake ? '#ffd23f' : E.color; c.fillRect(-7, -3, 14, 6); c.strokeStyle = OL; c.lineWidth = 1.4; c.strokeRect(-7, -3, 14, 6);
      c.fillStyle = '#ffd23f'; star5(c, 0, 0, 4, 1.8, 0); c.fill();
      if (glowA) { c.fillStyle = rgba(E.glow, glowA * 0.35); circle(c, 0, 0, 18); c.fill(); }
      c.restore();
      break;
    }
    case 'staff': {
      capsule(c, -18, 0, 36, 0, 2.4, '#7a4a2a');
      c.fillStyle = '#d8b23a'; c.fillRect(30, -3, 3, 6);
      c.save(); c.translate(42, 0);
      // 장식 고리
      c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.lineWidth = 3; c.strokeStyle = '#d8b23a'; c.stroke(); c.lineWidth = 1.2; c.strokeStyle = OL; c.stroke();
      const ch = 1 + (P.charge || 0) * 1.4;
      const g = c.createRadialGradient(0, 0, 1, 0, 0, 13 * ch);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, E.light); g.addColorStop(1, rgba(E.color, 0));
      c.fillStyle = g; circle(c, 0, 0, 13 * ch); c.fill();
      c.beginPath(); c.arc(0, 0, 4.5, 0, TAU); fillStroke(c, E.color, 1.4);
      c.restore();
      break;
    }
    case 'spear': {
      const r = P.reach || 0;
      c.save(); c.translate(r, 0);
      capsule(c, -24, 0, 46, 0, 2.3, def.elem === 'light' ? '#e8e0c8' : '#3a4a6a');
      c.fillStyle = o.awake ? '#ffd23f' : E.color; c.fillRect(40, -3, 4, 6);
      c.beginPath(); c.moveTo(44, -5); c.lineTo(60, -2.5); c.lineTo(70, 0); c.lineTo(60, 2.5); c.lineTo(44, 5); c.lineTo(47, 0); c.closePath();
      fillStroke(c, vgrad(c, -5, 5, '#ffffff', shade(E.color, 0.3)));
      if (P.thrustFx) { c.fillStyle = rgba(E.light, 0.6 * (1 - P.thrustFx * 0.5)); c.beginPath(); c.moveTo(70, 0); c.lineTo(40, -9); c.lineTo(20, 0); c.lineTo(40, 9); c.closePath(); c.fill(); }
      if (glowA) { c.strokeStyle = rgba(E.glow, glowA * 0.6); c.lineWidth = 4; c.beginPath(); c.moveTo(48, 0); c.lineTo(68, 0); c.stroke(); }
      c.restore();
      break;
    }
    case 'scythe': {
      capsule(c, -16, 0, 50, 0, 2.4, '#2a1a30');
      c.fillStyle = '#c77dff'; c.fillRect(-4, -3, 3, 6);
      c.save(); c.translate(50, 0);
      c.beginPath(); c.moveTo(0, -3); c.quadraticCurveTo(-4, -34, -34, -40); c.quadraticCurveTo(-12, -28, -6, 3); c.closePath();
      fillStroke(c, vgrad(c, -40, 3, '#ffffff', '#8a7aa8'));
      c.strokeStyle = rgba(E.color, 0.9); c.lineWidth = 2; c.beginPath(); c.moveTo(-2, -4); c.quadraticCurveTo(-6, -30, -30, -38); c.stroke();
      if (glowA) { c.strokeStyle = rgba(E.glow, glowA * 0.5); c.lineWidth = 6; c.beginPath(); c.moveTo(-2, -6); c.quadraticCurveTo(-6, -30, -30, -38); c.stroke(); }
      c.restore();
      break;
    }
    case 'bow': {
      // 활: 활대는 무기 방향(조준)과 수직
      const d = P.draw || 0;
      const pull = -4 - d * 16;
      c.beginPath();
      c.moveTo(0, -28); c.quadraticCurveTo(14, -18, 4, 0); c.quadraticCurveTo(14, 18, 0, 28);
      c.lineWidth = 5.5; c.strokeStyle = OL; c.stroke();
      c.lineWidth = 3.2; c.strokeStyle = def.elem === 'water' ? '#cfefff' : def.elem === 'fire' ? '#b04a24' : '#6a8a3a'; c.stroke();
      c.fillStyle = o.awake ? '#ffd23f' : E.color; c.beginPath(); c.arc(0, -28, 2.6, 0, TAU); c.arc(0, 28, 2.6, 0, TAU); c.fill();
      c.lineWidth = 1; c.strokeStyle = '#f4f4f4'; c.beginPath(); c.moveTo(0, -27); c.lineTo(pull, 0); c.lineTo(0, 27); c.stroke();
      if (d > 0.05) {
        // 화살
        c.strokeStyle = '#6a4a2a'; c.lineWidth = 2; c.beginPath(); c.moveTo(pull, 0); c.lineTo(pull + 34, 0); c.stroke();
        c.fillStyle = E.color; c.beginPath(); c.moveTo(pull + 40, 0); c.lineTo(pull + 32, -3.5); c.lineTo(pull + 32, 3.5); c.closePath(); c.fill();
        c.fillStyle = rgba(E.light, 0.5 * d); circle(c, pull + 36, 0, 6 + d * 4); c.fill();
      }
      break;
    }
    case 'daggers': {
      capsule(c, -5, 0, 3, 0, 2.2, '#3a2a3a');
      c.beginPath(); c.moveTo(3, -3.4); c.lineTo(22, -1); c.lineTo(26, 0); c.lineTo(22, 1); c.lineTo(3, 3.4); c.closePath();
      fillStroke(c, vgrad(c, -3, 3, '#ffffff', shade(E.color, 0.3)), 1.8);
      c.fillStyle = E.color; c.fillRect(1, -5, 3, 10);
      break;
    }
    case 'shuriken': {
      c.save(); c.translate(6, 0); c.rotate((o.t || 0) * 6);
      c.beginPath();
      for (let i = 0; i < 8; i++) { const r = i % 2 ? 2.5 : 8, a = i * Math.PI / 4; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      c.closePath(); fillStroke(c, vgrad(c, -8, 8, '#ffffff', '#7a8a9a'), 1.6);
      c.fillStyle = E.color; circle(c, 0, 0, 1.8); c.fill();
      c.restore();
      break;
    }
    case 'orb': break;
  }
}

function drawSmear(c, def, S, sm, len, o) {
  const E = ELEMS[def.elem];
  const a0 = sm.a0, a1 = sm.a1;
  if (Math.abs(a1 - a0) < 0.2) return;
  const r1 = len + (sm.big ? 14 : 6), r0 = sm.thin ? len - 10 : len * 0.45;
  c.save(); c.translate(S.x, S.y);
  c.beginPath();
  c.arc(0, 0, r1, a0, a1, a1 < a0);
  c.arc(0, 0, r0, a1, a0, a1 >= a0);
  c.closePath();
  const g = c.createRadialGradient(0, 0, r0, 0, 0, r1);
  g.addColorStop(0, rgba(E.color, 0)); g.addColorStop(0.6, rgba(E.color, 0.45 * sm.k)); g.addColorStop(1, rgba(o.awake ? '#ffffff' : E.light, 0.95 * sm.k));
  c.fillStyle = g; c.fill();
  c.restore();
}

// ───────────── 초상화 / 정지 이미지 캐시 ─────────────
const ArtCache = {};
function heroPortrait(def, awake, size = 128) {
  const key = 'p_' + def.id + (awake ? '_a' : '') + '_' + size;
  if (ArtCache[key]) return ArtCache[key];
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const E = ELEMS[def.elem];
  const g = c.createRadialGradient(size * 0.5, size * 0.45, 4, size * 0.5, size * 0.5, size * 0.75);
  g.addColorStop(0, shade(E.color, 0.35)); g.addColorStop(0.6, shade(E.color, -0.25)); g.addColorStop(1, shade(E.dark, -0.4));
  c.fillStyle = g; c.fillRect(0, 0, size, size);
  // 배경 빛줄기
  c.save(); c.translate(size / 2, size * 0.45); c.globalAlpha = 0.18;
  for (let i = 0; i < 12; i++) { c.rotate(TAU / 12); c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(0, 0); c.lineTo(size, -size * 0.12); c.lineTo(size, size * 0.12); c.fill(); }
  c.restore();
  const s = size / 64;
  c.save(); c.translate(size * 0.47, size * 1.5); c.scale(s, s);
  const P = basePose(def); P.eyes = 'open';
  if (def.weapon === 'bow') P.wa = -1.3;
  drawHero(c, def, P, { awake, star: awake ? 6 : 3, t: 0.6, face: 1, noAura: true });
  c.restore();
  ArtCache[key] = cv;
  return cv;
}
function portraitURL(def, awake, size = 128) {
  const key = 'u_' + def.id + (awake ? '_a' : '') + '_' + size;
  if (!ArtCache[key]) ArtCache[key] = heroPortrait(def, awake, size).toDataURL();
  return ArtCache[key];
}

// ───────────────────────── 적 그리기 ─────────────────────────
// e: { type, elem, t, walk(걸음 위상), face, flash, hpRatio, size, frozen, scale }
function drawEnemy(c, e) {
  const E = ELEMS[e.elem] || ELEMS.dark, def = ENEMIES[e.type];
  const t = e.t, w = e.walk;
  c.save();
  if (e.face < 0) c.scale(-1, 1);
  const s = def.size;
  c.scale(s, s);
  // 그림자
  c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(0, 1, def.boss ? 26 : 15, def.boss ? 6 : 4, 0, 0, TAU); c.fill();
  if (def.fly) c.translate(0, -18 + Math.sin(t * 5) * 4);
  const fn = ENEMY_DRAW[e.type];
  if (fn) fn(c, E, t, w, e);
  c.restore();
}

const ENEMY_DRAW = {
  slime(c, E, t, w) {
    const sq = Math.sin(w * 2) * 0.12;
    c.save(); c.scale(1 + sq, 1 - sq);
    c.beginPath(); c.moveTo(-15, 0); c.quadraticCurveTo(-17, -22, 0, -24); c.quadraticCurveTo(17, -22, 15, 0); c.quadraticCurveTo(0, 3, -15, 0); c.closePath();
    const g = c.createRadialGradient(-4, -16, 2, 0, -10, 22); g.addColorStop(0, shade(E.color, 0.55)); g.addColorStop(1, shade(E.color, -0.25));
    fillStroke(c, g);
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(-6, -17, 4, 2.5, -0.5, 0, TAU); c.fill();
    c.fillStyle = OL; c.beginPath(); c.ellipse(3, -11, 2, 3, 0, 0, TAU); c.ellipse(9, -11, 2, 3, 0, 0, TAU); c.fill();
    c.restore();
  },
  goblin(c, E, t, w) {
    const skin = mix('#7cbf4a', E.color, 0.35);
    const l = Math.sin(w * 2) * 0.6;
    capsule(c, -3, -10, -3 - Math.sin(l) * 6, -1, 3, shade(skin, -0.2));
    capsule(c, 3, -10, 3 + Math.sin(l) * 6, -1, 3, skin);
    pathRR(c, -8, -24, 16, 15, 5); fillStroke(c, '#7a5a3a');
    // 머리 + 큰 귀
    c.beginPath(); c.moveTo(-6, -32); c.lineTo(-20, -40); c.lineTo(-8, -26); c.closePath(); fillStroke(c, skin, 2);
    c.beginPath(); c.arc(1, -32, 10, 0, TAU); fillStroke(c, skin);
    c.beginPath(); c.moveTo(6, -36); c.lineTo(18, -44); c.lineTo(9, -30); c.closePath(); fillStroke(c, skin, 2);
    c.fillStyle = '#ffef5a'; c.beginPath(); c.arc(5, -33, 2.4, 0, TAU); c.fill(); c.fillStyle = OL; c.beginPath(); c.arc(5.6, -33, 1.1, 0, TAU); c.fill();
    c.strokeStyle = OL; c.lineWidth = 1.5; c.beginPath(); c.moveTo(4, -27); c.lineTo(10, -28); c.stroke();
    // 몽둥이
    c.save(); c.translate(8, -18); c.rotate(-0.8 + Math.sin(w * 2) * 0.3); capsule(c, 0, 0, 0, -16, 3.2, '#8a5a2a'); c.restore();
  },
  skeleton(c, E, t, w) {
    const bone = '#f1ede0', l = Math.sin(w * 2) * 0.5;
    c.strokeStyle = OL; c.lineWidth = 4.5; c.lineCap = 'round';
    for (const [x, s] of [[-3, -1], [3, 1]]) { c.beginPath(); c.moveTo(x, -12); c.lineTo(x + Math.sin(l * s) * 6, 0); c.stroke(); }
    c.strokeStyle = bone; c.lineWidth = 2.5;
    for (const [x, s] of [[-3, -1], [3, 1]]) { c.beginPath(); c.moveTo(x, -12); c.lineTo(x + Math.sin(l * s) * 6, 0); c.stroke(); }
    pathRR(c, -7, -26, 14, 14, 4); fillStroke(c, '#d9d4c4');
    c.strokeStyle = '#9a9384'; c.lineWidth = 1.5; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-5, -23 + i * 4); c.lineTo(5, -23 + i * 4); c.stroke(); }
    c.beginPath(); c.arc(1, -34, 9.5, 0, TAU); fillStroke(c, bone);
    c.fillStyle = OL; c.beginPath(); c.ellipse(4, -35, 2.6, 3.2, 0, 0, TAU); c.fill();
    c.fillStyle = E.color; c.beginPath(); c.arc(4, -35, 1.4, 0, TAU); c.fill();
    c.fillStyle = OL; c.fillRect(2, -28, 7, 2);
    // 검 + 방패
    c.save(); c.translate(9, -18); c.rotate(-1.1 + Math.sin(w * 2) * 0.2); capsule(c, 0, 0, 0, -20, 2, '#b8c0cc'); c.restore();
    c.beginPath(); c.ellipse(-8, -18, 6, 8, 0, 0, TAU); fillStroke(c, mix('#6a5a4a', E.color, 0.3));
  },
  wolf(c, E, t, w) {
    const fur = mix('#7a7f8a', E.color, 0.4), l = Math.sin(w * 3);
    for (const [x, ph] of [[-12, 0], [-6, 1.6], [8, 0.8], [13, 2.4]]) {
      const a = Math.sin(w * 3 + ph) * 0.6;
      c.save(); c.translate(x, -10); c.rotate(a); capsule(c, 0, 0, 0, 10, 2.8, shade(fur, x < 0 ? -0.15 : 0)); c.restore();
    }
    c.beginPath(); c.moveTo(-18, -14); c.quadraticCurveTo(-28, -22 - l * 3, -30, -12); c.quadraticCurveTo(-24, -14, -18, -10); fillStroke(c, fur, 2);
    c.beginPath(); c.ellipse(-2, -14, 18, 8, 0, 0, TAU); fillStroke(c, vgrad(c, -22, -6, shade(fur, 0.2), shade(fur, -0.2)));
    c.beginPath(); c.moveTo(12, -20); c.lineTo(28, -16); c.lineTo(26, -10); c.lineTo(12, -8); c.closePath(); fillStroke(c, fur, 2);
    c.beginPath(); c.arc(12, -16, 7.5, 0, TAU); fillStroke(c, fur);
    c.beginPath(); c.moveTo(9, -22); c.lineTo(11, -30); c.lineTo(15, -22); c.closePath(); fillStroke(c, shade(fur, -0.1), 1.8);
    c.fillStyle = E.light; c.beginPath(); c.arc(16, -17, 1.8, 0, TAU); c.fill();
    c.fillStyle = OL; c.beginPath(); c.arc(27, -14, 1.6, 0, TAU); c.fill();
  },
  bat(c, E, t, w) {
    const f = Math.sin(t * 18);
    const body = mix('#4a3a5a', E.color, 0.35);
    for (const s of [-1, 1]) {
      c.save(); c.scale(s, 1); c.rotate(f * 0.4 * s);
      c.beginPath(); c.moveTo(4, -14); c.lineTo(24, -26 + f * 6); c.lineTo(22, -14); c.lineTo(16, -16); c.lineTo(12, -10); c.closePath();
      fillStroke(c, shade(body, -0.2), 1.8); c.restore();
    }
    c.beginPath(); c.ellipse(0, -14, 8, 9, 0, 0, TAU); fillStroke(c, body);
    c.beginPath(); c.moveTo(-5, -20); c.lineTo(-4, -27); c.lineTo(-1, -21); c.moveTo(5, -20); c.lineTo(4, -27); c.lineTo(1, -21); fillStroke(c, body, 1.6);
    c.fillStyle = E.light; c.beginPath(); c.arc(-2.5, -15, 1.6, 0, TAU); c.arc(3, -15, 1.6, 0, TAU); c.fill();
  },
  orc(c, E, t, w) {
    const skin = mix('#6a9a4a', E.color, 0.3), l = Math.sin(w * 2) * 0.45;
    capsule(c, -5, -14, -5 - Math.sin(l) * 6, -2, 4.5, shade(skin, -0.25));
    capsule(c, 5, -14, 5 + Math.sin(l) * 6, -2, 4.5, shade(skin, -0.1));
    pathRR(c, -12, -34, 24, 22, 8); fillStroke(c, vgrad(c, -34, -12, '#8a5a3a', '#5a3a22'));
    c.fillStyle = E.color; c.fillRect(-12, -18, 24, 4);
    c.beginPath(); c.arc(1, -40, 11, 0, TAU); fillStroke(c, skin);
    c.fillStyle = '#fff6d0'; c.beginPath(); c.moveTo(4, -33); c.lineTo(5, -38); c.lineTo(7, -33); c.fill(); c.beginPath(); c.moveTo(9, -33); c.lineTo(10, -37); c.lineTo(12, -33); c.fill();
    c.fillStyle = '#ff3a2a'; c.beginPath(); c.arc(6, -42, 2, 0, TAU); c.fill();
    c.strokeStyle = OL; c.lineWidth = 2; c.beginPath(); c.moveTo(3, -46); c.lineTo(10, -44); c.stroke();
    // 도끼
    c.save(); c.translate(12, -24); c.rotate(-0.6 + Math.sin(w * 2) * 0.25);
    capsule(c, 0, 4, 0, -22, 2.4, '#6a4528');
    c.beginPath(); c.moveTo(0, -20); c.quadraticCurveTo(14, -26, 12, -12); c.quadraticCurveTo(6, -16, 0, -12); c.closePath(); fillStroke(c, '#c8ced8', 2);
    c.restore();
  },
  knight(c, E, t, w) {
    const ar = '#2a2a3a', l = Math.sin(w * 2) * 0.4;
    c.beginPath(); c.moveTo(-6, -36); c.quadraticCurveTo(-22 - Math.sin(t * 4) * 2, -18, -18, 0); c.lineTo(2, -4); c.closePath(); fillStroke(c, shade(E.color, -0.45));
    capsule(c, -5, -14, -5 - Math.sin(l) * 5, -2, 4.5, '#1a1a24');
    capsule(c, 5, -14, 5 + Math.sin(l) * 5, -2, 4.5, '#24242e');
    pathRR(c, -12, -36, 24, 24, 7); fillStroke(c, vgrad(c, -36, -12, '#5a5a6e', ar));
    c.strokeStyle = E.color; c.lineWidth = 2; c.beginPath(); c.moveTo(-8, -32); c.lineTo(0, -22); c.lineTo(8, -32); c.stroke();
    c.beginPath(); c.arc(1, -44, 10, 0, TAU); fillStroke(c, vgrad(c, -54, -34, '#6a6a7e', '#22222c'));
    c.fillStyle = E.light; c.fillRect(-1, -46, 12, 2.6);
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 6, -50); c.quadraticCurveTo(s * 14, -60, s * 10, -66); c.quadraticCurveTo(s * 8, -58, s * 2, -53); fillStroke(c, '#d8d0c0', 1.6); }
    c.save(); c.translate(12, -26); c.rotate(-1.0 + Math.sin(w * 2) * 0.15);
    capsule(c, 0, 4, 0, -2, 2.5, '#3a2a2a'); c.fillStyle = E.color; c.fillRect(-5, -3, 10, 3);
    c.beginPath(); c.moveTo(-3, -3); c.lineTo(-3, -30); c.lineTo(0, -35); c.lineTo(3, -30); c.lineTo(3, -3); c.closePath(); fillStroke(c, vgrad(c, -35, 0, '#ffffff', '#8a8aa0'), 1.8);
    c.restore();
  },
  golem(c, E, t, w) {
    const rock = mix('#8a8270', E.color, 0.25), l = Math.sin(w * 2) * 0.3;
    pathRR(c, -12 - Math.sin(l) * 3, -14, 10, 14, 3); fillStroke(c, shade(rock, -0.25));
    pathRR(c, 3 + Math.sin(l) * 3, -14, 10, 14, 3); fillStroke(c, shade(rock, -0.15));
    c.beginPath(); c.moveTo(-18, -16); c.lineTo(-14, -42); c.lineTo(14, -44); c.lineTo(20, -16); c.closePath(); fillStroke(c, vgrad(c, -44, -16, shade(rock, 0.2), shade(rock, -0.2)));
    c.strokeStyle = shade(rock, -0.4); c.lineWidth = 1.5; c.beginPath(); c.moveTo(-10, -36); c.lineTo(-2, -28); c.lineTo(-6, -20); c.moveTo(8, -40); c.lineTo(4, -30); c.stroke();
    const pulse = 0.7 + Math.sin(t * 4) * 0.3;
    const g = c.createRadialGradient(2, -30, 1, 2, -30, 10); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, E.light); g.addColorStop(1, rgba(E.color, 0));
    c.globalAlpha = pulse; c.fillStyle = g; circle(c, 2, -30, 10); c.fill(); c.globalAlpha = 1;
    pathRR(c, -8, -56, 18, 14, 4); fillStroke(c, rock);
    c.fillStyle = E.light; c.fillRect(2, -51, 6, 3);
    c.save(); c.translate(18, -38); c.rotate(Math.sin(w * 2) * 0.3); pathRR(c, -4, 0, 10, 22, 4); fillStroke(c, shade(rock, -0.05)); c.restore();
  },
  dragon(c, E, t, w) {
    const sc = '#c83a1a', fl = Math.sin(t * 4);
    // 날개
    c.save(); c.translate(-6, -40); c.rotate(-0.3 + fl * 0.25);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(-20, -34); c.lineTo(-44, -30); c.quadraticCurveTo(-36, -18, -40, -8); c.quadraticCurveTo(-28, -10, -26, 0); c.quadraticCurveTo(-14, -4, -10, 6); c.closePath();
    fillStroke(c, vgrad(c, -34, 6, '#ff8a4a', '#7a1a0a'), 2); c.restore();
    // 꼬리
    c.beginPath(); c.moveTo(-14, -18); c.quadraticCurveTo(-34, -10 + fl * 3, -40, -24); c.lineTo(-44, -20); c.quadraticCurveTo(-34, -2, -12, -10); c.closePath(); fillStroke(c, shade(sc, -0.1), 2);
    for (const [x, ph] of [[-8, 0], [8, 1.5]]) { c.save(); c.translate(x, -14); c.rotate(Math.sin(w * 2 + ph) * 0.4); capsule(c, 0, 0, 0, 12, 4, shade(sc, -0.25)); c.restore(); }
    c.beginPath(); c.ellipse(0, -24, 18, 13, 0, 0, TAU); fillStroke(c, vgrad(c, -37, -11, '#ff6a3a', '#9a2410'));
    c.fillStyle = '#ffd08a'; c.beginPath(); c.ellipse(4, -20, 10, 8, 0, 0, TAU); c.fill();
    // 목 + 머리
    c.beginPath(); c.moveTo(6, -32); c.quadraticCurveTo(16, -50, 20, -52); c.lineTo(26, -46); c.quadraticCurveTo(18, -36, 14, -24); c.closePath(); fillStroke(c, sc, 2);
    c.beginPath(); c.moveTo(14, -58); c.quadraticCurveTo(28, -62, 38, -52); c.lineTo(36, -46); c.quadraticCurveTo(26, -44, 16, -46); c.closePath(); fillStroke(c, vgrad(c, -62, -44, '#ff7a4a', '#a02a10'));
    c.beginPath(); c.moveTo(16, -58); c.lineTo(8, -70); c.lineTo(20, -60); fillStroke(c, '#f4e6c0', 1.6);
    c.fillStyle = '#ffef5a'; c.beginPath(); c.ellipse(26, -55, 2.6, 1.6, 0.2, 0, TAU); c.fill();
    if (Math.sin(t * 2) > 0.6) { c.fillStyle = rgba('#ffb03a', 0.7); c.beginPath(); c.moveTo(38, -49); c.lineTo(56, -56); c.lineTo(54, -42); c.closePath(); c.fill(); }
  },
  giant(c, E, t, w) {
    const sk = '#9ac8e8', l = Math.sin(w * 2) * 0.3;
    capsule(c, -7, -18, -7 - Math.sin(l) * 5, -3, 6, '#5a7a9a');
    capsule(c, 7, -18, 7 + Math.sin(l) * 5, -3, 6, '#6a8aaa');
    pathRR(c, -17, -50, 34, 34, 12); fillStroke(c, vgrad(c, -50, -16, '#e6f4ff', '#7aa8d0'));
    c.fillStyle = '#4a6a8a'; c.fillRect(-17, -24, 34, 6);
    c.beginPath(); c.arc(1, -58, 12, 0, TAU); fillStroke(c, sk);
    c.beginPath(); c.moveTo(-8, -54); c.quadraticCurveTo(2, -36, 12, -52); c.closePath(); fillStroke(c, '#ffffff', 1.8);
    c.fillStyle = '#2a8aff'; c.beginPath(); c.arc(6, -61, 2.2, 0, TAU); c.fill();
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-8 + i * 5, -68); c.lineTo(-6 + i * 5, -78 - (i % 2) * 4); c.lineTo(-4 + i * 5, -68); fillStroke(c, '#cfefff', 1.4); }
    c.save(); c.translate(17, -40); c.rotate(-0.5 + Math.sin(w * 2) * 0.2);
    capsule(c, 0, 4, 0, -24, 3, '#6a5a4a');
    c.beginPath(); c.moveTo(-8, -22); c.lineTo(0, -40); c.lineTo(8, -22); c.closePath(); fillStroke(c, vgrad(c, -40, -22, '#ffffff', '#5cc8ff'), 2);
    c.restore();
  },
  griffon(c, E, t, w) {
    const fl = Math.sin(t * 7);
    c.save(); c.translate(-4, -30); c.rotate(-0.4 + fl * 0.4);
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-20, -40, -46, -30); c.quadraticCurveTo(-36, -22, -42, -14); c.quadraticCurveTo(-30, -14, -32, -4); c.quadraticCurveTo(-16, -6, 0, 6); c.closePath();
    fillStroke(c, vgrad(c, -36, 6, '#f6f1dc', '#3aa86a'), 2); c.restore();
    c.beginPath(); c.moveTo(-18, -20); c.quadraticCurveTo(-30, -24, -32, -12); c.lineTo(-26, -14); fillStroke(c, '#c89a4a', 2);
    for (const [x, ph] of [[-10, 0], [6, 1.6]]) { c.save(); c.translate(x, -14); c.rotate(Math.sin(t * 6 + ph) * 0.3); capsule(c, 0, 0, 0, 12, 3.6, '#b08a3a'); c.restore(); }
    c.beginPath(); c.ellipse(-2, -22, 17, 11, 0, 0, TAU); fillStroke(c, vgrad(c, -33, -11, '#e8c070', '#a07a2a'));
    c.beginPath(); c.arc(14, -34, 10, 0, TAU); fillStroke(c, '#f6f6f0');
    c.beginPath(); c.moveTo(21, -37); c.quadraticCurveTo(32, -34, 28, -26); c.lineTo(21, -30); c.closePath(); fillStroke(c, '#ffc93a', 1.8);
    c.fillStyle = OL; c.beginPath(); c.arc(17, -36, 1.8, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(8, -42); c.lineTo(4, -50); c.lineTo(12, -43); fillStroke(c, '#3aa86a', 1.6);
  },
  fallen(c, E, t, w) {
    const fl = Math.sin(t * 4);
    for (const s of [0.85, 1]) {
      c.save(); c.translate(-2, -40); c.rotate(-0.3 + fl * 0.2 * s); c.scale(s, s);
      c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-20, -36, -50, -36, -56, -18); c.quadraticCurveTo(-44, -14, -48, -4); c.quadraticCurveTo(-34, -4, -36, 6); c.quadraticCurveTo(-18, 2, 0, 8); c.closePath();
      fillStroke(c, vgrad(c, -36, 8, '#3a3a4a', '#0a0a12'), 2); c.restore();
    }
    c.beginPath(); c.moveTo(-10, -42); c.lineTo(10, -42); c.lineTo(14, -2); c.lineTo(-14, -2); c.closePath(); fillStroke(c, vgrad(c, -42, -2, '#e8e0f0', '#6a5a8a'));
    c.fillStyle = '#ffd23f'; c.fillRect(-1.5, -40, 3, 36);
    c.beginPath(); c.arc(1, -52, 10, 0, TAU); fillStroke(c, '#f2e6f0');
    c.beginPath(); c.moveTo(-10, -54); c.quadraticCurveTo(-14, -36, -8, -30); c.quadraticCurveTo(-4, -44, 4, -62); c.quadraticCurveTo(-6, -64, -10, -54); fillStroke(c, '#e8e8f0', 1.6);
    c.fillStyle = '#ff2a4a'; c.beginPath(); c.arc(6, -52, 1.8, 0, TAU); c.fill();
    c.save(); c.translate(1, -66); c.scale(1, 0.3); c.lineWidth = 3; c.strokeStyle = '#6a5a3a'; circle(c, 0, 0, 11); c.stroke(); c.restore();
    c.save(); c.translate(12, -30); c.rotate(-1.2); capsule(c, 0, 10, 0, -40, 2, '#c8b88a');
    c.beginPath(); c.moveTo(0, -40); c.lineTo(-4, -50); c.lineTo(0, -58); c.lineTo(4, -50); c.closePath(); fillStroke(c, '#fff3a0', 1.6); c.restore();
  },
  lich(c, E, t, w) {
    c.beginPath(); c.moveTo(-10, -44); c.lineTo(10, -44); c.quadraticCurveTo(18, -14, 16, 0); c.lineTo(-16, 0); c.quadraticCurveTo(-18, -14, -10, -44); c.closePath();
    fillStroke(c, vgrad(c, -44, 0, '#4a2a6a', '#120818'));
    for (let i = 0; i < 4; i++) { c.fillStyle = '#120818'; c.beginPath(); c.moveTo(-16 + i * 8, 0); c.lineTo(-12 + i * 8, 6 + Math.sin(t * 6 + i) * 2); c.lineTo(-8 + i * 8, 0); c.fill(); }
    c.fillStyle = '#c77dff'; c.fillRect(-1.5, -42, 3, 40);
    c.beginPath(); c.arc(1, -52, 10, 0, TAU); fillStroke(c, '#efe8d8');
    c.fillStyle = OL; c.beginPath(); c.ellipse(4, -53, 2.6, 3.2, 0, 0, TAU); c.ellipse(-2, -53, 2, 3, 0, 0, TAU); c.fill();
    c.fillStyle = '#7dffb0'; c.beginPath(); c.arc(4, -53, 1.4, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(-10, -58); c.lineTo(-6, -70); c.lineTo(-1, -62); c.lineTo(3, -72); c.lineTo(7, -62); c.lineTo(11, -70); c.lineTo(12, -57); c.closePath(); fillStroke(c, '#d8b23a', 1.6);
    c.save(); c.translate(15, -30); c.rotate(-0.2);
    capsule(c, 0, 26, 0, -24, 2, '#3a2a2a');
    const g = c.createRadialGradient(0, -30, 1, 0, -30, 12); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, '#7dffb0'); g.addColorStop(1, 'rgba(125,255,176,0)');
    c.fillStyle = g; circle(c, 0, -30, 12); c.fill(); c.restore();
  },
  demon(c, E, t, w) {
    const fl = Math.sin(t * 3), l = Math.sin(w * 2) * 0.3;
    // 망토
    c.beginPath(); c.moveTo(-14, -54); c.quadraticCurveTo(-36 - fl * 3, -24, -30 - fl * 4, 4); c.lineTo(16, 2); c.lineTo(12, -54); c.closePath();
    fillStroke(c, vgrad(c, -54, 4, '#6a0a1a', '#1a0208'));
    capsule(c, -7, -18, -7 - Math.sin(l) * 5, -3, 6, '#2a1a1a');
    capsule(c, 7, -18, 7 + Math.sin(l) * 5, -3, 6, '#3a2222');
    pathRR(c, -17, -56, 34, 40, 12); fillStroke(c, vgrad(c, -56, -16, '#4a2a3a', '#1a0a12'));
    c.strokeStyle = '#ff4a2a'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-12, -50); c.lineTo(0, -34); c.lineTo(12, -50); c.stroke();
    const g = c.createRadialGradient(0, -38, 1, 0, -38, 8); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#ff4a2a'); g.addColorStop(1, 'rgba(255,74,42,0)'); c.fillStyle = g; circle(c, 0, -38, 8); c.fill();
    c.beginPath(); c.arc(1, -66, 12, 0, TAU); fillStroke(c, '#8a3a4a');
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 6, -74); c.quadraticCurveTo(s * 22, -86, s * 18, -100); c.quadraticCurveTo(s * 14, -86, s * 2, -78); c.closePath(); fillStroke(c, vgrad(c, -100, -74, '#f4e6c0', '#6a5a4a'), 1.8); }
    c.fillStyle = '#ffd23f'; c.beginPath(); c.moveTo(-9, -76); c.lineTo(-6, -84); c.lineTo(-2, -78); c.lineTo(1, -86); c.lineTo(4, -78); c.lineTo(8, -84); c.lineTo(11, -76); c.closePath(); c.fill(); c.strokeStyle = OL; c.lineWidth = 1.4; c.stroke();
    c.fillStyle = '#ffef5a'; c.beginPath(); c.ellipse(6, -67, 2.8, 1.8, 0.2, 0, TAU); c.ellipse(-2, -67, 2.2, 1.6, -0.2, 0, TAU); c.fill();
    // 불타는 대검
    c.save(); c.translate(18, -40); c.rotate(-0.9 + Math.sin(w * 2) * 0.15);
    capsule(c, 0, 6, 0, -4, 3, '#2a1a1a'); c.fillStyle = '#ffd23f'; c.fillRect(-7, -6, 14, 4);
    c.beginPath(); c.moveTo(-4, -6); c.lineTo(-4, -44); c.lineTo(0, -52); c.lineTo(4, -44); c.lineTo(4, -6); c.closePath(); fillStroke(c, vgrad(c, -52, -6, '#ffd08a', '#5a0a0a'), 2);
    c.fillStyle = rgba('#ff6a2a', 0.45 + fl * 0.2); c.beginPath(); c.moveTo(-6, -8); c.quadraticCurveTo(-10, -30, 0, -58); c.quadraticCurveTo(10, -30, 6, -8); c.fill();
    c.restore();
  },
};

// ───────────────────────── 맵 · 성 ─────────────────────────
const THEMES = {
  meadow:  { g1: '#6fbf4a', g2: '#4f9a36', path1: '#d9b77a', path2: '#b48d52', deco: 'tree', sky: '#9fd8ff', leaf: '#3f8f2a', wall: '#c9c2b0' },
  autumn:  { g1: '#c8a24a', g2: '#a07a2e', path1: '#d9b98a', path2: '#a47a4a', deco: 'maple', sky: '#ffd0a0', leaf: '#d9542b', wall: '#bfae94' },
  snow:    { g1: '#e6f2fa', g2: '#bcd6ea', path1: '#9fb0c4', path2: '#7a8aa0', deco: 'pine', sky: '#cfe8ff', leaf: '#2f6a4a', wall: '#d8e2ee' },
  inferno: { g1: '#5a2a2a', g2: '#3a1616', path1: '#4a3a3a', path2: '#2a1e1e', deco: 'spike', sky: '#2a0a0a', leaf: '#ff5a2a', wall: '#5a4a52' },
};

function drawCastle(c, x, y, theme, hpRatio, t) {
  const T = THEMES[theme];
  c.save(); c.translate(x, y);
  const wall = T.wall;
  // 뒤 탑들
  for (const [tx, h] of [[-44, 70], [44, 70]]) {
    pathRR(c, tx - 14, -h, 28, h, 3); fillStroke(c, vgrad(c, -h, 0, shade(wall, 0.15), shade(wall, -0.25)));
    c.beginPath(); c.moveTo(tx - 18, -h); c.lineTo(tx, -h - 30); c.lineTo(tx + 18, -h); c.closePath(); fillStroke(c, vgrad(c, -h - 30, -h, '#5a8adf', '#2a4a9a'));
    c.fillStyle = '#2a2030'; pathRR(c, tx - 4, -h + 16, 8, 12, 4); c.fill();
  }
  // 성벽
  pathRR(c, -50, -50, 100, 50, 3); fillStroke(c, vgrad(c, -50, 0, shade(wall, 0.2), shade(wall, -0.25)));
  for (let i = 0; i < 6; i++) { c.fillStyle = shade(wall, 0.1); c.fillRect(-50 + i * 18, -58, 10, 9); c.strokeStyle = OL; c.lineWidth = 1.6; c.strokeRect(-50 + i * 18, -58, 10, 9); }
  c.strokeStyle = rgba('#000000', 0.15); c.lineWidth = 1;
  for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) { c.strokeRect(-50 + i * 17 + (r % 2) * 8, -48 + r * 12, 17, 12); }
  // 성문
  c.beginPath(); c.moveTo(-14, 0); c.lineTo(-14, -24); c.arc(0, -24, 14, Math.PI, 0); c.lineTo(14, 0); c.closePath(); fillStroke(c, '#4a2a1a');
  c.strokeStyle = '#2a1a10'; c.lineWidth = 1.5; for (let i = -10; i <= 10; i += 5) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, -34); c.stroke(); }
  // 깃발
  const fw = Math.sin(t * 4) * 3;
  c.strokeStyle = OL; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -58); c.lineTo(0, -96); c.stroke();
  c.beginPath(); c.moveTo(0, -96); c.quadraticCurveTo(14, -92 + fw, 26, -90 + fw * 1.4); c.quadraticCurveTo(14, -84 + fw, 0, -82); c.closePath(); fillStroke(c, '#e83a3a', 1.8);
  c.fillStyle = '#ffd23f'; star5(c, 9, -89 + fw * 0.6, 3.5, 1.6); c.fill();
  // 피해 표현: 금 · 연기
  if (hpRatio < 0.6) { c.strokeStyle = '#2a2030'; c.lineWidth = 2; c.beginPath(); c.moveTo(-30, -44); c.lineTo(-24, -30); c.lineTo(-28, -18); c.moveTo(30, -40); c.lineTo(24, -28); c.stroke(); }
  if (hpRatio < 0.3) { c.fillStyle = 'rgba(60,50,50,0.4)'; for (let i = 0; i < 3; i++) { circle(c, -30 + i * 30, -70 - ((t * 20 + i * 15) % 40), 8 + ((t * 10 + i * 8) % 10)); c.fill(); } }
  c.restore();
}

function drawPortal(c, x, y, t) {
  c.save(); c.translate(x, y);
  for (let i = 0; i < 3; i++) {
    c.save(); c.rotate(t * (1.5 + i * 0.6) * (i % 2 ? -1 : 1)); c.scale(1, 1.25);
    const g = c.createRadialGradient(0, 0, 4, 0, 0, 42 - i * 10);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.3, 'rgba(200,80,255,0.7)'); g.addColorStop(1, 'rgba(60,0,90,0)');
    c.fillStyle = g; c.beginPath();
    for (let k = 0; k < 6; k++) { const a = k * TAU / 6; c.quadraticCurveTo(Math.cos(a + 0.5) * 46, Math.sin(a + 0.5) * 46, Math.cos(a + 1.05) * (36 - i * 8), Math.sin(a + 1.05) * (36 - i * 8)); }
    c.fill(); c.restore();
  }
  c.restore();
}
