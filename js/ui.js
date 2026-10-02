'use strict';
// ───────────────────────── 창 스택 ─────────────────────────
const UIStack = [];
function pushUI(w) { UIStack.push(w); return w; }
function popUI(w) { const i = UIStack.indexOf(w); if (i >= 0) UIStack.splice(i, 1); }
function updateUI() { const top = UIStack[UIStack.length - 1]; if (top) top.update(); }
function drawUI() { for (const w of UIStack) w.draw(); }

class ListView {
  constructor(rows) { this.i = 0; this.top = 0; this.rows = rows; this.n = 0; }
  set(n) { this.n = n; this.i = clamp(this.i, 0, Math.max(0, n - 1)); this.fix(); }
  move(d) { if (this.n < 2) return; this.i = (this.i + d + this.n) % this.n; this.fix(); Sound.sfx('cursor'); }
  fix() { if (this.i < this.top) this.top = this.i; if (this.i >= this.top + this.rows) this.top = this.i - this.rows + 1; this.top = clamp(this.top, 0, Math.max(0, this.n - this.rows)); }
  handle() { if (Input.rep('up')) this.move(-1); if (Input.rep('down')) this.move(1); }
  each(fn) { for (let k = this.top; k < Math.min(this.n, this.top + this.rows); k++) fn(k, k - this.top, k === this.i); }
  drawScroll(x, y, h) {
    if (this.n <= this.rows) return;
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x, y, 4, h);
    const bh = Math.max(16, h * this.rows / this.n), by = y + (h - bh) * this.top / Math.max(1, this.n - this.rows);
    ctx.fillStyle = UI.accent; ctx.fillRect(x, by, 4, bh);
  }
}

// ───────────────────────── 대화창 ─────────────────────────
const MSG = { x: 12, y: 334, w: 616, h: 134, lines: 4, size: 19, lh: 27 };

class MessageBox {
  constructor(o, resolve) {
    this.o = o; this.resolve = resolve;
    const textX = o.look || o.monster ? 140 : 32;
    this.textX = textX;
    const lines = wrapText(o.text, MSG.w - (textX - MSG.x) - 24, MSG.size);
    this.pages = [];
    for (let i = 0; i < lines.length; i += MSG.lines) this.pages.push(lines.slice(i, i + MSG.lines));
    this.page = 0; this.shown = 0; this.t = 0;
  }
  pageLen() { return this.pages[this.page].join('').length; }
  update() {
    this.t++;
    if (this.shown < this.pageLen()) this.shown += 1.4;
    if (this.o.hold) return;
    if (Input.pressed.ok || Input.pressed.cancel) {
      if (this.shown < this.pageLen()) { this.shown = this.pageLen(); return; }
      if (this.page < this.pages.length - 1) { this.page++; this.shown = 0; Sound.sfx('cursor'); return; }
      popUI(this); this.resolve();
    }
  }
  draw() {
    const o = this.o;
    drawWindow(MSG.x, MSG.y, MSG.w, MSG.h);
    if (o.look) {
      ctx.save(); roundRect(MSG.x + 10, MSG.y + 10, 116, MSG.h - 20, 6); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill(); ctx.restore();
      const img = charSprite(o.look, 'down', 0);
      blit(img, MSG.x + 68 - img.width * 2, MSG.y + MSG.h - 6 - img.height * 4 + 8, 4);
    } else if (o.monster) {
      const img = monsterSprite(o.monster, Math.floor(this.t / 20) % 2);
      const sc = Math.max(1, Math.min(4, Math.floor(100 / Math.max(img.width, img.height))));
      blit(img, MSG.x + 68 - img.width * sc / 2, MSG.y + MSG.h / 2 - img.height * sc / 2, sc);
    }
    if (o.name) {
      const nw = textWidth(o.name, 17) + 28;
      drawWindow(MSG.x + 8, MSG.y - 30, nw, 32, { top: 'rgba(120,70,20,0.96)', bot: 'rgba(80,40,10,0.96)', border: '#ffcf5a' });
      text(o.name, MSG.x + 8 + nw / 2, MSG.y - 23, { size: 17, align: 'center', color: '#ffe9a8' });
    }
    let left = Math.floor(this.shown);
    this.pages[this.page].forEach((ln, i) => {
      if (left <= 0) return;
      const s = ln.slice(0, left); left -= ln.length;
      text(s, this.textX, MSG.y + 16 + i * MSG.lh, { size: MSG.size, lw: 3 });
    });
    if (!o.hold && this.shown >= this.pageLen() && Math.floor(this.t / 15) % 2) {
      text(this.page < this.pages.length - 1 ? '▼' : '▶', MSG.x + MSG.w - 26, MSG.y + MSG.h - 28, { size: 16, color: UI.accent2 });
    }
  }
}

