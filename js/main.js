'use strict';
// ───────────────────────── 저장 ─────────────────────────
const SAVE_KEY = 'maple_adventure_save_v1';
function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(Game.player)); return true; } catch (e) { return false; }
}
function loadSave() {
  try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
const TOWN_SPAWN = { amherst: [9, 10], lith: [12, 8], henesys: [14, 12], ellinia: [12, 9], perion: [11, 9], kerning: [12, 7] };

// ───────────────────────── 떨어지는 단풍잎 ─────────────────────────
const Leaves = {
  list: [],
  update() {
    if (this.list.length < 26 && chance(0.15)) this.list.push({ x: rand(-40, W), y: -20, vx: randf(0.2, 0.9), vy: randf(0.6, 1.4), r: randf(0, 6), vr: randf(-0.05, 0.05), s: randf(5, 11), c: pick(['#ff8a1f', '#ffb03a', '#e8502a', '#ffd23f']) });
    for (const l of this.list) { l.x += l.vx + Math.sin(l.y * 0.03) * 0.6; l.y += l.vy; l.r += l.vr; }
    this.list = this.list.filter(l => l.y < H + 20);
  },
  draw() {
    for (const l of this.list) { ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.r); drawMapleLeaf(ctx, 0, 0, l.s, l.c); ctx.restore(); }
  }
};

