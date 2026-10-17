'use strict';
// ───────────────────────── 지형 ─────────────────────────
const T_LOW = 0, T_ROCK = 1, T_HIGH = 2, T_RAMP = 3;
const World = {
  terrain: new Uint8Array(N_TILES),
  occ: new Int32Array(N_TILES),       // 건물·광물·가스가 차지한 칸 → 엔티티 id (0 = 빈칸)
  creep: new Uint8Array(N_TILES),     // 저그 점막
  vis: new Uint8Array(N_TILES),       // 플레이어 시야: 지금 보이는 칸
  explored: new Uint8Array(N_TILES),  // 한 번이라도 본 칸
  ring: new Uint8Array(N_TILES),      // 본진 언덕을 두른 절벽 (길 뚫기에서 보호)
  bases: [],
  seed: 1,
};
const tIdx = (x, y) => y * MAP_W + x;
const inMap = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
function walkableTile(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
  const i = y * MAP_W + x;
  return World.terrain[i] !== T_ROCK && World.occ[i] === 0;
}
function walkableAt(px, py) { return walkableTile(Math.floor(px / TILE), Math.floor(py / TILE)); }
function walkableCircle(x, y, r) {
  return walkableAt(x - r, y - r) && walkableAt(x + r, y - r) && walkableAt(x - r, y + r) && walkableAt(x + r, y + r);
}
// 두 점 사이를 반지름 r 유닛이 막힘 없이 지나갈 수 있는지
function lineClear(ax, ay, bx, by, r) {
  const d = Math.hypot(bx - ax, by - ay);
  if (d < 1) return walkableAt(bx, by);
  const steps = Math.ceil(d / 10), nx = -(by - ay) / d * r, ny = (bx - ax) / d * r;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
    if (!walkableAt(x, y) || !walkableAt(x + nx, y + ny) || !walkableAt(x - nx, y - ny)) return false;
  }
  return true;
}
function setOcc(e, id) {
  for (let y = e.ty; y < e.ty + e.h; y++) for (let x = e.tx; x < e.tx + e.w; x++) if (inMap(x, y)) World.occ[tIdx(x, y)] = id;
}

// ───────────────────────── 맵 생성 ─────────────────────────
// 플레이어(왼쪽 아래) 기지 자리. 컴퓨터(오른쪽 위)는 맵을 180도 돌려 똑같이 만든다
const MAIN_R = 13, MAIN_R2 = 15.6, RAMP_HALF = 2.3;
const BASE_SPOTS = [
  { tx: 11, ty: 80, away: [-0.72, 0.7], main: true, name: '본진' },
  { tx: 31, ty: 86, away: [0, 1], name: '앞마당' },
  { tx: 7, ty: 49, away: [-1, 0], name: '서쪽 확장' },
  { tx: 54, ty: 85, away: [0.25, 1], name: '남쪽 확장' },
];

