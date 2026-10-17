'use strict';
// ───────────────────────── 명령 (선택 · 이동 · 건설) ─────────────────────────
const ownSel = () => G.selection.filter(e => e.team === 0 && !e.dead);
function reqMet(team, req) { return !req || G.buildings.some(b => b.team === team && !b.dead && b.built && b.key === req); }

const Cmd = {
  pickAt(wx, wy, slack = 5) {
    let best = null, bd = Infinity;
    for (const u of G.units) {
      if (u.dead || u.hidden || !seenByPlayer(u)) continue;
      const d = Math.hypot(u.x - wx, aimY(u) - wy);
      if (d < u.r * UNIT_SCALE + slack && d < bd) { bd = d; best = u; }
    }
    if (best) return best;
    for (const b of G.buildings) {
      if (b.dead || (b.team !== 0 && !rectVisible(b) && !b.seen)) continue;
      if (wx >= b.tx * TILE && wx < (b.tx + b.w) * TILE && wy >= b.ty * TILE && wy < (b.ty + b.h) * TILE) return b;
    }
    for (const r of G.resources) {
      if (r.dead || !rectExplored(r)) continue;
      const top = r.kind === 'mineral' ? 14 : 0;
      if (wx >= r.tx * TILE && wx < (r.tx + r.w) * TILE && wy >= r.ty * TILE - top && wy < (r.ty + r.h) * TILE) return r;
    }
    return null;
  },
  select(list, add) {
    if (add) {
      const s = new Set(G.selection.filter(e => e.team === 0));
      for (const e of list) if (e.team === 0) s.add(e);
      list = [...s];
    }
    G.selection = list;
    G.card = 'main';
    if (G.mode && G.mode.type !== 'place') G.mode = null;
    UI.dirty = true;
    if (list.length && list[0].team === 0) Sound.play('select');
  },
  clickSelect(wx, wy, shift, sameType, slack) {
    const e = this.pickAt(wx, wy, slack);
    if (!e) { if (!shift) this.select([]); return; }
    if (sameType && e.team === 0) { this.selectType(e); return; }
    if (shift && e.team === 0 && e.kind === 'unit') {
      if (G.selection.includes(e)) { G.selection = G.selection.filter(x => x !== e); UI.dirty = true; }
      else this.select([e], true);
      return;
    }
    this.select([e]);
  },
  selectType(e) {
    const pool = e.kind === 'unit' ? G.units : G.buildings;
    const list = pool.filter(x => x.team === 0 && !x.dead && !x.hidden && x.key === e.key && View.inView(x.x, x.y, 10));
    this.select(list.length ? list : [e]);
  },
  boxSelect(a, b, add) {
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    let list = G.units.filter(u => u.team === 0 && !u.dead && !u.hidden && u.x + u.r >= x0 && u.x - u.r <= x1 && aimY(u) + u.r >= y0 && aimY(u) - u.r <= y1);
    if (!list.length) list = G.buildings.filter(bd => bd.team === 0 && !bd.dead && (bd.tx + bd.w) * TILE >= x0 && bd.tx * TILE <= x1 && (bd.ty + bd.h) * TILE >= y0 && bd.ty * TILE <= y1);
    if (list.length > 1 && list[0].kind === 'building') list = list.filter(bd => bd.key === list[0].key);
    if (!list.length && add) return;
    this.select(list, add);
  },
  selectArmy() {
    const list = G.units.filter(u => u.team === 0 && !u.dead && !u.hidden && !u.def.worker);
    if (!list.length) { UI.error('전투 유닛이 없습니다.'); return; }
    this.select(list);
  },
  ping(x, y, enemy) { fx('ping', x, y, { c: enemy ? '#ff6a50' : '#7dff9a' }); },

  groupMove(units, x, y, type, shift) {
    const movers = units.filter(u => !u.sieged && u.siegeT <= 0);
    if (!movers.length) return;
    const n = movers.length, gid = G.groupSeq++;
    let cx = 0, cy = 0;
    for (const u of movers) { cx += u.x; cy += u.y; }
    cx /= n; cy /= n;
    let spread = 0;
    for (const u of movers) spread = Math.max(spread, Math.hypot(u.x - cx, u.y - cy));
    const formation = n > 1 && spread < 5 * TILE && Math.hypot(x - cx, y - cy) > spread + 2 * TILE;
    const gr = Math.sqrt(n) * 14 + 10;
    for (const u of movers) {
      let tx = x, ty = y;
      if (formation) {
        tx = x + (u.x - cx) * 0.8; ty = y + (u.y - cy) * 0.8;
        if (!u.air && !walkableCircle(tx, ty, u.r * 0.7)) { tx = x; ty = y; }
      }
      const t = type === 'amove' && !u.def.weapon && !u.def.healer ? 'move' : type;
      issue(u, { type: t, x: tx, y: ty, group: gid, gr, formation }, shift);
    }
  },
  // 오른쪽 클릭 (터치에서는 빈 곳 누르기)
  smart(wx, wy, shift) {
    const sel = ownSel();
    if (!sel.length) return;
    const tgt = this.pickAt(wx, wy, Input.touchMode ? 10 : 5);
    const units = sel.filter(e => e.kind === 'unit');
    if (!units.length) {
      const rally = { x: wx, y: wy, target: tgt && (tgt.kind === 'mineral' || (tgt.kind === 'building' && tgt.team === 0 && tgt.def.onGeyser)) ? tgt.id : 0 };
      let any = false;
      for (const b of sel) if (b.def.trains && b.built) { b.rally = rally; any = true; }
      if (any) { this.ping(wx, wy); Sound.play('ack'); }
      return;
    }
    const enemy = tgt && tgt.team === 1 && (tgt.kind === 'unit' || tgt.kind === 'building') && seenByPlayer(tgt);
    const movers = [];
    for (const u of units) {
      let o = null;
      if (enemy) {
        if (weaponFor(u, tgt)) o = { type: 'attack', target: tgt.id };
      } else if (tgt && tgt.team === 0 && tgt !== u) {
        if (u.def.worker && tgt.kind === 'building') {
          if (!tgt.built && tgt.def.race === 'T') o = { type: 'build', key: tgt.key, tx: tgt.tx, ty: tgt.ty, bid: tgt.id };
          else if (tgt.def.onGeyser) o = { type: 'gather', res: tgt.id, st: 'go' };
          else if (tgt.def.townhall && u.carry) o = { type: 'return', res: u.lastRes || 0 };
          else if (tgt.hp < tgt.def.hp) o = { type: 'repair', target: tgt.id };
        } else if (u.def.worker && tgt.kind === 'unit' && tgt.def.mech && tgt.hp < tgt.def.hp) o = { type: 'repair', target: tgt.id };
        else if (tgt.kind === 'building' && tgt.def.bunker && u.def.infantry && tgt.built) o = { type: 'enter', target: tgt.id };
        else if (tgt.kind === 'unit') o = { type: 'follow', target: tgt.id };
      } else if (tgt && tgt.kind === 'mineral' && u.def.worker) o = { type: 'gather', res: tgt.id, st: 'go' };
      if (o) issue(u, o, shift); else movers.push(u);
    }
    if (movers.length) this.groupMove(movers, wx, wy, 'move', shift);
    this.ping(wx, wy, enemy);
    Sound.play('ack');
  },
  // 명령 버튼으로 고른 뒤 대상 지정
  target(wx, wy, shift) {
    const m = G.mode, sel = ownSel(), units = sel.filter(e => e.kind === 'unit');
    const tgt = this.pickAt(wx, wy, Input.touchMode ? 10 : 5);
    const enemy = tgt && tgt.team === 1 && (tgt.kind === 'unit' || tgt.kind === 'building') && seenByPlayer(tgt);
    switch (m.cmd) {
      case 'move':
        if (tgt && tgt.kind === 'unit' && tgt.team === 0) units.forEach(u => u !== tgt && issue(u, { type: 'follow', target: tgt.id }, shift));
        else this.groupMove(units, wx, wy, 'move', shift);
        break;
      case 'attack':
        if (enemy) {
          const rest = [];
          for (const u of units) { if (weaponFor(u, tgt)) issue(u, { type: 'attack', target: tgt.id }, shift); else rest.push(u); }
          if (rest.length) this.groupMove(rest, wx, wy, 'amove', shift);
        } else this.groupMove(units, wx, wy, 'amove', shift);
        break;
      case 'patrol':
        for (const u of units) if (!u.sieged) issue(u, { type: 'patrol', x1: u.x, y1: u.y, x2: wx, y2: wy, leg: false }, shift);
        break;
      case 'gather': {
        const ok = tgt && (tgt.kind === 'mineral' || (tgt.kind === 'building' && tgt.team === 0 && tgt.def.onGeyser && tgt.built));
        if (!ok) { UI.error('광물이나 리파이너리를 선택하세요.'); return; }
        for (const u of units) if (u.def.worker) issue(u, { type: 'gather', res: tgt.id, st: 'go' }, shift);
        break;
      }
      case 'repair': {
        const ok = tgt && tgt.team === 0 && (tgt.kind === 'building' || tgt.def.mech) && tgt.hp < tgt.def.hp;
        if (!ok) { UI.error('수리할 대상을 선택하세요.'); return; }
        for (const u of units) if (u.def.worker && u !== tgt) {
          if (tgt.kind === 'building' && !tgt.built) issue(u, { type: 'build', key: tgt.key, tx: tgt.tx, ty: tgt.ty, bid: tgt.id }, shift);
          else issue(u, { type: 'repair', target: tgt.id }, shift);
        }
        break;
      }
      case 'rally': {
        const rally = { x: wx, y: wy, target: tgt && (tgt.kind === 'mineral' || (tgt.kind === 'building' && tgt.def.onGeyser)) ? tgt.id : 0 };
        for (const b of sel) if (b.kind === 'building' && b.def.trains) b.rally = rally;
        break;
      }
    }
    this.ping(wx, wy, enemy || m.cmd === 'attack');
    Sound.play('ack');
    if (!shift) G.mode = null;
    UI.dirty = true;
  },
  updateGhost(wx, wy) {
    const m = G.mode, def = BUILDINGS[m.key];
    let tx = Math.round(wx / TILE - def.w / 2), ty = Math.round(wy / TILE - def.h / 2);
    if (def.onGeyser) {
      let best = null, bd = 4 * TILE;
      for (const r of G.resources) {
        if (r.kind !== 'geyser' || r.dead) continue;
        const d = Math.hypot(r.x - wx, r.y - wy);
        if (d < bd) { bd = d; best = r; }
      }
      if (best) { tx = best.tx; ty = best.ty; }
    }
    m.tx = tx; m.ty = ty;
    m.valid = canPlace(m.key, tx, ty, 0);
  },
  place(wx, wy, shift) {
    this.updateGhost(wx, wy);
    const m = G.mode, def = BUILDINGS[m.key];
    if (!m.valid) { UI.error('그곳에는 건설할 수 없습니다.'); return; }
    if (!canAfford(0, def.cost, 0, true)) return;
    const cx = (m.tx + def.w / 2) * TILE, cy = (m.ty + def.h / 2) * TILE;
    let builder = byId(m.builder);
    if (!builder || builder.team !== 0) {
      let bd = Infinity;
      for (const u of ownSel()) if (u.key === 'scv') { const d = Math.hypot(u.x - cx, u.y - cy); if (d < bd) { bd = d; builder = u; } }
    }
    if (!builder) { G.mode = null; UI.dirty = true; return; }
    spend(0, def.cost);
    issue(builder, { type: 'build', key: m.key, tx: m.tx, ty: m.ty, paid: true }, shift);
    m.builder = builder.id;
    Sound.play('ack');
    if (!shift) { G.mode = null; G.card = 'main'; }
    UI.dirty = true;
  },

  // 명령 버튼
  run(action) {
    const sel = ownSel(), units = sel.filter(e => e.kind === 'unit'), blds = sel.filter(e => e.kind === 'building');
    const [act, key] = action.split(':');
    const T = G.teams[0];
    switch (act) {
      case 'move': case 'attack': case 'patrol': case 'gather': case 'repair': case 'rally':
        G.mode = { type: 'target', cmd: act };
        break;
      case 'stop': units.forEach(stopUnit); Sound.play('ack'); break;
      case 'hold': units.forEach(u => issue(u, { type: 'hold' })); Sound.play('ack'); break;
      case 'return': units.forEach(u => { if (u.def.worker && u.carry) issue(u, { type: 'return', res: u.lastRes || 0 }); }); Sound.play('ack'); break;
      case 'buildMenu': G.card = 'build'; break;
      case 'back': G.card = 'main'; break;
      case 'place': {
        const def = BUILDINGS[key];
        if (!reqMet(0, def.req)) { UI.error(`${BUILDINGS[def.req].name}이(가) 필요합니다.`); return; }
        if (!canAfford(0, def.cost, 0, true)) return;
        G.mode = { type: 'place', key, builder: 0 };
        const w = Input.lastWorld;
        if (w) this.updateGhost(w.x, w.y);
        break;
      }
      case 'train': {
        const def = UNITS[key];
        if (!reqMet(0, def.req)) { UI.error(`${BUILDINGS[def.req].name}이(가) 필요합니다.`); return; }
        const cands = blds.filter(b => b.built && b.def.trains && b.def.trains.includes(key)).sort((a, b) => a.queue.length - b.queue.length);
        if (cands.length && trainAt(cands[0], key, true)) Sound.play('ack');
        break;
      }
      case 'research': {
        const b = blds.find(b => b.built && b.def.researches && b.def.researches.includes(key) && !b.queue.length) || blds.find(b => b.built && b.def.researches && b.def.researches.includes(key));
        if (b && researchAt(b, key, true)) Sound.play('ack');
        break;
      }
      case 'siege': case 'unsiege': {
        if (!T.upg.siege) { UI.error('팩토리에서 시즈 모드를 먼저 연구하세요.'); return; }
        for (const u of units) {
          if (u.key !== 'tank' || u.siegeT > 0 || u.sieged === (act === 'siege')) continue;
          stopUnit(u);
          u.siegeT = 1.2; u.siegeTo = act === 'siege';
        }
        Sound.play('siegeDone');
        break;
      }
      case 'stim': {
        if (!T.upg.stim) { UI.error('아카데미에서 스팀팩을 먼저 연구하세요.'); return; }
        let n = 0;
        for (const u of units) if (u.def.stimCost && u.hp > u.def.stimCost && u.stim < 1) { u.hp -= u.def.stimCost; u.stim = 10; n++; }
        if (n) Sound.play('stim'); else UI.error('체력이 너무 낮습니다.');
        break;
      }
      case 'unload': blds.forEach(b => b.def.bunker && unloadBunker(b)); Sound.play('load'); break;
      case 'cancelBuild': blds.forEach(cancelConstruction); break;
      case 'cancelQueue': { const b = blds.find(b => b.queue.length); if (b) cancelQueue(b); break; }
      case 'cancel': G.mode = null; break;
    }
    UI.dirty = true;
  },

  setGroup(n, add) {
    const ids = ownSel().map(e => e.id);
    if (!ids.length) return;
    G.groups[n] = add ? [...new Set([...(G.groups[n] || []), ...ids])] : ids;
    UI.msg(`부대 ${n} 지정`, 'info');
  },
  recallGroup(n, center) {
    const list = (G.groups[n] || []).map(byId).filter(e => e && !e.hidden);
    if (!list.length) return;
    this.select(list);
    if (center) View.centerOn(list[0].x, list[0].y);
  },
};

