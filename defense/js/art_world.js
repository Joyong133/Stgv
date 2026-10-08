'use strict';
// ───────────────────────── 공용 그리기 도구 · 적 · 맵 ─────────────────────────

const OL = '#26162e';   // 외곽선 색
const OLW = 1.9;

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
    const sq = Math.sin(w * 2) * 0.12, hop = Math.max(0, Math.sin(w * 2)) * 4;
    c.save(); c.translate(0, -hop); c.scale(1 + sq, 1 - sq);
    const col = mix('#7adf8a', E.color, 0.7);
    c.beginPath(); c.moveTo(-16, 0); c.bezierCurveTo(-19, -18, -8, -27, 0, -27); c.bezierCurveTo(8, -27, 19, -18, 16, 0); c.quadraticCurveTo(0, 4, -16, 0); c.closePath();
    cel(c, col, [-17, -27, 34, 28], { cut: 0.62, lw: 1.6 });
    c.save(); c.globalAlpha *= 0.35; c.fillStyle = shade(col, -0.35); c.beginPath(); c.ellipse(0, -8, 7, 5, 0, 0, TAU); c.fill(); c.restore();
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.ellipse(-7, -19, 4.5, 2.6, -0.6, 0, TAU); c.fill(); c.beginPath(); c.arc(-11, -13, 1.3, 0, TAU); c.fill();
    monsterEye(c, 3, -13, 2.6, '#1a1020'); monsterEye(c, 10, -13, 2.3, '#1a1020');
    c.strokeStyle = '#1a1020'; c.lineWidth = 1.2; c.beginPath(); c.arc(6.5, -8.5, 2, 0.2, Math.PI - 0.2); c.stroke();
    c.restore();
  },
  goblin(c, E, t, w) {
    const skin = mix('#8ccf5a', E.color, 0.3), l = Math.sin(w * 2) * 0.6;
    limbPath(c, -3, -11, -3 - Math.sin(l) * 6, -1, 3, 2.6); cel(c, shade(skin, -0.2), [-8, -12, 10, 12], { lw: 1.3 });
    limbPath(c, 3, -11, 3 + Math.sin(l) * 6, -1, 3, 2.6); cel(c, skin, [-2, -12, 10, 12], { lw: 1.3 });
    c.beginPath(); c.moveTo(-8, -24); c.lineTo(8, -24); c.lineTo(10, -9); c.lineTo(-10, -9); c.closePath(); cel(c, '#8a5a32', [-10, -24, 20, 15], { lw: 1.3 });
    c.strokeStyle = '#4a2a14'; c.lineWidth = 1; c.beginPath(); c.moveTo(-9, -14); c.lineTo(9, -14); c.stroke();
    c.beginPath(); c.moveTo(-5, -34); c.quadraticCurveTo(-18, -44, -22, -42); c.quadraticCurveTo(-16, -34, -7, -28); c.closePath(); cel(c, skin, [-22, -44, 17, 16], { lw: 1.3 });
    c.beginPath(); c.ellipse(1, -32, 10.5, 9.5, 0, 0, TAU); cel(c, skin, [-10, -42, 22, 20], { lw: 1.4 });
    c.beginPath(); c.moveTo(7, -36); c.quadraticCurveTo(18, -46, 22, -44); c.quadraticCurveTo(17, -36, 9, -29); c.closePath(); cel(c, skin, [7, -46, 15, 17], { lw: 1.3 });
    c.beginPath(); c.moveTo(9, -31); c.quadraticCurveTo(15, -29, 12, -26); c.quadraticCurveTo(10, -27, 8, -28); c.closePath(); flatLine(c, shade(skin, -0.1), lineOf(skin), 1);
    monsterEye(c, 5, -34, 2.4, '#ffe14d', true);
    c.strokeStyle = '#1a1020'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(1, -38); c.lineTo(8, -36.5); c.stroke();
    c.fillStyle = '#fff6d0'; c.beginPath(); c.moveTo(5, -27); c.lineTo(6, -24.5); c.lineTo(7, -27); c.fill();
    c.save(); c.translate(8, -18); c.rotate(-0.8 + Math.sin(w * 2) * 0.3);
    limbPath(c, 0, 2, 0, -18, 2, 3.6); cel(c, '#9a6a3a', [-4, -18, 8, 20], { lw: 1.2 });
    c.fillStyle = '#5a3a1a'; c.fillRect(-3, -14, 6, 1.4); c.fillRect(-3, -10, 6, 1.4);
    c.restore();
  },
  skeleton(c, E, t, w) {
    const bone = '#f1ede0', l = Math.sin(w * 2) * 0.5;
    for (const [x, s] of [[-3, -1], [3, 1]]) { limbPath(c, x, -12, x + Math.sin(l * s) * 6, 0, 2.1, 1.8); cel(c, s < 0 ? shade(bone, -0.15) : bone, [x - 4, -12, 10, 12], { lw: 1.2 }); }
    c.beginPath(); pathRR(c, -7, -26, 14, 14, 4); cel(c, '#ddd6c4', [-7, -26, 14, 14], { lw: 1.3 });
    c.strokeStyle = '#8a8374'; c.lineWidth = 1.2; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-5, -23 + i * 4); c.quadraticCurveTo(0, -21 + i * 4, 5, -23 + i * 4); c.stroke(); }
    c.beginPath(); c.arc(1, -35, 10, 0, TAU); cel(c, bone, [-9, -45, 20, 20], { lw: 1.4 });
    c.beginPath(); pathRR(c, -2, -29, 9, 5, 2); cel(c, bone, [-2, -29, 9, 5], { lw: 1.1 });
    c.fillStyle = '#1a1020'; c.beginPath(); c.ellipse(4.5, -36, 2.8, 3.4, 0, 0, TAU); c.ellipse(-1.5, -36, 2.2, 3, 0, 0, TAU); c.fill();
    c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = E.light; c.beginPath(); c.arc(4.5, -36, 1.4, 0, TAU); c.fill(); c.fillStyle = rgba(E.color, 0.5); c.beginPath(); c.arc(4.5, -36, 3.6, 0, TAU); c.fill(); c.restore();
    c.strokeStyle = '#1a1020'; c.lineWidth = 0.8; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(0.5 + i * 2.2, -29); c.lineTo(0.5 + i * 2.2, -25); c.stroke(); }
    // 녹슨 투구
    c.beginPath(); c.arc(1, -37, 10.8, Math.PI * 1.05, Math.PI * 1.95); c.closePath(); cel(c, mix('#8a7a6a', E.color, 0.25), [-10, -48, 22, 12], { lw: 1.2, dir: 1 });
    c.save(); c.translate(9, -18); c.rotate(-1.1 + Math.sin(w * 2) * 0.2);
    c.beginPath(); c.moveTo(-1.6, 0); c.lineTo(-1.6, -20); c.lineTo(0, -23); c.lineTo(1.6, -20); c.lineTo(1.6, 0); c.closePath(); cel(c, '#c8cfd8', [-2, -23, 4, 23], { lw: 1.1 });
    c.fillStyle = '#7a5a3a'; c.fillRect(-4, -1, 8, 2.4); c.restore();
    c.beginPath(); c.ellipse(-8, -18, 6, 8, 0, 0, TAU); cel(c, mix('#7a5a3a', E.color, 0.3), [-14, -26, 12, 16], { lw: 1.3 });
    c.fillStyle = '#c8b07a'; c.beginPath(); c.arc(-8, -18, 2, 0, TAU); c.fill();
  },
  wolf(c, E, t, w) {
    const fur = mix('#8a8f9a', E.color, 0.4);
    for (const [x, ph] of [[-12, 0], [-6, 1.6], [8, 0.8], [13, 2.4]]) {
      const a = Math.sin(w * 3 + ph) * 0.6;
      c.save(); c.translate(x, -10); c.rotate(a); limbPath(c, 0, 0, 0, 10, 3, 2.2); cel(c, shade(fur, x < 0 ? -0.18 : 0), [-3, 0, 6, 12], { lw: 1.2 }); c.restore();
    }
    strandPath(c, -17, -14, -32, -20 + Math.sin(w * 3) * 4, 8, -3); cel(c, fur, [-32, -24, 16, 12], { lw: 1.2 });
    c.beginPath(); c.ellipse(-2, -15, 18, 8.5, 0, 0, TAU); cel(c, fur, [-20, -24, 36, 17], { lw: 1.4, dir: 1, cut: 0.6 });
    c.fillStyle = shade(fur, 0.35); c.beginPath(); c.ellipse(4, -10, 8, 3, 0, 0, TAU); c.fill();
    // 갈기
    for (let i = 0; i < 4; i++) { strandPath(c, 8 - i * 4, -20, 2 - i * 5, -27 + i, 6, -1); flatLine(c, shade(fur, -0.15), lineOf(fur), 1); }
    c.beginPath(); c.moveTo(10, -22); c.quadraticCurveTo(22, -24, 29, -17); c.lineTo(27, -11); c.quadraticCurveTo(18, -9, 10, -10); c.closePath(); cel(c, fur, [10, -24, 19, 15], { lw: 1.3 });
    c.beginPath(); c.arc(12, -17, 7.5, 0, TAU); cel(c, fur, [4, -25, 16, 16], { lw: 1.3 });
    c.beginPath(); c.moveTo(8, -22); c.lineTo(10, -31); c.lineTo(14, -22); c.closePath(); cel(c, shade(fur, -0.1), [8, -31, 6, 9], { lw: 1.1 });
    monsterEye(c, 16, -18, 1.9, E.light, true);
    c.fillStyle = '#1a1020'; c.beginPath(); c.arc(28, -15.5, 1.7, 0, TAU); c.fill();
    c.fillStyle = '#fff6d0'; c.beginPath(); c.moveTo(22, -11); c.lineTo(23, -8.5); c.lineTo(24, -11); c.fill();
  },
  bat(c, E, t, w) {
    const f = Math.sin(t * 18);
    const body = mix('#5a4a6a', E.color, 0.35);
    for (const s of [-1, 1]) {
      c.save(); c.scale(s, 1); c.rotate(f * 0.4 * s);
      c.beginPath(); c.moveTo(4, -15); c.lineTo(14, -26 + f * 5); c.lineTo(27, -24 + f * 6); c.quadraticCurveTo(24, -18, 25, -12); c.quadraticCurveTo(19, -15, 17, -10); c.quadraticCurveTo(12, -13, 9, -9); c.closePath();
      cel(c, shade(body, -0.15), [4, -26, 23, 17], { lw: 1.2, cut: 0.5 });
      c.strokeStyle = rgba(E.light, 0.5); c.lineWidth = 0.8; c.beginPath(); c.moveTo(14, -25 + f * 5); c.lineTo(17, -11); c.moveTo(14, -25 + f * 5); c.lineTo(24, -13); c.stroke();
      c.restore();
    }
    c.beginPath(); c.ellipse(0, -15, 8, 9, 0, 0, TAU); cel(c, body, [-8, -24, 16, 18], { lw: 1.3 });
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 5, -21); c.lineTo(s * 5, -29); c.lineTo(s * 1.5, -22); c.closePath(); cel(c, body, [-6, -29, 12, 8], { lw: 1.1 }); }
    monsterEye(c, -3, -16, 1.9, E.light, true); monsterEye(c, 3, -16, 1.9, E.light, true);
    c.fillStyle = '#fff6d0'; c.beginPath(); c.moveTo(-2, -11); c.lineTo(-1.2, -9); c.lineTo(-0.4, -11); c.moveTo(0.4, -11); c.lineTo(1.2, -9); c.lineTo(2, -11); c.fill();
  },
  orc(c, E, t, w) {
    const skin = mix('#7aa85a', E.color, 0.3), l = Math.sin(w * 2) * 0.45;
    limbPath(c, -5, -14, -5 - Math.sin(l) * 6, -2, 5, 4); cel(c, '#4a3a2a', [-11, -14, 12, 14], { lw: 1.3 });
    limbPath(c, 5, -14, 5 + Math.sin(l) * 6, -2, 5, 4); cel(c, '#5a4a32', [0, -14, 12, 14], { lw: 1.3 });
    c.beginPath(); pathRR(c, -13, -35, 26, 23, 8); cel(c, skin, [-13, -35, 26, 23], { lw: 1.4 });
    c.beginPath(); c.moveTo(-12, -24); c.lineTo(12, -24); c.lineTo(13, -12); c.lineTo(-13, -12); c.closePath(); cel(c, '#7a4a2a', [-13, -24, 26, 12], { lw: 1.2 });
    c.fillStyle = E.color; c.fillRect(-13, -17, 26, 3);
    c.beginPath(); c.ellipse(-11, -32, 7, 5, -0.3, 0, TAU); cel(c, '#9aa4b4', [-18, -37, 14, 10], { lw: 1.2, dir: 1 });
    c.beginPath(); c.arc(1, -41, 11, 0, TAU); cel(c, skin, [-10, -52, 22, 22], { lw: 1.4 });
    c.fillStyle = '#fff6d0'; c.strokeStyle = '#5a4a3a'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(4, -34); c.lineTo(5, -40); c.lineTo(7, -34); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(9, -34); c.lineTo(10.5, -39); c.lineTo(12, -34); c.closePath(); c.fill(); c.stroke();
    monsterEye(c, 6, -43, 2.1, '#ff4a2a', true);
    c.strokeStyle = '#1a1020'; c.lineWidth = 2; c.beginPath(); c.moveTo(2, -47); c.lineTo(10, -45); c.stroke();
    c.save(); c.translate(12, -24); c.rotate(-0.6 + Math.sin(w * 2) * 0.25);
    limbPath(c, 0, 4, 0, -24, 2.2, 2.2); cel(c, '#7a4a28', [-3, -24, 6, 28], { lw: 1.1 });
    c.beginPath(); c.moveTo(0, -22); c.quadraticCurveTo(16, -28, 13, -11); c.quadraticCurveTo(7, -15, 0, -13); c.closePath(); cel(c, '#d8dee8', [0, -28, 16, 17], { lw: 1.2 });
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
  ghost(c, E, t, w) {
    c.globalAlpha *= 0.82;
    const body = mix('#e8eef8', E.color, 0.25);
    c.beginPath(); c.moveTo(-12, -6);
    c.quadraticCurveTo(-15, -34, 0, -36); c.quadraticCurveTo(15, -34, 12, -10);
    for (let i = 0; i < 4; i++) { const x = 12 - i * 6; c.quadraticCurveTo(x - 1.5, -2 + Math.sin(t * 8 + i) * 3, x - 3, -6); c.quadraticCurveTo(x - 4.5, -10, x - 6, -6); }
    c.closePath();
    const g = c.createRadialGradient(-3, -24, 2, 0, -18, 22); g.addColorStop(0, '#ffffff'); g.addColorStop(1, body);
    fillStroke(c, g);
    c.fillStyle = OL; c.beginPath(); c.ellipse(2, -24, 2.4, 3.6, 0, 0, TAU); c.ellipse(8, -24, 2, 3.2, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(5, -16, 2.5, 3, 0, 0, TAU); c.fill();
    c.fillStyle = E.light; c.beginPath(); c.arc(2.6, -25, 0.9, 0, TAU); c.arc(8.4, -25, 0.8, 0, TAU); c.fill();
    c.strokeStyle = rgba(body, 0.8); c.lineWidth = 3; c.beginPath(); c.moveTo(-10, -18); c.quadraticCurveTo(-20, -14 + Math.sin(t * 5) * 3, -16, -6); c.stroke();
  },
  shaman(c, E, t, w) {
    const skin = mix('#7cbf4a', E.color, 0.3);
    const l = Math.sin(w * 2) * 0.5;
    capsule(c, -3, -10, -3 - Math.sin(l) * 5, -1, 3, shade(skin, -0.2));
    capsule(c, 3, -10, 3 + Math.sin(l) * 5, -1, 3, skin);
    c.beginPath(); c.moveTo(-9, -26); c.lineTo(9, -26); c.lineTo(11, -6); c.lineTo(-11, -6); c.closePath(); fillStroke(c, vgrad(c, -26, -6, '#8a4a8a', '#4a2a5a'));
    for (let i = 0; i < 4; i++) { c.fillStyle = ['#ffd23f', '#ff5a5a', '#5cc8ff', '#7dffb0'][i]; c.beginPath(); c.arc(-6 + i * 4, -24, 1.6, 0, TAU); c.fill(); }
    c.beginPath(); c.arc(1, -33, 9.5, 0, TAU); fillStroke(c, skin);
    c.beginPath(); c.moveTo(-6, -36); c.lineTo(-18, -42); c.lineTo(-8, -30); c.closePath(); fillStroke(c, skin, 1.6);
    c.beginPath(); c.moveTo(-8, -38); c.quadraticCurveTo(1, -54, 10, -38); c.closePath(); fillStroke(c, vgrad(c, -54, -38, '#f2e6c8', '#a08a5a'), 1.6);
    c.fillStyle = OL; c.beginPath(); c.arc(-1, -45, 1.2, 0, TAU); c.arc(4, -45, 1.2, 0, TAU); c.fill();
    c.fillStyle = '#ffef5a'; c.beginPath(); c.arc(5, -33, 2.2, 0, TAU); c.fill(); c.fillStyle = OL; c.beginPath(); c.arc(5.6, -33, 1, 0, TAU); c.fill();
    c.save(); c.translate(11, -14); c.rotate(-0.2);
    capsule(c, 0, 10, 0, -26, 1.8, '#6a4528');
    const pulse = 0.6 + Math.sin(t * 5) * 0.4;
    const gg = c.createRadialGradient(0, -28, 1, 0, -28, 11); gg.addColorStop(0, '#ffffff'); gg.addColorStop(0.4, '#7dffb0'); gg.addColorStop(1, 'rgba(125,255,176,0)');
    c.globalAlpha *= pulse; c.fillStyle = gg; circle(c, 0, -28, 11); c.fill();
    c.restore();
  },
  beetle(c, E, t, w) {
    const shell = mix('#4a5a6a', E.color, 0.35);
    for (const [x, ph] of [[-12, 0], [-4, 1.2], [5, 2.4], [12, 0.6]]) {
      c.save(); c.translate(x, -7); c.rotate(Math.sin(w * 3 + ph) * 0.5); capsule(c, 0, 0, x < 0 ? -3 : 3, 7, 1.8, '#2a2a34'); c.restore();
    }
    c.beginPath(); c.ellipse(-1, -16, 19, 12, 0, Math.PI, TAU); c.lineTo(18, -8); c.quadraticCurveTo(0, -4, -20, -8); c.closePath();
    fillStroke(c, vgrad(c, -28, -6, shade(shell, 0.35), shade(shell, -0.3)));
    c.strokeStyle = shade(shell, -0.45); c.lineWidth = 1.5; c.beginPath(); c.moveTo(-1, -28); c.lineTo(-1, -7); c.stroke();
    c.fillStyle = rgba('#ffffff', 0.4); c.beginPath(); c.ellipse(-8, -22, 6, 2.5, -0.3, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(19, -11, 7, 6, 0, 0, TAU); fillStroke(c, shade(shell, -0.2));
    c.beginPath(); c.moveTo(22, -15); c.quadraticCurveTo(30, -26, 26, -30); c.quadraticCurveTo(26, -20, 20, -16); fillStroke(c, '#d8d0c0', 1.4);
    c.fillStyle = E.light; c.beginPath(); c.arc(22, -12, 1.6, 0, TAU); c.fill();
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
  night:   { g1: '#2a3a5a', g2: '#16203a', path1: '#5a5a7a', path2: '#3a3a5a', deco: 'crystal', sky: '#0a0a2a', leaf: '#7a8aff', wall: '#8a8ab0' },
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


// 몬스터 눈 (반짝임 포함)
function monsterEye(c, x, y, r, col, glow) {
  if (glow) { c.save(); c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(x, y, 0, x, y, r * 2.6); g.addColorStop(0, rgba(col, 0.7)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 2.6, 0, TAU); c.fill(); c.restore(); }
  c.fillStyle = glow ? col : '#1a1020'; c.beginPath(); c.ellipse(x, y, r * 0.85, r * 1.15, 0, 0, TAU); c.fill();
  if (glow) { c.fillStyle = '#1a1020'; c.beginPath(); c.ellipse(x + r * 0.2, y, r * 0.35, r * 0.75, 0, 0, TAU); c.fill(); }
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.45, r * 0.38, 0, TAU); c.fill();
}
