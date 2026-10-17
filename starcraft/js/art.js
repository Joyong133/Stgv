'use strict';
// ───────────────────────── 그리기 도구 ─────────────────────────
function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }
function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); }
function rrect(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
function poly(g, pts) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); }
function vgrad(g, y0, y1, c0, c1) { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, c0); gr.addColorStop(1, c1); return gr; }
function rgrad(g, x, y, r0, r1, c0, c1) { const gr = g.createRadialGradient(x, y, r0, x, y, r1); gr.addColorStop(0, c0); gr.addColorStop(1, c1); return gr; }
const lerpRGB = (a, b, t, j = 0) => `rgb(${Math.round(lerp(a[0], b[0], t) + j)},${Math.round(lerp(a[1], b[1], t) + j)},${Math.round(lerp(a[2], b[2], t) + j)})`;

const PAL = [0, 1].map(t => ({
  tc: TEAM_COLOR[t], td: TEAM_DARK[t], tl: TEAM_LIGHT[t],
  armor: mixColor(TEAM_COLOR[t], '#56606c', 0.5), helm: mixColor(TEAM_COLOR[t], '#9aa6b4', 0.55),
}));

// ───────────────────────── 지형 (덩어리 단위로 미리 그려 둔다) ─────────────────────────
const CHUNK = 16, CHUNK_PX = CHUNK * TILE;
const UNIT_SCALE = 1.2;   // 유닛은 충돌 크기보다 조금 크게 그린다
const GROUND = {
  [T_LOW]: [[60, 50, 40], [94, 78, 61]],
  [T_HIGH]: [[96, 81, 63], [130, 111, 86]],
  [T_RAMP]: [[78, 66, 52], [110, 93, 73]],
  [T_ROCK]: [[33, 27, 22], [52, 44, 36]],
};
const Art = {
  chunks: new Map(), noise: null,
  reset() { this.chunks.clear(); this.noise = makeNoise(World.seed + 99); this.icons = {}; },
  invalidate(keys) { for (const k of keys) this.chunks.delete(k); },
  chunk(cx, cy) {
    const k = cx + ',' + cy;
    let c = this.chunks.get(k);
    if (c) { this.chunks.delete(k); this.chunks.set(k, c); return c; }
    c = this.renderChunk(cx, cy);
    this.chunks.set(k, c);
    if (this.chunks.size > 30) this.chunks.delete(this.chunks.keys().next().value);
    return c;
  },
  terrainAt(x, y) { return inMap(x, y) ? World.terrain[tIdx(x, y)] : T_ROCK; },
  renderChunk(cx, cy) {
    const c = document.createElement('canvas');
    c.width = c.height = CHUNK_PX;
    const g = c.getContext('2d');
    g.translate(-cx * CHUNK_PX, -cy * CHUNK_PX);
    const x0 = cx * CHUNK, y0 = cy * CHUNK, x1 = x0 + CHUNK, y1 = y0 + CHUNK;
    const N = this.noise, ta = (x, y) => this.terrainAt(x, y);
    // 1) 바닥 색: 4픽셀 단위 색 지도를 부드럽게 늘려 그린다
    const R = 4, n = CHUNK_PX / R + 2, small = document.createElement('canvas');
    small.width = small.height = n;
    const sg = small.getContext('2d'), img = sg.createImageData(n, n), d = img.data;
    for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
      const wx = x0 * TILE + (px - 1) * R, wy = y0 * TILE + (py - 1) * R;
      const t = ta(Math.floor(wx / TILE), Math.floor(wy / TILE)), pal = GROUND[t];
      const k = clamp((fbm(N, wx / 300, wy / 300, 4) - 0.25) * 1.8, 0, 1);
      const j = (hash2(px + x0 * 40, py + y0 * 40, 3) - 0.5) * 10;
      const o = (py * n + px) * 4;
      for (let c = 0; c < 3; c++) d[o + c] = lerp(pal[0][c], pal[1][c], k) + j;
      d[o + 3] = 255;
    }
    sg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(small, 1, 1, n - 2, n - 2, x0 * TILE, y0 * TILE, CHUNK_PX, CHUNK_PX);
    // 2) 큰 얼룩
    for (let y = y0 - 1; y < y1 + 1; y++) for (let x = x0 - 1; x < x1 + 1; x++) {
      const t = ta(x, y);
      if (t === T_ROCK) continue;
      const h = hash2(x, y, 11);
      if (h > 0.22) continue;
      const r = 18 + hash2(x, y, 21) * 26, cx0 = (x + hash2(x, y, 31)) * TILE, cy0 = (y + hash2(x, y, 41)) * TILE;
      g.fillStyle = rgrad(g, cx0, cy0, 0, r, h < 0.1 ? 'rgba(20,14,10,.16)' : 'rgba(170,140,100,.10)', 'rgba(0,0,0,0)');
      circ(g, cx0, cy0, r); g.fill();
    }
    // 3) 경사로 계단 무늬
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (ta(x, y) !== T_RAMP) continue;
      g.strokeStyle = 'rgba(30,22,16,.25)'; g.lineWidth = 2;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x * TILE + 3, y * TILE + 6 + k * 10); g.lineTo(x * TILE + 29, y * TILE + 6 + k * 10); g.stroke(); }
    }
    // 4) 점막
    for (let y = y0 - 2; y < y1 + 2; y++) for (let x = x0 - 2; x < x1 + 2; x++) {
      if (!inMap(x, y) || !World.creep[tIdx(x, y)]) continue;
      const edge = !(World.creep[tIdx(clamp(x + 1, 0, MAP_W - 1), y)] && World.creep[tIdx(clamp(x - 1, 0, MAP_W - 1), y)] && World.creep[tIdx(x, clamp(y + 1, 0, MAP_H - 1))] && World.creep[tIdx(x, clamp(y - 1, 0, MAP_H - 1))]);
      const px = (x + 0.5) * TILE, py = (y + 0.5) * TILE;
      for (let k = 0; k < 3; k++) {
        const r = (edge ? 10 : 15) + hash2(x, y, 51 + k) * 9;
        g.fillStyle = k === 2 ? '#56304f' : '#3f2340';
        circ(g, px + (hash2(x, y, 61 + k) - 0.5) * 18, py + (hash2(x, y, 71 + k) - 0.5) * 18, r);
        g.fill();
      }
    }
    for (let y = y0 - 1; y < y1 + 1; y++) for (let x = x0 - 1; x < x1 + 1; x++) {
      if (!inMap(x, y) || !World.creep[tIdx(x, y)]) continue;
      const px = (x + 0.5) * TILE, py = (y + 0.5) * TILE;
      g.strokeStyle = 'rgba(30,12,30,.55)'; g.lineWidth = 1.4;
      g.beginPath();
      const a = hash2(x, y, 81) * TAU;
      g.moveTo(px, py);
      g.quadraticCurveTo(px + Math.cos(a + 1) * 14, py + Math.sin(a + 1) * 14, px + Math.cos(a) * 22, py + Math.sin(a) * 22);
      g.stroke();
      if (hash2(x, y, 91) < 0.25) { g.fillStyle = 'rgba(150,70,120,.35)'; circ(g, px + 6, py - 4, 3); g.fill(); }
    }
    // 5) 장식: 분화구 · 자갈
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const t = ta(x, y);
      if (t === T_ROCK || (inMap(x, y) && World.creep[tIdx(x, y)])) continue;
      const h = hash2(x, y, 101);
      if (h < 0.018) {
        const px = (x + 0.5) * TILE, py = (y + 0.5) * TILE, r = 9 + hash2(x, y, 102) * 8;
        g.fillStyle = 'rgba(15,10,8,.35)'; ell(g, px, py, r, r * 0.65); g.fill();
        g.strokeStyle = 'rgba(190,160,120,.22)'; g.lineWidth = 2; ell(g, px, py + 1.5, r + 1, r * 0.65 + 1); g.stroke();
      }
      for (let k = 0; k < 3; k++) {
        if (hash2(x, y, 111 + k) > 0.3) continue;
        g.fillStyle = k ? 'rgba(25,18,13,.45)' : 'rgba(180,155,120,.3)';
        g.fillRect(x * TILE + hash2(x, y, 121 + k) * 30, y * TILE + hash2(x, y, 131 + k) * 30, 2, 2);
      }
    }
    // 6) 바위 그림자 → 바위
    for (let y = y0 - 1; y < y1 + 1; y++) for (let x = x0 - 1; x < x1 + 1; x++) {
      if (ta(x, y) !== T_ROCK) continue;
      if (ta(x + 1, y) !== T_ROCK || ta(x, y + 1) !== T_ROCK) {
        g.fillStyle = 'rgba(8,6,4,.38)';
        ell(g, (x + 0.5) * TILE + 9, (y + 0.5) * TILE + 11, 21, 17); g.fill();
      }
    }
    for (let y = y0 - 1; y < y1 + 1; y++) for (let x = x0 - 1; x < x1 + 1; x++) {
      if (ta(x, y) !== T_ROCK) continue;
      const inner = ta(x + 1, y) === T_ROCK && ta(x - 1, y) === T_ROCK && ta(x, y + 1) === T_ROCK && ta(x, y - 1) === T_ROCK;
      const n = inner ? 1 : 2;
      for (let k = 0; k < n; k++) {
        const px = (x + 0.2 + hash2(x, y, 141 + k) * 0.6) * TILE, py = (y + 0.2 + hash2(x, y, 151 + k) * 0.6) * TILE;
        const r = (inner ? 15 : 10) + hash2(x, y, 161 + k) * 7;
        const tone = hash2(x, y, 171 + k);
        g.fillStyle = '#1c1612'; circ(g, px + 2, py + 3, r); g.fill();
        g.fillStyle = rgrad(g, px - r * 0.4, py - r * 0.45, r * 0.1, r * 1.1, tone < 0.5 ? '#76664f' : '#6a5b48', '#2c241d');
        circ(g, px, py, r); g.fill();
        if (tone > 0.6) { g.strokeStyle = 'rgba(20,14,10,.6)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(px - r * 0.5, py - r * 0.1); g.lineTo(px + r * 0.1, py + r * 0.2); g.lineTo(px + r * 0.4, py - r * 0.3); g.stroke(); }
      }
    }
    return c;
  },

  // ───────── 자원 ─────────
  mineral(g, m, t) {
    const k = 0.55 + 0.45 * (m.amount / m.max);
    const bx = m.tx * TILE, by = m.ty * TILE;
    g.fillStyle = 'rgba(0,0,0,.35)'; ell(g, bx + 33, by + 25, 30, 8); g.fill();
    const shards = MINERAL_SHAPES[m.variant];
    for (const [ox, w, hgt, lean] of shards) {
      const x = bx + ox, y = by + 26, h = hgt * k;
      const tip = x + lean * h * 0.3;
      g.fillStyle = vgrad(g, y - h, y, '#d4f6ff', '#2575b8');
      poly(g, [x - w, y, x - w * 0.9, y - h * 0.65, tip, y - h, x + w * 0.9, y - h * 0.65, x + w, y]);
      g.fill();
      g.strokeStyle = '#0d3557'; g.lineWidth = 1.1; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x - w * 0.35, y - 2); g.lineTo(tip - 0.5, y - h + 2); g.stroke();
    }
    const tw = (Math.sin(t * 2 + m.id) + 1) / 2;
    if (tw > 0.92) { g.fillStyle = `rgba(255,255,255,${(tw - 0.92) * 10})`; circ(g, bx + shards[1][0], by + 26 - shards[1][2] * k + 3, 2); g.fill(); }
  },
  geyser(g, r, t) {
    const x = r.tx * TILE, y = r.ty * TILE, w = r.w * TILE, h = r.h * TILE, cx = x + w / 2, cy = y + h / 2 + 2;
    g.fillStyle = '#2a2420'; ell(g, cx, cy + 3, w * 0.48, h * 0.42); g.fill();
    g.fillStyle = rgrad(g, cx, cy - 4, 4, w * 0.45, '#6b5d4c', '#3a3129'); ell(g, cx, cy, w * 0.46, h * 0.4); g.fill();
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * TAU;
      g.fillStyle = i % 2 ? '#574a3c' : '#4a3e33';
      circ(g, cx + Math.cos(a) * w * 0.4, cy + Math.sin(a) * h * 0.34, 6 + (i % 3) * 2); g.fill();
    }
    g.fillStyle = '#0f1a10'; ell(g, cx, cy, w * 0.2, h * 0.17); g.fill();
    g.fillStyle = 'rgba(110,227,106,.25)'; ell(g, cx, cy, w * 0.14, h * 0.11); g.fill();
    if (r.amount > 0) for (let i = 0; i < 3; i++) {
      const p = (t * 0.4 + i / 3 + r.id * 0.17) % 1;
      g.fillStyle = `rgba(150,235,140,${0.28 * (1 - p)})`;
      circ(g, cx + Math.sin(p * 5 + i) * 6, cy - p * 34, 5 + p * 12); g.fill();
    }
  },

  // ───────── 유닛 ─────────
  shadow(g, u) {
    const r = u.r * UNIT_SCALE;
    if (u.air) { g.fillStyle = 'rgba(0,0,0,.28)'; ell(g, u.x + 6, u.y + 10, r * 0.9, r * 0.55); g.fill(); return; }
    g.fillStyle = 'rgba(0,0,0,.3)'; ell(g, u.x + 2, u.y + 3, r * 1.05, r * 0.75); g.fill();
  },
  unit(g, u) {
    g.save();
    g.translate(u.x, u.y - (u.air ? 20 + Math.sin(u.anim * 1.6) * 2 : 0));
    g.rotate(u.facing);
    g.scale(UNIT_SCALE, UNIT_SCALE);
    Sprites[u.key](g, u, PAL[u.team]);
    if (u.flash > 0) { g.fillStyle = `rgba(255,255,255,${u.flash * 2.5})`; circ(g, 0, 0, u.r * 0.85); g.fill(); }
    g.restore();
    if (u.stim > 0) { g.strokeStyle = `rgba(255,70,60,${0.35 + Math.sin(u.anim * 12) * 0.15})`; g.lineWidth = 2; circ(g, u.x, u.y, u.r * UNIT_SCALE + 2); g.stroke(); }
  },

  // ───────── 건물 ─────────
  building(g, b, t, ghost) {
    const x = b.tx * TILE, y = b.ty * TILE, w = b.w * TILE, h = b.h * TILE;
    const P = PAL[b.team], draw = BSprites[b.key];
    if (!ghost) { g.fillStyle = 'rgba(0,0,0,.33)'; rrect(g, x + 6, y + 8, w - 4, h - 4, 10); g.fill(); }
    const p = b.built ? 1 : b.progress;
    if (b.built || ghost) draw(g, x, y, w, h, P, t, b);
    else if (b.def.race === 'T') {
      g.fillStyle = '#34373a'; rrect(g, x + 3, y + 4, w - 6, h - 6, 4); g.fill();
      g.save(); g.beginPath(); g.rect(x - 4, y + h * (1 - p), w + 8, h * p + 6); g.clip();
      draw(g, x, y, w, h, P, t, b);
      g.restore();
      g.strokeStyle = 'rgba(255,196,64,.75)'; g.lineWidth = 1.5; g.setLineDash([5, 4]);
      g.strokeRect(x + 5, y + 5, w - 10, h - 10);
      g.beginPath(); g.moveTo(x + 5, y + 5); g.lineTo(x + w - 5, y + h - 5); g.moveTo(x + w - 5, y + 5); g.lineTo(x + 5, y + h - 5); g.stroke();
      g.setLineDash([]);
    } else {
      const cx = x + w / 2, cy = y + h / 2, s = 0.45 + 0.55 * p, pulse = 1 + Math.sin(t * 4 + b.id) * 0.04;
      g.fillStyle = rgrad(g, cx - 6, cy - 6, 2, w * 0.5 * s, '#9c6a7f', '#3b2033');
      ell(g, cx, cy, w * 0.46 * s * pulse, h * 0.44 * s * pulse); g.fill();
      g.strokeStyle = 'rgba(30,8,24,.7)'; g.lineWidth = 2;
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + b.id; g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(cx + Math.cos(a + 0.6) * w * 0.25 * s, cy + Math.sin(a + 0.6) * h * 0.2 * s, cx + Math.cos(a) * w * 0.42 * s, cy + Math.sin(a) * h * 0.38 * s); g.stroke(); }
      g.fillStyle = `rgba(230,120,160,${0.25 + Math.sin(t * 5 + b.id) * 0.15})`; circ(g, cx, cy, 6 * s); g.fill();
      if (p > 0.75) { g.save(); g.globalAlpha = (p - 0.75) * 4; draw(g, x, y, w, h, P, t, b); g.restore(); }
    }
    if (b.built && b.def.race === 'T' && !ghost) {
      const k = b.hp / b.def.hp;
      if (k < 0.66) {
        for (let i = 0; i < (k < 0.33 ? 4 : 2); i++) {
          const fx0 = x + w * (0.2 + hash2(b.id, i, 5) * 0.6), fy0 = y + h * (0.2 + hash2(b.id, i, 6) * 0.5);
          const ph = (t * 0.7 + i * 0.37) % 1;
          g.fillStyle = `rgba(40,36,34,${0.45 * (1 - ph)})`; circ(g, fx0 + ph * 8, fy0 - ph * 30, 5 + ph * 10); g.fill();
          if (k < 0.33) {
            const fl = 0.7 + Math.sin(t * 20 + i * 3) * 0.3;
            g.fillStyle = 'rgba(255,140,40,.85)'; ell(g, fx0, fy0, 4 * fl, 7 * fl); g.fill();
            g.fillStyle = 'rgba(255,230,120,.9)'; ell(g, fx0, fy0 + 1, 2 * fl, 3.5 * fl); g.fill();
          }
        }
      }
    }
    if (b.flash > 0 && !ghost) { g.fillStyle = `rgba(255,255,255,${b.flash})`; rrect(g, x + 6, y + 6, w - 12, h - 12, 8); g.fill(); }
  },
  larvae(g, b, t) {
    for (let i = 0; i < b.larva; i++) {
      const lx = b.x - 26 + i * 26 + Math.sin(t * 1.3 + i * 2) * 4, ly = b.y + b.h * TILE / 2 + 6 + Math.cos(t + i) * 2;
      g.save(); g.translate(lx, ly); g.rotate(Math.sin(t * 2 + i) * 0.4);
      g.fillStyle = '#8a6a78'; ell(g, 0, 0, 5, 3); g.fill();
      g.strokeStyle = '#4b3240'; g.lineWidth = 1; for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(k * 2.5, -3); g.lineTo(k * 2.5, 3); g.stroke(); }
      g.restore();
    }
    for (const e of b.eggs) {
      const pulse = 1 + Math.sin(t * 6 + e.x) * 0.06;
      g.fillStyle = 'rgba(0,0,0,.3)'; ell(g, e.x + 2, e.y + 3, 8, 5); g.fill();
      g.fillStyle = rgrad(g, e.x - 2, e.y - 3, 1, 10, '#c79a8f', '#6b4a52'); ell(g, e.x, e.y, 7 * pulse, 8.5 * pulse); g.fill();
      g.strokeStyle = 'rgba(70,30,45,.7)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(e.x - 5, e.y - 2); g.quadraticCurveTo(e.x, e.y - 7, e.x + 5, e.y - 1); g.moveTo(e.x - 4, e.y + 3); g.quadraticCurveTo(e.x, e.y + 0, e.x + 4, e.y + 4); g.stroke();
      const p = 1 - e.t / e.total;
      g.fillStyle = `rgba(255,190,120,${0.15 + p * 0.35})`; circ(g, e.x, e.y, 2 + p * 2); g.fill();
    }
  },

  // ───────── 바닥 자국 ─────────
  decal(g, d) {
    const a = Math.min(1, (d.life - d.t) / 6);
    g.save(); g.globalAlpha = a;
    if (d.kind === 'scorch') {
      g.fillStyle = rgrad(g, d.x, d.y, 2, d.r, 'rgba(10,8,6,.7)', 'rgba(10,8,6,0)'); circ(g, d.x, d.y, d.r); g.fill();
    } else if (d.kind === 'rubble') {
      g.fillStyle = rgrad(g, d.x, d.y, 4, d.r * 1.2, 'rgba(12,10,8,.75)', 'rgba(12,10,8,0)'); circ(g, d.x, d.y, d.r * 1.2); g.fill();
      for (let i = 0; i < 14; i++) {
        const h1 = hash2(i, 1, d.seed * 1e6), h2 = hash2(i, 2, d.seed * 1e6);
        g.fillStyle = i % 3 ? '#4d5258' : '#6e747a';
        g.fillRect(d.x + (h1 - 0.5) * d.r * 1.6, d.y + (h2 - 0.5) * d.r * 1.2, 4 + h1 * 7, 3 + h2 * 5);
      }
    } else {
      const col = d.kind === 'goo' ? 'rgba(110,150,40,.55)' : 'rgba(90,10,18,.6)';
      g.fillStyle = col;
      for (let i = 0; i < 7; i++) {
        const h1 = hash2(i, 3, d.seed * 1e6), h2 = hash2(i, 4, d.seed * 1e6);
        circ(g, d.x + (h1 - 0.5) * d.r * 1.6, d.y + (h2 - 0.5) * d.r * 1.3, d.r * (0.2 + h2 * 0.35)); g.fill();
      }
    }
    g.restore();
  },

  // ───────── 효과 ─────────
  effect(g, e) {
    if (e.t < 0) return;
    const p = e.t / e.life;
    switch (e.type) {
      case 'tracer':
        g.strokeStyle = `rgba(255,236,150,${0.9 * (1 - p)})`; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(e.x2, e.y2); g.stroke(); break;
      case 'shell':
        g.strokeStyle = `rgba(255,210,120,${1 - p})`; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(lerp(e.x, e.x2, p), lerp(e.y, e.y2, p)); g.lineTo(lerp(e.x, e.x2, Math.min(1, p + 0.4)), lerp(e.y, e.y2, Math.min(1, p + 0.4))); g.stroke(); break;
      case 'muzzle': {
        const s = e.big ? 2 : 1;
        g.save(); g.translate(e.x, e.y); g.rotate(e.a);
        g.fillStyle = `rgba(255,220,120,${1 - p})`;
        poly(g, [0, -3 * s, 9 * s, 0, 0, 3 * s, 2 * s, 0]); g.fill();
        g.fillStyle = `rgba(255,255,230,${1 - p})`; circ(g, 1, 0, 2.2 * s); g.fill();
        g.restore(); break;
      }
      case 'spark':
        g.fillStyle = `rgba(255,230,140,${1 - p})`;
        for (let i = 0; i < 4; i++) { const a = e.seed * 9 + i * 1.7; g.fillRect(e.x + Math.cos(a) * p * 9, e.y + Math.sin(a) * p * 9, 1.8, 1.8); }
        break;
      case 'weld': case 'mspark':
        g.fillStyle = e.type === 'weld' ? `rgba(200,235,255,${1 - p})` : `rgba(140,230,255,${1 - p})`;
        for (let i = 0; i < 5; i++) { const a = e.seed * 9 + i * 1.3; g.fillRect(e.x + Math.cos(a) * p * 8, e.y + Math.sin(a) * p * 8 + p * p * 6, 1.6, 1.6); }
        if (e.type === 'weld') { g.fillStyle = `rgba(255,255,255,${0.8 * (1 - p)})`; circ(g, e.x, e.y, 2.5 * (1 - p)); g.fill(); }
        break;
      case 'flame': {
        g.save(); g.translate(e.x, e.y); g.rotate(e.a);
        for (let i = 0; i < 14; i++) {
          const k = (i / 14 + p * 0.8) % 1, d = k * e.len, spread = k * 11;
          const yy = (hash2(i, 1, e.seed * 1e5) - 0.5) * 2 * spread;
          g.fillStyle = k < 0.35 ? `rgba(255,240,170,${0.9 * (1 - p)})` : k < 0.7 ? `rgba(255,150,40,${0.8 * (1 - p)})` : `rgba(200,60,20,${0.6 * (1 - p)})`;
          circ(g, d, yy, 3 + k * 6); g.fill();
        }
        g.restore(); break;
      }
      case 'boom': case 'bigboom': {
        const s = (e.s || 1) * (e.type === 'bigboom' ? 1.8 : 1);
        const r = (8 + p * 18) * s;
        g.fillStyle = `rgba(60,50,45,${0.5 * (1 - p)})`; circ(g, e.x + p * 4, e.y - p * 10 * s, r * 1.15); g.fill();
        if (p < 0.6) {
          const q = p / 0.6;
          g.fillStyle = `rgba(255,${Math.round(200 - q * 120)},60,${1 - q})`; circ(g, e.x, e.y, r * 0.9); g.fill();
          g.fillStyle = `rgba(255,250,210,${1 - q})`; circ(g, e.x, e.y, r * 0.45 * (1 - q)); g.fill();
        }
        if (e.type === 'bigboom') { g.strokeStyle = `rgba(255,220,160,${0.6 * (1 - p)})`; g.lineWidth = 2; circ(g, e.x, e.y, 10 + p * 46 * s * 0.6); g.stroke(); }
        break;
      }
      case 'splat': {
        const s = e.s || 1;
        g.fillStyle = e.c;
        g.globalAlpha = 1 - p;
        for (let i = 0; i < 7; i++) { const a = e.seed * 7 + i * 0.9; circ(g, e.x + Math.cos(a) * p * 14 * s, e.y + Math.sin(a) * p * 14 * s, (3 - p * 2) * s + 0.5); g.fill(); }
        g.globalAlpha = 1; break;
      }
      case 'slash': {
        g.strokeStyle = e.z ? `rgba(255,190,220,${1 - p})` : `rgba(255,255,255,${1 - p})`;
        g.lineWidth = e.big ? 3 : 1.6;
        const r = e.big ? 16 : 8;
        g.beginPath(); g.arc(e.x, e.y, r, e.a - 1.2 + p, e.a + 0.2 + p); g.stroke(); break;
      }
      case 'spike': {
        const up = p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7;
        g.fillStyle = 'rgba(60,40,30,.6)'; ell(g, e.x, e.y + 3, 10, 4); g.fill();
        g.fillStyle = '#c9b48f';
        poly(g, [e.x - 5, e.y + 3, e.x - 1, e.y + 3 - 26 * up, e.x + 2, e.y + 3 - 22 * up, e.x + 5, e.y + 3]); g.fill();
        g.fillStyle = '#6b4a5a'; ell(g, e.x, e.y + 3, 6, 3); g.fill();
        break;
      }
      case 'ping': {
        g.strokeStyle = e.c || '#7dff9a'; g.globalAlpha = 1 - p; g.lineWidth = 2;
        ell(g, e.x, e.y, 14 * (1 - p) + 3, 9 * (1 - p) + 2); g.stroke();
        g.globalAlpha = 1; break;
      }
    }
  },

  // ───────── 아이콘 (명령 버튼 · 초상화) ─────────
  icons: {},
  icon(name, size = 64) {
    const k = name + '@' + size;
    if (this.icons[k]) return this.icons[k];
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.scale(size / 64, size / 64);
    const [type, key] = name.split(':');
    if (type === 'u') {
      const def = UNITS[key], sc = Math.min(2.8, 22 / def.r);
      const team = def.race === 'Z' ? 1 : 0;
      g.translate(32, 33); g.scale(sc, sc); g.rotate(-0.75);
      const fake = { key, def, team, anim: 1.2, moving: false, facing: 0, turret: 0, sieged: false, siegeT: 0, siegeTo: false, r: def.r, carry: null, fireT: 0 };
      Sprites[key](g, fake, PAL[team]);
    } else if (type === 'b') {
      const def = BUILDINGS[key], sc = Math.min(56 / (def.w * TILE), 50 / (def.h * TILE));
      g.translate(32 - def.w * TILE * sc / 2, 32 - def.h * TILE * sc / 2); g.scale(sc, sc);
      BSprites[key](g, 0, 0, def.w * TILE, def.h * TILE, PAL[def.race === 'Z' ? 1 : 0], 1, { id: 1, key, built: true, loaded: [], fireT: 0, gasIn: 0 });
    } else if (type === 'r' && key === 'siege') {
      g.translate(32, 33); g.scale(1.45, 1.45); g.rotate(-0.75);
      Sprites.tank(g, { anim: 0, moving: false, facing: 0, turret: 0, sieged: true, siegeT: 0, siegeTo: true, r: 16, team: 0 }, PAL[0]);
    } else Glyphs[key](g);
    return (this.icons[k] = c.toDataURL());
  },
};
// 광물 결정 모양: [x 위치, 반폭, 높이, 기울기]
const MINERAL_SHAPES = [
  [[10, 6, 20, -1], [22, 7, 28, 0.3], [34, 6, 22, 0.6], [46, 7, 26, -0.4], [56, 5, 16, 0.8]],
  [[9, 5, 16, -0.8], [19, 7, 24, 0.2], [31, 8, 30, -0.2], [44, 6, 22, 0.5], [55, 6, 18, 1]],
  [[11, 7, 24, -0.4], [24, 6, 18, 0.7], [35, 7, 28, 0.1], [47, 6, 20, -0.6], [56, 5, 14, 0.4]],
];

