// 백그라운드 서비스 워커: 번역 API 호출을 담당합니다.
importScripts('defaults.js');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handlers = {
    translate: () => handleTranslate(msg),
    listModels: () => listGeminiModels(msg.apiKey),
    test: () => handleTest(msg),
  };
  const h = handlers[msg && msg.type];
  if (!h) return false;
  h().then(
    (result) => sendResponse({ ok: true, ...result }),
    (err) => sendResponse({
      ok: false,
      error: (err && err.message) || String(err),
      fatal: !!(err && err.fatal),
      retryAfter: (err && err.retryAfter) || 0,
    }),
  );
  return true; // 비동기 응답
});

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...self.YST_DEFAULTS, ...(settings || {}) };
}

function langName(code) {
  if (!code) return '';
  const hit = self.YST_LANGS.find(([c]) => c.toLowerCase() === code.toLowerCase())
    || self.YST_LANGS.find(([c]) => c.split('-')[0] === code.split('-')[0]);
  return hit ? `${hit[2]} (${code})` : code;
}

class ApiError extends Error {
  constructor(message, { fatal = false, retryAfter = 0 } = {}) {
    super(message);
    this.fatal = fatal;
    this.retryAfter = retryAfter;
  }
}

async function fetchJson(url, options, label) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (e) {
    throw new ApiError(`${label}: 네트워크 오류 (${e.message})`);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { /* JSON 아님 */ }
  if (!res.ok) {
    const apiMsg = (data && data.error && (data.error.message || data.error.status)) || text.slice(0, 200) || res.statusText;
    let retryAfter = 0;
    const header = res.headers.get('retry-after');
    if (header && !isNaN(+header)) retryAfter = +header * 1000;
    const details = (data && data.error && data.error.details) || [];
    for (const d of details) {
      if (d && typeof d.retryDelay === 'string') retryAfter = Math.max(retryAfter, parseFloat(d.retryDelay) * 1000 || 0);
    }
    const fatal = res.status === 400 && /api key|API_KEY/i.test(apiMsg)
      || res.status === 401 || res.status === 403 || res.status === 404;
    if (res.status === 429) {
      throw new ApiError(`${label}: 요청 한도 초과 — 잠시 후 다시 시도합니다 (${apiMsg})`, { retryAfter: retryAfter || 15000 });
    }
    throw new ApiError(`${label} 오류 ${res.status}: ${apiMsg}`, { fatal, retryAfter });
  }
  return data;
}

// ───────────────────────── 번역 요청 처리 ─────────────────────────

async function handleTranslate(msg) {
  const s = await getSettings();
  const lines = msg.lines || [];
  if (!lines.length) return { translations: [] };
  const target = s.targetLang;
  const source = msg.sourceLang || '';
  let translations;
  switch (s.provider) {
    case 'gemini':
      translations = await translateGemini(s, lines, source, target, msg.context || {}, msg.title || '');
      break;
    case 'cloud-llm':
      translations = await translateCloudV3(s, lines, source, target);
      break;
    case 'cloud-v2':
      translations = await translateCloudV2(s, lines, source, target);
      break;
    case 'free':
    default:
      translations = await translateFree(lines, source, target);
  }
  return { translations };
}

async function handleTest(msg) {
  const s = { ...(await getSettings()), ...(msg.settings || {}) };
  const lines = ["Hello! Thanks for watching, and don't forget to subscribe."];
  let out;
  const t0 = Date.now();
  if (s.provider === 'gemini') out = await translateGemini(s, lines, 'en', s.targetLang, {}, '');
  else if (s.provider === 'cloud-llm') out = await translateCloudV3(s, lines, 'en', s.targetLang);
  else if (s.provider === 'cloud-v2') out = await translateCloudV2(s, lines, 'en', s.targetLang);
  else out = await translateFree(lines, 'en', s.targetLang);
  return { source: lines[0], result: out[0], ms: Date.now() - t0 };
}

// ───────────────────────── Google Gemini ─────────────────────────

function normalizeModel(model) {
  return (model || self.YST_DEFAULTS.geminiModel).trim().replace(/^models\//, '');
}

async function translateGemini(s, lines, source, target, context, title) {
  if (!s.geminiApiKey) throw new ApiError('Gemini API 키가 없습니다. 확장 프로그램 아이콘을 눌러 키를 입력하세요.', { fatal: true });
  const out = await geminiRequest(s, lines, source, target, context, title);
  if (out.length === lines.length) return out;
  // 줄 수가 맞지 않으면 반으로 나눠 다시 요청
  if (lines.length === 1) return [out.join(' ') || lines[0]];
  const mid = Math.ceil(lines.length / 2);
  const a = await translateGemini(s, lines.slice(0, mid), source, target,
    { before: context.before, after: lines.slice(mid, mid + 3) }, title);
  const b = await translateGemini(s, lines.slice(mid), source, target,
    { before: lines.slice(Math.max(0, mid - 3), mid), after: context.after }, title);
  return a.concat(b);
}

async function geminiRequest(s, lines, source, target, context, title) {
  const model = normalizeModel(s.geminiModel);
  const system = [
    'You are an expert subtitle translator for YouTube videos.',
    `Translate every subtitle line into ${langName(target)}.`,
    'Rules:',
    '- Output a JSON array of strings with EXACTLY the same number of items as the input array; item i is the translation of input line i.',
    '- Never merge, split, reorder, skip or add lines. Lines are fragments of continuous speech, so a sentence may span several lines: use the surrounding lines to understand meaning, but keep each translation aligned with its own line.',
    '- Write natural, concise, spoken-style subtitles a native speaker would use. Keep names, brands and technical terms accurate.',
    '- Auto-generated captions may lack punctuation or contain recognition errors; infer the intended meaning.',
    '- Keep sound/music tags such as [Music] or [Applause] translated in brackets.',
    '- If a line is already in the target language, return it unchanged. Output only the JSON array.',
  ].join('\n');

  const parts = [];
  if (title) parts.push(`Video title: ${title}`);
  if (source) parts.push(`Source language: ${langName(source)}`);
  if (context.before && context.before.length) parts.push(`Previous lines (context only, do NOT translate):\n${JSON.stringify(context.before)}`);
  if (context.after && context.after.length) parts.push(`Following lines (context only, do NOT translate):\n${JSON.stringify(context.after)}`);
  parts.push(`Translate these ${lines.length} lines into ${langName(target)}:\n${JSON.stringify(lines)}`);

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: parts.join('\n\n') }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
    },
  };

  const data = await fetchJson(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.geminiApiKey },
    body: JSON.stringify(body),
  }, `Gemini(${model})`);

  const cand = data && data.candidates && data.candidates[0];
  if (!cand) {
    const reason = data && data.promptFeedback && data.promptFeedback.blockReason;
    throw new ApiError(`Gemini 응답이 비어 있습니다${reason ? ` (${reason})` : ''}`);
  }
  const text = ((cand.content && cand.content.parts) || [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text).join('').trim();
  return parseJsonArray(text);
}

