'use strict';
// ───────────────────────── 게임 시작 · 저장 · 메인 루프 ─────────────────────────

const Game = {
  save: null, battle: null, ui: UI, pixelScale: 1, last: 0,

  newSave() {
    const heroes = {};
    for (const id of STARTERS) heroes[id] = { star: 3, lvl: 1, awake: false };
    return { v: 1, gold: 1500, ruby: 300, evo: 0, awk: 0, heroes, party: STARTERS.slice(), leader: 'leon',
      diffs: {}, settings: { sfx: true, bgm: true, dmgText: true, hq: true, speed: 1, autoSkill: true, autoNext: true }, checkpoint: null, stats: {},
      counters: {}, achieved: {}, daily: { date: '', c: {}, claimed: {}, shop: {} }, attend: { last: '', day: 0 }, tutorialDone: false };
  },

  load() {
    const s = Store.read();
    const base = this.newSave();
    if (!s || s.v !== 1 || !s.heroes) return base;
    // 빠진 항목은 기본값으로 채운다 (버전이 바뀌어도 저장이 깨지지 않게)
    const out = Object.assign(base, s);
    out.settings = Object.assign(this.newSave().settings, s.settings || {});
    out.stats = s.stats || {};
    out.diffs = s.diffs || {};
    out.counters = s.counters || {}; out.achieved = s.achieved || {};
    out.daily = Object.assign({ date: '', c: {}, claimed: {}, shop: {} }, s.daily || {});
    out.attend = Object.assign({ last: '', day: 0 }, s.attend || {});
    // 이전 버전 저장: 이미 전투를 해 봤다면 튜토리얼 생략
    if (s.tutorialDone == null) out.tutorialDone = !!(s.stats && s.stats.battles);
    for (const id in out.heroes) if (!HERO_BY_ID[id]) delete out.heroes[id];
    out.party = (out.party || []).filter(id => out.heroes[id]);
    if (!out.party.length) out.party = Object.keys(out.heroes).slice(0, 6);
    return out;
  },

  persist() {
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => Store.write(this.save), 50);
  },
  persistNow() { clearTimeout(this.saveT); Store.write(this.save); },

  reset() {
    Store.clear();
    this.save = this.newSave();
    this.persistNow();
    this.applySettings();
    this.ui.show('lobby', { noPush: true });
    this.ui.toast('데이터를 초기화했습니다');
  },

  grant(r) {
    const S = this.save;
    S.gold += r.gold || 0; S.ruby += r.ruby || 0; S.evo += r.evo || 0; S.awk += r.awk || 0;
    this.ui.refreshTop();
  },

  // 일일 · 누적 카운터 (임무 · 업적)
  checkDaily() {
    const d = this.save.daily, today = todayKey();
    if (d.date !== today) { this.save.daily = { date: today, c: {}, claimed: {}, shop: {} }; }
  },
  count(key, n = 1) {
    this.checkDaily();
    const S = this.save;
    S.counters[key] = (S.counters[key] || 0) + n;
    S.daily.c[key] = (S.daily.c[key] || 0) + n;
  },
  countMax(key, v) { const S = this.save; S.counters[key] = Math.max(S.counters[key] || 0, v); },
  achValue(key) {
    const S = this.save;
    if (key === 'heroes') return Object.keys(S.heroes).length;
    if (key === 'awakened') return Object.values(S.heroes).filter(h => h.awake).length;
    return S.counters[key] || 0;
  },

  recordWave(diffId, n) {
    const d = this.save.diffs[diffId] = this.save.diffs[diffId] || { best: 0, cleared: false, clears: 0 };
    if (n > d.best) d.best = n;
  },

  applySettings() {
    const s = this.save.settings;
    Sound.sfxOn = s.sfx !== false;
    Sound.bgmOn = s.bgm !== false;
    FX.cap = s.hq === false ? 300 : 900;
    if (this.save) this.resize();
  },

  startBattle(diffId, resume) {
    if (!this.save.party.length) { this.ui.toast('편성된 영웅이 없습니다'); return; }
    if (this.battle) this.battle.destroy();
    this.ui.closeModal();
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'battle'));
    this.ui.screen = 'battle';
    this.battle = new Battle(this, diffId, resume);
  },

  endBattle(silent) {
    if (this.battle) { this.battle.destroy(); this.battle = null; }
    $('#tut').hidden = true;
    $('#modal').hidden = true;
    if (!silent) this.ui.show('lobby', { noPush: true });
  },

  resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.min(vw / W, vh / H);
    const st = $('#stage');
    st.style.transform = `translate(${(vw - W * s) / 2}px, ${(vh - H * s) / 2}px) scale(${s})`;
    const hq = !this.save || this.save.settings.hq !== false;
    this.pixelScale = hq ? Math.min(1.5, Math.max(1, s * (window.devicePixelRatio || 1))) : 1;
    if (this.battle) this.battle.resize();
  },

  loop(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000 || 0);
    this.last = now;
    try {
      if (this.ui.screen === 'battle' && this.battle) { this.battle.update(dt); this.battle.render(); }
      else this.ui.renderScene(dt);
    } catch (e) { console.error(e); }
    requestAnimationFrame(t => this.loop(t));
  },

  init() {
    this.save = this.load();
    // 이전 버전의 클리어 기록을 업적 카운터로 옮긴다
    for (const d of DIFFS) if ((this.save.diffs[d.id] || {}).cleared) this.countMax('clear_' + d.id, 1);
    this.checkDaily();
    this.applySettings();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.ui.init(this);
    this.ui.show('title', { noPush: true });
    // 안드로이드 뒤로가기 / 백그라운드 전환
    window.onAndroidBack = () => this.ui.back();
    window.onAndroidPause = () => this.onPause();
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.onPause(); else if (Sound.ctx) Sound.ctx.resume(); });
    // 캔버스 글꼴 미리 불러오기
    if (document.fonts && document.fonts.load) {
      const txt = HEROES.map(h => h.name + h.skill.name + h.askill.name + h.title).join('') + '0123456789+-!처형포효강화공속UP진화석각성석ROUNDCLEARBOSS얼음방벽돌진타락의치유망자소환';
      document.fonts.load('20px "Black Han Sans"', txt).catch(() => {});
      document.fonts.load('20px "Jua"', txt).catch(() => {});
    }
    this.persistNow();
    requestAnimationFrame(t => { this.last = t; this.loop(t); });
  },

  onPause() {
    this.persistNow();
    if (this.battle && !this.battle.over && !this.battle.paused && this.ui.screen === 'battle') this.battle.openPause();
    if (Sound.ctx && Sound.ctx.state === 'running') Sound.ctx.suspend();
  },
};

window.addEventListener('load', () => Game.init());
