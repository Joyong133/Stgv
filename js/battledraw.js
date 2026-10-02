'use strict';
// ───────────────────────── 전투 화면 그리기 ─────────────────────────
const GROUND_Y = 300;

function drawBattleBg(theme, t) {
  const T = THEMES[theme];
  const g = ctx.createLinearGradient(0, 0, 0, 260);
  g.addColorStop(0, T.sky[0]); g.addColorStop(1, T.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 340);

  switch (theme) {
    case 'cave': {
      ctx.fillStyle = '#2a2024';
      for (let i = 0; i < 14; i++) { const x = i * 50 + (i % 3) * 7, h = 30 + (i * 37) % 60; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 22, 0); ctx.lineTo(x + 11, h); ctx.fill(); }
      ctx.fillStyle = '#3a2e30';
      for (let i = 0; i < 8; i++) { const x = i * 90 + 20; ctx.beginPath(); ctx.moveTo(x, 260); ctx.lineTo(x + 26, 180 + (i * 23) % 50); ctx.lineTo(x + 52, 260); ctx.fill(); }
      // 떠다니는 빛 입자
      for (let i = 0; i < 12; i++) { const x = (i * 97 + t * 0.3) % W, y = 60 + (i * 53) % 160 + Math.sin(t * 0.03 + i) * 8; ctx.fillStyle = 'rgba(200,140,255,0.5)'; ctx.fillRect(x, y, 3, 3); }
      break;
    }
    case 'city': {
      for (let i = 0; i < 30; i++) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect((i * 131) % W, (i * 47) % 120, 2, 2); }
      ctx.fillStyle = '#ffeec0'; ctx.beginPath(); ctx.arc(540, 60, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#23263a';
      for (let i = 0; i < 9; i++) {
        const x = i * 74 - 10, h = 90 + (i * 41) % 90;
        ctx.fillRect(x, 260 - h, 66, h);
        for (let wy = 260 - h + 10; wy < 250; wy += 16) for (let wx = x + 8; wx < x + 58; wx += 14) if (hash2(wx, wy) > 0.55) { ctx.fillStyle = '#ffd86a'; ctx.fillRect(wx, wy, 6, 8); ctx.fillStyle = '#23263a'; }
      }
      break;
    }
    case 'rock': {
      ctx.fillStyle = '#c87a4a';
      ctx.beginPath(); ctx.moveTo(0, 260); ctx.lineTo(60, 150); ctx.lineTo(160, 140); ctx.lineTo(200, 260); ctx.fill();
      ctx.beginPath(); ctx.moveTo(380, 260); ctx.lineTo(430, 120); ctx.lineTo(560, 110); ctx.lineTo(620, 260); ctx.fill();
      ctx.fillStyle = '#a85a3a';
      ctx.beginPath(); ctx.moveTo(150, 260); ctx.lineTo(220, 180); ctx.lineTo(330, 175); ctx.lineTo(400, 260); ctx.fill();
      break;
    }
    case 'forest': {
      for (let i = 0; i < 7; i++) {
        const x = i * 100 - 20 + (i % 2) * 30;
        ctx.fillStyle = '#2a5a44'; ctx.fillRect(x + 30, 60, 30, 210);
        ctx.fillStyle = '#23704a'; ctx.beginPath(); ctx.arc(x + 45, 60, 70, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2f8a5a'; ctx.beginPath(); ctx.arc(x + 25, 40, 40, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 0; i < 10; i++) { const x = (i * 71 + t * 0.4) % W, y = 80 + (i * 37) % 150 + Math.sin(t * 0.05 + i) * 10; ctx.fillStyle = 'rgba(255,255,180,0.8)'; ctx.fillRect(x, y, 3, 3); }
      break;
    }
    default: {
      // 구름
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 4; i++) {
        const x = ((i * 190 + t * (0.2 + i * 0.05)) % (W + 160)) - 80, y = 40 + i * 28;
        ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.arc(x + 26, y - 8, 26, 0, Math.PI * 2); ctx.arc(x + 54, y, 20, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = T.far;
      ctx.beginPath(); ctx.moveTo(0, 260);
      for (let x = 0; x <= W; x += 40) ctx.lineTo(x, 200 + Math.sin(x * 0.012) * 26 + Math.sin(x * 0.03) * 8);
      ctx.lineTo(W, 260); ctx.fill();
      ctx.fillStyle = shade(T.leaf, 10);
      for (let i = 0; i < 6; i++) { const x = 30 + i * 118; ctx.fillRect(x + 8, 200, 8, 50); ctx.beginPath(); ctx.arc(x + 12, 196, 26, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  // 땅
  const gg = ctx.createLinearGradient(0, 250, 0, 340);
  gg.addColorStop(0, T.g3); gg.addColorStop(0.15, T.g); gg.addColorStop(1, T.g2);
  ctx.fillStyle = gg; ctx.fillRect(0, 252, W, 90);
  ctx.fillStyle = shade(T.g, -15);
  for (let i = 0; i < 40; i++) { const x = (i * 53) % W, y = 262 + (i * 29) % 70; ctx.fillRect(x, y, theme === 'city' ? 14 : 4, 2); }
  if (theme !== 'cave' && theme !== 'city' && theme !== 'rock') {
    const cols = ['#ff6b8a', '#ffd23f', '#ffffff'];
    for (let i = 0; i < 10; i++) { ctx.fillStyle = cols[i % 3]; ctx.fillRect((i * 67 + 13) % W, 270 + (i * 31) % 60, 4, 4); }
  }
}

// ── 메이플식 데미지 숫자 ──
const DMG_STYLE = {
  normal: ['#fff2a8', '#ff9a1f', '#5a2600'],
  crit: ['#ffd0f0', '#ff3a7a', '#4a0020'],
  hurt: ['#f4d8ff', '#a84ad8', '#2a0a3a'],
  heal: ['#e0ffd8', '#3ac84a', '#0a3a10'],
  mp: ['#d8ecff', '#3a8aff', '#0a1a4a']
};
function drawNumber(n) {
  const t = n.t;
  const a = t > 44 ? Math.max(0, 1 - (t - 44) / 18) : 1;
  const pop = t < 6 ? 1 + (6 - t) * 0.1 : 1;
  const size = (n.kind === 'crit' ? 30 : 25) * pop;
  const y = n.y - Math.min(t, 24) * 1.2 - (t > 24 ? (t - 24) * 0.3 : 0);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const str = n.text;
  const [c1, c2, ol] = DMG_STYLE[n.kind] || DMG_STYLE.normal;
  ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.strokeStyle = ol;
  ctx.strokeText(str, n.x, y);
  const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fillText(str, n.x, y);
  if (n.kind === 'crit' && t < 30) text('CRITICAL', n.x, y - size + 2, { size: 13, align: 'center', color: '#ffe0f0', outline: '#4a0020', lw: 4 });
  ctx.restore();
}

// ── 이펙트 ──
// 각 이펙트: { type, t, dur, ...좌표 }
function drawFx(f) {
  const k = f.t / f.dur;
  ctx.save();
  switch (f.type) {
    case 'slash': {
      ctx.translate(f.x, f.y);
      ctx.rotate(-0.6 + k * 0.4);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = f.color || '#ffffff'; ctx.lineWidth = 10 * (1 - k) + 2;
      ctx.beginPath(); ctx.arc(0, 0, 46 + k * 10, -1.4, 0.9); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,220,120,0.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 38 + k * 10, -1.2, 0.7); ctx.stroke();
      break;
    }
    case 'wave': {
      const x = f.x + (f.tx - f.x) * k;
      ctx.globalAlpha = 1 - k * 0.6;
      ctx.strokeStyle = '#bfe8ff'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(x, f.y, 60, Math.PI * 0.6, Math.PI * 1.4); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x + 8, f.y, 54, Math.PI * 0.65, Math.PI * 1.35); ctx.stroke();
      break;
    }
    case 'proj': {
      const x = f.x + (f.tx - f.x) * k, y = f.y + (f.ty - f.y) * k - Math.sin(k * Math.PI) * (f.arc || 0);
      ctx.translate(x, y);
      if (f.img === 'arrow') {
        ctx.rotate(Math.atan2(f.ty - f.y, f.tx - f.x));
        ctx.fillStyle = '#8a5a30'; ctx.fillRect(-24, -1.5, 36, 3);
        ctx.fillStyle = '#e8eef8'; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(8, -6); ctx.lineTo(8, 6); ctx.fill();
        ctx.fillStyle = '#ff6a5a'; ctx.fillRect(-26, -5, 8, 3); ctx.fillRect(-26, 2, 8, 3);
      } else if (f.img === 'star') {
        ctx.rotate(f.t * 0.6);
        const s = iconSprite('star', '#c8d0e0'); ctx.drawImage(s, -14, -14, 28, 28);
      } else if (f.img === 'shell') {
        ctx.rotate(f.t * 0.4);
        const s = iconSprite('shell', '#5fbf4a'); ctx.drawImage(s, -14, -14, 28, 28);
      } else {
        const r = f.r || 14;
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, f.color || '#8ad8ff'); g.addColorStop(1, 'rgba(80,120,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'burst': {
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = f.color || '#ffe08a';
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2 + (f.seed || 0), r = 8 + k * (f.r || 50);
        ctx.fillRect(f.x + Math.cos(a) * r - 3, f.y + Math.sin(a) * r - 3, 6, 6);
      }
      ctx.strokeStyle = f.color || '#ffe08a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(f.x, f.y, k * (f.r || 50) * 0.8, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'boom': {
      ctx.globalAlpha = 1 - k;
      const g = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, 20 + k * 60);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, f.color || '#ffb04a'); g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, 20 + k * 60, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'thunder': {
      ctx.globalAlpha = k < 0.5 ? 1 : 2 - k * 2;
      ctx.strokeStyle = '#fff8a0'; ctx.lineWidth = 5; ctx.shadowColor = '#ffe14a'; ctx.shadowBlur = 16;
      ctx.beginPath(); let x = f.x + (hash2(f.seed, 1) - 0.5) * 30; ctx.moveTo(x, 0);
      for (let y = 30; y <= f.y; y += 30) { x = f.x + (hash2(f.seed, y) - 0.5) * 40; ctx.lineTo(x, y); }
      ctx.lineTo(f.x, f.y); ctx.stroke();
      break;
    }
    case 'claw': {
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = f.color || '#8ad8ff'; ctx.lineWidth = 5;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(f.x - 30 + i * 18, f.y - 40); ctx.lineTo(f.x - 30 + i * 18 + 30 * Math.min(1, k * 3), f.y - 40 + 70 * Math.min(1, k * 3)); ctx.stroke(); }
      break;
    }
    case 'aura': {
      ctx.globalAlpha = Math.sin(k * Math.PI);
      const g = ctx.createLinearGradient(0, f.y - 110, 0, f.y);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, f.color || 'rgba(255,210,80,0.7)');
      ctx.fillStyle = g; ctx.fillRect(f.x - 36, f.y - 110, 72, 110);
      for (let i = 0; i < 8; i++) { ctx.fillStyle = '#ffffff'; ctx.fillRect(f.x - 30 + i * 8, f.y - (f.t * 3 + i * 17) % 110, 3, 3); }
      break;
    }
    case 'spore': {
      ctx.globalAlpha = 1 - k;
      for (let i = 0; i < 16; i++) { ctx.fillStyle = i % 2 ? '#c86aff' : '#8ad86a'; ctx.beginPath(); ctx.arc(f.x + (hash2(i, 2) - 0.5) * 140 * k + (f.tx - f.x) * k, f.y + (hash2(i, 5) - 0.5) * 80, 5, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'fire': {
      for (let i = 0; i < 18; i++) {
        const kk = clamp(k * 1.4 - i * 0.02, 0, 1);
        const x = f.x + (f.tx - f.x) * kk, y = f.y + (f.ty - f.y) * kk + Math.sin(i * 2 + f.t * 0.3) * 18;
        ctx.globalAlpha = 1 - kk * 0.5;
        ctx.fillStyle = i % 3 === 0 ? '#2a0a3a' : i % 3 === 1 ? '#8a2ad8' : '#ff3a6a';
        ctx.beginPath(); ctx.arc(x, y, 14 - i * 0.4, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'dark': {
      ctx.globalAlpha = Math.sin(k * Math.PI) * 0.6;
      ctx.fillStyle = '#2a0a3a'; ctx.fillRect(0, 0, W, 340);
      break;
    }
  }
  ctx.restore();
}
