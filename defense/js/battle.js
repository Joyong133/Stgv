'use strict';
// ───────────────────────── 방어전 전투 ─────────────────────────

// 적이 걷는 길 (오른쪽 위 포탈 → 왼쪽 아래 성)
const PATH = [[1340, 135], [890, 135], [890, 305], [1150, 305], [1150, 505], [610, 505], [610, 175], [340, 175], [340, 455], [118, 455]];
// 영웅 배치 자리
const PADS = [[1020, 220], [1240, 220], [1020, 405], [1240, 410], [750, 240], [750, 420], [475, 265], [475, 400], [240, 360], [230, 560], [880, 590], [1150, 590]]
  .map(([x, y], i) => ({ x, y, i }));
const CASTLE = { x: 66, y: 480 };
const PORTAL = { x: 1255, y: 122 };
const HERO_SCALE = 0.8, ENEMY_SCALE = 1.25;

const Path = (() => {
  const segs = []; let total = 0;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, ay] = PATH[i], [bx, by] = PATH[i + 1], len = Math.hypot(bx - ax, by - ay);
    segs.push({ ax, ay, bx, by, len, start: total, dx: (bx - ax) / len, dy: (by - ay) / len });
    total += len;
  }
  function at(d) {
    d = clamp(d, 0, total);
    for (const s of segs) if (d <= s.start + s.len) { const k = d - s.start; return { x: s.ax + s.dx * k, y: s.ay + s.dy * k, dx: s.dx, dy: s.dy }; }
    const s = segs[segs.length - 1]; return { x: s.bx, y: s.by, dx: s.dx, dy: s.dy };
  }
  return { segs, total, at };
})();

let ENEMY_UID = 1;

class Battle {
  constructor(game, diffId, resume) {
    this.game = game;
    this.diff = DIFF_BY_ID[diffId];
    this.root = $('#battle');
    this.cv = $('#bcv');
    this.c = this.cv.getContext('2d');
    this.fx = new FX();
    this.heroes = []; this.enemies = []; this.proj = []; this.timers = []; this.zones = [];
    const S = game.save;
    this.party = S.party.filter(id => S.heroes[id]).map(id => ({ def: HERO_BY_ID[id], h: S.heroes[id] }));
    this.speed = S.settings.speed || 1;
    this.autoSkill = S.settings.autoSkill !== false;
    this.autoNext = S.settings.autoNext !== false;
    this.time = 0; this.paused = false; this.over = false;
    this.selected = null; this.focus = null;
    this.stats = {};
    this.spawnQ = []; this.spawnT = 0;
    this.cutQ = [];
    const cp = resume && S.checkpoint && S.checkpoint.diff === diffId ? S.checkpoint : null;
    if (cp) {
      this.wave = cp.wave; this.castle = cp.castle; this.supply = cp.supply;
      this.rewards = Object.assign({ gold: 0, ruby: 0, evo: 0, awk: 0 }, cp.rewards);
      this.stats = cp.stats || {};
      for (const d of cp.deployed || []) {
        const m = this.party.find(p => p.def.id === d.id);
        if (m) this.heroes.push(this.makeHero(m, PADS[d.pad], d.enh, d.spent, true));
      }
    } else {
      this.wave = 1; this.castle = this.diff.castle; this.supply = this.diff.startSupply;
      this.rewards = { gold: 0, ruby: 0, evo: 0, awk: 0 };
    }
    this.castleMax = this.diff.castle;
    this.bestBefore = (S.diffs[diffId] || {}).best || 0;
    this.buildBg();
    this.buildHud();
    this.enterPrep(true);
    this.resize();
  }

