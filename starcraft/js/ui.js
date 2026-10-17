'use strict';
// ───────────────────────── 화면 위 정보판 (자원 · 선택 · 명령 버튼) ─────────────────────────
const CMD_INFO = {
  move: { label: '이동', hotkey: 'M', icon: 'c:move', desc: '지정한 곳으로 이동합니다. 가는 길에 적이 있어도 싸우지 않습니다.' },
  stop: { label: '정지', hotkey: 'S', icon: 'c:stop', desc: '하던 일을 멈춥니다.' },
  attack: { label: '공격', hotkey: 'A', icon: 'c:attack', desc: '적을 고르면 그 적을, 땅을 고르면 가는 길의 적을 모두 공격합니다.' },
  patrol: { label: '정찰', hotkey: 'P', icon: 'c:patrol', desc: '지금 위치와 지정한 곳 사이를 오가며 적을 공격합니다.' },
  hold: { label: '위치 사수', hotkey: 'H', icon: 'c:hold', desc: '움직이지 않고 사거리 안의 적만 공격합니다.' },
  gather: { label: '채취', hotkey: 'G', icon: 'c:gather', desc: '광물이나 리파이너리를 골라 자원을 캡니다.' },
  return: { label: '자원 반납', hotkey: 'C', icon: 'c:ret', desc: '들고 있는 자원을 커맨드 센터에 가져다 놓습니다.' },
  repair: { label: '수리', hotkey: 'R', icon: 'c:repair', desc: '건물이나 기계 유닛을 고쳐 체력을 회복시킵니다.' },
  buildMenu: { label: '건설', hotkey: 'B', icon: 'c:build', desc: '테란 건물을 짓습니다.' },
  back: { label: '뒤로', hotkey: 'Esc', icon: 'c:back', desc: '이전 메뉴로 돌아갑니다.' },
  cancel: { label: '취소', hotkey: 'Esc', icon: 'c:cancel', desc: '지금 고르고 있는 명령을 취소합니다.' },
  rally: { label: '집결 지점', hotkey: 'R', icon: 'c:rally', desc: '새로 나온 유닛이 모일 곳을 정합니다. 광물을 고르면 SCV가 바로 캐러 갑니다.' },
  stim: { label: '스팀팩', hotkey: 'T', icon: 'c:stim', desc: '체력을 조금 써서 10초 동안 공격·이동 속도가 50% 빨라집니다.' },
  siege: { label: '시즈 모드', hotkey: 'O', icon: 'r:siege', desc: '움직일 수 없는 대신 사거리 12, 피해 70의 포격을 합니다. 너무 가까운 적은 못 맞힙니다.' },
  unsiege: { label: '탱크 모드', hotkey: 'O', icon: 'c:unsiege', desc: '다시 움직일 수 있는 탱크 모드로 돌아갑니다.' },
  unload: { label: '모두 내리기', hotkey: 'D', icon: 'c:unload', desc: '벙커 안의 보병을 모두 내립니다.' },
  cancelBuild: { label: '건설 취소', hotkey: 'Esc', icon: 'c:cancel', desc: '건설을 멈추고 비용의 75%를 돌려받습니다.' },
  cancelQueue: { label: '생산 취소', hotkey: 'Esc', icon: 'c:cancel', desc: '마지막으로 예약한 생산·연구를 취소하고 비용을 돌려받습니다.' },
};
const LEAD_ORDER = ['tank', 'firebat', 'marine', 'medic', 'scv'];
function leadOf(sel) {
  const units = sel.filter(e => e.kind === 'unit');
  if (units.length) {
    for (const k of LEAD_ORDER) { const u = units.find(x => x.key === k); if (u) return u; }
    return units[0];
  }
  return sel[0];
}

