'use strict';
// ───────────────────────── 화면 (카메라 · 그리기) ─────────────────────────
const View = {
  canvas: null, ctx: null, cw: 0, ch: 0, dpr: 1,
  init() {
    this.canvas = document.getElementById('view');
    this.ctx = this.canvas.getContext('2d');
    window.addEventListener('resize', () => this.resize());
    this.resize();
  },
  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.cw = Math.max(100, Math.floor(r.width)); this.ch = Math.max(100, Math.floor(r.height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.cw * this.dpr); this.canvas.height = Math.round(this.ch * this.dpr);
    this.canvas.style.width = this.cw + 'px'; this.canvas.style.height = this.ch + 'px';
    this.clampCam();
  },
  get vw() { return this.cw / G.cam.zoom; },
  get vh() { return this.ch / G.cam.zoom; },
  clampCam() {
    const c = G.cam;
    c.x = this.vw >= WORLD_W ? (WORLD_W - this.vw) / 2 : clamp(c.x, 0, WORLD_W - this.vw);
    c.y = this.vh >= WORLD_H ? (WORLD_H - this.vh) / 2 : clamp(c.y, 0, WORLD_H - this.vh);
  },
  centerOn(x, y) { G.cam.x = x - this.vw / 2; G.cam.y = y - this.vh / 2; this.clampCam(); },
  setZoom(z, sx, sy) {
    const c = G.cam, before = this.toWorld(sx, sy);
    c.zoom = clamp(z, 0.5, 1.6);
    c.x = before.x - sx / c.zoom; c.y = before.y - sy / c.zoom;
    this.clampCam();
  },
  toWorld(sx, sy) { return { x: G.cam.x + sx / G.cam.zoom, y: G.cam.y + sy / G.cam.zoom }; },
  inView(x, y, m = 0) { const c = G.cam; return x >= c.x - m && y >= c.y - m && x <= c.x + this.vw + m && y <= c.y + this.vh + m; },

  draw(t) {
    const g = this.ctx, c = G.cam, z = c.zoom * this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#07090c'; g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    g.setTransform(z, 0, 0, z, -c.x * z, -c.y * z);
    g.imageSmoothingEnabled = true;
    const vx0 = c.x, vy0 = c.y, vx1 = c.x + this.vw, vy1 = c.y + this.vh;
    // 지형
    for (let cy = Math.max(0, Math.floor(vy0 / CHUNK_PX)); cy <= Math.min(MAP_H / CHUNK - 1, Math.floor(vy1 / CHUNK_PX)); cy++) {
      for (let cx = Math.max(0, Math.floor(vx0 / CHUNK_PX)); cx <= Math.min(MAP_W / CHUNK - 1, Math.floor(vx1 / CHUNK_PX)); cx++) {
        g.drawImage(Art.chunk(cx, cy), cx * CHUNK_PX, cy * CHUNK_PX, CHUNK_PX + 0.5, CHUNK_PX + 0.5);
      }
    }
    const vis = (x, y, m) => x > vx0 - m && x < vx1 + m && y > vy0 - m && y < vy1 + m;
    for (const d of G.decals) if (vis(d.x, d.y, d.r + 20) && World.explored[tIdx(clamp(Math.floor(d.x / TILE), 0, MAP_W - 1), clamp(Math.floor(d.y / TILE), 0, MAP_H - 1))]) Art.decal(g, d);
    // 자원
    for (const r of G.resources) {
      if (r.dead || !vis(r.x, r.y, 80) || !rectExplored(r)) continue;
      if (r.kind === 'mineral') Art.mineral(g, r, t);
      else if (!r.refinery) Art.geyser(g, r, t);
    }
    // 선택 표시 (바닥)
    const selSet = new Set(G.selection);
    for (const e of G.selection) {
      if (e.dead || e.hidden) continue;
      g.strokeStyle = e.team === 0 ? '#7dff9a' : e.team === 1 ? '#ff6a6a' : '#ffd27a';
      g.lineWidth = 1.6;
      if (e.kind === 'unit') { const r = e.r * UNIT_SCALE + 3; ell(g, e.x, e.y + (e.air ? 0 : 2), r, r * 0.72); g.stroke(); }
      else { const x = e.tx * TILE, y = e.ty * TILE, w = e.w * TILE, h = e.h * TILE; ell(g, x + w / 2, y + h / 2 + 4, w * 0.55, h * 0.5); g.stroke(); }
    }
    // 건물 (위에서 아래 순서)
    const blds = G.buildings.filter(b => !b.dead && vis(b.x, b.y, 140) && (b.team === 0 || rectVisible(b) || b.seen)).sort((a, b) => a.y - b.y);
    for (const b of blds) {
      const ghost = b.team !== 0 && !rectVisible(b);
      if (ghost) g.globalAlpha = 0.55;
      Art.building(g, b, t, false);
      if (b.key === 'hatchery' && b.built && !ghost) Art.larvae(g, b, t);
      g.globalAlpha = 1;
    }
    // 지상 유닛
    const units = G.units.filter(u => !u.dead && !u.hidden && vis(u.x, u.y, 60) && seenByPlayer(u));
    const ground = units.filter(u => !u.air).sort((a, b) => a.y - b.y);
    const air = units.filter(u => u.air).sort((a, b) => a.y - b.y);
    for (const u of units) Art.shadow(g, u);
    for (const u of ground) Art.unit(g, u);
    // 메딕 치료 광선
    for (const u of ground) {
      if (!u.healing) continue;
      const v = byId(u.healing);
      if (!v) continue;
      g.strokeStyle = `rgba(150,255,200,${0.4 + Math.sin(t * 20) * 0.2})`; g.lineWidth = 2;
      g.beginPath(); g.moveTo(u.x + Math.cos(u.facing) * 8, u.y + Math.sin(u.facing) * 8); g.lineTo(v.x, v.y); g.stroke();
      g.fillStyle = 'rgba(200,255,220,.7)'; circ(g, v.x + Math.sin(t * 9) * 5, v.y + Math.cos(t * 7) * 5, 1.6); g.fill();
    }
    // 탄 · 효과
    for (const p of G.projectiles) {
      g.save(); g.translate(p.x, p.y); g.rotate(p.a);
      g.fillStyle = '#e8f08a'; poly(g, [6, 0, -4, -2, -6, 0, -4, 2]); g.fill();
      g.restore();
    }
    for (const e of G.effects) if (vis(e.x, e.y, 120)) Art.effect(g, e);
    for (const u of air) Art.unit(g, u);
    // 시야 안개
    g.imageSmoothingEnabled = true;
    g.drawImage(Fog.canvas, 0, 0, WORLD_W, WORLD_H);
    // 체력 바
    for (const u of units) if (selSet.has(u) || u.hp < u.def.hp) this.hpBar(g, u.x, aimY(u) + u.r * UNIT_SCALE + 5, Math.max(18, u.r * 2.4), u.hp / u.def.hp, selSet.has(u), u.def.energy ? u.energy / u.def.energy : -1);
    for (const b of blds) {
      if (b.team !== 0 && !rectVisible(b)) continue;
      if (selSet.has(b) || b.hp < b.def.hp || !b.built) this.hpBar(g, b.x, (b.ty + b.h) * TILE + 2, b.w * TILE * 0.6, b.hp / b.def.hp, selSet.has(b), b.built ? -1 : b.progress, true);
    }
    // 집결 지점 · 명령 표시
    for (const b of G.selection) {
      if (b.kind !== 'building' || b.team !== 0 || !b.rally) continue;
      g.strokeStyle = 'rgba(125,255,154,.55)'; g.lineWidth = 1.4; g.setLineDash([6, 5]);
      g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.rally.x, b.rally.y); g.stroke(); g.setLineDash([]);
      g.strokeStyle = '#c8ced3'; g.lineWidth = 2; g.beginPath(); g.moveTo(b.rally.x, b.rally.y); g.lineTo(b.rally.x, b.rally.y - 18); g.stroke();
      g.fillStyle = '#7dff9a'; poly(g, [b.rally.x, b.rally.y - 18, b.rally.x + 12, b.rally.y - 14, b.rally.x, b.rally.y - 10]); g.fill();
    }
    if (G.mode && G.mode.type === 'place') this.ghost(g, t);
    // 화면 좌표: 드래그 상자
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const d = Input.drag;
    if (d && d.moved) {
      g.strokeStyle = '#7dff9a'; g.lineWidth = 1.2; g.fillStyle = 'rgba(125,255,154,.08)';
      const x = Math.min(d.sx, d.x), y = Math.min(d.sy, d.y), w = Math.abs(d.x - d.sx), h = Math.abs(d.y - d.sy);
      g.fillRect(x, y, w, h); g.strokeRect(x + 0.5, y + 0.5, w, h);
    }
  },
  hpBar(g, x, y, w, k, sel, k2, isB) {
    const h = isB ? 5 : 4, x0 = x - w / 2;
    g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(x0 - 1, y - 1, w + 2, h + 2 + (k2 >= 0 ? 3 : 0));
    g.fillStyle = k > 0.6 ? '#4fd64a' : k > 0.33 ? '#e8c838' : '#e5483b';
    g.fillRect(x0, y, w * clamp(k, 0, 1), h);
    if (w > 22) { g.fillStyle = 'rgba(0,0,0,.45)'; for (let s = 4; s < w; s += 4) g.fillRect(x0 + s, y, 1, h); }
    if (k2 >= 0) { g.fillStyle = isB ? '#ffb347' : '#b07aff'; g.fillRect(x0, y + h + 1, w * clamp(k2, 0, 1), 2); }
  },
  ghost(g, t) {
    const m = G.mode, def = BUILDINGS[m.key];
    if (m.tx === undefined) return;
    g.globalAlpha = 0.55;
    Art.building(g, { tx: m.tx, ty: m.ty, w: def.w, h: def.h, x: (m.tx + def.w / 2) * TILE, y: (m.ty + def.h / 2) * TILE, def, key: m.key, team: 0, built: true, progress: 1, hp: 1, id: 0, loaded: [], fireT: 0, gasIn: 0 }, t, true);
    g.globalAlpha = 1;
    const geyser = def.onGeyser ? geyserAt(m.tx, m.ty) : null;
    for (let y = m.ty; y < m.ty + def.h; y++) for (let x = m.tx; x < m.tx + def.w; x++) {
      const ok = def.onGeyser ? !!geyser && !geyser.refinery : placeTileOk(def, x, y, 0);
      g.fillStyle = ok ? 'rgba(80,255,120,.25)' : 'rgba(255,60,60,.35)';
      g.fillRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
    }
    if (def.townhall && !m.valid) {
      g.strokeStyle = 'rgba(255,80,80,.6)'; g.lineWidth = 1; g.setLineDash([4, 4]);
      g.strokeRect((m.tx - 3) * TILE, (m.ty - 3) * TILE, (def.w + 6) * TILE, (def.h + 6) * TILE);
      g.setLineDash([]);
    }
  },
};

