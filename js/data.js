'use strict';
// ───────────────────────── 직업 ─────────────────────────
const JOBS = {
  beginner: { name: '초보자', main: 'str', sub: 'dex', ratio: { str: 3, dex: 2 }, hp: 14, mp: 6, crit: 0.05, eva: 0.02, weapons: ['sword'],
    look: { shirt: '#f4f4f4', pants: '#4a68b8' } },
  warrior: { name: '전사', main: 'str', sub: 'dex', ratio: { str: 4, dex: 1 }, hp: 26, mp: 4, crit: 0.06, eva: 0.02, weapons: ['sword', 'axe'], bonusHp: 140, bonusMp: 0,
    look: { shirt: '#c8503a', pants: '#5a4030', belt: '#3a2418' } },
  magician: { name: '마법사', main: 'int', sub: 'luk', ratio: { int: 4, luk: 1 }, hp: 10, mp: 22, crit: 0.05, eva: 0.03, weapons: ['wand', 'staff'], magic: true, bonusHp: 0, bonusMp: 120,
    look: { shirt: '#5a4ab8', pants: '#3a3070', robe: true } },
  archer: { name: '궁수', main: 'dex', sub: 'str', ratio: { dex: 4, str: 1 }, hp: 17, mp: 10, crit: 0.15, eva: 0.05, weapons: ['bow'], bonusHp: 70, bonusMp: 40,
    look: { shirt: '#4a9a4a', pants: '#6a5a3a', belt: '#3a2a1a' } },
  thief: { name: '도적', main: 'luk', sub: 'dex', ratio: { luk: 4, dex: 1 }, hp: 17, mp: 10, crit: 0.12, eva: 0.1, weapons: ['dagger', 'claw'], bonusHp: 70, bonusMp: 40,
    look: { shirt: '#3a3a4a', pants: '#2a2a36', belt: '#8a2a3a' } }
};
const STAT_NAMES = { str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK' };

// ───────────────────────── 스킬 ─────────────────────────
// kind: phys(물리) magic(마법) fixed(고정 피해) buff heal
const SKILLS = {
  threesnails: { name: '달팽이 세 마리', job: 'beginner', lv: 1, mp: 4, kind: 'fixed', power: 24, hits: 1, target: 'one', fx: 'shell', desc: '달팽이 껍질을 던져 방어력을 무시하는 고정 피해를 준다.' },
  recovery: { name: '리커버리', job: 'beginner', lv: 5, mp: 8, kind: 'heal', power: 0.25, target: 'self', fx: 'heal', desc: '잠시 숨을 고르며 최대 HP의 25%를 회복한다.' },

  powerstrike: { name: '파워 스트라이크', job: 'warrior', lv: 10, mp: 6, kind: 'phys', mult: 2.6, hits: 1, target: 'one', fx: 'slash', desc: '적 하나를 힘껏 베어 260% 피해.' },
  slashblast: { name: '슬래시 블러스트', job: 'warrior', lv: 12, mp: 9, kind: 'phys', mult: 1.5, hits: 1, target: 'all', fx: 'wave', desc: '검기를 휘둘러 모든 적에게 150% 피해.' },
  ironbody: { name: '아이언 바디', job: 'warrior', lv: 14, mp: 12, kind: 'buff', buff: { def: 1.6 }, turns: 4, target: 'self', fx: 'buff', desc: '4턴 동안 방어력이 크게 오른다.' },
  brandish: { name: '브랜디쉬', job: 'warrior', lv: 18, mp: 16, kind: 'phys', mult: 2.1, hits: 2, target: 'one', fx: 'slash', desc: '거대한 검으로 두 번 베어 각 210% 피해.' },

  energybolt: { name: '에너지 볼트', job: 'magician', lv: 10, mp: 6, kind: 'magic', mult: 2.4, hits: 1, target: 'one', fx: 'bolt', desc: '마력 구체를 날려 240% 마법 피해.' },
  magicclaw: { name: '매직 클로', job: 'magician', lv: 12, mp: 10, kind: 'magic', mult: 1.7, hits: 2, target: 'one', fx: 'claw', desc: '마력의 발톱으로 두 번 할퀴어 각 170% 피해.' },
  magicguard: { name: '매직 가드', job: 'magician', lv: 14, mp: 12, kind: 'buff', buff: { guard: 0.6 }, turns: 5, target: 'self', fx: 'buff', desc: '5턴 동안 받는 피해의 60%를 MP로 대신 받는다.' },
  thunderbolt: { name: '썬더볼트', job: 'magician', lv: 18, mp: 20, kind: 'magic', mult: 2.0, hits: 1, target: 'all', fx: 'thunder', desc: '번개를 떨어뜨려 모든 적에게 200% 마법 피해.' },

  arrowblow: { name: '애로우 블로우', job: 'archer', lv: 10, mp: 5, kind: 'phys', mult: 2.4, hits: 1, target: 'one', fx: 'arrow', desc: '강한 화살 한 발로 240% 피해.' },
  doubleshot: { name: '더블 샷', job: 'archer', lv: 12, mp: 8, kind: 'phys', mult: 1.5, hits: 2, target: 'one', fx: 'arrow', desc: '화살 두 발을 연달아 쏘아 각 150% 피해.' },
  focus: { name: '포커스', job: 'archer', lv: 14, mp: 12, kind: 'buff', buff: { atk: 1.3, crit: 0.25 }, turns: 4, target: 'self', fx: 'buff', desc: '4턴 동안 공격력과 크리티컬 확률이 오른다.' },
  arrowbomb: { name: '애로우 봄', job: 'archer', lv: 18, mp: 16, kind: 'phys', mult: 1.7, hits: 1, target: 'all', fx: 'bomb', stun: 0.3, desc: '폭발 화살로 모든 적에게 170% 피해. 가끔 기절시킨다.' },

  luckyseven: { name: '럭키 세븐', job: 'thief', lv: 10, mp: 6, kind: 'phys', mult: 1.4, hits: 2, target: 'one', fx: 'star', desc: '표창 두 개를 던져 각 140% 피해.' },
  doublestab: { name: '더블 스탭', job: 'thief', lv: 12, mp: 8, kind: 'phys', mult: 1.25, hits: 2, target: 'all', fx: 'slash', desc: '재빠르게 파고들어 모든 적을 두 번 찌른다. 각 125% 피해.' },
  haste: { name: '헤이스트', job: 'thief', lv: 14, mp: 12, kind: 'buff', buff: { eva: 0.3, atk: 1.15 }, turns: 4, target: 'self', fx: 'buff', desc: '4턴 동안 회피율과 공격력이 오른다.' },
  savageblow: { name: '새비지 블로우', job: 'thief', lv: 18, mp: 16, kind: 'phys', mult: 0.85, hits: 6, target: 'one', fx: 'slash', desc: '눈에 보이지 않는 속도로 여섯 번 벤다. 각 85% 피해.' }
};

// ───────────────────────── 아이템 ─────────────────────────
// type: use(소비) etc(기타) equip(장비)
const ITEMS = {
  red: { name: '빨간 포션', type: 'use', icon: ['potion', '#ff4d5e'], hp: 50, price: 50, desc: 'HP를 50 회복한다.' },
  orange: { name: '주황 포션', type: 'use', icon: ['potion', '#ff9a2a'], hp: 150, price: 160, desc: 'HP를 150 회복한다.' },
  white: { name: '하얀 포션', type: 'use', icon: ['potion', '#f4f4ff'], hp: 300, price: 320, desc: 'HP를 300 회복한다.' },
  blue: { name: '파란 포션', type: 'use', icon: ['potion', '#3d8bff'], mp: 100, price: 200, desc: 'MP를 100 회복한다.' },
  manaelixir: { name: '마나 엘릭서', type: 'use', icon: ['elixir', '#6a7aff'], mp: 300, price: 620, desc: 'MP를 300 회복한다.' },
  elixir: { name: '엘릭서', type: 'use', icon: ['elixir', '#ffd23f'], hpPct: 0.5, mpPct: 0.5, price: 1000, desc: 'HP와 MP를 최대치의 50%만큼 회복한다.' },
  returnscroll: { name: '마을 귀환 주문서', type: 'use', icon: ['scroll', '#3d8bff'], warp: true, price: 400, field: true, desc: '마지막으로 들른 마을로 돌아간다. (전투 중 사용 불가)' },

  shell_g: { name: '달팽이 껍질', type: 'etc', icon: ['shell', '#5fbf4a'], price: 6, desc: '초록 달팽이가 남긴 껍질.' },
  shell_b: { name: '파란 달팽이 껍질', type: 'etc', icon: ['shell', '#4a8cff'], price: 10, desc: '파란 달팽이가 남긴 단단한 껍질.' },
  shell_r: { name: '빨간 달팽이 껍질', type: 'etc', icon: ['shell', '#ff5a4a'], price: 14, desc: '빨간 달팽이가 남긴 껍질.' },
  jelly: { name: '물컹물컹한 액체', type: 'etc', icon: ['jelly', '#6ad35f'], price: 18, desc: '슬라임에게서 나온 끈적한 액체.' },
  cap_o: { name: '주황버섯의 갓', type: 'etc', icon: ['cap', '#ff8c2a'], price: 22, desc: '주황버섯의 동그란 갓.' },
  ribbon: { name: '돼지의 리본', type: 'etc', icon: ['ribbon', '#e83a5a'], price: 26, desc: '리본돼지가 달고 있던 빨간 리본.' },
  cap_g: { name: '초록버섯의 갓', type: 'etc', icon: ['cap', '#5ab84a'], price: 30, desc: '초록버섯의 갓.' },
  branch: { name: '나뭇가지', type: 'etc', icon: ['branch', '#8a5a30'], price: 32, desc: '스텀프에게서 떨어진 나뭇가지.' },
  cap_h: { name: '뿔버섯의 갓', type: 'etc', icon: ['horn', '#e8e0d0'], price: 38, desc: '뿔이 달린 버섯 갓.' },
  darkbranch: { name: '단단한 나뭇가지', type: 'etc', icon: ['branch', '#5a4a5a'], price: 42, desc: '다크 스텀프의 단단한 가지.' },
  tail: { name: '이블아이의 꼬리', type: 'etc', icon: ['tail', '#9a5ad8'], price: 46, desc: '이블아이의 보라색 꼬리.' },
  cap_z: { name: '좀비버섯의 갓', type: 'etc', icon: ['cap', '#8a8098'], price: 55, desc: '으스스한 기운이 감도는 버섯 갓.' },
  spore: { name: '머쉬맘의 포자', type: 'etc', icon: ['jelly', '#ff8c2a'], price: 300, desc: '머쉬맘을 쓰러뜨린 증거.' },

  // 장비 — slot: weapon / hat / armor
  wood_sword: { name: '나무 검', type: 'equip', slot: 'weapon', wtype: 'sword', icon: ['sword', '#8a5a30'], atk: 9, lv: 1, price: 100, desc: '초보 모험가의 든든한 친구.' },
  gladius: { name: '글라디우스', type: 'equip', slot: 'weapon', wtype: 'sword', icon: ['sword', '#c8a040'], atk: 26, lv: 10, jobs: ['warrior'], price: 1500, desc: '전사용 한손검.' },
  vikingsword: { name: '바이킹 소드', type: 'equip', slot: 'weapon', wtype: 'sword', icon: ['sword', '#5a8ac8'], atk: 36, lv: 15, jobs: ['warrior'], price: 4000, desc: '바다 사나이들이 쓰던 묵직한 검.' },
  fireblade: { name: '파이어 블레이드', type: 'equip', slot: 'weapon', wtype: 'axe', icon: ['axe', '#e83a2a'], atk: 48, str: 3, lv: 20, jobs: ['warrior'], price: 9000, desc: '불꽃의 기운이 깃든 도끼.' },
  woodwand: { name: '나무 완드', type: 'equip', slot: 'weapon', wtype: 'wand', icon: ['wand', '#7ac8ff'], atk: 6, matk: 24, lv: 10, jobs: ['magician'], price: 1200, desc: '마력을 모으는 가벼운 완드.' },
  hardwand: { name: '하드우드 완드', type: 'equip', slot: 'weapon', wtype: 'wand', icon: ['wand', '#c86aff'], atk: 8, matk: 34, int: 2, lv: 15, jobs: ['magician'], price: 3800, desc: '단단한 나무로 깎은 완드.' },
  meteorstaff: { name: '미티어 스태프', type: 'equip', slot: 'weapon', wtype: 'staff', icon: ['staff', '#ff6a3a'], atk: 10, matk: 47, int: 4, lv: 20, jobs: ['magician'], price: 9000, desc: '별똥별의 힘을 담은 지팡이.' },
  warbow: { name: '전투 활', type: 'equip', slot: 'weapon', wtype: 'bow', icon: ['bow', '#a8703a'], atk: 24, lv: 10, jobs: ['archer'], price: 1400, desc: '궁수의 기본 활.' },
  hunterbow: { name: '헌터의 활', type: 'equip', slot: 'weapon', wtype: 'bow', icon: ['bow', '#4a9a4a'], atk: 34, dex: 2, lv: 15, jobs: ['archer'], price: 3900, desc: '사냥꾼들이 아끼는 활.' },
  ryden: { name: '라이덴', type: 'equip', slot: 'weapon', wtype: 'bow', icon: ['bow', '#ffd23f'], atk: 46, dex: 4, lv: 20, jobs: ['archer'], price: 9000, desc: '번개처럼 빠른 활.' },
  steeldagger: { name: '스틸 대거', type: 'equip', slot: 'weapon', wtype: 'dagger', icon: ['dagger', '#5a5a6a'], atk: 24, lv: 10, jobs: ['thief'], price: 1400, desc: '날렵한 강철 단검.' },
  guardianclaw: { name: '가디언 아대', type: 'equip', slot: 'weapon', wtype: 'claw', icon: ['claw', '#8a2a3a'], atk: 34, luk: 2, lv: 15, jobs: ['thief'], price: 3900, desc: '표창을 던지기 좋은 아대.' },
  shinkita: { name: '신키타', type: 'equip', slot: 'weapon', wtype: 'dagger', icon: ['dagger', '#c83a5a'], atk: 46, luk: 4, lv: 20, jobs: ['thief'], price: 9000, desc: '그림자처럼 소리 없는 단검.' },

  whitetee: { name: '하얀 면 티셔츠', type: 'equip', slot: 'armor', icon: ['armor', '#f4f4f4'], def: 3, lv: 1, price: 50, look: { shirt: '#f4f4f4', pants: '#4a68b8' }, desc: '깨끗한 흰 티셔츠와 청바지.' },
  overall: { name: '초록 멜빵바지', type: 'equip', slot: 'armor', icon: ['armor', '#5aaa4a'], def: 7, lv: 5, price: 450, look: { shirt: '#ffe9a8', pants: '#4a9a4a' }, desc: '움직이기 편한 멜빵바지.' },
  chainmail: { name: '브론즈 체인메일', type: 'equip', slot: 'armor', icon: ['armor', '#b8864a'], def: 20, lv: 10, jobs: ['warrior'], price: 1800, look: { shirt: '#b8864a', pants: '#5a4030' }, desc: '청동 고리를 엮은 갑옷.' },
  platearmor: { name: '레드 플레이트', type: 'equip', slot: 'armor', icon: ['armor', '#c83a3a'], def: 34, str: 3, lv: 18, jobs: ['warrior'], price: 6000, look: { shirt: '#c83a3a', pants: '#4a3a3a' }, desc: '붉은 강철 판금 갑옷.' },
  bluerobe: { name: '파란 로브', type: 'equip', slot: 'armor', icon: ['armor', '#4a6ad8'], def: 10, int: 3, lv: 10, jobs: ['magician'], price: 1800, look: { shirt: '#4a6ad8', pants: '#2a3a7a', robe: true }, desc: '마력이 스며든 로브.' },
  starrobe: { name: '별무늬 로브', type: 'equip', slot: 'armor', icon: ['armor', '#8a4ad8'], def: 20, int: 5, lv: 18, jobs: ['magician'], price: 6000, look: { shirt: '#8a4ad8', pants: '#4a2a7a', robe: true }, desc: '밤하늘을 수놓은 로브.' },
  huntersuit: { name: '헌터 의상', type: 'equip', slot: 'armor', icon: ['armor', '#3a8a4a'], def: 14, dex: 3, lv: 10, jobs: ['archer'], price: 1800, look: { shirt: '#3a8a4a', pants: '#6a5a3a' }, desc: '숲에 녹아드는 사냥꾼 옷.' },
  rangersuit: { name: '레인저 의상', type: 'equip', slot: 'armor', icon: ['armor', '#8ac84a'], def: 25, dex: 5, lv: 18, jobs: ['archer'], price: 6000, look: { shirt: '#8ac84a', pants: '#4a6a3a' }, desc: '숙련된 궁수의 가벼운 갑옷.' },
  ninjasuit: { name: '검은 닌자복', type: 'equip', slot: 'armor', icon: ['armor', '#2a2a36'], def: 14, luk: 3, lv: 10, jobs: ['thief'], price: 1800, look: { shirt: '#2a2a36', pants: '#1a1a24' }, desc: '어둠 속에서 눈에 띄지 않는다.' },
  shadowsuit: { name: '섀도우 슈트', type: 'equip', slot: 'armor', icon: ['armor', '#6a2a5a'], def: 25, luk: 5, lv: 18, jobs: ['thief'], price: 6000, look: { shirt: '#6a2a5a', pants: '#2a1a2a' }, desc: '그림자를 엮어 만든 옷.' },

  bandana: { name: '빨간 두건', type: 'equip', slot: 'hat', icon: ['hat', '#e04a3a'], def: 3, lv: 3, price: 300, look: { hat: 'bandana', hatColor: '#e04a3a' }, desc: '모험가들 사이에서 유행하는 두건.' },
  leafband: { name: '단풍잎 머리띠', type: 'equip', slot: 'hat', icon: ['leaf', '#ff8a1f'], def: 5, str: 2, dex: 2, int: 2, luk: 2, lv: 1, price: 800, look: { hat: 'leaf' }, desc: '촌장님이 준 단풍잎. 모든 능력치 +2.' },
  helmet: { name: '브론즈 헬멧', type: 'equip', slot: 'hat', icon: ['hat', '#b8c0cc'], def: 10, lv: 10, jobs: ['warrior'], price: 1400, look: { hat: 'helmet', hatColor: '#b8c0cc' }, desc: '튼튼한 청동 투구.' },
  wizardhat: { name: '마법사 모자', type: 'equip', slot: 'hat', icon: ['hat', '#5a3d9a'], def: 5, int: 3, lv: 10, jobs: ['magician'], price: 1400, look: { hat: 'wizard', hatColor: '#5a3d9a' }, desc: '뾰족한 마법사 모자.' },
  featherhat: { name: '깃털 모자', type: 'equip', slot: 'hat', icon: ['hat', '#3a7a3a'], def: 7, dex: 3, lv: 10, jobs: ['archer'], price: 1400, look: { hat: 'feather', hatColor: '#3a7a3a' }, desc: '붉은 깃털이 꽂힌 모자.' },
  hood: { name: '검은 복면', type: 'equip', slot: 'hat', icon: ['hat', '#2a2a36'], def: 7, luk: 3, lv: 10, jobs: ['thief'], price: 1400, look: { hat: 'hood', hatColor: '#2a2a36' }, desc: '얼굴을 가리는 복면.' },
  goldcrown: { name: '황금 왕관', type: 'equip', slot: 'hat', icon: ['hat', '#ffd23f'], def: 15, str: 5, dex: 5, int: 5, luk: 5, lv: 1, price: 0, look: { hat: 'crown' }, desc: '빅토리아 아일랜드의 영웅에게 주어진 왕관.' }
};

// ───────────────────────── 몬스터 ─────────────────────────
// scale: 전투 화면에서 도트 1칸 = 논리 몇 px
const MONSTERS = {
  snail: { name: '달팽이', lv: 1, hp: 15, atk: 7, def: 0, exp: 6, meso: [2, 6], drops: [['shell_g', 0.6], ['red', 0.08]], scale: 3 },
  bluesnail: { name: '파란 달팽이', lv: 2, hp: 26, atk: 10, def: 1, exp: 9, meso: [3, 8], drops: [['shell_b', 0.55], ['red', 0.1]], scale: 3 },
  redsnail: { name: '빨간 달팽이', lv: 4, hp: 46, atk: 16, def: 2, exp: 15, meso: [5, 12], drops: [['shell_r', 0.5], ['red', 0.12], ['blue', 0.04]], scale: 3 },
  slime: { name: '슬라임', lv: 6, hp: 90, atk: 24, def: 3, exp: 30, meso: [10, 20], drops: [['jelly', 0.5], ['red', 0.12], ['bandana', 0.02]], scale: 3 },
  orangemush: { name: '주황버섯', lv: 8, hp: 140, atk: 30, def: 4, exp: 40, meso: [12, 26], drops: [['cap_o', 0.5], ['orange', 0.08], ['blue', 0.05], ['overall', 0.02]], scale: 3 },
  ribbonpig: { name: '리본돼지', lv: 10, hp: 200, atk: 38, def: 6, exp: 52, meso: [16, 34], drops: [['ribbon', 0.5], ['orange', 0.1], ['blue', 0.06]], scale: 3 },
  greenmush: { name: '초록버섯', lv: 12, hp: 320, atk: 46, def: 8, exp: 72, meso: [22, 44], drops: [['cap_g', 0.5], ['orange', 0.1], ['blue', 0.07]], scale: 3 },
  stump: { name: '스텀프', lv: 13, hp: 380, atk: 50, def: 12, exp: 80, meso: [26, 50], drops: [['branch', 0.5], ['orange', 0.1], ['blue', 0.07]], scale: 3 },
  hornymush: { name: '뿔버섯', lv: 15, hp: 480, atk: 58, def: 11, exp: 96, meso: [30, 58], drops: [['cap_h', 0.5], ['white', 0.06], ['blue', 0.08]], scale: 3 },
  darkstump: { name: '다크 스텀프', lv: 16, hp: 560, atk: 64, def: 16, exp: 108, meso: [34, 64], drops: [['darkbranch', 0.5], ['white', 0.07], ['blue', 0.08]], scale: 3 },
  evileye: { name: '이블아이', lv: 17, hp: 600, atk: 70, def: 13, exp: 125, meso: [38, 70], drops: [['tail', 0.5], ['white', 0.08], ['manaelixir', 0.04]], scale: 3, magic: true },
  zombiemush: { name: '좀비버섯', lv: 19, hp: 760, atk: 78, def: 17, exp: 150, meso: [44, 80], drops: [['cap_z', 0.5], ['white', 0.1], ['elixir', 0.03], ['manaelixir', 0.05]], scale: 3 },
  mushmom: { name: '머쉬맘', lv: 16, hp: 4200, atk: 72, def: 14, exp: 2000, meso: [1200, 1500], drops: [['spore', 1], ['elixir', 1], ['white', 0.6]], scale: 3, boss: true,
    moves: [
      { name: '점프 찍기', w: 3, mult: 1.6, msg: '머쉬맘이 높이 뛰어올라 내리찍었다!', fx: 'quake' },
      { name: '포자 뿌리기', w: 2, mult: 0.8, poison: 3, msg: '머쉬맘이 독 포자를 흩뿌렸다!', fx: 'spore' },
      { name: '부하 부르기', w: 1, summon: 'orangemush', msg: '머쉬맘이 주황버섯을 불러냈다!' }
    ] },
  balrog: { name: '주니어 발록', lv: 25, hp: 8000, atk: 120, def: 26, exp: 6000, meso: [3000, 4000], drops: [['elixir', 1]], scale: 3, boss: true, magic: true,
    moves: [
      { name: '암흑 화염', w: 3, mult: 1.5, msg: '주니어 발록이 검은 불꽃을 내뿜었다!', fx: 'fire' },
      { name: '할퀴기 연타', w: 3, mult: 0.75, hits: 3, msg: '주니어 발록이 날카로운 발톱을 휘둘렀다!', fx: 'claw' },
      { name: '공포의 포효', w: 1, stun: 0.6, mult: 0.5, msg: '주니어 발록이 땅이 울리도록 포효했다!', fx: 'quake' },
      { name: '어둠의 기운', w: 1, heal: 0.05, msg: '주니어 발록이 어둠의 기운을 빨아들였다!', fx: 'dark' }
    ] }
};

// 레벨업에 필요한 경험치
function expNeed(lv) { return Math.floor(14 * Math.pow(lv, 1.6) + 6); }
const MAX_LEVEL = 50;

// ───────────────────────── 플레이어 ─────────────────────────
function newPlayer(name) {
  return {
    name, job: 'beginner', level: 1, exp: 0,
    str: 12, dex: 5, int: 4, luk: 4, ap: 0, autoAP: true,
    mhp: 50, mmp: 10, hp: 50, mp: 10,
    meso: 150,
    inv: { red: 5 },
    equips: [],
    equip: { weapon: 'wood_sword', hat: null, armor: 'whitetee' },
    quests: {}, flags: {},
    map: 'amherst', x: 9, y: 9, dir: 'down', lastTown: 'amherst',
    kills: {}, hair: '#7a4a26', hairStyle: 'short', playTime: 0
  };
}

function totalStats(p) {
  const s = { str: p.str, dex: p.dex, int: p.int, luk: p.luk, atk: 0, matk: 0, def: 0 };
  for (const slot in p.equip) {
    const it = ITEMS[p.equip[slot]];
    if (!it) continue;
    for (const k of ['str', 'dex', 'int', 'luk', 'atk', 'matk', 'def']) s[k] += it[k] || 0;
  }
  return s;
}

function derived(p) {
  const J = JOBS[p.job], s = totalStats(p);
  const prim = s[J.main], sec = s[J.sub];
  return {
    ...s,
    attack: Math.floor(s.atk + prim * 0.9 + sec * 0.3 + p.level * 0.5),
    magic: Math.floor(s.matk + s.int * 1.3 + s.luk * 0.3 + p.level * 0.5),
    defense: Math.floor(s.def + s.str * 0.15 + s.dex * 0.1 + p.level * 0.3),
    crit: J.crit + s.luk * 0.002,
    eva: J.eva + s.luk * 0.002 + s.dex * 0.0008,
    acc: 0.95 + s.dex * 0.001
  };
}

function playerLook(p) {
  const J = JOBS[p.job];
  const look = { skin: '#ffdcbc', hair: p.hair, hairStyle: p.hairStyle, shoes: '#5c3b22', ...J.look };
  const arm = ITEMS[p.equip.armor];
  if (arm && arm.look) Object.assign(look, arm.look);
  else if (!arm) Object.assign(look, { shirt: '#e8d8c0', pants: '#8a7a6a' });
  const hat = ITEMS[p.equip.hat];
  if (hat && hat.look) Object.assign(look, hat.look);
  return look;
}

function canEquip(p, id) {
  const it = ITEMS[id];
  if (!it || it.type !== 'equip') return false;
  if (it.lv > p.level) return false;
  if (it.jobs && !it.jobs.includes(p.job)) return false;
  if (it.slot === 'weapon' && !JOBS[p.job].weapons.includes(it.wtype)) return false;
  return true;
}
function equipFail(p, id) {
  const it = ITEMS[id];
  if (it.lv > p.level) return `레벨 ${it.lv} 이상이어야 장착할 수 있습니다.`;
  if (it.jobs && !it.jobs.includes(p.job)) return `${it.jobs.map(j => JOBS[j].name).join('/')} 전용 장비입니다.`;
  if (it.slot === 'weapon' && !JOBS[p.job].weapons.includes(it.wtype)) return '지금 직업으로는 쓸 수 없는 무기입니다.';
  return '';
}

function addItem(p, id, n = 1) {
  const it = ITEMS[id];
  if (!it) return;
  if (it.type === 'equip') { for (let i = 0; i < n; i++) p.equips.push(id); }
  else p.inv[id] = (p.inv[id] || 0) + n;
}
function removeItem(p, id, n = 1) {
  const it = ITEMS[id];
  if (it.type === 'equip') { for (let i = 0; i < n; i++) { const k = p.equips.indexOf(id); if (k >= 0) p.equips.splice(k, 1); } }
  else { p.inv[id] = (p.inv[id] || 0) - n; if (p.inv[id] <= 0) delete p.inv[id]; }
}
function countItem(p, id) {
  return ITEMS[id].type === 'equip' ? p.equips.filter(e => e === id).length : (p.inv[id] || 0);
}

function knownSkills(p) {
  return Object.keys(SKILLS).filter(id => {
    const s = SKILLS[id];
    return (s.job === p.job || s.job === 'beginner') && s.lv <= p.level;
  });
}

// AP를 직업 비율대로 자동 배분
function autoAssign(p) {
  const ratio = JOBS[p.job].ratio, keys = Object.keys(ratio);
  const total = keys.reduce((a, k) => a + ratio[k], 0);
  let i = 0;
  while (p.ap > 0) {
    // 비율에 맞게 차례대로
    const slot = i % total;
    let acc = 0;
    for (const k of keys) { acc += ratio[k]; if (slot < acc) { p[k]++; break; } }
    p.ap--; i++;
  }
}

// 레벨업 처리 — 오른 레벨 수를 돌려준다
function gainExp(p, amount) {
  let ups = 0;
  if (p.level >= MAX_LEVEL) return 0;
  p.exp += amount;
  while (p.level < MAX_LEVEL && p.exp >= expNeed(p.level)) {
    p.exp -= expNeed(p.level);
    p.level++; ups++;
    const J = JOBS[p.job];
    p.mhp += J.hp + rand(0, 4);
    p.mmp += J.mp + rand(0, 2) + (J.magic ? Math.floor(p.int / 10) : 0);
    p.ap += 5;
    if (p.autoAP) autoAssign(p);
  }
  if (ups) { p.hp = p.mhp; p.mp = p.mmp; }
  return ups;
}

// 전직: 능력치를 새 직업에 맞게 다시 배분
function advanceJob(p, job) {
  p.job = job;
  const J = JOBS[job];
  const spent = (p.str - 12) + (p.dex - 5) + (p.int - 4) + (p.luk - 4) + p.ap;
  p.str = 4; p.dex = 4; p.int = 4; p.luk = 4;
  p.ap = spent + 13;
  if (p.autoAP) autoAssign(p);
  p.mhp += J.bonusHp || 0; p.mmp += J.bonusMp || 0;
  p.hp = p.mhp; p.mp = p.mmp;
}
