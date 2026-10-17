'use strict';
// ───────────────────────── 게임 상태 ─────────────────────────
const G = {
  state: 'title', time: 0, tick: 0, speed: 1, difficulty: 'normal',
  teams: [], units: [], buildings: [], resources: [], effects: [], projectiles: [], decals: [],
  byId: new Map(), nextId: 1, dirty: false,
  selection: [], groups: {}, mode: null, card: 'main',
  cam: { x: 0, y: 0, zoom: 1 },
  winner: -1, lastAlert: null, groupSeq: 1,
};
const MINE_TIME = 3.6, GAS_TIME = 1.6;

function newTeam(id, race) {
  return {
    id, race, m: 50, g: 0, supUsed: 0, supCap: 0,
    upg: { infW: 0, infA: 0, stim: 0, u238: 0, siege: 0, zMelee: 0, zRange: 0, zCarapace: 0 },
    researching: {}, stats: { produced: 0, killed: 0, lost: 0, minerals: 0, gas: 0, built: 0 }, ai: null,
  };
}
function byId(id) {
  if (!id) return null;
  const e = G.byId.get(id);
  return e && !e.dead ? e : null;
}
function addEntity(e) { e.id = G.nextId++; G.byId.set(e.id, e); return e; }
const carryAmt = team => (team === 1 ? DIFF[G.difficulty].carry : 8);

// ───────────────────────── 공간 해시 (가까운 유닛 찾기) ─────────────────────────
const Grid = {
  size: 128, cols: Math.ceil(WORLD_W / 128), rows: Math.ceil(WORLD_H / 128), cells: [],
  init() { this.cells = Array.from({ length: this.cols * this.rows }, () => []); },
  build() {
    for (const c of this.cells) c.length = 0;
    for (const u of G.units) {
      if (u.dead || u.hidden) continue;
      const cx = clamp(Math.floor(u.x / this.size), 0, this.cols - 1), cy = clamp(Math.floor(u.y / this.size), 0, this.rows - 1);
      this.cells[cy * this.cols + cx].push(u);
    }
  },
  query(x, y, r, out) {
    out.length = 0;
    const s = this.size;
    const x0 = clamp(Math.floor((x - r - 24) / s), 0, this.cols - 1), x1 = clamp(Math.floor((x + r + 24) / s), 0, this.cols - 1);
    const y0 = clamp(Math.floor((y - r - 24) / s), 0, this.rows - 1), y1 = clamp(Math.floor((y + r + 24) / s), 0, this.rows - 1);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      for (const u of this.cells[cy * this.cols + cx]) if (Math.abs(u.x - x) <= r + u.r && Math.abs(u.y - y) <= r + u.r) out.push(u);
    }
    return out;
  },
};
const acqList = [], sepList = [], healList = [], grpList = [];

// ───────────────────────── 생성 ─────────────────────────
function createUnit(key, team, x, y) {
  const def = UNITS[key];
  const u = addEntity({
    kind: 'unit', key, def, team, x, y, r: def.r, hp: def.hp, energy: def.startEnergy || 0,
    facing: team === 0 ? -Math.PI / 4 : Math.PI * 0.75, turret: team === 0 ? -Math.PI / 4 : Math.PI * 0.75,
    orders: [], path: null, pathGoal: null, pathReq: null, pathQueued: false, repath: 0,
    cd: Math.random() * 0.2, target: 0, carry: null, sieged: false, siegeT: 0, siegeTo: false, stim: 0,
    inside: 0, insideType: '', hidden: false, flash: 0, fireT: 0, anim: Math.random() * 10,
    moving: false, working: false, healing: 0, healTarget: 0, stuck: 0, stuckN: 0, lastX: x, lastY: y,
    kills: 0, air: !!def.air, lastHitBy: 0, lastHitAt: -99, arrivedGroup: 0, reachId: 0, phase: false,
  });
  G.units.push(u);
  return u;
}
function createBuilding(key, team, tx, ty, built) {
  const def = BUILDINGS[key];
  const b = addEntity({
    kind: 'building', key, def, team, tx, ty, w: def.w, h: def.h,
    x: (tx + def.w / 2) * TILE, y: (ty + def.h / 2) * TILE,
    hp: built ? def.hp : def.hp * 0.1, built: false, progress: built ? 1 : 0, builder: 0,
    queue: [], rally: null, loaded: [], gasIn: 0, gasT: 0, geyser: 0, larva: 3, larvaT: 0, eggs: [],
    cd: 0, target: 0, flash: 0, fireT: 0, anim: Math.random() * 10, seen: team === 0, lastHitBy: 0, lastHitAt: -99,
  });
  if (def.onGeyser) {
    const gy = G.resources.find(r => r.kind === 'geyser' && !r.dead && r.tx === tx && r.ty === ty);
    if (gy) { gy.refinery = b.id; b.geyser = gy.id; }
  }
  setOcc(b, b.id);
  G.buildings.push(b);
  pushUnitsOut(b);
  if (built) completeBuilding(b, true);
  else if (def.race === 'Z') recomputeCreep();
  return b;
}
function createMineral(tx, ty, amount) {
  const m = addEntity({ kind: 'mineral', team: -1, tx, ty, w: 2, h: 1, x: (tx + 1) * TILE, y: (ty + 0.5) * TILE, amount, max: amount, miner: 0, variant: randi(0, 2) });
  setOcc(m, m.id);
  G.resources.push(m);
  return m;
}
function createGeyser(tx, ty) {
  const g = addEntity({ kind: 'geyser', team: -1, tx, ty, w: 3, h: 2, x: (tx + 1.5) * TILE, y: (ty + 1) * TILE, amount: 5000, max: 5000, refinery: 0 });
  setOcc(g, g.id);
  G.resources.push(g);
  return g;
}

// 사각형(건물) 둘레에서 반지름 r 유닛이 설 수 있는 자리 중 (tx, ty)에 가장 가까운 곳
function findSpawnPos(b, r, towardX, towardY) {
  const rx = b.tx * TILE, ry = b.ty * TILE, rw = b.w * TILE, rh = b.h * TILE;
  let best = null, bd = Infinity;
  for (let off = r + 3; off < r + 3 + TILE * 5 && !best; off += 12) {
    const x0 = rx - off, y0 = ry - off, x1 = rx + rw + off, y1 = ry + rh + off;
    const tryAt = (x, y) => {
      if (x < r || y < r || x > WORLD_W - r || y > WORLD_H - r) return;
      if (!walkableCircle(x, y, r * 0.7)) return;
      const d = (x - towardX) ** 2 + (y - towardY) ** 2;
      if (d < bd) { bd = d; best = { x, y }; }
    };
    for (let x = x0; x <= x1; x += 10) { tryAt(x, y0); tryAt(x, y1); }
    for (let y = y0; y <= y1; y += 10) { tryAt(x0, y); tryAt(x1, y); }
  }
  return best || { x: b.x, y: ry + rh + r + 4 };
}
function pushUnitsOut(b) {
  const rx = b.tx * TILE, ry = b.ty * TILE, rw = b.w * TILE, rh = b.h * TILE;
  for (const u of G.units) {
    if (u.dead || u.hidden || u.air) continue;
    if (rectDist(u.x, u.y, rx, ry, rw, rh) < u.r * 0.7 + 1) {
      const p = findSpawnPos(b, u.r, u.x, u.y);
      u.x = p.x; u.y = p.y; u.path = null; u.pathGoal = null;
    }
  }
}