const UI = {
  dirty: true, sig: '', selSig: '', dyn: [], tipFor: null, lastTick: 0,
  init() {
    const $ = id => document.getElementById(id);
    this.el = { min: $('rMin'), gas: $('rGas'), sup: $('rSup'), clock: $('clock'), sel: $('sel'), card: $('card'), tip: $('tip'), msgs: $('msgs'), hint: $('hint'), sound: $('bSound') };
    this.btns = [];
    for (let i = 0; i < 9; i++) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'cmd'; b.hidden = true;
      b.innerHTML = '<img alt=""><span class="hk"></span>';
      this.el.card.appendChild(b);
      this.btns.push(b);
      let press = null;
      b.addEventListener('pointerdown', e => {
        Sound.init();
        if (e.pointerType !== 'mouse') press = setTimeout(() => { press = 'long'; this.showTip(b._slot, b); }, 450);
      });
      b.addEventListener('pointerup', e => {
        if (e.pointerType !== 'mouse') {
          if (press === 'long') { press = null; this.hideTip(); return; }
          clearTimeout(press); press = null;
        }
      });
      b.addEventListener('pointerleave', () => { if (press && press !== 'long') clearTimeout(press); press = null; this.hideTip(); });
      b.addEventListener('mouseenter', () => this.showTip(b._slot, b));
      b.addEventListener('click', e => {
        e.preventDefault();
        if (!b._slot || G.state !== 'play') return;
        this.press(b._slot);
      });
    }
    $('bArmy').addEventListener('click', () => { if (G.state === 'play') Cmd.selectArmy(); });
    $('bMenu').addEventListener('click', () => { if (G.state === 'play') Game.pause(); });
    this.el.sound.addEventListener('click', () => { Sound.init(); Sound.setOn(!Sound.on); this.syncSound(); });
    this.syncSound();
  },
  syncSound() {
    this.el.sound.setAttribute('aria-pressed', String(Sound.on));
    this.el.sound.textContent = Sound.on ? '소리 켬' : '소리 끔';
    const b2 = document.getElementById('bSound2');
    if (b2) b2.textContent = Sound.on ? '소리 끄기' : '소리 켜기';
  },
  press(slot) {
    if (slot.disabled) { if (slot.reason) this.error(slot.reason); return; }
    Cmd.run(slot.action);
  },
  hotkey(letter) {
    for (const s of this.slots()) if (s && s.hotkey === letter) { this.press(s); this.renderCard(); return; }
  },
  msg(text, kind = 'info') {
    const d = document.createElement('div');
    d.className = 'msg ' + kind;
    d.textContent = text;
    this.el.msgs.appendChild(d);
    while (this.el.msgs.children.length > 4) this.el.msgs.firstChild.remove();
    setTimeout(() => { d.classList.add('fade'); }, 2600);
    setTimeout(() => { d.remove(); }, 3200);
  },
  error(text) { this.msg(text, 'err'); Sound.play('error'); },

  // ───── 명령 버튼 ─────
  cmd(id, disabled, reason) { return { action: id, ...CMD_INFO[id], disabled: !!disabled, reason: reason || '' }; },
  slots() {
    const S = new Array(9).fill(null), T = G.teams[0];
    if (!T) return S;
    if (G.mode) { S[8] = this.cmd('cancel'); return S; }
    const sel = ownSel();
    if (!sel.length) return S;
    const lead = leadOf(sel);
    if (lead.kind === 'unit') {
      if (G.card === 'build' && sel.some(u => u.key === 'scv')) {
        SCV_BUILDS.forEach((k, i) => {
          const def = BUILDINGS[k];
          S[i] = { action: 'place:' + k, label: def.name, hotkey: def.hotkey, icon: 'b:' + k, cost: def.cost, desc: def.desc, disabled: !reqMet(0, def.req), reason: def.req ? `${BUILDINGS[def.req].name}이(가) 필요합니다.` : '' };
        });
        S[8] = this.cmd('back');
        return S;
      }
      S[0] = this.cmd('move'); S[1] = this.cmd('stop'); S[2] = this.cmd('attack'); S[3] = this.cmd('patrol'); S[4] = this.cmd('hold');
      if (lead.key === 'scv') { S[3] = this.cmd('repair'); S[4] = this.cmd('gather'); S[5] = this.cmd('return'); S[6] = this.cmd('buildMenu'); }
      if (lead.def.stimCost) S[6] = this.cmd('stim', !T.upg.stim, '아카데미에서 스팀팩을 먼저 연구하세요.');
      if (lead.key === 'tank') {
        S[6] = lead.sieged || (lead.siegeT > 0 && lead.siegeTo) ? this.cmd('unsiege') : this.cmd('siege', !T.upg.siege, '팩토리에서 시즈 모드를 먼저 연구하세요.');
        if (lead.sieged) { S[0] = null; S[3] = null; }
      }
      return S;
    }
    if (!lead.built) { S[8] = this.cmd('cancelBuild'); return S; }
    (lead.def.trains || []).forEach((k, i) => {
      const def = UNITS[k];
      S[i] = { action: 'train:' + k, label: def.name, hotkey: def.hotkey, icon: 'u:' + k, cost: [def.cost[0], def.cost[1], def.supply], desc: def.desc, disabled: !reqMet(0, def.req), reason: def.req ? `${BUILDINGS[def.req].name}이(가) 필요합니다.` : '' };
    });
    (lead.def.researches || []).forEach((k, i) => {
      const R = RESEARCH[k], lvl = T.upg[k] || 0, max = R.levels || 1;
      const slot = { action: 'research:' + k, label: R.name + (R.levels ? ` ${Math.min(lvl + 1, max)}단계` : ''), hotkey: R.hotkey, icon: 'r:' + k, desc: R.desc };
      if (lvl >= max) Object.assign(slot, { disabled: true, reason: '이미 연구를 마쳤습니다.', done: true });
      else if (T.researching[k]) Object.assign(slot, { disabled: true, reason: '연구 중입니다.' });
      else slot.cost = researchCost(k, lvl);
      S[(lead.def.trains ? 3 : 0) + i] = slot;
    });
    if (lead.def.trains) S[5] = this.cmd('rally');
    if (lead.def.bunker && lead.loaded.length) S[0] = this.cmd('unload');
    if (lead.queue.length) S[8] = this.cmd('cancelQueue');
    return S;
  },
  renderCard() {
    const S = this.slots();
    const sig = S.map(s => s ? `${s.action}|${s.disabled ? 1 : 0}|${s.label}` : '-').join(',');
    if (sig === this.sig) return;
    this.sig = sig;
    S.forEach((s, i) => {
      const b = this.btns[i];
      b._slot = s;
      b.hidden = !s;
      if (!s) return;
      const icon = s.icon.startsWith('r:') && !Glyphs[s.icon.slice(2)] && s.icon !== 'r:siege' ? 'c:build' : s.icon;
      b.querySelector('img').src = Art.icon(icon);
      b.querySelector('.hk').textContent = s.hotkey;
      b.classList.toggle('off', !!s.disabled);
      b.classList.toggle('done', !!s.done);
      b.setAttribute('aria-label', `${s.label} (${s.hotkey})`);
    });
    if (this.tipFor) this.hideTip();
  },
  showTip(slot, btn) {
    if (!slot) return;
    const t = this.el.tip, T = G.teams[0];
    let cost = '';
    if (slot.cost) {
      cost = `<span class="c"><i class="gem min"></i>${slot.cost[0]}</span>`;
      if (slot.cost[1]) cost += `<span class="c"><i class="gem gas"></i>${slot.cost[1]}</span>`;
      if (slot.cost[2]) cost += `<span class="c"><i class="gem sup"></i>${slot.cost[2]}</span>`;
    }
    const lack = slot.disabled && slot.reason ? `<p class="req">${slot.reason}</p>` : '';
    t.innerHTML = `<p class="tt"><b>${slot.label}</b><kbd>${slot.hotkey}</kbd></p>${cost ? `<p class="cost">${cost}</p>` : ''}<p class="d">${slot.desc || ''}</p>${lack}`;
    t.hidden = false;
    this.tipFor = btn;
    if (T && slot.cost && (T.m < slot.cost[0] || T.g < slot.cost[1])) t.classList.add('poor'); else t.classList.remove('poor');
  },
  hideTip() { this.el.tip.hidden = true; this.tipFor = null; },

  // ───── 선택 정보 ─────
  renderSel() {
    const sel = G.selection.filter(e => !e.dead);
    const sig = sel.map(e => e.id + (e.kind === 'building' ? `:${e.built ? 1 : 0}:${e.queue.map(q => q.key).join('.')}:${e.loaded.length}` : `:${e.sieged ? 1 : 0}`)).join(',') + '|' + (sel.length === 1 && sel[0].kind === 'unit' ? sel[0].carry ? sel[0].carry.type : '' : '');
    if (sig === this.selSig) return;
    this.selSig = sig;
    this.dyn = [];
    const box = this.el.sel;
    box.innerHTML = '';
    if (!sel.length) {
      box.innerHTML = `<div class="empty"><p>유닛이나 건물을 선택하세요.</p><p class="sub">${Input.touchMode ? '누르기 · 끌어서 상자 선택' : '클릭 · 끌어서 상자 선택 · F2 전체 병력'}</p></div>`;
      return;
    }
    if (sel.length === 1) this.single(box, sel[0]);
    else this.multi(box, sel);
  },
  single(box, e) {
    const T = e.team >= 0 ? G.teams[e.team] : null;
    const isRes = e.kind === 'mineral' || e.kind === 'geyser';
    const iconName = isRes ? null : (e.kind === 'unit' ? 'u:' : 'b:') + e.key;
    const wrap = document.createElement('div');
    wrap.className = 'single';
    const name = isRes ? (e.kind === 'mineral' ? '광물' : '베스핀 간헐천') : e.def.name;
    const owner = e.team === 1 ? '<span class="tag foe">적</span>' : '';
    wrap.innerHTML = `${iconName ? `<img class="portrait" src="${Art.icon(iconName, 96)}" alt="">` : `<div class="portrait res ${e.kind}"></div>`}<div class="info"><h3>${name}${owner}</h3></div>`;
    const info = wrap.querySelector('.info');
    const line = html => { const p = document.createElement('p'); p.className = 'stat'; p.innerHTML = html; info.appendChild(p); return p; };
    if (isRes) {
      const p = line('');
      this.dyn.push(() => { p.innerHTML = `남은 양 <b>${Math.max(0, Math.floor(e.amount))}</b>`; });
      box.appendChild(wrap); this.tickDyn(); return;
    }
    const hpWrap = document.createElement('div');
    hpWrap.className = 'hp';
    hpWrap.innerHTML = '<div class="bar"><i></i></div><span></span>';
    info.appendChild(hpWrap);
    const hpBar = hpWrap.querySelector('i'), hpTxt = hpWrap.querySelector('span');
    this.dyn.push(() => {
      const k = clamp(e.hp / e.def.hp, 0, 1);
      hpBar.style.width = (k * 100).toFixed(1) + '%';
      hpBar.style.background = k > 0.6 ? 'var(--ok)' : k > 0.33 ? 'var(--warn)' : 'var(--err)';
      hpTxt.textContent = `${Math.ceil(e.hp)} / ${e.def.hp}`;
    });
    if (e.kind === 'unit') {
      const w = curWeapon(e);
      if (w) {
        const up = w.upg && T ? (T.upg[w.upg] || 0) * (w.plus || 1) : 0;
        line(`공격력 <b>${w.dmg}${up ? '+' + up : ''}</b> · ${DMG_NAME[w.type]} · 사거리 <b>${Math.round(weaponRange(e, w) / TILE) || 1}</b>`);
      }
      const ar = (e.def.armor || 0), aup = e.def.armorUpg && T ? T.upg[e.def.armorUpg] || 0 : 0;
      line(`방어력 <b>${ar}${aup ? '+' + aup : ''}</b> · ${SIZE_NAME[e.def.size]}${e.def.bio ? ' · 생체' : e.def.mech ? ' · 기계' : ''}${e.kills ? ` · 처치 <b>${e.kills}</b>` : ''}`);
      if (e.def.energy) {
        const p = line('');
        this.dyn.push(() => { p.innerHTML = `에너지 <b class="en">${Math.floor(e.energy)}</b> / ${e.def.energy}`; });
      }
      if (e.carry) line(`${e.carry.type === 'm' ? '광물' : '가스'} <b>${e.carry.amt}</b> 운반 중`);
      if (e.sieged) line('<span class="hl">시즈 모드</span>');
    } else {
      if (!e.built) {
        const p = line('');
        this.dyn.push(() => { p.innerHTML = `건설 중 <b>${Math.floor(e.progress * 100)}%</b>`; });
      } else {
        if (e.def.provides && e.team === 0) line(`보급품 <b>+${e.def.provides}</b>`);
        if (e.def.weapon) line(`공격력 <b>${e.def.weapon.dmg}</b> · ${DMG_NAME[e.def.weapon.type]} · 사거리 <b>${Math.round(e.def.weapon.range / TILE)}</b>`);
        if (e.def.onGeyser) {
          const p = line('');
          this.dyn.push(() => { const gy = byId(e.geyser); p.innerHTML = `남은 가스 <b>${gy ? gy.amount : 0}</b>`; });
        }
        if (e.def.bunker) {
          const p = line(`탑승 <b>${e.loaded.length}</b> / ${e.def.bunker}`);
          const row = document.createElement('div'); row.className = 'queue';
          for (const id of e.loaded) { const u = byId(id); if (!u) continue; const im = document.createElement('img'); im.src = Art.icon('u:' + u.key, 40); im.alt = u.def.name; row.appendChild(im); }
          info.appendChild(row);
          void p;
        }
        if (e.queue.length && e.team === 0) {
          const q0 = e.queue[0];
          const pr = document.createElement('div');
          pr.className = 'prod';
          pr.innerHTML = `<p class="stat">${q0.research ? '연구' : '생산'} 중: <b>${q0.research ? RESEARCH[q0.key].name : UNITS[q0.key].name}</b></p><div class="bar amber"><i></i></div>`;
          info.appendChild(pr);
          const bar = pr.querySelector('i');
          this.dyn.push(() => { const q = e.queue[0]; if (q) bar.style.width = ((1 - q.t / q.total) * 100).toFixed(1) + '%'; });
          const row = document.createElement('div'); row.className = 'queue';
          e.queue.forEach((q, i) => {
            const qb = document.createElement('button');
            qb.type = 'button';
            qb.title = '눌러서 취소';
            qb.setAttribute('aria-label', `${q.research ? RESEARCH[q.key].name : UNITS[q.key].name} 취소`);
            const icon = q.research ? (q.key === 'siege' ? 'r:siege' : 'r:' + q.key) : 'u:' + q.key;
            qb.innerHTML = `<img src="${Art.icon(icon, 40)}" alt="">`;
            qb.addEventListener('click', () => { cancelQueue(e, i); });
            row.appendChild(qb);
          });
          info.appendChild(row);
        }
      }
    }
    box.appendChild(wrap);
    this.tickDyn();
  },
  multi(box, sel) {
    const grid = document.createElement('div');
    grid.className = 'multi';
    const shown = sel.slice(0, 24);
    for (const e of shown) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', e.def.name);
      b.innerHTML = `<img src="${Art.icon((e.kind === 'unit' ? 'u:' : 'b:') + e.key, 40)}" alt=""><i></i>`;
      const bar = b.querySelector('i');
      this.dyn.push(() => {
        const k = clamp(e.hp / e.def.hp, 0, 1);
        bar.style.width = (k * 100) + '%';
        bar.style.background = k > 0.6 ? 'var(--ok)' : k > 0.33 ? 'var(--warn)' : 'var(--err)';
      });
      b.addEventListener('click', ev => {
        if (ev.shiftKey) { G.selection = G.selection.filter(x => x !== e); UI.dirty = true; }
        else Cmd.select([e]);
      });
      grid.appendChild(b);
    }
    if (sel.length > shown.length) { const more = document.createElement('span'); more.className = 'more'; more.textContent = `+${sel.length - shown.length}`; grid.appendChild(more); }
    box.appendChild(grid);
    this.tickDyn();
  },
  tickDyn() { for (const f of this.dyn) f(); },

  update() {
    const T = G.teams[0];
    if (!T) return;
    this.el.min.textContent = Math.floor(T.m);
    this.el.gas.textContent = Math.floor(T.g);
    const used = Math.ceil(T.supUsed);
    this.el.sup.textContent = `${used}/${T.supCap}`;
    this.el.sup.classList.toggle('cap', used >= T.supCap && T.supCap < 200);
    this.el.clock.textContent = fmtTime(G.time);
    if (this.dirty) { this.dirty = false; this.selSig = this.selSig + '*'; }
    this.renderSel();
    this.renderCard();
    this.tickDyn();
    const m = G.mode;
    let hint = '';
    if (G.state === 'play' && m) {
      const tail = Input.touchMode ? ' · 취소는 오른쪽 아래 버튼' : ' · 취소: Esc / 오른쪽 클릭';
      if (m.type === 'place') hint = `${BUILDINGS[m.key].name}을(를) 지을 곳을 ${Input.touchMode ? '끌어서 놓으세요' : '고르세요 (Shift: 여러 개)'}${tail}`;
      else hint = { move: '이동할 곳', attack: '공격할 대상이나 곳', patrol: '정찰할 곳', gather: '자원', repair: '수리할 대상', rally: '집결 지점' }[m.cmd] + `을(를) ${Input.touchMode ? '누르세요' : '고르세요'}${tail}`;
    }
    if (this.el.hint.textContent !== hint) this.el.hint.textContent = hint;
    this.el.hint.hidden = !hint;
    View.canvas.classList.toggle('target', !!(m && m.type === 'target'));
  },
};

