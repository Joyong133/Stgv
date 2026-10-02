'use strict';
// ───────────────────────── 퀘스트 ─────────────────────────
const QUESTS = {
  shells: { name: '달팽이 껍질 모으기', giver: '루카스', where: '암허스트', lv: 1, need: { shell_g: 10 }, reward: { exp: 120, meso: 300, items: { leafband: 1 } } },
  redsnail: { name: '빨간 달팽이 퇴치', giver: '사라', where: '암허스트', lv: 3, kill: { redsnail: 5 }, reward: { exp: 180, items: { blue: 3, red: 10 } } },
  caps: { name: '마야의 약재', giver: '마야', where: '헤네시스', lv: 7, need: { cap_o: 10 }, reward: { exp: 650, items: { orange: 10 } } },
  mushmom: { name: '머쉬맘 토벌', giver: '경비대장 마이', where: '헤네시스', lv: 12, need: { spore: 1 }, reward: { exp: 2600, meso: 3000, items: { elixir: 3 } } },
  branches: { name: '페리온의 땔감', giver: '경비병 타이론', where: '페리온', lv: 12, need: { branch: 12 }, reward: { exp: 1300, meso: 1200, items: { white: 5 } } },
  tails: { name: '이블아이 연구', giver: '아르웬', where: '엘리니아', lv: 15, need: { tail: 10 }, reward: { exp: 2600, items: { manaelixir: 5 } } },
  zombie: { name: '좀비버섯 소탕', giver: '거리의 JM', where: '커닝시티', lv: 17, kill: { zombiemush: 10 }, reward: { exp: 3800, meso: 2500, items: { elixir: 2 } } },
  balrog: { name: '깨어난 주니어 발록', giver: '전직 교관', where: '개미굴 깊은 곳', lv: 15, flag: 'balrog_dead', reward: {} }
};

function questReady(p, id) {
  const q = QUESTS[id], st = p.quests[id];
  if (!st) return false;
  for (const k in q.need || {}) if (countItem(p, k) < q.need[k]) return false;
  for (const k in q.kill || {}) if ((p.kills[k] || 0) - (st.base[k] || 0) < q.kill[k]) return false;
  if (q.flag && !p.flags[q.flag]) return false;
  return true;
}
function questProgress(p, id) {
  const q = QUESTS[id], st = p.quests[id], out = [];
  for (const k in q.need || {}) out.push(`${ITEMS[k].name} ${Math.min(countItem(p, k), q.need[k])}/${q.need[k]}`);
  for (const k in q.kill || {}) out.push(`${MONSTERS[k].name} ${Math.min((p.kills[k] || 0) - (st.base[k] || 0), q.kill[k])}/${q.kill[k]}`);
  if (q.flag) out.push(p.flags[q.flag] ? '처치 완료' : '처치 전');
  return out.join(', ');
}
function startQuest(p, id) {
  const base = {};
  for (const k in QUESTS[id].kill || {}) base[k] = p.kills[k] || 0;
  p.quests[id] = { state: 'active', base };
  Sound.sfx('quest');
  toast(`퀘스트 시작: ${QUESTS[id].name}`, UI.accent2);
}
async function completeQuest(p, id) {
  const q = QUESTS[id];
  for (const k in q.need || {}) removeItem(p, k, q.need[k]);
  p.quests[id].state = 'done';
  Sound.sfx('quest');
  const r = q.reward, got = [];
  if (r.meso) { p.meso += r.meso; got.push(`${fmt(r.meso)} 메소`); }
  for (const k in r.items || {}) { addItem(p, k, r.items[k]); got.push(`${ITEMS[k].name} ${r.items[k]}개`); }
  if (r.exp) got.push(`경험치 ${fmt(r.exp)}`);
  await notice(`퀘스트 완료! [${q.name}]\n보상: ${got.join(', ')}`);
  if (r.exp) {
    const ups = gainExp(p, r.exp);
    if (ups) { Game.levelUpFx(); await notice(`레벨 업! 레벨 ${p.level}이 되었습니다. HP와 MP가 모두 회복되었습니다.`); }
  }
}