  // ───────── 배경 미리 그리기 ─────────
  buildBg() {
    const k = Math.min(2, Math.max(1, this.game.pixelScale));
    const cv = document.createElement('canvas'); cv.width = W * k; cv.height = H * k;
    const c = cv.getContext('2d'); c.scale(k, k);
    const T = THEMES[this.diff.map];
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    // 땅
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, T.g1); g.addColorStop(1, T.g2);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 1400; i++) {
      const x = rnd() * W, y = rnd() * H;
      c.fillStyle = rgba(rnd() < 0.5 ? shade(T.g1, 0.15) : shade(T.g2, -0.15), 0.5);
      if (this.diff.map === 'snow') { c.beginPath(); c.arc(x, y, rnd() * 2 + 0.5, 0, TAU); c.fill(); }
      else { c.fillRect(x, y, 2, 3 + rnd() * 3); }
    }
    // 큰 얼룩 (음영)
    for (let i = 0; i < 26; i++) {
      const x = rnd() * W, y = rnd() * H, r = 40 + rnd() * 90;
      const gg = c.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, rgba(rnd() < 0.5 ? '#ffffff' : '#000000', 0.06)); gg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gg; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 길
    const stroke = (w, col) => { c.lineWidth = w; c.strokeStyle = col; c.lineJoin = 'round'; c.lineCap = 'round'; c.beginPath(); PATH.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); };
    stroke(84, rgba('#000000', 0.18));
    stroke(76, T.path2);
    stroke(62, T.path1);
    stroke(30, rgba('#ffffff', 0.08));
    for (let i = 0; i < 260; i++) {
      const p = Path.at(rnd() * Path.total), o = (rnd() - 0.5) * 56;
      c.fillStyle = rgba(rnd() < 0.5 ? T.path2 : '#ffffff', 0.35);
      c.beginPath(); c.ellipse(p.x + p.dy * o, p.y - p.dx * o, 2 + rnd() * 3, 1.5 + rnd() * 2, 0, 0, TAU); c.fill();
    }
    // 배치 자리 (돌 원판)
    for (const pd of PADS) {
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(pd.x, pd.y + 14, 36, 14, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(pd.x, pd.y + 8, 34, 15, 0, 0, TAU);
      c.fillStyle = vgrad(c, pd.y - 8, pd.y + 24, '#cfc8bc', '#7a7266'); c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#3a3230'; c.stroke();
      c.beginPath(); c.ellipse(pd.x, pd.y + 6, 26, 10, 0, 0, TAU); c.strokeStyle = rgba('#ffffff', 0.35); c.lineWidth = 2; c.stroke();
      c.fillStyle = rgba('#3a3230', 0.4); star5(c, pd.x, pd.y + 6, 8, 3.5); c.save(); c.translate(pd.x, pd.y + 6); c.scale(1, 0.4); c.translate(-pd.x, -pd.y - 6); c.fill(); c.restore();
    }
    // 장식 (나무 · 바위 등) — 길과 배치 자리에서 떨어진 곳에만
    const far = (x, y, r) => {
      for (const s of Path.segs) {
        const t = clamp(((x - s.ax) * s.dx + (y - s.ay) * s.dy), 0, s.len);
        if (Math.hypot(x - s.ax - s.dx * t, y - s.ay - s.dy * t) < r + 46) return false;
      }
      for (const pd of PADS) if (Math.hypot(x - pd.x, y - pd.y) < r + 44) return false;
      if (Math.hypot(x - CASTLE.x, y - CASTLE.y + 40) < 110) return false;
      if (y > 612 || y < 70) return false;
      return true;
    };
    const decos = [];
    for (let i = 0; i < 400 && decos.length < 46; i++) {
      const x = rnd() * W, y = 70 + rnd() * 560, big = rnd() < 0.6;
      if (far(x, y, big ? 22 : 10)) decos.push({ x, y, big, v: rnd() });
    }
    decos.sort((a, b) => a.y - b.y);
    for (const d of decos) drawDeco(c, T, d);
    this.bg = cv;
  }

  // ───────── HUD ─────────
  buildHud() {
    const R = this.root;
    $('#bDiff', R).textContent = this.diff.name;
    $('#bDiff', R).style.background = this.diff.color;
    $('#bMax', R).textContent = '/ ' + this.diff.rounds;
    const party = $('#bParty', R); party.innerHTML = '';
    for (const m of this.party) {
      const card = el('button', 'pcard elem-' + m.def.elem);
      card.dataset.id = m.def.id;
      card.innerHTML = `<img src="${portraitURL(m.def, m.h.awake, 96)}" alt=""><div class="cd"></div>
        <div class="stars">${starHtml(m.h)}</div><div class="cost"><i class="crys"></i>${heroCost(m.def)}</div>
        <div class="ready">SKILL</div><div class="nm">${m.def.name}</div>`;
      card.addEventListener('pointerdown', ev => { ev.preventDefault(); Sound.init(); this.onCard(m); });
      party.appendChild(card);
    }
    this.bindOnce();
    this.refreshHud(true);
  }

  bindOnce() {
    if (this.root.dataset.bound) return;
    this.root.dataset.bound = '1';
    const B = () => this.game.battle;
    this.cv.addEventListener('pointerdown', ev => { const b = B(); if (b) b.onTap(ev); });
    $('#bSpeed').addEventListener('click', () => { const b = B(); if (!b) return; b.speed = b.speed >= 3 ? 1 : b.speed + 1; b.game.save.settings.speed = b.speed; b.game.persist(); b.refreshHud(true); Sound.play('click'); });
    $('#bAuto').addEventListener('click', () => { const b = B(); if (!b) return; b.autoSkill = !b.autoSkill; b.game.save.settings.autoSkill = b.autoSkill; b.game.persist(); b.refreshHud(true); Sound.play('click'); });
    $('#bNextAuto').addEventListener('click', () => { const b = B(); if (!b) return; b.autoNext = !b.autoNext; b.game.save.settings.autoNext = b.autoNext; b.game.persist(); b.refreshHud(true); Sound.play('click'); });
    $('#bPause').addEventListener('click', () => { const b = B(); if (b) b.openPause(); });
    $('#bStart').addEventListener('click', () => { const b = B(); if (b && b.state === 'prep') { Sound.init(); b.startWave(); } });
    $('#bPopUp').addEventListener('click', () => { const b = B(); if (b) b.enhance(b.focus); });
    $('#bPopBack').addEventListener('click', () => { const b = B(); if (b) b.recall(b.focus); });
    $('#bPopSkill').addEventListener('click', () => { const b = B(); if (b && b.focus) b.tryManualSkill(b.focus); });
  }

  refreshHud(full) {
    const R = this.root;
    $('#bRound', R).textContent = 'ROUND ' + this.wave;
    $('#bCastleBar', R).style.width = (100 * this.castle / this.castleMax) + '%';
    $('#bCastleTxt', R).textContent = Math.ceil(this.castle) + ' / ' + this.castleMax;
    $('#bSupply', R).textContent = this.supply;
    $('#bGold', R).textContent = fmt(this.rewards.gold);
    if (full) {
      $('#bSpeed', R).textContent = '×' + this.speed;
      $('#bAuto', R).classList.toggle('on', this.autoSkill);
      $('#bNextAuto', R).classList.toggle('on', this.autoNext);
    }
    for (const card of $$('.pcard', R)) {
      const m = this.party.find(p => p.def.id === card.dataset.id);
      const hr = this.heroes.find(h => h.def.id === card.dataset.id);
      card.classList.toggle('deployed', !!hr);
      card.classList.toggle('sel', this.selected === m);
      card.classList.toggle('poor', !hr && this.supply < heroCost(m.def));
      const cd = $('.cd', card);
      if (hr) {
        const k = clamp(hr.cd / hr.cdMax, 0, 1);
        cd.style.setProperty('--k', (k * 360) + 'deg');
        card.classList.toggle('skillready', k <= 0);
        card.classList.toggle('stunned', hr.stunT > 0);
      } else { cd.style.setProperty('--k', '0deg'); card.classList.remove('skillready'); }
    }
    this.refreshPop();
  }

  refreshPop() {
    const pop = $('#bPop');
    const hr = this.focus;
    if (!hr || !this.heroes.includes(hr)) { pop.hidden = true; this.focus = null; return; }
    pop.hidden = false;
    const left = clamp(hr.x - 110, 8, W - 230), top = clamp(hr.y - 200, 60, H - 330);
    pop.style.left = left + 'px'; pop.style.top = (hr.y > 360 ? top : hr.y + 34) + 'px';
    const up = this.enhCost(hr);
    $('#bPopName').innerHTML = `<b>${hr.def.name}</b> <span class="enh">+${hr.enh}</span>`;
    $('#bPopInfo').innerHTML = `공격력 <b>${fmt(this.atkOf(hr))}</b> · 사거리 <b>${Math.round(this.rangeOf(hr))}</b><br>${skillNameOf(hr.def, hr.h)} <small>(${Math.max(0, hr.cd).toFixed(1)}초)</small>`;
    const bu = $('#bPopUp');
    if (hr.enh >= 5) { bu.innerHTML = '강화 MAX'; bu.disabled = true; }
    else { bu.innerHTML = `강화 +${hr.enh + 1} <i class="crys"></i>${up}`; bu.disabled = this.supply < up; }
    $('#bPopBack').innerHTML = `회수 <i class="crys"></i>+${Math.floor(hr.spent * 0.7)}`;
    $('#bPopSkill').disabled = hr.cd > 0;
  }

  resize() {
    const k = this.game.pixelScale;
    const w = Math.round(W * k), h = Math.round(H * k);
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
  }

  // ───────── 영웅 ─────────
  makeHero(m, pad, enh = 0, spent = 0, silent = false) {
    const def = m.def;
    const hr = { def, h: m.h, pad: pad.i, x: pad.x, y: pad.y + 10, enh, spent: spent || heroCost(def),
      cdMax: def.skill.cd * (m.h.awake ? 0.85 : 1), cd: def.skill.cd * 0.45, atkT: 0.25, act: null, face: def.id === 'kain' ? -1 : 1, aim: 0,
      born: silent ? -9 : this.time, stunT: 0, buffT: 0, buffAs: 0, buffAtk: 0, blink: 0, tOff: Math.random() * 10 };
    return hr;
  }
  atkOf(hr) { return heroAtk(hr.def, hr.h) * (1 + 0.25 * hr.enh) * (1 + (hr.buffT > 0 ? hr.buffAtk : 0)); }
  aspdOf(hr) { return hr.def.aspd * (1 + 0.04 * hr.enh) * (1 + (hr.buffT > 0 ? hr.buffAs : 0)); }
  rangeOf(hr) { return heroRange(hr.def, hr.h) * (1 + 0.03 * hr.enh); }
  enhCost(hr) { return 4 + hr.enh * 3; }

  onCard(m) {
    if (this.over) return;
    const hr = this.heroes.find(h => h.def.id === m.def.id);
    if (hr) { this.tryManualSkill(hr); return; }
    if (this.selected === m) { this.selected = null; }
    else if (this.supply < heroCost(m.def)) { Sound.play('error'); this.toast('보급이 부족합니다'); return; }
    else { this.selected = m; this.focus = null; Sound.play('tap'); }
    this.refreshHud();
  }

  tryManualSkill(hr) {
    if (hr.cd > 0) { Sound.play('error'); this.toast(`${hr.def.skill.name} 재사용 대기 ${hr.cd.toFixed(1)}초`); return; }
    if (hr.stunT > 0) { Sound.play('error'); this.toast('기절 상태입니다'); return; }
    if (!this.skillUsable(hr)) { Sound.play('error'); this.toast('범위 안에 적이 없습니다'); return; }
    if (hr.act && hr.act.type === 'skill') return;
    this.castSkill(hr);
  }

  canvasPos(ev) {
    const r = this.cv.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H };
  }

  onTap(ev) {
    if (this.over || this.paused) return;
    Sound.init();
    const p = this.canvasPos(ev);
    // 배치된 영웅을 눌렀는지
    let best = null, bd = 48;
    for (const hr of this.heroes) { const d = dist(p.x, p.y, hr.x, hr.y - 30); if (d < bd) { bd = d; best = hr; } }
    if (best && !this.selected) { this.focus = this.focus === best ? null : best; Sound.play('tap'); this.refreshHud(); return; }
    // 빈 자리를 눌렀는지
    let pad = null; bd = 46;
    for (const pd of PADS) { const d = dist(p.x, p.y, pd.x, pd.y); if (d < bd) { bd = d; pad = pd; } }
    if (this.selected && pad) {
      if (this.heroes.some(h => h.pad === pad.i)) { Sound.play('error'); this.toast('이미 영웅이 있는 자리입니다'); return; }
      this.deploy(this.selected, pad);
      return;
    }
    if (pad && !this.selected && !this.heroes.some(h => h.pad === pad.i)) this.toast('아래 영웅 카드를 누른 뒤 자리를 선택하세요');
    this.focus = null; this.selected = null; this.refreshHud();
  }

  deploy(m, pad) {
    const cost = heroCost(m.def);
    if (this.supply < cost) { Sound.play('error'); return; }
    this.supply -= cost;
    const hr = this.makeHero(m, pad);
    this.heroes.push(hr);
    this.selected = null;
    const E = ELEMS[m.def.elem];
    this.fx.add('summon', { x: pad.x, y: pad.y + 8, color: E.color, dur: 0.7, layer: 'ground' });
    this.fx.add('flash', { x: pad.x, y: pad.y - 30, r: 70, color: E.color, dur: 0.4 });
    this.fx.elemBurst(pad.x, pad.y - 10, m.def.elem, 16, 160);
    Sound.play('deploy');
    this.refreshHud();
  }

  enhance(hr) {
    if (!hr || hr.enh >= 5) return;
    const cost = this.enhCost(hr);
    if (this.supply < cost) { Sound.play('error'); return; }
    this.supply -= cost; hr.spent += cost; hr.enh++;
    this.fx.add('ring', { x: hr.x, y: hr.y, r: 60, color: '#ffd23f', dur: 0.5, layer: 'ground' });
    this.fx.burst(hr.x, hr.y - 40, '#ffe27a', 16, 140, { kind: 'star', add: true });
    this.fx.text(hr.x, hr.y - 90, '강화 +' + hr.enh, '#ffe27a', 22);
    Sound.play('upgrade');
    this.refreshHud();
  }

  recall(hr) {
    if (!hr) return;
    this.supply += Math.floor(hr.spent * 0.7);
    this.heroes.splice(this.heroes.indexOf(hr), 1);
    this.fx.elemBurst(hr.x, hr.y - 30, hr.def.elem, 14, 120);
    this.focus = null;
    Sound.play('tap');
    this.refreshHud();
  }

  // ───────── 라운드 진행 ─────────
  enterPrep(first) {
    this.state = 'prep';
    this.waveData = makeWave(this.wave, this.diff);
    this.saveCheckpoint();
    const wd = this.waveData;
    const E = ELEMS[wd.main];
    const info = $('#bWaveInfo');
    info.innerHTML = `<span class="round">ROUND ${this.wave}</span> <span class="etag" style="background:${E.color}">${E.name} 속성</span> 적 ${wd.list.length}` +
      (wd.final ? ' · <b class="bosstxt">최종 보스!</b>' : wd.boss ? ' · <b class="bosstxt">보스 출현!</b>' : wd.elite ? ' · <b class="elitetxt">정예 출현</b>' : '');
    info.hidden = false;
    $('#bStart').hidden = false;
    this.prepT = first ? -1 : 3.2;
    Sound.playBgm('battle');
    this.refreshHud(true);
  }

  startWave() {
    this.state = 'wave';
    $('#bStart').hidden = true; $('#bWaveInfo').hidden = true;
    this.spawnQ = this.waveData.list.slice();
    this.spawnT = 0.6;
    this.banner(this.waveData.boss ? (this.waveData.final ? 'FINAL BOSS' : 'BOSS ROUND') : 'ROUND ' + this.wave, this.waveData.boss ? 'boss' : '');
    if (this.waveData.boss) {
      Sound.play('boss'); Sound.playBgm('boss');
      this.fx.add('vignette', { dur: 2.2, a: 0.55 });
    } else Sound.play('wave');
  }

  waveCleared() {
    const n = this.wave, D = this.diff;
    const gold = Math.round((15 + n * 4) * D.gold);
    this.rewards.gold += gold;
    this.rewards.ruby += 1 + (this.waveData.boss ? 10 : 0) + (n > this.bestBefore ? 4 : 0);
    this.supply += 3 + Math.floor(n / 10);
    if (n % 5 === 0) this.rewards.evo += DIFFS.indexOf(D) + 1;
    Sound.play('clear');
    this.game.recordWave(D.id, n);
    if (n >= D.rounds) { this.finish(true); return; }
    this.banner('CLEAR!', 'clear');
    this.wave++;
    this.enterPrep(false);
  }

  saveCheckpoint() {
    const S = this.game.save;
    S.checkpoint = { diff: this.diff.id, wave: this.wave, castle: this.castle, supply: this.supply, rewards: Object.assign({}, this.rewards),
      stats: this.stats, deployed: this.heroes.map(h => ({ id: h.def.id, pad: h.pad, enh: h.enh, spent: h.spent })) };
    this.game.persist();
  }

  finish(win) {
    if (this.over) return;
    this.over = true; this.state = win ? 'won' : 'lost';
    this.game.save.checkpoint = null;
    this.game.persist();
    Sound.playBgm(null);
    Sound.play(win ? 'victory' : 'defeat');
    if (win) for (const hr of this.heroes) hr.victory = true;
    setTimeout(() => this.game.ui.showResult(this, win), win ? 1600 : 900);
  }

  banner(text, cls) {
    const b = $('#bBanner');
    b.className = 'banner ' + (cls || '');
    b.innerHTML = `<span>${text}</span>`;
    void b.offsetWidth; b.classList.add('show');
  }
  toast(msg) { this.game.ui.toast(msg); }

  openPause() {
    if (this.over) return;
    this.paused = true;
    Sound.play('click');
    this.game.ui.openPause(this);
  }

  // ───────── 업데이트 ─────────
  update(rdt) {
    if (this.paused) return;
    const total = Math.min(rdt, 0.1) * this.speed;
    const steps = Math.ceil(total / (1 / 60));
    const dt = total / steps;
    for (let i = 0; i < steps; i++) this.step(dt);
    this.hudT = (this.hudT || 0) - rdt;
    if (this.hudT <= 0) { this.hudT = 0.1; this.refreshHud(); }
    this.fxUpdateReal(rdt);
  }

  fxUpdateReal(rdt) { /* 실시간 UI 효과 자리 */ }

  step(dt) {
    this.time += dt;
    if (this.over) { this.fx.update(dt); for (const hr of this.heroes) if (hr.act) this.updateHero(hr, dt); return; }
    if (this.state === 'prep' && this.prepT > 0 && this.autoNext) {
      this.prepT -= dt;
      $('#bStart').dataset.count = Math.ceil(this.prepT);
      if (this.prepT <= 0) this.startWave();
    } else if (this.state === 'prep') $('#bStart').dataset.count = '';
    if (this.state === 'wave') {
      if (this.spawnQ.length) {
        this.spawnT -= dt;
        if (this.spawnT <= 0) { this.spawn(this.spawnQ.shift()); this.spawnT = this.waveData.gap * (this.spawnQ.length && this.spawnQ[0].boss ? 2.5 : 1); }
      } else if (!this.enemies.length) this.waveCleared();
    }
    for (const t of this.timers) t.t -= dt;
    for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i].t <= 0) { const t = this.timers[i]; this.timers.splice(i, 1); t.fn(); }
    for (const z of this.zones) this.updateZone(z, dt);
    this.zones = this.zones.filter(z => z.t < z.dur);
    for (const e of this.enemies) this.updateEnemy(e, dt);
    this.enemies = this.enemies.filter(e => !e.gone);
    for (const hr of this.heroes) this.updateHero(hr, dt);
    for (const p of this.proj) this.updateProj(p, dt);
    this.proj = this.proj.filter(p => !p.done);
    this.fx.update(dt);
  }

  later(t, fn) { this.timers.push({ t, fn }); }

  // ───────── 적 ─────────
  spawn(spec) {
    const def = ENEMIES[spec.type];
    const n = this.wave;
    let hp = ENEMY_HP_UNIT * def.hp * waveScale(n) * this.diff.hp;
    if (spec.elite) hp *= 1.2;
    const p = Path.at(0);
    const e = { id: ENEMY_UID++, type: spec.type, def, elem: spec.elem, hp, maxHp: hp, dist: 0, x: p.x, y: p.y,
      spd: def.spd * (1 + Math.min(0.3, n * 0.003)) * rand(0.95, 1.05), slow: 0, slowT: 0, freezeT: 0, stunT: 0,
      burnDps: 0, burnT: 0, dotDps: 0, dotT: 0, curseT: 0, curseMul: 0, tick: 0, shieldT: 0, dashT: 0,
      walk: Math.random() * 6, face: -1, hitT: 0, abilT: def.boss ? 6 : 0, lane: rand(-14, 14), t: Math.random() * 5, boss: !!def.boss };
    this.enemies.push(e);
    if (def.boss) {
      this.fx.add('flash', { x: PORTAL.x, y: PORTAL.y, r: 160, color: '#a64dff', dur: 0.8 });
      this.fx.shake = 10;
      this.bossBar(e);
    }
  }

  bossBar(e) {
    this.boss = e;
    const bb = $('#bBoss'); bb.hidden = false;
    $('#bBossName').textContent = e.def.name + ' · ' + ELEMS[e.elem].name + ' 속성';
  }

  updateEnemy(e, dt) {
    e.t += dt;
    if (e.dead) { e.deadT += dt; if (e.deadT > 0.45) e.gone = true; return; }
    e.hitT = Math.max(0, e.hitT - dt);
    // 상태 이상
    e.tick += dt;
    if (e.tick >= 0.5) {
      e.tick -= 0.5;
      if (e.burnT > 0) { this.damage(e, e.burnDps * 0.5, null, { dot: 'fire' }); if (e.dead) return; }
      if (e.dotT > 0) { this.damage(e, e.dotDps * 0.5, null, { dot: 'dark' }); if (e.dead) return; }
    }
    e.burnT -= dt; e.dotT -= dt; e.curseT -= dt; e.shieldT -= dt; e.dashT -= dt;
    if (e.burnT > 0 && Math.random() < dt * 8) this.fx.part({ x: e.x + rand(-8, 8), y: e.y - rand(10, 30), vy: -40, color: Math.random() < 0.5 ? '#ff8a3d' : '#ffd23f', kind: 'ember', life: 0.5, size: 3 });
    if (e.def.boss) this.bossAbility(e, dt);
    let spd = e.spd;
    if (e.slowT > 0) { e.slowT -= dt; spd *= 1 - e.slow; } else e.slow = 0;
    if (e.dashT > 0) spd *= 3;
    if (e.freezeT > 0) { e.freezeT -= dt; spd = 0; }
    if (e.stunT > 0) { e.stunT -= dt; spd = 0; }
    e.dist += spd * dt;
    if (spd > 0) e.walk += dt * spd / 14;
    const p = Path.at(e.dist);
    e.x = p.x + p.dy * e.lane; e.y = p.y - p.dx * e.lane * 0.5;
    if (Math.abs(p.dx) > 0.5) e.face = p.dx > 0 ? 1 : -1;
    if (e.dist >= Path.total) {
      // 성에 도달
      e.gone = true;
      const dmg = e.def.final ? this.castle : e.def.dmg;
      this.castle = Math.max(0, this.castle - dmg);
      this.fx.shake = 12;
      this.fx.add('flash', { x: CASTLE.x + 20, y: CASTLE.y - 40, r: 90, color: '#ff3a3a', dur: 0.4 });
      this.fx.text(CASTLE.x + 40, CASTLE.y - 90, '-' + dmg, '#ff4a4a', 28);
      Sound.play('castle');
      this.refreshHud();
      if (this.castle <= 0) this.finish(false);
    }
  }

  bossAbility(e, dt) {
    e.abilT -= dt;
    if (e.abilT > 0) return;
    e.abilT = 7.5;
    let ab = e.def.ability;
    if (ab === 'all') ab = ['roar', 'summon', 'shield', 'heal'][Math.floor(e.t / 7.5) % 4];
    const say = (s, col) => this.fx.text(e.x, e.y - 110, s, col, 26, { dur: 1.3 });
    if (ab === 'roar') {
      say('포효!', '#ff6a3a');
      this.fx.add('ring', { x: e.x, y: e.y - 20, r: 280, color: '#ff6a3a', w: 10, dur: 0.7 });
      this.fx.add('vignette', { dur: 0.8, a: 0.35, color: '#ff4a00' });
      this.fx.shake = 14; Sound.play('boom');
      for (const hr of this.heroes) if (dist(hr.x, hr.y, e.x, e.y) < 280) { hr.stunT = 1.6; hr.act = null; }
    } else if (ab === 'shield') {
      say('얼음 방벽!', '#9ee3ff'); e.shieldT = 3.5; Sound.play('ice');
    } else if (ab === 'dash') {
      say('돌진!', '#7dffb0'); e.dashT = 1.2; Sound.play('wind');
    } else if (ab === 'heal') {
      say('타락의 치유', '#fff1a0'); Sound.play('holy');
      for (const o of this.enemies) if (!o.dead && dist(o.x, o.y, e.x, e.y) < 220) { const h = o.maxHp * (o === e ? 0.1 : 0.15); o.hp = Math.min(o.maxHp, o.hp + h); }
      this.fx.add('heal', { x: e.x, y: e.y - 30, r: 120, dur: 0.8 });
    } else if (ab === 'summon') {
      say('망자 소환', '#c77dff'); Sound.play('dark');
      for (let i = 0; i < 3; i++) {
        this.spawn({ type: 'skeleton', elem: 'dark' });
        const s = this.enemies[this.enemies.length - 1];
        s.dist = Math.max(0, e.dist - 20 - i * 26); s.hp = s.maxHp = s.maxHp * 0.7;
        this.fx.elemBurst(e.x, e.y, 'dark', 8, 120);
      }
    }
  }

  // 피해 처리
  damage(e, amount, src, o = {}) {
    if (e.dead) return 0;
    let dmg = amount;
    let weak = 1;
    if (!o.pure) {
      if (src) { weak = elemMult(src.def.elem, e.elem); dmg *= weak; }
      if (e.curseT > 0) dmg *= 1 + e.curseMul;
      if (e.shieldT > 0) dmg *= 0.4;
      if (o.crit) dmg *= 1.8;
    }
    dmg = Math.max(1, dmg);
    e.hp -= dmg; e.hitT = 0.1;
    if (src) this.stats[src.def.id] = (this.stats[src.def.id] || 0) + dmg;
    if (!o.silent && this.game.save.settings.dmgText !== false) {
      if (o.dot) this.fx.text(e.x, e.y - 40, fmt(dmg), o.dot === 'fire' ? '#ffb070' : '#e2b8ff', 14, { dur: 0.6 });
      else if (o.crit) this.fx.text(e.x, e.y - 52, fmt(dmg) + '!', '#ffe14d', 26, { stroke: '#7a1a00' });
      else this.fx.text(e.x, e.y - 48, fmt(dmg), weak > 1 ? '#ffb15a' : weak < 1 ? '#b8c4d0' : '#ffffff', weak > 1 ? 21 : 17);
    }
    if (e.hp <= 0) this.kill(e, src);
    return dmg;
  }

  kill(e, src) {
    e.dead = true; e.deadT = 0; e.hp = 0;
    const D = this.diff, def = e.def, n = this.wave;
    const gold = Math.round(def.gold * (2 + n * 0.35) * D.gold);
    this.rewards.gold += gold;
    this.supply += def.boss ? 8 : def.elite ? 3 : 1;
    this.fx.elemBurst(e.x, e.y - 20, e.elem, def.boss ? 40 : 10, def.boss ? 260 : 140);
    this.fx.burst(e.x, e.y - 20, '#ffffff', def.boss ? 20 : 5, 120, { kind: 'smoke', add: false, size: 10, life: 0.6 });
    Sound.play('die');
    if (def.elite) {
      if (Math.random() < 0.25) { this.rewards.evo += 1; this.fx.text(e.x, e.y - 80, '진화석 +1', '#7dffb0', 18); }
    }
    if (def.boss) {
      this.fx.shake = 18;
      this.fx.add('flash', { x: e.x, y: e.y - 40, r: 220, color: ELEMS[e.elem].color, dur: 0.9 });
      this.fx.add('ring', { x: e.x, y: e.y, r: 260, color: '#ffffff', w: 12, dur: 0.8 });
      Sound.play('boom');
      const evo = D.drop.evo * (1 + Math.floor(n / 20)) + randi(0, 2);
      const awk = D.drop.awk ? D.drop.awk + randi(0, 1) : 0;
      this.rewards.evo += evo; this.rewards.awk += awk;
      this.fx.text(e.x, e.y - 120, `진화석 +${evo}` + (awk ? `  각성석 +${awk}` : ''), '#ffe27a', 26, { dur: 1.8 });
      if (this.boss === e) { this.boss = null; $('#bBoss').hidden = true; }
    }
    if (this.focus && this.focus.stunT) this.refreshPop();
  }

  // ───────── 영웅 행동 ─────────
  enemiesIn(x, y, r) { return this.enemies.filter(e => !e.dead && Math.hypot(e.x - x, (e.y - y) * 1.15) <= r); }
  findTarget(hr, r) {
    r = r || this.rangeOf(hr);
    let best = null;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - hr.x, (e.y - hr.y) * 1.15) > r) continue;
      if (!best || e.dist > best.dist) best = e;
    }
    return best;
  }
  strongest(list) { let b = null; for (const e of list) if (!b || e.hp > b.hp) b = e; return b; }
  densest(list, r = 90) {
    let b = null, bn = -1;
    for (const e of list) { let n = 0; for (const o of list) if (Math.hypot(o.x - e.x, o.y - e.y) < r) n++; if (n > bn) { bn = n; b = e; } }
    return b;
  }
  skillUsable(hr) {
    if (this.state !== 'wave' && this.enemies.length === 0) return false;
    if (hr.def.id === 'serena') return this.enemies.some(e => !e.dead);
    return !!this.findTarget(hr, this.rangeOf(hr) * (hr.def.id === 'aqua' || hr.def.id === 'lilith' ? 1 : 1));
  }

  updateHero(hr, dt) {
    hr.blink = Math.max(0, hr.blink - dt);
    if (hr.buffT > 0) hr.buffT -= dt;
    if (this.over) {
      if (hr.act) { hr.act.t += dt; if (hr.act.t >= hr.act.dur) hr.act = null; }
      return;
    }
    if (hr.stunT > 0) { hr.stunT -= dt; return; }
    hr.cd -= dt;
    if (hr.act) {
      const a = hr.act;
      a.t += dt;
      const p = Math.min(1, a.t / a.dur);
      while (a.hits.length && p >= a.hits[0]) {
        const idx = a.hitIdx++;
        a.hits.shift();
        if (a.type === 'skill') this.doSkill(hr, a.target); else this.doAttack(hr, a, idx);
      }
      if (a.t >= a.dur) hr.act = null;
      return;
    }
    if (this.autoSkill && hr.cd <= 0 && this.state === 'wave' && this.skillUsable(hr)) { this.castSkill(hr); return; }
    hr.atkT -= dt;
    if (hr.atkT <= 0) {
      const tgt = this.findTarget(hr);
      if (!tgt) { hr.atkT = 0; return; }
      const as = this.aspdOf(hr);
      hr.atkT = 1 / as;
      const anim = hr.def.anim;
      const dur = Math.min(ACTION_TIME[anim], 0.92 / as);
      hr.act = { type: 'attack', t: 0, dur, hits: HIT_AT[anim].slice(), hitIdx: 0, target: tgt };
      this.faceTo(hr, tgt);
    }
  }

  faceTo(hr, tgt) {
    if (!tgt) return;
    hr.face = tgt.x >= hr.x ? 1 : -1;
    hr.aim = Math.atan2((tgt.y - 25) - (hr.y - 40), Math.abs(tgt.x - hr.x) + 1);
  }

  handOf(hr) { return { x: hr.x + hr.face * 22, y: hr.y - 46 }; }

  doAttack(hr, a, idx) {
    let t = a.target;
    if (!t || t.dead) { t = this.findTarget(hr, this.rangeOf(hr) + 30); if (!t) return; a.target = t; this.faceTo(hr, t); }
    const atk = this.atkOf(hr), id = hr.def.id, E = ELEMS[hr.def.elem];
    const crit = Math.random() < (hr.def.crit || 0.1);
    const h = this.handOf(hr);
    switch (id) {
      case 'leon': {
        this.damage(t, atk, hr, { crit });
        for (const o of this.enemiesIn(t.x, t.y, 60)) if (o !== t) this.damage(o, atk * 0.6, hr);
        this.fx.add('slash', { x: t.x, y: t.y - 26, r: 34, rot: hr.face > 0 ? 0.3 : Math.PI - 0.3, color: E.color, dur: 0.3 });
        this.fx.elemBurst(t.x, t.y - 26, 'fire', 6, 120);
        Sound.play('slash'); break;
      }
      case 'luciel': {
        this.damage(t, atk, hr, { crit });
        for (const o of this.enemiesIn(t.x, t.y, 58)) if (o !== t) this.damage(o, atk * 0.5, hr);
        this.fx.add('ring', { x: t.x, y: t.y, r: 60, color: '#ffe27a', dur: 0.35, layer: 'ground' });
        this.fx.add('flash', { x: t.x, y: t.y - 20, r: 40, color: '#ffd23f', dur: 0.25 });
        this.fx.burst(t.x, t.y - 10, '#fff3a0', 8, 140, { kind: 'star' });
        Sound.play('heavy'); break;
      }
      case 'kain': {
        this.damage(t, atk, hr, { crit });
        for (const o of this.enemiesIn(t.x, t.y, 78)) if (o !== t) this.damage(o, atk * 0.7, hr);
        this.fx.add('reap', { x: t.x, y: t.y - 20, r: 60, face: hr.face, dur: 0.35 });
        Sound.play('slash'); break;
      }
      case 'kai': {
        this.damage(t, atk, hr, { crit });
        const behind = this.enemies.filter(o => !o.dead && o !== t && Math.abs(o.dist - t.dist) < 70 && dist(o.x, o.y, t.x, t.y) < 80).slice(0, 2);
        for (const o of behind) this.damage(o, atk * 0.7, hr);
        this.fx.add('dashline', { x: h.x, y: h.y + 10, x2: t.x + (t.x - h.x) * 0.3, y2: t.y - 24 + (t.y - h.y) * 0.1, color: E.color, dur: 0.22 });
        this.fx.elemBurst(t.x, t.y - 24, 'water', 6, 110);
        Sound.play('slash'); break;
      }
      case 'bane': {
        this.damage(t, atk, hr, { crit: Math.random() < hr.def.crit });
        this.fx.add('xslash', { x: t.x, y: t.y - 26, rot: idx ? 0.7 : -0.7, dur: 0.25 });
        Sound.play(idx ? 'crit' : 'slash'); break;
      }
      case 'sylph': {
        const others = this.enemiesIn(hr.x, hr.y, this.rangeOf(hr)).filter(o => o !== t).sort((a, b) => b.dist - a.dist);
        this.shoot(hr, t, 'windarrow', atk, { crit });
        if (others[0]) this.shoot(hr, others[0], 'windarrow', atk, { delay: 0.05 });
        Sound.play('arrow'); break;
      }
      case 'sera': this.shoot(hr, t, 'firearrow', atk, { crit }); Sound.play('arrow'); break;
      case 'yuki': this.shoot(hr, t, 'icearrow', atk, { crit }); Sound.play('arrow'); break;
      case 'hayate': this.shoot(hr, t, 'shuriken', atk, { crit }); Sound.play('arrow'); break;
      case 'agni': this.shoot(hr, t, 'fireball', atk, { crit }); Sound.play('magic'); break;
      case 'aqua': this.shoot(hr, t, 'waterorb', atk, { crit }); Sound.play('magic'); break;
      case 'zephyr': this.shoot(hr, t, 'windblade', atk, { crit, pierce: true }); Sound.play('wind'); break;
      case 'serena': this.shoot(hr, t, 'holybolt', atk, { crit }); Sound.play('magic'); break;
      case 'elysia': this.shoot(hr, t, 'holyspear', atk, { crit, pierce: true }); Sound.play('arrow'); break;
      case 'lilith': this.shoot(hr, t, 'darkorb', atk, { crit }); Sound.play('magic'); break;
    }
  }

  // ───────── 투사체 ─────────
  shoot(hr, t, kind, dmg, o = {}) {
    const h = this.handOf(hr);
    const spd = { fireball: 520, waterorb: 560, darkorb: 520, holybolt: 640, windblade: 700, holyspear: 900, shuriken: 900 }[kind] || 980;
    const p = { kind, x: h.x, y: h.y, t: 0, target: t, tx: t.x, ty: t.y - 24, spd, dmg, crit: o.crit, src: hr, elem: hr.def.elem, trail: [], delay: o.delay || 0, pierce: o.pierce, hit: new Set(), travel: 0, rot: 0 };
    if (p.pierce) {
      const dx = t.x - h.x, dy = t.y - 24 - h.y, l = Math.hypot(dx, dy) || 1;
      p.vx = dx / l * spd; p.vy = dy / l * spd; p.maxTravel = this.rangeOf(hr) + 120;
    }
    if (o.fromSky) { p.x = t.x + rand(-60, 60); p.y = t.y - 420; }
    this.proj.push(p);
    return p;
  }

  updateProj(p, dt) {
    if (p.delay > 0) { p.delay -= dt; return; }
    p.t += dt;
    p.trail.push({ x: p.x, y: p.y }); if (p.trail.length > 7) p.trail.shift();
    if (p.pierce) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.travel += p.spd * dt; p.rot = Math.atan2(p.vy, p.vx);
      for (const e of this.enemies) {
        if (e.dead || p.hit.has(e.id)) continue;
        if (Math.hypot(e.x - p.x, e.y - 24 - p.y) < 26 * (e.def.size || 1)) {
          p.hit.add(e.id);
          this.damage(e, p.dmg * (p.hit.size === 1 ? 1 : 0.8), p.src, { crit: p.crit && p.hit.size === 1 });
          this.fx.elemBurst(e.x, e.y - 24, p.elem, 5, 100);
        }
      }
      if (p.travel > p.maxTravel || p.x < -50 || p.x > W + 50 || p.y < -50 || p.y > H + 50) p.done = true;
      return;
    }
    if (p.target && !p.target.dead) { p.tx = p.target.x; p.ty = p.target.y - 24 * (p.target.def.size || 1); }
    const dx = p.tx - p.x, dy = p.ty - p.y, l = Math.hypot(dx, dy);
    const mv = p.spd * dt;
    p.rot = Math.atan2(dy, dx);
    if (l <= mv + 6) { p.x = p.tx; p.y = p.ty; p.done = true; this.projHit(p); return; }
    p.x += dx / l * mv; p.y += dy / l * mv;
    if (p.kind === 'fireball' && Math.random() < 0.7) this.fx.part({ x: p.x, y: p.y, vx: rand(-30, 30), vy: rand(-40, 0), color: Math.random() < 0.5 ? '#ffb03a' : '#ff5a2a', kind: 'ember', life: 0.35, size: 4 });
    if (p.kind === 'darkorb' && Math.random() < 0.5) this.fx.part({ x: p.x, y: p.y, vx: rand(-20, 20), vy: rand(-20, 20), color: '#c77dff', life: 0.4, size: 3 });
    if (p.kind === 'holybolt' && Math.random() < 0.5) this.fx.part({ x: p.x, y: p.y, color: '#fff3a0', kind: 'star', life: 0.35, size: 3 });
  }

  projHit(p) {
    const t = p.target, src = p.src, atk = p.dmg;
    const at = (t && !t.dead) ? t : null;
    switch (p.kind) {
      case 'fireball':
        for (const e of this.enemiesIn(p.x, p.y + 24, 58)) this.damage(e, e === at ? atk : atk * 0.6, src, { crit: e === at && p.crit });
        this.fx.add('flash', { x: p.x, y: p.y, r: 60, color: '#ff5a2a', inner: '#fff0c0', dur: 0.35 });
        this.fx.add('ring', { x: p.x, y: p.y + 20, r: 64, color: '#ff8a3d', dur: 0.35, layer: 'ground' });
        this.fx.elemBurst(p.x, p.y, 'fire', 12, 170);
        Sound.play('fire'); return;
      case 'firearrow':
        if (at) { this.damage(at, atk, src, { crit: p.crit }); at.burnDps = Math.max(at.burnDps * (at.burnT > 0 ? 1 : 0), atk * 0.15); at.burnT = 2; }
        this.fx.elemBurst(p.x, p.y, 'fire', 5, 90); return;
      case 'icearrow':
        if (at) { this.damage(at, atk, src, { crit: p.crit }); this.slow(at, 0.3, 1.2); }
        this.fx.burst(p.x, p.y, '#cfefff', 6, 120, { kind: 'shard', add: false }); Sound.play('ice'); return;
      case 'waterorb':
        if (at) { this.damage(at, atk, src, { crit: p.crit }); this.slow(at, 0.15, 1); }
        this.fx.elemBurst(p.x, p.y, 'water', 8, 110); return;
      case 'darkorb':
        if (at) { this.damage(at, atk, src, { crit: p.crit }); at.dotDps = Math.max(at.dotT > 0 ? at.dotDps : 0, atk * 0.35); at.dotT = 3; }
        this.fx.add('flash', { x: p.x, y: p.y, r: 36, color: '#a64dff', dur: 0.3 });
        this.fx.elemBurst(p.x, p.y, 'dark', 6, 90); return;
      case 'holybolt':
        if (at) this.damage(at, atk, src, { crit: p.crit });
        this.fx.add('flash', { x: p.x, y: p.y, r: 34, color: '#ffd23f', dur: 0.25 });
        this.fx.burst(p.x, p.y, '#fff3a0', 5, 100, { kind: 'star' }); return;
      case 'skyarrow':
        for (const e of this.enemiesIn(p.x, p.y + 20, 34)) this.damage(e, atk, src);
        this.fx.elemBurst(p.x, p.y + 10, p.elem, 4, 80); return;
      default:
        if (at) this.damage(at, atk, src, { crit: p.crit });
        this.fx.elemBurst(p.x, p.y, p.elem, 4, 90);
    }
  }

  slow(e, amt, t) { if (amt >= e.slow || e.slowT <= 0) e.slow = amt; e.slowT = Math.max(e.slowT, t); }
  knock(e, d) { e.dist = Math.max(0, e.dist - (e.boss ? d * 0.3 : d)); }

  // ───────── 스킬 ─────────
  castSkill(hr) {
    const tgt = this.findTarget(hr, this.rangeOf(hr) * 1.05) || this.enemies.find(e => !e.dead);
    hr.cd = hr.cdMax;
    hr.atkT = Math.max(hr.atkT, 0.2);
    hr.act = { type: 'skill', t: 0, dur: SKILL_TIME, hits: [SKILL_HIT], hitIdx: 0, target: tgt };
    if (tgt) this.faceTo(hr, tgt);
    Sound.play('skill');
    this.cutIn(hr);
    const E = ELEMS[hr.def.elem];
    this.fx.add('flash', { x: hr.x, y: hr.y - 40, r: 90, color: E.color, dur: 0.6 });
    this.fx.text(hr.x, hr.y - 100, skillNameOf(hr.def, hr.h), E.light, 24, { dur: 1.2, stroke: E.dark, vy: -30 });
  }

  cutIn(hr) {
    const ci = $('#bCut');
    const E = ELEMS[hr.def.elem];
    ci.style.setProperty('--ec', E.color); ci.style.setProperty('--el', E.light);
    ci.innerHTML = `<img src="${portraitURL(hr.def, hr.h.awake, 128)}" alt=""><div><small>${hr.def.title}</small><b>${skillNameOf(hr.def, hr.h)}</b></div>`;
    ci.classList.remove('show'); void ci.offsetWidth; ci.classList.add('show');
  }

  doSkill(hr, tgt) {
    const id = hr.def.id, aw = !!hr.h.awake, atk = this.atkOf(hr), R = this.rangeOf(hr), E = ELEMS[hr.def.elem];
    if (!tgt || tgt.dead) tgt = this.findTarget(hr, R * 1.1) || this.densest(this.enemies.filter(e => !e.dead));
    const inR = (r = R) => this.enemiesIn(hr.x, hr.y, r);
    this.fx.shake = Math.max(this.fx.shake, 6);
    switch (id) {
      case 'leon': {
        const r = R * (aw ? 1.25 : 1.05);
        const hit = mult => {
          for (const e of inR(r)) { this.damage(e, atk * mult, hr); e.burnDps = atk * (aw ? 0.8 : 0.5); e.burnT = aw ? 5 : 3; }
          this.fx.add('crescent', { x: hr.x, y: hr.y - 20, r: r * 0.9, rot: Math.random() * TAU, color: '#ff5a2a', color2: '#ffc46b', dur: 0.55 });
          this.fx.add('ring', { x: hr.x, y: hr.y, r, color: '#ff8a3d', w: 10, dur: 0.5, layer: 'ground' });
          this.fx.elemBurst(hr.x, hr.y - 30, 'fire', 30, 300); Sound.play('fire');
        };
        hit(aw ? 6 : 4);
        if (aw) this.later(0.32, () => hit(3));
        break;
      }
      case 'agni': {
        const n = aw ? 6 : 3;
        const pool = this.enemies.filter(e => !e.dead);
        const targets = [];
        let cand = inR(R * 1.2); if (!cand.length) cand = pool;
        for (let i = 0; i < n && cand.length; i++) {
          const c = this.densest(cand); targets.push({ x: c.x, y: c.y, d: c.dist });
          cand = cand.filter(e => dist(e.x, e.y, c.x, c.y) > 70);
          if (!cand.length) cand = inR(R * 1.2);
        }
        targets.forEach((p, i) => {
          this.later(i * 0.16, () => {
            this.fx.add('meteor', { x: p.x, y: p.y - 10, r: 80, dur: 0.95 });
            this.later(0.52, () => {
              for (const e of this.enemiesIn(p.x, p.y, 92)) { this.damage(e, atk * (aw ? 4 : 3), hr); e.burnDps = atk * 0.3; e.burnT = 3; }
              this.fx.elemBurst(p.x, p.y - 10, 'fire', 24, 260); this.fx.shake = 10; Sound.play('boom');
            });
          });
        });
        break;
      }
      case 'sera': {
        const n = aw ? 20 : 12;
        const c0 = tgt || hr;
        for (let i = 0; i < n; i++) {
          this.later(i * 0.055, () => {
            const near = this.enemiesIn(c0.x, c0.y, 150);
            const e = near.length ? pick(near) : null;
            const x = e ? e.x + rand(-10, 10) : c0.x + rand(-80, 80), y = e ? e.y - 14 : c0.y + rand(-40, 40);
            const p = { kind: 'skyarrow', x: x + 40, y: y - 380, t: 0, target: null, tx: x, ty: y, spd: 1500, dmg: atk * 1.2, src: hr, elem: 'fire', trail: [], delay: 0, hit: new Set(), travel: 0, rot: 0 };
            this.proj.push(p);
            if (aw && e) { e.burnDps = atk * 0.4; e.burnT = 3; }
            if (i % 3 === 0) Sound.play('arrow');
          });
        }
        break;
      }
      case 'aqua': {
        const heal = aw ? 4 : 2;
        this.castle = Math.min(this.castleMax, this.castle + heal);
        this.fx.add('heal', { x: CASTLE.x + 10, y: CASTLE.y - 40, r: 100, dur: 1 });
        this.fx.text(CASTLE.x + 40, CASTLE.y - 110, '+' + heal, '#7dffb0', 28);
        for (const e of inR(R * 1.1)) { this.damage(e, atk * (aw ? 2.5 : 1.5), hr); this.slow(e, aw ? 0.6 : 0.4, 3); }
        this.fx.add('tide', { x: hr.x, y: hr.y, r: R * 1.1, dur: 0.8, layer: 'ground' });
        this.fx.elemBurst(hr.x, hr.y - 30, 'water', 30, 260);
        Sound.play('ice'); Sound.play('wind');
        break;
      }
      case 'yuki': {
        const c0 = this.densest(inR(R * 1.1)) || tgt; if (!c0) break;
        const r = aw ? 160 : 120;
        this.fx.add('blizzard', { x: c0.x, y: c0.y, r, dur: 1.4, layer: 'ground' });
        for (let i = 0; i < 30; i++) this.fx.part({ x: c0.x + rand(-r, r), y: c0.y - rand(60, 180), vx: rand(-60, 0), vy: rand(80, 200), color: '#ffffff', life: rand(0.5, 1), size: rand(2, 4), kind: 'spark', add: false });
        for (const e of this.enemiesIn(c0.x, c0.y, r)) { this.damage(e, atk * (aw ? 3 : 2), hr); e.freezeT = (aw ? 3 : 2) * (e.boss ? 0.4 : 1); }
        Sound.play('ice');
        break;
      }
      case 'kai': {
        for (const e of inR(R * 1.15)) {
          this.damage(e, atk * (aw ? 4.5 : 3), hr); this.knock(e, aw ? 100 : 60);
          if (aw) this.slow(e, 0.3, 2);
          this.fx.elemBurst(e.x, e.y - 20, 'water', 6, 140);
        }
        this.fx.add('tide', { x: hr.x, y: hr.y, r: R * 1.15, dur: 0.6, layer: 'ground' });
        if (tgt) this.fx.add('dashline', { x: hr.x, y: hr.y - 30, x2: tgt.x, y2: tgt.y - 24, color: '#5cc8ff', dur: 0.4 });
        hr.blink = 0.25; Sound.play('heavy');
        break;
      }
      case 'sylph': {
        const n = aw ? 14 : 8;
        for (let i = 0; i < n; i++) {
          const list = inR(R * 1.1); if (!list.length) break;
          this.shoot(hr, list[i % list.length], 'windarrow', atk * (aw ? 1.8 : 1.5), { delay: i * 0.045 });
        }
        this.fx.burst(hr.x, hr.y - 40, '#b8ffcf', 16, 200, { kind: 'leaf' });
        Sound.play('wind');
        break;
      }
      case 'hayate': {
        const list = inR(R * 1.1).sort((a, b) => b.dist - a.dist).slice(0, aw ? 10 : 6);
        let px = hr.x, py = hr.y - 30;
        list.forEach((e, i) => {
          this.later(i * 0.06, () => {
            this.fx.add('dashline', { x: px, y: py, x2: e.x, y2: e.y - 24, color: '#3ad17a', dur: 0.35 });
            this.fx.add('xslash', { x: e.x, y: e.y - 24, rot: rand(-1, 1), dur: 0.3 });
            px = e.x; py = e.y - 24;
            this.damage(e, atk * (aw ? 3.2 : 2.5), hr, { crit: Math.random() < 0.3 });
            Sound.play('slash');
          });
        });
        hr.blink = 0.15 + list.length * 0.06;
        break;
      }
      case 'zephyr': {
        const base = tgt || this.enemies.find(e => !e.dead); if (!base) break;
        const mk = d => this.zones.push({ kind: 'tornado', dist: d, t: 0, dur: aw ? 5 : 3, tick: 0, dmg: atk * 0.8, src: hr, fx: this.fx.add('tornado', { x: 0, y: 0, dur: aw ? 5 : 3, layer: 'ground' }) });
        mk(base.dist);
        if (aw) mk(Math.max(0, base.dist - 160));
        Sound.play('wind');
        break;
      }
      case 'luciel': {
        const list = inR(R * 1.3).sort((a, b) => b.hp - a.hp).slice(0, aw ? 3 : 1);
        if (!list.length && tgt) list.push(tgt);
        list.forEach((t, i) => this.later(i * 0.18, () => {
          if (t.dead) return;
          this.fx.add('pillar', { x: t.x, y: t.y, w: 34, color: '#ffd23f', dur: 0.8 });
          this.damage(t, atk * 6, hr, { crit: true });
          for (const e of this.enemiesIn(t.x, t.y, 85)) { e.stunT = Math.max(e.stunT, e.boss ? 0.8 : 2); if (e !== t) this.damage(e, atk * 1.5, hr); }
          this.fx.burst(t.x, t.y - 20, '#fff3a0', 20, 220, { kind: 'star' });
          this.fx.shake = 12; Sound.play('holy'); Sound.play('thunder');
        }));
        break;
      }
      case 'serena': {
        for (const h of this.heroes) {
          h.buffT = aw ? 8 : 6; h.buffAs = aw ? 0.6 : 0.4; h.buffAtk = aw ? 0.3 : 0;
          this.fx.add('bless', { x: h.x, y: h.y, dur: 1.2 });
          this.fx.text(h.x, h.y - 80, aw ? '공속·공격 UP' : '공속 UP', '#fff3a0', 16, { dur: 1 });
        }
        const heal = aw ? 2 : 1;
        this.castle = Math.min(this.castleMax, this.castle + heal);
        this.fx.add('heal', { x: CASTLE.x + 10, y: CASTLE.y - 40, r: 90, dur: 1 });
        Sound.play('holy');
        break;
      }
      case 'elysia': {
        const t = this.strongest(inR(R * 1.2)) || tgt; if (!t) break;
        const x = t.x, y = t.y;
        this.fx.add('spear', { x, y, r: 100, dur: 0.85 });
        this.later(0.3, () => {
          if (!t.dead) this.damage(t, atk * (aw ? 12 : 8), hr, { crit: true });
          for (const e of this.enemiesIn(x, y, 95)) { if (e !== t) this.damage(e, atk * (aw ? 3 : 2), hr); if (aw) e.stunT = Math.max(e.stunT, e.boss ? 0.4 : 1); }
          this.fx.shake = 14; Sound.play('boom'); Sound.play('holy');
        });
        break;
      }
      case 'kain': {
        const r = R * 1.3;
        this.fx.add('reap', { x: hr.x, y: hr.y - 20, r, face: hr.face, dur: 0.6 });
        this.fx.add('reap', { x: hr.x, y: hr.y - 20, r: r * 0.7, face: -hr.face, dur: 0.6 });
        for (const e of inR(r)) {
          this.damage(e, atk * (aw ? 4.5 : 3), hr);
          if (!e.dead && !e.boss && e.hp / e.maxHp < (aw ? 0.35 : 0.25)) {
            this.fx.text(e.x, e.y - 70, '처형!', '#ff4fd8', 22);
            this.damage(e, e.hp + 1, hr, { silent: true, pure: true });
          }
          this.fx.elemBurst(e.x, e.y - 20, 'dark', 6, 130);
        }
        Sound.play('dark'); Sound.play('slash');
        break;
      }
      case 'lilith': {
        const r = R * 1.15;
        this.fx.add('curse', { x: hr.x, y: hr.y, r: r * 0.8, dur: 1.4, layer: 'ground' });
        for (const e of inR(r)) {
          e.curseT = aw ? 8 : 6; e.curseMul = aw ? 0.5 : 0.3; e.dotDps = atk * 0.5; e.dotT = e.curseT;
          this.fx.add('curse', { x: e.x, y: e.y, r: 26, dur: 1, layer: 'ground' });
        }
        Sound.play('dark');
        break;
      }
      case 'bane': {
        const t = this.strongest(inR(R * 1.2)) || tgt; if (!t) break;
        const n = aw ? 8 : 5;
        this.fx.add('dashline', { x: hr.x, y: hr.y - 30, x2: t.x, y2: t.y - 24, color: '#a64dff', dur: 0.3 });
        for (let i = 0; i < n; i++) this.later(i * 0.09, () => {
          if (t.dead) return;
          this.damage(t, atk * 2, hr, { crit: true });
          this.fx.add('xslash', { x: t.x + rand(-8, 8), y: t.y - 26 + rand(-8, 8), rot: rand(-1.5, 1.5), dur: 0.3 });
          Sound.play('crit');
        });
        hr.blink = n * 0.09 + 0.1;
        break;
      }
    }
  }

  updateZone(z, dt) {
    z.t += dt;
    if (z.kind === 'tornado') {
      z.dist = Math.max(0, z.dist - 46 * dt);
      const p = Path.at(z.dist);
      z.fx.x = p.x; z.fx.y = p.y;
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = 0.3;
        for (const e of this.enemiesIn(p.x, p.y, 78)) { this.damage(e, z.dmg, z.src, { silent: true }); this.knock(e, 16); }
      }
      if (Math.random() < dt * 20) this.fx.part({ x: p.x + rand(-30, 30), y: p.y - rand(0, 90), vx: rand(-80, 80), vy: -60, color: '#b8ffcf', kind: 'leaf', life: 0.6, size: 3, rot: Math.random() * 6, vr: 10 });
    }
  }

  // ───────── 그리기 ─────────
  render() {
    const c = this.c, k = this.game.pixelScale;
    c.setTransform(k, 0, 0, k, 0, 0);
    const sh = this.fx.shake;
    if (sh > 0) c.translate(rand(-sh, sh) * 0.5, rand(-sh, sh) * 0.5);
    c.drawImage(this.bg, 0, 0, W, H);
    const t = this.time;

    // 배치 가능한 자리 표시
    if (this.selected) {
      const pulse = 0.5 + Math.sin(performance.now() / 160) * 0.5;
      for (const pd of PADS) {
        if (this.heroes.some(h => h.pad === pd.i)) continue;
        c.save(); c.translate(pd.x, pd.y + 8); c.scale(1, 0.44);
        c.strokeStyle = rgba(ELEMS[this.selected.def.elem].light, 0.5 + pulse * 0.5); c.lineWidth = 5;
        c.beginPath(); c.arc(0, 0, 38 + pulse * 6, 0, TAU); c.stroke();
        c.restore();
        // 사거리 미리보기
        c.save(); c.globalAlpha = 0.12; c.strokeStyle = '#ffffff'; c.lineWidth = 1.5;
        c.beginPath(); c.ellipse(pd.x, pd.y, heroRange(this.selected.def, this.selected.h), heroRange(this.selected.def, this.selected.h) / 1.15, 0, 0, TAU); c.stroke(); c.restore();
      }
    }
    drawPortal(c, PORTAL.x, PORTAL.y, t);
    drawCastle(c, CASTLE.x, CASTLE.y, this.diff.map, this.castle / this.castleMax, t);

    // 선택한 영웅 사거리
    if (this.focus) {
      const r = this.rangeOf(this.focus);
      c.save(); c.fillStyle = rgba(ELEMS[this.focus.def.elem].color, 0.12); c.strokeStyle = rgba(ELEMS[this.focus.def.elem].light, 0.8); c.lineWidth = 2; c.setLineDash([8, 6]);
      c.beginPath(); c.ellipse(this.focus.x, this.focus.y, r, r / 1.15, 0, 0, TAU); c.fill(); c.stroke(); c.restore();
    }
    this.fx.drawEffects(c, 'ground');

    // 깊이 정렬
    const list = [];
    for (const e of this.enemies) list.push({ y: e.y, e });
    for (const hr of this.heroes) list.push({ y: hr.y, hr });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) { if (it.e) this.drawEnemyObj(c, it.e); else this.drawHeroObj(c, it.hr); }

    this.drawProj(c);
    this.fx.drawParts(c);
    this.fx.drawEffects(c, 'top');
    this.fx.drawTexts(c);

    // 보스 체력바
    if (this.boss && !this.boss.dead) {
      const b = this.boss;
      $('#bBossFill').style.width = (100 * b.hp / b.maxHp) + '%';
      $('#bBossHp').textContent = fmt(b.hp) + ' / ' + fmt(b.maxHp);
    }
  }

  drawEnemyObj(c, e) {
    const def = e.def;
    c.save();
    c.translate(e.x, e.y);
    let a = 1;
    if (e.dead) { a = 1 - e.deadT / 0.45; c.globalAlpha = a; c.translate(0, -e.deadT * 30); c.scale(1 + e.deadT, 1 - e.deadT * 0.8); }
    const s = ENEMY_SCALE * (e.hitT > 0 ? 1.08 : 1);
    c.scale(s, s * (e.hitT > 0 ? 0.92 : 1));
    drawEnemy(c, { type: e.type, elem: e.elem, t: e.t, walk: e.walk, face: e.face });
    // 상태 표시
    const top = -50 * def.size - (def.fly ? 20 : 0);
    if (e.freezeT > 0) {
      c.fillStyle = 'rgba(180,230,255,0.45)'; c.strokeStyle = '#e6f8ff'; c.lineWidth = 2;
      pathRR(c, -18 * def.size, top + 6, 36 * def.size, -top - 4, 6); c.fill(); c.stroke();
    }
    if (e.shieldT > 0) { c.strokeStyle = 'rgba(158,227,255,0.85)'; c.lineWidth = 4; c.beginPath(); c.ellipse(0, top / 2, 30 * def.size, -top * 0.62, 0, 0, TAU); c.stroke(); }
    if (e.curseT > 0) { c.fillStyle = '#ff7ae6'; c.font = '16px "Black Han Sans", sans-serif'; c.textAlign = 'center'; c.fillText('☠', 0, top - 10); }
    if (e.stunT > 0) for (let i = 0; i < 3; i++) { const an = e.t * 5 + i * 2.1; c.fillStyle = '#ffe14d'; star5(c, Math.cos(an) * 12, top - 4 + Math.sin(an) * 3, 4, 1.8); c.fill(); }
    c.restore();
    // 체력바
    if (!e.dead && (e.hp < e.maxHp || def.elite) && !def.boss) {
      const w = def.elite ? 46 : 30, x = e.x - w / 2, y = e.y + top * ENEMY_SCALE - 8;
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x - 1, y - 1, w + 2, 6);
      c.fillStyle = def.elite ? '#ff9a2a' : '#ff4a4a'; c.fillRect(x, y, w * e.hp / e.maxHp, 4);
      c.fillStyle = ELEMS[e.elem].color; c.fillRect(x - 7, y - 1, 5, 6);
    }
  }

  drawHeroObj(c, hr) {
    const def = hr.def;
    const t = this.time + hr.tOff;
    let state = 'idle', p = 0;
    if (hr.victory) state = 'victory';
    else if (hr.stunT > 0) state = 'stun';
    else if (hr.act) { state = hr.act.type; p = hr.act.t / hr.act.dur; }
    const P = heroPose(def, state, p, t, hr.aim);
    // 등장 낙하
    const age = this.time - hr.born;
    if (age < 0.4) { P.jump -= (1 - easeOut(age / 0.4)) * 80; }
    c.save();
    c.translate(hr.x, hr.y);
    // 강화 표시 (발 밑)
    if (hr.enh > 0) {
      c.save(); c.scale(1, 0.4);
      c.strokeStyle = rgba('#ffd23f', 0.5 + hr.enh * 0.1); c.lineWidth = 3;
      c.beginPath(); c.arc(0, 0, 26 + hr.enh * 2, 0, TAU); c.stroke(); c.restore();
    }
    if (hr.buffT > 0) { c.save(); c.globalCompositeOperation = 'lighter'; radial(c, 0, -30, 46, '#fff3a0', '#ffd23f', 0.35); c.restore(); }
    if (hr.blink > 0) c.globalAlpha = 0.35;
    c.scale(HERO_SCALE, HERO_SCALE);
    drawHero(c, def, P, { awake: hr.h.awake, star: hr.h.star, t, face: hr.face });
    c.restore();
    if (hr.enh > 0) {
      c.font = '14px "Black Han Sans", sans-serif'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = '#1a0f1f';
      c.strokeText('+' + hr.enh, hr.x + 22, hr.y + 4); c.fillStyle = '#ffe27a'; c.fillText('+' + hr.enh, hr.x + 22, hr.y + 4);
    }
    // 스킬 준비 표시
    if (hr.cd <= 0 && !this.autoSkill) {
      c.save(); c.globalCompositeOperation = 'lighter';
      radial(c, hr.x, hr.y - 80, 14 + Math.sin(this.time * 6) * 3, '#ffffff', ELEMS[def.elem].color, 0.8); c.restore();
    }
  }

  drawProj(c) {
    for (const p of this.proj) {
      if (p.delay > 0) continue;
      const E = ELEMS[p.elem];
      // 꼬리
      if (p.trail.length > 1) {
        c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
        for (let i = 1; i < p.trail.length; i++) {
          const a = i / p.trail.length;
          c.strokeStyle = rgba(E.light, a * 0.6); c.lineWidth = (p.kind.includes('arrow') ? 3 : 7) * a;
          c.beginPath(); c.moveTo(p.trail[i - 1].x, p.trail[i - 1].y); c.lineTo(p.trail[i].x, p.trail[i].y); c.stroke();
        }
        c.restore();
      }
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
      switch (p.kind) {
        case 'firearrow': case 'icearrow': case 'windarrow': case 'skyarrow': {
          c.globalCompositeOperation = 'lighter'; radial(c, 6, 0, 12, '#ffffff', E.color, 0.5); c.globalCompositeOperation = 'source-over';
          c.strokeStyle = '#5a3a22'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-18, 0); c.lineTo(8, 0); c.stroke();
          c.fillStyle = E.light; c.beginPath(); c.moveTo(14, 0); c.lineTo(6, -4); c.lineTo(6, 4); c.closePath(); c.fill(); c.strokeStyle = OL; c.lineWidth = 1; c.stroke();
          c.fillStyle = E.color; c.beginPath(); c.moveTo(-18, 0); c.lineTo(-24, -4); c.lineTo(-14, 0); c.lineTo(-24, 4); c.closePath(); c.fill();
          break;
        }
        case 'fireball': case 'waterorb': case 'darkorb': case 'holybolt': {
          c.globalCompositeOperation = 'lighter';
          radial(c, 0, 0, p.kind === 'fireball' ? 22 : 16, '#ffffff', E.color, 0.95);
          c.globalCompositeOperation = 'source-over';
          c.fillStyle = E.light; c.beginPath(); c.arc(0, 0, p.kind === 'fireball' ? 7 : 5, 0, TAU); c.fill();
          if (p.kind === 'darkorb') { c.strokeStyle = '#ff7ae6'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, 9, p.t * 10, p.t * 10 + 3); c.stroke(); }
          if (p.kind === 'holybolt') { c.fillStyle = '#ffffff'; star5(c, 0, 0, 7, 3, p.t * 8); c.fill(); }
          break;
        }
        case 'shuriken': {
          c.rotate(p.t * 30);
          c.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 3 : 10, a = i * Math.PI / 4; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath();
          fillStroke(c, '#d8e0ea', 1.5); c.fillStyle = E.color; c.beginPath(); c.arc(0, 0, 2.5, 0, TAU); c.fill();
          break;
        }
        case 'windblade': {
          c.globalCompositeOperation = 'lighter';
          c.fillStyle = rgba(E.light, 0.85);
          c.beginPath(); c.arc(-6, 0, 22, -1.2, 1.2); c.arc(-14, 0, 18, 1.1, -1.1, true); c.closePath(); c.fill();
          c.fillStyle = rgba('#ffffff', 0.9); c.beginPath(); c.arc(-6, 0, 22, -0.8, 0.8); c.arc(-10, 0, 20, 0.75, -0.75, true); c.closePath(); c.fill();
          break;
        }
        case 'holyspear': {
          c.globalCompositeOperation = 'lighter'; radial(c, 10, 0, 26, '#ffffff', '#ffd23f', 0.7); c.globalCompositeOperation = 'source-over';
          c.fillStyle = '#fff6c0'; c.strokeStyle = OL; c.lineWidth = 1.6;
          c.beginPath(); c.moveTo(26, 0); c.lineTo(14, -5); c.lineTo(14, -2); c.lineTo(-24, -2); c.lineTo(-24, 2); c.lineTo(14, 2); c.lineTo(14, 5); c.closePath(); c.fill(); c.stroke();
          break;
        }
      }
      c.restore();
    }
  }

  // 전투 종료 시 정리
  destroy() {
    $('#bBoss').hidden = true; $('#bPop').hidden = true; $('#bWaveInfo').hidden = true;
    this.fx.clear();
  }
}