// ───────────────────────── 화면 전환 (타이틀 · 일시 정지 · 결과 · 조작법) ─────────────────────────
const Screens = {
  init() {
    const $ = id => document.getElementById(id);
    this.ov = $('overlay');
    this.scr = { title: $('scrTitle'), pause: $('scrPause'), end: $('scrEnd'), help: $('scrHelp') };
    this.back = 'title';
    const opts = Store.get('kf.opts', { diff: 'normal', speed: 'normal' });
    this.opts = { diff: DIFF[opts.diff] ? opts.diff : 'normal', speed: SPEEDS[opts.speed] ? opts.speed : 'normal' };
    for (const seg of document.querySelectorAll('.seg')) {
      const name = seg.dataset.name;
      for (const b of seg.querySelectorAll('button')) {
        b.addEventListener('click', () => {
          this.opts[name] = b.dataset.v;
          Store.set('kf.opts', this.opts);
          this.syncSeg();
        });
      }
    }
    this.syncSeg();
    $('bStart').addEventListener('click', () => { Sound.init(); Game.start(this.opts.diff, this.opts.speed); });
    $('bHelp1').addEventListener('click', () => this.show('help', 'title'));
    $('bHelp2').addEventListener('click', () => this.show('help', 'pause'));
    $('bHelpBack').addEventListener('click', () => this.show(this.back));
    $('bResume').addEventListener('click', () => Game.resume());
    $('bSound2').addEventListener('click', () => { Sound.init(); Sound.setOn(!Sound.on); UI.syncSound(); });
    $('bRestart').addEventListener('click', () => Game.start(G.difficulty, Game.speedKey));
    $('bQuit').addEventListener('click', () => Game.toTitle());
    $('bAgain').addEventListener('click', () => Game.start(G.difficulty, Game.speedKey));
    $('bToTitle').addEventListener('click', () => Game.toTitle());
  },
  syncSeg() {
    for (const seg of document.querySelectorAll('.seg')) {
      const name = seg.dataset.name;
      for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.v === this.opts[name]));
    }
  },
  show(name, back) {
    if (back) this.back = back;
    this.ov.hidden = !name;
    for (const k in this.scr) this.scr[k].hidden = k !== name;
    if (name) { const f = this.scr[name].querySelector('button.primary'); if (f) f.focus({ preventScroll: true }); }
  },
};
