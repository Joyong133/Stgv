'use strict';
// ───────────────────────── 화면 · 메뉴 ─────────────────────────

// 작은 아이콘을 캔버스로 그려 data URL 로 만든다
const Icons = {};
function makeIcons() {
  const mk = (name, fn, s = 48) => { const cv = document.createElement('canvas'); cv.width = cv.height = s; const c = cv.getContext('2d'); c.translate(s / 2, s / 2); c.scale(s / 48, s / 48); fn(c); Icons[name] = cv.toDataURL(); };
  const gem = (c, a, b, hi) => {
    c.beginPath(); c.moveTo(0, -18); c.lineTo(14, -6); c.lineTo(9, 16); c.lineTo(-9, 16); c.lineTo(-14, -6); c.closePath();
    fillStroke(c, vgrad(c, -18, 16, a, b), 2.6);
    c.fillStyle = rgba('#ffffff', 0.55); c.beginPath(); c.moveTo(0, -18); c.lineTo(-14, -6); c.lineTo(-4, -4); c.closePath(); c.fill();
    c.strokeStyle = rgba(hi, 0.7); c.lineWidth = 1.5; c.beginPath(); c.moveTo(-14, -6); c.lineTo(14, -6); c.moveTo(-4, -6); c.lineTo(0, 16); c.moveTo(4, -6); c.lineTo(0, 16); c.stroke();
  };
  mk('gold', c => {
    c.beginPath(); c.arc(0, 0, 18, 0, TAU); fillStroke(c, vgrad(c, -18, 18, '#fff1a0', '#d8961a'), 2.6);
    c.beginPath(); c.arc(0, 0, 12, 0, TAU); c.strokeStyle = '#b8780a'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#b8780a'; c.font = 'bold 18px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('G', 0, 1);
  });
  mk('ruby', c => gem(c, '#ff8aa8', '#c4123a', '#ffffff'));
  mk('evo', c => gem(c, '#b8ffcf', '#1f9a54', '#eaffef'));
  mk('awk', c => { gem(c, '#ffe9a0', '#a64dff', '#ffffff'); c.fillStyle = '#ffffff'; star5(c, 0, 2, 5, 2.2); c.fill(); });
  mk('crys', c => {
    c.beginPath(); c.moveTo(0, -20); c.lineTo(10, -2); c.lineTo(0, 20); c.lineTo(-10, -2); c.closePath(); fillStroke(c, vgrad(c, -20, 20, '#cff4ff', '#2f7fd9'), 2.6);
    c.fillStyle = rgba('#ffffff', 0.6); c.beginPath(); c.moveTo(0, -20); c.lineTo(-10, -2); c.lineTo(0, 0); c.closePath(); c.fill();
  });
  const elemIco = {
    fire: c => { c.beginPath(); c.moveTo(0, -18); c.bezierCurveTo(14, -6, 16, 6, 10, 14); c.quadraticCurveTo(0, 20, -10, 14); c.bezierCurveTo(-16, 4, -8, -2, -4, -10); c.quadraticCurveTo(-2, -2, 2, 0); c.quadraticCurveTo(4, -10, 0, -18); c.closePath(); },
    water: c => { c.beginPath(); c.moveTo(0, -18); c.bezierCurveTo(10, -4, 14, 4, 12, 9); c.arc(0, 8, 12, 0.1, Math.PI - 0.1); c.bezierCurveTo(-14, 4, -10, -4, 0, -18); c.closePath(); },
    wind: c => { c.beginPath(); c.ellipse(0, 0, 8, 17, 0.7, 0, TAU); },
    light: c => star5(c, 0, 0, 18, 8),
    dark: c => { c.beginPath(); c.arc(0, 0, 16, 0.6, TAU - 0.6); c.arc(8, -2, 12, TAU - 0.9, 0.9, true); c.closePath(); },
  };
  for (const k of ELEM_ORDER) {
    mk('e_' + k, c => {
      const E = ELEMS[k];
      c.beginPath(); c.arc(0, 0, 22, 0, TAU); fillStroke(c, vgrad(c, -22, 22, shade(E.color, 0.2), E.dark), 2.4);
      c.save(); c.scale(0.8, 0.8); elemIco[k](c); fillStroke(c, vgrad(c, -18, 18, '#ffffff', E.light), 2); c.restore();
      if (k === 'wind') { c.strokeStyle = E.dark; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-6, 7); c.lineTo(6, -7); c.stroke(); }
    });
  }
  const root = document.documentElement.style;
  for (const k in Icons) root.setProperty('--i-' + k, `url(${Icons[k]})`);
}
const ico = (k, cls = 'ic') => `<i class="${cls}" style="background-image:url(${Icons[k]})"></i>`;

