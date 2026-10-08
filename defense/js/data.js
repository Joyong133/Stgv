'use strict';
// ───────────────────────── 게임 데이터 ─────────────────────────

// 속성: 불 > 바람 > 물 > 불, 빛 ↔ 어둠 (서로 강함)
const ELEMS = {
  fire:  { name: '불',   color: '#ff5b2e', light: '#ffc46b', dark: '#8c1c08', glow: '#ff8a3d' },
  water: { name: '물',   color: '#2f9bff', light: '#9ee3ff', dark: '#0b3c8c', glow: '#5cc8ff' },
  wind:  { name: '바람', color: '#3ad17a', light: '#b8ffcf', dark: '#0d6b3a', glow: '#7dffb0' },
  light: { name: '빛',   color: '#ffd23f', light: '#fff7c2', dark: '#a67a00', glow: '#fff1a0' },
  dark:  { name: '어둠', color: '#a64dff', light: '#e2b8ff', dark: '#3d0d6b', glow: '#c77dff' },
};
const ELEM_ORDER = ['fire', 'water', 'wind', 'light', 'dark'];
function elemMult(atk, def) {
  const win = { fire: 'wind', wind: 'water', water: 'fire' };
  if (win[atk] === def) return 1.5;
  if (win[def] === atk) return 0.75;
  if ((atk === 'light' && def === 'dark') || (atk === 'dark' && def === 'light')) return 1.5;
  return 1;
}

const ROLES = {
  melee:   { name: '근접형', range: 150, cost: 5 },
  ranged:  { name: '원거리형', range: 275, cost: 6 },
  magic:   { name: '마법형', range: 240, cost: 7 },
  support: { name: '지원형', range: 250, cost: 6 },
};

// 등급: 3~6성, 그 다음 각성
const GRADE = {
  mult: { 3: 1, 4: 1.35, 5: 1.8, 6: 2.4 },
  awakenMult: 3.2,
  maxLv: { 3: 30, 4: 40, 5: 50, 6: 60 },
  awakenMaxLv: 70,
  evoCost: { 3: { evo: 10, gold: 3000 }, 4: { evo: 25, gold: 12000 }, 5: { evo: 50, gold: 40000 } },  // n성 → n+1성
  awakenCost: { evo: 80, awk: 30, gold: 100000 },
};
const lvCost = lv => Math.floor(20 + lv * lv * 1.5);

