/* 일본어 말하기 연습 - 메인 스크립트 */
'use strict';

// ===================================================================
// 저장소
// ===================================================================
const store = {
  get(k, d) { try { const v = localStorage.getItem('nh_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('nh_' + k, JSON.stringify(v)); } catch (e) { } }
};
const DEFAULT_SETTINGS = {
  rate: 0.9, slowRate: 0.6, autoPlay: true, autoMic: false, autoNext: false,
  showReading: true, showRomaji: true, showHangul: true, mode: 'repeat', hideMyLines: true
};
const settings = Object.assign({}, DEFAULT_SETTINGS, store.get('settings', {}));
let progress = store.get('progress', {});   // 문장 id -> 최고 점수
let wrong = store.get('wrong', {});         // 복습할 문장 id
let favs = store.get('favs', {});           // 즐겨찾기
let stats = store.get('stats', { days: {}, total: 0 });
const saveAll = () => { store.set('progress', progress); store.set('wrong', wrong); store.set('favs', favs); store.set('stats', stats); };
const saveSettings = () => store.set('settings', settings);

function todayKey(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function streak() {
  let n = 0; const d = new Date();
  if (!stats.days[todayKey(d)]) d.setDate(d.getDate() - 1);
  while (stats.days[todayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ===================================================================
// 데이터 정리
// ===================================================================
const ITEMS = {};        // id -> item
LESSONS.forEach(L => {
  L.list = L.items.map((a, i) => {
    const it = L.kana
      ? { id: L.id + '-' + i, jp: a[0], rd: a[0], ko: a[2], note: a[3] || '', alts: [a[1]], written: a[1], lesson: L }
      : { id: L.id + '-' + i, jp: a[0], rd: a[1], ko: a[2], note: a[3] || '', alts: a[4] || [], lesson: L };
    ITEMS[it.id] = it;
    return it;
  });
});
DIALOGUES.forEach(D => {
  D.list = D.lines.map((a, i) => ({ id: D.id + '-' + i, who: a[0], jp: a[1], rd: a[2], ko: a[3], alts: [] }));
});
const TOTAL_ITEMS = Object.keys(ITEMS).length;

// ===================================================================
// 가나 → 로마자 / 한글 발음
// ===================================================================
const toHira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const toKata = s => s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));

const R1 = {
  'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o', 'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
  'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go', 'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
  'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo', 'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
  'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do', 'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
  'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho', 'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
  'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po', 'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
  'や': 'ya', 'ゆ': 'yu', 'よ': 'yo', 'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro', 'わ': 'wa', 'を': 'o',
  'ゔ': 'vu', 'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o', 'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo',
  '、': ',', '。': '.', '？': '?', '！': '!', '〜': '~'
};
const R2 = {
  'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo', 'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo', 'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
  'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo', 'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho', 'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
  'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo', 'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo', 'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
  'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo', 'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
  'ふぁ': 'fa', 'ふぃ': 'fi', 'ふぇ': 'fe', 'ふぉ': 'fo', 'てぃ': 'ti', 'でぃ': 'di', 'とぅ': 'tu', 'どぅ': 'du', 'でゅ': 'dyu',
  'うぃ': 'wi', 'うぇ': 'we', 'うぉ': 'wo', 'ちぇ': 'che', 'しぇ': 'she', 'じぇ': 'je', 'ゔぁ': 'va', 'ゔぃ': 'vi', 'ゔぇ': 've', 'ゔぉ': 'vo'
};
const K1 = {
  'あ': '아', 'い': '이', 'う': '우', 'え': '에', 'お': '오', 'か': '카', 'き': '키', 'く': '쿠', 'け': '케', 'こ': '코',
  'が': '가', 'ぎ': '기', 'ぐ': '구', 'げ': '게', 'ご': '고', 'さ': '사', 'し': '시', 'す': '스', 'せ': '세', 'そ': '소',
  'ざ': '자', 'じ': '지', 'ず': '즈', 'ぜ': '제', 'ぞ': '조', 'た': '타', 'ち': '치', 'つ': '츠', 'て': '테', 'と': '토',
  'だ': '다', 'ぢ': '지', 'づ': '즈', 'で': '데', 'ど': '도', 'な': '나', 'に': '니', 'ぬ': '누', 'ね': '네', 'の': '노',
  'は': '하', 'ひ': '히', 'ふ': '후', 'へ': '헤', 'ほ': '호', 'ば': '바', 'び': '비', 'ぶ': '부', 'べ': '베', 'ぼ': '보',
  'ぱ': '파', 'ぴ': '피', 'ぷ': '푸', 'ぺ': '페', 'ぽ': '포', 'ま': '마', 'み': '미', 'む': '무', 'め': '메', 'も': '모',
  'や': '야', 'ゆ': '유', 'よ': '요', 'ら': '라', 'り': '리', 'る': '루', 'れ': '레', 'ろ': '로', 'わ': '와', 'を': '오',
  'ゔ': '부', 'ぁ': '아', 'ぃ': '이', 'ぅ': '우', 'ぇ': '에', 'ぉ': '오', 'ゃ': '야', 'ゅ': '유', 'ょ': '요',
  '、': ',', '。': '.', '？': '?', '！': '!', '〜': '~'
};
const K2 = {
  'きゃ': '캬', 'きゅ': '큐', 'きょ': '쿄', 'ぎゃ': '갸', 'ぎゅ': '규', 'ぎょ': '교', 'しゃ': '샤', 'しゅ': '슈', 'しょ': '쇼',
  'じゃ': '자', 'じゅ': '주', 'じょ': '조', 'ちゃ': '차', 'ちゅ': '추', 'ちょ': '초', 'にゃ': '냐', 'にゅ': '뉴', 'にょ': '뇨',
  'ひゃ': '햐', 'ひゅ': '휴', 'ひょ': '효', 'びゃ': '뱌', 'びゅ': '뷰', 'びょ': '뵤', 'ぴゃ': '퍄', 'ぴゅ': '퓨', 'ぴょ': '표',
  'みゃ': '먀', 'みゅ': '뮤', 'みょ': '묘', 'りゃ': '랴', 'りゅ': '류', 'りょ': '료',
  'ふぁ': '화', 'ふぃ': '휘', 'ふぇ': '훼', 'ふぉ': '훠', 'てぃ': '티', 'でぃ': '디', 'とぅ': '투', 'どぅ': '두', 'でゅ': '듀',
  'うぃ': '위', 'うぇ': '웨', 'うぉ': '워', 'ちぇ': '체', 'しぇ': '셰', 'じぇ': '제', 'ゔぁ': '바', 'ゔぃ': '비', 'ゔぇ': '베', 'ゔぉ': '보'
};
// 조사 'は' 'へ'를 [와] [에]로 읽는 단어
const WA_WORDS = { 'は': 1, 'では': 1, 'には': 1, 'とは': 1, 'へは': 1, 'からは': 1, 'までは': 1, 'こんにちは': 1, 'こんばんは': 1, 'それでは': 1, 'じつは': 1 };

function particleFix(tok) {
  const h = toHira(tok);
  if (h === 'へ') return 'え';
  if (h === 'を') return 'お';
  if (WA_WORDS[h]) return h.slice(0, -1) + 'わ';
  return h;
}

function romajiTok(tok, raw) {
  const h = raw ? toHira(tok) : particleFix(tok);
  let out = '';
  const next = j => { const two = h.substr(j, 2); return R2[two] || R1[h[j]] || ''; };
  for (let i = 0; i < h.length;) {
    const two = h.substr(i, 2);
    if (R2[two]) { out += R2[two]; i += 2; continue; }
    const c = h[i];
    if (c === 'っ') { const n = next(i + 1); out += n ? (n.indexOf('ch') === 0 ? 't' : n[0]) : ''; i++; continue; }
    if (c === 'ん') { const n = next(i + 1); out += (n && /^[aiueoy]/.test(n)) ? "n'" : 'n'; i++; continue; }
    if (c === 'ー') { const v = out.match(/[aiueo](?=[^aiueo]*$)/); out += v ? v[0] : '-'; i++; continue; }
    out += R1[c] !== undefined ? R1[c] : c;
    i++;
  }
  return out;
}
const romaji = rd => rd.split(/\s+/).filter(Boolean).map(romajiTok).join(' ');

function addJong(out, jong, fallback) {
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xAC00 && last <= 0xD7A3 && (last - 0xAC00) % 28 === 0) {
    return out.slice(0, -1) + String.fromCharCode(last + jong);
  }
  return out + fallback;
}
function hangulTok(tok, raw) {
  const h = raw ? toHira(tok) : particleFix(tok);
  let out = '';
  for (let i = 0; i < h.length;) {
    const two = h.substr(i, 2);
    if (K2[two]) { out += K2[two]; i += 2; continue; }
    const c = h[i];
    if (c === 'ん') { out = addJong(out, 4, 'ㄴ'); i++; continue; }
    if (c === 'っ') { out = addJong(out, 19, 'ㅅ'); i++; continue; }
    if (c === 'ー') { out += '-'; i++; continue; }
    out += K1[c] !== undefined ? K1[c] : c;
    i++;
  }
  return out;
}
const hangul = rd => rd.split(/\s+/).filter(Boolean).map(hangulTok).join(' ');

// ===================================================================
// 채점
// ===================================================================
const PUNCT = /[\s、。，．,.!！?？「」『』（）()・…〜~"'“”‘’:：;；\-–—_♪]/g;
function kanjiNum(m) {
  const D = { '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  const U = { '十': 10, '百': 100, '千': 1000 };
  let total = 0, sec = 0, num = -1;
  for (const c of m) {
    if (D[c] !== undefined) { num = num > 0 ? num * 10 + D[c] : D[c]; }
    else if (U[c]) { sec += (num < 0 ? 1 : num) * U[c]; num = -1; }
    else if (c === '万') { total += (sec + (num < 0 ? 0 : num) || 1) * 10000; sec = 0; num = -1; }
  }
  return String(total + sec + (num < 0 ? 0 : num));
}
function normBase(s) { return toHira((s || '').normalize('NFKC')).toLowerCase().replace(PUNCT, ''); }
const TSU = ['', 'ひとつ', 'ふたつ', 'みっつ', 'よっつ', 'いつつ', 'むっつ', 'ななつ', 'やっつ', 'ここのつ'];
function norm(s) {
  return normBase(s).replace(/[〇一二三四五六七八九十百千万]+/g, kanjiNum)
    .replace(/(^|\D)([1-9])つ/g, (m, a, d) => a + TSU[d])
    .replace(/(^|\D)1人/g, '$1ひとり').replace(/(^|\D)2人/g, '$1ふたり');
}

function lev(a, b) {
  a = [...a]; b = [...b];
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = new Array(n + 1), cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
function sim(a, b) {
  if (!a && !b) return 1;
  const len = Math.max([...a].length, [...b].length);
  return Math.max(0, 1 - lev(a, b) / len);
}

/** 인식 결과 후보들과 목표 문장을 비교해 점수(0-100)와 표시용 정보를 돌려준다. */
function grade(item, heardList) {
  const spoken = item.rd.split(/\s+/).filter(Boolean).map(particleFix).join('');
  const targets = [{ key: 'jp', text: item.jp }, { key: 'rd', text: item.rd }, { key: 'rd', text: spoken }].concat(item.alts.map(a => ({ key: 'alt', text: a })));
  let best = { s: -1 };
  heardList.forEach(h => {
    const hn = norm(h);
    targets.forEach(t => {
      const s = sim(norm(t.text), hn);
      if (s > best.s) best = { s, heard: h, target: t };
    });
  });
  const score = Math.round(best.s * 100);
  const shown = best.target && best.target.key === 'rd' ? item.rd : item.jp;
  return { score, heard: best.heard || '', diff: score >= 100 ? `<span class="ok">${esc(shown)}</span>` : diffHtml(shown, best.heard || '') };
}

function diffHtml(target, heard) {
  const hc = [...normBase(heard)];
  const tc = [...target];
  const tn = tc.map(c => normBase(c));
  const idx = []; const seq = [];
  tn.forEach((n, i) => { if (n) { for (const ch of n) { seq.push(ch); idx.push(i); } } });
  // LCS
  const m = seq.length, n = hc.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) {
    dp[i][j] = seq[i] === hc[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const ok = new Set();
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (seq[i] === hc[j]) { ok.add(idx[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return tc.map((c, k) => {
    if (!tn[k]) return esc(c);
    return `<span class="${ok.has(k) ? 'ok' : 'miss'}">${esc(c)}</span>`;
  }).join('');
}

function starsOf(score) { return score >= 90 ? 3 : score >= 75 ? 2 : score >= 55 ? 1 : 0; }
function starsHtml(score) {
  if (score === undefined) return '<span class="stars"><span class="off">☆☆☆</span></span>';
  const s = starsOf(score);
  return `<span class="stars">${'★'.repeat(s)}<span class="off">${'★'.repeat(3 - s)}</span></span>`;
}

function record(item, score) {
  if (!item.id || !ITEMS[item.id]) return;
  progress[item.id] = Math.max(progress[item.id] || 0, score);
  if (score < 75) wrong[item.id] = 1; else delete wrong[item.id];
  const k = todayKey();
  stats.days[k] = (stats.days[k] || 0) + 1;
  stats.total = (stats.total || 0) + 1;
  saveAll();
}

// ===================================================================
// 음성 (안드로이드 브리지 / 브라우저 대체)
// ===================================================================
const hasAndroid = typeof window.Android !== 'undefined';
const Speech = {
  ttsState: hasAndroid ? Android.ttsState() : ('speechSynthesis' in window ? 1 : -2),
  speakCb: null, seq: 0, listenCb: null, listening: false,
  ui: {},
  speak(text, rate) {
    return new Promise(res => {
      this.finishSpeak();
      const id = 'u' + (++this.seq);
      this.speakCb = { id, res };
      if (this.ui.onSpeak) this.ui.onSpeak(true);
      if (hasAndroid) Android.speak(text, rate || settings.rate, id);
      else if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ja-JP'; u.rate = rate || settings.rate;
        u.onend = u.onerror = () => window.onSpeakDone(id);
        speechSynthesis.speak(u);
      } else setTimeout(() => window.onSpeakDone(id), 600);
      setTimeout(() => window.onSpeakDone(id), 4000 + text.length * 400);
    });
  },
  finishSpeak() {
    const c = this.speakCb; this.speakCb = null;
    if (c) c.res();
    if (this.ui.onSpeak) this.ui.onSpeak(false);
  },
  stop() {
    if (hasAndroid) Android.stopSpeak(); else if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.finishSpeak();
    if (this.listening) this.cancelListen();
  },
  sttAvailable() {
    if (hasAndroid) { try { return Android.sttAvailable(); } catch (e) { return true; } }
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  },
  listen() {
    return new Promise((res, rej) => {
      if (this.listenCb) this.listenCb.rej(-1);
      this.listenCb = { res, rej };
      this.listening = true;
      this.setState('starting');
      if (hasAndroid) Android.listen();
      else this.browserListen();
    });
  },
  stopListen() { if (hasAndroid) Android.stopListen(); else if (this.rec) this.rec.stop(); },
  cancelListen() {
    const c = this.listenCb; this.listenCb = null; this.listening = false;
    if (hasAndroid) Android.cancelListen(); else if (this.rec) this.rec.abort();
    if (c) c.rej(-1);
    this.setState('idle');
  },
  setState(st) { if (this.ui.onState) this.ui.onState(st); },
  browserListen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setTimeout(() => window.onSttError(-100), 10); return; }
    const r = this.rec = new SR();
    r.lang = 'ja-JP'; r.interimResults = true; r.maxAlternatives = 5;
    r.onstart = () => window.onSttState('ready');
    r.onresult = e => {
      const res = e.results[e.results.length - 1];
      const arr = []; for (let i = 0; i < res.length; i++) arr.push(res[i].transcript);
      if (res.isFinal) window.onSttResult(arr); else window.onSttPartial(arr);
    };
    r.onerror = e => window.onSttError(e.error === 'no-speech' ? 6 : e.error === 'not-allowed' ? 9 : 7);
    r.start();
  }
};
window.onTtsState = s => { Speech.ttsState = s; if (current && current.name === 'home') render(); };
window.onSpeakStart = () => { };
window.onSpeakDone = id => { if (Speech.speakCb && Speech.speakCb.id === id) Speech.finishSpeak(); };
window.onSttState = st => Speech.setState(st);
window.onSttLevel = db => { if (Speech.ui.onLevel) Speech.ui.onLevel(db); };
window.onSttPartial = arr => { if (Speech.ui.onPartial) Speech.ui.onPartial(arr[0] || ''); };
window.onSttResult = arr => {
  const c = Speech.listenCb; Speech.listenCb = null; Speech.listening = false;
  Speech.setState('idle');
  if (c) c.res(arr || []);
};
window.onSttError = code => {
  const c = Speech.listenCb; Speech.listenCb = null; Speech.listening = false;
  Speech.setState('idle');
  if (c) c.rej(code);
};
const STT_ERR = {
  1: '네트워크 시간 초과예요. 인터넷 연결을 확인해 주세요.',
  2: '네트워크 오류예요. 인터넷 연결을 확인해 주세요.',
  3: '마이크 녹음 오류가 났어요.',
  4: '음성 인식 서버 오류예요. 잠시 후 다시 해 보세요.',
  5: '다시 한 번 눌러 주세요.',
  6: '목소리가 들리지 않았어요. 조금 더 크게 말해 보세요.',
  7: '알아듣지 못했어요. 또박또박 다시 말해 보세요.',
  8: '음성 인식이 바빠요. 잠시 후 다시 눌러 주세요.',
  9: '마이크 권한이 필요해요. 설정에서 마이크를 허용해 주세요.',
  11: '음성 인식 서버 연결이 끊겼어요. 다시 해 보세요.',
  12: '이 기기에서 일본어 음성 인식을 지원하지 않아요. Google 앱의 음성 언어에 일본어를 추가해 주세요.',
  13: '일본어 음성 인식 데이터가 없어요. Google 앱 음성 설정에서 일본어를 받아 주세요.',
  '-100': '이 기기에 음성 인식 기능이 없어요. Google 앱을 설치하거나 스스로 평가 모드를 사용하세요.'
};

// ===================================================================
// 화면 관리
// ===================================================================
const $ = s => document.querySelector(s);
const view = $('#view');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let stack = [];
let current = null;

function go(name, params, replace) {
  Speech.stop(); Speech.ui = {};
  if (current && current.cleanup) current.cleanup();
  if (replace) stack.pop();
  current = { name, params: params || {} };
  stack.push(current);
  render();
  window.scrollTo(0, 0);
}
function back() {
  if (stack.length <= 1) return false;
  Speech.stop(); Speech.ui = {};
  if (current && current.cleanup) current.cleanup();
  stack.pop();
  current = stack[stack.length - 1];
  render();
  window.scrollTo(0, current.scroll || 0);
  return true;
}
window.handleBack = back;
function render() {
  const f = SCREENS[current.name];
  $('#backBtn').classList.toggle('hidden', stack.length <= 1);
  $('#settingsBtn').style.visibility = current.name === 'settings' ? 'hidden' : 'visible';
  f(current.params, current);
}
function setTitle(t) { $('#title').textContent = t; }
window.addEventListener('scroll', () => { if (current) current.scroll = window.scrollY; }, { passive: true });
$('#backBtn').onclick = () => back();
$('#settingsBtn').onclick = () => go('settings');

let toastT;
function toast(msg, ms) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms || 2200);
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function lessonPct(L) {
  const done = L.list.filter(it => (progress[it.id] || 0) >= 75).length;
  return Math.round(done / L.list.length * 100);
}
function on(id, ev, fn) { const el = document.getElementById(id); if (el) el['on' + ev] = fn; return el; }

// ===================================================================
// 화면들
// ===================================================================
const SCREENS = {};

// ---------- 홈 ----------
SCREENS.home = function () {
  setTitle('일본어 말하기');
  const today = stats.days[todayKey()] || 0;
  const mastered = Object.keys(progress).filter(k => ITEMS[k] && progress[k] >= 75).length;
  const wrongN = Object.keys(wrong).filter(k => ITEMS[k]).length;
  const favN = Object.keys(favs).filter(k => ITEMS[k]).length;
  const last = settings.last && LESSONS.find(L => L.id === settings.last.lesson);
  let html = '';
  if (Speech.ttsState === -1 || Speech.ttsState === -2) {
    html += `<div class="banner">🔇 <b>일본어 음성(TTS)이 설치되어 있지 않아요.</b><br>설정 → 텍스트 음성 변환에서 <b>Google 음성 엔진</b>을 선택하고 <b>일본어</b> 음성 데이터를 받아 주세요.
      <br><button class="btn sm" id="ttsSet">음성 설정 열기</button></div>`;
  }
  html += `<div class="hero">
    <div class="big">오늘도 소리 내어 말해 봐요!</div>
    <div style="opacity:.9;font-size:14px">듣고 → 따라 말하고 → 점수 확인</div>
    <div class="stats">
      <div class="stat"><b>${today}</b><span>오늘 말한 문장</span></div>
      <div class="stat"><b>${streak()}일</b><span>연속 학습</span></div>
      <div class="stat"><b>${mastered}/${TOTAL_ITEMS}</b><span>익힌 문장</span></div>
    </div>
  </div>`;
  html += `<div class="quick">`;
  if (last) html += `<button class="wide" id="qContinue"><span class="qi">▶️</span><span><span class="qt">이어서 하기</span><span class="qs">${esc(last.title)} · ${settings.last.i + 1}번째 문장</span></span></button>`;
  html += `
    <button id="qKana"><span class="qi">あ</span><span class="qt">히라가나·가타카나</span><span class="qs">글자표 · 발음 · 퀴즈</span></button>
    <button id="qDlg"><span class="qi">💬</span><span class="qt">회화 롤플레이</span><span class="qs">${DIALOGUES.length}개 상황극</span></button>
    <button id="qRandom"><span class="qi">🎲</span><span class="qt">랜덤 10문장</span><span class="qs">전체에서 골라 연습</span></button>
    <button id="qReview"><span class="qi">🔁</span><span class="qt">복습하기</span><span class="qs">아쉬웠던 문장 ${wrongN}개</span></button>
    <button id="qFav"><span class="qi">⭐</span><span class="qt">즐겨찾기</span><span class="qs">${favN}개</span></button>
    <button id="qQuick"><span class="qi">⚡</span><span class="qt">빠른 말하기</span><span class="qs">한국어 보고 바로 일본어로</span></button>
  </div>`;
  LEVELS.forEach(lv => {
    const ls = LESSONS.filter(L => L.level === lv.id);
    if (!ls.length) return;
    html += `<div class="level-h">${esc(lv.title)}<small>${esc(lv.desc)}</small></div>`;
    ls.forEach(L => {
      const p = lessonPct(L);
      html += `<button class="lesson" data-l="${L.id}"><span class="ic">${L.icon}</span>
        <span class="meta"><div class="t">${esc(L.title)}</div><div class="d">${esc(L.desc)} · ${L.list.length}문장</div>
        <div class="bar"><i style="width:${p}%"></i></div></span><span class="pct">${p}%</span></button>`;
    });
  });
  html += `<p class="tip" style="text-align:center;margin-top:20px">총 ${LESSONS.length}개 레슨 · ${TOTAL_ITEMS}문장 · 회화 ${DIALOGUES.length}편</p>`;
  view.innerHTML = html;
  on('ttsSet', 'click', () => hasAndroid && Android.openTtsSettings());
  on('qContinue', 'click', () => go('practice', { lesson: last.id, start: settings.last.i }));
  on('qKana', 'click', () => go('kana', { tab: 'hira' }));
  on('qDlg', 'click', () => go('dialogues'));
  on('qRandom', 'click', () => {
    const pool = Object.values(ITEMS).filter(it => it.lesson.level >= 1);
    go('practice', { custom: shuffle(pool).slice(0, 10).map(i => i.id), title: '랜덤 10문장' });
  });
  on('qReview', 'click', () => {
    const ids = Object.keys(wrong).filter(k => ITEMS[k]);
    if (!ids.length) return toast('복습할 문장이 없어요. 잘하고 있어요! 👏');
    go('practice', { custom: shuffle(ids).slice(0, 20), title: '복습하기' });
  });
  on('qFav', 'click', () => {
    const ids = Object.keys(favs).filter(k => ITEMS[k]);
    if (!ids.length) return toast('연습 화면에서 ★을 눌러 즐겨찾기에 추가하세요.');
    go('practice', { custom: ids, title: '즐겨찾기' });
  });
  on('qQuick', 'click', () => {
    const pool = Object.values(ITEMS).filter(it => it.lesson.level >= 1);
    go('practice', { custom: shuffle(pool).slice(0, 15).map(i => i.id), title: '빠른 말하기', mode: 'recall' });
  });
  view.querySelectorAll('.lesson').forEach(b => b.onclick = () => go('lesson', { id: b.dataset.l }));
};

// ---------- 레슨 목록 ----------
SCREENS.lesson = function (p) {
  const L = LESSONS.find(x => x.id === p.id);
  setTitle(L.title);
  let html = `<div class="card"><div style="font-size:15px">${L.icon} ${esc(L.desc)}</div>`;
  if (L.tip) html += `<div class="note" style="margin-top:10px;font-size:14px;background:var(--blue-soft);color:#2C5DB0;border-radius:10px;padding:10px">💡 ${L.tip}</div>`;
  html += `<div class="col" style="margin-top:12px">
      <button class="btn" id="startRepeat">🔁 따라 말하기 (처음부터)</button>
      <div class="row"><button class="btn sub" id="startRecall">💭 보고 말하기</button><button class="btn sub" id="startShuffle">🔀 섞어서</button></div>
    </div></div>`;
  html += `<div class="card" style="padding:4px 12px">`;
  L.list.forEach((it, i) => {
    html += `<div class="item-row" data-i="${i}"><span class="n">${i + 1}</span>
      <span class="x"><div class="j ja" lang="ja">${esc(it.jp)}</div><div class="k">${esc(it.ko)}</div></span>${starsHtml(progress[it.id])}</div>`;
  });
  html += `</div>`;
  view.innerHTML = html;
  on('startRepeat', 'click', () => go('practice', { lesson: L.id, start: 0, mode: 'repeat' }));
  on('startRecall', 'click', () => go('practice', { lesson: L.id, start: 0, mode: 'recall' }));
  on('startShuffle', 'click', () => go('practice', { custom: shuffle(L.list.map(i => i.id)), title: L.title + ' (섞기)' }));
  view.querySelectorAll('.item-row').forEach(r => r.onclick = () => go('practice', { lesson: L.id, start: +r.dataset.i }));
};

// ---------- 연습 ----------
SCREENS.practice = function (p, scr) {
  if (!scr.st) {
    let items, title;
    if (p.lesson) { const L = LESSONS.find(x => x.id === p.lesson); items = L.list; title = L.title; }
    else { items = p.custom.map(id => ITEMS[id]).filter(Boolean); title = p.title; }
    scr.st = { items, title, i: p.start || 0, mode: p.mode || settings.mode, revealed: false, result: null, scores: {}, lesson: p.lesson, selfMode: !Speech.sttAvailable() };
  }
  const st = scr.st;
  setTitle(st.title);
  if (st.i >= st.items.length) return renderDone(st, scr);
  const it = st.items[st.i];
  if (st.lesson) { settings.last = { lesson: st.lesson, i: st.i }; saveSettings(); }
  const recall = st.mode === 'recall';
  const showJp = !recall || st.revealed || !!st.result;
  const pct = Math.round(st.i / st.items.length * 100);
  let reading = '';
  if (showJp) {
    if (it.written && it.written !== it.jp) reading += `<div class="rm">표기: <span class="ja" lang="ja">${esc(it.written)}</span></div>`;
    if (settings.showReading && toHira(it.rd.replace(PUNCT, '')) !== toHira(it.jp.replace(PUNCT, ''))) reading += `<div class="rd ja" lang="ja">${esc(it.rd)}</div>`;
    if (settings.showRomaji) reading += `<div class="rm">${esc(romaji(it.rd))}</div>`;
    if (settings.showHangul) reading += `<div class="hg">[${esc(hangul(it.rd))}]</div>`;
  }
  view.innerHTML = `
    <div class="pbar"><span class="cnt">${st.i + 1} / ${st.items.length}</span><div class="bar"><i style="width:${pct}%"></i></div>
      <button class="fav ${favs[it.id] ? 'on' : ''}" id="favBtn">★</button></div>
    <div class="modes"><button data-m="repeat" class="${recall ? '' : 'on'}">🔁 따라 말하기</button><button data-m="recall" class="${recall ? 'on' : ''}">💭 보고 말하기</button></div>
    <div class="card pcard ${recall ? 'recall' : ''}">
      ${recall ? `<div class="ko">${esc(it.ko)}</div>` : ''}
      <div class="jp ja ${showJp ? '' : 'hidden'}" lang="ja">${esc(it.jp)}</div>
      ${showJp ? reading : `<div class="tip">이 뜻을 일본어로 말해 보세요</div><button class="btn sm ghost reveal" id="hintBtn">💡 첫 글자 힌트</button> <button class="btn sm ghost reveal" id="revealBtn">👀 정답 보기</button><div id="hintBox" class="rd ja" style="margin-top:8px"></div>`}
      ${!recall ? `<div class="ko" style="margin-top:8px">${esc(it.ko)}</div>` : ''}
      ${it.note && showJp ? `<div class="note">💡 ${esc(it.note)}</div>` : ''}
    </div>
    <div class="listen-row"><button class="btn sub" id="playBtn">🔊 ${recall && !showJp ? '정답 듣기' : '듣기'}</button><button class="btn sub" id="slowBtn">🐢 천천히</button></div>
    ${st.selfMode ? `
      <div class="card" style="text-align:center"><div class="tip">🎙 음성 인식을 쓸 수 없어 <b>스스로 평가</b> 모드예요.<br>소리 내어 말한 뒤 스스로 평가해 주세요.</div>
      <div class="row"><button class="btn ghost" id="selfBad">😅 다시 할래요</button><button class="btn green" id="selfGood">😊 잘 말했어요</button></div></div>` : `
      <div class="mic-wrap"><button class="mic" id="micBtn"><span class="ring" id="ring"></span>🎤</button><div class="mic-label" id="micLabel">마이크를 누르고 일본어로 말하세요</div></div>
      <div class="partial ja" id="partial"></div>`}
    <div id="resultBox">${st.result ? resultHtml(st.result) : ''}</div>
    <div class="nav-row"><button class="btn ghost" id="prevBtn" ${st.i === 0 ? 'disabled' : ''}>‹ 이전</button><button class="btn" id="nextBtn">${st.i === st.items.length - 1 ? '완료 ✓' : '다음 ›'}</button></div>
  `;
  const playBtn = $('#playBtn'), slowBtn = $('#slowBtn');
  let playing = null;
  Speech.ui.onSpeak = on => { if (!on && playing) { playing.classList.remove('playing'); playing = null; } };
  const play = (btn, rate) => {
    if (recall && !st.revealed && !st.result) { st.revealed = true; render(); return Speech.speak(it.jp, rate); }
    Speech.stop();
    playing = btn; btn.classList.add('playing');
    return Speech.speak(it.jp, rate);
  };
  playBtn.onclick = () => play(playBtn, settings.rate);
  slowBtn.onclick = () => play(slowBtn, settings.slowRate);
  on('favBtn', 'click', () => { if (favs[it.id]) delete favs[it.id]; else favs[it.id] = 1; saveAll(); $('#favBtn').classList.toggle('on', !!favs[it.id]); toast(favs[it.id] ? '즐겨찾기에 추가했어요' : '즐겨찾기에서 뺐어요', 1200); });
  view.querySelectorAll('.modes button').forEach(b => b.onclick = () => {
    st.mode = b.dataset.m; settings.mode = st.mode; saveSettings(); st.revealed = false; st.result = null; render(); autoStart();
  });
  on('revealBtn', 'click', () => { st.revealed = true; render(); });
  on('hintBtn', 'click', () => {
    const words = it.rd.split(/\s+/);
    $('#hintBox').textContent = words.map((w, k) => k === 0 ? w.slice(0, 2) + '…' : '').join('') + `  (${words.length}단어)`;
  });
  on('prevBtn', 'click', () => { if (st.i > 0) { st.i--; st.result = null; st.revealed = false; render(); window.scrollTo(0, 0); autoStart(); } });
  const next = () => { st.i++; st.result = null; st.revealed = false; render(); window.scrollTo(0, 0); autoStart(); };
  on('nextBtn', 'click', next);

  const applyScore = score => {
    st.scores[st.i] = Math.max(st.scores[st.i] || 0, score);
    record(it, score);
  };
  on('selfGood', 'click', () => { applyScore(85); st.result = { score: 85, self: true }; render(); if (settings.autoNext) setTimeout(() => { if (current === scr && st.items[st.i] === it) next(); }, 900); });
  on('selfBad', 'click', () => { applyScore(40); st.result = { score: 40, self: true }; render(); });

  const mic = $('#micBtn');
  if (mic) {
    const label = $('#micLabel'), ring = $('#ring'), partial = $('#partial');
    Speech.ui.onState = s => {
      mic.classList.toggle('on', s === 'ready' || s === 'speaking' || s === 'starting');
      mic.classList.toggle('busy', s === 'processing');
      label.textContent = { starting: '준비 중…', ready: '듣고 있어요… 말해 보세요 🗣', speaking: '듣고 있어요… (다 말하면 다시 눌러도 돼요)', processing: '분석 중…', idle: '마이크를 누르고 일본어로 말하세요' }[s] || '';
      if (s === 'idle') ring.style.transform = 'scale(1)';
    };
    Speech.ui.onLevel = db => { const k = Math.max(0, Math.min(1, (db + 2) / 12)); ring.style.transform = `scale(${1 + k * 0.4})`; };
    Speech.ui.onPartial = t => { partial.textContent = t; };
    const doListen = () => {
      if (Speech.listening) { Speech.stopListen(); return; }
      Speech.stop();
      partial.textContent = '';
      Speech.listen().then(list => {
        if (current !== scr || st.items[st.i] !== it) return;
        if (!list.length) { toast(STT_ERR[7]); return; }
        const r = grade(it, list);
        applyScore(r.score);
        st.result = r;
        render();
        if (settings.autoNext && r.score >= 75) setTimeout(() => { if (current === scr && st.items[st.i] === it) next(); }, 1600);
      }).catch(code => {
        if (code === -1) return;
        toast(STT_ERR[code] || ('음성 인식 오류 (' + code + ')'), 3000);
        if (code === -100) { st.selfMode = true; render(); }
        if (code === 9 && hasAndroid) setTimeout(() => { if (confirm('마이크 권한 설정 화면을 열까요?')) Android.openAppSettings(); }, 300);
      });
    };
    mic.onclick = doListen;
    scr.listen = doListen;
  }
  const rb = $('#replayBtn'); if (rb) rb.onclick = () => play(playBtn, settings.rate);
  const rt = $('#retryBtn'); if (rt) rt.onclick = () => { st.result = null; render(); if (scr.listen) scr.listen(); };

  function autoStart() {
    const s2 = scr.st; if (!s2 || s2.i >= s2.items.length) return;
    if (s2.mode === 'repeat' && settings.autoPlay) {
      const target = s2.items[s2.i];
      setTimeout(() => {
        if (current !== scr || s2.items[s2.i] !== target) return;
        Speech.speak(target.jp, settings.rate).then(() => {
          if (settings.autoMic && current === scr && s2.items[s2.i] === target && !s2.result && scr.listen && !s2.selfMode) setTimeout(() => scr.listen(), 250);
        });
      }, 300);
    }
  }
  if (!scr.started) { scr.started = true; autoStart(); }
};

function resultHtml(r) {
  const cls = r.score >= 75 ? 'good' : r.score >= 55 ? 'mid' : 'bad';
  const msg = r.self ? (r.score >= 75 ? '좋아요! 다음 문장으로 가 볼까요? 😊' : '한 번 더 들어 보고 따라 해 봐요 💪')
    : r.score >= 90 ? '완벽해요! 🎉' : r.score >= 75 ? '아주 좋아요! 👍' : r.score >= 55 ? '거의 다 왔어요! 빨간 부분을 다시 들어 보세요' : '다시 도전해 봐요 💪 천천히 듣고 따라 해 보세요';
  return `<div class="result ${cls}">
    ${r.self ? '' : `<div class="score">${r.score}점 ${starsHtml(r.score)}</div>`}
    <div class="msg">${msg}</div>
    ${r.self ? '' : `<div class="diff ja" lang="ja">${r.diff}</div><div class="heard ja">🗣 내가 말한 것: 「${esc(r.heard)}」</div>`}
    <div class="row" style="margin-top:10px"><button class="btn sm ghost" id="replayBtn">🔊 다시 듣기</button>${r.self ? '' : '<button class="btn sm sub" id="retryBtn">🎤 다시 말하기</button>'}</div>
  </div>`;
}

function renderDone(st, scr) {
  const vals = Object.values(st.scores);
  const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  const weak = st.items.filter((it, i) => st.scores[i] !== undefined && st.scores[i] < 75);
  view.innerHTML = `<div class="card done-card"><div class="big">${avg >= 85 ? '🏆' : avg >= 65 ? '🎉' : '💪'}</div>
    <h2>연습 완료!</h2>
    <p>${st.items.length}문장 중 <b>${vals.length}문장</b>을 말했어요.<br>평균 점수 <b>${avg}점</b></p>
    ${weak.length ? `<p class="tip">아쉬운 문장 ${weak.length}개는 '복습하기'에 저장됐어요.</p>` : ''}
    <div class="col">
      ${weak.length ? '<button class="btn" id="weakBtn">🔁 아쉬운 문장만 다시</button>' : ''}
      <button class="btn sub" id="againBtn">처음부터 다시</button>
      <button class="btn ghost" id="homeBtn">목록으로</button>
    </div></div>`;
  on('weakBtn', 'click', () => go('practice', { custom: weak.map(i => i.id), title: '아쉬운 문장 다시' }, true));
  on('againBtn', 'click', () => { st.i = 0; st.scores = {}; st.result = null; scr.started = false; render(); });
  on('homeBtn', 'click', () => back());
}

// ---------- 가나 ----------
SCREENS.kana = function (p, scr) {
  setTitle('히라가나 · 가타카나');
  const tab = p.tab;
  let html = `<div class="tabs">
    <button data-t="hira" class="${tab === 'hira' ? 'on' : ''}">히라가나</button>
    <button data-t="kata" class="${tab === 'kata' ? 'on' : ''}">가타카나</button>
    <button data-t="quiz" class="${tab === 'quiz' ? 'on' : ''}">읽기 퀴즈</button>
    <button data-t="lquiz" class="${tab === 'lquiz' ? 'on' : ''}">듣기 퀴즈</button></div>`;
  if (tab === 'hira' || tab === 'kata') {
    const conv = tab === 'kata' ? toKata : (s => s);
    html += `<p class="tip">글자를 누르면 발음을 들을 수 있어요. 소리 내어 따라 읽어 보세요.</p>`;
    KANA_TABLE.forEach(sec => {
      html += `<div class="sec-t">${sec.title}</div><div class="kgrid ${sec.cols === 3 ? 'y3' : ''}">`;
      sec.rows.forEach(row => row.forEach(k => {
        if (!k) { html += `<div class="kcell empty"></div>`; return; }
        const kk = conv(k);
        html += `<button class="kcell" data-k="${kk}"><div class="kk ja" lang="ja">${kk}</div><div class="kr">${romajiTok(k, 1)}</div><div class="kh">${hangulTok(k, 1)}</div></button>`;
      }));
      html += `</div>`;
    });
    html += `<div class="sec-t">발음 규칙</div><div class="card" style="font-size:14px">${KANA_RULES}</div>`;
    view.innerHTML = html;
    view.querySelectorAll('.kcell[data-k]').forEach(c => c.onclick = () => Speech.speak(c.dataset.k, 0.8));
  } else {
    if (!scr.quiz || scr.quiz.type !== tab) scr.quiz = { type: tab, n: 0, ok: 0, script: scr.quiz ? scr.quiz.script : 'hira' };
    const q = scr.quiz;
    html += `<div class="tabs"><button data-s="hira" class="${q.script === 'hira' ? 'on' : ''}">히라가나</button><button data-s="kata" class="${q.script === 'kata' ? 'on' : ''}">가타카나</button><button data-s="both" class="${q.script === 'both' ? 'on' : ''}">섞기</button></div>`;
    view.innerHTML = html + `<div class="card" id="quizBox"></div>`;
    view.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { q.script = b.dataset.s; q.n = 0; q.ok = 0; render(); });
    nextQuiz(q);
  }
  view.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { current.params.tab = b.dataset.t; render(); });
};
function nextQuiz(q) {
  const box = $('#quizBox');
  if (q.n >= 10) {
    box.innerHTML = `<div class="done-card"><div class="big">${q.ok >= 9 ? '🏆' : q.ok >= 6 ? '🎉' : '💪'}</div><h2>${q.ok} / 10</h2><button class="btn" id="qAgain">다시 하기</button></div>`;
    on('qAgain', 'click', () => { q.n = 0; q.ok = 0; nextQuiz(q); });
    return;
  }
  const all = KANA_TABLE.flatMap(s => s.rows.flat()).filter(Boolean);
  const ans = all[Math.floor(Math.random() * all.length)];
  const seen = { [romajiTok(ans, 1)]: 1 };
  const others = shuffle(all).filter(k => { const r = romajiTok(k, 1); if (seen[r]) return false; seen[r] = 1; return true; }).slice(0, 3);
  const opts = shuffle([ans].concat(others));
  const kata = q.script === 'kata' || (q.script === 'both' && Math.random() < 0.5);
  const show = k => kata ? toKata(k) : k;
  const listen = q.type === 'lquiz';
  box.innerHTML = `<div class="tip" style="text-align:center">${q.n + 1} / 10 · 맞힌 개수 ${q.ok}</div>
    ${listen ? `<div style="text-align:center;margin:20px 0"><button class="btn" id="qPlay" style="font-size:22px;padding:18px 28px">🔊 소리 듣기</button><div class="tip">들은 글자를 고르세요</div></div>`
      : `<div class="quiz-q ja" lang="ja">${show(ans)}</div><div class="tip" style="text-align:center">어떻게 읽을까요?</div>`}
    <div class="quiz-opts">${opts.map(o => `<button class="btn ghost ${listen ? 'ja' : ''}" data-o="${o}">${listen ? show(o) : romajiTok(o, 1) + ' · ' + hangulTok(o, 1)}</button>`).join('')}</div>`;
  const say = () => Speech.speak(show(ans), 0.8);
  if (listen) { on('qPlay', 'click', say); setTimeout(say, 300); }
  box.querySelectorAll('[data-o]').forEach(b => b.onclick = () => {
    if (box.dataset.lock === '1') return;
    box.dataset.lock = '1';
    const right = b.dataset.o === ans;
    if (right) q.ok++;
    b.classList.add(right ? 'right' : 'wrong');
    box.querySelectorAll('[data-o]').forEach(x => { if (x.dataset.o === ans) x.classList.add('right'); });
    say().then(() => setTimeout(() => { box.dataset.lock = '0'; q.n++; if ($('#quizBox') === box) nextQuiz(q); }, right ? 300 : 900));
  });
}

// ---------- 회화 목록 ----------
SCREENS.dialogues = function () {
  setTitle('회화 롤플레이');
  let html = `<p class="tip">상대 역할은 앱이 말하고, 내 차례에는 내가 일본어로 말해요. 먼저 '전체 듣기'로 흐름을 익힌 뒤 도전해 보세요.</p>`;
  DIALOGUES.forEach(d => {
    const done = store.get('dlg_' + d.id, null);
    html += `<button class="dlg-row" data-d="${d.id}"><span style="font-size:30px">${d.icon}</span><span style="flex:1"><b>${esc(d.title)}</b><div class="tip" style="margin:0">${esc(d.desc)} · ${d.lines.length}줄</div></span>${done !== null ? `<span class="stars">${done}점</span>` : ''}</button>`;
  });
  view.innerHTML = html;
  view.querySelectorAll('[data-d]').forEach(b => b.onclick = () => go('dialogue', { id: b.dataset.d }));
};

// ---------- 회화 ----------
SCREENS.dialogue = function (p, scr) {
  const d = DIALOGUES.find(x => x.id === p.id);
  setTitle(d.title);
  if (!scr.st) scr.st = { role: null, i: 0, scores: {}, results: {} };
  const st = scr.st;
  const roleName = r => d.roles[r];
  if (!st.role) {
    let html = `<div class="card"><div>${d.icon} ${esc(d.desc)}</div>
      <div class="col" style="margin-top:12px">
        <button class="btn sub" id="playAll">🔊 전체 듣기</button>
        <button class="btn" data-r="B">🎤 '${esc(roleName('B'))}' 역할로 말하기</button>
        <button class="btn blue" data-r="A">🎤 '${esc(roleName('A'))}' 역할로 말하기</button>
      </div></div><div class="chat">`;
    d.list.forEach((l, i) => { html += bubbleHtml(d, l, i, 'B', false, true); });
    html += `</div>`;
    view.innerHTML = html;
    let stop = false;
    scr.cleanup = () => { stop = true; };
    on('playAll', 'click', async () => {
      stop = false;
      for (let i = 0; i < d.list.length && !stop; i++) {
        view.querySelectorAll('.bubble').forEach(b => b.classList.remove('cur'));
        const b = view.querySelector(`.bubble[data-i="${i}"]`);
        if (b) { b.classList.add('cur'); b.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        await Speech.speak(d.list[i].jp, settings.rate);
        await new Promise(r => setTimeout(r, 350));
      }
    });
    view.querySelectorAll('.bubble').forEach(b => b.onclick = () => Speech.speak(d.list[+b.dataset.i].jp, settings.rate));
    view.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { stop = true; Speech.stop(); st.role = b.dataset.r; st.i = 0; st.scores = {}; st.results = {}; render(); });
    return;
  }
  // 롤플레이 진행
  let html = `<div class="row" style="margin-bottom:10px"><button class="btn sm ghost" id="hideBtn">${settings.hideMyLines ? '🙈 내 대사 숨김' : '👀 내 대사 보임'}</button><button class="btn sm ghost" id="restartBtn">↺ 처음부터</button></div><div class="chat">`;
  for (let i = 0; i <= Math.min(st.i, d.list.length - 1); i++) html += bubbleHtml(d, d.list[i], i, st.role, i === st.i, false, st.results[i]);
  html += `</div>`;
  if (st.i >= d.list.length) {
    const vals = Object.values(st.scores);
    const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    const prev = store.get('dlg_' + d.id, 0);
    if (avg > prev) store.set('dlg_' + d.id, avg);
    html += `<div class="card done-card"><div class="big">${avg >= 85 ? '🏆' : '🎉'}</div><h2>대화 완료! 평균 ${avg}점</h2>
      <div class="col"><button class="btn" id="againBtn">다시 하기</button><button class="btn sub" id="swapBtn">역할 바꿔서 하기</button><button class="btn ghost" id="listBtn">회화 목록</button></div></div>`;
    view.innerHTML = html;
    on('againBtn', 'click', () => { st.i = 0; st.scores = {}; st.results = {}; render(); });
    on('swapBtn', 'click', () => { st.role = st.role === 'A' ? 'B' : 'A'; st.i = 0; st.scores = {}; st.results = {}; render(); });
    on('listBtn', 'click', () => back());
    bindDlgTop();
    return;
  }
  const line = d.list[st.i];
  const mine = line.who === st.role;
  if (mine) {
    const r = st.results[st.i];
    html += `<div class="dlg-panel card">
      <div class="tip" style="margin:0 0 6px">내 차례! <b>${esc(line.ko)}</b></div>
      <div class="row"><button class="btn sm sub" id="hintPlay">🔊 힌트 듣기</button><button class="btn sm ghost" id="skipBtn">건너뛰기 ›</button></div>
      <div class="mic-wrap" style="margin:12px 0 4px"><button class="mic" id="micBtn"><span class="ring" id="ring"></span>🎤</button><div class="mic-label" id="micLabel">${r ? '' : '마이크를 누르고 말하세요'}</div></div>
      <div class="partial ja" id="partial"></div>
      ${r ? resultHtml(r) + `<button class="btn" style="width:100%;margin-top:8px" id="goNext">다음 ›</button>` : ''}
    </div>`;
  }
  view.innerHTML = html;
  bindDlgTop();
  const cur = view.querySelector('.bubble.cur');
  if (cur) cur.scrollIntoView({ block: 'center' });
  if (mine) window.scrollTo(0, document.body.scrollHeight);
  const advance = () => { st.i++; render(); };
  if (!mine) {
    const idx = st.i;
    setTimeout(() => {
      if (current !== scr || st.i !== idx) return;
      Speech.speak(line.jp, settings.rate).then(() => setTimeout(() => { if (current === scr && st.i === idx) advance(); }, 400));
    }, 350);
    return;
  }
  on('hintPlay', 'click', () => Speech.speak(line.jp, settings.slowRate));
  on('skipBtn', 'click', advance);
  on('goNext', 'click', advance);
  const rb = $('#replayBtn'); if (rb) rb.onclick = () => Speech.speak(line.jp, settings.rate);
  const mic = $('#micBtn'), label = $('#micLabel'), ring = $('#ring'), partial = $('#partial');
  Speech.ui.onState = s => {
    mic.classList.toggle('on', s === 'ready' || s === 'speaking' || s === 'starting');
    mic.classList.toggle('busy', s === 'processing');
    label.textContent = { starting: '준비 중…', ready: '듣고 있어요… 🗣', speaking: '듣고 있어요…', processing: '분석 중…', idle: '' }[s] || '';
  };
  Speech.ui.onLevel = db => { const k = Math.max(0, Math.min(1, (db + 2) / 12)); ring.style.transform = `scale(${1 + k * 0.4})`; };
  Speech.ui.onPartial = t => { partial.textContent = t; };
  const listen = () => {
    if (Speech.listening) { Speech.stopListen(); return; }
    Speech.stop();
    const idx = st.i;
    Speech.listen().then(list => {
      if (current !== scr || st.i !== idx || !list.length) return;
      const r = grade(line, list);
      st.scores[idx] = Math.max(st.scores[idx] || 0, r.score);
      st.results[idx] = r;
      const k = todayKey(); stats.days[k] = (stats.days[k] || 0) + 1; stats.total++; saveAll();
      render();
      if (r.score >= 75 && settings.autoNext) setTimeout(() => { if (current === scr && st.i === idx) advance(); }, 1500);
    }).catch(code => { if (code !== -1) toast(STT_ERR[code] || ('음성 인식 오류 (' + code + ')'), 3000); });
  };
  mic.onclick = listen;
  const rt = $('#retryBtn'); if (rt) rt.onclick = () => { delete st.results[st.i]; render(); listen(); };

  function bindDlgTop() {
    on('hideBtn', 'click', () => { settings.hideMyLines = !settings.hideMyLines; saveSettings(); render(); });
    on('restartBtn', 'click', () => { Speech.stop(); st.i = 0; st.scores = {}; st.results = {}; render(); });
    view.querySelectorAll('.bubble').forEach(b => b.onclick = () => { const i = +b.dataset.i; if (i < st.i || st.results[i]) Speech.speak(d.list[i].jp, settings.rate); });
  }
};
function bubbleHtml(d, l, i, role, isCur, preview, result) {
  const mine = l.who === role;
  const hide = !preview && mine && settings.hideMyLines && !result;
  return `<div class="bubble ${mine ? 'me' : 'you'} ${isCur ? 'cur' : ''}" data-i="${i}">
    <div class="who">${esc(d.roles[l.who])}${result ? ` · <span class="sc">${result.score}점</span>` : ''}</div>
    <div class="j ja ${hide ? 'blur' : ''}" lang="ja">${esc(l.jp)}</div>
    ${hide ? '' : `<div class="r ja">${esc(l.rd)}</div>`}
    <div class="k">${esc(l.ko)}</div></div>`;
}

// ---------- 설정 ----------
SCREENS.settings = function () {
  setTitle('설정');
  const sw = (k, t, s) => `<div class="set-row"><span>${t}${s ? `<small>${s}</small>` : ''}</span><button class="switch ${settings[k] ? 'on' : ''}" data-k="${k}"></button></div>`;
  view.innerHTML = `
    <div class="card">
      <div class="set-row" style="display:block"><div>말하기 속도 <b id="rateV">${settings.rate.toFixed(2)}</b></div><input type="range" id="rate" min="0.5" max="1.3" step="0.05" value="${settings.rate}"></div>
      <div class="set-row" style="display:block"><div>천천히 속도 <b id="slowV">${settings.slowRate.toFixed(2)}</b></div><input type="range" id="slow" min="0.3" max="0.9" step="0.05" value="${settings.slowRate}"></div>
      <div class="set-row"><span>소리 테스트</span><button class="btn sm sub" id="testBtn">🔊 こんにちは</button></div>
    </div>
    <div class="card">
      ${sw('autoPlay', '문장 자동 재생', '따라 말하기에서 문장이 바뀌면 바로 들려줘요')}
      ${sw('autoMic', '듣고 나서 자동 마이크', '발음을 들은 뒤 바로 마이크가 켜져요')}
      ${sw('autoNext', '잘 말하면 자동 다음', '75점 이상이면 다음 문장으로 넘어가요')}
    </div>
    <div class="card">
      ${sw('showReading', '히라가나 읽기 표시')}
      ${sw('showRomaji', '로마자 표시')}
      ${sw('showHangul', '한글 발음 표시', '정확한 발음은 꼭 소리로 확인하세요')}
    </div>
    <div class="card col">
      <button class="btn sub" id="ttsBtn">🗣 음성(TTS) 설정 열기</button>
      <button class="btn sub" id="permBtn">🎙 앱 권한 설정 열기</button>
      <button class="btn ghost" id="resetBtn">학습 기록 초기화</button>
    </div>
    <div class="card" style="font-size:14px;color:var(--sub)">
      <b>음성이 안 나오거나 인식이 안 될 때</b><br>
      • 휴대폰 설정 → 텍스트 음성 변환(TTS) → Google 음성 엔진 → 일본어 음성 데이터 설치<br>
      • 음성 인식은 Google 앱(또는 음성 서비스)이 필요하고, 보통 인터넷 연결이 필요해요.<br>
      • Google 앱 설정 → 음성 → 언어에 일본어를 추가하면 인식이 더 정확해져요.<br><br>
      버전 1.0 · 레슨 ${LESSONS.length}개 · ${TOTAL_ITEMS}문장 · 회화 ${DIALOGUES.length}편
    </div>`;
  view.querySelectorAll('.switch').forEach(b => b.onclick = () => { settings[b.dataset.k] = !settings[b.dataset.k]; saveSettings(); b.classList.toggle('on', settings[b.dataset.k]); });
  $('#rate').oninput = e => { settings.rate = +e.target.value; $('#rateV').textContent = settings.rate.toFixed(2); saveSettings(); };
  $('#slow').oninput = e => { settings.slowRate = +e.target.value; $('#slowV').textContent = settings.slowRate.toFixed(2); saveSettings(); };
  on('testBtn', 'click', () => Speech.speak('こんにちは。日本語を話しましょう。', settings.rate));
  on('ttsBtn', 'click', () => hasAndroid ? Android.openTtsSettings() : toast('안드로이드 앱에서만 가능해요'));
  on('permBtn', 'click', () => hasAndroid ? Android.openAppSettings() : toast('안드로이드 앱에서만 가능해요'));
  on('resetBtn', 'click', () => {
    if (!confirm('모든 학습 기록(점수, 복습, 즐겨찾기)을 지울까요?')) return;
    progress = {}; wrong = {}; favs = {}; stats = { days: {}, total: 0 }; saveAll();
    toast('초기화했어요');
  });
};

// 시작
go('home');
// 페이지가 뜨기 전에 TTS 준비가 끝났을 수 있으니 한 번 더 확인
if (hasAndroid) [800, 2500].forEach(t => setTimeout(() => {
  const s = Android.ttsState();
  if (s !== Speech.ttsState) window.onTtsState(s);
}, t));