function parseJsonArray(text) {
  const tryParse = (t) => {
    try {
      const v = JSON.parse(t);
      if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : (x && (x.t || x.text || x.translation)) || String(x ?? '')));
    } catch (_) { /* 계속 */ }
    return null;
  };
  let out = tryParse(text);
  if (!out) {
    const m = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').match(/\[[\s\S]*\]/);
    if (m) out = tryParse(m[0]);
  }
  if (!out) throw new ApiError('Gemini 응답을 해석하지 못했습니다.');
  return out;
}

async function listGeminiModels(apiKey) {
  if (!apiKey) throw new ApiError('API 키를 먼저 입력하세요.', { fatal: true });
  const models = [];
  let pageToken = '';
  for (let i = 0; i < 5; i++) {
    const url = `${GEMINI_BASE}/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const data = await fetchJson(url, { headers: { 'x-goog-api-key': apiKey } }, 'Gemini 모델 목록');
    for (const m of (data && data.models) || []) {
      const id = (m.name || '').replace(/^models\//, '');
      const methods = m.supportedGenerationMethods || [];
      if (!methods.includes('generateContent')) continue;
      if (!/gemini/i.test(id)) continue;
      if (/embedding|tts|image|live|audio|robotics|computer-use/i.test(id)) continue;
      models.push({ id, name: m.displayName || id, description: m.description || '' });
    }
    pageToken = data && data.nextPageToken;
    if (!pageToken) break;
  }
  return { models };
}

// ─────────────────── Google Cloud Translation (v3 · LLM) ───────────────────

async function translateCloudV3(s, lines, source, target) {
  if (!s.cloudApiKey) throw new ApiError('Cloud Translation API 키가 없습니다.', { fatal: true });
  if (!s.cloudProjectId) throw new ApiError('Google Cloud 프로젝트 ID가 없습니다.', { fatal: true });
  const project = encodeURIComponent(s.cloudProjectId.trim());
  const parent = `projects/${project}/locations/us-central1`;
  const body = {
    contents: lines,
    targetLanguageCode: target,
    mimeType: 'text/plain',
    model: `${parent}/models/general/translation-llm`,
  };
  // 원문 언어는 자동 감지 (유튜브 언어 코드가 Cloud 형식과 다를 수 있음)
  const data = await fetchJson(`https://translation.googleapis.com/v3/${parent}:translateText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.cloudApiKey },
    body: JSON.stringify(body),
  }, 'Cloud Translation LLM');
  const out = ((data && data.translations) || []).map((t) => t.translatedText || '');
  if (out.length !== lines.length) throw new ApiError('Cloud Translation 응답 줄 수가 맞지 않습니다.');
  return out;
}

// ─────────────────── Google Cloud Translation (v2 · NMT) ───────────────────

async function translateCloudV2(s, lines, source, target) {
  if (!s.cloudApiKey) throw new ApiError('Cloud Translation API 키가 없습니다.', { fatal: true });
  const body = { q: lines, target, format: 'text' }; // 원문 언어는 자동 감지
  const data = await fetchJson('https://translation.googleapis.com/language/translate/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.cloudApiKey },
    body: JSON.stringify(body),
  }, 'Cloud Translation v2');
  const out = ((data && data.data && data.data.translations) || []).map((t) => t.translatedText || '');
  if (out.length !== lines.length) throw new ApiError('Cloud Translation 응답 줄 수가 맞지 않습니다.');
  return out;
}

// ─────────────────── Google 번역 (무료 웹 엔드포인트) ───────────────────

async function freeRequest(text, source, target) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=${encodeURIComponent(source || 'auto')}&tl=${encodeURIComponent(target)}`;
  const data = await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: `q=${encodeURIComponent(text)}`,
  }, 'Google 번역');
  return ((data && data[0]) || []).map((seg) => (seg && seg[0]) || '').join('');
}

async function translateFree(lines, source, target) {
  const clean = lines.map((l) => l.replace(/\n/g, ' '));
  const joined = await freeRequest(clean.join('\n'), source, target);
  const split = joined.split('\n').map((x) => x.trim());
  if (split.length === lines.length) return split;
  // 줄이 맞지 않으면 한 줄씩 (동시 4개)
  const out = new Array(lines.length);
  let next = 0;
  const worker = async () => {
    while (next < clean.length) {
      const i = next++;
      out[i] = (await freeRequest(clean[i], source, target)).trim();
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return out;
}
