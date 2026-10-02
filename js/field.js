'use strict';
// ───────────────────────── 필드(맵 이동) ─────────────────────────
const Field = {
  map: null, npcs: [], mobs: [], hero: null, cam: { x: 0, y: 0 },
  busy: false, invuln: 0, banner: null, levelFx: 0, portals: [],

  load(id, x, y, dir) {
    const p = Game.player;
    const m = prepareMap(id);
    this.map = m;
    p.map = id; p.x = x; p.y = y; p.dir = dir || p.dir;
    if (m.town) p.lastTown = id;
    this.hero = { x, y, px: x * TS, py: y * TS, dir: p.dir, moving: false, tx: x, ty: y, frame: 0, dist: 0 };
    this.npcs = (m.npcs || []).map(n => ({ ...n, def: NPCS[n.id], baseDir: n.dir }));
    this.mobs = [];
    for (const [kind, count, x1, y1, x2, y2] of m.spawns || []) {
      for (let i = 0; i < count; i++) {
        const mob = { kind, zone: [x1, y1, x2, y2], alive: false, respawn: 0, frame: 0, t: rand(0, 60) };
        this.placeMob(mob, 5);
        this.mobs.push(mob);
      }
    }
    // 같은 목적지로 가는 포탈은 하나로 그린다
    const groups = {};
    for (const w of m.warps || []) { const k = w.to; (groups[k] = groups[k] || []).push(w); }
    this.portals = Object.values(groups).map(ws => ({ x: ws.reduce((a, w) => a + w.x, 0) / ws.length, y: ws.reduce((a, w) => a + w.y, 0) / ws.length }));
    this.banner = { text: m.name, sub: m.region, t: 0 };
    this.invuln = 60;
    Sound.bgm(m.bgm);
    this.snapCamera();
  },

  bossAlive() { const b = this.map.boss; return b && !Game.player.flags[b.flag]; },
  inBoss(x, y) { const b = this.map.boss; return this.bossAlive() && Math.abs(x - b.x) <= 1 && y >= b.y - 1 && y <= b.y; },
  npcAt(x, y) { return this.npcs.find(n => n.x === x && n.y === y); },
  mobAt(x, y, except) { return this.mobs.find(m => m !== except && m.alive && ((m.x === x && m.y === y) || (m.moving && m.tx === x && m.ty === y))); },
  isWarp(x, y) { return (this.map.warps || []).some(w => w.x === x && w.y === y); },
  solid(x, y) {
    const m = this.map;
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return true;
    return m.solid[y][x] || !!this.npcAt(x, y) || this.inBoss(x, y);
  },

  placeMob(mob, minDist) {
    const [x1, y1, x2, y2] = mob.zone, h = this.hero;
    for (let tries = 0; tries < 200; tries++) {
      const x = rand(x1, x2), y = rand(y1, y2);
      if (this.solid(x, y) || this.isWarp(x, y) || this.mobAt(x, y, mob)) continue;
      if (Math.abs(x - h.x) + Math.abs(y - h.y) < minDist) continue;
      Object.assign(mob, { x, y, px: x * TS, py: y * TS, tx: x, ty: y, moving: false, alive: true, dir: chance(0.5) ? 'left' : 'right', wait: rand(30, 120), stun: 0 });
      return true;
    }
    mob.alive = false; mob.respawn = 120;
    return false;
  },

  snapCamera() {
    const h = this.hero, m = this.map;
    const mw = m.w * TS, mh = m.h * TS;
    let cx = h.px + TS / 2 - W / 2, cy = h.py + TS / 2 - (H - 34) / 2;
    cx = mw <= W ? (mw - W) / 2 : clamp(cx, 0, mw - W);
    cy = mh <= H - 34 ? (mh - H + 34) / 2 : clamp(cy, 0, mh - H + 34);
    this.cam.x = Math.round(cx); this.cam.y = Math.round(cy);
  },

  update() {
    const p = Game.player;
    p.playTime++;
    if (this.invuln > 0) this.invuln--;
    if (this.levelFx > 0) this.levelFx--;
    if (this.banner) { this.banner.t++; if (this.banner.t > 200) this.banner = null; }
    if (UIStack.length) { updateUI(); this.updateMobs(false); return; }
    if (this.busy) return;
    this.updateHero();
    this.updateMobs(true);
    this.snapCamera();
  },

  updateHero() {
    const h = this.hero, p = Game.player;
    if (!h.moving) {
      if (Input.pressed.cancel) { pushUI(new MainMenu()); return; }
      if (Input.pressed.ok) { this.interact(); return; }
      const d = Input.dir();
      if (d) {
        h.dir = p.dir = d;
        const [dx, dy] = DIRS[d], nx = h.x + dx, ny = h.y + dy;
        if (this.inBoss(nx, ny)) { this.bossEvent(); return; }
        const mob = this.mobAt(nx, ny);
        if (mob && !mob.stun && !this.invuln) { this.startBattle(mob); return; }
        if (!this.solid(nx, ny) && !(mob)) { h.moving = true; h.tx = nx; h.ty = ny; }
        else h.frame = 0;
      } else h.frame = 0;
    }
    if (h.moving) {
      const sp = Input.isRun() ? 4 : 2;
      const [dx, dy] = DIRS[h.dir];
      h.px += dx * sp; h.py += dy * sp; h.dist += sp;
      h.frame = [1, 0, 2, 0][Math.floor(h.dist / 16) % 4];
      if (Math.abs(h.px - h.tx * TS) < sp && Math.abs(h.py - h.ty * TS) < sp || (h.px === h.tx * TS && h.py === h.ty * TS)) {
        h.px = h.tx * TS; h.py = h.ty * TS; h.x = h.tx; h.y = h.ty; h.moving = false;
        p.x = h.x; p.y = h.y;
        const w = (this.map.warps || []).find(w => w.x === h.x && w.y === h.y);
        if (w) { this.doWarp(w); return; }
        // 계속 누르고 있으면 다음 칸으로 바로 이어서
        const d = Input.dir();
        if (d) {
          const [ex, ey] = DIRS[d];
          const mob = this.mobAt(h.x + ex, h.y + ey);
          if (!this.solid(h.x + ex, h.y + ey) && !mob) { h.dir = p.dir = d; h.moving = true; h.tx = h.x + ex; h.ty = h.y + ey; }
        }
      }
    }
  },

  interact() {
    const h = this.hero, [dx, dy] = DIRS[h.dir], fx = h.x + dx, fy = h.y + dy;
    const npc = this.npcAt(fx, fy);
    if (npc && npc.def) { this.runScript(async () => { npc.dir = { up: 'down', down: 'up', left: 'right', right: 'left' }[h.dir]; await npc.def.talk({ name: npc.def.name, look: npc.def.look }); }); return; }
    if (this.inBoss(fx, fy)) { this.bossEvent(); return; }
    const sign = this.map.signs && this.map.signs[fx + ',' + fy];
    if (sign) { this.runScript(() => notice(sign)); return; }
  },

  async runScript(fn) {
    if (this.busy) return;
    this.busy = true;
    try { await fn(); } catch (e) { console.error(e); }
    this.busy = false;
    Input.pressed = {};
  },

  doWarp(w) {
    this.runScript(async () => {
      Sound.sfx('portal');
      await Game.fade(14);
      this.load(w.to, w.tx, w.ty, w.dir);
      await Game.fadeIn(14);
      await Game.onEnterMap(w.to);
    });
  },

  bossEvent() {
    const b = this.map.boss;
    this.runScript(async () => {
      const r = await BOSS_TALK[b.kind]();
      if (r !== 0) return;
      const res = await Game.battle([b.kind], { boss: true });
      if (res === 'win') {
        Game.player.flags[b.flag] = true;
        if (b.kind === 'balrog') await Game.ending();
        else await notice('머쉬맘을 쓰러뜨렸다! 헤네시스의 경비대장 마이에게 알리자.');
      }
    });
  },

  startBattle(mob) {
    this.runScript(async () => {
      const pool = [];
      for (const [kind, count] of this.map.spawns) for (let i = 0; i < count; i++) pool.push(kind);
      const p = Game.player;
      const r = Math.random();
      let extra = r < 0.45 ? 0 : r < 0.85 ? 1 : 2;
      if (p.level < 3) extra = Math.min(extra, 1);
      const group = [mob.kind];
      for (let i = 0; i < extra; i++) group.push(pick(pool));
      Sound.sfx('encounter');
      const res = await Game.battle(group, {});
      if (res === 'win') { mob.alive = false; mob.respawn = rand(500, 900); }
      else if (res === 'escape') { mob.stun = 150; this.invuln = 150; }
    });
  },

  updateMobs(active) {
    const h = this.hero;
    for (const m of this.mobs) {
      if (!m.alive) {
        if (--m.respawn <= 0) this.placeMob(m, 6);
        continue;
      }
      m.t++;
      if (m.stun > 0) m.stun--;
      if (m.moving) {
        const [dx, dy] = DIRS[m.mdir];
        m.px += dx; m.py += dy;
        if (m.px === m.tx * TS && m.py === m.ty * TS) { m.x = m.tx; m.y = m.ty; m.moving = false; m.wait = rand(20, 90); }
      } else if (active && --m.wait <= 0) {
        let d;
        const dist = Math.abs(m.x - h.x) + Math.abs(m.y - h.y);
        if (dist < 6 && chance(0.55) && !m.stun) {
          const ddx = h.x - m.x, ddy = h.y - m.y;
          d = Math.abs(ddx) > Math.abs(ddy) ? (ddx > 0 ? 'right' : 'left') : (ddy > 0 ? 'down' : 'up');
        } else d = pick(['up', 'down', 'left', 'right']);
        const [dx, dy] = DIRS[d], nx = m.x + dx, ny = m.y + dy;
        const [x1, y1, x2, y2] = m.zone;
        if (nx >= x1 && nx <= x2 && ny >= y1 && ny <= y2 && !this.solid(nx, ny) && !this.isWarp(nx, ny) && !this.mobAt(nx, ny, m) && !(nx === h.x && ny === h.y) && !(h.moving && nx === h.tx && ny === h.ty)) {
          m.moving = true; m.mdir = d; m.tx = nx; m.ty = ny;
          if (dx) m.dir = dx > 0 ? 'right' : 'left';
        } else m.wait = rand(10, 40);
      }
      // 닿으면 전투
      if (active && !this.busy && !this.invuln && !m.stun && Math.abs(m.px - h.px) < 22 && Math.abs(m.py - h.py) < 22) {
        this.startBattle(m);
        return;
      }
    }
  },

  // ───────── 그리기 ─────────
  draw() {
    const m = this.map, cx = this.cam.x, cy = this.cam.y;
    ctx.fillStyle = m.theme === 'cave' ? '#120e0c' : m.theme === 'city' ? '#1a1c28' : '#2a5a8a';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(m.lower, -cx, -cy, m.w * TS, m.h * TS);

    // 물결 반짝임
    for (const [x, y] of m.water) {
      const sx = x * TS - cx, sy = y * TS - cy;
      if (sx < -TS || sy < -TS || sx > W || sy > H) continue;
      const k = hash2(x, y, 3);
      const ph = (frameCount + k * 240) % 160;
      if (ph < 50) { ctx.fillStyle = `rgba(255,255,255,${0.7 - ph / 80})`; ctx.fillRect(sx + 6 + k * 16, sy + 8 + (k * 13) % 14, 6, 2); }
    }
    for (const pt of this.portals) drawPortal(pt.x * TS - cx + 16, pt.y * TS - cy + 10, frameCount);

    // 캐릭터들을 y순으로
    const ents = [];
    for (const n of this.npcs) ents.push({ y: n.y * TS, draw: () => this.drawChar(n.def.look, n.dir, 0, n.x * TS - cx, n.y * TS - cy) });
    for (const mb of this.mobs) if (mb.alive) ents.push({ y: mb.py, draw: () => this.drawMob(mb, cx, cy) });
    if (this.bossAlive()) {
      const b = m.boss;
      ents.push({ y: b.y * TS, draw: () => {
        const img = monsterSprite(b.kind, Math.floor(frameCount / 24) % 2);
        const bx = b.x * TS + 16 - img.width, by = b.y * TS + 32 - img.height * 2 + 2;
        drawShadow(b.x * TS + 16 - cx, b.y * TS + 30 - cy, img.width * 0.8, 8);
        blit(img, bx - cx, by - cy, 2);
      } });
    }
    const h = this.hero;
    ents.push({ y: h.py, hero: true, draw: () => {
      if (this.invuln && Math.floor(this.invuln / 4) % 2 && !this.busy) return;
      this.drawChar(playerLook(Game.player), h.dir, h.frame, h.px - cx, h.py - cy);
    } });
    ents.sort((a, b) => a.y - b.y || (a.hero ? 1 : -1));
    for (const e of ents) e.draw();

    ctx.drawImage(m.upper, -cx, -cy, m.w * TS, m.h * TS);

    // 건물 간판 · NPC 이름표
    for (const hs of m.houses || []) if (hs.label) {
      const x = (hs.x + hs.w / 2) * TS - cx, y = hs.y * TS - cy - 4;
      const w = textWidth(hs.label, 13) + 14;
      ctx.fillStyle = 'rgba(40,24,10,0.82)'; roundRect(x - w / 2, y - 8, w, 20, 5); ctx.fill();
      text(hs.label, x, y - 5, { size: 13, align: 'center', color: '#ffe9b8', outline: false });
    }
    for (const n of this.npcs) this.nameTag(n.def.name, n.x * TS - cx + 16, n.y * TS - cy + 34, '#ffe14a');
    this.nameTag(Game.player.name, h.px - cx + 16, h.py - cy + 34, '#ffffff');

    if (this.levelFx) this.drawLevelFx(h.px - cx + 16, h.py - cy);
    this.drawHUD();
    drawToasts();
    if (this.banner) this.drawBanner();
  },

  drawChar(look, dir, frame, x, y) {
    drawShadow(x + 16, y + 30, 11, 4);
    blit(charSprite(look, dir, frame), x - 4, y - 30, PX);
  },
  drawMob(mb, cx, cy) {
    const f = Math.floor((mb.t + (mb.moving ? 0 : 12)) / (mb.moving ? 10 : 24)) % 2;
    const img = mb.dir === 'right' ? monsterSpriteRight(mb.kind, f) : monsterSprite(mb.kind, f);
    const x = mb.px - cx + 16 - img.width, y = mb.py - cy + 32 - img.height * 2 + 2;
    drawShadow(mb.px - cx + 16, mb.py - cy + 30, img.width * 0.75, 4);
    blit(img, x, y, PX, mb.stun ? 0.55 : 1);
  },
  nameTag(name, x, y, color) {
    const w = textWidth(name, 13) + 12;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; roundRect(x - w / 2, y - 1, w, 18, 4); ctx.fill();
    text(name, x, y + 1, { size: 13, align: 'center', color, outline: false });
  },

  drawLevelFx(x, y) {
    const t = 90 - this.levelFx;
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.levelFx / 30);
    const g = ctx.createLinearGradient(0, y - 120, 0, y + 30);
    g.addColorStop(0, 'rgba(255,230,120,0)'); g.addColorStop(1, 'rgba(255,200,60,0.55)');
    ctx.fillStyle = g; ctx.fillRect(x - 26, y - 120, 52, 150);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2 + t * 0.08, r = 26 + Math.sin(t * 0.1 + i) * 6;
      ctx.fillStyle = i % 2 ? '#fff6c0' : '#ffd23f';
      ctx.fillRect(x + Math.cos(a) * r - 2, y + 10 - t * 1.2 % 80 + Math.sin(a) * 8, 4, 4);
    }
    text('LEVEL UP!', x, y - 70 - Math.min(20, t), { size: 28, align: 'center', color: '#ffe14a', outline: '#8a3a00', lw: 6 });
    ctx.restore();
  },

  drawHUD() {
    const p = Game.player, y = H - 34;
    const g = ctx.createLinearGradient(0, y, 0, H);
    g.addColorStop(0, 'rgba(30,34,56,0.92)'); g.addColorStop(1, 'rgba(14,16,28,0.96)');
    ctx.fillStyle = g; ctx.fillRect(0, y, W, 34);
    ctx.fillStyle = '#5a6488'; ctx.fillRect(0, y, W, 1);
    text(`Lv.${p.level}`, 10, y + 3, { size: 18, color: '#ffd23f', lw: 3 });
    text(`${JOBS[p.job].name} ${p.name}`, 72, y + 6, { size: 14, color: '#d8deff', lw: 3 });
    drawBar(250, y + 5, 150, 12, p.hp / p.mhp, UI.hp, `HP ${p.hp}/${p.mhp}`);
    drawBar(408, y + 5, 120, 12, p.mp / p.mmp, UI.mp, `MP ${p.mp}/${p.mmp}`);
    blit(iconSprite('coin'), 538, y + 3, 1.2);
    text(fmt(p.meso), W - 8, y + 5, { size: 14, align: 'right', color: '#ffe27a', lw: 3 });
    const need = expNeed(p.level);
    drawBar(4, y + 22, W - 8, 8, p.exp / need, UI.exp);
    text(`EXP ${fmt(p.exp)} / ${fmt(need)}  [${(p.exp / need * 100).toFixed(2)}%]`, W / 2, y + 19, { size: 11, align: 'center', lw: 3 });
  },

  drawBanner() {
    const b = this.banner, a = b.t < 20 ? b.t / 20 : b.t > 160 ? (200 - b.t) / 40 : 1;
    ctx.save(); ctx.globalAlpha = a;
    const w = Math.max(textWidth(b.text, 26), 160) + 80, x = (W - w) / 2, y = 26;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.2, 'rgba(10,12,30,0.75)'); g.addColorStop(0.8, 'rgba(10,12,30,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, 64);
    text(b.sub, W / 2, y + 8, { size: 14, align: 'center', color: '#ffcf5a', outline: false });
    text(b.text, W / 2, y + 26, { size: 26, align: 'center', color: '#ffffff' });
    ctx.restore();
  }
};