class ChoiceBox {
  constructor(options, o, resolve) {
    this.opts = options.map(x => typeof x === 'string' ? { label: x } : x);
    this.o = o; this.resolve = resolve;
    this.list = new ListView(o.rows || 8); this.list.set(this.opts.length);
    this.list.i = o.start || 0;
    const wMax = Math.max(...this.opts.map(x => textWidth(x.label, 18) + (x.right ? textWidth(x.right, 16) + 24 : 0)), o.title ? textWidth(o.title, 16) : 0);
    this.w = o.w || clamp(wMax + 56, 160, 600);
    this.descH = this.opts.some(x => x.desc) ? 58 : 0;
    this.h = Math.min(this.opts.length, this.list.rows) * 34 + 20 + (o.title ? 30 : 0) + this.descH;
    this.x = o.x !== undefined ? o.x : (o.center ? (W - this.w) / 2 : MSG.x + MSG.w - this.w);
    this.y = o.y !== undefined ? o.y : o.bottom !== undefined ? o.bottom - this.h : (o.center ? (H - this.h) / 2 : MSG.y - this.h - 8);
  }
  update() {
    this.list.handle();
    if (Input.pressed.ok) {
      const op = this.opts[this.list.i];
      if (op.disabled) { Sound.sfx('buzz'); return; }
      Sound.sfx('ok'); popUI(this); this.resolve(this.list.i);
    } else if (Input.pressed.cancel && this.o.cancel !== false) {
      Sound.sfx('cancel'); popUI(this); this.resolve(-1);
    }
  }
  draw() {
    drawWindow(this.x, this.y, this.w, this.h);
    let y0 = this.y + 10;
    if (this.o.title) { text(this.o.title, this.x + 16, y0 + 2, { size: 16, color: UI.accent2 }); y0 += 30; }
    this.list.each((k, row, sel) => {
      const op = this.opts[k], y = y0 + row * 34;
      if (sel) drawCursorBar(this.x + 8, y, this.w - 16, 32);
      text(op.label, this.x + 22, y + 7, { size: 18, color: op.disabled ? '#7d86a8' : UI.text });
      if (op.right) text(op.right, this.x + this.w - 20, y + 9, { size: 16, align: 'right', color: op.disabled ? '#7d86a8' : UI.accent2 });
    });
    this.list.drawScroll(this.x + this.w - 8, y0, Math.min(this.opts.length, this.list.rows) * 34);
    if (this.descH) {
      const dy = this.y + this.h - this.descH;
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(this.x + 12, dy, this.w - 24, 1);
      const desc = this.opts[this.list.i].desc || '';
      wrapText(desc, this.w - 32, 15).slice(0, 2).forEach((l, i) => text(l, this.x + 16, dy + 9 + i * 21, { size: 15, color: UI.dim }));
    }
  }
}

// ── 스크립트에서 쓰는 비동기 대화 함수 ──
function say(who, txt) {
  const o = typeof who === 'string' ? { name: who } : who ? { name: who.name, look: who.look, monster: who.monster } : {};
  o.text = txt;
  return new Promise(res => pushUI(new MessageBox(o, res)));
}
async function sayAll(who, lines) { for (const l of lines) await say(who, l); }
function choose(options, o = {}) { return new Promise(res => pushUI(new ChoiceBox(options, o, res))); }
async function ask(who, txt, options, o = {}) {
  const box = new MessageBox({ ...(typeof who === 'string' ? { name: who } : who ? { name: who.name, look: who.look, monster: who.monster } : {}), text: txt, hold: true }, () => {});
  box.shown = 9999;
  pushUI(box);
  const r = await choose(options, o);
  popUI(box);
  return r;
}
function notice(txt) { return say(null, txt); }

// ───────────────────────── 토스트 (획득 알림) ─────────────────────────
const Toasts = [];
function toast(msg, color = UI.text, icon = null) { Toasts.push({ msg, color, icon, t: 0 }); if (Toasts.length > 6) Toasts.shift(); }
function drawToasts() {
  let y = H - 64;
  for (let i = Toasts.length - 1; i >= 0; i--) {
    const t = Toasts[i]; t.t++;
    if (t.t > 200) { Toasts.splice(i, 1); continue; }
    const a = t.t > 160 ? (200 - t.t) / 40 : Math.min(1, t.t / 8);
    ctx.save(); ctx.globalAlpha = a;
    const w = textWidth(t.msg, 15) + (t.icon ? 30 : 16);
    ctx.fillStyle = 'rgba(10,12,24,0.7)'; roundRect(W - w - 10, y - 2, w, 24, 6); ctx.fill();
    if (t.icon) blit(iconSprite(t.icon[0], t.icon[1]), W - w - 4, y + 1, 1.4);
    text(t.msg, W - 18, y + 2, { size: 15, align: 'right', color: t.color, lw: 3 });
    ctx.restore();
    y -= 28;
  }
}