function genMap(seed) {
  World.seed = seed;
  const T = World.terrain, R = World.ring;
  T.fill(T_LOW); R.fill(0); World.occ.fill(0); World.creep.fill(0); World.vis.fill(0); World.explored.fill(0);
  const noise = makeNoise(seed);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const edge = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
    const n = fbm(noise, x / 8, y / 8, 3) + (edge < 3 ? (3 - edge) * 0.07 : 0);
    T[tIdx(x, y)] = n > 0.6 ? T_ROCK : T_LOW;
  }
  // 점대칭: (x, y) ↔ (95-x, 95-y) 는 인덱스로 i ↔ N-1-i
  for (let i = 0; i < N_TILES; i++) { const j = N_TILES - 1 - i; if (j < i) T[i] = T[j]; }

  const spots = [];
  for (const s of BASE_SPOTS) spots.push({ ...s, side: 0 });
  for (const s of BASE_SPOTS) spots.push({ tx: MAP_W - s.tx - 4, ty: MAP_H - s.ty - 3, away: [-s.away[0], -s.away[1]], main: !!s.main, name: s.name, side: 1 });
  for (const b of spots) {
    b.cx = b.tx + 2; b.cy = b.ty + 1.5;
    const l = Math.hypot(b.away[0], b.away[1]); b.away = [b.away[0] / l, b.away[1] / l];
  }
  // 본진 언덕: 둥근 고지대 + 절벽 + 경사로 하나
  for (const b of spots) {
    if (!b.main) continue;
    b.rampA = Math.atan2(MAP_H / 2 - b.cy, MAP_W / 2 - b.cx);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const px = x + 0.5, py = y + 0.5, d = Math.hypot(px - b.cx, py - b.cy), i = tIdx(x, y);
      if (d < MAIN_R) T[i] = T_HIGH;
      else if (d < MAIN_R2) {
        const off = Math.abs(angDiff(b.rampA, Math.atan2(py - b.cy, px - b.cx))) * d;
        T[i] = off < RAMP_HALF ? T_RAMP : T_ROCK;
        R[i] = 1;
      }
    }
    b.rampOut = { x: b.cx + Math.cos(b.rampA) * (MAIN_R2 + 2.5), y: b.cy + Math.sin(b.rampA) * (MAIN_R2 + 2.5) };
    b.rampTop = { x: b.cx + Math.cos(b.rampA) * (MAIN_R - 3), y: b.cy + Math.sin(b.rampA) * (MAIN_R - 3) };
  }
  const clearDisk = (cx, cy, r) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (!inMap(x, y)) continue;
      const i = tIdx(x, y);
      if (R[i] || T[i] === T_HIGH) continue;
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r) T[i] = T_LOW;
    }
  };
  const carve = (pts, w) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      const x0 = Math.floor(Math.min(a.x, b.x) - w - 1), x1 = Math.ceil(Math.max(a.x, b.x) + w + 1);
      const y0 = Math.floor(Math.min(a.y, b.y) - w - 1), y1 = Math.ceil(Math.max(a.y, b.y) + w + 1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!inMap(x, y)) continue;
        const i = tIdx(x, y);
        if (R[i] || T[i] === T_HIGH) continue;
        if (segDist(x + 0.5, y + 0.5, a.x, a.y, b.x, b.y) < w) T[i] = T_LOW;
      }
    }
  };
  for (const b of spots) if (!b.main) clearDisk(b.cx, b.cy, 8.5);
  clearDisk(MAP_W / 2, MAP_H / 2, 6);

  const [m0, n0, w0, s0] = spots;
  const front = b => ({ x: b.cx - b.away[0] * 6, y: b.cy - b.away[1] * 6 });
  const C = { x: MAP_W / 2, y: MAP_H / 2 };
  const routes = [
    [m0.rampOut, front(n0)],
    [front(n0), { x: 44, y: 70 }, C],
    [m0.rampOut, { x: 16, y: 63 }, front(w0)],
    [front(w0), { x: 30, y: 46 }, C],
    [front(n0), front(s0)],
    [front(s0), { x: 62, y: 66 }, C],
  ];
  const flip = p => ({ x: MAP_W - p.x, y: MAP_H - p.y });
  for (const r of routes) { carve(r, 2.6); carve(r.map(flip), 2.6); }

  // 자원 배치: 플레이어 쪽에 놓고 반대편으로 뒤집는다
  const taken = new Uint8Array(N_TILES);
  const mark = (tx, ty, w, h) => { for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) if (inMap(x, y)) taken[tIdx(x, y)] = 1; };
  for (const b of spots) mark(b.tx - 3, b.ty - 3, 10, 9);
  const fits = (b, tx, ty, w, h) => {
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) {
      if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1) return false;
      const i = tIdx(x, y);
      if (taken[i] || R[i]) return false;
      if (b.main ? T[i] !== T_HIGH : T[i] === T_HIGH) return false;
    }
    return true;
  };
  for (const b of spots.slice(0, 4)) {
    const a0 = Math.atan2(b.away[1], b.away[0]);
    b.minerals = [];
    const order = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5];
    for (const rad of [6.5, 7.6]) for (const k of order) {
      if (b.minerals.length >= 8) break;
      const a = a0 + k * 0.32;
      const tx = Math.round(b.cx + Math.cos(a) * rad - 1), ty = Math.round(b.cy + Math.sin(a) * rad - 0.5);
      if (fits(b, tx, ty, 2, 1)) { mark(tx, ty, 2, 1); b.minerals.push({ tx, ty }); }
    }
    for (const side of [1, -1, 1.25, -1.25]) {
      const a = a0 + side * 1.7;
      const tx = Math.round(b.cx + Math.cos(a) * 7.4 - 1.5), ty = Math.round(b.cy + Math.sin(a) * 7.4 - 1);
      if (fits(b, tx, ty, 3, 2)) { mark(tx, ty, 3, 2); b.geyser = { tx, ty }; break; }
    }
  }
  for (let k = 0; k < 4; k++) {
    const a = spots[k], b = spots[k + 4];
    b.minerals = a.minerals.map(m => ({ tx: MAP_W - m.tx - 2, ty: MAP_H - m.ty - 1 }));
    b.geyser = a.geyser ? { tx: MAP_W - a.geyser.tx - 3, ty: MAP_H - a.geyser.ty - 2 } : null;
  }
  for (const b of spots) {
    const g = b.main ? T_HIGH : T_LOW;
    const flat = (tx, ty, w, h) => { for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) T[tIdx(x, y)] = g; };
    for (const m of b.minerals) flat(m.tx, m.ty, 2, 1);
    if (b.geyser) flat(b.geyser.tx, b.geyser.ty, 3, 2);
    flat(b.tx, b.ty, 4, 3);
  }

  // 연결 확인: 플레이어 본진에서 못 가는 빈 땅은 바위로 메운다
  const flood = () => {
    const seen = new Uint8Array(N_TILES), q = [tIdx(m0.cx | 0, m0.cy | 0)];
    seen[q[0]] = 1;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % MAP_W, y = (i / MAP_W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inMap(nx, ny)) continue;
        const j = tIdx(nx, ny);
        if (!seen[j] && T[j] !== T_ROCK) { seen[j] = 1; q.push(j); }
      }
    }
    return seen;
  };
  let seen = flood();
  const m1 = spots[4];
  if (!seen[tIdx(m1.cx | 0, m1.cy | 0)]) { carve([m0.rampOut, C, m1.rampOut], 3); seen = flood(); }
  for (let i = 0; i < N_TILES; i++) if (!seen[i] && T[i] !== T_ROCK) T[i] = T_ROCK;

  World.bases = spots;
}

