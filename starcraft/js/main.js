'use strict';
// ───────────────────────── 새 게임 준비 ─────────────────────────
function setupGame(diff, seed) {
  G.time = 0; G.tick = 0; G.difficulty = diff;
  G.units = []; G.buildings = []; G.resources = []; G.effects = []; G.projectiles = []; G.decals = [];
  G.byId = new Map(); G.nextId = 1; G.dirty = false;
  G.selection = []; G.groups = {}; G.mode = null; G.card = 'main'; G.winner = -1; G.lastAlert = null;
  G.teams = [newTeam(0, 'T'), newTeam(1, 'Z')];
  PathQ.length = 0;
  Alerts.last = -99; Alerts.pings = [];
  genMap(seed);
  Art.reset();
  for (const b of World.bases) {
    for (const m of b.minerals) createMineral(m.tx, m.ty, b.main ? 1500 : 1200);
    if (b.geyser) createGeyser(b.geyser.tx, b.geyser.ty);
  }
  const home = World.bases.find(b => b.main && b.side === 0), foe = World.bases.find(b => b.main && b.side === 1);
  const cc = createBuilding('cc', 0, home.tx, home.ty, true);
  const hatch = createBuilding('hatchery', 1, foe.tx, foe.ty, true);
  for (let i = 0; i < 4; i++) {
    const p = findSpawnPos(cc, 10, cc.x + home.away[0] * 200 + (i - 1.5) * 30, cc.y + home.away[1] * 200);
    const u = createUnit('scv', 0, p.x, p.y);
    G.teams[0].supUsed += 1;
    autoGather(u);
    const q = findSpawnPos(hatch, 10, hatch.x + foe.away[0] * 200 + (i - 1.5) * 30, hatch.y + foe.away[1] * 200);
    const d = createUnit('drone', 1, q.x, q.y);
    G.teams[1].supUsed += 1;
    autoGather(d);
  }
  createUnit('overlord', 1, hatch.x - foe.away[0] * 90, hatch.y - foe.away[1] * 90);
  recalcSupply(0); recalcSupply(1);
  AI.init(G.teams[1]);
  Fog.update();
  Minimap.terrainDirty = true;
  G.cam.zoom = Math.min(View.cw, View.ch) < 560 ? 0.75 : 1;
  View.centerOn(cc.x + 60, cc.y - 40);
}

// ───────────────────────── 진행 ─────────────────────────
const Game = {
  last: 0, acc: 0, speedKey: 'normal', uiT: 0, mmT: 0, titleT: 0,
  boot() {
    Grid.init();
    Fog.init();
    View.init();
    Minimap.init();
    UI.init();
    Screens.init();
    Input.init();
    Sound.on = Store.get('kf.sound', true);
    UI.syncSound();
    this.toTitle();
    requestAnimationFrame(t => { this.last = t; this.loop(t); });
  },
  toTitle() {
    setupGame('normal', (Math.random() * 1e9) | 0);
    Fog.revealAll();
    G.state = 'title';
    this.titleT = 0;
    UI.dirty = true;
    Screens.show('title');
  },
  start(diff, speedKey) {
    this.speedKey = speedKey;
    G.speed = SPEEDS[speedKey].k;
    Fog.all = false;
    setupGame(diff, (Math.random() * 1e9) | 0);
    G.state = 'play';
    this.acc = 0;
    Screens.show(null);
    UI.dirty = true;
    UI.msg(`작전 개시 · 난이도 ${DIFF[diff].name}`, 'ok');
    UI.msg('SCV로 광물을 캐고, 서플라이 디폿과 배럭을 지으세요.', 'info');
  },
  pause() {
    if (G.state !== 'play') return;
    G.state = 'pause';
    document.getElementById('pauseInfo').textContent = `경과 시간 ${fmtTime(G.time)} · 난이도 ${DIFF[G.difficulty].name}`;
    Screens.show('pause', 'pause');
  },
  resume() {
    if (G.state !== 'pause') return;
    G.state = 'play';
    Screens.show(null);
  },
  end(winner) {
    if (G.state !== 'play') return;
    G.state = 'end';
    G.winner = winner;
    G.mode = null;
    const s = G.teams[0].stats, win = winner === 0;
    Sound.play(win ? 'victory' : 'defeat');
    document.getElementById('endEyebrow').textContent = `작전 결과 · ${DIFF[G.difficulty].name}`;
    document.getElementById('endTitle').textContent = win ? '승리' : '패배';
    document.getElementById('endTitle').className = win ? 'win' : 'lose';
    document.getElementById('endText').textContent = win ? '저그 둥지를 모두 불태웠습니다. 이 구역은 이제 안전합니다.' : '마지막 기지가 무너졌습니다. 저그가 이 구역을 뒤덮었습니다.';
    const rows = [
      ['작전 시간', fmtTime(G.time)], ['생산한 유닛', s.produced], ['처치한 적', s.killed],
      ['잃은 유닛 · 건물', s.lost], ['캔 광물', s.minerals], ['캔 가스', s.gas],
    ];
    document.getElementById('endStats').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    setTimeout(() => { if (G.state === 'end') Screens.show('end'); }, 1200);
  },
  loop(now) {
    requestAnimationFrame(t => this.loop(t));
    const real = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (G.state === 'play' || G.state === 'title' || G.state === 'end') {
      this.acc += real;
      let n = 0;
      const STEP = 1 / 60;
      while (this.acc >= STEP && n < 4) { step(STEP * (G.state === 'play' ? G.speed : 1)); this.acc -= STEP; n++; }
      if (n === 4) this.acc = 0;
    }
    if (G.state === 'title') {
      this.titleT += real;
      const home = World.bases.find(b => b.main && b.side === 0), foe = World.bases.find(b => b.main && b.side === 1);
      const k = (Math.sin(this.titleT * 0.05 - Math.PI / 2) + 1) / 2;
      View.centerOn(lerp(home.cx, foe.cx, k) * TILE, lerp(home.cy, foe.cy, k) * TILE);
      if (G.time > 150) { setupGame('normal', (Math.random() * 1e9) | 0); Fog.revealAll(); }
    }
    Input.update(real);
    View.draw(now / 1000);
    this.uiT += real; this.mmT += real;
    if (this.uiT > 0.1) { this.uiT = 0; UI.update(); }
    if (this.mmT > 0.15) { this.mmT = 0; Minimap.draw(now / 1000); }
  },
};
window.addEventListener('load', () => Game.boot());