// ───────────────────────── 유닛 모양 (오른쪽을 보는 위에서 본 모습) ─────────────────────────
function siegeAmt(u) {
  if (u.siegeT > 0) return u.siegeTo ? 1 - u.siegeT / 1.2 : u.siegeT / 1.2;
  return u.sieged ? 1 : 0;
}
const Sprites = {
  scv(g, u, P) {
    g.fillStyle = '#25282b';
    rrect(g, -9, -11, 13, 4.5, 2); g.fill(); rrect(g, -9, 6.5, 13, 4.5, 2); g.fill();
    g.fillStyle = vgrad(g, -7, 7, '#e0b24a', '#9c7420'); rrect(g, -10, -7, 16, 14, 4); g.fill();
    g.strokeStyle = '#5e4410'; g.lineWidth = 1.1; g.stroke();
    g.fillStyle = P.tc; g.fillRect(-10, -3, 3, 6);
    g.fillStyle = '#1b2731'; circ(g, 1, 0, 4.6); g.fill();
    g.fillStyle = 'rgba(150,215,255,.6)'; circ(g, 2.4, -1.5, 1.7); g.fill();
    const sw = u.working ? Math.sin(u.anim * 24) * 2.5 : 0;
    g.strokeStyle = '#7b8086'; g.lineWidth = 2.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(3, -6); g.lineTo(12 + sw, -6.5); g.moveTo(3, 6); g.lineTo(12 - sw, 6.5); g.stroke();
    g.lineCap = 'butt';
    g.fillStyle = '#d7dade'; g.fillRect(11 + sw, -8.5, 3, 4); g.fillRect(11 - sw, 4.5, 3, 4);
    if (u.carry) {
      if (u.carry.type === 'm') { g.fillStyle = '#7fdcff'; poly(g, [12, -3, 17, 0, 12, 3, 10, 0]); g.fill(); }
      else { g.fillStyle = '#5fcf58'; rrect(g, 9, -3, 7, 6, 2); g.fill(); }
    }
  },
  marine(g, u, P) {
    const st = u.moving ? Math.sin(u.anim * 15) * 3 : 0;
    g.fillStyle = '#1d232b'; ell(g, st, -3.6, 3.4, 2.2); g.fill(); ell(g, -st, 3.6, 3.4, 2.2); g.fill();
    g.fillStyle = '#38404a'; rrect(g, -9, -4, 4, 8, 1.5); g.fill();
    g.fillStyle = P.armor; ell(g, -1, 0, 5.8, 8); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = P.td; ell(g, -1.5, -6.6, 3.8, 2.6); g.fill(); ell(g, -1.5, 6.6, 3.8, 2.6); g.fill();
    g.fillStyle = '#16191d'; g.fillRect(0, 2.3, 13, 2.6); g.fillRect(3, 1.1, 4.5, 5);
    g.fillStyle = '#4a5260'; g.fillRect(10, 2.8, 3.5, 1.6);
    g.fillStyle = P.helm; circ(g, 1.5, 0, 4.1); g.fill();
    g.fillStyle = '#ffc23d'; ell(g, 4.1, 0, 1.5, 2.8); g.fill();
  },
  firebat(g, u, P) {
    const st = u.moving ? Math.sin(u.anim * 14) * 3 : 0;
    g.fillStyle = '#1d232b'; ell(g, st, -4, 3.8, 2.4); g.fill(); ell(g, -st, 4, 3.8, 2.4); g.fill();
    g.fillStyle = '#b24a2a'; circ(g, -8, -3.6, 3.3); g.fill(); circ(g, -8, 3.6, 3.3); g.fill();
    g.fillStyle = 'rgba(255,200,150,.5)'; circ(g, -8.8, -4.4, 1.1); g.fill(); circ(g, -8.8, 2.8, 1.1); g.fill();
    g.fillStyle = mixColor(P.tc, '#8e4a33', 0.65); ell(g, -1, 0, 7, 9.5); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = P.td; ell(g, -1.5, -8, 5, 3.2); g.fill(); ell(g, -1.5, 8, 5, 3.2); g.fill();
    g.fillStyle = '#2a2d31'; g.fillRect(2, -8, 9, 3.2); g.fillRect(2, 4.8, 9, 3.2);
    g.fillStyle = '#d07a2e'; g.fillRect(10, -8.4, 2.5, 4); g.fillRect(10, 4.4, 2.5, 4);
    g.fillStyle = '#b9603a'; circ(g, 2, 0, 4.6); g.fill();
    g.fillStyle = '#ffd36b'; g.fillRect(4.5, -2.5, 1.8, 5);
  },
  medic(g, u, P) {
    const st = u.moving ? Math.sin(u.anim * 15) * 3 : 0;
    g.fillStyle = '#2a2f36'; ell(g, st, -3.6, 3.4, 2.2); g.fill(); ell(g, -st, 3.6, 3.4, 2.2); g.fill();
    g.fillStyle = '#d9dde2'; rrect(g, -9.5, -4, 5, 8, 1.5); g.fill();
    g.fillStyle = '#d6303f'; g.fillRect(-8.5, -0.8, 3, 1.6); g.fillRect(-7.8, -2.2, 1.6, 4.4);
    g.fillStyle = '#eef1f4'; ell(g, -1, 0, 5.8, 7.8); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = P.tc; ell(g, -1.5, -6.4, 3.4, 2.3); g.fill(); ell(g, -1.5, 6.4, 3.4, 2.3); g.fill();
    g.fillStyle = '#c2c8cf'; g.fillRect(2, 3, 6, 3);
    g.fillStyle = '#f7f8fa'; circ(g, 1.5, 0, 4); g.fill();
    g.fillStyle = '#4fd0c8'; ell(g, 4, 0, 1.4, 2.6); g.fill();
  },
  tank(g, u, P) {
    const s = siegeAmt(u);
    if (s > 0) {
      g.strokeStyle = '#3b4046'; g.lineWidth = 3.5; g.fillStyle = '#2a2e32';
      for (const [lx, ly] of [[-11, -10], [11, -10], [-11, 10], [11, 10]]) {
        const ex = lx * (0.8 + 0.7 * s), ey = ly * (0.8 + 0.7 * s);
        g.beginPath(); g.moveTo(lx * 0.6, ly * 0.6); g.lineTo(ex, ey); g.stroke();
        circ(g, ex, ey, 3 * s + 0.5); g.fill();
      }
    }
    g.fillStyle = '#212528'; rrect(g, -17, -13, 34, 7, 3); g.fill(); rrect(g, -17, 6, 34, 7, 3); g.fill();
    g.strokeStyle = '#3f454a'; g.lineWidth = 1.2;
    const off = u.moving ? (u.anim * 30) % 4 : 0;
    for (let x = -16 + off; x < 16; x += 4) { g.beginPath(); g.moveTo(x, -13); g.lineTo(x, -6); g.moveTo(x, 6); g.lineTo(x, 13); g.stroke(); }
    g.fillStyle = vgrad(g, -8, 8, '#8c9680', '#5b6452'); rrect(g, -15, -8, 30, 16, 4); g.fill();
    g.strokeStyle = '#2d3229'; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = P.tc; g.fillRect(-14, -7, 3.5, 14);
    g.fillStyle = '#4e5746'; g.fillRect(9, -6.5, 5, 13);
    g.save();
    g.rotate(angDiff(u.facing, u.turret));
    const len = 15 + 11 * s, bw = 3 + 1.8 * s;
    g.fillStyle = '#2b2f33'; g.fillRect(3, -bw / 2, len, bw);
    g.fillStyle = '#1b1e21'; g.fillRect(3 + len - 3, -bw / 2 - 1, 3.5, bw + 2);
    g.fillStyle = vgrad(g, -8, 8, '#9aa58c', '#68725e'); circ(g, 0, 0, 7.5); g.fill();
    g.strokeStyle = '#2d3229'; g.stroke();
    g.fillStyle = '#4d5447'; circ(g, -2.5, -1.5, 2.4); g.fill();
    g.restore();
  },
  drone(g, u, P) {
    const w = Math.sin(u.anim * 30) * (u.moving ? 1.2 : 0.4);
    g.fillStyle = 'rgba(210,190,230,.35)';
    ell(g, -4, -7 - w, 6, 3, -0.4); g.fill(); ell(g, -4, 7 + w, 6, 3, 0.4); g.fill();
    g.fillStyle = vgrad(g, -7, 7, '#87667a', '#4f3846'); ell(g, -1, 0, 9, 7); g.fill();
    g.strokeStyle = '#2e1f28'; g.lineWidth = 1.1; g.stroke();
    g.strokeStyle = 'rgba(40,24,34,.8)';
    for (const x of [-5, -1.5, 2]) { g.beginPath(); g.arc(x - 6, 0, 7, -0.7, 0.7); g.stroke(); }
    g.fillStyle = P.tc; circ(g, -5, -3, 1.3); g.fill(); circ(g, -5, 3, 1.3); g.fill();
    g.fillStyle = '#56404c'; ell(g, 7, 0, 4.5, 4); g.fill();
    const c = u.working ? Math.sin(u.anim * 20) * 1.5 : 0;
    g.strokeStyle = '#dccaa6'; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(9, -3); g.quadraticCurveTo(13, -5 - c, 15, -1); g.moveTo(9, 3); g.quadraticCurveTo(13, 5 + c, 15, 1); g.stroke();
    if (u.carry) {
      if (u.carry.type === 'm') { g.fillStyle = '#7fdcff'; poly(g, [13, -2.5, 18, 0, 13, 2.5, 11, 0]); g.fill(); }
      else { g.fillStyle = '#5fcf58'; circ(g, 14, 0, 3); g.fill(); }
    }
  },
  zergling(g, u, P) {
    const st = u.moving ? Math.sin(u.anim * 28) * 2.6 : 0;
    g.strokeStyle = '#3a2533'; g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(2, -2); g.lineTo(4 + st, -6.5); g.moveTo(2, 2); g.lineTo(4 - st, 6.5);
    g.moveTo(-3, -2); g.lineTo(-5 - st, -6.5); g.moveTo(-3, 2); g.lineTo(-5 + st, 6.5);
    g.stroke();
    g.fillStyle = '#7d4f69'; poly(g, [-3, -1, -10, -5, -7, 0, -10, 5, -3, 1]); g.fill();
    g.fillStyle = vgrad(g, -4, 4, '#7a4a66', '#45283a'); ell(g, -1, 0, 6.5, 4.2); g.fill();
    g.strokeStyle = '#2a1622'; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#4a2c3e'; ell(g, 5, 0, 3.4, 3); g.fill();
    const sw = u.fireT > 0 ? 3 : 0;
    g.strokeStyle = '#eadfc4'; g.lineWidth = 1.7;
    g.beginPath(); g.moveTo(3, -3); g.quadraticCurveTo(9, -8 + sw, 11 + sw, -3); g.moveTo(3, 3); g.quadraticCurveTo(9, 8 - sw, 11 + sw, 3); g.stroke();
    g.fillStyle = P.tc; circ(g, 6.5, -1.4, 0.9); g.fill(); circ(g, 6.5, 1.4, 0.9); g.fill();
  },
  hydralisk(g, u, P) {
    const wig = Math.sin(u.anim * 8) * (u.moving ? 2.2 : 0.6);
    for (let i = 3; i >= 0; i--) { g.fillStyle = i % 2 ? '#5a3d4e' : '#4e3443'; circ(g, -5 - i * 3.4, wig * (i / 3), 4.6 - i * 0.9); g.fill(); }
    g.fillStyle = vgrad(g, -6, 6, '#86607a', '#553a4b'); ell(g, 1, 0, 6, 5.6); g.fill();
    g.strokeStyle = '#2c1a25'; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#93617a';
    g.beginPath(); g.moveTo(5, -3); g.quadraticCurveTo(-1, -12, -4, -9); g.quadraticCurveTo(0, -5, 2, 0); g.quadraticCurveTo(0, 5, -4, 9); g.quadraticCurveTo(-1, 12, 5, 3); g.closePath(); g.fill();
    g.strokeStyle = '#e8dbbd'; g.lineWidth = 1;
    for (const k of [-1, 1]) for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-1 - i * 1.4, k * (7 + i)); g.lineTo(-3 - i * 1.6, k * (10 + i)); g.stroke(); }
    g.fillStyle = P.tc; circ(g, -2.5, -7, 1); g.fill(); circ(g, -2.5, 7, 1); g.fill();
    g.fillStyle = '#4b3140'; ell(g, 6.5, 0, 3.6, 3); g.fill();
    g.fillStyle = '#d0647f'; g.fillRect(8.5, -1, 2, 2);
  },
  ultralisk(g, u, P) {
    const st = u.moving ? Math.sin(u.anim * 9) * 4 : 0;
    g.fillStyle = '#3d2e2a';
    for (const [lx, ly, k] of [[8, -11, 1], [8, 11, -1], [-8, -12, -1], [-8, 12, 1]]) { ell(g, lx + st * k, ly, 5, 3.5); g.fill(); }
    g.fillStyle = vgrad(g, -13, 13, '#a68e7c', '#5d4b40'); ell(g, -3, 0, 15, 12.5); g.fill();
    g.strokeStyle = '#2d221d'; g.lineWidth = 1.4; g.stroke();
    g.strokeStyle = 'rgba(45,32,27,.8)'; g.lineWidth = 1.6;
    for (const x of [-12, -6, 0]) { g.beginPath(); g.arc(x - 8, 0, 12, -0.85, 0.85); g.stroke(); }
    g.fillStyle = P.tc; for (const [x, y] of [[-9, -5], [-9, 5], [-3, -7], [-3, 7]]) { circ(g, x, y, 1.4); g.fill(); }
    g.fillStyle = '#6f5a50'; ell(g, 11, 0, 7, 6.5); g.fill();
    g.strokeStyle = '#2d221d'; g.lineWidth = 1; g.stroke();
    const sw = u.fireT > 0 ? 3 : 0;
    g.fillStyle = '#efe5cc'; g.strokeStyle = '#8c7f63'; g.lineWidth = 1;
    for (const k of [-1, 1]) {
      g.beginPath(); g.moveTo(8, k * 6); g.quadraticCurveTo(20 + sw, k * (19 - sw), 30 + sw, k * (7 - sw)); g.quadraticCurveTo(20, k * 12, 12, k * 3); g.closePath(); g.fill(); g.stroke();
    }
    g.fillStyle = '#ffcf5a'; circ(g, 15, -2.5, 1.1); g.fill(); circ(g, 15, 2.5, 1.1); g.fill();
  },
  overlord(g, u, P) {
    g.strokeStyle = '#5a4250'; g.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const y = -8 + i * 4, wv = Math.sin(u.anim * 2 + i) * 3;
      g.beginPath(); g.moveTo(-10, y); g.quadraticCurveTo(-18, y + wv, -26, y - wv); g.stroke();
    }
    g.fillStyle = vgrad(g, -15, 15, '#a1846f', '#5b4637'); ell(g, 0, 0, 18, 15); g.fill();
    g.strokeStyle = '#33261d'; g.lineWidth = 1.4; g.stroke();
    g.strokeStyle = 'rgba(50,36,28,.8)'; g.lineWidth = 1.5;
    for (const x of [-9, -3]) { g.beginPath(); g.arc(x - 10, 0, 15, -0.75, 0.75); g.stroke(); }
    g.fillStyle = '#c0a28a'; ell(g, 10, 0, 6, 9); g.fill();
    g.fillStyle = '#7c5d4a'; for (const y of [-6, 0, 6]) { ell(g, 14, y, 2.5, 2); g.fill(); }
    g.fillStyle = P.tc; circ(g, -4, -9, 1.6); g.fill(); circ(g, -4, 9, 1.6); g.fill();
  },
};

