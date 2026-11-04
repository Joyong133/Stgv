// GPT 챗봇 — OpenAI Chat Completions API를 브라우저에서 바로 호출하는 단일 페이지 앱
(() => {
  'use strict';

  const STORE_SETTINGS = 'gptchat.settings';
  const STORE_CHATS = 'gptchat.chats';
  const WEB_URL = 'https://chatgpt.com/';
  const DEFAULTS = {
    mode: 'web', // 'web' = chatgpt.com 웹사이트, 'api' = OpenAI API
    apiKey: '',
    model: 'gpt-5-mini',
    systemPrompt: '너는 친절하고 정확한 한국어 AI 비서야. 모르는 것은 모른다고 말해.',
    baseUrl: 'https://api.openai.com/v1',
  };

  // ---------- storage ----------
  const load = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; }
    catch { return fallback; }
  };
  const save = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장 불가 환경 */ }
  };

  const saved = load(STORE_SETTINGS, {});
  // 예전 버전에서 API 키를 저장해 둔 사용자는 API 모드로 시작
  let settings = { ...DEFAULTS, mode: saved.apiKey ? 'api' : 'web', ...saved };
  const webMode = () => settings.mode === 'web';
  let chats = load(STORE_CHATS, []);
  let currentId = chats[0]?.id ?? null;
  let controller = null; // 진행 중인 요청의 AbortController

  const $ = (sel) => document.querySelector(sel);
  const els = {
    sidebar: $('#sidebar'), backdrop: $('#backdrop'), chatList: $('#chatList'),
    messages: $('#messages'), empty: $('#empty'), keyHint: $('#keyHint'),
    title: $('#chatTitle'), badge: $('#modelBadge'),
    form: $('#composer'), input: $('#input'), send: $('#send'), stop: $('#stop'),
    dialog: $('#settings'), apiKey: $('#apiKey'), model: $('#model'),
    systemPrompt: $('#systemPrompt'), baseUrl: $('#baseUrl'),
    apiFields: $('#apiFields'), modeDesc: $('#modeDesc'),
  };

  const current = () => chats.find((c) => c.id === currentId) || null;
  const persistChats = () => save(STORE_CHATS, chats);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- markdown (HTML을 먼저 이스케이프한 뒤 최소한의 문법만 변환) ----------
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function inline(s) {
    const codes = [];
    s = s.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = s
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  }

  function markdown(src) {
    const blocks = [];
    // 코드 블록 분리 (스트리밍 중 닫히지 않은 블록도 처리)
    let text = esc(src).replace(/```([\w+-]*)\n([\s\S]*?)(```|$)/g, (_, lang, code) => {
      blocks.push({ lang, code: code.replace(/\n$/, '') });
      return `\n\u0001${blocks.length - 1}\u0001\n`;
    });

    const out = [];
    let list = null; // 'ul' | 'ol'
    let para = [];
    const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
    const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

    for (const line of text.split('\n')) {
      let m;
      if ((m = line.match(/^\u0001(\d+)\u0001$/))) {
        flushPara(); closeList();
        const b = blocks[m[1]];
        out.push(`<div class="codeblock"><div class="bar"><span>${b.lang || 'code'}</span><button type="button" data-copy>복사</button></div><pre><code>${b.code}</code></pre></div>`);
      } else if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
        flushPara(); closeList();
        const n = Math.min(m[1].length + 1, 3);
        out.push(`<h${n}>${inline(m[2])}</h${n}>`);
      } else if ((m = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/))) {
        flushPara();
        const type = /\d/.test(m[1]) ? 'ol' : 'ul';
        if (list !== type) { closeList(); out.push(`<${type}>`); list = type; }
        out.push(`<li>${inline(m[2])}</li>`);
      } else if (!line.trim()) {
        flushPara(); closeList();
      } else {
        closeList();
        para.push(line);
      }
    }
    flushPara(); closeList();
    return out.join('');
  }

  // ---------- rendering ----------
  function renderList() {
    els.chatList.innerHTML = '';
    for (const c of chats) {
      const li = document.createElement('li');
      if (c.id === currentId) li.className = 'active';
      const t = document.createElement('button');
      t.className = 'title'; t.type = 'button'; t.textContent = c.title || '새 대화';
      t.onclick = () => { if (controller) return; currentId = c.id; closeSidebar(); renderAll(); };
      const d = document.createElement('button');
      d.className = 'del'; d.type = 'button'; d.textContent = '🗑'; d.title = '삭제';
      d.setAttribute('aria-label', `"${t.textContent}" 대화 삭제`);
      d.onclick = () => {
        if (controller) return;
        if (!confirm('이 대화를 삭제할까요?')) return;
        chats = chats.filter((x) => x.id !== c.id);
        if (currentId === c.id) currentId = chats[0]?.id ?? null;
        persistChats(); renderAll();
      };
      li.append(t, d);
      els.chatList.append(li);
    }
  }

  function messageEl(role, content) {
    const wrap = document.createElement('div');
    wrap.className = `msg ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (role === 'assistant') bubble.innerHTML = markdown(content);
    else if (role === 'note') bubble.textContent = '↗ ChatGPT 웹사이트에서 이 질문을 열었어요. 답변은 열린 ChatGPT 창에서 확인하세요.';
    else bubble.textContent = content;
    wrap.append(bubble);
    return wrap;
  }

  function addActions(wrap, content, isLast) {
    const bar = document.createElement('div');
    bar.className = 'msg-actions';
    const copy = document.createElement('button');
    copy.type = 'button'; copy.textContent = '복사';
    copy.onclick = () => copyText(content, copy);
    bar.append(copy);
    if (isLast) {
      const regen = document.createElement('button');
      regen.type = 'button'; regen.textContent = '다시 생성';
      regen.onclick = regenerate;
      bar.append(regen);
    }
    wrap.querySelector('.bubble').append(bar);
  }

  function addReopen(wrap, question) {
    const bar = document.createElement('div');
    bar.className = 'msg-actions';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = 'ChatGPT에서 다시 열기';
    btn.onclick = () => openInChatGPT(question);
    bar.append(btn);
    wrap.querySelector('.bubble').append(bar);
  }

  function renderMessages() {
    const chat = current();
    els.messages.querySelectorAll('.msg').forEach((n) => n.remove());
    const msgs = chat?.messages ?? [];
    els.empty.hidden = msgs.length > 0;
    els.keyHint.hidden = webMode() || !!settings.apiKey;
    els.modeDesc.textContent = webMode()
      ? '질문을 보내면 ChatGPT 웹사이트(chatgpt.com)가 열리며 바로 질문해요. 내 ChatGPT 계정을 그대로 써서 API 키가 필요 없어요.'
      : 'OpenAI(ChatGPT) API로 이 화면에서 바로 대답하는 챗봇입니다.';
    msgs.forEach((m, i) => {
      const node = messageEl(m.role, m.content);
      if (m.role === 'assistant') addActions(node, m.content, i === msgs.length - 1);
      if (m.role === 'note') addReopen(node, m.content);
      els.messages.append(node);
    });
    els.title.textContent = chat?.title || '새 대화';
    scrollDown(true);
  }

  function renderAll() {
    els.badge.textContent = webMode() ? 'ChatGPT 웹사이트' : settings.model;
    renderList();
    renderMessages();
  }

  function scrollDown(force) {
    const m = els.messages;
    const nearBottom = m.scrollHeight - m.scrollTop - m.clientHeight < 120;
    if (force || nearBottom) m.scrollTop = m.scrollHeight;
  }

  function copyText(text, btn) {
    const done = () => { const o = btn.textContent; btn.textContent = '복사됨 ✓'; setTimeout(() => { btn.textContent = o; }, 1200); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => {});
  }

  // 코드 블록 복사 버튼 (이벤트 위임)
  els.messages.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy]');
    if (btn) copyText(btn.closest('.codeblock').querySelector('code').textContent, btn);
  });

  // ---------- OpenAI API ----------
  async function streamCompletion(messages, onDelta, signal) {
    const url = settings.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    const body = { model: settings.model, messages, stream: true };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.error?.message || ''; } catch { /* 본문 없음 */ }
      const hints = {
        401: 'API 키가 올바르지 않습니다. 설정에서 키를 확인해 주세요.',
        404: `모델 "${settings.model}"을(를) 찾을 수 없거나 사용 권한이 없습니다.`,
        429: '요청 한도를 넘었거나 크레딧이 부족합니다.',
      };
      throw new Error(`${hints[res.status] || `요청 실패 (HTTP ${res.status})`}${detail ? `\n${detail}` : ''}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          const json = JSON.parse(data);
          if (json.error) throw new Error(json.error.message);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) onDelta(delta);
        } catch (err) {
          if (err instanceof SyntaxError) continue; // 잘린 줄은 무시
          throw err;
        }
      }
    }
  }

  async function respond(chat) {
    const history = chat.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map(({ role, content }) => ({ role, content }));
    const payload = settings.systemPrompt.trim()
      ? [{ role: 'system', content: settings.systemPrompt.trim() }, ...history]
      : history;

    const node = messageEl('assistant', '');
    const bubble = node.querySelector('.bubble');
    bubble.classList.add('cursor');
    els.messages.append(node);
    scrollDown(true);

    setBusy(true);
    controller = new AbortController();
    let text = '';
    let frame = 0;
    try {
      await streamCompletion(payload, (d) => {
        text += d;
        if (!frame) frame = requestAnimationFrame(() => {
          frame = 0; bubble.innerHTML = markdown(text); scrollDown();
        });
      }, controller.signal);
    } catch (err) {
      if (err.name !== 'AbortError') {
        cancelAnimationFrame(frame);
        node.remove();
        const msg = err instanceof TypeError
          ? '서버에 연결할 수 없습니다. 인터넷 연결이나 API 주소를 확인해 주세요.'
          : err.message;
        const e = messageEl('error', msg);
        els.messages.append(e);
        scrollDown(true);
        if (text) chat.messages.push({ role: 'assistant', content: text });
        persistChats();
        setBusy(false); controller = null;
        return;
      }
    }
    cancelAnimationFrame(frame);
    controller = null;
    setBusy(false);
    if (text) chat.messages.push({ role: 'assistant', content: text });
    chat.updated = Date.now();
    persistChats();
    renderMessages();
  }

  function setBusy(busy) {
    els.send.hidden = busy;
    els.stop.hidden = !busy;
    els.input.disabled = false;
  }

  // chatgpt.com/?q=질문 주소로 열면 ChatGPT가 그 질문을 바로 보냅니다.
  // 팝업 차단을 피하려면 사용자가 누른 이벤트 안에서 바로 호출해야 합니다.
  function openInChatGPT(text) {
    const url = WEB_URL + '?q=' + encodeURIComponent(text);
    const w = window.open(url, 'chatgpt');
    if (!w) location.href = url; // 팝업이 막히면 현재 탭에서 이동
  }

  async function sendMessage(text) {
    if (!webMode() && !settings.apiKey) { openSettings(); return; }
    let chat = current();
    if (!chat) {
      chat = { id: uid(), title: '', messages: [], updated: Date.now() };
      chats.unshift(chat);
      currentId = chat.id;
    }
    if (!chat.title) chat.title = text.replace(/\s+/g, ' ').slice(0, 40);
    chat.messages.push({ role: 'user', content: text });
    // 최근 대화를 목록 맨 위로
    chats = [chat, ...chats.filter((c) => c !== chat)];
    if (webMode()) {
      chat.messages.push({ role: 'note', content: text });
      persistChats();
      openInChatGPT(text);
      renderAll();
      return;
    }
    persistChats();
    renderAll();
    await respond(chat);
  }

  function regenerate() {
    const chat = current();
    if (!chat || controller || webMode()) return;
    if (chat.messages.at(-1)?.role === 'assistant') chat.messages.pop();
    persistChats();
    renderMessages();
    respond(chat);
  }

  // ---------- composer ----------
  const autoGrow = () => {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 200) + 'px';
  };
  els.input.addEventListener('input', autoGrow);
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      els.form.requestSubmit();
    }
  });
  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = els.input.value.trim();
    if (!text || controller) return;
    els.input.value = '';
    autoGrow();
    sendMessage(text);
  });
  els.stop.addEventListener('click', () => controller?.abort());

  $('#newChat').addEventListener('click', () => {
    if (controller) return;
    currentId = null;
    closeSidebar();
    renderAll();
    els.input.focus();
  });

  // ---------- sidebar (mobile) ----------
  function openSidebar() { els.sidebar.classList.add('open'); els.backdrop.hidden = false; }
  function closeSidebar() { els.sidebar.classList.remove('open'); els.backdrop.hidden = true; }
  $('#openSide').addEventListener('click', openSidebar);
  $('#closeSide').addEventListener('click', closeSidebar);
  els.backdrop.addEventListener('click', closeSidebar);

  // ---------- settings ----------
  const modeRadios = [...document.querySelectorAll('input[name="mode"]')];
  const syncModeFields = () => {
    els.apiFields.hidden = modeRadios.find((r) => r.checked)?.value !== 'api';
  };
  modeRadios.forEach((r) => r.addEventListener('change', syncModeFields));

  function openSettings() {
    modeRadios.forEach((r) => { r.checked = r.value === settings.mode; });
    syncModeFields();
    els.apiKey.value = settings.apiKey;
    els.model.value = settings.model;
    els.systemPrompt.value = settings.systemPrompt;
    els.baseUrl.value = settings.baseUrl;
    closeSidebar();
    els.dialog.showModal();
    if (!webMode() && !settings.apiKey) els.apiKey.focus();
  }
  $('#openSettings').addEventListener('click', openSettings);
  document.addEventListener('click', (e) => { if (e.target.closest('[data-open-settings]')) openSettings(); });

  els.dialog.addEventListener('close', () => {
    if (els.dialog.returnValue !== 'save') return;
    settings = {
      mode: modeRadios.find((r) => r.checked)?.value || 'web',
      apiKey: els.apiKey.value.trim(),
      model: els.model.value.trim() || DEFAULTS.model,
      systemPrompt: els.systemPrompt.value,
      baseUrl: els.baseUrl.value.trim() || DEFAULTS.baseUrl,
    };
    save(STORE_SETTINGS, settings);
    renderAll();
  });

  $('#clearAll').addEventListener('click', () => {
    if (controller || !confirm('저장된 모든 대화를 삭제할까요?')) return;
    chats = []; currentId = null;
    persistChats(); renderAll();
  });

  renderAll();
  if (!webMode() && !settings.apiKey) openSettings();
})();