// ───────────────────────── 자원 · 보급 ─────────────────────────
function canAfford(team, cost, supply, notify) {
  const t = G.teams[team];
  if (t.m < cost[0]) { if (notify) UI.error('미네랄이 부족합니다.'); return false; }
  if (t.g < cost[1]) { if (notify) UI.error('가스가 부족합니다.'); return false; }
  if (supply > 0 && t.supUsed + supply > t.supCap) {
    if (notify) UI.error(t.supCap >= 200 ? '보급품이 최대치입니다.' : '보급품이 부족합니다. 서플라이 디폿을 더 지으세요.');
    return false;
  }
  return true;
}
function spend(team, cost) { const t = G.teams[team]; t.m -= cost[0]; t.g -= cost[1]; }
function refund(team, cost, k = 1) { const t = G.teams[team]; t.m += Math.floor(cost[0] * k); t.g += Math.floor(cost[1] * k); }
function recalcSupply(team) {
  let cap = 0;
  for (const b of G.buildings) if (b.team === team && !b.dead && b.built) cap += b.def.provides || 0;
  for (const u of G.units) if (u.team === team && !u.dead && u.def.provides) cap += u.def.provides;
  G.teams[team].supCap = Math.min(200, cap);
}

// 건설 가능 여부 (칸 하나)
function placeTileOk(def, x, y, team) {
  if (!inMap(x, y)) return false;
  const i = tIdx(x, y);
  if (World.terrain[i] === T_ROCK || World.occ[i]) return false;
  if (team === 0 && !World.explored[i]) return false;
  if (def.race === 'T' && World.creep[i]) return false;
  if (def.race === 'Z' && !def.townhall && !World.creep[i]) return false;
  return true;
}
function geyserAt(tx, ty) { return G.resources.find(r => r.kind === 'geyser' && !r.dead && r.tx === tx && r.ty === ty); }
function canPlace(key, tx, ty, team) {
  const def = BUILDINGS[key];
  if (def.onGeyser) {
    const gy = geyserAt(tx, ty);
    return !!gy && !gy.refinery && (team !== 0 || rectExplored(gy));
  }
  for (let y = ty; y < ty + def.h; y++) for (let x = tx; x < tx + def.w; x++) if (!placeTileOk(def, x, y, team)) return false;
  if (def.townhall) {
    for (const r of G.resources) {
      if (r.dead) continue;
      const gx = Math.max(r.tx - (tx + def.w), tx - (r.tx + r.w), 0), gy = Math.max(r.ty - (ty + def.h), ty - (r.ty + r.h), 0);
      if (Math.max(gx, gy) < 3) return false;
    }
  }
  return true;
}

// ───────────────────────── 명령 ─────────────────────────
function releaseOrder(u, o) {
  if (o.type === 'build') {
    if (!o.bid && o.paid) { refund(u.team, BUILDINGS[o.key].cost); o.paid = false; }
    const b = byId(o.bid); if (b && b.builder === u.id) b.builder = 0;
  } else if (o.type === 'morph' && o.paid) { refund(u.team, BUILDINGS[o.key].cost); o.paid = false; }
  else if (o.type === 'gather') { const r = byId(o.res); if (r && r.miner === u.id) r.miner = 0; }
}
function resetMove(u) { u.path = null; u.pathGoal = null; u.target = 0; u.stuck = 0; u.stuckN = 0; u.reachId = 0; }
function issue(u, o, queue) {
  if (u.dead || (u.inside && u.insideType === 'bunker')) return;
  if (u.sieged || u.siegeT > 0) {
    if (!['attack', 'hold'].includes(o.type)) return;
  }
  if (!queue || !u.orders.length) {
    for (const old of u.orders) releaseOrder(u, old);
    u.orders = [o];
    resetMove(u);
  } else u.orders.push(o);
}
function nextOrder(u) {
  const o = u.orders.shift();
  if (o) releaseOrder(u, o);
  resetMove(u);
}
function stopUnit(u) { for (const o of u.orders) releaseOrder(u, o); u.orders = []; resetMove(u); }

// ───────────────────────── 이동 ─────────────────────────
function tryMove(u, nx, ny) {
  const r = u.r * 0.7;
  if (!walkableCircle(u.x, u.y, r)) {   // 건물에 끼었으면 빠져나오게 둔다
    u.x = clamp(nx, 2, WORLD_W - 2); u.y = clamp(ny, 2, WORLD_H - 2);
    return;
  }
  if (walkableCircle(nx, u.y, r)) u.x = nx;
  if (walkableCircle(u.x, ny, r)) u.y = ny;
}
function unitSpeed(u) {
  let s = u.def.speed;
  if (u.stim > 0) s *= 1.5;
  if (u.def.race === 'Z' && !u.air) { const i = tIdx(Math.floor(u.x / TILE), Math.floor(u.y / TILE)); if (World.creep[i]) s *= 1.15; }
  return s;
}
// 목표 지점으로 한 걸음. 도착했거나 더 갈 수 없으면 true
function moveTo(u, gx, gy, dt, arrive) {
  if (u.sieged || u.siegeT > 0) return false;
  const d = Math.hypot(gx - u.x, gy - u.y);
  if (d <= Math.max(arrive, 2)) { u.path = null; return true; }
  const spd = unitSpeed(u);
  let wx = gx, wy = gy;
  if (!u.air) {
    const pg = u.pathGoal;
    if (!pg || Math.abs(pg.x - gx) + Math.abs(pg.y - gy) > 20) {
      if (lineClear(u.x, u.y, gx, gy, u.r * 0.7)) { u.path = [{ x: gx, y: gy }]; u.pathGoal = { x: gx, y: gy }; u.pathReq = null; }
      else if (u.repath <= 0 || !u.path) { requestPath(u, gx, gy); u.repath = 0.5; }
    }
    u.repath -= dt;
    if (u.path && u.path.length) {
      let wp = u.path[0];
      while (u.path.length > 1 && Math.hypot(wp.x - u.x, wp.y - u.y) < 10) { u.path.shift(); wp = u.path[0]; }
      if (u.path.length === 1 && Math.hypot(wp.x - u.x, wp.y - u.y) < 6) { wx = gx; wy = gy; } else { wx = wp.x; wy = wp.y; }
    } else if (u.pathQueued) return false;
  }
  const dx = wx - u.x, dy = wy - u.y, dd = Math.hypot(dx, dy) || 1;
  const stepLen = Math.min(spd * dt, dd);
  const nx = u.x + dx / dd * stepLen, ny = u.y + dy / dd * stepLen;
  if (u.air) { u.x = clamp(nx, 0, WORLD_W); u.y = clamp(ny, 0, WORLD_H); } else tryMove(u, nx, ny);
  u.facing = turnTo(u.facing, Math.atan2(dy, dx), 12 * dt);
  u.moving = true;
  // 끼임 확인: 거의 못 움직이면 길을 다시 찾고, 그래도 안 되면 포기
  const moved = Math.hypot(u.x - u.lastX, u.y - u.lastY);
  u.lastX = u.x; u.lastY = u.y;
  if (moved < spd * dt * 0.25) {
    u.stuck += dt;
    if (u.stuck > 0.6) {
      u.stuck = 0; u.stuckN++; u.path = null; u.pathGoal = null;
      if (u.stuckN >= 3 || d < 3 * TILE) { u.stuckN = 0; return true; }
    }
  } else {
    u.stuck = Math.max(0, u.stuck - dt);
    if (moved > spd * dt * 0.6) u.stuckN = 0;
  }
  return false;
}
// 건물·광물 테두리에 닿을 때까지 이동
function reachRect(u, e, dt, margin = 4) {
  const rx = e.tx * TILE, ry = e.ty * TILE, rw = e.w * TILE, rh = e.h * TILE;
  if (rectDist(u.x, u.y, rx, ry, rw, rh) <= u.r + margin) { u.reachId = 0; return true; }
  if (u.reachId !== e.id) { u.reachId = e.id; u.reachX = clamp(u.x, rx, rx + rw); u.reachY = clamp(u.y, ry, ry + rh); }
  if (moveTo(u, u.reachX, u.reachY, dt, 0)) u.reachId = 0;
  return false;
}
// 무리 이동: 먼저 도착한 동료에게 닿으면 같이 도착한 것으로 친다
function groupArrived(u, o) {
  if (!o.group || o.formation) return false;
  if (Math.hypot(o.x - u.x, o.y - u.y) > o.gr) return false;
  Grid.query(u.x, u.y, u.r + 12, grpList);
  for (const v of grpList) if (v !== u && v.arrivedGroup === o.group && Math.hypot(v.x - u.x, v.y - u.y) < u.r + v.r + 6) return true;
  return false;
}

