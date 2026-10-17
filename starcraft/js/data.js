'use strict';
// ───────────────────────── 피해 유형 ─────────────────────────
// 스타크래프트 1 규칙: 일반형은 누구에게나 100%, 폭발형은 큰 유닛에, 진동형은 작은 유닛에 강하다
const DMG_MULT = {
  normal: { small: 1, medium: 1, large: 1 },
  explosive: { small: 0.5, medium: 0.75, large: 1 },
  concussive: { small: 1, medium: 0.5, large: 0.25 },
};
const DMG_NAME = { normal: '일반형', explosive: '폭발형', concussive: '진동형' };
const SIZE_NAME = { small: '소형', medium: '중형', large: '대형' };

// ───────────────────────── 유닛 ─────────────────────────
// speed 픽셀/초 · sight 시야(타일) · range 사거리(픽셀, 서로의 테두리 사이) · cd 공격 간격(초) · time 생산 시간(초)
const UNITS = {
  scv: {
    name: 'SCV', race: 'T', hp: 60, armor: 0, size: 'small', r: 10, speed: 94, sight: 7, supply: 1,
    cost: [50, 0], time: 13, hotkey: 'S', worker: true, mech: true,
    weapon: { dmg: 5, type: 'normal', range: 6, cd: 1.1, ground: true, melee: true },
    desc: '자원을 캐고 건물을 짓고 수리합니다.',
  },
  marine: {
    name: '마린', race: 'T', hp: 40, armor: 0, size: 'small', r: 8, speed: 90, sight: 7, supply: 1,
    cost: [50, 0], time: 15, hotkey: 'M', bio: true, infantry: true, armorUpg: 'infA', stimCost: 10,
    weapon: { dmg: 6, type: 'normal', range: 128, cd: 0.62, ground: true, air: true, upg: 'infW', plus: 1 },
    desc: '기본 보병. 지상과 공중을 모두 공격합니다.',
  },
  firebat: {
    name: '파이어뱃', race: 'T', hp: 50, armor: 1, size: 'small', r: 10, speed: 90, sight: 7, supply: 1,
    cost: [50, 25], time: 15, hotkey: 'F', req: 'academy', bio: true, infantry: true, armorUpg: 'infA', stimCost: 20,
    weapon: { dmg: 16, type: 'concussive', range: 30, cd: 0.92, ground: true, splash: 30, upg: 'infW', plus: 2 },
    desc: '화염으로 앞쪽 적을 한꺼번에 태웁니다. 작은 유닛에 강하고 큰 유닛에 약합니다.',
  },
  medic: {
    name: '메딕', race: 'T', hp: 60, armor: 1, size: 'small', r: 8, speed: 90, sight: 9, supply: 1,
    cost: [50, 25], time: 19, hotkey: 'C', req: 'academy', bio: true, infantry: true, armorUpg: 'infA',
    healer: true, energy: 200, startEnergy: 60,
    desc: '에너지를 써서 주변 생체 유닛의 체력을 회복시킵니다.',
  },
  tank: {
    name: '시즈 탱크', race: 'T', hp: 150, armor: 1, size: 'large', r: 16, speed: 86, sight: 10, supply: 2,
    cost: [150, 100], time: 31, hotkey: 'T', mech: true,
    weapon: { dmg: 30, type: 'explosive', range: 224, cd: 1.5, ground: true },
    siegeWeapon: { dmg: 70, type: 'explosive', range: 384, minRange: 64, cd: 3, ground: true, splash3: [14, 28, 44] },
    desc: '시즈 모드로 바꾸면 움직일 수 없지만 사거리와 피해가 크게 늘어납니다.',
  },
  drone: {
    name: '드론', race: 'Z', hp: 40, armor: 0, size: 'small', r: 10, speed: 94, sight: 7, supply: 1,
    cost: [50, 0], time: 13, worker: true, bio: true, armorUpg: 'zCarapace',
    weapon: { dmg: 5, type: 'normal', range: 6, cd: 1, ground: true, melee: true },
    desc: '자원을 캐고, 변태해서 저그 건물이 됩니다.',
  },
  zergling: {
    name: '저글링', race: 'Z', hp: 35, armor: 0, size: 'small', r: 7, speed: 160, sight: 5, supply: 0.5,
    cost: [25, 0], time: 18, bio: true, armorUpg: 'zCarapace',
    weapon: { dmg: 5, type: 'normal', range: 6, cd: 0.6, ground: true, melee: true, upg: 'zMelee', plus: 1 },
    desc: '빠르고 값싼 근접 유닛. 애벌레 하나에서 두 마리가 나옵니다.',
  },
  hydralisk: {
    name: '히드라리스크', race: 'Z', hp: 80, armor: 0, size: 'medium', r: 10, speed: 86, sight: 6, supply: 1,
    cost: [75, 25], time: 18, bio: true, armorUpg: 'zCarapace',
    weapon: { dmg: 10, type: 'explosive', range: 128, cd: 0.75, ground: true, air: true, upg: 'zRange', plus: 1 },
    desc: '가시를 쏘는 원거리 유닛.',
  },
  ultralisk: {
    name: '울트라리스크', race: 'Z', hp: 400, armor: 2, size: 'large', r: 19, speed: 108, sight: 7, supply: 4,
    cost: [200, 200], time: 38, bio: true, armorUpg: 'zCarapace',
    weapon: { dmg: 20, type: 'normal', range: 8, cd: 0.8, ground: true, melee: true, upg: 'zMelee', plus: 2 },
    desc: '거대한 칼날로 적진을 짓밟는 대형 유닛.',
  },
  overlord: {
    name: '오버로드', race: 'Z', hp: 200, armor: 0, size: 'large', r: 22, speed: 26, sight: 11, supply: 0,
    provides: 8, cost: [100, 0], time: 25, bio: true, air: true, armorUpg: 'zCarapace',
    desc: '하늘에 떠서 저그의 보급품을 8 늘립니다.',
  },
};