/*
  영웅 정의
  look: 외형 (art.js 의 리그가 그린다)
    skin, hair, hairStyle, eye, c1(옷 주색), c2(보조색), trim(장식), body(armor|robe|light|coat), extras[]
  atk: 3성 1레벨 공격력, aspd: 초당 공격 횟수
*/
const HEROES = [
  // ── 불 ──
  { id: 'leon', name: '레온', title: '홍염의 검사', elem: 'fire', role: 'melee', weapon: 'sword',
    atk: 33, aspd: 0.95, anim: 'slash', shot: null,
    skill: { name: '홍련참', cd: 11, desc: '불꽃 초승달을 휘둘러 범위 안 모든 적에게 공격력의 400% 피해와 화상을 입힌다.' },
    askill: { name: '홍련 폭풍참', desc: '범위가 넓어지고 600% 피해 + 강한 화상, 두 번 연속으로 벤다.' },
    normal: '베기 공격이 주변 적에게도 60% 피해를 준다.',
    look: { skin: '#ffd9b8', hair: '#e8432a', hairStyle: 'spiky', eye: '#ff6a1a', c1: '#c0281b', c2: '#3a2a2a', trim: '#ffc040', body: 'armor', extras: ['cape', 'scarfFire'] } },
  { id: 'agni', name: '아그니', title: '작열의 마도사', elem: 'fire', role: 'magic', weapon: 'staff',
    atk: 34, aspd: 0.62, anim: 'cast', shot: 'fireball',
    skill: { name: '메테오', cd: 14, desc: '하늘에서 운석 3개를 떨어뜨려 각각 300% 범위 피해와 화상을 입힌다.' },
    askill: { name: '메테오 스톰', desc: '운석이 6개로 늘어나고 피해가 400%가 된다.' },
    normal: '화염구가 폭발해 주변에 범위 피해를 준다.',
    look: { skin: '#ffe0c4', hair: '#7a1c10', hairStyle: 'long', eye: '#ffb02e', c1: '#9c1d2b', c2: '#2b1530', trim: '#ffb84d', body: 'robe', extras: ['witchHat'] } },
  { id: 'sera', name: '세라', title: '불꽃 사냥꾼', elem: 'fire', role: 'ranged', weapon: 'bow',
    atk: 22, aspd: 1.15, anim: 'bow', shot: 'firearrow',
    skill: { name: '불화살비', cd: 12, desc: '목표 주변에 불화살 12발을 퍼부어 각각 120% 피해를 준다.' },
    askill: { name: '업화의 화살비', desc: '불화살이 20발로 늘어나고 모두 화상을 입힌다.' },
    normal: '불화살이 약한 화상을 입힌다.',
    look: { skin: '#f6cfa8', hair: '#ff8a2a', hairStyle: 'pony', eye: '#ff4d2a', c1: '#d9542b', c2: '#5a3a22', trim: '#ffe08a', body: 'light', extras: ['elfEars', 'quiver'] } },
  // ── 물 ──
  { id: 'aqua', name: '아쿠아', title: '파도의 사제', elem: 'water', role: 'support', weapon: 'staff',
    atk: 20, aspd: 0.8, anim: 'cast', shot: 'waterorb',
    skill: { name: '치유의 파도', cd: 15, desc: '성을 2 회복하고, 범위 안 적에게 150% 피해와 40% 둔화를 건다.' },
    askill: { name: '성수의 해일', desc: '성을 4 회복하고 250% 피해 + 60% 둔화.' },
    normal: '물방울 공격이 적을 15% 둔화시킨다.',
    look: { skin: '#ffe6d4', hair: '#6ad0ff', hairStyle: 'long', eye: '#2a7bff', c1: '#e8f4ff', c2: '#2f7fd9', trim: '#7fe0ff', body: 'robe', extras: ['tiara'] } },
  { id: 'yuki', name: '유키', title: '빙결의 궁수', elem: 'water', role: 'ranged', weapon: 'bow',
    atk: 20, aspd: 1.0, anim: 'bow', shot: 'icearrow',
    skill: { name: '블리자드', cd: 13, desc: '목표 지점에 눈보라를 일으켜 200% 피해를 주고 2초간 얼린다.' },
    askill: { name: '절대영도', desc: '피해 300%, 3초간 얼리고 범위가 커진다.' },
    normal: '얼음 화살이 적을 30% 둔화시킨다.',
    look: { skin: '#fff0e6', hair: '#e9f6ff', hairStyle: 'twin', eye: '#3fb4ff', c1: '#4b8fd6', c2: '#e6f2ff', trim: '#bfeaff', body: 'coat', extras: ['furCollar'] } },
  { id: 'kai', name: '카이', title: '해일의 창기사', elem: 'water', role: 'melee', weapon: 'spear',
    atk: 34, aspd: 0.85, anim: 'thrust', shot: null,
    skill: { name: '해일 돌격', cd: 12, desc: '물살을 두른 창으로 돌진해 범위 안 적에게 300% 피해를 주고 뒤로 밀어낸다.' },
    askill: { name: '심해의 돌격', desc: '피해 450%, 더 멀리 밀어내고 둔화시킨다.' },
    normal: '찌르기가 목표 뒤의 적까지 관통한다.',
    look: { skin: '#e9c29d', hair: '#1d4f8f', hairStyle: 'short', eye: '#38c6ff', c1: '#1e5fa8', c2: '#c9d6e3', trim: '#5fe3ff', body: 'armor', extras: ['shoulder'] } },
  // ── 바람 ──
  { id: 'sylph', name: '실피드', title: '질풍의 궁수', elem: 'wind', role: 'ranged', weapon: 'bow',
    atk: 16, aspd: 1.0, anim: 'bow', shot: 'windarrow', multi: 2,
    skill: { name: '폭풍 화살', cd: 11, desc: '바람 화살 8발을 범위 안 적들에게 흩뿌린다 (각 150%).' },
    askill: { name: '천공의 폭풍', desc: '화살이 14발로 늘어나고 피해가 180%가 된다.' },
    normal: '한 번에 두 명을 동시에 쏜다.',
    look: { skin: '#ffe2c6', hair: '#8fe08a', hairStyle: 'pony', eye: '#2fd16f', c1: '#2f9a54', c2: '#f1e6c8', trim: '#d8ff9a', body: 'light', extras: ['elfEars', 'leafCape'] } },
  { id: 'hayate', name: '하야테', title: '바람의 닌자', elem: 'wind', role: 'ranged', weapon: 'shuriken',
    atk: 13, aspd: 2.2, anim: 'throw', shot: 'shuriken',
    skill: { name: '질풍 난무', cd: 10, desc: '순식간에 적 6명을 베고 지나가 각각 250% 피해를 준다.' },
    askill: { name: '진공 난무', desc: '10명을 베고 피해가 320%가 된다.' },
    normal: '아주 빠르게 수리검을 던진다.',
    look: { skin: '#f2cfae', hair: '#1f3a2c', hairStyle: 'spiky', eye: '#5dffa0', c1: '#24332b', c2: '#3fae6a', trim: '#9dffcb', body: 'light', extras: ['mask', 'scarfWind'] } },
  { id: 'zephyr', name: '제피르', title: '폭풍의 마도사', elem: 'wind', role: 'magic', weapon: 'staff',
    atk: 22, aspd: 0.75, anim: 'cast', shot: 'windblade',
    skill: { name: '토네이도', cd: 14, desc: '회오리를 일으켜 3초 동안 적을 뒤로 밀어내며 지속 피해를 준다.' },
    askill: { name: '대폭풍', desc: '회오리 2개가 5초 동안 휘몰아친다.' },
    normal: '바람 칼날이 일직선의 적을 관통한다.',
    look: { skin: '#ffe4cc', hair: '#c9f5d6', hairStyle: 'short', eye: '#14c46a', c1: '#1f7a5a', c2: '#e8fff2', trim: '#7dffb0', body: 'robe', extras: ['hoodDown', 'monocle'] } },
  // ── 빛 ──
  { id: 'luciel', name: '루시엘', title: '광휘의 성기사', elem: 'light', role: 'melee', weapon: 'hammer',
    atk: 38, aspd: 0.7, anim: 'slash', shot: null,
    skill: { name: '심판의 빛', cd: 13, desc: '가장 강한 적에게 빛기둥을 내려 600% 피해를 주고 주변을 2초 기절시킨다.' },
    askill: { name: '신의 심판', desc: '빛기둥 3개가 떨어진다.' },
    normal: '망치가 작은 범위 충격을 일으킨다.',
    look: { skin: '#ffe0bd', hair: '#ffe27a', hairStyle: 'helm', eye: '#3a7bff', c1: '#f4f1e6', c2: '#c9a43a', trim: '#ffd23f', body: 'armor', extras: ['cape', 'shield'] } },
  { id: 'serena', name: '세레나', title: '빛의 성녀', elem: 'light', role: 'support', weapon: 'staff',
    atk: 22, aspd: 0.9, anim: 'cast', shot: 'holybolt',
    skill: { name: '축복', cd: 16, desc: '6초간 모든 영웅의 공격 속도를 40% 올리고 성을 1 회복한다.' },
    askill: { name: '대천사의 축복', desc: '8초간 공격 속도 60%, 공격력 30% 증가, 성을 2 회복.' },
    normal: '성스러운 빛탄을 쏜다.',
    look: { skin: '#fff0e4', hair: '#fff2b0', hairStyle: 'long', eye: '#ffb800', c1: '#ffffff', c2: '#ffd86b', trim: '#ffd23f', body: 'robe', extras: ['halo'] } },
  { id: 'elysia', name: '엘리시아', title: '천공의 발키리', elem: 'light', role: 'ranged', weapon: 'spear',
    atk: 32, aspd: 0.6, anim: 'javelin', shot: 'holyspear',
    skill: { name: '성창 낙하', cd: 12, desc: '목표에게 거대한 성창을 내리꽂아 800% 피해, 주변에 200% 피해.' },
    askill: { name: '천벌의 성창', desc: '1200% 피해, 주변 300% 피해 + 1초 기절.' },
    normal: '빛의 창이 일직선의 적을 관통한다.',
    look: { skin: '#ffe6cf', hair: '#f7d36a', hairStyle: 'twin', eye: '#2a8bff', c1: '#e9eef7', c2: '#3a5aa8', trim: '#ffd23f', body: 'armor', extras: ['wings', 'wingHelm'] } },
  // ── 어둠 ──
  { id: 'kain', name: '카인', title: '영혼 사신', elem: 'dark', role: 'melee', weapon: 'scythe',
    atk: 34, aspd: 0.8, anim: 'reap', shot: null,
    skill: { name: '영혼 수확', cd: 13, desc: '거대한 낫을 휘둘러 300% 피해, 체력 25% 이하 일반 적은 즉사.' },
    askill: { name: '명계의 수확', desc: '450% 피해, 체력 35% 이하 즉사.' },
    normal: '낫이 넓은 범위를 벤다.',
    look: { skin: '#e8d6e8', hair: '#2a1838', hairStyle: 'hood', eye: '#ff3a6a', c1: '#1c1424', c2: '#5a2a7a', trim: '#c77dff', body: 'coat', extras: ['tatteredCape'] } },
  { id: 'lilith', name: '릴리스', title: '저주의 마녀', elem: 'dark', role: 'magic', weapon: 'orb',
    atk: 22, aspd: 0.8, anim: 'cast', shot: 'darkorb',
    skill: { name: '저주의 낙인', cd: 14, desc: '범위 안 모든 적에게 6초간 받는 피해 30% 증가 저주와 지속 피해.' },
    askill: { name: '파멸의 낙인', desc: '8초간 받는 피해 50% 증가.' },
    normal: '어둠 구체가 지속 피해를 남긴다.',
    look: { skin: '#f3dfe8', hair: '#5a1d7a', hairStyle: 'twin', eye: '#ff4fd8', c1: '#3a1450', c2: '#14081c', trim: '#ff7ae6', body: 'robe', extras: ['horns', 'batWings'] } },
  { id: 'bane', name: '베인', title: '그림자 암살자', elem: 'dark', role: 'melee', weapon: 'daggers',
    atk: 16, aspd: 1.25, anim: 'dual', shot: null, crit: 0.35,
    skill: { name: '그림자 습격', cd: 11, desc: '범위 안 체력이 가장 많은 적을 5번 연속으로 베어 각각 200% 치명타 피해.' },
    askill: { name: '심연의 처형', desc: '8번 연속 공격.' },
    normal: '쌍검으로 두 번 베고 치명타 확률이 높다.',
    look: { skin: '#d9b9a0', hair: '#cfcfe8', hairStyle: 'spiky', eye: '#b84dff', c1: '#20182a', c2: '#4a3a5a', trim: '#a64dff', body: 'light', extras: ['mask', 'scarfDark'] } },
];
const HERO_BY_ID = Object.fromEntries(HEROES.map(h => [h.id, h]));
const STARTERS = ['leon', 'yuki', 'sylph'];