// 배경 장식
function drawDeco(c, T, d) {
  const { x, y, big, v } = d;
  c.save(); c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(0, 2, big ? 22 : 10, big ? 7 : 4, 0, 0, TAU); c.fill();
  if (!big) {
    // 작은 장식: 바위, 풀, 꽃
    if (v < 0.4) { c.beginPath(); c.ellipse(0, -4, 9, 6, 0, 0, TAU); fillStroke(c, vgrad(c, -10, 2, '#c8c0b4', '#7a7266'), 1.6); }
    else if (T.deco === 'spike') { c.beginPath(); c.moveTo(-6, 0); c.lineTo(0, -16); c.lineTo(6, 0); c.closePath(); fillStroke(c, '#3a2a2a', 1.6); c.fillStyle = '#ff5a2a'; c.fillRect(-1, -6, 2, 4); }
    else if (T.deco === 'pine') { c.beginPath(); c.ellipse(0, -3, 10, 5, 0, 0, TAU); fillStroke(c, '#ffffff', 1.4); }
    else {
      for (let i = 0; i < 5; i++) { c.strokeStyle = shade(T.g2, -0.25); c.lineWidth = 2; c.beginPath(); c.moveTo(-4 + i * 2, 0); c.quadraticCurveTo(-6 + i * 3, -8, -4 + i * 3.5, -12); c.stroke(); }
      if (v > 0.7) { c.fillStyle = pick(['#ff7aa8', '#ffe14d', '#ffffff', '#9ad0ff']); for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(-5 + i * 5, -12 + (i % 2) * 3, 2.6, 0, TAU); c.fill(); } }
    }
    c.restore(); return;
  }
  if (T.deco === 'tree' || T.deco === 'maple') {
    capsule(c, 0, 0, 0, -26, 5, '#7a4a28');
    const col = T.deco === 'maple' ? (v < 0.5 ? '#e8542b' : '#ffb03a') : (v < 0.5 ? '#3f9a3a' : '#5ab84a');
    for (const [dx, dy, r] of [[-12, -30, 15], [12, -30, 15], [0, -46, 18], [0, -30, 16]]) { c.beginPath(); c.arc(dx, dy, r, 0, TAU); fillStroke(c, vgrad(c, dy - r, dy + r, shade(col, 0.2), shade(col, -0.2)), 2); }
    c.fillStyle = rgba('#ffffff', 0.25); c.beginPath(); c.arc(-4, -52, 6, 0, TAU); c.fill();
  } else if (T.deco === 'pine') {
    capsule(c, 0, 0, 0, -14, 4, '#6a4a2a');
    for (let i = 0; i < 3; i++) {
      const yy = -12 - i * 14, w = 22 - i * 5;
      c.beginPath(); c.moveTo(-w, yy); c.lineTo(0, yy - 22); c.lineTo(w, yy); c.closePath(); fillStroke(c, vgrad(c, yy - 22, yy, '#3f7a5a', '#1f4a3a'), 2);
      c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(-w * 0.6, yy - 8); c.lineTo(0, yy - 22); c.lineTo(w * 0.6, yy - 8); c.quadraticCurveTo(0, yy - 12, -w * 0.6, yy - 8); c.fill();
    }
  } else {
    // 마계: 용암 바위 + 수정
    c.beginPath(); c.moveTo(-18, 0); c.lineTo(-12, -24); c.lineTo(0, -34); c.lineTo(14, -20); c.lineTo(18, 0); c.closePath(); fillStroke(c, vgrad(c, -34, 0, '#4a3a3a', '#1a1010'), 2);
    c.strokeStyle = '#ff5a2a'; c.lineWidth = 2; c.beginPath(); c.moveTo(-8, -20); c.lineTo(-2, -10); c.lineTo(6, -16); c.stroke();
    if (v > 0.5) { c.beginPath(); c.moveTo(8, -18); c.lineTo(14, -44); c.lineTo(20, -18); c.closePath(); fillStroke(c, vgrad(c, -44, -18, '#ff9aff', '#8a2aaa'), 1.8); }
  }
  c.restore();
}

function starHtml(h) {
  if (h.awake) return '<span class="awk">' + '★'.repeat(6) + '</span>';
  return '★'.repeat(h.star);
}
function skillNameOf(def, h) { return h.awake ? def.askill.name : def.skill.name; }