// ───────────────────────── 건물 ─────────────────────────
// w·h 크기(타일) · provides 보급품 · creep 점막 반경(타일)
const BUILDINGS = {
  cc: {
    name: '커맨드 센터', race: 'T', w: 4, h: 3, hp: 1500, armor: 1, cost: [400, 0], time: 60, sight: 10,
    provides: 10, townhall: true, hotkey: 'C', trains: ['scv'],
    desc: '일꾼을 생산하고 캐 온 자원을 받습니다.',
  },
  depot: {
    name: '서플라이 디폿', race: 'T', w: 3, h: 2, hp: 500, armor: 1, cost: [100, 0], time: 20, sight: 8,
    provides: 8, hotkey: 'S', desc: '보급품 한도를 8 늘립니다.',
  },
  refinery: {
    name: '리파이너리', race: 'T', w: 3, h: 2, hp: 750, armor: 1, cost: [100, 0], time: 25, sight: 8,
    onGeyser: true, hotkey: 'R', desc: '베스핀 간헐천 위에 지어 가스를 캡니다.',
  },
  barracks: {
    name: '배럭', race: 'T', w: 4, h: 3, hp: 1000, armor: 1, cost: [150, 0], time: 40, sight: 9,
    req: 'cc', hotkey: 'B', trains: ['marine', 'firebat', 'medic'], desc: '보병을 훈련합니다.',
  },
  ebay: {
    name: '엔지니어링 베이', race: 'T', w: 4, h: 3, hp: 850, armor: 1, cost: [125, 0], time: 35, sight: 8,
    req: 'cc', hotkey: 'E', researches: ['infW', 'infA'], desc: '보병 무기와 장갑을 강화합니다.',
  },
  bunker: {
    name: '벙커', race: 'T', w: 3, h: 2, hp: 350, armor: 1, cost: [100, 0], time: 18, sight: 9,
    req: 'barracks', hotkey: 'U', bunker: 4, desc: '보병 4명이 들어가 사거리 +1로 싸웁니다.',
  },
  academy: {
    name: '아카데미', race: 'T', w: 3, h: 2, hp: 600, armor: 1, cost: [150, 0], time: 40, sight: 8,
    req: 'barracks', hotkey: 'A', researches: ['stim', 'u238'], desc: '파이어뱃·메딕 훈련과 보병 연구를 엽니다.',
  },
  factory: {
    name: '팩토리', race: 'T', w: 4, h: 3, hp: 1250, armor: 1, cost: [200, 100], time: 50, sight: 9,
    req: 'barracks', hotkey: 'F', trains: ['tank'], researches: ['siege'], desc: '시즈 탱크를 생산합니다.',
  },
  hatchery: {
    name: '해처리', race: 'Z', w: 4, h: 3, hp: 1250, armor: 1, cost: [300, 0], time: 60, sight: 10,
    provides: 1, townhall: true, creep: 9, desc: '애벌레를 낳고 점막을 퍼뜨리는 저그의 둥지.',
  },
  pool: { name: '스포닝 풀', race: 'Z', w: 3, h: 2, hp: 750, armor: 1, cost: [200, 0], time: 40, sight: 7, desc: '저글링을 깨울 수 있게 합니다.' },
  extractor: { name: '익스트랙터', race: 'Z', w: 3, h: 2, hp: 750, armor: 1, cost: [50, 0], time: 25, sight: 7, onGeyser: true, desc: '가스를 캡니다.' },
  hydraden: { name: '히드라리스크 덴', race: 'Z', w: 3, h: 2, hp: 850, armor: 1, cost: [100, 50], time: 30, sight: 7, desc: '히드라리스크를 깨울 수 있게 합니다.' },
  ultracavern: { name: '울트라리스크 동굴', race: 'Z', w: 3, h: 2, hp: 600, armor: 1, cost: [150, 200], time: 50, sight: 7, desc: '울트라리스크를 깨울 수 있게 합니다.' },
  sunken: {
    name: '성큰 콜로니', race: 'Z', w: 2, h: 2, hp: 300, armor: 2, cost: [125, 0], time: 35, sight: 8, creep: 5,
    weapon: { dmg: 40, type: 'explosive', range: 224, cd: 1.6, ground: true },
    desc: '땅속 촉수로 지상 적을 찌르는 방어 건물.',
  },
};
const SCV_BUILDS = ['cc', 'depot', 'refinery', 'barracks', 'ebay', 'bunker', 'academy', 'factory'];

