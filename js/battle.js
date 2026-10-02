'use strict';
// ───────────────────────── 전투 ─────────────────────────
const HERO_X = 500;

const Battle = {
  enemies: [], fx: [], nums: [], log: '', theme: 'field', boss: false,
  hero: null, shake: 0, levelFx: 0, t: 0, targetCursor: -1, gained: null,

  setup(kinds, opts, theme) {
    this.theme = theme; this.boss = !!opts.boss; this.t = 0;
    this.fx = []; this.nums = []; this.log = ''; this.shake = 0; this.levelFx = 0; this.targetCursor = -1;
    this.hero = { x: HERO_X, y: GROUND_Y, ox: 0, oy: 0, flash: 0, swing: 0, buffs: {}, poison: 0, stun: 0, frame: 0 };
    this.enemies = [];
    kinds.forEach(k => this.addEnemy(k));
    this.layout(true);
    this.gained = { exp: 0, meso: 0, items: {} };
    this.lastCmd = 0;
  },
  addEnemy(kind) {
    const d = MONSTERS[kind];
    const e = { kind, d, hp: d.hp, mhp: d.hp, x: -100, y: GROUND_Y, ox: 0, oy: 0, flash: 0, alpha: 1, dead: false, stun: 0, showHp: 0, phase: Math.random() * 6 };
    this.enemies.push(e);
    return e;
  },
  alive() { return this.enemies.filter(e => !e.dead); },
  layout(snap) {
    const list = this.enemies;
    const n = list.length;
    const left = 70, right = 360;
    list.forEach((e, i) => {
      e.tx = n === 1 ? 210 : left + (right - left) * (i / (n - 1));
      if (snap) e.x = e.tx;
    });
  },
  say(msg) { this.log = msg; },
  num(x, y, value, kind) { this.nums.push({ x, y, text: String(value), kind, t: 0 }); },
  addFx(f) { f.t = 0; this.fx.push(f); return wait(f.dur); },

  // ───── 흐름 ─────
  async run(kinds, opts) {
    const p = Game.player;
    this.setup(kinds, opts, Field.map.theme);
    Sound.bgm(this.boss ? 'boss' : 'battle');
    const names = [...new Set(kinds.map(k => MONSTERS[k].name))].join(', ');
    this.say(`${josa(names + (kinds.length > 1 ? ' 무리' : ''), '이/가')} 나타났다!`);
    await wait(40);
    let result = null;
    while (!result) {
      // 플레이어 차례
      if (this.hero.stun > 0) {
        this.hero.stun--;
        this.say(`${josa(p.name, '은/는')} 몸이 굳어 움직일 수 없다!`);
        await wait(50);
      } else {
        const act = await this.command();
        if (act.type === 'escape') {
          if (this.boss) { this.say('보스에게서는 도망칠 수 없다!'); Sound.sfx('buzz'); await wait(50); }
          else {
            const avg = this.alive().reduce((a, e) => a + e.d.lv, 0) / this.alive().length;
            if (chance(clamp(0.65 + (p.level - avg) * 0.05, 0.35, 0.95))) {
              this.say('무사히 도망쳤다!'); Sound.sfx('cancel');
              this.hero.ox = 0;
              for (let i = 0; i < 20; i++) { this.hero.ox += 6; await wait(1); }
              result = 'escape'; break;
            }
            this.say('도망치지 못했다!'); Sound.sfx('buzz'); await wait(45);
          }
        } else await this.execute(act);
      }
      if (!this.alive().length) { result = 'win'; break; }
      // 적 차례
      for (const e of this.enemies.slice()) {
        if (e.dead) continue;
        if (e.stun > 0) { e.stun--; this.say(`${josa(e.d.name, '은/는')} 기절해 있다!`); await wait(36); continue; }
        await this.enemyAct(e);
        if (p.hp <= 0) break;
      }
      if (p.hp <= 0) { result = 'lose'; break; }
      await this.endTurn();
      if (p.hp <= 0) { result = 'lose'; break; }
    }
    if (result === 'win') await this.victory();
    if (result === 'lose') await this.defeat();
    return result;
  },

  // 명령 선택
  async command() {
    const p = Game.player;
    while (true) {
      this.say(`${josa(p.name, '은/는')} 무엇을 할까?`);
      const c = await new Promise(res => pushUI(new BattleCommand(res)));
      if (c === 0) {
        const t = await this.pickTarget();
        if (t) return { type: 'attack', target: t };
      } else if (c === 1) {
        const ids = knownSkills(p);
        const r = await choose(ids.map(id => ({ label: SKILLS[id].name, right: `MP ${SKILLS[id].mp}`, disabled: p.mp < SKILLS[id].mp, desc: SKILLS[id].desc })), { x: 200, bottom: 330, w: 380, title: '스킬', rows: 5 });
        if (r < 0) continue;
        const s = SKILLS[ids[r]];
        let target = null;
        if (s.target === 'one') { target = await this.pickTarget(); if (!target) continue; }
        return { type: 'skill', id: ids[r], target };
      } else if (c === 2) {
        const ids = Object.keys(p.inv).filter(id => ITEMS[id].type === 'use' && !ITEMS[id].field);
        if (!ids.length) { this.say('사용할 수 있는 아이템이 없다!'); Sound.sfx('buzz'); await wait(40); continue; }
        const r = await choose(ids.map(id => ({ label: ITEMS[id].name, right: '× ' + p.inv[id], desc: ITEMS[id].desc })), { x: 200, bottom: 330, w: 380, title: '아이템', rows: 5 });
        if (r < 0) continue;
        return { type: 'item', id: ids[r] };
      } else if (c === 3) return { type: 'escape' };
    }
  },
  pickTarget() {
    const al = this.alive();
    if (al.length === 1) return Promise.resolve(al[0]);
    return new Promise(res => pushUI(new TargetSelect(res)));
  },

  // 데미지 계산
  heroStats() {
    const d = derived(Game.player), b = this.hero.buffs;
    return {
      ...d,
      attack: Math.floor(d.attack * (b.atk ? b.atk.v : 1)),
      magic: d.magic,
      defense: Math.floor(d.defense * (b.def ? b.def.v : 1)),
      crit: d.crit + (b.crit ? b.crit.v : 0),
      eva: d.eva + (b.eva ? b.eva.v : 0)
    };
  },
  calc(e, s) {
    const p = Game.player, d = this.heroStats();
    const kind = s ? s.kind : 'phys', mult = s ? s.mult || 1 : 1;
    if (kind === 'fixed') return { dmg: s.power + p.level * 3 + rand(-3, 3), crit: false };
    if (kind !== 'magic' && !chance(clamp(d.acc - (e.d.lv - p.level) * 0.03, 0.55, 1))) return { miss: true };
    const base = kind === 'magic' ? d.magic : d.attack;
    let dmg = base * mult * randf(0.85, 1.15) - e.d.def * (kind === 'magic' ? 0.3 : 0.5);
    const crit = chance(d.crit);
    if (crit) dmg *= 1.6;
    return { dmg: Math.max(1, Math.round(dmg)), crit };
  },

  async hitEnemy(e, s, hitIndex = 0) {
    if (e.dead) return;
    const r = this.calc(e, s);
    const top = e.y - this.spriteH(e) - 10 - hitIndex * 28;
    if (r.miss) { this.num(e.x, top, 'MISS', 'hurt'); Sound.sfx('miss'); return; }
    e.hp -= r.dmg; e.flash = 8; e.showHp = 180; e.ox = -8;
    this.num(e.x + rand(-6, 6), top, r.dmg, r.crit ? 'crit' : 'normal');
    Sound.sfx(r.crit ? 'crit' : 'hit');
    if (s && s.stun && chance(s.stun)) e.stun = 1;
    if (e.hp <= 0) { e.hp = 0; await this.killEnemy(e); }
  },
  spriteH(e) { return monsterSprite(e.kind).height * e.d.scale; },

  async killEnemy(e) {
    e.dead = true;
    const p = Game.player;
    p.kills[e.kind] = (p.kills[e.kind] || 0) + 1;
    this.gained.exp += e.d.exp;
    this.gained.meso += rand(e.d.meso[0], e.d.meso[1]);
    for (const [id, pr] of e.d.drops) if (chance(pr)) this.gained.items[id] = (this.gained.items[id] || 0) + 1;
    this.num(e.x, e.y - this.spriteH(e) - 46, `+${e.d.exp} EXP`, 'heal');
  },

  // 행동 실행
  async execute(act) {
    const p = Game.player, h = this.hero;
    if (act.type === 'item') {
      const it = ITEMS[act.id];
      removeItem(p, act.id);
      this.say(`${josa(it.name, '을/를')} 사용했다!`);
      const r = applyItem(p, act.id);
      Sound.sfx('heal');
      this.addFx({ type: 'aura', x: h.x, y: h.y, dur: 40, color: 'rgba(120,255,140,0.6)' });
      if (r.hp) this.num(h.x, h.y - 110, '+' + r.hp, 'heal');
      if (r.mp) this.num(h.x, h.y - 80, '+' + r.mp, 'mp');
      await wait(45);
      return;
    }
    const s = act.type === 'skill' ? SKILLS[act.id] : null;
    if (s) { p.mp -= s.mp; this.say(`${p.name}의 ${s.name}!`); }
    else this.say(`${p.name}의 공격!`);

    if (s && s.kind === 'heal') {
      const amt = Math.min(p.mhp - p.hp, Math.floor(p.mhp * s.power));
      p.hp += amt; Sound.sfx('heal');
      this.addFx({ type: 'aura', x: h.x, y: h.y, dur: 40, color: 'rgba(120,255,140,0.6)' });
      this.num(h.x, h.y - 110, '+' + amt, 'heal');
      await wait(45); return;
    }
    if (s && s.kind === 'buff') {
      for (const k in s.buff) h.buffs[k] = { v: s.buff[k], turns: s.turns };
      Sound.sfx('buff');
      await this.addFx({ type: 'aura', x: h.x, y: h.y, dur: 44 });
      this.say(`${s.name}의 힘이 몸을 감싼다! (${s.turns}턴)`);
      await wait(30); return;
    }

    const targets = s && s.target === 'all' ? this.alive() : [act.target];
    const hits = s ? s.hits || 1 : 1;
    const wt = ITEMS[p.equip.weapon] ? ITEMS[p.equip.weapon].wtype : 'none';
    const fx = s ? s.fx : wt === 'bow' ? 'arrow' : wt === 'claw' ? 'star' : (wt === 'wand' || wt === 'staff') ? 'orb' : 'melee';
    const melee = fx === 'melee' || fx === 'slash';

    if (melee) {
      const tgt = targets.length === 1 ? targets[0] : null;
      const dest = tgt ? tgt.x + 80 : 300;
      await this.moveHero(dest - h.x, 10);
      for (let i = 0; i < hits; i++) {
        h.swing = 12;
        for (const e of targets) { this.addFx({ type: 'slash', x: e.x, y: e.y - this.spriteH(e) / 2, dur: 16, color: s ? '#bfe8ff' : '#ffffff' }); }
        await wait(5);
        for (const e of targets) await this.hitEnemy(e, s, i);
        await wait(hits > 2 ? 7 : 12);
      }
      await wait(10);
      await this.moveHero(0, 10);
    } else if (fx === 'wave') {
      h.swing = 12;
      await this.addFx({ type: 'wave', x: h.x - 40, tx: 40, y: GROUND_Y - 50, dur: 22 });
      for (const e of targets) await this.hitEnemy(e, s);
      await wait(20);
    } else if (fx === 'thunder') {
      for (const e of targets) this.addFx({ type: 'thunder', x: e.x, y: e.y - 20, dur: 24, seed: rand(1, 999) });
      Sound.sfx('magic'); this.shake = 10;
      await wait(10);
      for (const e of targets) await this.hitEnemy(e, s);
      await wait(24);
    } else if (fx === 'claw') {
      for (let i = 0; i < hits; i++) {
        const e = targets[0];
        Sound.sfx('magic');
        this.addFx({ type: 'claw', x: e.x + i * 10, y: e.y - this.spriteH(e) / 2, dur: 18 });
        await wait(8); await this.hitEnemy(e, s, i); await wait(10);
      }
      await wait(14);
    } else if (fx === 'bomb') {
      h.swing = 10;
      for (const e of targets) this.addFx({ type: 'proj', img: 'arrow', x: h.x - 30, y: h.y - 50, tx: e.x, ty: e.y - 30, dur: 14, arc: 40 });
      await wait(14);
      Sound.sfx('boom'); this.shake = 8;
      for (const e of targets) this.addFx({ type: 'boom', x: e.x, y: e.y - 30, dur: 24 });
      for (const e of targets) await this.hitEnemy(e, s);
      await wait(24);
    } else {
      // 원거리: 화살 / 표창 / 마법 구체 / 달팽이 껍질
      const img = fx === 'arrow' ? 'arrow' : fx === 'star' ? 'star' : fx === 'shell' ? 'shell' : 'orb';
      for (let i = 0; i < hits; i++) {
        for (const e of targets) {
          h.swing = 8;
          if (img === 'orb') Sound.sfx('magic'); else Sound.sfx('cursor');
          this.addFx({ type: 'proj', img, x: h.x - 30, y: h.y - 50, tx: e.x, ty: e.y - this.spriteH(e) / 2, dur: 14, arc: img === 'shell' ? 50 : 6, color: fx === 'bolt' ? '#c88aff' : '#8ad8ff', r: fx === 'bolt' ? 20 : 12 });
        }
        await wait(14);
        for (const e of targets) { this.addFx({ type: 'burst', x: e.x, y: e.y - this.spriteH(e) / 2, dur: 16, color: img === 'orb' ? '#bfe8ff' : '#ffe08a', r: 36, seed: i }); await this.hitEnemy(e, s, i); }
        await wait(6);
      }
      await wait(20);
    }
    await this.cleanupDead();
  },
  async moveHero(ox, frames) {
    const h = this.hero, from = h.ox;
    for (let i = 1; i <= frames; i++) { h.ox = from + (ox - from) * (i / frames); h.frame = i % 6 < 3 ? 1 : 2; await wait(1); }
    h.frame = 0;
  },
  async cleanupDead() {
    if (!this.enemies.some(e => e.dead && e.alpha > 0)) return;
    for (let i = 0; i < 20; i++) { for (const e of this.enemies) if (e.dead) e.alpha = Math.max(0, e.alpha - 0.05); await wait(1); }
  },

  // 적의 행동
  async enemyAct(e) {
    const p = Game.player, d = e.d;
    let move = null;
    if (d.moves) {
      const tot = d.moves.reduce((a, m) => a + m.w, 0);
      let r = Math.random() * tot;
      for (const m of d.moves) { r -= m.w; if (r <= 0) { move = m; break; } }
      if (move.summon && this.alive().length >= 3) move = null;
      if (move && move.heal && e.hp > e.mhp * 0.7) move = null;
    }
    if (move && move.summon) {
      this.say(move.msg);
      const ne = this.addEnemy(move.summon);
      this.enemies.splice(this.enemies.indexOf(ne), 1);
      this.enemies.unshift(ne);
      this.layout(false); ne.x = ne.tx; ne.alpha = 0;
      for (let i = 0; i < 15; i++) { ne.alpha = i / 14; await wait(1); }
      await wait(30); return;
    }
    if (move && move.heal) {
      this.say(move.msg);
      this.addFx({ type: 'dark', dur: 40 });
      const amt = Math.floor(e.mhp * move.heal);
      e.hp = Math.min(e.mhp, e.hp + amt); e.showHp = 120;
      this.num(e.x, e.y - this.spriteH(e) - 10, '+' + amt, 'heal');
      Sound.sfx('heal'); await wait(50); return;
    }
    this.say(move ? move.msg : `${d.name}의 공격!`);
    // 앞으로 튀어나오기
    for (let i = 0; i < 8; i++) { e.ox += 5; e.oy = -Math.sin(i / 7 * Math.PI) * 18; await wait(1); }
    if (move && move.fx === 'quake') { this.shake = 18; Sound.sfx('boom'); }
    if (move && move.fx === 'spore') { Sound.sfx('magic'); await this.addFx({ type: 'spore', x: e.x, tx: this.hero.x, y: GROUND_Y - 60, dur: 24 }); }
    if (move && move.fx === 'fire') { Sound.sfx('boom'); await this.addFx({ type: 'fire', x: e.x + 40, y: e.y - 120, tx: this.hero.x, ty: this.hero.y - 50, dur: 30 }); }
    const hits = move ? move.hits || 1 : 1;
    for (let i = 0; i < hits; i++) {
      if (move && move.fx === 'claw') this.addFx({ type: 'claw', x: this.hero.x, y: this.hero.y - 50, dur: 14, color: '#ff5a7a' });
      this.hurtHero(e, move ? move.mult : 1, i);
      await wait(hits > 1 ? 12 : 4);
    }
    if (move && move.poison && !this.hero.poison) { this.hero.poison = move.poison; this.num(this.hero.x, this.hero.y - 150, '중독!', 'hurt'); }
    if (move && move.stun && chance(move.stun)) { this.hero.stun = 1; this.num(this.hero.x, this.hero.y - 150, '기절!', 'hurt'); }
    for (let i = 0; i < 8; i++) { e.ox -= 5; e.oy = 0; await wait(1); }
    e.ox = 0;
    await wait(18);
  },
  hurtHero(e, mult, idx) {
    const p = Game.player, h = this.hero, d = this.heroStats();
    if (chance(d.eva)) { this.num(h.x, h.y - 110 - idx * 26, 'MISS', 'normal'); Sound.sfx('miss'); h.ox = 10; setTimeout(() => { h.ox = 0; }, 120); return; }
    const raw = e.d.atk * mult * randf(0.85, 1.15);
    let dmg = Math.max(raw * 0.1, raw - d.defense * (e.d.magic ? 0.2 : 0.35));
    dmg = Math.max(1, Math.round(dmg));
    if (h.buffs.guard && p.mp > 0) {
      const toMp = Math.min(p.mp, Math.floor(dmg * h.buffs.guard.v));
      p.mp -= toMp; dmg -= toMp;
      if (toMp) this.num(h.x + 30, h.y - 90 - idx * 26, toMp, 'mp');
    }
    p.hp = Math.max(0, p.hp - dmg);
    h.flash = 8; this.shake = Math.max(this.shake, 5);
    this.num(h.x, h.y - 110 - idx * 26, dmg, 'hurt');
    Sound.sfx('hurt');
  },
  async endTurn() {
    const p = Game.player, h = this.hero;
    if (h.poison > 0) {
      const dmg = Math.max(1, Math.floor(p.mhp * 0.05));
      p.hp = Math.max(0, p.hp - dmg); h.poison--;
      this.say('독이 퍼져 HP가 줄었다!');
      this.num(h.x, h.y - 110, dmg, 'hurt'); h.flash = 6;
      await wait(36);
    }
    for (const k of Object.keys(h.buffs)) {
      if (--h.buffs[k].turns <= 0) delete h.buffs[k];
    }
  },

  async victory() {
    const p = Game.player, g = this.gained;
    Sound.bgm('victory');
    Sound.sfx('win');
    this.say('전투에서 승리했다!');
    await wait(40);
    p.meso += g.meso;
    const lines = [`경험치 +${fmt(g.exp)}   메소 +${fmt(g.meso)}`];
    const got = Object.keys(g.items);
    for (const id of got) addItem(p, id, g.items[id]);
    if (got.length) lines.push('획득: ' + got.map(id => `${ITEMS[id].name}${g.items[id] > 1 ? ' ×' + g.items[id] : ''}`).join(', '));
    const before = p.level;
    const ups = gainExp(p, g.exp);
    await notice(lines.join('\n'));
    if (ups) {
      this.levelFx = 100;
      Sound.sfx('levelup');
      await wait(30);
      const newSkills = knownSkills(p).filter(id => SKILLS[id].lv > before && SKILLS[id].lv <= p.level).map(id => SKILLS[id].name);
      let msg = `레벨 업! 레벨 ${p.level}이 되었습니다.\nHP와 MP가 모두 회복되었습니다.${p.autoAP ? '' : ` (남은 AP ${p.ap} — 메뉴 → 스탯에서 배분하세요)`}`;
      if (newSkills.length) msg += `\n새 스킬: ${newSkills.join(', ')}`;
      if (p.level === 10 && p.job === 'beginner') msg += '\n이제 전직할 수 있습니다! 빅토리아 아일랜드의 교관을 찾아가세요.';
      await notice(msg);
    }
    // 퀘스트 완료 알림
    for (const id in p.quests) if (p.quests[id].state === 'active' && questReady(p, id) && !p.quests[id].told) {
      p.quests[id].told = true;
      toast(`퀘스트 조건 달성: ${QUESTS[id].name}`, UI.good);
    }
  },
  async defeat() {
    this.say(`${josa(Game.player.name, '은/는')} 쓰러지고 말았다…`);
    Sound.stopBgm(); Sound.sfx('die');
    await wait(80);
  },

  // ───── 업데이트 · 그리기 ─────
  update() {
    this.t++;
    if (this.shake > 0) this.shake--;
    if (this.levelFx > 0) this.levelFx--;
    const h = this.hero;
    if (h.flash > 0) h.flash--;
    if (h.swing > 0) h.swing--;
    for (const e of this.enemies) {
      if (e.flash > 0) e.flash--;
      if (e.showHp > 0) e.showHp--;
      e.x += (e.tx - e.x) * 0.15;
      if (e.ox < 0) e.ox = Math.min(0, e.ox + 1);
    }
    // 완전히 사라진 적 정리
    if (this.enemies.some(e => e.dead && e.alpha <= 0)) {
      this.enemies = this.enemies.filter(e => !(e.dead && e.alpha <= 0));
      this.layout(false);
    }
    for (let i = this.fx.length - 1; i >= 0; i--) if (++this.fx[i].t >= this.fx[i].dur) this.fx.splice(i, 1);
    for (let i = this.nums.length - 1; i >= 0; i--) if (++this.nums[i].t > 64) this.nums.splice(i, 1);
    updateUI();
  },

  draw() {
    const p = Game.player, h = this.hero;
    ctx.save();
    if (this.shake) ctx.translate(rand(-this.shake, this.shake) * 0.6, rand(-this.shake, this.shake) * 0.4);
    drawBattleBg(this.theme, this.t);

    // 적
    this.enemies.forEach((e, i) => {
      const sc = e.d.scale;
      const f = Math.floor((this.t + e.phase * 10) / 26) % 2;
      const img = monsterSprite(e.kind, f, e.flash > 0 && e.flash % 4 < 2);
      const x = e.x + e.ox, y = e.y + e.oy;
      drawShadow(x, e.y + 2, img.width * sc * 0.4, 7);
      blit(img, x - img.width * sc / 2, y - img.height * sc + 4, sc, e.alpha);
      if (!e.dead && (e.showHp || this.targetCursor === i) && !this.boss) {
        const bw = 70;
        drawBar(x - bw / 2, y - img.height * sc - 4, bw, 6, e.hp / e.mhp, '#ff4d5e');
      }
      if (e.stun && !e.dead) text('★', x + 20, y - img.height * sc - 18 + Math.sin(this.t * 0.2) * 3, { size: 16, color: '#ffe14a' });
      if (this.targetCursor === i) {
        const ay = y - img.height * sc - 30 + Math.sin(this.t * 0.2) * 4;
        ctx.fillStyle = '#ffe14a'; ctx.strokeStyle = '#5a2600'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 10, ay); ctx.lineTo(x + 10, ay); ctx.lineTo(x, ay + 12); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    });

    // 주인공
    const look = playerLook(p);
    const img = charSprite(look, 'left', h.frame);
    const hx = h.x + h.ox, hy = h.y + h.oy;
    drawShadow(hx, h.y + 2, 26, 7);
    if (!(h.flash && h.flash % 4 < 2)) {
      blit(img, hx - img.width * 1.5, hy - img.height * 3 + 6, 3);
      this.drawWeapon(hx, hy);
    }
    if (h.stun) text('★', hx + 18, hy - 106 + Math.sin(this.t * 0.2) * 3, { size: 16, color: '#ffe14a' });

    for (const f of this.fx) drawFx(f);
    for (const n of this.nums) drawNumber(n);
    if (this.levelFx) { Field.drawLevelFx.call({ levelFx: this.levelFx }, hx, hy - 60); }
    ctx.restore();

    // 위쪽 로그 · 보스 HP
    drawWindow(12, 8, W - 24, 40);
    text(this.log, 28, 17, { size: 18 });
    if (this.boss && this.enemies.length) {
      const b = this.enemies.find(e => e.d.boss) || this.enemies[0];
      drawWindow(12, 52, W - 24, 34, { top: 'rgba(60,10,30,0.92)', bot: 'rgba(30,6,16,0.92)', border: '#ff8aa0' });
      text(b.d.name, 26, 60, { size: 16, color: '#ffd0d8' });
      drawBar(130, 62, W - 160, 14, b.hp / b.mhp, '#ff3a5a', `${fmt(b.hp)} / ${fmt(b.mhp)}`);
    }

    // 아래쪽 상태창
    ctx.fillStyle = '#141826'; ctx.fillRect(0, 330, W, H - 330);
    if (!UIStack.some(w => w instanceof BattleCommand || w instanceof TargetSelect)) drawWindow(12, 336, 180, 132);
    this.drawStatus();
    drawUI();
  },
  drawWeapon(hx, hy) {
    const p = Game.player, it = ITEMS[p.equip.weapon];
    if (!it) return;
    const icon = iconSprite(it.icon[0], it.icon[1]);
    const swing = this.hero.swing;
    const ang = swing ? -1.6 + (12 - swing) / 12 * 2.4 : -0.35 + Math.sin(this.t * 0.06) * 0.05;
    ctx.save();
    ctx.translate(hx - 12, hy - 22);
    ctx.scale(-1, 1);
    ctx.rotate(it.wtype === 'bow' ? 0.2 : ang);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(icon, -6, -36, 42, 42);
    ctx.restore();
  },
  drawStatus() {
    const p = Game.player, h = this.hero;
    const x = 200, y = 336, w = 428, hh = 132;
    drawWindow(x, y, w, hh);
    const img = charSprite(playerLook(p), 'down', 0);
    blit(img, x + 14, y + 14, 3);
    text(p.name, x + 90, y + 14, { size: 20 });
    text(`Lv.${p.level} ${JOBS[p.job].name}`, x + w - 18, y + 16, { size: 16, align: 'right', color: UI.accent2 });
    drawBar(x + 90, y + 46, w - 110, 16, p.hp / p.mhp, p.hp < p.mhp * 0.25 ? '#ff2a3a' : UI.hp, `HP ${p.hp} / ${p.mhp}`);
    drawBar(x + 90, y + 70, w - 110, 16, p.mp / p.mmp, UI.mp, `MP ${p.mp} / ${p.mmp}`);
    const tags = [];
    const B = h.buffs;
    if (B.atk) tags.push([`공격↑ ${B.atk.turns}`, UI.accent2]);
    if (B.def) tags.push([`방어↑ ${B.def.turns}`, '#9cc4ff']);
    if (B.crit) tags.push([`크리↑ ${B.crit.turns}`, '#ff9ad0']);
    if (B.eva) tags.push([`회피↑ ${B.eva.turns}`, UI.good]);
    if (B.guard) tags.push([`매직가드 ${B.guard.turns}`, '#9cc4ff']);
    if (h.poison) tags.push([`중독 ${h.poison}`, '#c86aff']);
    let tx = x + 90;
    for (const [s, c] of tags) { text(s, tx, y + 98, { size: 14, color: c }); tx += textWidth(s, 14) + 14; }
  }
};