// ───────────────────────── 전투 계산 ─────────────────────────
function edgeDist(a, b) {
  if (b.kind !== 'unit') return rectDist(a.x, a.y, b.tx * TILE, b.ty * TILE, b.w * TILE, b.h * TILE) - (a.kind === 'unit' ? a.r : 0);
  if (a.kind !== 'unit') return rectDist(b.x, b.y, a.tx * TILE, a.ty * TILE, a.w * TILE, a.h * TILE) - b.r;
  return Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
}
function curWeapon(e) {
  if (e.kind === 'building') return e.built ? e.def.weapon : null;
  return e.sieged && e.def.siegeWeapon ? e.def.siegeWeapon : e.def.weapon;
}
function weaponFor(e, t) {
  const w = curWeapon(e);
  if (!w || !t || t.kind === 'mineral' || t.kind === 'geyser') return null;
  const air = t.kind === 'unit' && t.air;
  return (air ? w.air : w.ground) ? w : null;
}
function weaponRange(e, w) {
  return w.range + (e.key === 'marine' && G.teams[e.team].upg.u238 ? 32 : 0);
}
function acquireRange(u) {
  const w = curWeapon(u);
  if (!w) return 0;
  if (u.sieged) return weaponRange(u, w);
  return Math.max(weaponRange(u, w) + 40, u.def.sight * TILE * 0.75);
}
function canFight(e) {
  if (e.kind === 'building') return e.built && (!!e.def.weapon || (e.def.bunker && e.loaded.length > 0));
  return !!(e.def.weapon || e.def.siegeWeapon);
}
function isTargetable(team, t) {
  if (!t || t.dead || t.hidden || t.team < 0 || t.team === team) return false;
  return team === 0 ? seenByPlayer(t) : true;
}
function calcDamage(a, w, t) {
  const at = G.teams[a.team];
  const dmg = w.dmg + (w.upg ? (at.upg[w.upg] || 0) * (w.plus || 1) : 0);
  let armor = t.def.armor || 0;
  if (t.kind === 'unit' && t.def.armorUpg) armor += G.teams[t.team].upg[t.def.armorUpg] || 0;
  const size = t.kind === 'unit' ? t.def.size : 'large';
  return Math.max(0.5, (dmg - armor) * DMG_MULT[w.type][size]);
}
// 사거리 안의 가장 알맞은 적: 맞서 싸우는 적을 먼저, 건물은 나중에
function acquireTarget(att, range, origin) {
  const o = origin || att;
  const ext = o.kind === 'building' ? Math.max(o.w, o.h) * TILE / 2 : o.r;
  let best = null, bs = Infinity;
  Grid.query(o.x, o.y, range + ext, acqList);
  for (const v of acqList) {
    if (v.team === att.team || v.team < 0 || v.dead || v.hidden) continue;
    const w = weaponFor(att, v);
    if (!w) continue;
    if (att.team === 0 && !seenByPlayer(v)) continue;
    const d = edgeDist(o, v);
    if (d > range || d < (w.minRange || 0)) continue;
    let s = d;
    if (!canFight(v)) s += 120;
    if (v.def.worker) s += 40;
    if (s < bs) { bs = s; best = v; }
  }
  for (const b of G.buildings) {
    if (b.team === att.team || b.dead) continue;
    if (Math.abs(b.x - o.x) > range + 200 || Math.abs(b.y - o.y) > range + 200) continue;
    const w = weaponFor(att, b);
    if (!w) continue;
    if (att.team === 0 && !rectVisible(b)) continue;
    const d = edgeDist(o, b);
    if (d > range || d < (w.minRange || 0)) continue;
    const s = d + (canFight(b) ? 20 : 250);
    if (s < bs) { bs = s; best = b; }
  }
  return best;
}
// 지금 노리는 적을 유지하되, 가끔 더 나은 적으로 바꾼다
function seek(u, range) {
  if (range === undefined) range = acquireRange(u);
  let t = byId(u.target);
  if (t && (!isTargetable(u.team, t) || !weaponFor(u, t) || edgeDist(u, t) > range + 80)) t = null;
  if (!t || (G.tick + u.id) % 12 === 0) {
    const nt = acquireTarget(u, range, u);
    if (nt && (!t || (t.kind === 'building' && nt.kind === 'unit') || (!canFight(t) && canFight(nt)))) t = nt;
  }
  u.target = t ? t.id : 0;
  return t;
}
// 사거리 안이면 쏘고, 아니면 다가간다. 쏠 수 있으면 true
function engage(u, t, dt, canMove) {
  const w = weaponFor(u, t);
  if (!w) return false;
  const d = edgeDist(u, t), range = weaponRange(u, w);
  if (d <= range) {
    if (d < (w.minRange || 0)) return false;
    u.path = null; u.pathGoal = null;
    const a = Math.atan2(t.y - u.y, t.x - u.x);
    if (u.key === 'tank') u.turret = turnTo(u.turret, a, 9 * dt); else u.facing = turnTo(u.facing, a, 14 * dt);
    if (u.cd <= 0) fire(u, t, w, u);
    return true;
  }
  if (canMove && !u.sieged) moveTo(u, t.x, t.y, dt, 0);
  return false;
}
const aimY = t => t.y - (t.air ? 20 : 0);