// ───────────────────────── 연구 ─────────────────────────
const RESEARCH = {
  stim: { name: '스팀팩', cost: [100, 100], time: 60, hotkey: 'T', desc: '마린·파이어뱃이 체력을 써서 10초 동안 공격·이동 속도가 50% 빨라집니다.' },
  u238: { name: 'U-238 탄', cost: [150, 150], time: 60, hotkey: 'U', desc: '마린 사거리가 1 늘어납니다.' },
  infW: { name: '보병 무기', levels: 3, cost: [100, 100], step: [75, 75], time: 60, hotkey: 'W', desc: '보병 공격력이 단계마다 올라갑니다.' },
  infA: { name: '보병 장갑', levels: 3, cost: [100, 100], step: [75, 75], time: 60, hotkey: 'A', desc: '보병 방어력이 단계마다 1 올라갑니다.' },
  siege: { name: '시즈 모드', cost: [150, 150], time: 50, hotkey: 'S', desc: '시즈 탱크가 시즈 모드로 전환할 수 있게 됩니다.' },
};
function researchCost(key, lvl) {
  const R = RESEARCH[key];
  return R.step ? [R.cost[0] + R.step[0] * lvl, R.cost[1] + R.step[1] * lvl] : R.cost;
}
function researchTime(key, lvl) { return RESEARCH[key].time + (RESEARCH[key].step ? lvl * 10 : 0); }

// ───────────────────────── 난이도 ─────────────────────────
// carry: 컴퓨터 일꾼이 한 번에 나르는 양 · larva: 애벌레 생성 간격(초) · firstWave: 첫 공격 시각(초)
// waveSize: 공격에 필요한 병력(보급품) · upg: 저그 공격·방어 업그레이드 시각
const DIFF = {
  easy: { name: '쉬움', carry: 6, larva: 13, maxHatch: 2, firstWave: 420, firstSize: 4, grow: 2, maxWave: 18, waveGap: 110, maxDrones: 16, sunkens: 1, expand: 600, ultra: 1200, upg: [1000, 1600] },
  normal: { name: '보통', carry: 8, larva: 9.5, maxHatch: 3, firstWave: 285, firstSize: 6, grow: 3, maxWave: 34, waveGap: 85, maxDrones: 22, sunkens: 2, expand: 420, ultra: 780, upg: [620, 1000, 1400] },
  hard: { name: '어려움', carry: 10, larva: 7.5, maxHatch: 4, firstWave: 210, firstSize: 7, grow: 4, maxWave: 48, waveGap: 65, maxDrones: 28, sunkens: 2, expand: 330, ultra: 600, upg: [430, 720, 1020] },
};
const SPEEDS = { normal: { name: '보통', k: 1 }, fast: { name: '빠름', k: 1.4 } };