// ── 전투 명령 창 ──
class BattleCommand {
  constructor(resolve) { this.resolve = resolve; this.list = new ListView(4); this.list.set(4); this.list.i = Battle.lastCmd || 0; }
  update() {
    this.list.handle();
    if (Input.pressed.ok) { Sound.sfx('ok'); Battle.lastCmd = this.list.i; popUI(this); this.resolve(this.list.i); }
  }
  draw() {
    const x = 12, y = 336, w = 180, h = 132;
    drawWindow(x, y, w, h);
    ['공격', '스킬', '아이템', '도망'].forEach((s, i) => {
      const yy = y + 8 + i * 29;
      if (this.list.i === i) drawCursorBar(x + 8, yy, w - 16, 28);
      text(s, x + 24, yy + 5, { size: 18 });
    });
  }
}

// ── 대상 선택 ──
class TargetSelect {
  constructor(resolve) {
    this.resolve = resolve;
    this.i = Math.max(0, Battle.enemies.findIndex(e => !e.dead));
    Battle.targetCursor = this.i;
  }
  step(d) {
    const n = Battle.enemies.length;
    for (let k = 0; k < n; k++) { this.i = (this.i + d + n) % n; if (!Battle.enemies[this.i].dead) break; }
    Battle.targetCursor = this.i; Sound.sfx('cursor');
  }
  update() {
    if (Input.rep('left') || Input.rep('up')) this.step(-1);
    if (Input.rep('right') || Input.rep('down')) this.step(1);
    if (Input.pressed.ok) { Sound.sfx('ok'); popUI(this); Battle.targetCursor = -1; this.resolve(Battle.enemies[this.i]); }
    if (Input.pressed.cancel) { Sound.sfx('cancel'); popUI(this); Battle.targetCursor = -1; this.resolve(null); }
  }
  draw() {
    const e = Battle.enemies[this.i];
    if (!e) return;
    drawWindow(12, 336, 180, 132);
    text('대상 선택', 28, 346, { size: 15, color: UI.dim });
    text(e.d.name, 28, 370, { size: 19 });
    text(`Lv.${e.d.lv}`, 176, 372, { size: 15, align: 'right', color: UI.accent2 });
    drawBar(28, 402, 148, 12, e.hp / e.mhp, '#ff4d5e', `${e.hp}/${e.mhp}`);
    text('◀ ▶ 선택  취소: 뒤로', 28, 430, { size: 13, color: UI.dim });
  }
}