// 흔한 퀘스트 대화 흐름. 이미 끝난 퀘스트면 false
async function questTalk(npc, id, L) {
  const p = Game.player, q = QUESTS[id], st = p.quests[id];
  if (!st) {
    if (p.level < q.lv) { if (L.low) { await say(npc, L.low); return true; } return false; }
    await sayAll(npc, L.offer);
    const r = await ask(npc, L.ask || '부탁 좀 들어줄 수 있겠어?', ['수락한다', '거절한다']);
    if (r === 0) { startQuest(p, id); await say(npc, L.accept); }
    else await say(npc, L.decline || '그래… 마음이 바뀌면 다시 말을 걸어 줘.');
    return true;
  }
  if (st.state === 'active') {
    if (questReady(p, id)) { await say(npc, L.done); await completeQuest(p, id); }
    else await say(npc, `${L.progress}\n(진행도: ${questProgress(p, id)})`);
    return true;
  }
  return false;
}

// ───────────────────────── 상점 · 휴식 ─────────────────────────
const SHOPS = {
  amherst: ['red', 'blue', 'returnscroll', 'bandana', 'overall'],
  lith: ['red', 'orange', 'blue', 'returnscroll', 'bandana', 'overall'],
  henesys: ['red', 'orange', 'white', 'blue', 'returnscroll', 'overall'],
  bow: ['warbow', 'hunterbow', 'ryden', 'huntersuit', 'rangersuit', 'featherhat'],
  magic: ['woodwand', 'hardwand', 'meteorstaff', 'bluerobe', 'starrobe', 'wizardhat', 'blue', 'manaelixir'],
  perion: ['gladius', 'vikingsword', 'fireblade', 'chainmail', 'platearmor', 'helmet', 'orange', 'white'],
  kerning: ['red', 'orange', 'white', 'blue', 'manaelixir', 'returnscroll'],
  kerningWeapon: ['steeldagger', 'guardianclaw', 'shinkita', 'ninjasuit', 'shadowsuit', 'hood']
};

async function shopkeeper(npc, stock, greet, restCost = 30) {
  const p = Game.player;
  const r = await ask(npc, greet, ['물건을 사고판다', `쉬어 간다 (HP·MP 회복, ${restCost} 메소)`, '대화를 마친다']);
  if (r === 0) await openShop(npc, stock);
  else if (r === 1) {
    if (p.hp >= p.mhp && p.mp >= p.mmp) { await say(npc, '지금은 기운이 넘쳐 보이는걸요? 쉬지 않아도 되겠어요.'); return; }
    if (p.meso < restCost) { await say(npc, '메소가 조금 모자라네요. 사냥을 하고 다시 오세요.'); return; }
    p.meso -= restCost; p.hp = p.mhp; p.mp = p.mmp;
    await Game.fade(20); Sound.sfx('heal'); await Game.fadeIn(20);
    await say(npc, '푹 쉬셨나요? HP와 MP가 모두 회복되었어요!');
  }
}

// ───────────────────────── 전직 교관 ─────────────────────────
async function jobInstructor(npc, job, L) {
  const p = Game.player, J = JOBS[job];
  if (p.job === 'beginner') {
    if (p.level < 10) { await sayAll(npc, L.early); return; }
    await sayAll(npc, L.intro);
    const r = await ask(npc, `${J.name}의 길을 걷겠나? 한번 정하면 되돌릴 수 없다네.`, [`${josa(J.name, '이/가')} 되겠습니다!`, '조금 더 생각해 볼게요.']);
    if (r !== 0) { await say(npc, '신중한 것도 좋은 자질이지. 마음이 정해지면 다시 오게.'); return; }
    advanceJob(p, job);
    const old = p.equip.weapon;
    if (old) addItem(p, old);
    p.equip.weapon = L.weapon;
    Game.levelUpFx();
    Sound.sfx('levelup');
    await say(npc, L.done);
    const skills = Object.values(SKILLS).filter(s => s.job === job).map(s => `Lv.${s.lv} ${s.name}`).join(', ');
    await notice(`${josa(J.name, '으로/로')} 전직했습니다!\n· 능력치가 ${J.name}에 맞게 다시 배분되었습니다.\n· ${josa(ITEMS[L.weapon].name, '을/를')} 받아 바로 장착했습니다.\n· 배우는 스킬: ${skills}`);
    return;
  }
  if (p.job !== job) { await say(npc, L.other); return; }
  if (p.flags.balrog_dead) { await say(npc, L.hero); return; }
  if (!p.quests.balrog && p.level >= 15) {
    await sayAll(npc, [
      '…자네, 요즘 땅이 이따금 울리는 걸 느꼈나?',
      '개미굴 가장 깊은 곳에 봉인되어 있던 마물, 주니어 발록이 깨어났다는 소식이네. 놈의 기운 때문에 빅토리아 아일랜드의 몬스터들이 점점 사나워지고 있지.',
      `이제 자네는 어엿한 ${J.name}일세. 빅토리아 로드 남쪽의 개미굴로 내려가 놈을 쓰러뜨려 주게.`
    ]);
    startQuest(p, 'balrog');
    await say(npc, '레벨 20 정도는 되어야 안심할 수 있을 걸세. 포션도 넉넉히 챙겨 가게. 행운을 비네!');
    return;
  }
  if (p.quests.balrog && p.quests.balrog.state === 'active') { await say(npc, `주니어 발록은 개미굴 깊은 곳에 있네. 지금 자네는 레벨 ${p.level}… ${p.level >= 20 ? '충분히 해낼 수 있을 걸세.' : '조금 더 수련하고 가는 것이 좋겠군.'}`); return; }
  await say(npc, pick(L.tips));
}