// ───────────────────────── 적 ─────────────────────────
// hp 는 기본 체력 단위(ENEMY_HP_UNIT)에 곱하는 배수
const ENEMY_HP_UNIT = 48;
const ENEMIES = {
  slime:    { name: '슬라임',   hp: 1.0, spd: 52,  size: 1.0, dmg: 1, gold: 1 },
  goblin:   { name: '고블린',   hp: 0.8, spd: 78,  size: 1.0, dmg: 1, gold: 1 },
  skeleton: { name: '해골 병사', hp: 1.3, spd: 60,  size: 1.0, dmg: 1, gold: 1 },
  wolf:     { name: '늑대',     hp: 0.9, spd: 108, size: 1.0, dmg: 1, gold: 1 },
  bat:      { name: '박쥐',     hp: 0.65, spd: 118, size: 0.9, dmg: 1, gold: 1, fly: true },
  orc:      { name: '오크 전사', hp: 2.8, spd: 50,  size: 1.2, dmg: 2, gold: 2 },
  knight:   { name: '흑기사',   hp: 6,   spd: 56,  size: 1.25, dmg: 3, gold: 4, elite: true },
  golem:    { name: '골렘',     hp: 9,   spd: 38,  size: 1.4, dmg: 4, gold: 5, elite: true },
  // 보스
  dragon:   { name: '화염 드래곤',  hp: 32, spd: 34, size: 2.0, dmg: 8, gold: 30, boss: true, elem: 'fire',  ability: 'roar' },
  giant:    { name: '빙결 거인',    hp: 40, spd: 28, size: 2.0, dmg: 8, gold: 30, boss: true, elem: 'water', ability: 'shield' },
  griffon:  { name: '폭풍 그리폰',  hp: 28, spd: 46, size: 1.9, dmg: 8, gold: 30, boss: true, elem: 'wind',  ability: 'dash', fly: true },
  fallen:   { name: '타락 천사',    hp: 34, spd: 36, size: 1.9, dmg: 8, gold: 30, boss: true, elem: 'light', ability: 'heal', fly: true },
  lich:     { name: '리치 왕',      hp: 30, spd: 32, size: 1.9, dmg: 8, gold: 30, boss: true, elem: 'dark',  ability: 'summon' },
  demon:    { name: '마왕 바알제',  hp: 40, spd: 22, size: 2.4, dmg: 99, gold: 100, boss: true, elem: 'dark', ability: 'all', final: true },
};
const BOSS_CYCLE = ['dragon', 'giant', 'griffon', 'fallen', 'lich'];