// ───────────────────────── 건물 모양 ─────────────────────────
function plate(g, x, y, w, h, r, c0, c1, line = '#25292d') {
  g.fillStyle = vgrad(g, y, y + h, c0, c1); rrect(g, x, y, w, h, r); g.fill();
  g.strokeStyle = line; g.lineWidth = 1.5; g.stroke();
}
function rivets(g, x, y, w, h) {
  g.fillStyle = 'rgba(20,22,24,.55)';
  for (const [px, py] of [[x + 4, y + 4], [x + w - 4, y + 4], [x + 4, y + h - 4], [x + w - 4, y + h - 4]]) { circ(g, px, py, 1.3); g.fill(); }
}
function lamp(g, x, y, t, seed, col = '#ffb347') {
  const on = Math.sin(t * 3 + seed) > -0.2;
  g.fillStyle = on ? col : '#5a4a30'; circ(g, x, y, 2); g.fill();
  if (on) { g.fillStyle = rgba(col.length === 7 ? col : '#ffb347', 0.25); circ(g, x, y, 5); g.fill(); }
}
function flesh(g, cx, cy, rx, ry, c0, c1) {
  g.fillStyle = rgrad(g, cx - rx * 0.3, cy - ry * 0.35, rx * 0.1, Math.max(rx, ry), c0, c1);
  ell(g, cx, cy, rx, ry); g.fill();
  g.strokeStyle = 'rgba(25,8,20,.7)'; g.lineWidth = 1.6; g.stroke();
}
function spikes(g, cx, cy, rx, ry, n, len, seed) {
  g.fillStyle = '#dccbaa'; g.strokeStyle = '#7d6b4d'; g.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + seed, ca = Math.cos(a), sa = Math.sin(a);
    const bx = cx + ca * rx * 0.92, by = cy + sa * ry * 0.92, l = len * (0.7 + hash2(i, 9, seed * 100) * 0.6);
    poly(g, [bx - sa * 3, by + ca * 3, bx + ca * l, by + sa * l * 0.8 - 3, bx + sa * 3, by - ca * 3]);
    g.fill(); g.stroke();
  }
}
const BSprites = {
  cc(g, x, y, w, h, P, t, b) {
    g.fillStyle = '#3d4247';
    for (const [lx, ly] of [[x + 3, y + 5], [x + w - 19, y + 5], [x + 3, y + h - 21], [x + w - 19, y + h - 21]]) { rrect(g, lx, ly, 16, 16, 3); g.fill(); }
    const ix = x + 9, iy = y + 7, iw = w - 18, ih = h - 16, c = 16;
    g.fillStyle = vgrad(g, iy, iy + ih, '#a3aab1', '#5c6369');
    poly(g, [ix + c, iy, ix + iw - c, iy, ix + iw, iy + c, ix + iw, iy + ih - c, ix + iw - c, iy + ih, ix + c, iy + ih, ix, iy + ih - c, ix, iy + c]); g.fill();
    g.strokeStyle = '#2b2f33'; g.lineWidth = 1.6; g.stroke();
    g.fillStyle = '#474d53'; g.fillRect(ix + 14, iy + ih - 13, iw - 28, 13);
    g.fillStyle = '#181b1e'; rrect(g, x + w / 2 - 13, iy + ih - 13, 26, 13, 2); g.fill();
    lamp(g, x + w / 2 - 17, iy + ih - 6, t, 1); lamp(g, x + w / 2 + 17, iy + ih - 6, t, 2);
    g.fillStyle = P.tc; g.fillRect(ix + 4, y + h / 2 - 6, 11, 7); g.fillRect(ix + iw - 15, y + h / 2 - 6, 11, 7);
    const cx = x + w / 2, cy = y + h / 2 - 7;
    g.fillStyle = vgrad(g, cy - 22, cy + 22, '#8d959d', '#545b62'); circ(g, cx, cy, 22); g.fill();
    g.strokeStyle = '#2b2f33'; g.stroke();
    g.fillStyle = '#5b636b'; circ(g, cx, cy, 15); g.fill();
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU + t * 0.15;
      g.fillStyle = i % 3 ? '#ffcf7a' : '#2b3036';
      g.fillRect(cx + Math.cos(a) * 18.5 - 1.5, cy + Math.sin(a) * 18.5 - 1.5, 3, 3);
    }
    g.fillStyle = rgrad(g, cx - 3, cy - 3, 1, 9, '#5d7d96', '#1f2c37'); circ(g, cx, cy, 8.5); g.fill();
    g.strokeStyle = '#d0d5da'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(ix + 22, iy + 16); g.lineTo(ix + 12, iy + 3); g.stroke();
    g.fillStyle = '#c7cdd2'; ell(g, ix + 11, iy + 3, 5, 2.5, -0.6); g.fill();
    lamp(g, ix + iw - 14, iy + 10, t * 2, 3, '#ff5a4f');
  },
  depot(g, x, y, w, h, P, t) {
    plate(g, x + 6, y + 6, w - 12, h - 12, 5, '#99a0a7', '#5d646a');
    g.fillStyle = '#41474d'; g.fillRect(x + 10, y + h - 16, w - 20, 9);
    g.fillStyle = '#2e3337';
    for (let i = 0; i < 5; i++) g.fillRect(x + 20 + i * 12, y + 14, 7, 16);
    g.fillStyle = P.tc; g.fillRect(x + 10, y + 10, w - 20, 3);
    rivets(g, x + 6, y + 6, w - 12, h - 12);
    lamp(g, x + w - 14, y + h - 12, t, 4, '#7dff9a');
  },
  refinery(g, x, y, w, h, P, t, b) {
    plate(g, x + 4, y + 8, w - 8, h - 12, 4, '#7d848a', '#4a5056');
    for (const cx of [x + 26, x + w - 26]) {
      g.fillStyle = rgrad(g, cx - 5, y + 24, 2, 17, '#c3c9ce', '#5e656b'); circ(g, cx, y + 28, 15); g.fill();
      g.strokeStyle = '#2b2f33'; g.lineWidth = 1.4; g.stroke();
      g.fillStyle = P.tc; g.fillRect(cx - 9, y + 26, 18, 3);
    }
    g.fillStyle = '#353a3f'; g.fillRect(x + 38, y + 22, w - 76, 10);
    g.fillStyle = '#2b3034'; rrect(g, x + w / 2 - 6, y + 2, 12, 18, 3); g.fill();
    if (b && b.gasIn) for (let i = 0; i < 2; i++) {
      const p = (t * 0.8 + i * 0.5) % 1;
      g.fillStyle = `rgba(160,235,150,${0.35 * (1 - p)})`; circ(g, x + w / 2 + p * 6, y + 2 - p * 22, 4 + p * 8); g.fill();
    }
  },
  barracks(g, x, y, w, h, P, t) {
    plate(g, x + 6, y + 8, w - 12, h - 16, 6, '#a0a7ae', '#5a6167');
    g.fillStyle = '#6b7279'; g.fillRect(x + 12, y + 14, w - 24, 22);
    g.strokeStyle = '#3c4247'; g.lineWidth = 1;
    for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(x + 16 + i * 13, y + 14); g.lineTo(x + 16 + i * 13, y + 36); g.stroke(); }
    g.fillStyle = P.tc; g.fillRect(x + 12, y + 38, w - 24, 5);
    g.fillStyle = '#26292c'; g.fillRect(x + w / 2 - 22, y + h - 34, 44, 26);
    g.fillStyle = '#e0b030';
    for (let i = 0; i < 6; i++) poly(g, [x + w / 2 - 22 + i * 8, y + h - 34, x + w / 2 - 18 + i * 8, y + h - 34, x + w / 2 - 22 + i * 8 + 8, y + h - 30, x + w / 2 - 22 + i * 8 + 4, y + h - 30]), g.fill();
    g.strokeStyle = '#c8ced3'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x + 16, y + h - 12); g.lineTo(x + 16, y + h - 44); g.stroke();
    const wv = Math.sin(t * 4) * 2;
    g.fillStyle = P.tc; poly(g, [x + 16, y + h - 44, x + 30, y + h - 41 + wv, x + 16, y + h - 37]); g.fill();
    lamp(g, x + w - 18, y + h - 14, t, 5);
  },
  ebay(g, x, y, w, h, P, t) {
    plate(g, x + 6, y + 8, w - 12, h - 16, 6, '#959ca3', '#545a60');
    const cx = x + w / 2 + 14, cy = y + h / 2 - 2;
    g.fillStyle = '#2a2e32'; circ(g, cx, cy, 25); g.fill();
    g.save(); g.translate(cx, cy); g.rotate(t * 2.5);
    g.fillStyle = '#8b939a';
    for (let i = 0; i < 6; i++) { g.rotate(TAU / 6); poly(g, [0, -3, 21, -6, 21, 6, 0, 3]); g.fill(); }
    g.restore();
    g.fillStyle = '#c7cdd2'; circ(g, cx, cy, 5); g.fill();
    g.fillStyle = '#3c4247'; g.fillRect(x + 14, y + 16, 24, h - 36);
    g.fillStyle = P.tc; g.fillRect(x + 14, y + 16, 24, 4);
    g.strokeStyle = '#d5a33a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x + 26, y + 20); g.lineTo(x + 26, y + 6); g.lineTo(x + 46, y + 6); g.stroke();
    lamp(g, x + 20, y + h - 16, t, 6);
  },
  bunker(g, x, y, w, h, P, t, b) {
    g.fillStyle = vgrad(g, y + 4, y + h - 2, '#8f8b7e', '#57544b'); rrect(g, x + 4, y + 4, w - 8, h - 6, 18); g.fill();
    g.strokeStyle = '#2a2824'; g.lineWidth = 1.6; g.stroke();
    g.fillStyle = '#6b685e'; rrect(g, x + 14, y + 10, w - 28, h - 24, 12); g.fill();
    g.fillStyle = '#141414';
    g.fillRect(x + 12, y + h - 16, 18, 4); g.fillRect(x + w / 2 - 9, y + h - 15, 18, 4); g.fillRect(x + w - 30, y + h - 16, 18, 4);
    g.fillStyle = P.tc; g.fillRect(x + w / 2 - 14, y + 14, 28, 3);
    if (b && b.loaded) for (let i = 0; i < 4; i++) { g.fillStyle = i < b.loaded.length ? '#7dff9a' : '#3a3a36'; circ(g, x + w / 2 - 12 + i * 8, y + h / 2, 2); g.fill(); }
    if (b && b.fireT > 0) { g.fillStyle = 'rgba(255,220,120,.9)'; circ(g, x + w / 2 + randf(-24, 24), y + h - 14, 3); g.fill(); }
  },
  academy(g, x, y, w, h, P, t) {
    plate(g, x + 6, y + 8, w - 12, h - 14, 5, '#a7adb3', '#61676d');
    g.fillStyle = '#4a5056'; g.fillRect(x + 10, y + h - 18, w - 20, 10);
    g.fillStyle = '#ffcf7a'; for (let i = 0; i < 6; i++) g.fillRect(x + 14 + i * 11, y + h - 15, 6, 4);
    g.save(); g.translate(x + w - 24, y + 20); g.rotate(Math.sin(t * 0.6) * 0.5);
    g.fillStyle = '#d4d9dd'; ell(g, 0, 0, 12, 6); g.fill(); g.strokeStyle = '#555c62'; g.stroke();
    g.fillStyle = '#555c62'; circ(g, 0, 0, 2); g.fill();
    g.restore();
    g.fillStyle = P.tc; poly(g, [x + 26, y + 14, x + 34, y + 22, x + 26, y + 30, x + 18, y + 22]); g.fill();
  },
  factory(g, x, y, w, h, P, t) {
    plate(g, x + 6, y + 8, w - 12, h - 16, 6, '#9aa199', '#555c55');
    g.fillStyle = '#2d3135'; g.fillRect(x + 16, y + h - 40, 54, 32);
    g.strokeStyle = '#4a5055'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(x + 16, y + h - 36 + i * 5); g.lineTo(x + 70, y + h - 36 + i * 5); g.stroke(); }
    g.fillStyle = P.tc; g.fillRect(x + 16, y + h - 44, 54, 4);
    for (const sx of [x + w - 38, x + w - 22]) {
      g.fillStyle = '#3a3f44'; rrect(g, sx - 6, y + 12, 12, 30, 2); g.fill();
      g.fillStyle = '#1f2225'; circ(g, sx, y + 14, 4.5); g.fill();
      const p = (t * 0.6 + sx * 0.01) % 1;
      g.fillStyle = `rgba(70,70,70,${0.45 * (1 - p)})`; circ(g, sx + p * 6, y + 10 - p * 24, 5 + p * 9); g.fill();
    }
    g.fillStyle = '#e0b030'; g.fillRect(x + 78, y + h - 18, 30, 4);
    lamp(g, x + 22, y + 18, t, 7);
  },
  hatchery(g, x, y, w, h, P, t) {
    const cx = x + w / 2, cy = y + h / 2 + 2;
    spikes(g, cx, cy, w * 0.47, h * 0.45, 11, 15, 0.3);
    flesh(g, cx, cy, w * 0.48, h * 0.44, '#8c6176', '#3b2333');
    g.strokeStyle = 'rgba(40,14,32,.75)'; g.lineWidth = 2;
    for (let i = 0; i < 3; i++) { ell(g, cx, cy + 2, w * (0.18 + i * 0.09), h * (0.14 + i * 0.08)); g.stroke(); }
    const pulse = 0.6 + Math.sin(t * 2.5) * 0.25;
    g.fillStyle = '#1a0d14'; ell(g, cx, cy, 20, 13); g.fill();
    g.fillStyle = `rgba(214,74,120,${pulse})`; ell(g, cx, cy + 1, 12, 7); g.fill();
    g.fillStyle = P.tc; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.5; circ(g, cx + Math.cos(a) * w * 0.33, cy + Math.sin(a) * h * 0.3, 2.4); g.fill(); }
  },
  pool(g, x, y, w, h, P, t) {
    const cx = x + w / 2, cy = y + h / 2;
    flesh(g, cx, cy, w * 0.48, h * 0.45, '#8a5d6f', '#41263a');
    g.fillStyle = vgrad(g, cy - 14, cy + 14, '#c3dc58', '#6f8f22'); ell(g, cx, cy + 1, w * 0.34, h * 0.29); g.fill();
    for (let i = 0; i < 4; i++) {
      const p = (t * 0.7 + i * 0.27) % 1;
      g.strokeStyle = `rgba(240,255,170,${0.7 * (1 - p)})`; g.lineWidth = 1.2;
      circ(g, cx - 18 + i * 12, cy + Math.sin(i * 3) * 6, 1 + p * 5); g.stroke();
    }
    g.fillStyle = P.tc; circ(g, x + 10, cy, 2.2); g.fill(); circ(g, x + w - 10, cy, 2.2); g.fill();
  },
  extractor(g, x, y, w, h, P, t) {
    const cx = x + w / 2, cy = y + h / 2 + 2, pulse = 1 + Math.sin(t * 3) * 0.05;
    flesh(g, cx, cy + 4, w * 0.47, h * 0.36, '#7a5a52', '#3a2724');
    flesh(g, cx, cy - 3, w * 0.28 * pulse, h * 0.36 * pulse, '#a77a88', '#56324a');
    g.fillStyle = '#2a1520'; ell(g, cx, cy - 12, 7, 4); g.fill();
    const p = (t * 0.7) % 1;
    g.fillStyle = `rgba(150,235,140,${0.3 * (1 - p)})`; circ(g, cx, cy - 14 - p * 20, 4 + p * 8); g.fill();
    g.fillStyle = P.tc; circ(g, cx - 18, cy + 8, 2); g.fill(); circ(g, cx + 18, cy + 8, 2); g.fill();
  },
  hydraden(g, x, y, w, h, P, t) {
    const cx = x + w / 2, cy = y + h / 2;
    spikes(g, cx, cy, w * 0.45, h * 0.42, 9, 11, 1.1);
    flesh(g, cx, cy, w * 0.46, h * 0.42, '#91627b', '#43263a');
    g.fillStyle = '#170a12'; ell(g, cx + 6, cy + 4, 13, 8); g.fill();
    g.fillStyle = 'rgba(200,90,130,.35)'; ell(g, cx + 6, cy + 5, 7, 4); g.fill();
    g.fillStyle = P.tc; circ(g, cx - 18, cy - 4, 2.2); g.fill();
  },
  ultracavern(g, x, y, w, h, P, t) {
    const cx = x + w / 2, cy = y + h / 2;
    flesh(g, cx, cy, w * 0.47, h * 0.44, '#8a6e66', '#3d2a26');
    g.strokeStyle = '#e6dcc2'; g.lineWidth = 4;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(cx - 18 + i * 18, cy + 8, 13, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); }
    g.fillStyle = '#1a0d10'; ell(g, cx, cy + 8, 14, 6); g.fill();
    g.fillStyle = P.tc; circ(g, cx + 26, cy - 8, 2.2); g.fill();
  },
  sunken(g, x, y, w, h, P, t, b) {
    const cx = x + w / 2, cy = y + h / 2;
    spikes(g, cx, cy, w * 0.42, h * 0.42, 8, 9, 0.7);
    flesh(g, cx, cy, w * 0.44, h * 0.42, '#9a6a7e', '#45273a');
    g.fillStyle = '#1a0a12'; circ(g, cx, cy, 10); g.fill();
    g.fillStyle = '#e8dcc0';
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; poly(g, [cx + Math.cos(a) * 10, cy + Math.sin(a) * 10, cx + Math.cos(a + 0.2) * 5, cy + Math.sin(a + 0.2) * 5, cx + Math.cos(a + 0.4) * 10, cy + Math.sin(a + 0.4) * 10]); g.fill(); }
    if (b && b.fireT > 0) { g.fillStyle = '#c9b48f'; circ(g, cx, cy, 5); g.fill(); }
    g.fillStyle = P.tc; circ(g, cx, cy - 18, 2); g.fill();
  },
};