function fire(a, t, w, src) {
  a.cd = w.cd * (a.stim > 0 ? 0.66 : 1);
  a.fireT = 0.12;
  if (src !== a) src.fireT = 0.12;
  const dmg = calcDamage(a, w, t);
  const sx = src.x, sy = src.y, ty = aimY(t), ang = Math.atan2(ty - sy, t.x - sx);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  if (a.key === 'hydralisk') {
    G.projectiles.push({ x: sx + ca * 10, y: sy + sa * 10, tid: t.id, aid: a.id, aTeam: a.team, dmg, spd: 460, a: ang });
    Sound.at('spine', sx, sy);
    return;
  }
  if (a.key === 'firebat') {
    const off = src === a ? 10 : 22;
    fx('flame', sx + ca * off, sy + sa * off, { a: ang, len: w.range + 26 });
    Sound.at('flame', sx, sy);
    splashAround(a, t, w);
  } else if (a.key === 'marine') {
    const off = src === a ? 14 : 22;
    const mx = sx + ca * off + (src === a ? -sa * 3 : 0), my = sy + sa * off + (src === a ? ca * 3 : 0);
    fx('tracer', mx, my, { x2: t.x + randf(-4, 4), y2: ty + randf(-4, 4) });
    fx('muzzle', mx, my, { a: ang });
    fx('spark', t.x + randf(-5, 5), ty + randf(-5, 5));
    Sound.at('rifle', sx, sy);
  } else if (a.key === 'tank') {
    const mx = sx + ca * (a.sieged ? 30 : 22), my = sy + sa * (a.sieged ? 30 : 22);
    fx('muzzle', mx, my, { a: ang, big: true });
    if (a.sieged) { fx('bigboom', t.x, ty); Sound.at('siege', sx, sy); splash3(a, t, w); }
    else { fx('shell', mx, my, { x2: t.x, y2: ty }); fx('boom', t.x, ty, { s: 0.55 }); Sound.at('cannon', sx, sy); }
  } else if (a.kind === 'building') {
    fx('spike', t.x, t.y);
    Sound.at('sunken', t.x, t.y);
  } else {
    fx('slash', t.x + randf(-4, 4), ty + randf(-4, 4), { a: ang, z: a.def.race === 'Z', big: a.key === 'ultralisk' });
    Sound.at(a.def.race === 'Z' ? 'claw' : 'hit', sx, sy);
  }
  applyDamage(t, dmg, a);
}
function splashAround(a, t, w) {
  Grid.query(t.x, t.y, w.splash, acqList);
  for (const v of acqList.slice()) {
    if (v === t || v.team === a.team || v.air || v.dead) continue;
    if (Math.hypot(v.x - t.x, v.y - t.y) - v.r <= w.splash) applyDamage(v, calcDamage(a, w, v), a);
  }
}
function splash3(a, t, w) {
  const [r1, r2, r3] = w.splash3;
  Grid.query(t.x, t.y, r3, acqList);
  for (const v of acqList.slice()) {
    if (v === t || v.team === a.team || v.air || v.dead) continue;
    const d = Math.hypot(v.x - t.x, v.y - t.y) - v.r;
    const k = d <= r1 ? 1 : d <= r2 ? 0.5 : d <= r3 ? 0.25 : 0;
    if (k) applyDamage(v, calcDamage(a, w, v) * k, a);
  }
}
function applyDamage(t, amount, att) {
  if (!t || t.dead || t.hp === undefined) return;
  t.hp -= amount;
  t.flash = 0.12;
  if (att) { t.lastHitBy = att.id; t.lastHitAt = G.time; }
  if (t.team === 0) Alerts.hit(t);
  if (t.hp <= 0) kill(t, att);
}
function kill(e, killer) {
  if (e.dead) return;
  e.dead = true; G.dirty = true; UI.dirty = true;
  const T = G.teams[e.team];
  if (killer && killer.team !== undefined && killer.team !== e.team && killer.team >= 0) {
    G.teams[killer.team].stats.killed++;
    if (killer.kills !== undefined) killer.kills++;
  }
  if (e.kind === 'unit') {
    T.supUsed -= e.def.supply;
    T.stats.lost++;
    for (const o of e.orders) releaseOrder(e, o);
    if (e.inside) {
      const b = byId(e.inside);
      if (b) { b.loaded = b.loaded.filter(id => id !== e.id); if (b.gasIn === e.id) b.gasIn = 0; }
    }
    if (e.def.provides) recalcSupply(e.team);
    const yy = aimY(e);
    if (e.def.race === 'Z') {
      fx('splat', e.x, yy, { c: '#9bd34a', s: e.r / 9 });
      if (!e.air) G.decals.push({ x: e.x, y: e.y, kind: 'goo', r: e.r * 1.4, t: 0, life: 40, seed: Math.random() });
      Sound.at(e.r > 15 ? 'bigsquish' : 'squish', e.x, e.y);
    } else if (e.def.mech) {
      fx('boom', e.x, e.y, { s: e.r / 12 });
      G.decals.push({ x: e.x, y: e.y, kind: 'scorch', r: e.r * 1.5, t: 0, life: 40, seed: Math.random() });
      Sound.at('boom', e.x, e.y);
    } else {
      fx('splat', e.x, e.y, { c: '#b3263a', s: 0.9 });
      G.decals.push({ x: e.x, y: e.y, kind: 'blood', r: e.r * 1.3, t: 0, life: 40, seed: Math.random() });
      Sound.at('death', e.x, e.y);
    }
  } else if (e.kind === 'building') {
    for (let y = e.ty; y < e.ty + e.h; y++) for (let x = e.tx; x < e.tx + e.w; x++) if (World.occ[tIdx(x, y)] === e.id) World.occ[tIdx(x, y)] = 0;
    const gy = byId(e.geyser);
    if (gy) { gy.refinery = 0; setOcc(gy, gy.id); }
    if (e.gasIn) { const u = byId(e.gasIn); if (u) { u.inside = 0; u.hidden = false; } }
    if (e.loaded.length) unloadBunker(e);
    for (const q of e.queue) {
      if (q.research) delete T.researching[q.key];
      else T.supUsed -= UNITS[q.key].supply;
    }
    for (const egg of e.eggs) T.supUsed -= egg.sup;
    const bu = byId(e.builder);
    if (bu) bu.working = false;
    T.stats.lost++;
    const big = e.w * e.h;
    for (let i = 0; i < Math.min(6, big); i++) fx('boom', e.x + randf(-e.w * 12, e.w * 12), e.y + randf(-e.h * 12, e.h * 12), { s: randf(0.7, 1.3), delay: i * 0.08 });
    fx('bigboom', e.x, e.y, { s: 1.4 });
    G.decals.push({ x: e.x, y: e.y, kind: e.def.race === 'Z' ? 'goo' : 'rubble', r: Math.max(e.w, e.h) * 18, t: 0, life: 70, seed: Math.random(), w: e.w, h: e.h });
    Sound.at(e.def.race === 'Z' ? 'bigsquish' : 'bigboom', e.x, e.y);
    recalcSupply(e.team);
    if (e.def.race === 'Z') recomputeCreep();
  }
}