// ───────────────────────── 난이도 ─────────────────────────
const DIFFS = [
  { id: 'easy',   name: '쉬움',   rounds: 30,  hp: 1.0, gold: 1.0, color: '#4fd16b', map: 'meadow',  castle: 20, startSupply: 14,
    clearRuby: 300, drop: { evo: 1, awk: 0 }, desc: '초원의 성채. 처음 시작하는 기사에게.' },
  { id: 'normal', name: '보통',   rounds: 45,  hp: 1.55, gold: 1.5, color: '#3fa2ff', map: 'autumn',  castle: 20, startSupply: 14,
    clearRuby: 600, drop: { evo: 2, awk: 1 }, desc: '단풍 협곡. 쉬움을 클리어하면 열립니다.' },
  { id: 'hard',   name: '어려움', rounds: 60,  hp: 2.4, gold: 2.2, color: '#ff8a2a', map: 'snow',    castle: 20, startSupply: 15,
    clearRuby: 1000, drop: { evo: 3, awk: 2 }, desc: '얼어붙은 요새. 보통을 클리어하면 열립니다.' },
  { id: 'hell',   name: '헬',     rounds: 100, hp: 3.2, gold: 3.2, color: '#ff2a4a', map: 'inferno', castle: 20, startSupply: 16,
    clearRuby: 2500, drop: { evo: 5, awk: 4 }, desc: '불타는 마계 관문. 어려움을 클리어하면 열립니다.' },
];
const DIFF_BY_ID = Object.fromEntries(DIFFS.map(d => [d.id, d]));