// ───────────────────────── 길찾기 (A*) ─────────────────────────
const Path = (() => {
  const g = new Float32Array(N_TILES), par = new Int32Array(N_TILES);
  const openS = new Uint32Array(N_TILES), closedS = new Uint32Array(N_TILES);
  const heapN = new Int32Array(N_TILES * 8 + 16), heapF = new Float32Array(N_TILES * 8 + 16);
  const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
  let gen = 1, hs = 0;
  function push(n, f) {
    let i = hs++;
    while (i > 0) { const p = (i - 1) >> 1; if (heapF[p] <= f) break; heapN[i] = heapN[p]; heapF[i] = heapF[p]; i = p; }
    heapN[i] = n; heapF[i] = f;
  }
  function pop() {
    const top = heapN[0]; hs--;
    const ln = heapN[hs], lf = heapF[hs];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= hs) break;
      if (c + 1 < hs && heapF[c + 1] < heapF[c]) c++;
      if (heapF[c] >= lf) break;
      heapN[i] = heapN[c]; heapF[i] = heapF[c]; i = c;
    }
    heapN[i] = ln; heapF[i] = lf;
    return top;
  }
  const h = (x, y, tx, ty) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return dx + dy - 0.5858 * Math.min(dx, dy); };
  // 목표가 막혀 있으면 그 둘레에서 출발점 쪽으로 가장 가까운 빈칸
  function nearestWalkable(tx, ty, sx, sy, maxR = 12) {
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = Infinity;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = tx + dx, y = ty + dy;
        if (!walkableTile(x, y)) continue;
        const d = (x - sx) ** 2 + (y - sy) ** 2 + (dx * dx + dy * dy) * 3;
        if (d < bd) { bd = d; best = { x, y }; }
      }
      if (best) return best;
    }
    return null;
  }
  function find(sx, sy, tx, ty, maxExpand = 6000) {
    sx = clamp(sx, 0, MAP_W - 1); sy = clamp(sy, 0, MAP_H - 1);
    tx = clamp(tx, 0, MAP_W - 1); ty = clamp(ty, 0, MAP_H - 1);
    if (!walkableTile(tx, ty)) {
      const alt = nearestWalkable(tx, ty, sx, sy);
      if (!alt) return null;
      tx = alt.x; ty = alt.y;
    }
    gen++; hs = 0;
    const s = tIdx(sx, sy), goal = tIdx(tx, ty);
    g[s] = 0; par[s] = -1; openS[s] = gen;
    push(s, h(sx, sy, tx, ty));
    let best = s, bestH = Infinity, expanded = 0;
    while (hs > 0) {
      const n = pop();
      if (closedS[n] === gen) continue;
      closedS[n] = gen;
      if (n === goal) { best = n; break; }
      const x = n % MAP_W, y = (n / MAP_W) | 0;
      const hn = h(x, y, tx, ty);
      if (hn < bestH) { bestH = hn; best = n; }
      if (++expanded > maxExpand) break;
      for (let k = 0; k < 8; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (!walkableTile(nx, ny)) continue;
        if (k >= 4 && (!walkableTile(nx, y) || !walkableTile(x, ny))) continue;
        const m = ny * MAP_W + nx;
        if (closedS[m] === gen) continue;
        const ng = g[n] + (k < 4 ? 1 : 1.4142);
        if (openS[m] !== gen || ng < g[m]) { openS[m] = gen; g[m] = ng; par[m] = n; push(m, ng + h(nx, ny, tx, ty)); }
      }
    }
    const out = [];
    for (let n = best; n !== s && n !== -1; n = par[n]) out.push(n);
    return out.reverse();
  }
  return { find, nearestWalkable };
})();

