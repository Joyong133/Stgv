'use strict';
// ───────────────────────── 도트 그림 도구 ─────────────────────────
// 모든 그림은 코드로 직접 찍는다. 그린 뒤 자동으로 어두운 외곽선을 둘러
// 단풍 세계 특유의 동글동글한 느낌을 낸다.

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const f = v => clamp(Math.round(amt > 0 ? v + (255 - v) * amt / 100 : v * (1 + amt / 100)), 0, 255);
  return '#' + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}

function painter(c) {
  const g = c.getContext('2d');
  return {
    g,
    px(x, y, col) { g.fillStyle = col; g.fillRect(Math.floor(x), Math.floor(y), 1, 1); },
    rect(x, y, w, h, col) { if (w <= 0 || h <= 0) return; g.fillStyle = col; g.fillRect(Math.floor(x), Math.floor(y), Math.round(w), Math.round(h)); },
    ell(cx, cy, rx, ry, col, cut) {
      g.fillStyle = col;
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
        if (cut && !cut(y)) continue;
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
          if (dx * dx + dy * dy <= 1) g.fillRect(x, y, 1, 1);
        }
      }
    },
    tri(x1, y1, x2, y2, x3, y3, col) {
      g.fillStyle = col; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.closePath(); g.fill();
    },
    line(x1, y1, x2, y2, col) {
      const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) || 1;
      g.fillStyle = col;
      for (let i = 0; i <= n; i++) g.fillRect(Math.round(x1 + (x2 - x1) * i / n), Math.round(y1 + (y2 - y1) * i / n), 1, 1);
    }
  };
}

// 투명 픽셀 중 불투명 픽셀과 맞닿은 곳에 외곽선을 칠한다
function addOutline(c, color = '#22182c') {
  const g = c.getContext('2d');
  const { width: w, height: h } = c;
  const img = g.getImageData(0, 0, w, h), d = img.data;
  const [r, gg, b] = hexToRgb(color);
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 40;
  const marks = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (solid(x, y)) continue;
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) marks.push(y * w + x);
  }
  for (const i of marks) { d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
  // 반투명 가장자리 정리
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 40 ? 255 : 0;
  g.putImageData(img, 0, 0);
  return c;
}

function mirror(c) {
  const m = makeCanvas(c.width, c.height), g = m.getContext('2d');
  g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0);
  return m;
}