// ───────────────────────── 제목 화면 ─────────────────────────
const Title = {
  sel: 0, t: 0, walkers: [],
  start() {
    this.t = 0; this.sel = loadSave() ? 1 : 0;
    this.walkers = ['snail', 'orangemush', 'slime', 'ribbonpig', 'bluesnail'].map((k, i) => ({ k, x: -80 - i * 150, sp: randf(0.5, 0.9) }));
    Sound.bgm('title');
  },
  options() { return [{ label: '새 모험 시작', ok: true }, { label: '이어하기', ok: !!loadSave() }, { label: Sound.muted ? '소리 켜기' : '소리 끄기', ok: true }]; },
  update() {
    this.t++;
    Leaves.update();
    for (const w of this.walkers) { w.x += w.sp; if (w.x > W + 80) w.x = -80; }
    if (UIStack.length) { updateUI(); return; }
    const ops = this.options();
    if (Input.rep('up')) { this.sel = (this.sel + ops.length - 1) % ops.length; Sound.sfx('cursor'); }
    if (Input.rep('down')) { this.sel = (this.sel + 1) % ops.length; Sound.sfx('cursor'); }
    if (Input.pressed.ok) {
      Sound.init();
      if (!ops[this.sel].ok) { Sound.sfx('buzz'); return; }
      Sound.sfx('ok');
      if (this.sel === 0) Game.askName();
      else if (this.sel === 1) Game.continueGame(loadSave());
      else { Sound.toggle(); if (!Sound.muted) Sound.bgm('title'); }
    }
  },
  draw() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#5ab4ff'); g.addColorStop(0.65, '#bfe6ff'); g.addColorStop(1, '#fff4d8');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 5; i++) {
      const x = ((i * 170 + this.t * (0.15 + i * 0.04)) % (W + 200)) - 100, y = 50 + (i % 3) * 46;
      ctx.beginPath(); ctx.arc(x, y, 20, 0, 7); ctx.arc(x + 24, y - 10, 26, 0, 7); ctx.arc(x + 52, y, 19, 0, 7); ctx.fill();
    }
    // 언덕과 버섯 집
    ctx.fillStyle = '#7cc0e8';
    ctx.beginPath(); ctx.moveTo(0, 360); for (let x = 0; x <= W; x += 32) ctx.lineTo(x, 330 + Math.sin(x * 0.01) * 24); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    const hill = ctx.createLinearGradient(0, 360, 0, H);
    hill.addColorStop(0, '#7ad25a'); hill.addColorStop(1, '#4aa03a');
    ctx.fillStyle = hill;
    ctx.beginPath(); ctx.moveTo(0, 400); for (let x = 0; x <= W; x += 32) ctx.lineTo(x, 392 + Math.sin(x * 0.015 + 1) * 14); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    [[70, '#ff8c2a'], [560, '#4a8cff']].forEach(([x, c]) => {
      ctx.fillStyle = '#fbe6c8'; ctx.fillRect(x - 22, 360, 44, 40);
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, 362, 48, 34, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - 18, 346, 7, 0, 7); ctx.arc(x + 14, 338, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#6a3e20'; ctx.fillRect(x - 7, 380, 14, 20);
    });
    for (const w of this.walkers) {
      const img = monsterSpriteRight(w.k, Math.floor((this.t + w.x) / 14) % 2);
      blit(img, w.x - img.width, 420 - img.height * 2 + Math.abs(Math.sin((this.t + w.x) * 0.1)) * -4, 2);
    }
    Leaves.draw();

    // 로고
    const bob = Math.sin(this.t * 0.04) * 4;
    ctx.save(); ctx.translate(W / 2 - 210, 96 + bob); ctx.rotate(-0.25); drawMapleLeaf(ctx, 0, 0, 34, '#ff8a1f'); ctx.restore();
    ctx.save();
    ctx.font = `74px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 16; ctx.strokeStyle = '#5a2600'; ctx.strokeText('메이플 모험기', W / 2 + 10, 110 + bob);
    ctx.lineWidth = 6; ctx.strokeStyle = '#fff4d8'; ctx.strokeText('메이플 모험기', W / 2 + 10, 110 + bob);
    const lg = ctx.createLinearGradient(0, 80, 0, 140);
    lg.addColorStop(0, '#ffe14a'); lg.addColorStop(0.55, '#ff9a1f'); lg.addColorStop(1, '#e8502a');
    ctx.fillStyle = lg; ctx.fillText('메이플 모험기', W / 2 + 10, 110 + bob);
    ctx.restore();
    ctx.save(); ctx.font = `17px ${FONT}`; ctx.textAlign = 'center';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
    ctx.fillStyle = '#5a2600'; ctx.fillText('MAPLE  ADVENTURE  RPG', W / 2 + 3, 168);
    ctx.restore();

    // 메뉴
    const ops = this.options();
    const mw = 240, mh = ops.length * 40 + 20, mx = (W - mw) / 2, my = 210;
    drawWindow(mx, my, mw, mh);
    ops.forEach((o, i) => {
      const y = my + 10 + i * 40;
      if (i === this.sel) drawCursorBar(mx + 10, y, mw - 20, 36);
      text(o.label, W / 2, y + 8, { size: 20, align: 'center', color: o.ok ? UI.text : '#7d86a8' });
    });
    text('비공식 팬 게임 · 그림과 음악은 모두 코드로 새로 만들었습니다', W / 2, H - 26, { size: 13, align: 'center', color: '#ffffff', outline: 'rgba(30,60,20,0.7)', lw: 3 });
    drawUI();
  }
};

// ───────────────────────── 항해 장면 ─────────────────────────
const Sail = {
  t: 0, msg: '', img: null,
  start(msg) {
    this.t = 0; this.msg = msg;
    if (!this.img) { const c = makeCanvas(7 * 16, 4 * 16 + 12); drawHouse(painter(c), painter(c), { x: 0, y: 0.75, w: 7, h: 4, style: 'ship' }, THEMES.island); this.img = c; }
  },
  update() { this.t++; Leaves.update(); },
  draw() {
    const g = ctx.createLinearGradient(0, 0, 0, 280);
    g.addColorStop(0, '#ff9a6a'); g.addColorStop(1, '#ffe0a8');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 280);
    ctx.fillStyle = '#fff2c0'; ctx.beginPath(); ctx.arc(480, 220, 40, 0, 7); ctx.fill();
    const sea = ctx.createLinearGradient(0, 260, 0, H);
    sea.addColorStop(0, '#3a8ad8'); sea.addColorStop(1, '#1a4a8a');
    ctx.fillStyle = sea; ctx.fillRect(0, 260, W, H - 260);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 24; i++) ctx.fillRect((i * 83 - this.t * 1.5) % W + (i * 83 - this.t * 1.5 < 0 ? W : 0), 280 + (i * 37) % 180, 26, 2);
    const x = 90 + this.t * 1.6, y = 230 + Math.sin(this.t * 0.06) * 5;
    blit(this.img, x, y, 2.5);
    text(this.msg, W / 2, 60, { size: 22, align: 'center' });
  }
};

// ───────────────────────── 엔딩 ─────────────────────────
const Ending = {
  t: 0, resolve: null,
  lines: [
    '주니어 발록이 쓰러지자', '개미굴을 뒤흔들던 울림이 멈추었다.', '',
    '사나워졌던 몬스터들은 조금씩 순해졌고', '헤네시스의 버섯 집에는 다시 웃음소리가 넘쳤다.', '',
    '메이플 아일랜드의 작은 마을에서 시작한 모험가는', '이제 빅토리아 아일랜드의 영웅이 되었다.', '',
    '하지만 모험은 여기서 끝나지 않는다.', '검은 마법사의 그림자는 아직 어딘가에…', '', '',
    '— 메이플 모험기 —', '', '기획 · 프로그래밍 · 도트 · 음악', 'Claude와 함께 만든 팬 게임', '', '', '플레이해 주셔서 고마워요!'
  ],
  start() { this.t = 0; },
  done() { return new Promise(r => { this.resolve = r; }); },
  update() {
    this.t++;
    Leaves.update();
    const end = this.lines.length * 34 + 520;
    if (this.t > 120 && Input.pressed.ok && this.t * 0.5 > end - 300) { if (this.resolve) { const r = this.resolve; this.resolve = null; r(); } }
    if (Input.held.ok && this.t > 60) this.t += 3;
  },
  draw() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2a3a7a'); g.addColorStop(0.6, '#ff9a6a'); g.addColorStop(1, '#ffd8a0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#4aa03a'; ctx.fillRect(0, 420, W, 60);
    const p = Game.player;
    const x = (this.t * 0.6) % (W + 80) - 40;
    blit(charSprite(playerLook(p), 'right', [1, 0, 2, 0][Math.floor(this.t / 10) % 4]), x, 360, 2);
    Leaves.draw();
    const off = this.t * 0.5;
    this.lines.forEach((l, i) => {
      const y = H + 20 + i * 34 - off;
      if (y < -30 || y > H + 30) return;
      text(l, W / 2, y, { size: l.startsWith('—') ? 30 : 21, align: 'center', color: l.startsWith('—') ? '#ffe14a' : '#ffffff', outline: 'rgba(20,10,40,0.7)' });
    });
    const end = this.lines.length * 34 + 520;
    if (off > end - 300) {
      text('THE END', W / 2, 190, { size: 44, align: 'center', color: '#ffe14a', outline: '#5a2600', lw: 8 });
      if (Math.floor(this.t / 30) % 2) text('확인 버튼을 누르면 모험을 계속합니다', W / 2, 260, { size: 17, align: 'center' });
    }
  }
};

// ───────────────────────── 게임 ─────────────────────────
const Game = {
  scene: 'title', player: null, fadeA: 0,

  async fade(n) { for (let i = 1; i <= n; i++) { this.fadeA = i / n; await wait(1); } },
  async fadeIn(n) { for (let i = 1; i <= n; i++) { this.fadeA = 1 - i / n; await wait(1); } this.fadeA = 0; },

  levelUpFx() { if (this.scene === 'battle') Battle.levelFx = 100; else Field.levelFx = 90; Sound.sfx('levelup'); },

  askName() {
    const box = document.getElementById('nameEntry'), input = document.getElementById('nameInput'), ok = document.getElementById('nameOk');
    this.scene = 'name';
    box.hidden = false;
    input.value = '';
    setTimeout(() => input.focus(), 30);
    const done = () => {
      const name = (input.value || '').trim().slice(0, 8) || '모험가';
      box.hidden = true; input.blur();
      ok.onclick = null; input.onkeydown = null;
      Input.held = {}; Input.pressed = {};
      this.newGame(name);
    };
    ok.onclick = done;
    input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); done(); } if (e.key === 'Escape') { box.hidden = true; input.blur(); this.scene = 'title'; } };
  },

  async newGame(name) {
    this.player = newPlayer(name);
    this.scene = 'map';
    this.fadeA = 1;
    Field.load('amherst', 9, 10, 'down');
    Field.busy = true;
    await this.fadeIn(40);
    Field.busy = false;
    Field.runScript(async () => {
      const lucas = { name: NPCS.lucas.name, look: NPCS.lucas.look };
      await notice('……');
      await notice('따스한 햇살과 바닷바람에 눈을 떴다. 여기는 단풍잎이 흩날리는 작은 섬, 메이플 아일랜드.');
      await say(lucas, `오오, 정신이 드는가? 자네가 바로 모험가 ${name}. 먼 곳에서 모험가가 되려고 이 섬에 왔다지?`);
      await say(lucas, '나는 이 암허스트의 촌장 루카스라네. 우선 마을 사람들과 이야기를 나눠 보게. 내 집 앞으로 오면 첫 번째 일을 부탁하지.');
      await notice('조작: 방향키/WASD 이동 · Z/스페이스 대화 · X/Esc 메뉴 · Shift 달리기\n메뉴에서 언제든지 저장할 수 있습니다.');
    });
  },

  continueGame(data) {
    if (!data) return;
    this.player = Object.assign(newPlayer(data.name || '모험가'), data);
    const p = this.player;
    if (!MAPS[p.map]) { p.map = 'amherst'; p.x = 9; p.y = 10; }
    this.scene = 'map';
    this.fadeA = 1;
    Field.load(p.map, p.x, p.y, p.dir);
    Field.busy = true;
    this.fadeIn(30).then(() => { Field.busy = false; toast('저장한 곳에서 모험을 이어 갑니다.', UI.accent2); });
  },

  toTitle() {
    UIStack.length = 0;
    Field.busy = false;
    this.scene = 'title';
    Title.start();
  },

  warpTo(map, x, y, dir) {
    if (x === null || x === undefined) [x, y] = TOWN_SPAWN[map] || [5, 5];
    Field.runScript(async () => {
      await this.fade(16);
      Field.load(map, x, y, dir || 'down');
      await this.fadeIn(16);
    });
  },

  async sail(map, x, y, dir, msg) {
    await this.fade(24);
    this.scene = 'sail'; Sail.start(msg);
    Sound.bgm('forest');
    await this.fadeIn(20);
    await wait(170);
    await this.fade(24);
    this.scene = 'map';
    Field.load(map, x, y, dir);
    await this.fadeIn(24);
    await this.onEnterMap(map);
  },

  async onEnterMap(id) {
    const p = this.player, key = 'visit_' + id;
    if (p.flags[key]) return;
    p.flags[key] = true;
    if (id === 'lith') await notice('빅토리아 아일랜드의 리스항구에 도착했다! 북쪽 길을 따라가면 헤네시스가 나온다.');
    if (id === 'henesys') await notice('버섯 모양 집이 늘어선 마을, 헤네시스에 도착했다. 남쪽에는 사냥터가 있다.');
    if (id === 'victoriaroad') await notice('여러 마을로 이어지는 갈림길, 빅토리아 로드. 표지판을 확인해 보자.');
    if (id === 'antcave') await notice('축축하고 어두운 동굴… 깊은 곳에서 낮은 울림이 들려온다.');
    if (id === 'antdeep' && !p.flags.balrog_dead) await notice('공기가 무겁다. 거대한 무언가가 숨을 쉬고 있다…');
  },

  async battle(kinds, opts) {
    for (let i = 0; i < 3; i++) { this.fadeA = -0.7; await wait(3); this.fadeA = 0; await wait(3); }
    await this.fade(10);
    this.scene = 'battle';
    Battle.setup(kinds, opts, Field.map.theme);
    const run = Battle.run(kinds, opts);
    await this.fadeIn(12);
    const res = await run;
    await this.fade(18);
    UIStack.length = 0;
    this.scene = 'map';
    const p = this.player;
    let lost = 0;
    if (res === 'lose') {
      if (p.job !== 'beginner') { lost = Math.min(p.exp, Math.floor(expNeed(p.level) * 0.1)); p.exp -= lost; }
      p.hp = Math.max(1, Math.floor(p.mhp * 0.5)); p.mp = Math.floor(p.mmp * 0.5);
      const [tx, ty] = TOWN_SPAWN[p.lastTown] || [9, 10];
      Field.load(p.lastTown, tx, ty, 'down');
    } else Sound.bgm(Field.map.bgm);
    await this.fadeIn(18);
    if (res === 'lose') await notice(`${MAPS[p.lastTown].name}에서 정신을 차렸다…${lost ? `\n경험치를 ${fmt(lost)} 잃었다.` : ''}\n무리하지 말고 포션을 챙기자.`);
    return res;
  },

  async ending() {
    const p = this.player;
    if (p.quests.balrog) p.quests.balrog.state = 'done';
    await notice('주니어 발록이 비명을 지르며 어둠 속으로 흩어졌다!');
    await this.fade(40);
    this.scene = 'ending'; Ending.start(); Sound.bgm('ending');
    await this.fadeIn(40);
    await Ending.done();
    await this.fade(40);
    p.flags.cleared = true;
    addItem(p, 'goldcrown');
    this.scene = 'map';
    Field.load('henesys', 14, 12, 'down');
    await this.fadeIn(30);
    Sound.sfx('quest');
    await notice('빅토리아 아일랜드에 평화가 찾아왔다!\n보상으로 황금 왕관을 받았습니다. (메뉴 → 장비에서 착용)\n엔딩 후에도 자유롭게 모험을 계속할 수 있어요.');
  }
};

// ───────────────────────── 메인 루프 ─────────────────────────
function step() {
  frameCount++;
  tickTimers();
  switch (Game.scene) {
    case 'title': Title.update(); break;
    case 'map': Field.update(); break;
    case 'battle': Battle.update(); break;
    case 'sail': Sail.update(); break;
    case 'ending': Ending.update(); break;
  }
  Input.endFrame();
}
function render() {
  const k = canvas.width / W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.imageSmoothingEnabled = false;
  switch (Game.scene) {
    case 'title': case 'name': Title.draw(); break;
    case 'map': Field.draw(); drawUI(); break;
    case 'battle': Battle.draw(); break;
    case 'sail': Sail.draw(); break;
    case 'ending': Ending.draw(); break;
  }
  if (Game.fadeA > 0) { ctx.fillStyle = `rgba(0,0,0,${Game.fadeA})`; ctx.fillRect(0, 0, W, H); }
  if (Game.fadeA < 0) { ctx.fillStyle = `rgba(255,255,255,${-Game.fadeA})`; ctx.fillRect(0, 0, W, H); }
}
let lastTime = 0, acc = 0;
function loop(now) {
  if (!lastTime) lastTime = now;
  acc += Math.min(100, now - lastTime);
  lastTime = now;
  let steps = 0;
  while (acc >= 1000 / 60 && steps < 4) { step(); acc -= 1000 / 60; steps++; }
  if (steps === 4) acc = 0;
  try { render(); } catch (e) { console.error(e); }
  requestAnimationFrame(loop);
}

function boot(data) {
  resize();
  setupTouch();
  Title.start();
  // 이미 열려 있던 화면이 새 버전으로 바뀌면 진행 상황을 이어 받는다
  if (data && data.player) Game.continueGame(data.player);
  requestAnimationFrame(loop);
}
try { window.claude?.hot?.snapshot?.(() => ({ player: Game.player && Game.scene !== 'title' ? Game.player : null })); } catch (e) { /* 없음 */ }
const startGame = () => {
  const go = () => { try { if (window.claude?.hot?.ready) window.claude.hot.ready(boot); else boot(window.claude?.hot?.data ?? {}); } catch (e) { boot({}); } };
  if (document.fonts && document.fonts.load) Promise.race([document.fonts.load(`20px "Jua"`), new Promise(r => setTimeout(r, 1500))]).then(go, go);
  else go();
};
startGame();