// 타일 경로 → 꺾이는 점만 남긴 월드 좌표 경로
function buildPath(u, tiles, gx, gy) {
  const pts = tiles.map(n => ({ x: (n % MAP_W + 0.5) * TILE, y: (((n / MAP_W) | 0) + 0.5) * TILE }));
  const last = pts[pts.length - 1];
  if (!last) pts.push({ x: gx, y: gy });
  else if (Math.floor(gx / TILE) === Math.floor(last.x / TILE) && Math.floor(gy / TILE) === Math.floor(last.y / TILE)) pts[pts.length - 1] = { x: gx, y: gy };
  const r = u.r * 0.7, out = [];
  let cx = u.x, cy = u.y, i = 0;
  while (i < pts.length) {
    let j = Math.min(pts.length - 1, i + 10);
    while (j > i && !lineClear(cx, cy, pts[j].x, pts[j].y, r)) j--;
    out.push(pts[j]); cx = pts[j].x; cy = pts[j].y; i = j + 1;
  }
  return out;
}

const PathQ = [];
function requestPath(u, x, y) {
  u.pathReq = { x, y };
  if (!u.pathQueued) { u.pathQueued = true; PathQ.push(u); }
}
function processPaths(budget) {
  while (budget-- > 0 && PathQ.length) {
    const u = PathQ.shift();
    u.pathQueued = false;
    if (u.dead || !u.pathReq) continue;
    const req = u.pathReq; u.pathReq = null;
    const tiles = Path.find(Math.floor(u.x / TILE), Math.floor(u.y / TILE), Math.floor(req.x / TILE), Math.floor(req.y / TILE));
    u.path = tiles ? buildPath(u, tiles, req.x, req.y) : [{ x: req.x, y: req.y }];
    u.pathGoal = req;
  }
}