// 흰색으로 번쩍이는 피격 이미지
function flashOf(c) {
  const m = makeCanvas(c.width, c.height), g = m.getContext('2d');
  g.drawImage(c, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  return m;
}

const SpriteCache = new Map();
function cached(key, fn) {
  let v = SpriteCache.get(key);
  if (!v) { v = fn(); SpriteCache.set(key, v); }
  return v;
}

// ───────────────────────── 캐릭터 (20×32 도트) ─────────────────────────
// look: { skin, hair, hairStyle, shirt, pants, shoes, hat, hatColor, beard, cape, big }
const CHAR_W = 20, CHAR_H = 32;

function charSprite(look, dir, frame) {
  const key = 'c' + JSON.stringify(look) + dir + frame;
  return cached(key, () => {
    if (dir === 'left') return mirror(charSprite(look, 'right', frame));
    const c = makeCanvas(CHAR_W, CHAR_H), P = painter(c);
    drawChibi(P, look, dir, frame);
    return addOutline(c);
  });
}

function drawChibi(P, L, d, frame) {
  const O = 4; // 모자 공간
  const sk = L.skin || '#ffdcbc', hr = L.hair || '#7a4a26', sh = L.shirt || '#f5f5f5';
  const pn = L.pants || '#4060b0', shoe = L.shoes || '#5c3b22';
  const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  const bob = frame ? 0 : 0;
  const y0 = O + bob;
  const side = d === 'right';

  // 망토 (뒤)
  if (L.cape && d !== 'up') { P.rect(5, y0 + 14, 10, 9, shade(L.cape, -25)); }

  // 다리
  if (!side) {
    P.rect(7, y0 + 21, 3, 4 + (step > 0 ? 0 : 1), pn);
    P.rect(11, y0 + 21, 3, 4 + (step < 0 ? 0 : 1), pn);
    P.rect(6, y0 + 24 + (step > 0 ? 0 : 1), 4, 2, shoe);
    P.rect(11, y0 + 24 + (step < 0 ? 0 : 1), 4, 2, shoe);
  } else {
    P.rect(11 - step, y0 + 21, 3, 4, shade(pn, -20));
    P.rect(11 - step, y0 + 24, 4, 2, shade(shoe, -15));
    P.rect(8 + step, y0 + 21, 3, 4, pn);
    P.rect(8 + step, y0 + 24, 4, 2, shoe);
  }

  // 몸통
  const big = L.big ? 1 : 0;
  P.rect(6 - big, y0 + 14, 8 + big * 2, 8, sh);
  P.rect(6 - big, y0 + 20, 8 + big * 2, 1, shade(sh, -35));
  if (L.belt) P.rect(6 - big, y0 + 20, 8 + big * 2, 1, L.belt);
  if (L.robe) { P.rect(6, y0 + 21, 8, 3, sh); P.rect(6, y0 + 23, 8, 1, shade(sh, -30)); }
  // 팔
  const sw = frame ? (frame === 1 ? 1 : -1) : 0;
  if (!side) {
    P.rect(4 - big, y0 + 15 + sw, 2, 5, shade(sh, -15)); P.rect(4 - big, y0 + 20 + sw, 2, 1, sk);
    P.rect(14 + big, y0 + 15 - sw, 2, 5, shade(sh, -15)); P.rect(14 + big, y0 + 20 - sw, 2, 1, sk);
    if (d === 'down') P.rect(9, y0 + 15, 2, 2, shade(sh, 25));
  } else {
    P.rect(9 - sw, y0 + 15, 3, 5, shade(sh, -15)); P.rect(9 - sw, y0 + 20, 3, 1, sk);
  }
  if (L.cape && d === 'up') { P.rect(5, y0 + 14, 10, 10, L.cape); P.rect(5, y0 + 23, 10, 1, shade(L.cape, -30)); }

  // 머리
  P.ell(10, y0 + 8.5, 7, 6.5, sk);
  const st = L.hairStyle || 'short';
  if (d === 'up') {
    if (st !== 'bald') P.ell(10, y0 + 8, 7.5, 6.8, hr);
    if (st === 'long') P.rect(3, y0 + 8, 14, 9, hr);
    if (st === 'pony') P.rect(9, y0 + 12, 3, 6, hr);
  } else if (d === 'down') {
    if (st !== 'bald') {
      P.ell(10, y0 + 6.5, 7.5, 5, hr);
      P.ell(10, y0 + 10, 6, 4.5, sk);
      P.rect(4, y0 + 4, 12, 3, hr);
      [4, 5, 7, 10, 13, 15].forEach(x => P.px(x, y0 + 7, hr));
      P.rect(3, y0 + 7, 2, 4, hr); P.rect(15, y0 + 7, 2, 4, hr);
      if (st === 'long') { P.rect(2, y0 + 7, 3, 11, hr); P.rect(15, y0 + 7, 3, 11, hr); }
    } else { P.rect(3, y0 + 8, 1, 3, hr); P.rect(16, y0 + 8, 1, 3, hr); }
    // 눈 · 볼 · 입
    const eye = L.eye || '#2a1e3a';
    P.rect(6, y0 + 9, 2, 3, eye); P.px(6, y0 + 9, '#ffffff');
    P.rect(12, y0 + 9, 2, 3, eye); P.px(12, y0 + 9, '#ffffff');
    P.px(5, y0 + 12, '#ffaaa0'); P.px(14, y0 + 12, '#ffaaa0');
    if (!L.beard) P.px(10, y0 + 12, '#c4605a');
    if (L.beard) { P.ell(10, y0 + 14, 5, 3.5, L.beard); P.rect(7, y0 + 12, 6, 1, L.beard); }
  } else { // 오른쪽
    if (st !== 'bald') {
      P.ell(10, y0 + 6.5, 7.5, 5, hr);
      P.ell(6.5, y0 + 9, 4.5, 5, hr);
      P.ell(12, y0 + 10, 5, 4.5, sk);
      P.rect(9, y0 + 4, 8, 2, hr); P.px(16, y0 + 6, hr); P.px(13, y0 + 6, hr);
      if (st === 'long') P.rect(3, y0 + 7, 5, 11, hr);
      if (st === 'pony') { P.rect(1, y0 + 8, 3, 3, hr); P.rect(1, y0 + 11, 2, 5, hr); }
    }
    P.px(8, y0 + 10, shade(sk, -12));
    const eye = L.eye || '#2a1e3a';
    P.rect(14, y0 + 9, 2, 3, eye); P.px(14, y0 + 9, '#ffffff');
    P.px(16, y0 + 12, '#ffaaa0');
    if (L.beard) { P.ell(13, y0 + 14, 4, 3.5, L.beard); P.rect(12, y0 + 12, 5, 1, L.beard); }
    else P.px(16, y0 + 13, '#c4605a');
  }
  if (st === 'spiky' && d !== 'up') { P.tri(5, y0 + 3, 7, y0 - 1, 9, y0 + 3, hr); P.tri(9, y0 + 3, 11, y0 - 2, 13, y0 + 3, hr); P.tri(13, y0 + 3, 15, y0, 16, y0 + 4, hr); }
  if (st === 'bun' && d !== 'up') P.ell(10, y0 + 1, 3, 2.5, hr);
  if (st === 'bun' && d === 'up') P.ell(10, y0 + 2, 3, 2.5, shade(hr, -15));

  // 모자
  const hc = L.hatColor || '#5a3d9a';
  switch (L.hat) {
    case 'wizard':
      P.rect(1, y0 + 3, 18, 2, shade(hc, -15));
      P.rect(5, y0 + 1, 10, 2, hc); P.rect(6, y0 - 1, 8, 2, hc); P.rect(8, y0 - 3, 6, 2, hc); P.rect(11, y0 - 4, 5, 1, hc); P.px(16, y0 - 4, hc);
      P.rect(5, y0 + 2, 10, 1, L.hatBand || '#ffd23f');
      break;
    case 'helmet':
      P.ell(10, y0 + 5.5, 8, 5, hc, y => y <= y0 + 6);
      P.rect(2, y0 + 6, 16, 2, shade(hc, -20));
      if (d === 'down') P.rect(9, y0 + 6, 2, 4, shade(hc, -20));
      P.rect(9, y0 - 1, 2, 2, '#e04040');
      break;
    case 'bandana':
      P.ell(10, y0 + 5.5, 7.5, 4.5, hc, y => y <= y0 + 5);
      P.rect(3, y0 + 5, 14, 2, hc);
      if (d === 'right') { P.rect(1, y0 + 6, 3, 2, hc); P.px(0, y0 + 8, hc); }
      if (d === 'down') P.px(15, y0 + 4, '#ffffff');
      break;
    case 'hood':
      P.ell(10, y0 + 7, 8.5, 7.5, hc, y => y <= y0 + 9 || d === 'up');
      if (d !== 'up') { P.rect(2, y0 + 7, 3, 8, hc); P.rect(15, y0 + 7, 3, 8, hc); if (d === 'down') P.rect(5, y0 + 11, 10, 3, shade(hc, 15)); else P.rect(10, y0 + 11, 7, 3, shade(hc, 15)); }
      break;
    case 'cap':
      P.ell(10, y0 + 5, 7.5, 4.5, hc, y => y <= y0 + 5);
      if (d === 'down') P.rect(4, y0 + 5, 12, 2, shade(hc, -25));
      if (d === 'right') P.rect(11, y0 + 5, 8, 2, shade(hc, -25));
      P.px(10, y0, shade(hc, 40));
      break;
    case 'feather':
      P.ell(10, y0 + 5, 7.5, 4, hc, y => y <= y0 + 5);
      P.rect(2, y0 + 5, 16, 1, shade(hc, -25));
      P.line(13, y0 + 2, 18, y0 - 3, '#ff6b5a'); P.line(14, y0 + 2, 18, y0 - 2, '#ffb15a');
      break;
    case 'crown':
      P.rect(5, y0 + 1, 10, 3, '#ffd23f'); P.px(5, y0, '#ffd23f'); P.px(10, y0 - 1, '#ffd23f'); P.px(14, y0, '#ffd23f'); P.px(10, y0 + 2, '#e83a5a');
      break;
    case 'leaf':
      P.ell(10, y0 + 1, 3, 2, '#ff8a1f'); P.rect(10, y0 + 2, 1, 2, '#7a4a26');
      break;
  }
}

// ───────────────────────── 아이콘 (12×12 도트) ─────────────────────────
function iconSprite(kind, color) {
  return cached('i' + kind + color, () => {
    const c = makeCanvas(14, 14), P = painter(c);
    const col = color || '#ff4d5e';
    P.g.translate(1, 1);
    switch (kind) {
      case 'potion':
        P.rect(4, 0, 4, 2, '#c8a070'); P.rect(5, 2, 2, 2, '#e8f0ff');
        P.ell(6, 7.5, 4.5, 4, col); P.px(4, 6, '#ffffff'); P.px(3, 7, shade(col, 40));
        break;
      case 'elixir':
        P.rect(4, 0, 4, 2, '#ffd23f'); P.rect(5, 2, 2, 2, '#e8f0ff');
        P.tri(1, 11, 11, 11, 6, 3, col); P.px(5, 7, '#ffffff');
        break;
      case 'shell':
        P.ell(6, 6, 5, 5, col); P.ell(6, 6, 3, 3, shade(col, -25)); P.ell(6, 6, 1.5, 1.5, shade(col, 30));
        break;
      case 'cap':
        P.ell(6, 7, 5.5, 4.5, col, y => y <= 7); P.rect(1, 7, 11, 2, '#f0dcc0');
        P.ell(4, 4, 1.2, 1, '#ffffff'); P.ell(8, 5, 1, 1, '#ffffff');
        break;
      case 'jelly':
        P.ell(6, 7.5, 4.5, 4, col); P.tri(3, 6, 9, 6, 6, 0, col); P.px(4, 6, '#ffffff');
        break;
      case 'branch':
        P.line(1, 10, 10, 1, '#8a5a30'); P.line(2, 10, 11, 1, '#6b4422'); P.ell(8, 6, 2, 1.5, '#5fbf4a'); P.ell(4, 3, 1.5, 1.2, '#5fbf4a');
        break;
      case 'tail':
        P.ell(6, 6, 4.5, 4.5, col); P.ell(6, 6, 2.5, 2.5, 'rgba(0,0,0,0)'); P.g.clearRect(5, 5, 3, 3); P.rect(9, 8, 3, 2, col);
        break;
      case 'ribbon':
        P.tri(0, 2, 0, 10, 6, 6, col); P.tri(12, 2, 12, 10, 6, 6, col); P.ell(6, 6, 2, 2, shade(col, -20));
        break;
      case 'scroll':
        P.rect(2, 2, 8, 9, '#f4e2b8'); P.rect(1, 1, 10, 2, '#c99a5a'); P.rect(1, 10, 10, 2, '#c99a5a');
        P.rect(4, 5, 4, 1, col); P.rect(4, 7, 3, 1, col);
        break;
      case 'coin':
        P.ell(6, 6, 5, 5, '#ffcc33'); P.ell(6, 6, 3.5, 3.5, '#ffe27a'); P.rect(5, 3, 2, 6, '#d99a1a');
        break;
      case 'sword':
        P.line(2, 10, 10, 2, '#e8eef8'); P.line(3, 10, 11, 2, '#b8c4d8'); P.rect(2, 7, 4, 2, col); P.rect(1, 9, 2, 2, '#7a4a26');
        break;
      case 'axe':
        P.line(2, 11, 9, 3, '#8a5a30'); P.ell(9, 3, 3, 3, '#c8d0dc'); P.px(11, 2, '#ffffff');
        break;
      case 'wand':
        P.line(2, 11, 8, 4, '#8a5a30'); P.ell(9, 3, 2.5, 2.5, col); P.px(8, 2, '#ffffff');
        break;
      case 'staff':
        P.line(2, 11, 9, 2, '#6b4422'); P.ell(9.5, 2.5, 2.5, 2.5, col); P.px(9, 1, '#ffffff'); P.px(4, 5, '#ffd23f');
        break;
      case 'bow':
        P.g.strokeStyle = col; P.g.lineWidth = 1.5; P.g.beginPath(); P.g.arc(2, 6, 7, -1.2, 1.2); P.g.stroke();
        P.line(4, 0, 4, 12, '#e8e8e8');
        break;
      case 'dagger':
        P.line(3, 9, 9, 3, '#e8eef8'); P.line(4, 9, 10, 3, '#a8b4c8'); P.rect(2, 8, 3, 2, col); P.rect(1, 10, 2, 2, '#3a2a1a');
        break;
      case 'claw':
        P.rect(2, 4, 8, 6, col); P.tri(2, 4, 4, 0, 5, 4, '#e8eef8'); P.tri(5, 4, 7, 0, 8, 4, '#e8eef8'); P.tri(8, 4, 10, 0, 11, 4, '#e8eef8');
        break;
      case 'star':
        P.tri(6, 0, 4, 6, 8, 6, col); P.tri(0, 4, 12, 4, 6, 9, col); P.tri(6, 7, 2, 12, 4, 6, col); P.tri(6, 7, 10, 12, 8, 6, col);
        break;
      case 'hat':
        P.ell(6, 6, 5, 4.5, col, y => y <= 6); P.rect(0, 6, 12, 2, shade(col, -25));
        break;
      case 'armor':
        P.rect(3, 2, 6, 9, col); P.rect(0, 2, 3, 5, shade(col, -15)); P.rect(9, 2, 3, 5, shade(col, -15)); P.rect(5, 2, 2, 2, shade(col, 30));
        break;
      case 'shoes':
        P.rect(1, 5, 4, 5, col); P.rect(1, 9, 6, 2, shade(col, -25)); P.rect(7, 5, 4, 5, col); P.rect(7, 9, 5, 2, shade(col, -25));
        break;
      case 'leaf':
        drawMapleLeaf(P.g, 6, 6, 6, col);
        break;
      case 'eye':
        P.ell(6, 6, 5, 4, '#ffffff'); P.ell(6, 6, 2.5, 2.5, col); P.ell(6, 6, 1, 1, '#000');
        break;
      case 'horn':
        P.tri(2, 11, 8, 11, 9, 0, col); P.px(7, 3, '#ffffff');
        break;
      default:
        P.rect(2, 2, 8, 8, col);
    }
    return addOutline(c);
  });
}

// 단풍잎 (경로로 그림 — 제목 로고와 아이콘에 사용)
function drawMapleLeaf(g, cx, cy, r, color) {
  const pts = [
    [0, -1], [0.18, -0.62], [0.38, -0.72], [0.32, -0.32], [0.72, -0.52], [0.62, -0.22], [0.98, -0.08], [0.58, 0.12],
    [0.66, 0.42], [0.22, 0.3], [0.12, 0.62], [0.04, 0.6], [0.04, 1], [-0.04, 1], [-0.04, 0.6], [-0.12, 0.62], [-0.22, 0.3],
    [-0.66, 0.42], [-0.58, 0.12], [-0.98, -0.08], [-0.62, -0.22], [-0.72, -0.52], [-0.32, -0.32], [-0.38, -0.72], [-0.18, -0.62]
  ];
  g.fillStyle = color;
  g.beginPath();
  pts.forEach(([x, y], i) => { const X = cx + x * r, Y = cy + y * r * 0.95; i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
  g.closePath(); g.fill();
}

// ───────────────────────── 화면에 그리기 ─────────────────────────
// art 좌표(도트) 기준 스프라이트를 논리 좌표에 확대해서 그린다
function blit(img, x, y, scale = PX, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.drawImage(img, Math.round(x), Math.round(y), img.width * scale, img.height * scale);
  ctx.restore();
}

function drawShadow(cx, cy, rx, ry) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// 단풍 세계의 상징인 소용돌이 포탈
function drawPortal(cx, cy, t, scale = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, 'rgba(140,200,255,0.75)'); g.addColorStop(1, 'rgba(70,90,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, 16, 24, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 3; i++) {
    const a = t * 0.12 + i * 2.1;
    ctx.strokeStyle = i === 1 ? 'rgba(200,170,255,0.9)' : 'rgba(150,220,255,0.9)';
    ctx.beginPath(); ctx.ellipse(0, 0, 13 - i * 2, 21 - i * 3, 0, a, a + 3.6); ctx.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const a = t * 0.07 + i * 1.57, rr = 10 + Math.sin(t * 0.1 + i) * 6;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(Math.cos(a) * rr * 0.7 - 1, Math.sin(a) * rr - 1, 2, 2);
  }
  ctx.restore();
}