// ───────────────────────── 유닛 갱신 ─────────────────────────
function updateUnit(u, dt) {
  u.anim += dt;
  if (u.flash > 0) u.flash -= dt;
  if (u.fireT > 0) u.fireT -= dt;
  if (u.cd > 0) u.cd -= dt;
  if (u.stim > 0) u.stim -= dt;
  if (u.def.energy && u.energy < u.def.energy) u.energy = Math.min(u.def.energy, u.energy + 0.75 * dt);
  if (u.def.race === 'Z' && u.hp < u.def.hp) u.hp = Math.min(u.def.hp, u.hp + 0.35 * dt);
  u.moving = false; u.working = false; u.healing = 0;
  if (u.inside) { updateInside(u, dt); return; }
  if (u.siegeT > 0) {
    u.siegeT -= dt;
    if (u.siegeT <= 0) { u.siegeT = 0; u.sieged = u.siegeTo; Sound.at('siegeDone', u.x, u.y); }
    return;
  }
  if (u.key === 'tank' && !u.sieged && !u.target) u.turret = turnTo(u.turret, u.facing, 3 * dt);
  const o = u.orders[0];
  u.phase = !!o && (o.type === 'gather' || o.type === 'return');
  if (!o) { idle(u, dt, false); return; }
  switch (o.type) {
    case 'move':
      if (moveTo(u, o.x, o.y, dt, 4) || groupArrived(u, o)) { u.arrivedGroup = o.group || 0; nextOrder(u); }
      break;
    case 'amove': {
      if (u.def.healer) { if (!healStep(u, dt, true) && moveTo(u, o.x, o.y, dt, 6)) nextOrder(u); break; }
      if (!u.def.weapon) { if (moveTo(u, o.x, o.y, dt, 6)) nextOrder(u); break; }
      const t = seek(u);
      if (t) engage(u, t, dt, !u.sieged);
      else if (!u.sieged && (moveTo(u, o.x, o.y, dt, 6) || groupArrived(u, o))) { u.arrivedGroup = o.group || 0; nextOrder(u); }
      break;
    }
    case 'attack': {
      const t = byId(o.target);
      if (!t || !isTargetable(u.team, t)) { nextOrder(u); break; }
      u.target = t.id;
      if (!weaponFor(u, t)) { if (moveTo(u, t.x, t.y, dt, u.r + 40)) nextOrder(u); break; }
      if (u.sieged) { if (!engage(u, t, dt, false)) nextOrder(u); break; }
      engage(u, t, dt, true);
      break;
    }
    case 'hold': idle(u, dt, true); break;
    case 'patrol': {
      const tx = o.leg ? o.x1 : o.x2, ty = o.leg ? o.y1 : o.y2;
      const t = u.def.weapon ? seek(u) : null;
      if (t) engage(u, t, dt, true);
      else if (u.def.healer && healStep(u, dt, true)) { /* 치료 중 */ }
      else if (moveTo(u, tx, ty, dt, 8)) o.leg = !o.leg;
      break;
    }
    case 'follow': {
      const t = byId(o.target);
      if (!t || t.hidden || (t.team !== u.team && !isTargetable(u.team, t))) { nextOrder(u); break; }
      if (u.def.healer && healStep(u, dt, true)) break;
      if (edgeDist(u, t) > 20) moveTo(u, t.x, t.y, dt, u.r + t.r + 10);
      break;
    }
    case 'gather': gatherStep(u, o, dt); break;
    case 'return': {
      if (!u.carry) { if (o.res) { o.type = 'gather'; o.st = 'go'; } else nextOrder(u); break; }
      const th = nearestTownhall(u.team, u.x, u.y);
      if (!th) { nextOrder(u); break; }
      if (reachRect(u, th, dt, 6)) { deposit(u); if (o.res) { o.type = 'gather'; o.st = 'go'; } else nextOrder(u); }
      break;
    }
    case 'build': buildStep(u, o, dt); break;
    case 'morph': morphStep(u, o, dt); break;
    case 'repair': {
      const t = byId(o.target);
      if (!t || t.team !== u.team || t.hp >= t.def.hp || (t.kind === 'building' && !t.built)) { nextOrder(u); break; }
      let near;
      if (t.kind === 'building') near = reachRect(u, t, dt, 8);
      else { near = edgeDist(u, t) <= 10; if (!near) moveTo(u, t.x, t.y, dt, u.r + t.r + 6); }
      if (near) {
        t.hp = Math.min(t.def.hp, t.hp + t.def.hp / (t.def.time || 30) * dt * 0.9);
        u.working = true;
        u.facing = turnTo(u.facing, Math.atan2(t.y - u.y, t.x - u.x), 10 * dt);
        if (G.tick % 9 === 0) fx('weld', u.x + Math.cos(u.facing) * 13, u.y + Math.sin(u.facing) * 13);
      }
      break;
    }
    case 'enter': {
      const b = byId(o.target);
      if (!b || !b.built || b.team !== u.team || !b.def.bunker || b.loaded.length >= b.def.bunker || !u.def.infantry) { nextOrder(u); break; }
      if (reachRect(u, b, dt, 8)) {
        stopUnit(u);
        b.loaded.push(u.id);
        u.inside = b.id; u.insideType = 'bunker'; u.hidden = true; u.x = b.x; u.y = b.y;
        G.dirty = true; UI.dirty = true;
        if (u.team === 0) Sound.play('load');
      }
      break;
    }
    default: nextOrder(u);
  }
}
function idle(u, dt, hold) {
  if (u.def.healer) { healStep(u, dt, !hold); return; }
  if (!u.def.weapon) return;
  if (u.def.worker && !hold) {   // 일꾼은 맞았을 때만 근처 적에게 반격
    const a = byId(u.lastHitBy);
    if (a && G.time - u.lastHitAt < 1.5 && weaponFor(u, a) && edgeDist(u, a) < 24) engage(u, a, dt, true);
    return;
  }
  const w = curWeapon(u);
  const range = hold ? weaponRange(u, w) : acquireRange(u);
  let t = seek(u, range);
  if (!t && !hold) {
    const a = byId(u.lastHitBy);
    if (a && G.time - u.lastHitAt < 2 && isTargetable(u.team, a) && weaponFor(u, a)) { t = a; u.target = a.id; }
  }
  if (t) engage(u, t, dt, !hold && !u.sieged);
}
function updateInside(u, dt) {
  const b = byId(u.inside);
  if (!b) { u.inside = 0; u.hidden = false; return; }
  if (u.insideType !== 'bunker' || !u.def.weapon) return;
  const w = u.def.weapon, range = weaponRange(u, w) + 32;
  let t = byId(u.target);
  if (!t || !isTargetable(u.team, t) || !weaponFor(u, t) || edgeDist(b, t) > range) {
    t = acquireTarget(u, range, b);
    u.target = t ? t.id : 0;
  }
  if (t && u.cd <= 0) fire(u, t, w, b);
}
function unloadBunker(b) {
  for (const id of b.loaded) {
    const u = byId(id);
    if (!u) continue;
    const p = findSpawnPos(b, u.r, b.x + randf(-20, 20), b.y + 200);
    u.x = p.x; u.y = p.y; u.lastX = p.x; u.lastY = p.y;
    u.inside = 0; u.insideType = ''; u.hidden = false; u.target = 0;
  }
  b.loaded = [];
  UI.dirty = true;
}