const UI = {
  game: null, screen: 'title', stack: [],
  sceneFx: new FX(), sceneT: 0, scenes: {},

  init(game) {
    this.game = game;
    makeIcons();
    // 공통 버튼 소리
    document.addEventListener('pointerdown', ev => { Sound.init(); if (ev.target.closest('button')) Sound.play('click'); }, true);
    $$('[data-back]').forEach(b => b.addEventListener('click', () => this.back()));
    $('#title').addEventListener('pointerup', () => { if (this.screen === 'title') this.show('lobby'); });
    $('#mBattle').addEventListener('click', () => this.show('select'));
    $('#mHeroes').addEventListener('click', () => this.show('heroes'));
    $('#mSummon').addEventListener('click', () => this.show('summon'));
    $('#mParty').addEventListener('click', () => this.show('party'));
    $('#mSettings').addEventListener('click', () => this.openSettings());
    $$('#heroes .ftab').forEach(b => b.addEventListener('click', () => { this.heroFilter = b.dataset.f; this.renderHeroes(); }));
    $('#sumOne').addEventListener('click', () => this.summon(1));
    $('#sumTen').addEventListener('click', () => this.summon(10));
    $('#dAtk').addEventListener('click', () => this.demo('attack'));
    $('#dSkill').addEventListener('click', () => this.demo('skill'));
    $('#dLv1').addEventListener('click', () => this.levelUp(1));
    $('#dLv10').addEventListener('click', () => this.levelUp(10));
    $('#dEvo').addEventListener('click', () => this.evolve());
    $('#dParty').addEventListener('click', () => this.toggleParty(this.detailId, true));
    $('#dLeader').addEventListener('click', () => { this.game.save.leader = this.detailId; this.game.persist(); this.toast('로비 대표 영웅으로 설정했습니다'); this.renderDetail(); });
    $('#dPrev').addEventListener('click', () => this.stepDetail(-1));
    $('#dNext').addEventListener('click', () => this.stepDetail(1));
    $('#modal').addEventListener('pointerdown', ev => { if (ev.target.id === 'modal' && this.modalCancelable) this.closeModal(); });
    this.heroFilter = 'all';
    this.setupScenes();
    this.refreshTop();
  },

  // ───────── 화면 전환 ─────────
  show(name, opt = {}) {
    const prev = this.screen;
    if (!opt.noPush && prev !== name && prev !== 'title' && prev !== 'battle') this.stack.push(prev);
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === name));
    this.screen = name;
    if (name === 'lobby') { this.stack = []; this.renderLobby(); Sound.playBgm('lobby'); }
    if (name === 'heroes') this.renderHeroes();
    if (name === 'detail') this.renderDetail();
    if (name === 'summon') this.renderSummon();
    if (name === 'party') this.renderParty();
    if (name === 'select') this.renderSelect();
    this.refreshTop();
  },
  back() {
    if (!$('#modal').hidden) { if (this.modalCancelable) this.closeModal(); return; }
    if (this.screen === 'battle') { const b = this.game.battle; if (b && !b.over) b.openPause(); return; }
    if (this.screen === 'title') { this.exitApp(); return; }
    if (this.screen === 'lobby') {
      this.modal('게임 종료', '<p>게임을 종료할까요?<br><small>진행 상황은 자동으로 저장되어 있습니다.</small></p>', [
        { t: '취소', cls: 'ghost' }, { t: '종료', fn: () => this.exitApp() }]);
      return;
    }
    if (this.summoning) return;
    const to = this.stack.pop() || 'lobby';
    this.show(to, { noPush: true });
  },
  exitApp() {
    this.game.persist();
    if (window.AndroidBridge && AndroidBridge.exit) AndroidBridge.exit();
  },

  refreshTop() {
    const S = this.game.save;
    $$('.cur-gold').forEach(e => e.textContent = fmt(S.gold));
    $$('.cur-ruby').forEach(e => e.textContent = fmt(S.ruby));
    $$('.cur-evo').forEach(e => e.textContent = fmt(S.evo));
    $$('.cur-awk').forEach(e => e.textContent = fmt(S.awk));
  },

  toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.remove('show'), 1800);
  },

  // buttons: [{t, cls, fn, keep}]
  modal(title, html, buttons, opt = {}) {
    const m = $('#modal');
    $('#mdTitle').innerHTML = title;
    $('#mdBody').innerHTML = html;
    const bb = $('#mdBtns'); bb.innerHTML = '';
    for (const b of buttons) {
      const e = el('button', 'btn ' + (b.cls || ''), b.t);
      e.addEventListener('click', () => { if (!b.keep) this.closeModal(); if (b.fn) b.fn(); });
      bb.appendChild(e);
    }
    m.className = opt.cls || '';
    this.modalCancelable = opt.cancelable !== false;
    m.hidden = false;
  },
  closeModal() { $('#modal').hidden = true; if (this.onModalClose) { const f = this.onModalClose; this.onModalClose = null; f(); } },

  // ───────── 로비 ─────────
  leaderDef() {
    const S = this.game.save;
    const id = S.leader && S.heroes[S.leader] ? S.leader : S.party.find(p => S.heroes[p]) || Object.keys(S.heroes)[0];
    return HERO_BY_ID[id];
  },
  renderLobby() {
    const S = this.game.save;
    const ld = this.leaderDef();
    $('#lbName').innerHTML = `<small>${ld.title}</small>${ld.name}`;
    $('#lbStars').innerHTML = starHtml(S.heroes[ld.id]);
    const best = DIFFS.map(d => (S.diffs[d.id] || {}).best || 0);
    const cleared = DIFFS.filter(d => (S.diffs[d.id] || {}).cleared).length;
    $('#lbRecord').innerHTML = `클리어 난이도 <b>${cleared}</b> / 4 · 최고 기록 ${DIFFS.map((d, i) => `<span style="color:${d.color}">${d.name} ${best[i]}</span>`).join(' · ')}`;
    $('#mBattle').classList.toggle('cont', !!S.checkpoint);
    $('#mBattleSub').textContent = S.checkpoint ? `이어하기 · ${DIFF_BY_ID[S.checkpoint.diff].name} ROUND ${S.checkpoint.wave}` : '성을 지켜라!';
    this.lobbyAnim = { t: 0, next: 2.5, state: 'idle', p: 0 };
  },

  // ───────── 영웅 목록 ─────────
  heroCardHtml(def, h, extra = '') {
    const owned = !!h;
    return `<div class="hcard elem-${def.elem} ${owned ? '' : 'locked'} ${h && h.awake ? 'awaken' : ''}" data-id="${def.id}">
      <img src="${portraitURL(def, h && h.awake, 128)}" alt="">
      <i class="eico" style="background-image:url(${Icons['e_' + def.elem]})"></i>
      ${owned ? `<div class="stars s${h.awake ? 7 : h.star}">${starHtml(h)}</div><div class="lv">Lv.${h.lvl}</div>` : '<div class="lockt">미보유</div>'}
      <div class="nm">${def.name}</div>${extra}</div>`;
  },
  renderHeroes() {
    const S = this.game.save, f = this.heroFilter;
    $$('#heroes .ftab').forEach(b => b.classList.toggle('on', b.dataset.f === f));
    const list = HEROES.filter(d => f === 'all' || d.elem === f).slice().sort((a, b) => {
      const ha = S.heroes[a.id], hb = S.heroes[b.id];
      if (!!ha !== !!hb) return ha ? -1 : 1;
      if (ha && hb) return heroPower(b, hb) - heroPower(a, ha);
      return 0;
    });
    const grid = $('#heroGrid');
    grid.innerHTML = list.map(d => this.heroCardHtml(d, S.heroes[d.id], S.party.includes(d.id) ? '<div class="inparty">편성</div>' : '')).join('');
    $$('.hcard', grid).forEach(c => c.addEventListener('click', () => { this.detailId = c.dataset.id; this.detailList = list.map(d => d.id); this.show('detail'); }));
    $('#heroCount').textContent = `보유 ${Object.keys(S.heroes).length} / ${HEROES.length}`;
  },

  // ───────── 영웅 상세 ─────────
  stepDetail(d) {
    const L = this.detailList || HEROES.map(h => h.id);
    const i = L.indexOf(this.detailId);
    this.detailId = L[(i + d + L.length) % L.length];
    this.renderDetail();
  },
  renderDetail() {
    const S = this.game.save, def = HERO_BY_ID[this.detailId], h = S.heroes[def.id];
    const E = ELEMS[def.elem];
    const R = $('#detail');
    R.style.setProperty('--ec', E.color); R.style.setProperty('--el', E.light); R.style.setProperty('--ed', E.dark);
    $('#dName').innerHTML = `<small>${def.title}</small>${def.name}`;
    $('#dTags').innerHTML = `<span class="tag" style="background:${E.color}">${ico('e_' + def.elem, 'ic sm')}${E.name} 속성</span><span class="tag">${ROLES[def.role].name}</span>` +
      (h ? `<span class="tag stars s${h.awake ? 7 : h.star}">${starHtml(h)}${h.awake ? ' 각성' : ''}</span>` : '<span class="tag">미보유</span>');
    const hv = h || { star: 3, lvl: 1, awake: false };
    const atk = heroAtk(def, hv), rng = heroRange(def, hv);
    const max = heroMaxLv(hv);
    $('#dLvTxt').innerHTML = h ? `Lv.<b>${h.lvl}</b> / ${max}` : '획득하면 성장시킬 수 있습니다';
    $('#dLvBar').style.width = (100 * hv.lvl / max) + '%';
    $('#dStats').innerHTML = `
      <div><span>공격력</span><b>${fmt(atk)}</b></div>
      <div><span>공격 속도</span><b>${def.aspd.toFixed(2)}/초</b></div>
      <div><span>사거리</span><b>${rng}</b></div>
      <div><span>배치 비용</span><b>${ico('crys', 'ic sm')}${heroCost(def)}</b></div>
      <div><span>전투력</span><b class="pw">${fmt(heroPower(def, hv))}</b></div>
      <div><span>스킬 쿨타임</span><b>${(def.skill.cd * (hv.awake ? 0.85 : 1)).toFixed(1)}초</b></div>`;
    $('#dSkills').innerHTML = `
      <div class="sk"><b>기본 공격</b><p>${def.normal}</p></div>
      <div class="sk main"><b>${def.skill.name}</b><p>${def.skill.desc}</p></div>
      <div class="sk awk ${hv.awake ? 'on' : ''}"><b>${ico('awk', 'ic sm')} 각성 스킬 · ${def.askill.name}</b><p>${def.askill.desc}${hv.awake ? '' : ' <em>(각성 시 해금)</em>'}</p></div>`;
    // 성장 버튼
    const b1 = $('#dLv1'), b10 = $('#dLv10'), be = $('#dEvo'), bp = $('#dParty'), bl = $('#dLeader');
    [b1, b10, be, bp, bl].forEach(b => (b.hidden = !h));
    if (h) {
      const c1 = lvCost(h.lvl);
      let n = 0, sum = 0; for (let l = h.lvl; l < max && n < 10; l++, n++) sum += lvCost(l);
      b1.innerHTML = h.lvl >= max ? '레벨 MAX' : `레벨업<span>${ico('gold', 'ic sm')}${fmt(c1)}</span>`;
      b1.disabled = h.lvl >= max || S.gold < c1;
      b10.innerHTML = h.lvl >= max ? '레벨 MAX' : `+${n} 레벨<span>${ico('gold', 'ic sm')}${fmt(sum)}</span>`;
      b10.disabled = h.lvl >= max || S.gold < c1;
      if (h.awake) { be.innerHTML = '각성 완료'; be.disabled = true; be.className = 'btn evo done'; }
      else if (h.star < 6) {
        const c = GRADE.evoCost[h.star];
        be.innerHTML = `${h.star + 1}성 진화<span>${ico('evo', 'ic sm')}${c.evo} ${ico('gold', 'ic sm')}${fmt(c.gold)}</span>`;
        be.className = 'btn evo'; be.disabled = false;
      } else {
        const c = GRADE.awakenCost;
        be.innerHTML = `각성<span>${ico('awk', 'ic sm')}${c.awk} ${ico('evo', 'ic sm')}${c.evo} ${ico('gold', 'ic sm')}${fmt(c.gold)}</span>`;
        be.className = 'btn evo awaken'; be.disabled = false;
      }
      bp.innerHTML = S.party.includes(def.id) ? '편성 해제' : '편성 추가';
      bl.disabled = S.leader === def.id;
    }
    this.detailAnim = { state: 'idle', t: 0, p: 0 };
    this.sceneFx.clear();
  },
  levelUp(times) {
    const S = this.game.save, h = S.heroes[this.detailId];
    if (!h) return;
    const max = heroMaxLv(h); let n = 0;
    while (n < times && h.lvl < max && S.gold >= lvCost(h.lvl)) { S.gold -= lvCost(h.lvl); h.lvl++; n++; }
    if (!n) { Sound.play('error'); this.toast(h.lvl >= max ? '최대 레벨입니다. 진화하세요!' : '골드가 부족합니다'); return; }
    Sound.play('upgrade');
    this.sceneFx.burst(W * 0.25, H * 0.55, '#ffe27a', 24, 220, { kind: 'star' });
    this.sceneFx.text(W * 0.25, H * 0.25, 'LEVEL UP! +' + n, '#ffe27a', 34, { dur: 1.2 });
    this.game.persist(); this.refreshTop(); this.renderDetail();
  },
  evolve() {
    const S = this.game.save, def = HERO_BY_ID[this.detailId], h = S.heroes[def.id];
    if (!h || h.awake) return;
    const max = heroMaxLv(h);
    const awaken = h.star >= 6;
    const c = awaken ? GRADE.awakenCost : GRADE.evoCost[h.star];
    const lack = [];
    if (h.lvl < max) lack.push(`레벨 ${max} 필요`);
    if (S.evo < c.evo) lack.push(`진화석 ${c.evo - S.evo}개 부족`);
    if (awaken && S.awk < c.awk) lack.push(`각성석 ${c.awk - S.awk}개 부족`);
    if (S.gold < c.gold) lack.push(`골드 ${fmt(c.gold - S.gold)} 부족`);
    if (lack.length) {
      Sound.play('error');
      this.modal(awaken ? '각성 조건' : '진화 조건', `<p>${lack.join('<br>')}</p><p class="hint">진화석은 보스 · 정예 처치와 중복 소환으로, 각성석은 보통 난이도 이상의 보스에게서 얻습니다.</p>`, [{ t: '확인' }]);
      return;
    }
    const go = () => {
      S.evo -= c.evo; S.gold -= c.gold; if (awaken) { S.awk -= c.awk; h.awake = true; } else h.star++;
      this.game.persist(); this.refreshTop();
      Sound.play(awaken ? 'legend' : 'star');
      const E = ELEMS[def.elem];
      this.sceneFx.add('pillar', { x: W * 0.25, y: H * 0.78, w: 70, color: E.color, dur: 1.4 });
      this.sceneFx.add('ring', { x: W * 0.25, y: H * 0.78, r: 260, color: E.light, w: 14, dur: 1 });
      this.sceneFx.elemBurst(W * 0.25, H * 0.5, def.elem, 60, 380);
      this.renderDetail();
      this.detailAnim = { state: 'skill', t: 0, p: 0 };
      this.sceneFx.text(W * 0.25, H * 0.2, awaken ? '각성!' : `${h.star}성 진화!`, E.light, 48, { dur: 1.6, stroke: E.dark });
    };
    this.modal(awaken ? '각성' : `${h.star + 1}성 진화`, `<p><b>${def.name}</b>을(를) ${awaken ? '각성' : (h.star + 1) + '성으로 진화'}시킬까요?</p>
      <p class="cost">${awaken ? ico('awk') + c.awk + ' ' : ''}${ico('evo')}${c.evo} ${ico('gold')}${fmt(c.gold)}</p>
      <p class="hint">${awaken ? '공격력 대폭 상승 · 최대 레벨 70 · 각성 스킬 해금 · 스킬 쿨타임 15% 감소 · 사거리 증가' : '공격력 배율 상승 · 최대 레벨 +10 · 사거리 증가'}</p>`,
      [{ t: '취소', cls: 'ghost' }, { t: awaken ? '각성!' : '진화!', fn: go }]);
  },
  toggleParty(id, fromDetail) {
    const S = this.game.save;
    const i = S.party.indexOf(id);
    if (i >= 0) {
      if (S.party.length <= 1) { this.toast('최소 1명은 편성해야 합니다'); return; }
      S.party.splice(i, 1);
    } else {
      if (S.party.length >= 6) { this.toast('편성은 최대 6명입니다'); return; }
      S.party.push(id);
    }
    this.game.persist();
    if (fromDetail) this.renderDetail(); else this.renderParty();
  },
  demo(kind) {
    const def = HERO_BY_ID[this.detailId];
    if (this.detailAnim.state !== 'idle') return;
    this.detailAnim = { state: kind, t: 0, p: 0, hits: kind === 'skill' ? [SKILL_HIT] : HIT_AT[def.anim].slice() };
    if (kind === 'skill') Sound.play('skill');
  },

  // ───────── 소환 ─────────
  renderSummon() {
    const S = this.game.save;
    $('#sumOne').disabled = S.ruby < SUMMON_COST.one;
    $('#sumTen').disabled = S.ruby < SUMMON_COST.ten;
    $('#sumRates').innerHTML = SUMMON_RATES.map(r => `<span class="s${r.star}">${'★'.repeat(r.star)} ${(r.p * 100).toFixed(0)}%</span>`).join('');
    $('#sumResult').hidden = true;
  },
  summon(n) {
    const S = this.game.save;
    const cost = n === 10 ? SUMMON_COST.ten : SUMMON_COST.one;
    if (this.summoning) return;
    if (S.ruby < cost) { Sound.play('error'); this.toast('루비가 부족합니다'); return; }
    S.ruby -= cost;
    const res = [];
    for (let i = 0; i < n; i++) {
      let r = Math.random(), star = 3;
      for (const x of SUMMON_RATES) { if (r < x.p) { star = x.star; break; } r -= x.p; }
      if (n === 10 && i === 9 && !res.some(x => x.star >= 4)) star = 4;   // 10연 4성 이상 1명 보장
      const def = pick(HEROES);
      const h = S.heroes[def.id];
      const out = { def, star, isNew: false, up: false, evo: 0 };
      if (!h) { S.heroes[def.id] = { star, lvl: 1, awake: false }; out.isNew = true; }
      else if (!h.awake && star > h.star) { h.star = star; out.up = true; }
      else { out.evo = DUPE_EVO[star]; S.evo += out.evo; }
      res.push(out);
    }
    S.stats.summons = (S.stats.summons || 0) + n;
    this.game.persist(); this.refreshTop();
    const top = Math.max(...res.map(r => r.star));
    this.summoning = { t: 0, top, res };
    Sound.play('summon');
    $('#sumOne').disabled = $('#sumTen').disabled = true;
  },
  showSummonResult(res) {
    const box = $('#sumResult');
    box.hidden = false;
    const grid = $('#sumCards');
    grid.className = 'sumcards n' + res.length;
    grid.innerHTML = res.map((r, i) => {
      const h = { star: r.star, awake: false };
      return `<div class="scard s${r.star}" style="animation-delay:${i * 0.12}s">${this.heroCardHtml(r.def, Object.assign({ lvl: 1 }, h))}
        <div class="tagline">${r.isNew ? '<b class="new">NEW!</b>' : r.up ? '<b class="up">등급 상승!</b>' : `${ico('evo', 'ic sm')}+${r.evo}`}</div></div>`;
    }).join('');
    res.forEach((r, i) => setTimeout(() => Sound.play(r.star >= 5 ? 'legend' : r.star >= 4 ? 'star' : 'tap'), i * 120 + 200));
    $('#sumClose').onclick = () => { box.hidden = true; this.renderSummon(); };
  },

  // ───────── 편성 ─────────
  renderParty() {
    const S = this.game.save;
    const slots = $('#ptSlots');
    let html = '';
    for (let i = 0; i < 6; i++) {
      const id = S.party[i];
      html += id ? `<div class="pslot" data-id="${id}">${this.heroCardHtml(HERO_BY_ID[id], S.heroes[id])}</div>` : '<div class="pslot empty"><span>+</span></div>';
    }
    slots.innerHTML = html;
    $$('.pslot[data-id]', slots).forEach(s => s.addEventListener('click', () => this.toggleParty(s.dataset.id)));
    const owned = HEROES.filter(d => S.heroes[d.id]).sort((a, b) => heroPower(b, S.heroes[b.id]) - heroPower(a, S.heroes[a.id]));
    const grid = $('#ptGrid');
    grid.innerHTML = owned.map(d => this.heroCardHtml(d, S.heroes[d.id], S.party.includes(d.id) ? '<div class="inparty">편성</div>' : '')).join('');
    $$('.hcard', grid).forEach(c => c.addEventListener('click', () => this.toggleParty(c.dataset.id)));
    const pw = S.party.reduce((s, id) => s + heroPower(HERO_BY_ID[id], S.heroes[id]), 0);
    const ec = {}; S.party.forEach(id => { const e = HERO_BY_ID[id].elem; ec[e] = (ec[e] || 0) + 1; });
    $('#ptInfo').innerHTML = `총 전투력 <b>${fmt(pw)}</b> · ` + ELEM_ORDER.filter(e => ec[e]).map(e => `${ico('e_' + e, 'ic sm')}${ec[e]}`).join(' ') +
      '<br><small>전투에서는 편성한 영웅만 배치할 수 있습니다. 적의 속성에 강한 영웅을 섞어 두세요. (불 › 바람 › 물 › 불, 빛 ↔ 어둠)</small>';
  },

  // ───────── 난이도 선택 ─────────
  renderSelect() {
    const S = this.game.save;
    const box = $('#diffCards'); box.innerHTML = '';
    DIFFS.forEach((d, i) => {
      const rec = S.diffs[d.id] || {};
      const unlocked = i === 0 || (S.diffs[DIFFS[i - 1].id] || {}).cleared;
      const cp = S.checkpoint && S.checkpoint.diff === d.id ? S.checkpoint : null;
      const card = el('div', `dcard ${d.map} ${unlocked ? '' : 'locked'} ${rec.cleared ? 'cleared' : ''}`);
      card.style.setProperty('--dc', d.color);
      card.innerHTML = `<div class="dname">${d.name}</div><div class="drounds"><b>${d.rounds}</b> ROUND</div>
        <div class="ddesc">${d.desc}</div>
        <div class="drec">최고 기록 <b>${rec.best || 0}</b> / ${d.rounds}${rec.cleared ? ` · 클리어 ${rec.clears || 1}회` : ''}</div>
        <div class="drew">${rec.cleared ? '반복 보상' : '첫 클리어'} ${ico('ruby', 'ic sm')}${rec.cleared ? Math.floor(d.clearRuby * 0.2) : d.clearRuby}${d.drop.awk ? ` · 보스 ${ico('awk', 'ic sm')}` : ''}</div>
        ${unlocked ? '' : '<div class="lockmsg">🔒 이전 난이도 클리어 필요</div>'}
        ${rec.cleared ? '<div class="stamp">CLEAR</div>' : ''}
        <div class="dbtns">${cp ? `<button class="btn cont">이어하기 R${cp.wave}</button>` : ''}<button class="btn go">${cp ? '새로 시작' : '출전'}</button></div>`;
      if (unlocked) {
        $('.go', card).addEventListener('click', () => {
          if (S.checkpoint) {
            this.modal('새로 시작', `<p>진행 중인 방어전(${DIFF_BY_ID[S.checkpoint.diff].name} ROUND ${S.checkpoint.wave})이 있습니다.<br>새로 시작하면 이전 진행이 사라지고, 그때까지의 보상만 지급됩니다.</p>`,
              [{ t: '취소', cls: 'ghost' }, { t: '새로 시작', fn: () => { this.game.grant(S.checkpoint.rewards || {}); S.checkpoint = null; this.game.startBattle(d.id, false); } }]);
          } else this.game.startBattle(d.id, false);
        });
        if (cp) $('.cont', card).addEventListener('click', () => this.game.startBattle(d.id, true));
      }
      box.appendChild(card);
    });
  },

  // ───────── 전투 일시정지 · 결과 ─────────
  openPause(b) {
    const S = this.game.save;
    this.modal('일시 정지', `<p>${b.diff.name} · ROUND ${b.wave} / ${b.diff.rounds}</p>
      <div class="opts">${this.settingsHtml()}</div>
      <p class="hint">로비로 나가면 <b>현재 라운드 시작 시점</b>부터 이어할 수 있습니다.</p>`, [
      { t: '포기하기', cls: 'ghost danger', keep: true, fn: () => this.modal('포기', '<p>방어전을 포기할까요?<br><small>지금까지 얻은 보상은 지급됩니다.</small></p>', [
        { t: '취소', cls: 'ghost', fn: () => this.openPause(b) }, { t: '포기', cls: 'danger', fn: () => { b.paused = false; b.finish(false); } }], { cancelable: false }) },
      { t: '로비로', cls: 'ghost', fn: () => { this.game.endBattle(); } },
      { t: '계속하기', fn: () => { b.paused = false; } },
    ], { cancelable: false });
    this.bindSettings();
  },
  showResult(b, win) {
    const S = this.game.save, D = b.diff;
    const rec = S.diffs[D.id] = S.diffs[D.id] || { best: 0, cleared: false, clears: 0 };
    const rw = Object.assign({}, b.rewards);
    let first = false;
    if (win) {
      first = !rec.cleared;
      rw.ruby += first ? D.clearRuby : Math.floor(D.clearRuby * 0.2);
      rw.gold += Math.round(500 * D.gold * D.rounds / 30);
      rec.cleared = true; rec.clears = (rec.clears || 0) + 1;
    }
    this.game.grant(rw);
    S.stats.battles = (S.stats.battles || 0) + 1;
    this.game.persist();
    const mvpId = Object.keys(b.stats).sort((x, y) => b.stats[y] - b.stats[x])[0];
    const mvp = mvpId ? HERO_BY_ID[mvpId] : null;
    const unlockNext = win && first && DIFFS[DIFFS.indexOf(D) + 1];
    this.modal(win ? '<span class="vic">VICTORY</span>' : '<span class="def">DEFEAT</span>', `
      <div class="result">
        ${mvp ? `<div class="mvp"><img src="${portraitURL(mvp, S.heroes[mvpId] && S.heroes[mvpId].awake, 128)}" alt=""><span>MVP</span><b>${mvp.name}</b><small>${fmt(b.stats[mvpId])} 피해</small></div>` : ''}
        <div class="rinfo">
          <p>${D.name} · <b>ROUND ${win ? D.rounds : b.wave}</b> / ${D.rounds} ${win ? '클리어!' : '에서 함락'}</p>
          <div class="rewards">
            <div>${ico('gold')}<b>${fmt(rw.gold)}</b></div><div>${ico('ruby')}<b>${fmt(rw.ruby)}</b></div>
            <div>${ico('evo')}<b>${rw.evo}</b></div><div>${ico('awk')}<b>${rw.awk}</b></div>
          </div>
          ${first ? `<p class="first">첫 클리어 보너스 ${ico('ruby', 'ic sm')}${D.clearRuby}!</p>` : ''}
          ${unlockNext ? `<p class="first">새 난이도 <b style="color:${unlockNext.color}">${unlockNext.name}</b> 해금!</p>` : ''}
          ${!win ? '<p class="hint">영웅을 레벨업 · 진화시키고, 적 속성에 강한 영웅을 배치해 보세요.</p>' : ''}
        </div>
      </div>`, [
      { t: '로비로', cls: 'ghost', fn: () => this.game.endBattle() },
      { t: '다시 도전', fn: () => { this.game.endBattle(true); this.game.startBattle(D.id, false); } },
    ], { cancelable: false, cls: win ? 'win' : 'lose' });
  },

  // ───────── 설정 ─────────
  settingsHtml() {
    const s = this.game.save.settings;
    const row = (k, label) => `<label class="opt"><span>${label}</span><input type="checkbox" data-set="${k}" ${s[k] !== false ? 'checked' : ''}><i></i></label>`;
    return row('sfx', '효과음') + row('bgm', '배경 음악') + row('dmgText', '데미지 숫자');
  },
  bindSettings() {
    $$('[data-set]').forEach(inp => inp.addEventListener('change', () => {
      this.game.save.settings[inp.dataset.set] = inp.checked;
      this.game.applySettings(); this.game.persist();
    }));
  },
  openSettings() {
    const S = this.game.save;
    this.modal('설정', `<div class="opts">${this.settingsHtml()}</div>
      <p class="hint">진행 상황은 자동 저장됩니다 · 소환 ${S.stats.summons || 0}회 · 전투 ${S.stats.battles || 0}회</p>
      <p class="hint small">수호기사 방어전 v1.0 · 비공식 팬메이드 게임입니다. 캐릭터 · 그림 · 음악은 모두 직접 코드로 그렸습니다.</p>`, [
      { t: '데이터 초기화', cls: 'ghost danger', keep: true, fn: () => this.modal('데이터 초기화', '<p>모든 영웅과 진행 상황이 삭제됩니다.<br><b>정말 초기화할까요?</b></p>', [
        { t: '취소', cls: 'ghost' }, { t: '초기화', cls: 'danger', fn: () => { this.game.reset(); } }]) },
      { t: '닫기' },
    ]);
    this.bindSettings();
  },

  // ───────── 장면(캔버스) 그리기 ─────────
  setupScenes() {
    for (const id of ['tcv', 'lcv', 'dcv', 'scv']) this.scenes[id] = { cv: $('#' + id), c: $('#' + id).getContext('2d') };
  },
  sizeCanvas(cv) {
    const k = this.game.pixelScale;
    const w = Math.round(W * k), h = Math.round(H * k);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  },
  renderScene(dt) {
    this.sceneT += dt;
    const id = { title: 'tcv', lobby: 'lcv', detail: 'dcv', summon: 'scv' }[this.screen];
    if (!id) return;
    const S = this.scenes[id];
    this.sizeCanvas(S.cv);
    const c = S.c, k = this.game.pixelScale;
    c.setTransform(k, 0, 0, k, 0, 0);
    this.sceneFx.update(dt);
    if (id === 'tcv') this.drawTitle(c, dt);
    else if (id === 'lcv') this.drawLobby(c, dt);
    else if (id === 'dcv') this.drawDetail(c, dt);
    else this.drawSummon(c, dt);
    this.sceneFx.drawParts(c); this.sceneFx.drawEffects(c, 'ground'); this.sceneFx.drawEffects(c, 'top'); this.sceneFx.drawTexts(c);
  },

  drawSky(c, top, bottom, t) {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // 구름
    c.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 6; i++) {
      const x = ((i * 260 + t * (8 + i * 3)) % (W + 300)) - 150, y = 70 + (i * 53) % 160;
      c.beginPath(); c.arc(x, y, 26, 0, TAU); c.arc(x + 30, y - 10, 32, 0, TAU); c.arc(x + 64, y, 24, 0, TAU); c.fill();
    }
  },
  drawHills(c, y, col, amp, freq, off) {
    c.fillStyle = col; c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) c.lineTo(x, y + Math.sin(x * freq + off) * amp + Math.sin(x * freq * 2.3 + off) * amp * 0.4);
    c.lineTo(W, H); c.closePath(); c.fill();
  },

  drawTitle(c) {
    const t = this.sceneT;
    this.drawSky(c, '#2a3a8a', '#ff9a6a', t);
    // 노을 해
    radial(c, W * 0.5, H * 0.62, 260, '#fff3c0', '#ff8a3d', 0.8);
    this.drawHills(c, H * 0.6, '#5a4a8a', 30, 0.006, 1);
    this.drawHills(c, H * 0.7, '#3a3a6a', 22, 0.01, 3);
    drawCastle(c, W * 0.5, H * 0.74, 'meadow', 1, t);
    this.drawHills(c, H * 0.8, '#2a2a4a', 10, 0.02, 2);
    // 영웅 다섯 명 (속성별)
    const ids = ['leon', 'aqua', 'sylph', 'luciel', 'kain'];
    ids.forEach((id, i) => {
      const def = HERO_BY_ID[id];
      const x = W * 0.5 + (i - 2) * 170, y = H * 0.95 + Math.abs(i - 2) * -12;
      const ph = (t * 0.6 + i * 0.37) % 4;
      const st = ph < 0.8 ? 'attack' : 'idle';
      const P = heroPose(def, st, st === 'attack' ? ph / 0.8 : 0, t + i, 0);
      c.save(); c.translate(x, y); c.scale(1.5, 1.5);
      drawHero(c, def, P, { t: t + i, face: i < 2 ? 1 : i > 2 ? -1 : 1, star: 6, awake: i === 2 });
      c.restore();
    });
    if (Math.random() < 0.3) this.sceneFx.part({ x: rand(0, W), y: H + 10, vy: rand(-60, -20), vx: rand(-10, 10), color: pick(['#ffe27a', '#ff9a6a', '#ffffff']), life: 4, size: rand(1.5, 3), drag: 1 });
  },

  drawLobby(c, dt) {
    const t = this.sceneT;
    this.drawSky(c, '#5fa8ff', '#cfeaff', t);
    this.drawHills(c, H * 0.55, '#8ab8e8', 40, 0.004, 0);
    // 먼 성
    c.save(); c.translate(W * 0.6, H * 0.6); c.scale(1.6, 1.6); drawCastle(c, 0, 0, 'meadow', 1, t); c.restore();
    this.drawHills(c, H * 0.66, '#7cc85a', 18, 0.008, 2);
    this.drawHills(c, H * 0.8, '#5aa83a', 12, 0.015, 4);
    // 대표 영웅 + 편성 영웅
    const S = this.game.save, ld = this.leaderDef();
    const others = S.party.filter(id => id !== ld.id && S.heroes[id]).slice(0, 2);
    others.forEach((id, i) => {
      const def = HERO_BY_ID[id], h = S.heroes[id];
      const P = heroPose(def, 'idle', 0, t + i * 1.3, 0);
      c.save(); c.translate(150 + i * 300, H * 0.86); c.scale(1.7, 1.7);
      drawHero(c, def, P, { t: t + i, face: 1, star: h.star, awake: h.awake }); c.restore();
    });
    // 대표 영웅: 가끔 공격 · 스킬 동작
    const A = this.lobbyAnim || (this.lobbyAnim = { t: 0, next: 2.5, state: 'idle', p: 0 });
    A.t += dt;
    const dur = A.state === 'skill' ? SKILL_TIME * 1.3 : A.state === 'attack' ? ACTION_TIME[ld.anim] * 1.6 : 0;
    if (A.state === 'idle' && A.t > A.next) { A.state = Math.random() < 0.35 ? 'skill' : 'attack'; A.t = 0; A.fired = false; }
    if (A.state !== 'idle') {
      A.p = A.t / dur;
      if (!A.fired && A.p > (A.state === 'skill' ? SKILL_HIT : HIT_AT[ld.anim][0])) {
        A.fired = true;
        const E = ELEMS[ld.elem];
        if (A.state === 'skill') { this.sceneFx.add('flash', { x: 300, y: H * 0.6, r: 180, color: E.color, dur: 0.7 }); this.sceneFx.elemBurst(330, H * 0.62, ld.elem, 40, 320); }
        else this.sceneFx.elemBurst(400, H * 0.66, ld.elem, 12, 180);
      }
      if (A.p >= 1) { A.state = 'idle'; A.t = 0; A.next = rand(3, 6); }
    }
    const h = S.heroes[ld.id];
    const P = heroPose(ld, A.state, A.p || 0, t, 0);
    c.save(); c.translate(300, H * 0.93); c.scale(2.9, 2.9);
    drawHero(c, ld, P, { t, face: 1, star: h.star, awake: h.awake }); c.restore();
    if (Math.random() < 0.15) this.sceneFx.part({ x: rand(0, W * 0.6), y: rand(H * 0.2, H), vy: rand(-30, -10), vx: rand(5, 25), color: pick(['#ffffff', '#fff3a0', '#b8ffcf']), kind: 'leaf', life: 3, size: 3, drag: 1, add: false, rot: rand(0, 6), vr: 2 });
  },

  drawDetail(c, dt) {
    const t = this.sceneT;
    const S = this.game.save, def = HERO_BY_ID[this.detailId], h = S.heroes[def.id] || { star: 3, awake: false };
    const E = ELEMS[def.elem];
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, shade(E.dark, -0.4)); g.addColorStop(1, shade(E.color, -0.55));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // 빛줄기
    c.save(); c.translate(W * 0.25, H * 0.55); c.rotate(t * 0.1); c.globalAlpha = 0.1;
    for (let i = 0; i < 16; i++) { c.rotate(TAU / 16); c.fillStyle = E.light; c.beginPath(); c.moveTo(0, 0); c.lineTo(900, -70); c.lineTo(900, 70); c.fill(); }
    c.restore();
    // 받침대
    c.save(); c.translate(W * 0.25, H * 0.8);
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(0, 18, 190, 40, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(0, 6, 170, 36, 0, 0, TAU); c.fillStyle = vgrad(c, -30, 40, shade(E.color, -0.1), shade(E.dark, -0.3)); c.fill(); c.strokeStyle = E.light; c.lineWidth = 3; c.stroke();
    c.save(); c.scale(1, 0.21); c.rotate(t * 0.5); c.strokeStyle = rgba(E.light, 0.6); c.lineWidth = 6; star5(c, 0, 0, 140, 60); c.stroke(); c.restore();
    c.restore();
    // 영웅 + 데모 동작
    const A = this.detailAnim || (this.detailAnim = { state: 'idle', t: 0 });
    let st = 'idle', p = 0;
    if (A.state !== 'idle') {
      A.t += dt;
      const dur = A.state === 'skill' ? SKILL_TIME * 1.2 : ACTION_TIME[def.anim] * 1.5;
      p = A.t / dur; st = A.state;
      while (A.hits && A.hits.length && p >= A.hits[0]) { A.hits.shift(); this.demoFx(def, st, h); }
      if (p >= 1) { A.state = 'idle'; A.t = 0; }
    }
    const P = heroPose(def, st, Math.min(1, p), t, 0);
    c.save(); c.translate(W * 0.25, H * 0.84); c.scale(3.1, 3.1);
    if (!S.heroes[def.id]) c.globalAlpha = 0.9;
    drawHero(c, def, P, { t, face: 1, star: h.star, awake: h.awake });
    c.restore();
    if (Math.random() < 0.25) this.sceneFx.elemBurst(W * 0.25 + rand(-150, 150), H * 0.8, def.elem, 1, 40);
  },
  demoFx(def, st, h) {
    const E = ELEMS[def.elem];
    const x = W * 0.25 + 170, y = H * 0.55;
    if (st === 'skill') {
      this.sceneFx.add('flash', { x: W * 0.25, y: H * 0.5, r: 260, color: E.color, dur: 0.8 });
      this.sceneFx.add('ring', { x: W * 0.25, y: H * 0.8, r: 300, color: E.light, w: 12, dur: 0.8 });
      this.sceneFx.elemBurst(W * 0.25, H * 0.55, def.elem, 50, 420);
      this.sceneFx.text(W * 0.25, H * 0.15, skillNameOf(def, h), E.light, 40, { dur: 1.4, stroke: E.dark, vy: -20 });
      Sound.play({ fire: 'fire', water: 'ice', wind: 'wind', light: 'holy', dark: 'dark' }[def.elem]);
    } else {
      if (def.role === 'melee') this.sceneFx.add('slash', { x: x - 40, y, r: 70, rot: 0.2, color: E.color, dur: 0.35 });
      else this.sceneFx.add('flash', { x: x + 40, y: y - 30, r: 60, color: E.color, dur: 0.4 });
      this.sceneFx.elemBurst(x, y, def.elem, 14, 220);
      Sound.play(def.role === 'melee' ? 'slash' : def.anim === 'bow' ? 'arrow' : 'magic');
    }
  },

  drawSummon(c, dt) {
    const t = this.sceneT;
    const g = c.createRadialGradient(W / 2, H * 0.55, 20, W / 2, H * 0.55, W * 0.7);
    g.addColorStop(0, '#4a2a7a'); g.addColorStop(1, '#0a0618');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // 별
    for (let i = 0; i < 60; i++) { const x = (i * 211) % W, y = (i * 97) % (H * 0.6); c.fillStyle = rgba('#ffffff', 0.3 + 0.3 * Math.sin(t * 2 + i)); c.fillRect(x, y, 2, 2); }
    const Sm = this.summoning;
    let power = 0.3, col = '#a64dff';
    if (Sm) {
      Sm.t += dt;
      power = 0.3 + Math.min(1, Sm.t / 1.4) * 1.4;
      col = Sm.t > 0.8 ? ({ 3: '#5cc8ff', 4: '#c77dff', 5: '#ffd23f', 6: `hsl(${(t * 300) % 360},90%,65%)` }[Sm.top]) : '#a64dff';
      if (col.startsWith('hsl')) col = '#ff7ae6';
      if (Sm.t > 1.5 && !Sm.flashed) {
        Sm.flashed = true;
        this.sceneFx.add('pillar', { x: W / 2, y: H * 0.62, w: 90, color: col, dur: 1.0 });
        this.sceneFx.add('flash', { x: W / 2, y: H * 0.5, r: 500, color: col, dur: 0.9 });
        this.sceneFx.burst(W / 2, H * 0.55, col, 80, 600, { kind: 'star' });
        if (Sm.top >= 5) Sound.play('legend');
      }
      if (Sm.t > 2.1) { const res = Sm.res; this.summoning = null; this.showSummonResult(res); }
    }
    // 마법진
    c.save(); c.translate(W / 2, H * 0.62); c.scale(1, 0.38);
    for (let i = 0; i < 3; i++) {
      c.save(); c.rotate(t * (0.4 + i * 0.3) * (i % 2 ? -1 : 1) * (1 + power));
      c.strokeStyle = rgba(col.startsWith('#') ? col : '#ff7ae6', 0.35 + power * 0.3); c.lineWidth = 5 - i;
      c.beginPath(); c.arc(0, 0, 230 - i * 60, 0, TAU); c.stroke();
      star5(c, 0, 0, 220 - i * 60, 90 - i * 25); c.stroke();
      for (let k = 0; k < 12; k++) { c.rotate(TAU / 12); c.fillStyle = rgba('#ffffff', 0.5); c.fillRect(200 - i * 60, -3, 14, 6); }
      c.restore();
    }
    c.restore();
    c.save(); c.globalCompositeOperation = 'lighter';
    radial(c, W / 2, H * 0.55, 200 * power, '#ffffff', col.startsWith('#') ? col : '#ff7ae6', Math.min(1, 0.3 + power * 0.4));
    c.restore();
    if (Math.random() < 0.3 + power) this.sceneFx.part({ x: W / 2 + rand(-200, 200), y: H * 0.65, vy: rand(-180, -60) * power, color: col.startsWith('#') ? col : '#ffffff', life: 1.2, size: rand(2, 4), drag: 1 });
  },
};