// ───────────────────────── 미니맵 ─────────────────────────
const Minimap = {
  canvas: null, ctx: null, terrain: null, terrainDirty: true, size: 140,
  init() {
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.terrain = document.createElement('canvas');
    this.terrain.width = MAP_W; this.terrain.height = MAP_H;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.size = Math.max(60, Math.floor(Math.min(r.width, r.height)));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = this.canvas.height = Math.round(this.size * dpr);
    this.dpr = dpr;
  },
  buildTerrain() {
    const g = this.terrain.getContext('2d'), img = g.createImageData(MAP_W, MAP_H), d = img.data;
    const col = { [T_LOW]: [88, 72, 56], [T_HIGH]: [122, 104, 80], [T_RAMP]: [104, 88, 68], [T_ROCK]: [30, 25, 21] };
    for (let i = 0; i < N_TILES; i++) {
      let c = col[World.terrain[i]];
      if (World.creep[i]) c = [84, 44, 80];
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.terrainDirty = false;
  },
  draw(t) {
    if (this.terrainDirty) this.buildTerrain();
    const g = this.ctx, s = this.size / MAP_W, k = this.dpr;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.terrain, 0, 0, this.size, this.size);
    for (const r of G.resources) {
      if (r.dead || !rectExplored(r)) continue;
      g.fillStyle = r.kind === 'mineral' ? '#6fd3ff' : '#5fdc5a';
      g.fillRect(r.tx * s, r.ty * s, Math.max(1.5, r.w * s), Math.max(1.5, r.h * s));
    }
    g.imageSmoothingEnabled = true;
    g.drawImage(Fog.canvas, 0, 0, this.size, this.size);
    for (const b of G.buildings) {
      if (b.dead || (b.team !== 0 && !b.seen)) continue;
      g.fillStyle = b.team === 0 ? TEAM_COLOR[0] : TEAM_COLOR[1];
      g.fillRect(b.tx * s, b.ty * s, b.w * s, b.h * s);
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 0.6; g.strokeRect(b.tx * s, b.ty * s, b.w * s, b.h * s);
    }
    const sel = new Set(G.selection);
    for (const u of G.units) {
      if (u.dead || u.hidden || (u.team !== 0 && !seenByPlayer(u))) continue;
      g.fillStyle = sel.has(u) ? '#ffffff' : u.team === 0 ? '#7fb8ff' : '#ff5b72';
      const sz = Math.max(2, u.r * 2 * s / TILE + 1);
      g.fillRect(u.x / TILE * s - sz / 2, u.y / TILE * s - sz / 2, sz, sz);
    }
    for (const p of Alerts.pings) {
      const a = 1 - p.t / 4;
      g.strokeStyle = `rgba(255,70,60,${a})`; g.lineWidth = 1.6;
      circ(g, p.x / TILE * s, p.y / TILE * s, 4 + (p.t * 14) % 14); g.stroke();
    }
    const c = G.cam;
    g.strokeStyle = '#f1f4f6'; g.lineWidth = 1;
    g.strokeRect(c.x / TILE * s + 0.5, c.y / TILE * s + 0.5, View.vw / TILE * s, View.vh / TILE * s);
  },
  toWorld(sx, sy) { return { x: clamp(sx / this.size * WORLD_W, 0, WORLD_W), y: clamp(sy / this.size * WORLD_H, 0, WORLD_H) }; },
};
