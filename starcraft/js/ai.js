'use strict';
// ───────────────────────── 컴퓨터 (저그) ─────────────────────────
// 0.25초마다 생각한다: 일꾼 배치 → 건물 계획 → 애벌레 생산 → 군대 운용
const AI = {
  acc: 0,
  init(T) {
    const D = DIFF[G.difficulty];
    const home = World.bases.find(b => b.main && b.side === 1);
    T.ai = {
      D, home, nextWave: D.firstWave, waveSize: D.firstSize, waves: 0, nextBuild: 0, upgIdx: 0, nextDrift: 0,
      rally: { x: home.rampTop.x * TILE, y: home.rampTop.y * TILE },
    };
    this.acc = 0;
  },
  tick(dt) {
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    this.think();
  },
  think() {
    const T = G.teams[1], ai = T && T.ai;
    if (!ai) return;
    const D = ai.D, t = G.time;
    const mine = G.buildings.filter(b => b.team === 1 && !b.dead);
    if (!mine.length) return;
    const units = G.units.filter(u => u.team === 1 && !u.dead);
    const drones = units.filter(u => u.key === 'drone');
    const army = units.filter(u => !u.def.worker && u.key !== 'overlord');
    const hatches = mine.filter(b => b.key === 'hatchery');
    const morphing = k => drones.filter(d => d.orders[0] && d.orders[0].type === 'morph' && d.orders[0].key === k).length;
    const count = k => mine.filter(b => b.key === k).length + morphing(k);
    const done = k => mine.some(b => b.key === k && b.built);

    this.manageDrones(drones, mine);
    while (ai.upgIdx < D.upg.length && t >= D.upg[ai.upgIdx]) {
      T.upg.zMelee++; T.upg.zRange++; T.upg.zCarapace++; ai.upgIdx++;
    }

    // 건물 계획
    let want = null;
    if (t >= ai.nextBuild && drones.length) {
      const sunkenGoal = t > 330 ? D.sunkens : t > 170 ? 1 : 0;
      const hatchGoal = t > D.expand + 330 ? 3 : t > D.expand ? 2 : 1;
      if (!hatches.length && !morphing('hatchery')) want = 'hatchery';
      else if (!count('pool') && (drones.length >= 9 || t > 110)) want = 'pool';
      else if (done('pool') && !count('extractor') && drones.length >= 10) want = 'extractor';
      else if (done('pool') && count('sunken') < sunkenGoal) want = 'sunken';
      else if (done('pool') && done('extractor') && !count('hydraden') && t > 220) want = 'hydraden';
      else if (count('hatchery') < hatchGoal) want = 'hatchery';
      else if (T.m > 500 && count('hatchery') < D.maxHatch && hatches.every(h => !h.built || h.larva === 0)) want = 'macro';
      else if (done('hydraden') && !count('ultracavern') && t > D.ultra) want = 'ultracavern';
      else if (hatches.length >= 2 && done('hydraden') && count('extractor') < 2) want = 'extractor';
    }
    if (want) {
      const c = BUILDINGS[want === 'macro' ? 'hatchery' : want].cost;
      if (T.m >= c[0] && T.g >= c[1]) {
        ai.nextBuild = t + (this.build(want, drones, hatches) ? 4 : 3);
        want = null;
      }
    }
    const reserve = want ? BUILDINGS[want === 'macro' ? 'hatchery' : want].cost : [0, 0];
    this.produce(T, ai, hatches, drones, army, reserve, done);
    this.command(T, ai, army, mine, units);
  },

  // 일꾼: 놀고 있으면 광물로, 익스트랙터마다 3마리
  manageDrones(drones, mine) {
    const load = new Map();
    for (const d of drones) { const o = d.orders[0]; if (o && o.type === 'gather') load.set(o.res, (load.get(o.res) || 0) + 1); }
    const T = G.teams[1];
    for (const ex of mine) {
      if (ex.key !== 'extractor' || !ex.built || drones.length < 9) continue;
      if (T.g > 1000) {   // 가스가 넘치면 한 마리씩 광물로 돌린다
        const d = drones.find(d => !d.inside && !d.carry && d.orders[0] && d.orders[0].type === 'gather' && d.orders[0].res === ex.id);
        if (d) { stopUnit(d); load.set(ex.id, (load.get(ex.id) || 1) - 1); }
        continue;
      }
      if ((load.get(ex.id) || 0) >= 3 || T.g > 600) continue;
      const d = drones.find(d => !d.inside && !d.carry && (!d.orders.length || (d.orders[0].type === 'gather' && (byId(d.orders[0].res) || {}).kind === 'mineral')));
      if (d) { issue(d, { type: 'gather', res: ex.id, st: 'go' }); load.set(ex.id, (load.get(ex.id) || 0) + 1); }
    }
    for (const d of drones) {
      if (d.orders.length || d.inside) continue;
      let best = null, bs = Infinity;
      for (const h of mine) {
        if (h.key !== 'hatchery' || !h.built) continue;
        for (const m of mineralsNear(h.x, h.y, 11 * TILE)) {
          const s = (load.get(m.id) || 0) * 400 + Math.hypot(m.x - d.x, m.y - d.y);
          if (s < bs) { bs = s; best = m; }
        }
      }
      if (best) { issue(d, { type: 'gather', res: best.id, st: 'go' }); load.set(best.id, (load.get(best.id) || 0) + 1); }
    }
  },

  build(key, drones, hatches) {
    const macro = key === 'macro';
    if (macro) key = 'hatchery';
    const def = BUILDINGS[key];
    let spot = null;
    if (key === 'extractor') {
      for (const h of hatches) {
        if (!h.built) continue;
        const g = G.resources.find(r => r.kind === 'geyser' && !r.dead && !r.refinery && Math.hypot(r.x - h.x, r.y - h.y) < 12 * TILE && !this.reserved(r.tx, r.ty, 3, 2));
        if (g) { spot = { tx: g.tx, ty: g.ty }; break; }
      }
    } else if (key === 'hatchery') {
      spot = macro ? this.findSpot('hatchery', hatches.find(h => h.built && h.tx === G.teams[1].ai.home.tx && h.ty === G.teams[1].ai.home.ty) || hatches[0]) : this.nextBase();
    } else {
      const home = G.teams[1].ai.home;
      const order = hatches.filter(h => h.built).sort((a, b) => (a.tx === home.tx && a.ty === home.ty ? -1 : 0) - (b.tx === home.tx && b.ty === home.ty ? -1 : 0));
      for (const h of order) { spot = this.findSpot(key, h); if (spot) break; }
    }
    if (!spot || !canPlace(key, spot.tx, spot.ty, 1)) return false;
    const cx = (spot.tx + def.w / 2) * TILE, cy = (spot.ty + def.h / 2) * TILE;
    let best = null, bd = Infinity;
    for (const d of drones) {
      if (d.inside || (d.orders[0] && d.orders[0].type === 'morph')) continue;
      const dd = Math.hypot(d.x - cx, d.y - cy) + (d.carry ? 200 : 0);
      if (dd < bd) { bd = dd; best = d; }
    }
    if (!best) return false;
    spend(1, def.cost);
    issue(best, { type: 'morph', key, tx: spot.tx, ty: spot.ty, paid: true });
    return true;
  },
  // 다른 드론이 변태하러 가는 자리와 겹치는지
  reserved(tx, ty, w, h) {
    for (const d of G.units) {
      const o = d.team === 1 && d.orders[0];
      if (!o || o.type !== 'morph') continue;
      const D = BUILDINGS[o.key];
      if (tx < o.tx + D.w + 1 && tx + w + 1 > o.tx && ty < o.ty + D.h + 1 && ty + h + 1 > o.ty) return true;
    }
    return false;
  },
  gapOk(tx, ty, w, h) {
    for (let y = ty - 1; y <= ty + h; y++) for (let x = tx - 1; x <= tx + w; x++) if (inMap(x, y) && World.occ[tIdx(x, y)]) return false;
    return true;
  },
  baseOf(h) {
    let best = null, bd = Infinity;
    for (const b of World.bases) { const d = Math.hypot(b.cx - (h.tx + 2), b.cy - (h.ty + 1.5)); if (d < bd) { bd = d; best = b; } }
    return bd < 4 ? best : null;
  },
  findSpot(key, h) {
    const def = BUILDINGS[key], base = this.baseOf(h);
    const cx = h.tx + h.w / 2, cy = h.ty + h.h / 2;
    let fx0 = MAP_W / 2, fy0 = MAP_H / 2;
    if (base && base.main) { fx0 = cx + Math.cos(base.rampA) * 6; fy0 = cy + Math.sin(base.rampA) * 6; }
    else { const a = Math.atan2(MAP_H / 2 - cy, MAP_W / 2 - cx); fx0 = cx + Math.cos(a) * 5; fy0 = cy + Math.sin(a) * 5; }
    let best = null, bs = Infinity;
    for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) {
      const tx = Math.round(cx + dx - def.w / 2), ty = Math.round(cy + dy - def.h / 2);
      if (!canPlace(key, tx, ty, 1) || !this.gapOk(tx, ty, def.w, def.h) || this.reserved(tx, ty, def.w, def.h)) continue;
      const mx = tx + def.w / 2, my = ty + def.h / 2;
      if (base) {   // 광물 줄 쪽은 비워 둔다
        const vx = mx - base.cx, vy = my - base.cy, l = Math.hypot(vx, vy) || 1;
        if (l < 9.5 && (vx * base.away[0] + vy * base.away[1]) / l > -0.15) continue;
      }
      const s = key === 'sunken' ? Math.hypot(mx - fx0, my - fy0) : Math.hypot(mx - cx, my - cy) + Math.random() * 1.5;
      if (s < bs) { bs = s; best = { tx, ty }; }
    }
    return best;
  },
  nextBase() {
    const home = G.teams[1].ai.home;
    const cands = World.bases.slice().sort((a, b) => Math.hypot(a.cx - home.cx, a.cy - home.cy) - Math.hypot(b.cx - home.cx, b.cy - home.cy));
    for (const b of cands) {
      if (G.buildings.some(x => !x.dead && x.def.townhall && Math.abs(x.tx - b.tx) < 3 && Math.abs(x.ty - b.ty) < 3)) continue;
      if (G.buildings.some(x => !x.dead && x.team === 0 && Math.hypot(x.x / TILE - b.cx, x.y / TILE - b.cy) < 12)) continue;
      if (this.reserved(b.tx, b.ty, 4, 3)) continue;
      if (!mineralsNear(b.cx * TILE, b.cy * TILE, 10 * TILE).length) continue;
      if (canPlace('hatchery', b.tx, b.ty, 1)) return { tx: b.tx, ty: b.ty };
    }
    return null;
  },

  // 애벌레를 일꾼·군대·오버로드로
  produce(T, ai, hatches, drones, army, reserve, done) {
    const D = ai.D, t = G.time;
    let eggDrones = 0, eggLords = 0, eggArmy = 0;
    for (const h of hatches) for (const e of h.eggs) {
      if (e.key === 'drone') eggDrones++; else if (e.key === 'overlord') eggLords++; else eggArmy += e.sup;
    }
    let nDrones = drones.length + eggDrones;
    let armySup = army.reduce((s, u) => s + u.def.supply, 0) + eggArmy;
    const extractors = G.buildings.filter(b => b.team === 1 && b.key === 'extractor' && !b.dead).length;
    const doneHatches = hatches.filter(h => h.built).length;
    const mining = hatches.filter(h => h.built && mineralsNear(h.x, h.y, 11 * TILE).length).length;
    const droneGoal = Math.min(D.maxDrones, 4 + 8 * Math.max(1, mining) + 3 * extractors);
    const armyGoal = t > ai.nextWave - 100 ? ai.waveSize : t > 130 ? 2 : 0;
    for (const h of hatches) {
      if (!h.built) continue;
      while (h.larva > 0) {
        const m = T.m - reserve[0], g = T.g - reserve[1];
        const free = T.supCap - T.supUsed;
        let key = null;
        if (T.supCap < 200 && free < 2 + doneHatches * 2 && eggLords < (T.supUsed > 60 ? 2 : 1)) key = 'overlord';
        else if (nDrones < droneGoal && (!done('pool') || armySup >= armyGoal || nDrones < 11)) key = 'drone';
        else key = this.armyPick(done, m, g);
        if (!key) break;
        const def = UNITS[key], cnt = key === 'zergling' ? 2 : 1;
        const cost = [def.cost[0] * cnt, def.cost[1] * cnt], sup = def.supply * cnt;
        if (m < cost[0] || g < cost[1]) break;
        if (sup > 0 && T.supUsed + sup > T.supCap) break;
        spend(1, cost);
        T.supUsed += sup;
        h.larva--;
        const side = Math.random() < 0.5 ? -1 : 1;
        const ex = h.x + side * randf(h.w * 8, h.w * 18), ey = h.y + h.h * TILE / 2 + randf(4, 14);
        h.eggs.push({ key, count: cnt, t: def.time, total: def.time, x: ex, y: ey, sup });
        if (key === 'drone') nDrones++;
        else if (key === 'overlord') eggLords++;
        else armySup += sup;
      }
    }
  },
  armyPick(done, m, g) {
    if (!done('pool')) return null;
    const r = Math.random();
    if (done('ultracavern') && m >= 200 && g >= 200 && r < 0.3) return 'ultralisk';
    if (done('hydraden') && g >= 25 && m >= 75 && r < (g > 300 ? 0.85 : 0.6)) return 'hydralisk';
    return 'zergling';
  },

  playerTarget(x, y) {
    let best = null, bd = Infinity;
    for (const b of G.buildings) {
      if (b.team !== 0 || b.dead) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) return best;
    for (const u of G.units) {
      if (u.team !== 0 || u.dead || u.hidden) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  },
  command(T, ai, army, mine, units) {
    const t = G.time, D = ai.D;
    // 기지 근처의 적 찾기
    let threat = null;
    for (const e of G.units) {
      if (e.team !== 0 || e.dead || e.hidden) continue;
      if (mine.some(b => Math.abs(e.x - b.x) < 12 * TILE && Math.abs(e.y - b.y) < 12 * TILE)) { threat = e; break; }
    }
    if (!threat) for (const b of G.buildings) {
      if (b.team === 0 && !b.dead && mine.some(m => Math.hypot(m.x - b.x, m.y - b.y) < 14 * TILE)) { threat = b; break; }
    }
    if (threat) {
      for (const u of army) {
        if (u.wave && Math.hypot(u.x - threat.x, u.y - threat.y) > 30 * TILE) continue;
        const o = u.orders[0];
        if (!o || o.type !== 'amove' || Math.hypot(o.x - threat.x, o.y - threat.y) > 6 * TILE) issue(u, { type: 'amove', x: threat.x, y: threat.y });
      }
    } else {
      const armySup = army.reduce((s, u) => s + u.def.supply, 0);
      if (t >= ai.nextWave && armySup >= ai.waveSize) {
        const tgt = this.playerTarget(ai.home.cx * TILE, ai.home.cy * TILE);
        if (tgt) {
          for (const u of army) { u.wave = true; issue(u, { type: 'amove', x: tgt.x, y: tgt.y }); }
          ai.waves++;
          ai.waveSize = Math.min(D.maxWave, ai.waveSize + D.grow);
          ai.nextWave = t + D.waveGap;
        }
      }
      for (const u of army) {
        if (u.orders.length) continue;
        if (u.wave) {
          const tgt = this.playerTarget(u.x, u.y);
          if (tgt) issue(u, { type: 'amove', x: tgt.x, y: tgt.y });
        } else if (Math.hypot(u.x - ai.rally.x, u.y - ai.rally.y) > 4 * TILE) {
          issue(u, { type: 'amove', x: ai.rally.x + randf(-56, 56), y: ai.rally.y + randf(-56, 56) });
        }
      }
    }
    // 오버로드는 해처리 주변을 천천히 떠다닌다
    if (t >= ai.nextDrift) {
      ai.nextDrift = t + 6;
      const hs = mine.filter(b => b.key === 'hatchery');
      for (const u of units) {
        if (u.key !== 'overlord' || u.orders.length || !hs.length || Math.random() < 0.6) continue;
        const h = pick(hs), a = randf(0, TAU), r = randf(3, 8) * TILE;
        issue(u, { type: 'move', x: clamp(h.x + Math.cos(a) * r, 40, WORLD_W - 40), y: clamp(h.y + Math.sin(a) * r, 40, WORLD_H - 40) });
      }
    }
  },
};