// ───────────────────────── 메인 메뉴 ─────────────────────────
const PANEL = { x: 12, y: 12, w: 448, h: 456 };

function drawItemIcon(id, x, y, sc = 2) { const it = ITEMS[id]; if (it) blit(iconSprite(it.icon[0], it.icon[1]), x, y, sc); }

function statLine(label, val, x, y, col) {
  text(label, x, y, { size: 16, color: UI.dim });
  text(String(val), x + 150, y, { size: 16, align: 'right', color: col || UI.text });
}

function drawStatusPanel(p) {
  drawWindow(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  const d = derived(p), m = MAPS[p.map];
  ctx.save(); roundRect(PANEL.x + 16, PANEL.y + 16, 120, 150, 8); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill(); ctx.restore();
  const img = charSprite(playerLook(p), 'down', Math.floor(frameCount / 20) % 3 === 1 ? 0 : 0);
  blit(img, PANEL.x + 76 - img.width * 2, PANEL.y + 26, 4);
  const X = PANEL.x + 152;
  text(p.name, X, PANEL.y + 18, { size: 26, color: '#ffffff' });
  text(`Lv.${p.level}  ${JOBS[p.job].name}`, X, PANEL.y + 52, { size: 18, color: UI.accent2 });
  drawBar(X, PANEL.y + 82, 270, 16, p.hp / p.mhp, UI.hp, `HP ${fmt(p.hp)} / ${fmt(p.mhp)}`);
  drawBar(X, PANEL.y + 104, 270, 16, p.mp / p.mmp, UI.mp, `MP ${fmt(p.mp)} / ${fmt(p.mmp)}`);
  const need = expNeed(p.level);
  drawBar(X, PANEL.y + 126, 270, 16, p.exp / need, UI.exp, `EXP ${fmt(p.exp)} / ${fmt(need)} (${(p.exp / need * 100).toFixed(1)}%)`);
  const Y = PANEL.y + 190;
  statLine(JOBS[p.job].magic ? '마력' : '공격력', JOBS[p.job].magic ? d.magic : d.attack, PANEL.x + 28, Y);
  statLine('방어력', d.defense, PANEL.x + 28, Y + 28);
  statLine('크리티컬', Math.round(d.crit * 100) + '%', PANEL.x + 28, Y + 56);
  statLine('STR', d.str, PANEL.x + 240, Y); statLine('DEX', d.dex, PANEL.x + 240, Y + 28);
  statLine('INT', d.int, PANEL.x + 240, Y + 56); statLine('LUK', d.luk, PANEL.x + 240, Y + 84);
  statLine('남은 AP', p.ap, PANEL.x + 28, Y + 84, p.ap ? UI.accent : UI.text);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(PANEL.x + 20, Y + 122, PANEL.w - 40, 1);
  blit(iconSprite('coin'), PANEL.x + 26, Y + 138, 2);
  text(`${fmt(p.meso)} 메소`, PANEL.x + 60, Y + 140, { size: 20, color: '#ffe27a' });
  text(`현재 위치  ${m.region} · ${m.name}`, PANEL.x + 28, Y + 180, { size: 16, color: UI.dim });
  const t = Math.floor(p.playTime / 60);
  text(`플레이 시간  ${Math.floor(t / 3600)}시간 ${Math.floor(t / 60) % 60}분`, PANEL.x + 28, Y + 206, { size: 16, color: UI.dim });
}

class MainMenu {
  constructor() {
    this.items = ['아이템', '장비', '스탯', '스킬', '퀘스트', '저장하기', '타이틀로', '닫기'];
    this.list = new ListView(8); this.list.set(this.items.length);
    Sound.sfx('ok');
  }
  update() {
    this.list.handle();
    if (Input.pressed.cancel) { Sound.sfx('cancel'); popUI(this); return; }
    if (!Input.pressed.ok) return;
    Sound.sfx('ok');
    switch (this.list.i) {
      case 0: pushUI(new ItemWindow()); break;
      case 1: pushUI(new EquipWindow()); break;
      case 2: pushUI(new StatWindow()); break;
      case 3: pushUI(new SkillWindow()); break;
      case 4: pushUI(new QuestWindow()); break;
      case 5: (async () => { const ok = saveGame(); await notice(ok ? '모험 기록을 저장했습니다.' : '이 브라우저에서는 저장할 수 없습니다. (저장소가 막혀 있어요)'); })(); break;
      case 6: (async () => { const r = await choose(['저장하지 않고 타이틀로', '취소'], { center: true, title: '타이틀 화면으로 돌아갈까요?' }); if (r === 0) { popUI(this); Game.toTitle(); } })(); break;
      case 7: popUI(this); break;
    }
  }
  draw() {
    drawStatusPanel(Game.player);
    const x = 472, w = 156;
    drawWindow(x, 12, w, this.items.length * 38 + 20);
    this.list.each((k, row, sel) => {
      const y = 22 + row * 38;
      if (sel) drawCursorBar(x + 8, y, w - 16, 34);
      text(this.items[k], x + 24, y + 8, { size: 18 });
    });
  }
}

// ── 아이템 ──
class ItemWindow {
  constructor() { this.tab = 0; this.list = new ListView(9); this.refresh(); }
  entries() {
    const p = Game.player, type = this.tab === 0 ? 'use' : 'etc';
    return Object.keys(p.inv).filter(id => ITEMS[id] && ITEMS[id].type === type);
  }
  refresh() { this.ids = this.entries(); this.list.set(this.ids.length); }
  update() {
    if (Input.pressed.left || Input.pressed.right) { this.tab = 1 - this.tab; this.list.i = 0; this.refresh(); Sound.sfx('cursor'); }
    this.list.handle();
    if (Input.pressed.cancel) { Sound.sfx('cancel'); popUI(this); return; }
    if (Input.pressed.ok && this.ids.length && this.tab === 0) {
      const id = this.ids[this.list.i];
      useItemField(id).then(() => this.refresh());
    }
  }
  draw() {
    const P = PANEL;
    drawWindow(P.x, P.y, P.w, P.h);
    ['소비', '기타'].forEach((t, i) => {
      const x = P.x + 16 + i * 92;
      ctx.save(); roundRect(x, P.y + 14, 84, 30, 6);
      ctx.fillStyle = this.tab === i ? UI.accent : 'rgba(255,255,255,0.08)'; ctx.fill(); ctx.restore();
      text(t, x + 42, P.y + 19, { size: 17, align: 'center' });
    });
    text('◀ ▶ 탭 전환', P.x + P.w - 18, P.y + 22, { size: 14, align: 'right', color: UI.dim });
    const y0 = P.y + 56;
    if (!this.ids.length) text('가방이 비어 있습니다.', P.x + 28, y0 + 10, { size: 17, color: UI.dim });
    this.list.each((k, row, sel) => {
      const id = this.ids[k], it = ITEMS[id], y = y0 + row * 34;
      if (sel) drawCursorBar(P.x + 12, y, P.w - 28, 32);
      drawItemIcon(id, P.x + 22, y + 2, 2);
      text(it.name, P.x + 60, y + 7, { size: 17 });
      text('× ' + Game.player.inv[id], P.x + P.w - 30, y + 8, { size: 16, align: 'right', color: UI.accent2 });
    });
    this.list.drawScroll(P.x + P.w - 12, y0, 9 * 34);
    const id = this.ids[this.list.i];
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(P.x + 16, P.y + 372, P.w - 32, 1);
    if (id) wrapText(ITEMS[id].desc, P.w - 48, 16).slice(0, 3).forEach((l, i) => text(l, P.x + 24, P.y + 384 + i * 22, { size: 16, color: UI.dim }));
  }
}

async function useItemField(id) {
  const p = Game.player, it = ITEMS[id];
  if (it.warp) {
    const r = await choose(['사용한다', '그만둔다'], { center: true, title: `${josa(MAPS[p.lastTown].name, '으로/로')} 돌아갈까요?` });
    if (r !== 0) return;
    removeItem(p, id);
    UIStack.length = 0;
    Sound.sfx('portal');
    Game.warpTo(p.lastTown, null, null, 'down');
    return;
  }
  if ((it.hp || it.hpPct) && p.hp >= p.mhp && !(it.mp || it.mpPct)) { Sound.sfx('buzz'); return; }
  if ((it.mp || it.mpPct) && p.mp >= p.mmp && !(it.hp || it.hpPct)) { Sound.sfx('buzz'); return; }
  applyItem(p, id);
  removeItem(p, id);
  Sound.sfx('heal');
}
function applyItem(p, id) {
  const it = ITEMS[id];
  const hp = (it.hp || 0) + Math.floor((it.hpPct || 0) * p.mhp), mp = (it.mp || 0) + Math.floor((it.mpPct || 0) * p.mmp);
  const h0 = p.hp, m0 = p.mp;
  p.hp = Math.min(p.mhp, p.hp + hp); p.mp = Math.min(p.mmp, p.mp + mp);
  return { hp: p.hp - h0, mp: p.mp - m0 };
}

// ── 장비 ──
const SLOT_NAMES = { weapon: '무기', hat: '모자', armor: '옷' };
class EquipWindow {
  constructor() { this.slots = ['weapon', 'hat', 'armor']; this.list = new ListView(3); this.list.set(3); }
  update() {
    this.list.handle();
    if (Input.pressed.cancel) { Sound.sfx('cancel'); popUI(this); return; }
    if (Input.pressed.ok) { Sound.sfx('ok'); this.pick(this.slots[this.list.i]); }
  }
  async pick(slot) {
    const p = Game.player;
    const owned = [...new Set(p.equips.filter(id => ITEMS[id].slot === slot))];
    const cur = p.equip[slot];
    const before = derived(p);
    const opts = owned.map(id => {
      const ok = canEquip(p, id);
      const it = ITEMS[id];
      const main = it.slot === 'weapon' ? (JOBS[p.job].magic ? `마력 ${it.matk || 0}` : `공격 ${it.atk || 0}`) : `방어 ${it.def || 0}`;
      return { label: `${it.name}${countItem(p, id) > 1 ? ' ×' + countItem(p, id) : ''}`, right: ok ? main : `Lv.${it.lv} / 착용 불가`, disabled: !ok };
    });
    if (cur) opts.push({ label: '장비 해제', right: ITEMS[cur].name });
    if (!opts.length) { await notice(`가지고 있는 ${josa(SLOT_NAMES[slot], '이/가')} 없습니다.`); return; }
    const r = await choose(opts, { x: 40, y: 150, title: `${SLOT_NAMES[slot]} 바꾸기`, rows: 7 });
    if (r < 0) return;
    if (r === owned.length) { addItem(p, cur); p.equip[slot] = null; }
    else {
      const id = owned[r];
      removeItem(p, id);
      if (cur) addItem(p, cur);
      p.equip[slot] = id;
    }
    const after = derived(p);
    const diff = JOBS[p.job].magic ? after.magic - before.magic : after.attack - before.attack;
    const dd = after.defense - before.defense;
    Sound.sfx('ok');
    if (diff || dd) toast(`${diff ? (JOBS[p.job].magic ? '마력 ' : '공격력 ') + (diff > 0 ? '+' : '') + diff + '  ' : ''}${dd ? '방어력 ' + (dd > 0 ? '+' : '') + dd : ''}`, UI.good);
  }
  draw() {
    const P = PANEL, p = Game.player;
    drawWindow(P.x, P.y, P.w, P.h);
    text('장비', P.x + 24, P.y + 18, { size: 22, color: UI.accent2 });
    const img = charSprite(playerLook(p), 'down', 0);
    blit(img, P.x + P.w - 120, P.y + 40, 4);
    this.slots.forEach((s, i) => {
      const y = P.y + 64 + i * 64;
      if (this.list.i === i) drawCursorBar(P.x + 14, y, 280, 56);
      text(SLOT_NAMES[s], P.x + 28, y + 6, { size: 15, color: UI.dim });
      const id = p.equip[s];
      if (id) { drawItemIcon(id, P.x + 28, y + 26, 2); text(ITEMS[id].name, P.x + 62, y + 28, { size: 18 }); }
      else text('(없음)', P.x + 28, y + 28, { size: 18, color: UI.dim });
    });
    const id = p.equip[this.slots[this.list.i]];
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(P.x + 16, P.y + 270, P.w - 32, 1);
    if (id) {
      const it = ITEMS[id];
      const parts = [];
      if (it.atk) parts.push(`공격력 +${it.atk}`); if (it.matk) parts.push(`마력 +${it.matk}`); if (it.def) parts.push(`방어력 +${it.def}`);
      for (const k of ['str', 'dex', 'int', 'luk']) if (it[k]) parts.push(`${STAT_NAMES[k]} +${it[k]}`);
      text(it.name, P.x + 24, P.y + 284, { size: 18 });
      text(parts.join('  '), P.x + 24, P.y + 312, { size: 16, color: UI.good });
      wrapText(it.desc, P.w - 48, 16).forEach((l, i) => text(l, P.x + 24, P.y + 340 + i * 22, { size: 16, color: UI.dim }));
    }
    text('확인: 장비 바꾸기', P.x + 24, P.y + P.h - 34, { size: 14, color: UI.dim });
  }
}

// ── 스탯 ──
class StatWindow {
  constructor() { this.keys = ['str', 'dex', 'int', 'luk', 'auto']; this.list = new ListView(5); this.list.set(5); }
  update() {
    const p = Game.player;
    this.list.handle();
    if (Input.pressed.cancel) { Sound.sfx('cancel'); popUI(this); return; }
    if (Input.pressed.ok) {
      const k = this.keys[this.list.i];
      if (k === 'auto') { p.autoAP = !p.autoAP; if (p.autoAP) autoAssign(p); Sound.sfx('ok'); }
      else if (p.ap > 0) { p[k]++; p.ap--; Sound.sfx('ok'); }
      else Sound.sfx('buzz');
    }
  }
  draw() {
    const P = PANEL, p = Game.player, d = derived(p), J = JOBS[p.job];
    drawWindow(P.x, P.y, P.w, P.h);
    text('능력치', P.x + 24, P.y + 18, { size: 22, color: UI.accent2 });
    text(`남은 AP  ${p.ap}`, P.x + P.w - 24, P.y + 22, { size: 18, align: 'right', color: p.ap ? UI.accent : UI.text });
    this.keys.forEach((k, i) => {
      const y = P.y + 60 + i * 42;
      if (this.list.i === i) drawCursorBar(P.x + 14, y, P.w - 28, 36);
      if (k === 'auto') { text(`AP 자동 배분: ${p.autoAP ? '켜짐' : '꺼짐'}`, P.x + 30, y + 8, { size: 18, color: p.autoAP ? UI.good : UI.text }); return; }
      const bonus = d[k] - p[k];
      const tag = k === J.main ? ' (주 능력치)' : k === J.sub ? ' (보조)' : '';
      text(STAT_NAMES[k] + tag, P.x + 30, y + 8, { size: 18, color: k === J.main ? UI.accent2 : UI.text });
      text(`${p[k]}${bonus ? ' (+' + bonus + ')' : ''}`, P.x + P.w - 40, y + 8, { size: 18, align: 'right' });
    });
    const Y = P.y + 290;
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(P.x + 16, Y - 10, P.w - 32, 1);
    statLine('공격력', d.attack, P.x + 28, Y); statLine('마력', d.magic, P.x + 28, Y + 28);
    statLine('방어력', d.defense, P.x + 28, Y + 56);
    statLine('크리티컬', Math.round(d.crit * 100) + '%', P.x + 240, Y); statLine('회피율', Math.round(d.eva * 100) + '%', P.x + 240, Y + 28);
    statLine('최대 HP', p.mhp, P.x + 240, Y + 56);
    wrapText(p.autoAP ? '레벨업할 때 AP가 직업에 맞게 자동으로 배분됩니다.' : '확인 버튼으로 AP를 원하는 능력치에 1씩 올리세요.', P.w - 48, 15)
      .forEach((l, i) => text(l, P.x + 24, P.y + P.h - 54 + i * 20, { size: 15, color: UI.dim }));
  }
}

// ── 스킬 ──
class SkillWindow {
  constructor() {
    const p = Game.player;
    this.ids = Object.keys(SKILLS).filter(id => SKILLS[id].job === 'beginner' || SKILLS[id].job === p.job);
    this.list = new ListView(8); this.list.set(this.ids.length);
  }
  update() {
    this.list.handle();
    if (Input.pressed.cancel) { Sound.sfx('cancel'); popUI(this); return; }
    if (Input.pressed.ok) {
      const p = Game.player, s = SKILLS[this.ids[this.list.i]];
      if (s.kind === 'heal' && s.lv <= p.level && p.mp >= s.mp && p.hp < p.mhp) {
        p.mp -= s.mp; p.hp = Math.min(p.mhp, p.hp + Math.floor(p.mhp * s.power)); Sound.sfx('heal');
      } else Sound.sfx('buzz');
    }
  }
  draw() {
    const P = PANEL, p = Game.player;
    drawWindow(P.x, P.y, P.w, P.h);
    text('스킬', P.x + 24, P.y + 18, { size: 22, color: UI.accent2 });
    text(`MP ${p.mp} / ${p.mmp}`, P.x + P.w - 24, P.y + 22, { size: 16, align: 'right', color: '#9cc4ff' });
    this.list.each((k, row, sel) => {
      const s = SKILLS[this.ids[k]], y = P.y + 58 + row * 36, ok = s.lv <= p.level;
      if (sel) drawCursorBar(P.x + 14, y, P.w - 28, 32);
      text(s.name, P.x + 30, y + 7, { size: 17, color: ok ? UI.text : '#7d86a8' });
      text(ok ? `MP ${s.mp}` : `Lv.${s.lv}에 배움`, P.x + P.w - 30, y + 8, { size: 15, align: 'right', color: ok ? '#9cc4ff' : '#7d86a8' });
    });
    const s = SKILLS[this.ids[this.list.i]];
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(P.x + 16, P.y + 360, P.w - 32, 1);
    wrapText(s.desc + (s.kind === 'heal' ? ' (필드에서도 확인 버튼으로 사용 가능)' : ''), P.w - 48, 16).slice(0, 3).forEach((l, i) => text(l, P.x + 24, P.y + 374 + i * 22, { size: 16, color: UI.dim }));
    if (p.job === 'beginner') text('레벨 10이 되면 각 마을의 교관에게 전직할 수 있습니다.', P.x + 24, P.y + P.h - 30, { size: 14, color: UI.accent2 });
  }
}

// ── 퀘스트 ──
class QuestWindow {
  constructor() { this.list = new ListView(10); }
  update() {
    if (Input.pressed.cancel || Input.pressed.ok) { Sound.sfx('cancel'); popUI(this); return; }
    this.list.handle();
  }
  draw() {
    const P = PANEL, p = Game.player;
    drawWindow(P.x, P.y, P.w, P.h);
    text('퀘스트', P.x + 24, P.y + 18, { size: 22, color: UI.accent2 });
    const ids = Object.keys(p.quests);
    this.list.set(ids.length);
    if (!ids.length) { text('진행 중인 퀘스트가 없습니다.\n마을 사람들에게 말을 걸어 보세요.', P.x + 28, P.y + 70, { size: 17, color: UI.dim }); return; }
    // 진행 중 먼저
    ids.sort((a, b) => (p.quests[a].state === 'done') - (p.quests[b].state === 'done'));
    this.list.each((k, row) => {
      const id = ids[k], q = QUESTS[id], st = p.quests[id], y = P.y + 58 + row * 38;
      const done = st.state === 'done';
      text((done ? '✔ ' : '● ') + q.name, P.x + 26, y, { size: 17, color: done ? UI.dim : UI.text });
      text(done ? '완료' : questProgress(p, id), P.x + P.w - 26, y + 1, { size: 15, align: 'right', color: done ? UI.dim : questReady(p, id) ? UI.good : UI.accent2 });
      if (!done) text(`${q.giver} · ${q.where}`, P.x + 44, y + 20, { size: 13, color: UI.dim });
    });
  }
}

// ───────────────────────── 상점 ─────────────────────────
function sellPrice(id) { const it = ITEMS[id]; return it.type === 'etc' ? it.price : Math.floor(it.price * 0.4); }

class ShopWindow {
  constructor(npc, stock, resolve) {
    this.npc = npc; this.stock = stock; this.resolve = resolve;
    this.tab = 0; this.list = new ListView(8); this.refresh();
  }
  sellables() {
    const p = Game.player;
    const out = Object.keys(p.inv).filter(id => ITEMS[id].price > 0);
    for (const id of new Set(p.equips)) if (ITEMS[id].price > 0) out.push(id);
    return out;
  }
  refresh() { this.ids = this.tab === 0 ? this.stock : this.sellables(); this.list.set(this.ids.length); }
  update() {
    if (Input.pressed.left || Input.pressed.right) { this.tab = 1 - this.tab; this.list.i = 0; this.refresh(); Sound.sfx('cursor'); }
    this.list.handle();
    if (Input.pressed.cancel) { Sound.sfx('cancel'); popUI(this); this.resolve(); return; }
    if (Input.pressed.ok && this.ids.length) { Sound.sfx('ok'); this.deal(this.ids[this.list.i]); }
  }
  async deal(id) {
    const p = Game.player, it = ITEMS[id];
    if (this.tab === 0) {
      const max = it.type === 'equip' ? 1 : Math.min(100, Math.floor(p.meso / it.price));
      if (max < 1) { Sound.sfx('buzz'); toast('메소가 부족합니다.', UI.bad); return; }
      const n = await pickQuantity(`${it.name} 몇 개 살까요?`, max, it.price);
      if (n <= 0) return;
      p.meso -= it.price * n; addItem(p, id, n);
      Sound.sfx('coin'); toast(`${it.name} ${n}개 구입`, UI.text, it.icon);
    } else {
      const have = countItem(p, id), price = sellPrice(id);
      const n = await pickQuantity(`${it.name} 몇 개 팔까요?`, have, price);
      if (n <= 0) return;
      removeItem(p, id, n); p.meso += price * n;
      Sound.sfx('coin'); toast(`${it.name} ${n}개 판매 (+${fmt(price * n)} 메소)`, '#ffe27a');
    }
    this.refresh();
  }
  draw() {
    const p = Game.player, X = 12, Y = 12, Wd = 616, Hd = 456;
    drawWindow(X, Y, Wd, Hd);
    text(this.npc.name + '의 상점', X + 24, Y + 18, { size: 22, color: UI.accent2 });
    ['구매', '판매'].forEach((t, i) => {
      const x = X + 230 + i * 92;
      ctx.save(); roundRect(x, Y + 14, 84, 30, 6);
      ctx.fillStyle = this.tab === i ? UI.accent : 'rgba(255,255,255,0.08)'; ctx.fill(); ctx.restore();
      text(t, x + 42, Y + 19, { size: 17, align: 'center' });
    });
    blit(iconSprite('coin'), X + Wd - 190, Y + 18, 2);
    text(`${fmt(p.meso)} 메소`, X + Wd - 24, Y + 20, { size: 18, align: 'right', color: '#ffe27a' });
    const y0 = Y + 58;
    if (!this.ids.length) text(this.tab ? '팔 수 있는 물건이 없습니다.' : '', X + 30, y0 + 10, { size: 17, color: UI.dim });
    this.list.each((k, row, sel) => {
      const id = this.ids[k], it = ITEMS[id], y = y0 + row * 36;
      if (sel) drawCursorBar(X + 12, y, Wd - 28, 32);
      drawItemIcon(id, X + 24, y + 3, 2);
      const can = it.type !== 'equip' || canEquip(p, id) || this.tab === 1;
      text(it.name, X + 62, y + 7, { size: 17, color: can ? UI.text : '#9aa0b8' });
      if (it.type === 'equip' && this.tab === 0) {
        const tag = it.jobs ? it.jobs.map(j => JOBS[j].name).join('/') : '공용';
        text(`Lv.${it.lv} ${tag}`, X + 300, y + 9, { size: 14, color: can ? UI.dim : UI.bad });
      }
      if (this.tab === 1) text(`보유 ${countItem(p, id)}`, X + 330, y + 9, { size: 14, color: UI.dim });
      text(`${fmt(this.tab === 0 ? it.price : sellPrice(id))} 메소`, X + Wd - 30, y + 8, { size: 16, align: 'right', color: '#ffe27a' });
    });
    this.list.drawScroll(X + Wd - 12, y0, 8 * 36);
    const id = this.ids[this.list.i];
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(X + 16, Y + 360, Wd - 32, 1);
    if (id) {
      const it = ITEMS[id];
      const parts = [];
      if (it.atk) parts.push(`공격력 ${it.atk}`); if (it.matk) parts.push(`마력 ${it.matk}`); if (it.def) parts.push(`방어력 ${it.def}`);
      for (const k of ['str', 'dex', 'int', 'luk']) if (it[k]) parts.push(`${STAT_NAMES[k]} +${it[k]}`);
      if (parts.length) text(parts.join('   '), X + 24, Y + 372, { size: 16, color: UI.good });
      wrapText(it.desc, Wd - 48, 16).slice(0, 2).forEach((l, i) => text(l, X + 24, Y + (parts.length ? 398 : 374) + i * 22, { size: 16, color: UI.dim }));
    }
    text('◀ ▶ 구매/판매 전환   취소: 나가기', X + Wd - 24, Y + Hd - 28, { size: 14, align: 'right', color: UI.dim });
  }
}
function openShop(npc, stock) { return new Promise(res => pushUI(new ShopWindow(npc, stock, res))); }

class QuantityBox {
  constructor(title, max, unit, resolve) { this.title = title; this.max = max; this.unit = unit; this.n = 1; this.resolve = resolve; }
  update() {
    if (Input.rep('right')) { this.n = Math.min(this.max, this.n + 1); Sound.sfx('cursor'); }
    if (Input.rep('left')) { this.n = Math.max(1, this.n - 1); Sound.sfx('cursor'); }
    if (Input.rep('up')) { this.n = Math.min(this.max, this.n + 10); Sound.sfx('cursor'); }
    if (Input.rep('down')) { this.n = Math.max(1, this.n - 10); Sound.sfx('cursor'); }
    if (Input.pressed.ok) { Sound.sfx('ok'); popUI(this); this.resolve(this.n); }
    if (Input.pressed.cancel) { Sound.sfx('cancel'); popUI(this); this.resolve(0); }
  }
  draw() {
    const w = 340, h = 136, x = (W - w) / 2, y = (H - h) / 2;
    drawWindow(x, y, w, h, { border: UI.accent2 });
    text(this.title, x + w / 2, y + 16, { size: 17, align: 'center' });
    text(`◀  ${this.n}  ▶`, x + w / 2, y + 48, { size: 26, align: 'center', color: '#ffffff' });
    text(`합계 ${fmt(this.n * this.unit)} 메소`, x + w / 2, y + 86, { size: 16, align: 'center', color: '#ffe27a' });
    text('▲▼ 10개씩', x + w - 14, y + h - 22, { size: 12, align: 'right', color: UI.dim });
  }
}
function pickQuantity(title, max, unit) {
  if (max <= 1) return choose([`${max === 1 ? '1개' : ''} 확인`, '취소'], { center: true, title }).then(r => (r === 0 && max === 1 ? 1 : 0));
  return new Promise(res => pushUI(new QuantityBox(title, max, unit, res)));
}
