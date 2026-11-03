// 팝업 / 설정 페이지
const D = self.YST_DEFAULTS;
const $ = (id) => document.getElementById(id);
const FIELDS = ['enabled', 'provider', 'geminiApiKey', 'geminiModel', 'cloudApiKey', 'cloudProjectId',
  'targetLang', 'displayMode', 'fontScale', 'autoEnableCC'];

let settings = { ...D };

function fillSelect(el, items) {
  for (const [value, label] of items) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    el.appendChild(o);
  }
}

function setMessage(text, kind = '') {
  const m = $('message');
  m.textContent = text;
  m.className = `message ${kind}`;
}

function updateVisibility() {
  for (const el of document.querySelectorAll('[data-provider]')) {
    el.hidden = !el.dataset.provider.split(' ').includes(settings.provider);
  }
  $('fontScaleOut').textContent = `${Math.round(settings.fontScale * 100)}%`;
}

function readField(id) {
  const el = $(id);
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'range') return parseFloat(el.value);
  return el.value.trim();
}

function writeField(id, value) {
  const el = $(id);
  if (el.type === 'checkbox') el.checked = !!value;
  else el.value = value ?? '';
}

let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ settings }), 250);
}

async function init() {
  fillSelect($('provider'), self.YST_PROVIDERS);
  fillSelect($('targetLang'), self.YST_LANGS.map(([c, name]) => [c, name]));
  const { settings: saved } = await chrome.storage.local.get('settings');
  settings = { ...D, ...(saved || {}) };
  if (!saved) chrome.storage.local.set({ settings });
  for (const id of FIELDS) {
    writeField(id, settings[id]);
    const el = $(id);
    const ev = el.type === 'text' || el.type === 'password' || el.type === 'range' ? 'input' : 'change';
    el.addEventListener(ev, () => {
      settings[id] = readField(id);
      if (id === 'geminiModel' && !settings[id]) settings[id] = D.geminiModel;
      updateVisibility();
      save();
    });
  }
  updateVisibility();
  if (settings.provider === 'gemini' && !settings.geminiApiKey) {
    setMessage('Gemini API 키를 입력하면 번역이 시작됩니다. 키 없이 쓰려면 엔진을 "Google 번역 (무료)"로 바꾸세요.');
  }
}

for (const btn of document.querySelectorAll('[data-toggle]')) {
  btn.addEventListener('click', () => {
    const input = $(btn.dataset.toggle);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.textContent = show ? '숨기기' : '보기';
  });
}

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : res);
    });
  });
}

$('loadModels').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  setMessage('모델 목록을 불러오는 중…');
  const res = await send({ type: 'listModels', apiKey: settings.geminiApiKey });
  btn.disabled = false;
  if (!res || !res.ok) return setMessage(res ? res.error : '실패', 'err');
  const list = $('modelList');
  list.textContent = '';
  const aliases = [['gemini-flash-latest', '최신 Flash (권장)'], ['gemini-flash-lite-latest', '최신 Flash-Lite'], ['gemini-pro-latest', '최신 Pro']];
  const seen = new Set();
  for (const [id, name] of [...aliases, ...res.models.map((m) => [m.id, m.name])]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const o = document.createElement('option');
    o.value = id;
    o.textContent = name;
    list.appendChild(o);
  }
  setMessage(`모델 ${res.models.length}개를 불러왔습니다. 모델 칸을 비우고 클릭하면 목록이 보입니다.`, 'ok');
  $('geminiModel').focus();
});

$('test').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  clearTimeout(saveTimer);
  await chrome.storage.local.set({ settings });
  setMessage('번역 테스트 중…');
  const res = await send({ type: 'test' });
  btn.disabled = false;
  if (!res || !res.ok) return setMessage(`실패: ${res ? res.error : '응답 없음'}`, 'err');
  setMessage(`성공 (${res.ms}ms)\n${res.source}\n→ ${res.result}`, 'ok');
});

$('clearCache').addEventListener('click', async () => {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith('ystc:'));
  await chrome.storage.local.remove([...keys, 'ystcIndex']);
  setMessage(`저장된 번역 ${keys.length}개를 지웠습니다.`, 'ok');
});

init();