// ───────────────────────── 메딕 치료 ─────────────────────────
function findHealTarget(u, range) {
  let best = null, bs = Infinity;
  Grid.query(u.x, u.y, range, healList);
  for (const v of healList) {
    if (v === u || v.team !== u.team || !v.def.bio || v.hp >= v.def.hp || v.hidden) continue;
    const d = Math.hypot(v.x - u.x, v.y - u.y);
    if (d > range + v.r) continue;
    const s = d + (v.hp / v.def.hp) * 80;
    if (s < bs) { bs = s; best = v; }
  }
  return best;
}
function healStep(u, dt, canMove) {
  let t = byId(u.healTarget);
  if (t && (t.hp >= t.def.hp || t.hidden || Math.hypot(t.x - u.x, t.y - u.y) > 8 * TILE)) t = null;
  if (!t || (G.tick + u.id) % 20 === 0) t = findHealTarget(u, canMove ? 6 * TILE : 40) || t;
  u.healTarget = t ? t.id : 0;
  if (!t || u.energy < 1) return false;
  if (edgeDist(u, t) <= 28) {
    const amt = Math.min(9 * dt, t.def.hp - t.hp, u.energy * 2);
    t.hp += amt; u.energy -= amt / 2; u.healing = t.id;
    u.facing = turnTo(u.facing, Math.atan2(t.y - u.y, t.x - u.x), 10 * dt);
    if ((G.tick + u.id) % 40 === 0) Sound.at('heal', u.x, u.y);
    return true;
  }
  if (canMove) { moveTo(u, t.x, t.y, dt, u.r + t.r + 18); return true; }
  return false;
}