// ───────────────────────── NPC 목록 ─────────────────────────
const SKIN = '#ffdcbc';
const NPCS = {
  lucas: { name: '루카스', look: { skin: SKIN, hair: '#e0e0e0', hairStyle: 'bald', beard: '#f0f0f0', shirt: '#8a6a4a', pants: '#5a4a3a' },
    async talk(npc) {
      const p = Game.player;
      if (await questTalk(npc, 'shells', {
        offer: ['허허, 암허스트에 온 걸 환영하네. 나는 이 마을의 촌장 루카스라네.', '동쪽 달팽이 동산에 달팽이가 너무 많아져서 밭이 엉망이야. 사냥 연습도 할 겸, 달팽이를 잡아 껍질을 10개만 모아 와 주겠나?'],
        ask: '달팽이 껍질 10개를 모아 와 주겠나?',
        accept: '고맙네! 달팽이는 느리지만 얕보면 안 되네. 몸이 아프면 가방의 빨간 포션을 마시게.',
        progress: '달팽이 껍질은 초록 달팽이를 잡으면 얻을 수 있다네.',
        done: '오오, 껍질을 이렇게나! 자네 솜씨가 보통이 아니군. 이건 내가 젊었을 때 쓰던 단풍잎 머리띠라네. 메뉴의 장비에서 써 보게.'
      })) return;
      if (p.level < 5) await say(npc, '레벨 5가 되면 남쪽 부두의 섕크스에게 가 보게. 빅토리아 아일랜드는 훨씬 넓은 세상이라네.');
      else await say(npc, '이제 이 섬은 자네에게 좁겠군. 남쪽 부두의 섕크스가 빅토리아 아일랜드로 데려다 줄 걸세.');
    } },
  guide: { name: '길잡이 로이', look: { skin: SKIN, hair: '#3a2a1a', hat: 'cap', hatColor: '#3a7ae0', shirt: '#e8e8e8', pants: '#3a5a8a' },
    async talk(npc) {
      const r = await ask(npc, '안녕! 처음 온 모험가구나. 뭐가 궁금해?', ['조작 방법', '전투하는 법', '성장과 전직', '괜찮아']);
      if (r === 0) await say(npc, '방향키(WASD)로 걷고, Shift를 누른 채 걸으면 달려. Z·스페이스·엔터로 말을 걸거나 결정하고, X·Esc로 취소하거나 메뉴를 열어. 메뉴에서 언제든 저장할 수 있어!');
      if (r === 1) await sayAll(npc, ['사냥터를 돌아다니는 몬스터에 닿으면 전투가 시작돼. 공격·스킬·아이템·도망 중에서 고르면 돼.', 'HP가 0이 되면 마지막에 들른 마을에서 깨어나지만, 경험치를 조금 잃으니까 조심해!']);
      if (r === 2) await sayAll(npc, ['레벨이 오르면 AP 5가 생겨. 기본적으로 자동으로 배분되지만, 메뉴의 스탯에서 직접 올릴 수도 있어.', '레벨 10이 되면 빅토리아 아일랜드의 교관에게 전직할 수 있어. 헤네시스는 궁수, 엘리니아는 마법사, 페리온은 전사, 커닝시티는 도적이야!']);
    } },
  amherst_shop: { name: '잡화상인 피오', look: { skin: SKIN, hair: '#8a4a2a', hairStyle: 'spiky', shirt: '#3a7ae0', pants: '#5a4a3a' },
    talk(npc) { return shopkeeper(npc, SHOPS.amherst, '어서 와요! 포션이라면 피오네 가게죠.'); } },
  sera: { name: '사라', look: { skin: SKIN, hair: '#ff8aa8', hairStyle: 'long', shirt: '#ffd8e8', pants: '#c86a8a' },
    async talk(npc) {
      if (await questTalk(npc, 'redsnail', {
        low: '달팽이 동산 깊은 곳에 빨간 달팽이가 산대요. 조금 더 강해지면 다시 와 주세요!',
        offer: ['저기… 달팽이 동산 동쪽에 사는 빨간 달팽이들이 우리 꽃밭을 다 먹어 치우고 있어요.', '빨간 달팽이를 5마리만 혼내 줄 수 있나요?'],
        ask: '빨간 달팽이 5마리를 혼내 줄래요?',
        accept: '정말요? 고마워요! 빨간 달팽이는 다른 달팽이보다 아프게 무니까 조심하세요.',
        progress: '빨간 달팽이는 달팽이 동산 동쪽에 많아요.',
        done: '꽃밭이 다시 살아났어요! 이건 제 마음이에요.'
      })) return;
      await say(npc, '빅토리아 아일랜드에는 버섯 모양 집이 있는 마을이 있대요. 언젠가 꼭 가 보고 싶어요!');
    } },
  shanks: { name: '선장 섕크스', look: { skin: '#f0c8a0', hair: '#3a2a1a', hat: 'bandana', hatColor: '#2a2a3a', beard: '#3a2a1a', shirt: '#2a4a7a', pants: '#3a3a4a' },
    async talk(npc) {
      const p = Game.player;
      if (p.level < 5) { await say(npc, '빅토리아 아일랜드로 가고 싶다고? 하하, 레벨 5는 되어야 데려가 주지. 달팽이 동산에서 좀 더 단련하고 오게!'); return; }
      const r = await ask(npc, '이 배는 빅토리아 아일랜드의 리스항구로 간다네. 뱃삯은 150 메소. 출발하겠나?', ['출발한다 (150 메소)', '아직이요']);
      if (r !== 0) return;
      if (p.meso < 150) { await say(npc, '메소가 모자라는군. 몬스터를 잡으면 메소를 얻을 수 있다네.'); return; }
      p.meso -= 150;
      await Game.sail('lith', 12, 12, 'up', '배를 타고 넓은 바다를 건넜다…');
    } },
  lith_shop: { name: '잡화상인 루이', look: { skin: SKIN, hair: '#c8a040', shirt: '#2a8ac8', pants: '#4a4a5a' },
    talk(npc) { return shopkeeper(npc, SHOPS.lith, '리스항구에 온 걸 환영해요! 긴 항해 끝에 지치셨죠?'); } },
  lith_inn: { name: '여관 주인 테오', look: { skin: SKIN, hair: '#5a3a2a', beard: '#5a3a2a', shirt: '#c83a3a', pants: '#3a3a4a' },
    async talk(npc) {
      const p = Game.player;
      const r = await ask(npc, '바다 바람 맞으며 한숨 자고 가겠소? 하룻밤에 20 메소요.', ['쉬어 간다 (20 메소)', '괜찮아요']);
      if (r !== 0) return;
      if (p.meso < 20) { await say(npc, '메소가 모자라군…'); return; }
      p.meso -= 20; p.hp = p.mhp; p.mp = p.mmp;
      await Game.fade(30); Sound.sfx('heal'); await Game.fadeIn(30);
      await say(npc, '잘 잤소? 기운이 넘쳐 보이는구려.');
    } },
  lith_captain: { name: '선장 바나', look: { skin: '#f0c8a0', hair: '#e0e0e0', hat: 'cap', hatColor: '#2a4a7a', beard: '#e0e0e0', shirt: '#f4f4f4', pants: '#2a4a7a' },
    async talk(npc) {
      const p = Game.player;
      const r = await ask(npc, '메이플 아일랜드로 돌아가는 배라네. 뱃삯은 150 메소일세.', ['메이플 아일랜드로 (150 메소)', '아니요']);
      if (r !== 0) return;
      if (p.meso < 150) { await say(npc, '메소가 모자라는군.'); return; }
      p.meso -= 150;
      await Game.sail('amherst', 12, 15, 'up', '배를 타고 메이플 아일랜드로 돌아왔다…');
    } },
  lith_kid: { name: '꼬마 토비', look: { skin: SKIN, hair: '#ff9a3c', hairStyle: 'spiky', shirt: '#ffd23f', pants: '#3a7ae0' },
    async talk(npc) { await say(npc, '북쪽으로 가면 헤네시스야! 거기 버섯 집 진짜 귀엽다? 그리고 마을 남쪽 사냥터엔 리본 단 돼지가 있어!'); } },

  henesys_shop: { name: '잡화상 레아', look: { skin: SKIN, hair: '#6a3a2a', hairStyle: 'pony', shirt: '#ff8c2a', pants: '#5a4a3a' },
    talk(npc) { return shopkeeper(npc, SHOPS.henesys, '헤네시스 잡화점이에요. 사냥 가기 전에 포션은 넉넉히!'); } },
  helena: { name: '헬레나', look: { skin: SKIN, hair: '#ffe08a', hairStyle: 'long', hat: 'feather', hatColor: '#3a7a3a', shirt: '#3a8a4a', pants: '#6a5a3a' },
    talk(npc) { return jobInstructor(npc, 'archer', {
      early: ['나는 궁수들의 교관 헬레나야.', '레벨 10이 되면 다시 찾아와. 멀리서 적을 꿰뚫는 궁수의 길을 알려 줄게.'],
      intro: ['바람을 읽고, 숨을 고르고, 단 한 발로 꿰뚫는 것. 그게 궁수야.', '궁수는 DEX가 중요하고, 크리티컬이 잘 터져서 한 방이 매섭지.'],
      weapon: 'warbow', done: '좋아, 오늘부터 너는 궁수야! 이 활을 받아. 헤네시스의 이름에 먹칠하지 않도록!',
      other: '넌 이미 다른 길을 걷고 있구나. 그 길에서 최고가 되렴.',
      hero: '주니어 발록을 쓰러뜨린 영웅이 우리 헤네시스 출신이라니, 정말 자랑스러워!',
      tips: ['포커스로 집중력을 끌어올린 다음 더블 샷을 쏘면 효과가 좋아.', '애로우 봄은 적을 기절시킬 때가 있어. 여러 마리를 상대할 때 써 봐.']
    }); } },
  bow_shop: { name: '활 상인 리나', look: { skin: SKIN, hair: '#8a5a2a', hairStyle: 'bun', shirt: '#4a8cff', pants: '#3a4a6a' },
    talk(npc) { return shopkeeper(npc, SHOPS.bow, '궁수를 위한 활과 옷이 가득해요!', 30); } },
  maya: { name: '마야', look: { skin: '#fff0e0', hair: '#6a3a2a', hairStyle: 'long', shirt: '#f4c0d8', pants: '#c890b0' },
    async talk(npc) {
      if (await questTalk(npc, 'caps', {
        low: '콜록… 미안해요, 몸이 좀 안 좋아서… 조금 더 강해진 다음에 와 줄래요?',
        offer: ['콜록콜록… 안녕하세요. 저는 마야예요. 몸이 약해서 밖에 잘 못 나가요.', '주황버섯의 갓을 달여 먹으면 기운이 난대요. 헤네시스 사냥터의 주황버섯을 잡아 갓을 10개 구해 주실 수 있나요?'],
        ask: '주황버섯의 갓 10개를 구해 주실래요?',
        accept: '정말 고마워요… 주황버섯은 마을 남쪽 사냥터에 있어요.',
        progress: '주황버섯은 헤네시스 사냥터에 있어요. 콜록…',
        done: '와아, 이걸로 약을 만들 수 있겠어요! 고마워요. 이건 제가 아껴 둔 포션이에요.'
      })) return;
      await say(npc, '약을 먹었더니 정말 기운이 나요! 언젠가 저도 모험을 떠날 거예요.');
    } },
  natalie: { name: '헤어디자이너 나탈리', look: { skin: SKIN, hair: '#ff6a9a', hairStyle: 'bun', shirt: '#ffffff', pants: '#ff6a9a' },
    async talk(npc) {
      const p = Game.player;
      const r = await ask(npc, '헤네시스 헤어샵이에요! 300 메소면 머리 모양과 색을 바꿔 드려요.', ['머리를 바꾼다 (300 메소)', '괜찮아요']);
      if (r !== 0) return;
      if (p.meso < 300) { await say(npc, '어머, 메소가 조금 모자라네요.'); return; }
      const styles = [['short', '기본 머리'], ['long', '긴 생머리'], ['spiky', '삐죽 머리'], ['bun', '똥머리'], ['pony', '포니테일'], ['bald', '민머리']];
      const s = await choose(styles.map(x => x[1]), { title: '머리 모양', center: true });
      if (s < 0) return;
      const colors = [['#7a4a26', '갈색'], ['#2a2230', '검은색'], ['#ffe08a', '금발'], ['#d8402a', '빨간색'], ['#4a7aff', '파란색'], ['#ff8ac0', '분홍색'], ['#5ac85a', '초록색'], ['#f0f0f0', '은색']];
      const c = await choose(colors.map(x => x[1]), { title: '머리 색', center: true });
      if (c < 0) return;
      p.meso -= 300; p.hairStyle = styles[s][0]; p.hair = colors[c][0];
      Sound.sfx('heal');
      await say(npc, '짜잔! 정말 잘 어울려요. 다음에 또 오세요~');
    } },
  mai: { name: '경비대장 마이', look: { skin: SKIN, hair: '#3a2a1a', hat: 'helmet', hatColor: '#c8c8d8', shirt: '#6a7a9a', pants: '#3a4a5a' },
    async talk(npc) {
      if (await questTalk(npc, 'mushmom', {
        low: '헤네시스 경비대장 마이다. 사냥터 동쪽의 버섯 동산은 위험하니 레벨 12가 되기 전엔 가지 마라.',
        offer: ['헤네시스 경비대장 마이다. 마침 쓸 만한 모험가를 찾고 있었지.', '버섯 동산 깊은 곳에 거대한 버섯, 머쉬맘이 나타났다. 놈 때문에 버섯들이 떼로 몰려다니고 있어.', '머쉬맘을 쓰러뜨리고 그 증거로 머쉬맘의 포자를 가져와 다오.'],
        ask: '머쉬맘 토벌을 맡아 주겠나?',
        accept: '든든하군. 머쉬맘은 HP가 엄청나고 독 포자를 뿌린다. 포션을 충분히 챙겨라.',
        progress: '머쉬맘은 헤네시스 사냥터 동쪽, 버섯 동산 가장 안쪽에 있다.',
        done: '정말로 머쉬맘을 쓰러뜨렸군! 헤네시스를 대표해 감사하지. 약속한 보상이다.'
      })) return;
      await say(npc, '자네 덕에 헤네시스가 평화롭군. 언제든 경비대에 들어오고 싶다면 말하게.');
    } },
  mush_guard: { name: '파수꾼 버디', look: { skin: SKIN, hair: '#5a3a2a', hat: 'cap', hatColor: '#ff8c2a', shirt: '#8a6a4a', pants: '#4a3a2a' },
    async talk(npc) {
      const p = Game.player;
      if (p.flags.mushmom_dead) await say(npc, '머쉬맘이 사라진 뒤로 버섯 동산이 많이 조용해졌어요. 고마워요!');
      else await say(npc, `조심하세요! 이 숲 가장 안쪽, 동쪽 공터에 거대한 머쉬맘이 있어요. ${p.level < 14 ? '레벨 14는 넘어야 해볼 만할 거예요.' : '지금이라면 해볼 만하겠는데요?'}`);
    } },
  traveler: { name: '여행자 펠릭스', look: { skin: '#f0c8a0', hair: '#c8a040', hairStyle: 'pony', hat: 'cap', hatColor: '#8a6a3a', shirt: '#6a8a5a', pants: '#5a4a3a', cape: '#8a3a3a' },
    async talk(npc) {
      await sayAll(npc, ['여기는 빅토리아 로드 갈림길이야. 표지판을 잘 봐!', '북서쪽 엘리니아는 마법사의 숲, 북동쪽 페리온은 전사의 바위산, 동쪽 커닝시티는 도적의 도시야.', '남쪽 개미굴은… 요즘 이상한 울림이 들려. 웬만큼 강하지 않으면 가지 마.']);
    } },
  cave_guard: { name: '경비병 칼', look: { skin: SKIN, hair: '#2a2230', hat: 'helmet', hatColor: '#9aa0b0', shirt: '#5a6a8a', pants: '#3a3a4a' },
    async talk(npc) {
      const p = Game.player;
      if (p.flags.balrog_dead) { await say(npc, '개미굴의 울림이 멈췄습니다. 당신이 해냈군요!'); return; }
      await say(npc, `이 아래는 개미굴입니다. 좀비버섯과 이블아이가 득실거리죠. ${p.level < 15 ? '레벨 15 미만은 위험합니다!' : '가장 깊은 곳에선 무시무시한 기운이 느껴집니다…'}`);
    } },

  grendel: { name: '하인즈', look: { skin: '#ffe4cc', hair: '#f0f0f0', hairStyle: 'long', beard: '#f8f8f8', hat: 'wizard', hatColor: '#5a3d9a', shirt: '#6a4ab8', pants: '#3a2a6a', robe: true },
    talk(npc) { return jobInstructor(npc, 'magician', {
      early: ['허허… 나는 엘리니아의 마법사 하인즈라네.', '레벨 10이 되면 다시 오게. 마법의 세계로 안내하지.'],
      intro: ['마법이란 세상에 흐르는 마나를 읽고 다루는 학문이라네.', '마법사는 INT가 높을수록 마법이 강해지고 MP도 많아지지. 대신 몸은 조금 약하다네.'],
      weapon: 'woodwand', done: '좋네! 이제 자네는 마법사일세. 이 완드에 자네의 마나를 담아 보게.',
      other: '허허, 자네는 다른 길을 택했구먼. 어떤 길이든 끝까지 걷는 것이 중요하지.',
      hero: '주니어 발록을 쓰러뜨렸다고? 허허허! 내 제자 중 최고로구먼!',
      tips: ['매직 가드를 켜 두면 받는 피해의 일부를 MP가 대신 받아 준다네.', '썬더볼트는 여러 적을 한꺼번에 상대할 때 최고지.', 'MP가 부족하면 파란 포션과 마나 엘릭서를 챙기게.']
    }); } },
  magic_shop: { name: '마법상인 루미', look: { skin: SKIN, hair: '#8a5aff', hairStyle: 'long', hat: 'wizard', hatColor: '#3a8a6a', shirt: '#4a9a7a', pants: '#2a5a4a' },
    talk(npc) { return shopkeeper(npc, SHOPS.magic, '엘리니아 마법 상점이에요. 완드와 로브, 마나 포션이 있어요!'); } },
  arwen: { name: '요정 아르웬', look: { skin: '#fff0f8', hair: '#bfe8ff', hairStyle: 'long', shirt: '#e8f8ff', pants: '#a8d8f0', cape: '#c8f0ff' },
    async talk(npc) {
      if (await questTalk(npc, 'tails', {
        low: '안녕, 인간 모험가. 나는 요정 아르웬이야. 더 강해지면 부탁할 게 있어.',
        offer: ['나는 엘리니아의 요정 아르웬. 개미굴의 이블아이들이 왜 저렇게 난폭해졌는지 연구하고 있어.', '이블아이의 꼬리를 10개 모아 줄 수 있니? 꼬리에 남은 기운을 조사해 보고 싶어.'],
        ask: '이블아이의 꼬리 10개를 모아 줄래?',
        accept: '고마워. 이블아이는 개미굴에 있어. 마법 공격을 하니까 조심해.',
        progress: '이블아이는 빅토리아 로드 남쪽 개미굴에 있어.',
        done: '역시… 꼬리에서 어둠의 기운이 느껴져. 개미굴 깊은 곳에 뭔가 있는 게 틀림없어. 이건 보답이야.'
      })) return;
      await say(npc, '개미굴 깊은 곳의 어둠… 너라면 막을 수 있을 거야.');
    } },

  dances: { name: '주먹펴고 일어서', look: { skin: '#d8a070', hair: '#2a2230', hairStyle: 'spiky', shirt: '#8a3a2a', pants: '#5a4030', belt: '#ffd23f', big: true },
    talk(npc) { return jobInstructor(npc, 'warrior', {
      early: ['나는 페리온의 전사 교관, 주먹펴고 일어서다.', '레벨 10이 되면 다시 와라. 강철 같은 전사로 만들어 주마.'],
      intro: ['전사는 누구보다 앞에 서서 동료를 지키는 자다.', '전사는 STR이 핵심이다. HP가 많고 방어력이 높아 쉽게 쓰러지지 않지.'],
      weapon: 'gladius', done: '좋다! 오늘부터 너는 전사다. 이 글라디우스를 받아라. 부끄럽지 않게 휘둘러라!',
      other: '흠, 다른 길을 택했군. 하지만 강한 자는 언제나 환영이다.',
      hero: '주니어 발록을 쓰러뜨렸다고? 하하하! 역시 내가 사람 보는 눈이 있지!',
      tips: ['아이언 바디로 몸을 단단히 한 뒤 브랜디쉬로 몰아붙여라!', '슬래시 블러스트는 몰려든 적을 한꺼번에 쓸어버린다.']
    }); } },
  perion_shop: { name: '무기상 만지', look: { skin: '#e0b080', hair: '#8a3a2a', beard: '#8a3a2a', shirt: '#6a5a4a', pants: '#4a3a2a', big: true },
    talk(npc) { return shopkeeper(npc, SHOPS.perion, '전사의 무기와 갑옷이라면 페리온이지!'); } },
  perion_guard: { name: '경비병 타이론', look: { skin: '#d8a070', hair: '#2a2230', hat: 'bandana', hatColor: '#c84a3a', shirt: '#a85a3a', pants: '#5a4030' },
    async talk(npc) {
      if (await questTalk(npc, 'branches', {
        low: '페리온은 바위산이라 나무가 귀하지. 좀 더 강해지면 부탁할 게 있다.',
        offer: ['페리온은 바위뿐이라 땔감이 늘 모자라.', '빅토리아 로드의 스텀프를 잡으면 나뭇가지를 얻을 수 있지. 12개만 구해 다오.'],
        ask: '나뭇가지 12개를 구해 주겠나?',
        accept: '좋아! 스텀프는 단단하니 방심하지 마라.',
        progress: '스텀프는 빅토리아 로드에 많다.',
        done: '이 정도면 이번 겨울은 따뜻하겠군! 고맙다.'
      })) return;
      await say(npc, '덕분에 모닥불이 꺼지지 않는다. 언제든 들러라.');
    } },

  darklord: { name: '다크로드', look: { skin: '#e8c8a8', hair: '#2a2230', hat: 'hood', hatColor: '#1e1e28', shirt: '#2a2a36', pants: '#1a1a24', eye: '#c02040', cape: '#3a1a2a' },
    talk(npc) { return jobInstructor(npc, 'thief', {
      early: ['…누구냐. 나는 커닝시티의 도적 교관, 다크로드.', '레벨 10이 되면 다시 와라. 그림자의 길을 가르쳐 주지.'],
      intro: ['도적은 빠르고, 조용하고, 치명적이어야 한다.', '도적은 LUK이 중요하다. 회피가 높고 공격이 여러 번 들어가지.'],
      weapon: 'steeldagger', done: '좋다. 오늘부터 너는 도적이다. 이 단검을 가져가라. …그림자처럼 움직여라.',
      other: '…다른 길을 택했군. 상관없다.',
      hero: '…주니어 발록을 쓰러뜨렸다지. 제법이군.',
      tips: ['헤이스트로 몸을 가볍게 하면 적의 공격이 잘 맞지 않는다.', '새비지 블로우는 여섯 번 연속 공격이다. 강한 적에게 써라.']
    }); } },
  kerning_shop: { name: '잡화점 주인 샘', look: { skin: SKIN, hair: '#5affd8', hairStyle: 'spiky', shirt: '#3a3a4a', pants: '#2a2a36' },
    talk(npc) { return shopkeeper(npc, SHOPS.kerning, '커닝시티 편의점이야. 필요한 거 있어?'); } },
  kerning_weapon: { name: '무기상 지오', look: { skin: SKIN, hair: '#2a2230', beard: '#2a2230', shirt: '#6a2a5a', pants: '#2a1a2a' },
    talk(npc) { return shopkeeper(npc, SHOPS.kerningWeapon, '…좋은 물건은 그림자 속에 있는 법이지.'); } },
  jm: { name: '거리의 JM', look: { skin: '#e8c8a8', hair: '#c8c8d8', hairStyle: 'spiky', shirt: '#4a4a5a', pants: '#2a2a36', cape: '#6a2a3a' },
    async talk(npc) {
      if (await questTalk(npc, 'zombie', {
        low: '…거리의 JM이다. 지금 너한텐 볼일 없어.',
        offer: ['거리의 JM이다. 개미굴의 좀비버섯들이 커닝시티 지하까지 올라오고 있어.', '좀비버섯 10마리를 처리해 줘. 보수는 두둑이 주지.'],
        ask: '좀비버섯 10마리, 맡을래?',
        accept: '좋아. 개미굴 안쪽에 많을 거다.',
        progress: '좀비버섯은 개미굴에 있다.',
        done: '깔끔하군. 약속한 보수다.'
      })) return;
      await say(npc, '이 거리에서 네 이름을 모르는 놈은 없을 거다.');
    } }
};

// 보스 앞 대사
const BOSS_TALK = {
  mushmom: async () => {
    await say({ name: '머쉬맘', monster: 'mushmom' }, '뿌우우… 내 아이들을 괴롭힌 게 너구나! 용서하지 않겠다!');
    return ask({ name: '머쉬맘', monster: 'mushmom' }, '거대한 머쉬맘이 앞을 가로막았다!', ['싸운다', '물러난다']);
  },
  balrog: async () => {
    await say({ name: '???', monster: 'balrog' }, '……크르르르. 감히 내 잠을 깨운 것이 네놈이냐.');
    await say({ name: '주니어 발록', monster: 'balrog' }, '하찮은 모험가 따위가 이곳까지 오다니. 검은 마법사님의 부활을 위한 제물로 삼아 주마!');
    return ask({ name: '주니어 발록', monster: 'balrog' }, '주니어 발록의 검은 기운이 동굴을 가득 채운다…', ['싸운다!', '아직 준비가 안 됐다']);
  }
};