// ───────────────────────── 시야 ─────────────────────────
const Fog = {
  circles: new Map(), canvas: null, ctx: null, img: null,
  init() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = MAP_W; this.canvas.height = MAP_H;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(MAP_W, MAP_H);
  },
  circle(r) {
    let c = this.circles.get(r);
    if (!c) {
      c = [];
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r) c.push(dx, dy);
      this.circles.set(r, c);
    }
    return c;
  },
  mark(cx, cy, r) {
    const V = World.vis, E = World.explored, o = this.circle(r);
    for (let k = 0; k < o.length; k += 2) {
      const x = cx + o[k], y = cy + o[k + 1];
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
      const i = y * MAP_W + x; V[i] = 1; E[i] = 1;
    }
  },
  update() {
    if (this.all) return;
    World.vis.fill(0);
    for (const u of G.units) {
      if (u.team !== 0 || u.dead) continue;
      const src = u.inside ? byId(u.inside) || u : u;
      this.mark(Math.floor(src.x / TILE), Math.floor(src.y / TILE), u.def.sight + (u.sieged ? 1 : 0));
    }
    for (const b of G.buildings) if (b.team === 0 && !b.dead) this.mark(Math.floor(b.x / TILE), Math.floor(b.y / TILE), b.built ? b.def.sight : 4);
    for (const b of G.buildings) if (b.team !== 0 && !b.seen && rectVisible(b)) b.seen = true;
    this.paint();
  },
  paint() {
    const d = this.img.data, V = World.vis, E = World.explored;
    for (let i = 0; i < N_TILES; i++) {
      d[i * 4] = 4; d[i * 4 + 1] = 6; d[i * 4 + 2] = 10;
      d[i * 4 + 3] = V[i] ? 0 : E[i] ? 140 : 255;
    }
    this.ctx.putImageData(this.img, 0, 0);
  },
  revealAll() { this.all = true; World.explored.fill(1); World.vis.fill(1); this.paint(); },
};
function rectVisible(e) {
  for (let y = e.ty; y < e.ty + e.h; y++) for (let x = e.tx; x < e.tx + e.w; x++) if (inMap(x, y) && World.vis[tIdx(x, y)]) return true;
  return false;
}
function rectExplored(e) {
  for (let y = e.ty; y < e.ty + e.h; y++) for (let x = e.tx; x < e.tx + e.w; x++) if (inMap(x, y) && World.explored[tIdx(x, y)]) return true;
  return false;
}
// 플레이어에게 지금 보이는가
function seenByPlayer(e) {
  if (e.team === 0) return !e.hidden;
  if (e.kind === 'unit') {
    if (e.hidden) return false;
    const x = Math.floor(e.x / TILE), y = Math.floor(e.y / TILE);
    return inMap(x, y) && World.vis[tIdx(x, y)] === 1;
  }
  return rectVisible(e);
}

// ───────────────────────── 점막 ─────────────────────────
function recomputeCreep() {
  const old = World.creep.slice(), C = World.creep;
  C.fill(0);
  for (const b of G.buildings) {
    if (b.dead || b.def.race !== 'Z') continue;
    const cx = b.tx + b.w / 2, cy = b.ty + b.h / 2;
    const r = b.built && b.def.creep ? b.def.creep : 0;
    for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
      if (!inMap(x, y)) continue;
      const i = tIdx(x, y);
      if (World.terrain[i] === T_ROCK) continue;
      const inRect = x >= b.tx - 1 && x <= b.tx + b.w && y >= b.ty - 1 && y <= b.ty + b.h;
      if (inRect || (r && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r + (hash2(x, y, 7) - 0.5) * 1.8)) C[i] = 1;
    }
  }
  const dirty = new Set();
  for (let i = 0; i < N_TILES; i++) if (old[i] !== C[i]) {
    const x = i % MAP_W, y = (i / MAP_W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) dirty.add(`${Math.floor((x + dx * 2) / CHUNK)},${Math.floor((y + dy * 2) / CHUNK)}`);
  }
  if (dirty.size) { Art.invalidate(dirty); Minimap.terrainDirty = true; }
}