// 라운드에 따른 적 체력 배율
const waveScale = n => 1 + 0.15 * (n - 1) + 0.0048 * (n - 1) * (n - 1);

// 라운드 구성
function makeWave(n, diff) {
  const final = n === diff.rounds;
  const boss = final || n % 10 === 0;
  const elite = !boss && n % 5 === 0;
  const elems = ELEM_ORDER;
  const main = elems[Math.floor((n - 1) / 2) % 5];
  const pool = ['slime', 'goblin'];
  if (n >= 3) pool.push('skeleton');
  if (n >= 6) pool.push('wolf');
  if (n >= 8) pool.push('bat');
  if (n >= 11) pool.push('orc');
  if (n >= 16) pool.push('knight');
  if (n >= 22) pool.push('golem');
  const list = [];
  const count = Math.min(10 + Math.floor(n * 0.55), 42) - (boss ? 4 : 0);
  const mixChance = n > 20 ? 0.35 : n > 10 ? 0.15 : 0;
  // 같은 종류를 몇 마리씩 묶어 나오게 해서 흐름이 보이게 한다
  let left = count;
  while (left > 0) {
    let type = pick(pool);
    if ((type === 'knight' || type === 'golem') && Math.random() < 0.6) type = pick(pool.slice(0, Math.min(pool.length, 6)));
    const k = Math.min(left, randi(3, 6));
    const e = Math.random() < mixChance ? pick(elems) : main;
    for (let i = 0; i < k; i++) list.push({ type, elem: e });
    left -= k;
  }
  if (elite) {
    const t = n >= 22 ? 'golem' : 'knight';
    const k = 1 + Math.floor(n / 15);
    for (let i = 0; i < k; i++) list.splice(Math.floor(list.length * (i + 1) / (k + 1)), 0, { type: t, elem: main, elite: true });
  }
  if (boss) {
    const bt = final ? 'demon' : BOSS_CYCLE[(n / 10 - 1) % 5];
    list.push({ type: bt, elem: ENEMIES[bt].elem, boss: true });
  }
  const gap = Math.max(0.42, 0.95 - n * 0.009);
  return { n, list, gap, main, boss, elite, final };
}

// ───────────────────────── 영웅 성장 공식 ─────────────────────────
function heroMaxLv(h) { return h.awake ? GRADE.awakenMaxLv : GRADE.maxLv[h.star]; }
function heroGradeMult(h) { return h.awake ? GRADE.awakenMult : GRADE.mult[h.star]; }
function heroAtk(def, h) { return def.atk * heroGradeMult(h) * (1 + 0.08 * (h.lvl - 1)); }
function heroRange(def, h) { return ROLES[def.role].range + (h.awake ? 25 : 0) + (h.star - 3) * 5; }
function heroCost(def) { return ROLES[def.role].cost; }
function heroPower(def, h) { return Math.floor(heroAtk(def, h) * def.aspd * (def.multi || 1) * (def.anim === 'dual' ? 2 : 1) * 10); }

// 소환 확률
const SUMMON_RATES = [{ star: 3, p: 0.70 }, { star: 4, p: 0.24 }, { star: 5, p: 0.05 }, { star: 6, p: 0.01 }];
const SUMMON_COST = { one: 100, ten: 900 };
const DUPE_EVO = { 3: 5, 4: 12, 5: 30, 6: 60 };    // 중복 획득 시 진화석