// ───────────────────────── 명령 아이콘 ─────────────────────────
const GL = '#ffd27a', GD = '#8a6a2c';
const Glyphs = {
  move(g) { g.fillStyle = GL; poly(g, [14, 30, 40, 30, 40, 20, 54, 32, 40, 44, 40, 34, 14, 34]); g.fill(); g.fillStyle = GD; circ(g, 14, 32, 5); g.fill(); },
  stop(g) { g.fillStyle = GL; rrect(g, 18, 18, 28, 28, 4); g.fill(); g.fillStyle = '#3a2a10'; rrect(g, 25, 25, 14, 14, 2); g.fill(); },
  attack(g) {
    g.strokeStyle = GL; g.lineWidth = 4; circ(g, 32, 32, 15); g.stroke();
    g.beginPath(); g.moveTo(32, 9); g.lineTo(32, 22); g.moveTo(32, 42); g.lineTo(32, 55); g.moveTo(9, 32); g.lineTo(22, 32); g.moveTo(42, 32); g.lineTo(55, 32); g.stroke();
    g.fillStyle = '#ff6a50'; circ(g, 32, 32, 4); g.fill();
  },
  patrol(g) {
    g.strokeStyle = GL; g.lineWidth = 4;
    g.beginPath(); g.arc(32, 32, 16, 0.3, Math.PI - 0.3); g.stroke(); g.beginPath(); g.arc(32, 32, 16, Math.PI + 0.3, TAU - 0.3); g.stroke();
    g.fillStyle = GL; poly(g, [12, 30, 20, 38, 22, 26]); g.fill(); poly(g, [52, 34, 44, 26, 42, 38]); g.fill();
  },
  hold(g) { g.fillStyle = GL; poly(g, [32, 12, 50, 18, 48, 36, 32, 52, 16, 36, 14, 18]); g.fill(); g.fillStyle = GD; poly(g, [32, 20, 42, 24, 41, 35, 32, 44, 23, 35, 22, 24]); g.fill(); },
  gather(g) {
    g.fillStyle = '#7fdcff'; poly(g, [22, 52, 20, 30, 28, 14, 36, 30, 34, 52]); g.fill();
    g.fillStyle = '#2b7fc0'; poly(g, [34, 52, 36, 34, 44, 22, 50, 36, 46, 52]); g.fill();
    g.strokeStyle = GL; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 14); g.lineTo(28, 28); g.stroke();
  },
  ret(g) { g.fillStyle = GL; poly(g, [14, 34, 32, 16, 50, 34, 44, 34, 44, 50, 20, 50, 20, 34]); g.fill(); g.fillStyle = '#7fdcff'; poly(g, [28, 46, 32, 36, 36, 46]); g.fill(); },
  repair(g) {
    g.save(); g.translate(32, 32); g.rotate(-0.8);
    g.fillStyle = GL; rrect(g, -4, -6, 8, 30, 3); g.fill();
    g.beginPath(); g.arc(0, -14, 11, 0, TAU); g.fill();
    g.fillStyle = '#2a2014'; rrect(g, -4, -28, 8, 14, 1); g.fill();
    g.restore();
  },
  build(g) {
    g.fillStyle = GL; rrect(g, 12, 30, 40, 22, 3); g.fill();
    g.fillStyle = GD; g.fillRect(16, 36, 8, 16); g.fillRect(28, 36, 20, 8);
    g.fillStyle = GL; poly(g, [10, 30, 32, 12, 54, 30]); g.fill();
  },
  back(g) { g.fillStyle = GL; poly(g, [12, 32, 30, 14, 30, 24, 52, 24, 52, 40, 30, 40, 30, 50]); g.fill(); },
  cancel(g) { g.strokeStyle = '#ff6a50'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(18, 18); g.lineTo(46, 46); g.moveTo(46, 18); g.lineTo(18, 46); g.stroke(); },
  rally(g) { g.strokeStyle = '#c8ced3'; g.lineWidth = 3; g.beginPath(); g.moveTo(20, 54); g.lineTo(20, 10); g.stroke(); g.fillStyle = GL; poly(g, [20, 10, 50, 18, 20, 28]); g.fill(); },
  stim(g) {
    g.save(); g.translate(32, 32); g.rotate(-0.8);
    g.fillStyle = '#d9e1e8'; rrect(g, -6, -20, 12, 30, 3); g.fill();
    g.fillStyle = '#e0303f'; g.fillRect(-4, -8, 8, 16);
    g.fillStyle = '#9aa4ad'; g.fillRect(-1.5, 10, 3, 12); g.fillRect(-8, -24, 16, 4);
    g.restore();
  },
  unsiege(g) {
    g.save(); g.translate(32, 33); g.scale(1.45, 1.45); g.rotate(-0.75);
    Sprites.tank(g, { anim: 0, moving: false, facing: 0, turret: 0, sieged: false, siegeT: 0, r: 16, team: 0 }, PAL[0]);
    g.restore();
  },
  unload(g) {
    g.fillStyle = GL;
    poly(g, [32, 10, 44, 24, 36, 24, 36, 34, 28, 34, 28, 24, 20, 24]); g.fill();
    poly(g, [32, 54, 20, 40, 28, 40, 28, 36, 36, 36, 36, 40, 44, 40]); g.fill();
  },
  u238(g) { g.fillStyle = '#c99a2e'; rrect(g, 24, 24, 16, 30, 3); g.fill(); g.fillStyle = '#e8c35a'; poly(g, [24, 24, 32, 8, 40, 24]); g.fill(); g.fillStyle = '#5fcf58'; circ(g, 32, 40, 4); g.fill(); },
  infW(g) { g.fillStyle = '#2b2f33'; g.fillRect(10, 34, 40, 7); g.fillRect(20, 30, 10, 16); g.fillStyle = GL; poly(g, [46, 26, 54, 14, 62, 26]); g.fill(); g.fillRect(52, 26, 4, 12); },
  infA(g) { g.fillStyle = '#8fa3b8'; poly(g, [32, 10, 50, 18, 46, 42, 32, 54, 18, 42, 14, 18]); g.fill(); g.fillStyle = GL; poly(g, [48, 30, 56, 18, 64, 30]); g.fill(); },
};