// ───────────────────────── 채취 ─────────────────────────
function nearestTownhall(team, x, y) {
  let best = null, bd = Infinity;
  for (const b of G.buildings) {
    if (b.team !== team || b.dead || !b.built || !b.def.townhall) continue;
    const d = (b.x - x) ** 2 + (b.y - y) ** 2;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function mineralsNear(x, y, r) { return G.resources.filter(m => m.kind === 'mineral' && !m.dead && Math.hypot(m.x - x, m.y - y) < r); }
// 이 광물을 맡은 일꾼 수
function assignedTo(id) {
  let n = 0;
  for (const u of G.units) { const o = u.orders[0]; if (o && o.type === 'gather' && o.res === id && !u.dead) n++; }
  return n;
}
// 가깝고 덜 붐비는 광물
function findMineralNear(x, y, u, r) {
  let best = null, bs = Infinity;
  for (const m of mineralsNear(x, y, r)) {
    const s = Math.hypot(m.x - u.x, m.y - u.y) + assignedTo(m.id) * 110;
    if (s < bs) { bs = s; best = m; }
  }
  return best;
}
function deposit(u) {
  if (!u.carry) return;
  const T = G.teams[u.team];
  if (u.carry.type === 'm') { T.m += u.carry.amt; T.stats.minerals += u.carry.amt; }
  else { T.g += u.carry.amt; T.stats.gas += u.carry.amt; }
  u.carry = null;
}
function autoGather(u) {
  const th = nearestTownhall(u.team, u.x, u.y);
  const m = th ? findMineralNear(th.x, th.y, u, 11 * TILE) : findMineralNear(u.x, u.y, u, 12 * TILE);
  if (m) issue(u, { type: 'gather', res: m.id, st: 'go' });
}
function gatherStep(u, o, dt) {
  let res = byId(o.res);
  if (u.carry && o.st !== 'back') {
    // 다른 종류를 들고 있거나 이미 캤으면 먼저 반납
    o.st = 'back';
  }
  if (o.st === 'back') {
    const th = nearestTownhall(u.team, u.x, u.y);
    if (!th) { nextOrder(u); return; }
    if (reachRect(u, th, dt, 6)) { deposit(u); o.st = 'go'; }
    return;
  }
  const isGas = res && res.kind === 'building';
  if (!res || (isGas && (!res.built || res.team !== u.team)) || (res.kind === 'mineral' && res.amount <= 0)) {
    const alt = isGas ? null : findMineralNear(o.lx ?? u.x, o.ly ?? u.y, u, 10 * TILE);
    if (!alt) { nextOrder(u); return; }
    o.res = alt.id; res = alt;
  }
  o.lx = res.x; o.ly = res.y;
  u.lastRes = res.id;
  if (res.kind === 'mineral') {
    if (o.st === 'mine') {
      if (res.miner !== u.id) { o.st = 'go'; return; }
      o.t -= dt; u.working = true;
      u.facing = turnTo(u.facing, Math.atan2(res.y - u.y, res.x - u.x), 10 * dt);
      if ((G.tick + u.id) % 14 === 0) fx('mspark', u.x + Math.cos(u.facing) * 13, u.y + Math.sin(u.facing) * 13);
      if (o.t <= 0) {
        const amt = Math.min(carryAmt(u.team), res.amount);
        res.amount -= amt; res.miner = 0;
        u.carry = { type: 'm', amt };
        if (res.amount <= 0) {
          res.dead = true; G.dirty = true;
          for (let y = res.ty; y < res.ty + res.h; y++) for (let x = res.tx; x < res.tx + res.w; x++) World.occ[tIdx(x, y)] = 0;
        }
        o.st = 'back';
      }
      return;
    }
    if (reachRect(u, res, dt, 5)) {
      const holder = byId(res.miner);
      if (!holder || holder === u || !holder.orders[0] || holder.orders[0].res !== res.id || holder.orders[0].st !== 'mine') {
        res.miner = u.id; o.st = 'mine'; o.t = MINE_TIME;
      } else {
        // 다른 일꾼이 캐는 중 → 덜 붐비는 빈 광물이 있으면 옮기고, 없으면 기다린다
        const load = assignedTo(res.id);
        let alt = null, bd = Infinity;
        for (const m of mineralsNear(res.x, res.y, 5 * TILE)) {
          if (m === res || (m.miner && byId(m.miner))) continue;
          const n = assignedTo(m.id);
          if (n + 1 >= load && n > 0) continue;
          const d = Math.hypot(m.x - u.x, m.y - u.y) + n * 110;
          if (d < bd) { bd = d; alt = m; }
        }
        if (alt) { o.res = alt.id; u.reachId = 0; }
      }
    }
  } else if (reachRect(u, res, dt, 5) && !res.gasIn) {
    res.gasIn = u.id; res.gasT = GAS_TIME;
    u.inside = res.id; u.insideType = 'gas'; u.hidden = true;
  }
}

// ───────────────────────── 건설 ─────────────────────────
function buildStep(u, o, dt) {
  const def = BUILDINGS[o.key];
  let b = byId(o.bid);
  if (o.bid && (!b || b.built)) { nextOrder(u); return; }
  if (!b) {
    const rx = o.tx * TILE, ry = o.ty * TILE, rw = def.w * TILE, rh = def.h * TILE;
    if (rectDist(u.x, u.y, rx, ry, rw, rh) > u.r + 6) { moveTo(u, clamp(u.x, rx, rx + rw), clamp(u.y, ry, ry + rh), dt, 0); return; }
    if (!canPlace(o.key, o.tx, o.ty, u.team)) {
      if (u.team === 0) UI.error('그곳에는 건설할 수 없습니다.');
      nextOrder(u);
      return;
    }
    b = createBuilding(o.key, u.team, o.tx, o.ty, false);
    o.bid = b.id; o.paid = false;
    b.builder = u.id;
    if (u.team === 0) Sound.play('place');
  }
  if (rectDist(u.x, u.y, b.tx * TILE, b.ty * TILE, b.w * TILE, b.h * TILE) > u.r + 10) { reachRect(u, b, dt, 6); return; }
  const other = byId(b.builder);
  if (other && other !== u && other.orders[0] && other.orders[0].bid === b.id) { nextOrder(u); return; }
  b.builder = u.id;
  u.working = true;
  u.facing = turnTo(u.facing, Math.atan2(b.y - u.y, b.x - u.x), 10 * dt);
  if ((G.tick + u.id) % 8 === 0) fx('weld', u.x + Math.cos(u.facing) * 13, u.y + Math.sin(u.facing) * 13);
  const k = dt / def.time;
  b.progress = Math.min(1, b.progress + k);
  b.hp = Math.min(def.hp, b.hp + def.hp * 0.9 * k);
  if (b.progress >= 1) {
    completeBuilding(b);
    nextOrder(u);
    // 다 지으면 하던 채취로 돌아간다
    const r = byId(u.lastRes);
    if (!u.orders.length && r && (r.kind === 'mineral' || r.team === u.team)) issue(u, { type: 'gather', res: r.id, st: 'go' });
  }
}
function morphStep(u, o, dt) {
  const def = BUILDINGS[o.key];
  const cx = (o.tx + def.w / 2) * TILE, cy = (o.ty + def.h / 2) * TILE;
  if (Math.hypot(cx - u.x, cy - u.y) > 20 && rectDist(u.x, u.y, o.tx * TILE, o.ty * TILE, def.w * TILE, def.h * TILE) > (def.onGeyser ? u.r + 6 : 0)) {
    if (def.onGeyser) reachRect(u, { tx: o.tx, ty: o.ty, w: def.w, h: def.h, id: -1 }, dt, 6);
    else moveTo(u, cx, cy, dt, 8);
    return;
  }
  if (!canPlace(o.key, o.tx, o.ty, u.team)) { nextOrder(u); return; }
  o.paid = false;
  // 드론이 건물로 변태한다
  u.dead = true; G.dirty = true;
  G.teams[u.team].supUsed -= u.def.supply;
  for (const od of u.orders) if (od.type === 'gather') { const r = byId(od.res); if (r && r.miner === u.id) r.miner = 0; }
  createBuilding(o.key, u.team, o.tx, o.ty, false);
}
function completeBuilding(b, silent) {
  b.built = true; b.progress = 1;
  if (silent) b.hp = b.def.hp;
  recalcSupply(b.team);
  if (b.def.race === 'Z') recomputeCreep();
  if (b.team === 0 && !silent) {
    UI.msg(`${b.def.name} 건설 완료`, 'ok');
    Sound.play('complete');
    G.teams[0].stats.built++;
  }
  UI.dirty = true;
}
function cancelConstruction(b) {
  if (b.built || b.dead) return;
  refund(b.team, b.def.cost, 0.75);
  const bu = byId(b.builder);
  b.hp = 0;
  kill(b, null);
  G.teams[b.team].stats.lost--;
  if (bu) stopUnit(bu);
}

// ───────────────────────── 생산 · 연구 ─────────────────────────
function trainAt(b, key, notify) {
  const def = UNITS[key];
  if (b.queue.length >= 5) { if (notify) UI.error('생산 대기열이 가득 찼습니다.'); return false; }
  if (!canAfford(b.team, def.cost, def.supply, notify)) return false;
  spend(b.team, def.cost);
  G.teams[b.team].supUsed += def.supply;
  b.queue.push({ key, t: def.time, total: def.time });
  UI.dirty = true;
  return true;
}
function researchAt(b, key, notify) {
  const T = G.teams[b.team], R = RESEARCH[key], lvl = T.upg[key] || 0;
  if (lvl >= (R.levels || 1)) return false;
  if (T.researching[key]) { if (notify) UI.error('이미 연구 중입니다.'); return false; }
  if (b.queue.length) { if (notify) UI.error('이 건물은 다른 작업 중입니다.'); return false; }
  const cost = researchCost(key, lvl), time = researchTime(key, lvl);
  if (!canAfford(b.team, cost, 0, notify)) return false;
  spend(b.team, cost);
  T.researching[key] = true;
  b.queue.push({ key, research: true, t: time, total: time, cost });
  UI.dirty = true;
  return true;
}
function cancelQueue(b, i) {
  if (i === undefined) i = b.queue.length - 1;
  const q = b.queue[i];
  if (!q) return;
  b.queue.splice(i, 1);
  const T = G.teams[b.team];
  if (q.research) { refund(b.team, q.cost); delete T.researching[q.key]; }
  else { refund(b.team, UNITS[q.key].cost); T.supUsed -= UNITS[q.key].supply; }
  if (i === 0 && b.queue[0]) b.queue[0].t = b.queue[0].total;
  UI.dirty = true;
}
function finishQueue(b, q) {
  const T = G.teams[b.team];
  if (q.research) {
    T.upg[q.key] = (T.upg[q.key] || 0) + 1;
    delete T.researching[q.key];
    if (b.team === 0) {
      const R = RESEARCH[q.key];
      UI.msg(`${R.name}${R.levels ? ' ' + T.upg[q.key] + '단계' : ''} 연구 완료`, 'ok');
      Sound.play('complete');
    }
    UI.dirty = true;
    return;
  }
  const def = UNITS[q.key];
  const toward = b.rally ? b.rally : { x: b.x, y: b.y + 999 };
  const p = findSpawnPos(b, def.r, toward.x, toward.y);
  const u = createUnit(q.key, b.team, p.x, p.y);
  T.stats.produced++;
  if (b.team === 0) Sound.play('ready');
  applyRally(u, b.rally);
}
function applyRally(u, rally) {
  if (rally) {
    const tgt = byId(rally.target);
    if (tgt && tgt.kind === 'mineral' && u.def.worker) { issue(u, { type: 'gather', res: tgt.id, st: 'go' }); return; }
    if (tgt && tgt.kind === 'building' && tgt.def.onGeyser && tgt.built && tgt.team === u.team && u.def.worker) { issue(u, { type: 'gather', res: tgt.id, st: 'go' }); return; }
    issue(u, { type: 'move', x: rally.x, y: rally.y });
  } else if (u.def.worker) autoGather(u);
}
function hatchEgg(b, e) {
  const def = UNITS[e.key];
  for (let i = 0; i < e.count; i++) {
    const p = findSpawnPos(b, def.r, e.x + randf(-8, 8), e.y + randf(-8, 8));
    const u = def.air ? createUnit(e.key, b.team, e.x, e.y) : createUnit(e.key, b.team, p.x, p.y);
    G.teams[b.team].stats.produced++;
    if (def.provides) recalcSupply(b.team);
    if (u.def.worker) autoGather(u);
  }
}

// ───────────────────────── 건물 갱신 ─────────────────────────
function updateBuilding(b, dt) {
  b.anim += dt;
  if (b.flash > 0) b.flash -= dt;
  if (b.fireT > 0) b.fireT -= dt;
  if (!b.built) {
    if (b.def.race === 'Z') {
      const k = dt / b.def.time;
      b.progress = Math.min(1, b.progress + k);
      b.hp = Math.min(b.def.hp, b.hp + b.def.hp * 0.9 * k);
      if (b.progress >= 1) completeBuilding(b);
    }
    return;
  }
  if (b.def.race === 'Z' && b.hp < b.def.hp) b.hp = Math.min(b.def.hp, b.hp + 0.6 * dt);
  if (b.def.race === 'T' && b.hp < b.def.hp * 0.33) {   // 테란 건물은 크게 부서지면 불타며 무너진다
    b.hp -= 1.3 * dt;
    if (b.hp <= 0) { kill(b, byId(b.lastHitBy)); return; }
  }
  if (b.queue.length) {
    const q = b.queue[0];
    q.t -= dt;
    if (q.t <= 0) { b.queue.shift(); finishQueue(b, q); }
  }
  if (b.key === 'hatchery') {
    if (b.larva < 3) {
      b.larvaT += dt;
      if (b.larvaT >= DIFF[G.difficulty].larva) { b.larvaT = 0; b.larva++; }
    }
    for (let i = b.eggs.length - 1; i >= 0; i--) {
      const e = b.eggs[i];
      e.t -= dt;
      if (e.t <= 0) { b.eggs.splice(i, 1); hatchEgg(b, e); }
    }
  }
  if (b.gasIn) {
    b.gasT -= dt;
    if (b.gasT <= 0) {
      const u = byId(b.gasIn);
      b.gasIn = 0;
      if (u) {
        const gy = byId(b.geyser);
        const amt = gy && gy.amount > 0 ? Math.min(carryAmt(u.team), gy.amount) : 2;
        if (gy) gy.amount = Math.max(0, gy.amount - amt);
        u.carry = { type: 'g', amt };
        u.inside = 0; u.insideType = ''; u.hidden = false;
        const th = nearestTownhall(u.team, b.x, b.y);
        const p = findSpawnPos(b, u.r, th ? th.x : b.x, th ? th.y : b.y + 99);
        u.x = p.x; u.y = p.y; u.lastX = p.x; u.lastY = p.y;
        const o = u.orders[0];
        if (o && o.type === 'gather') o.st = 'back';
      }
    }
  }
  if (b.def.weapon) {
    if (b.cd > 0) b.cd -= dt;
    const w = b.def.weapon;
    let t = byId(b.target);
    if (!t || !isTargetable(b.team, t) || !weaponFor(b, t) || edgeDist(b, t) > w.range) {
      t = acquireTarget(b, w.range, b);
      b.target = t ? t.id : 0;
    }
    if (t && b.cd <= 0) fire(b, t, w, b);
  }
}

// ───────────────────────── 겹침 풀기 ─────────────────────────
function separate() {
  for (const u of G.units) {
    if (u.dead || u.hidden || u.air) continue;
    Grid.query(u.x, u.y, u.r + 20, sepList);
    for (const v of sepList) {
      if (v.id <= u.id || v.dead || v.hidden || v.air) continue;
      if (u.phase && v.phase) continue;   // 자원 캐는 일꾼끼리는 서로 지나간다
      const dx = v.x - u.x, dy = v.y - u.y, min = u.r + v.r - 2;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      let d = Math.sqrt(d2), nx, ny;
      if (d < 0.01) { const a = Math.random() * TAU; nx = Math.cos(a); ny = Math.sin(a); d = 0.01; } else { nx = dx / d; ny = dy / d; }
      const push = Math.min(min - d, 6) * 0.5;
      let wu = 0.5, wv = 0.5;
      if (u.moving && !v.moving) { wu = 0.2; wv = 0.8; } else if (!u.moving && v.moving) { wu = 0.8; wv = 0.2; }
      if (u.sieged || u.working) { wu = 0; wv = 1; }
      if (v.sieged || v.working) { wv = 0; wu = u.sieged || u.working ? 0 : 1; }
      if (wu) tryMove(u, u.x - nx * push * wu * 2, u.y - ny * push * wu * 2);
      if (wv) tryMove(v, v.x + nx * push * wv * 2, v.y + ny * push * wv * 2);
    }
  }
}

// ───────────────────────── 탄환 · 효과 ─────────────────────────
function fx(type, x, y, extra) {
  const life = { tracer: 0.07, muzzle: 0.07, spark: 0.22, flame: 0.4, boom: 0.65, bigboom: 0.9, splat: 0.4, slash: 0.16, spike: 0.55, shell: 0.08, weld: 0.3, mspark: 0.3, ping: 0.55 }[type] || 0.4;
  const e = { type, x, y, t: 0, life, seed: Math.random() };
  if (extra) Object.assign(e, extra);
  if (e.delay) e.t = -e.delay;
  G.effects.push(e);
  return e;
}
function updateProjectiles(dt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const p = G.projectiles[i], t = byId(p.tid);
    if (!t || t.hidden) { G.projectiles.splice(i, 1); continue; }
    const ty = aimY(t), dx = t.x - p.x, dy = ty - p.y, d = Math.hypot(dx, dy), s = p.spd * dt;
    p.a = Math.atan2(dy, dx);
    if (d <= s + 4) {
      G.projectiles.splice(i, 1);
      applyDamage(t, p.dmg, byId(p.aid) || { id: p.aid, team: p.aTeam });
      fx('splat', t.x, ty, { c: '#d6e86a', s: 0.35 });
      continue;
    }
    p.x += dx / d * s; p.y += dy / d * s;
  }
}
function updateEffects(dt) {
  let n = 0;
  for (const e of G.effects) { e.t += dt; if (e.t < e.life) G.effects[n++] = e; }
  G.effects.length = n;
  n = 0;
  for (const d of G.decals) { d.t += dt; if (d.t < d.life) G.decals[n++] = d; }
  G.decals.length = n;
  if (G.decals.length > 80) G.decals.splice(0, G.decals.length - 80);
}

// ───────────────────────── 경보 ─────────────────────────
const Alerts = {
  last: -99, pings: [],
  hit(t) {
    if (G.state !== 'play' || G.time - this.last < 10) return;
    if (View.inView(t.x, t.y, -40)) return;
    this.last = G.time;
    G.lastAlert = { x: t.x, y: t.y };
    this.pings.push({ x: t.x, y: t.y, t: 0 });
    UI.msg(t.kind === 'building' ? '기지가 공격받고 있습니다!' : '아군이 공격받고 있습니다!', 'warn');
    Sound.play('alert');
  },
};

// ───────────────────────── 한 걸음 ─────────────────────────
function step(dt) {
  G.time += dt; G.tick++;
  Grid.build();
  processPaths(24);
  for (let i = 0; i < G.units.length; i++) { const u = G.units[i]; if (!u.dead) updateUnit(u, dt); }
  for (let i = 0; i < G.buildings.length; i++) { const b = G.buildings[i]; if (!b.dead) updateBuilding(b, dt); }
  separate();
  updateProjectiles(dt);
  updateEffects(dt);
  for (const p of Alerts.pings) p.t += dt;
  Alerts.pings = Alerts.pings.filter(p => p.t < 4);
  if (G.tick % 4 === 0) Fog.update();
  AI.tick(dt);
  if (G.dirty) sweep();
  if (G.tick % 30 === 0) checkEnd();
}
function sweep() {
  G.dirty = false;
  const alive = e => { if (e.dead) { G.byId.delete(e.id); return false; } return true; };
  G.units = G.units.filter(alive);
  G.buildings = G.buildings.filter(alive);
  G.resources = G.resources.filter(alive);
  const n = G.selection.length;
  G.selection = G.selection.filter(e => !e.dead && !(e.inside && e.insideType === 'bunker'));
  if (n !== G.selection.length) UI.dirty = true;
}
function checkEnd() {
  if (G.state !== 'play') return;
  const has = t => G.buildings.some(b => b.team === t && !b.dead);
  if (!has(1)) Game.end(0);
  else if (!has(0)) Game.end(1);
}