// ───────────────────────── 입력 (마우스 · 터치 · 키보드) ─────────────────────────
const Input = {
  pointers: new Map(), drag: null, pinch: null, pan: null, keys: new Set(),
  mouse: { x: -1, y: -1, over: false }, lastWorld: null, touchMode: false,
  lastClick: { t: 0, id: 0 }, lastDigit: { n: 0, t: 0 },
  init() {
    const cv = View.canvas;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => this.down(e));
    cv.addEventListener('pointermove', e => this.move(e));
    cv.addEventListener('pointerup', e => this.up(e));
    cv.addEventListener('pointercancel', e => this.cancel(e));
    cv.addEventListener('pointerleave', () => { this.mouse.over = false; });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const p = this.local(e);
      View.setZoom(G.cam.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), p.x, p.y);
    }, { passive: false });
    const mm = Minimap.canvas;
    mm.addEventListener('contextmenu', e => e.preventDefault());
    mm.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { mm.setPointerCapture(e.pointerId); } catch (err) { /* 합성 이벤트 */ }
      const r = mm.getBoundingClientRect(), w = Minimap.toWorld(e.clientX - r.left, e.clientY - r.top);
      if (e.button === 2) { if (G.state === 'play') Cmd.smart(w.x, w.y, e.shiftKey); return; }
      if (G.mode && G.mode.type === 'target' && G.state === 'play') { Cmd.target(w.x, w.y, e.shiftKey); return; }
      this.mmDrag = true;
      View.centerOn(w.x, w.y);
    });
    mm.addEventListener('pointermove', e => {
      if (!this.mmDrag) return;
      const r = mm.getBoundingClientRect(), w = Minimap.toWorld(e.clientX - r.left, e.clientY - r.top);
      View.centerOn(w.x, w.y);
    });
    const endMm = () => { this.mmDrag = false; };
    mm.addEventListener('pointerup', endMm); mm.addEventListener('pointercancel', endMm);
    window.addEventListener('keydown', e => this.key(e));
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  },
  local(e) { const r = View.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; },
  playing() { return G.state === 'play'; },
  down(e) {
    e.preventDefault();
    Sound.init();
    const p = this.local(e);
    try { View.canvas.setPointerCapture(e.pointerId); } catch (err) { /* 합성 이벤트 */ }
    this.pointers.set(e.pointerId, { x: p.x, y: p.y });
    const w = View.toWorld(p.x, p.y);
    this.lastWorld = w;
    if (e.pointerType === 'mouse') {
      this.touchMode = false;
      if (e.button === 1) { this.pan = { x: p.x, y: p.y, cx: G.cam.x, cy: G.cam.y }; return; }
      if (!this.playing()) return;
      if (e.button === 2) {
        if (G.mode) { G.mode = null; UI.dirty = true; } else Cmd.smart(w.x, w.y, e.shiftKey);
        return;
      }
      if (e.button !== 0) return;
      if (G.mode && G.mode.type === 'place') { Cmd.place(w.x, w.y, e.shiftKey); return; }
      if (G.mode && G.mode.type === 'target') { Cmd.target(w.x, w.y, e.shiftKey); return; }
      this.drag = { sx: p.x, sy: p.y, x: p.x, y: p.y, moved: false, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
      return;
    }
    // 터치 · 펜
    this.touchMode = true;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.drag = null;
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, zoom: G.cam.zoom, moved: false };
      return;
    }
    if (this.pointers.size > 2) return;
    if (!this.playing()) { this.drag = { sx: p.x, sy: p.y, x: p.x, y: p.y, moved: false, panOnly: true, cx: G.cam.x, cy: G.cam.y }; return; }
    if (G.mode && G.mode.type === 'place') { Cmd.updateGhost(w.x, w.y); this.drag = { sx: p.x, sy: p.y, x: p.x, y: p.y, moved: false, placing: true }; return; }
    this.drag = { sx: p.x, sy: p.y, x: p.x, y: p.y, moved: false, t: performance.now() };
  },
  move(e) {
    const p = this.local(e);
    if (e.pointerType === 'mouse') { this.mouse.x = p.x; this.mouse.y = p.y; this.mouse.over = true; }
    const w = View.toWorld(p.x, p.y);
    this.lastWorld = w;
    if (G.mode && G.mode.type === 'place' && (e.pointerType === 'mouse' || (this.drag && this.drag.placing))) Cmd.updateGhost(w.x, w.y);
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: p.x, y: p.y });
    if (this.pan) { G.cam.x = this.pan.cx - (p.x - this.pan.x) / G.cam.zoom; G.cam.y = this.pan.cy - (p.y - this.pan.y) / G.cam.zoom; View.clampCam(); return; }
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      G.cam.x -= (mx - this.pinch.mx) / G.cam.zoom; G.cam.y -= (my - this.pinch.my) / G.cam.zoom;
      this.pinch.mx = mx; this.pinch.my = my;
      View.setZoom(this.pinch.zoom * d / Math.max(10, this.pinch.d), mx, my);
      return;
    }
    const d = this.drag;
    if (!d) return;
    d.x = p.x; d.y = p.y;
    if (Math.hypot(d.x - d.sx, d.y - d.sy) > (this.touchMode ? 12 : 6)) d.moved = true;
    if (d.panOnly && d.moved) { G.cam.x = d.cx - (d.x - d.sx) / G.cam.zoom; G.cam.y = d.cy - (d.y - d.sy) / G.cam.zoom; View.clampCam(); }
  },
  up(e) {
    const p = this.local(e);
    this.pointers.delete(e.pointerId);
    if (this.pan && e.button === 1) { this.pan = null; return; }
    if (this.pinch) { if (this.pointers.size < 2) this.pinch = null; this.drag = null; return; }
    const d = this.drag;
    this.drag = null;
    if (!d || !this.playing() || d.panOnly) return;
    const w = View.toWorld(p.x, p.y);
    if (d.placing) { Cmd.place(w.x, w.y, false); return; }
    if (d.moved) { Cmd.boxSelect(View.toWorld(d.sx, d.sy), w, d.shift); return; }
    if (this.touchMode) { this.tap(w); return; }
    const e2 = Cmd.pickAt(w.x, w.y);
    const now = performance.now();
    const dbl = e2 && now - this.lastClick.t < 320 && this.lastClick.id === e2.id;
    this.lastClick = { t: now, id: e2 ? e2.id : 0 };
    Cmd.clickSelect(w.x, w.y, d.shift, d.ctrl || dbl);
  },
  cancel(e) { this.pointers.delete(e.pointerId); this.drag = null; this.pinch = null; this.pan = null; },
  // 터치 한 번: 대상 지정 → 아군 선택 → (선택이 있으면) 이동·공격
  tap(w) {
    if (G.mode && G.mode.type === 'target') { Cmd.target(w.x, w.y, false); return; }
    const e = Cmd.pickAt(w.x, w.y, 10);
    const now = performance.now();
    if (e && e.team === 0) {
      const dbl = now - this.lastClick.t < 350 && this.lastClick.id === e.id;
      this.lastClick = { t: now, id: e.id };
      const sel = ownSel();
      // 자기 일꾼으로 자기 건물(리파이너리·커맨드 센터·짓다 만 건물)을 누르면 명령으로 처리
      const workerCmd = sel.length && sel.every(s => s.kind === 'unit' && s.def.worker) && e.kind === 'building' && (e.def.onGeyser || !e.built || (e.def.townhall && sel.some(s => s.carry)));
      const bunkerCmd = sel.length && e.kind === 'building' && e.def.bunker && e.built && sel.some(s => s.kind === 'unit' && s.def.infantry);
      if (workerCmd || bunkerCmd) { Cmd.smart(w.x, w.y, false); return; }
      if (dbl) Cmd.selectType(e); else Cmd.select([e]);
      return;
    }
    this.lastClick = { t: now, id: 0 };
    if (ownSel().length) Cmd.smart(w.x, w.y, false);
    else Cmd.select(e ? [e] : []);
  },
  key(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const code = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'F2', 'F10', 'Tab'].includes(code)) e.preventDefault();
    if (code === 'Escape' || code === 'F10') {
      if (G.state === 'pause') { Game.resume(); return; }
      if (G.state !== 'play') return;
      if (code === 'Escape' && G.mode) { G.mode = null; UI.dirty = true; return; }
      if (code === 'Escape' && G.card !== 'main') { G.card = 'main'; UI.dirty = true; return; }
      Game.pause();
      return;
    }
    if (G.state !== 'play') return;
    this.keys.add(code);
    if (code === 'KeyM' && e.altKey) { e.preventDefault(); Sound.init(); Sound.setOn(!Sound.on); UI.syncSound(); return; }
    const digit = /^Digit([0-9])$/.exec(code);
    if (digit) {
      const n = +digit[1];
      if (e.ctrlKey || e.metaKey || e.altKey) { e.preventDefault(); Cmd.setGroup(n, false); }
      else if (e.shiftKey) Cmd.setGroup(n, true);
      else {
        const now = performance.now();
        Cmd.recallGroup(n, this.lastDigit.n === n && now - this.lastDigit.t < 350);
        this.lastDigit = { n, t: now };
      }
      return;
    }
    if (code === 'F2') { Cmd.selectArmy(); return; }
    if (code === 'Space') { if (G.lastAlert) View.centerOn(G.lastAlert.x, G.lastAlert.y); else { const s = ownSel()[0]; if (s) View.centerOn(s.x, s.y); } return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const m = /^Key([A-Z])$/.exec(code);
    if (m) UI.hotkey(m[1]);
  },
  update(dt) {
    if (G.state !== 'play' && G.state !== 'title') return;
    let vx = 0, vy = 0;
    if (this.keys.has('ArrowLeft')) vx -= 1;
    if (this.keys.has('ArrowRight')) vx += 1;
    if (this.keys.has('ArrowUp')) vy -= 1;
    if (this.keys.has('ArrowDown')) vy += 1;
    const m = this.mouse;
    if (G.state === 'play' && m.over && !this.drag && !this.touchMode && document.hasFocus()) {
      const edge = 10;
      if (m.x < edge) vx -= 1; else if (m.x > View.cw - edge) vx += 1;
      if (m.y < edge) vy -= 1; else if (m.y > View.ch - edge) vy += 1;
    }
    if (vx || vy) {
      const s = 900 / G.cam.zoom * dt;
      G.cam.x += vx * s; G.cam.y += vy * s;
      View.clampCam();
    }
  },
};
