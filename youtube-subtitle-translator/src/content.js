// 콘텐츠 스크립트: 자막 트랙을 해석하고, 번역을 예약하고, 영상 위에 번역 자막을 그립니다.
(() => {
  if (window.__ystContent) return;
  window.__ystContent = true;

  const DEFAULTS = self.YST_DEFAULTS;
  const FIRST_BATCH = 12; // 첫 요청은 작게 해서 빨리 화면에 띄움
  const BATCH = 40;
  const WORKERS = 2;
  const CACHE_MAX = 40;

  let settings = { ...DEFAULTS };
  let ready = false;

  const state = {
    videoId: '',
    tracks: new Map(), // videoId -> 마지막으로 받은 트랙
    track: null, // 현재 번역 중/표시 중인 트랙
    jobId: 0,
    fatalError: '',
    autoCCVideo: '', // 자동으로 자막을 켠 영상 ID
    autoCCOn: false,
    segSeenAt: 0,
    live: { text: '', tr: '', cache: new Map(), timer: 0, reqId: 0 },
    renderKey: '',
  };

  // ───────────────────────── 설정 ─────────────────────────

  chrome.storage.local.get('settings').then(({ settings: saved }) => {
    settings = { ...DEFAULTS, ...(saved || {}) };
    ready = true;
    applyNativeCaptionVisibility();
    onVideoMaybeChanged();
    if (state.track) startJob(state.track);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const prev = settings;
    settings = { ...DEFAULTS, ...(changes.settings.newValue || {}) };
    const retranslate = ['provider', 'geminiModel', 'geminiApiKey', 'cloudApiKey', 'cloudProjectId', 'targetLang']
      .some((k) => prev[k] !== settings[k]);
    if (prev.enabled !== settings.enabled) {
      if (!settings.enabled) {
        state.jobId++;
        clearOverlay();
        hideStatus();
        restoreAutoCC();
      } else {
        state.fatalError = '';
        onVideoMaybeChanged(true);
        const t = state.tracks.get(state.videoId);
        if (t) startJob(t);
      }
    } else if (retranslate && settings.enabled) {
      state.fatalError = '';
      state.live.cache.clear();
      state.live.text = '';
      const t = state.tracks.get(state.videoId);
      if (t) startJob(t);
    }
    applyNativeCaptionVisibility();
    state.renderKey = '';
  });

  // ───────────────────────── 영상 / 플레이어 ─────────────────────────

  function currentVideoId() {
    const u = new URL(location.href);
    if (u.pathname === '/watch') return u.searchParams.get('v') || '';
    const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/);
    return m ? m[1] : '';
  }

  const getPlayer = () => document.getElementById('movie_player') || document.querySelector('.html5-video-player');
  const getVideo = () => {
    const p = getPlayer();
    return (p && p.querySelector('video')) || document.querySelector('video');
  };
  const getCCButton = () => {
    const p = getPlayer();
    return p && p.querySelector('.ytp-subtitles-button');
  };
  const ccIsOn = () => {
    const b = getCCButton();
    return !b || b.getAttribute('aria-pressed') === 'true';
  };

  function onVideoMaybeChanged(force) {
    const id = currentVideoId();
    if (!force && id === state.videoId) return;
    if (id !== state.videoId) {
      state.jobId++;
      state.track = null;
      state.segSeenAt = 0;
      state.live.text = '';
      state.live.tr = '';
      state.autoCCOn = false;
      clearOverlay();
      hideStatus();
    }
    state.videoId = id;
    if (!ready || !settings.enabled || !id) return;
    const t = state.tracks.get(id);
    if (t && t !== state.track) startJob(t);
    if (!t) maybeAutoEnableCC(id);
  }

  document.addEventListener('yt-navigate-finish', () => onVideoMaybeChanged());
  window.addEventListener('popstate', () => onVideoMaybeChanged());

  // 자막이 꺼져 있으면 한 번 켜서 플레이어가 자막 트랙을 내려받게 함
  function maybeAutoEnableCC(id) {
    if (!settings.autoEnableCC || state.autoCCVideo === id) return;
    state.autoCCVideo = id;
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (state.videoId !== id || !settings.enabled || tries > 40) return clearInterval(timer);
      if (state.tracks.has(id)) return clearInterval(timer);
      const btn = getCCButton();
      const v = getVideo();
      if (!btn || !v || v.readyState < 1) return;
      const style = getComputedStyle(btn);
      if (style.display === 'none' || btn.getAttribute('aria-disabled') === 'true') {
        if (tries > 20) clearInterval(timer); // 자막 없는 영상
        return;
      }
      clearInterval(timer);
      if (btn.getAttribute('aria-pressed') === 'false') {
        btn.click();
        state.autoCCOn = true;
      }
    }, 500);
  }

  function restoreAutoCC() {
    if (state.autoCCOn && state.autoCCVideo === state.videoId) {
      const btn = getCCButton();
      if (btn && btn.getAttribute('aria-pressed') === 'true') btn.click();
    }
    state.autoCCOn = false;
  }

  // ───────────────────────── 자막 가로채기 / 해석 ─────────────────────────

  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || d.source !== 'yst-inject' || d.type !== 'timedtext') return;
    try {
      handleTimedText(d.url, d.body);
    } catch (e) {
      console.warn('[YT 자막 번역] 자막 해석 실패', e);
    }
  });

  function handleTimedText(rawUrl, body) {
    const url = new URL(rawUrl, location.origin);
    const p = url.searchParams;
    const videoId = p.get('v') || currentVideoId();
    const lang = p.get('lang') || '';
    const kind = p.get('kind') || '';
    const tlang = p.get('tlang') || '';
    const isAsr = kind === 'asr';
    const srcLang = tlang || lang;
    const cues = parseTimedText(body, isAsr, srcLang);
    if (!cues.length) return;

    const key = `${videoId}|${lang}|${kind}|${tlang}`;
    const existing = state.tracks.get(videoId);
    if (existing && existing.key === key && existing.cues.length === cues.length) {
      if (state.track !== existing && ready && settings.enabled && videoId === state.videoId) startJob(existing);
      return;
    }
    const track = {
      key,
      videoId,
      srcLang,
      cues,
      tr: new Array(cues.length).fill(null),
      failed: new Array(cues.length).fill(false),
      inflight: new Array(cues.length).fill(false),
    };
    state.tracks.set(videoId, track);
    if (state.tracks.size > 20) state.tracks.delete(state.tracks.keys().next().value);
    if (ready && settings.enabled && videoId === (state.videoId || currentVideoId())) {
      state.videoId = videoId;
      startJob(track);
    }
  }

  function parseTimedText(body, isAsr, lang) {
    const text = (body || '').trim();
    if (text.startsWith('{')) return parseJson3(JSON.parse(text), isAsr, lang);
    if (text.startsWith('<')) return parseXml(text);
    return [];
  }

  const cleanText = (s) => s.replace(/​/g, '').replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();

  function parseJson3(json, isAsr, lang) {
    const events = (json.events || []).filter((e) => e.segs && e.tStartMs != null);
    if (isAsr) return mergeAsr(events, lang);
    const cues = [];
    for (const e of events) {
      const t = cleanText(e.segs.map((s) => s.utf8 || '').join(''));
      if (!t) continue;
      cues.push({ s: e.tStartMs, e: e.tStartMs + (e.dDurationMs || 2000), text: t });
    }
    return cues;
  }

  // 자동 생성 자막(단어 단위)을 문장 단위로 묶기
  function mergeAsr(events, lang) {
    const noSpace = /^(ja|zh|th|lo|my|km)/i.test(lang || '');
    const words = [];
    for (const e of events) {
      if (e.aAppend) continue;
      for (const s of e.segs) {
        const w = (s.utf8 || '').replace(/\n/g, ' ');
        if (!w.trim()) continue;
        words.push({ t: e.tStartMs + (s.tOffsetMs || 0), w });
      }
    }
    const cues = [];
    let cur = null;
    const flush = () => {
      if (cur && cur.text.trim()) cues.push({ s: cur.s, last: cur.last, text: cleanText(cur.text) });
      cur = null;
    };
    for (const { t, w } of words) {
      if (cur && t - cur.last > 1500) flush();
      if (!cur) {
        cur = { s: t, last: t, text: w.trim() };
      } else {
        const sep = noSpace || /^\s/.test(w) ? '' : ' ';
        cur.text += sep + w;
        cur.last = t;
      }
      const len = cur.text.trim().length;
      const limit = noSpace ? 30 : 70;
      if ((/[.?!。？！]["')\]]?$/.test(cur.text.trim()) && len >= (noSpace ? 8 : 20)) || len >= limit) flush();
    }
    flush();
    for (let i = 0; i < cues.length; i++) {
      const c = cues[i];
      const next = cues[i + 1];
      let end = c.last + 1800;
      if (next) end = Math.min(Math.max(end, next.s - 100), next.s);
      c.e = Math.max(end, c.s + 1000);
      delete c.last;
    }
    return cues;
  }

  function parseXml(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const cues = [];
    // srv3: <p t="ms" d="ms">
    for (const p of doc.querySelectorAll('p')) {
      const s = +p.getAttribute('t');
      const d = +p.getAttribute('d') || 2000;
      const t = cleanText(p.textContent || '');
      if (t && !isNaN(s)) cues.push({ s, e: s + d, text: t });
    }
    if (cues.length) return cues;
    // 구형: <text start="sec" dur="sec">
    for (const el of doc.querySelectorAll('text')) {
      const s = parseFloat(el.getAttribute('start')) * 1000;
      const d = parseFloat(el.getAttribute('dur') || '2') * 1000;
      const ta = document.createElement('textarea');
      ta.innerHTML = el.textContent || '';
      const t = cleanText(ta.value);
      if (t && !isNaN(s)) cues.push({ s, e: s + d, text: t });
    }
    return cues;
  }

  // ───────────────────────── 번역 작업 ─────────────────────────

  const baseLang = (c) => (c || '').toLowerCase().split('-')[0];
  const normLang = (c) => ({ 'zh-hans': 'zh-CN', 'zh-hant': 'zh-TW' }[(c || '').toLowerCase()] || c || '');

  function cacheKey(track) {
    const engine = settings.provider === 'gemini' ? `gemini:${settings.geminiModel}` : settings.provider;
    return `ystc:${track.key}|${settings.targetLang}|${engine}`;
  }

  async function cacheLoad(track) {
    const k = cacheKey(track);
    try {
      const got = await chrome.storage.local.get(k);
      const arr = got[k];
      if (Array.isArray(arr) && arr.length === track.cues.length) return arr;
    } catch (_) { /* 무시 */ }
    return null;
  }

  async function cacheSave(track) {
    const k = cacheKey(track);
    try {
      const { ystcIndex = [] } = await chrome.storage.local.get('ystcIndex');
      const idx = ystcIndex.filter((x) => x !== k);
      idx.push(k);
      const removed = idx.splice(0, Math.max(0, idx.length - CACHE_MAX));
      if (removed.length) await chrome.storage.local.remove(removed);
      await chrome.storage.local.set({ [k]: track.tr, ystcIndex: idx });
    } catch (e) {
      console.warn('[YT 자막 번역] 캐시 저장 실패', e);
    }
  }

  function cueIndexAt(track, ms) {
    const c = track.cues;
    let lo = 0;
    let hi = c.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (c[mid].s <= ms) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  function nextRange(track, size) {
    const n = track.cues.length;
    const v = getVideo();
    const from = Math.max(0, cueIndexAt(track, v ? v.currentTime * 1000 : 0));
    const free = (i) => track.tr[i] == null && !track.failed[i] && !track.inflight[i];
    let start = -1;
    for (let i = from; i < n; i++) if (free(i)) { start = i; break; }
    if (start < 0) for (let i = 0; i < from; i++) if (free(i)) { start = i; break; }
    if (start < 0) return null;
    let end = start;
    while (end < n && end - start < size && free(end)) end++;
    return [start, end];
  }

  async function startJob(track) {
    const jobId = ++state.jobId;
    state.track = track;
    state.renderKey = '';
    track.failed.fill(false);
    track.inflight.fill(false);

    if (baseLang(track.srcLang) === baseLang(settings.targetLang)) {
      track.sameLang = true;
      track.tr = track.cues.map((c) => c.text);
      showStatus('원문이 번역 언어와 같아 그대로 표시합니다', 2500);
      return;
    }
    track.sameLang = false;

    const cached = await cacheLoad(track);
    if (jobId !== state.jobId) return;
    track.tr = cached ? cached.slice() : new Array(track.cues.length).fill(null);

    const total = track.cues.length;
    const doneCount = () => track.tr.filter((x) => x != null).length;
    if (doneCount() === total) {
      showStatus('번역 완료 (저장된 번역 사용)', 2000);
      return;
    }

    let first = true;
    let lastSave = Date.now();
    let fatal = '';
    let lastError = '';
    const retries = new Map();

    const worker = async () => {
      let backoff = 0;
      while (jobId === state.jobId && !fatal) {
        const range = nextRange(track, first ? FIRST_BATCH : BATCH);
        first = false;
        if (!range) return;
        const [a, b] = range;
        for (let i = a; i < b; i++) track.inflight[i] = true;
        const res = await sendTranslate(track, a, b);
        for (let i = a; i < b; i++) track.inflight[i] = false;
        if (jobId !== state.jobId) return;

        if (res.ok && Array.isArray(res.translations) && res.translations.length === b - a) {
          backoff = 0;
          res.translations.forEach((t, k) => { track.tr[a + k] = (t || '').trim() || track.cues[a + k].text; });
          state.renderKey = '';
          const pct = Math.floor((doneCount() / total) * 100);
          showStatus(`번역 중… ${pct}%`);
          if (Date.now() - lastSave > 4000) { lastSave = Date.now(); cacheSave(track); }
          continue;
        }

        lastError = (res && res.error) || '알 수 없는 오류';
        if (res && res.fatal) {
          fatal = lastError;
          return;
        }
        const tries = (retries.get(a) || 0) + 1;
        retries.set(a, tries);
        if (tries >= 4) {
          // 같은 구간이 계속 실패하면 원문으로 두고 넘어감
          for (let i = a; i < b; i++) track.failed[i] = true;
        }
        backoff = Math.max((res && res.retryAfter) || 0, Math.min(30000, (backoff || 1000) * 2));
        showStatus(`⚠ ${lastError}`, 0, true);
        await sleep(backoff);
      }
    };

    showStatus('번역 시작…');
    await Promise.all(Array.from({ length: WORKERS }, worker));
    if (jobId !== state.jobId) return;

    cacheSave(track);
    if (fatal) {
      state.fatalError = fatal;
      showStatus(`⚠ ${fatal}`, 0, true);
    } else if (track.failed.some(Boolean)) {
      showStatus(`일부 줄 번역 실패: ${lastError}`, 6000, true);
    } else {
      showStatus('번역 완료', 2000);
    }
  }

  function sendTranslate(track, a, b) {
    const lines = track.cues.slice(a, b).map((c) => c.text);
    const context = {
      before: track.cues.slice(Math.max(0, a - 3), a).map((c) => c.text),
      after: track.cues.slice(b, b + 3).map((c) => c.text),
    };
    return sendMessage({
      type: 'translate',
      lines,
      context,
      sourceLang: normLang(track.srcLang),
      title: videoTitle(),
    });
  }

  function sendMessage(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(res || { ok: false, error: '응답 없음' });
        });
      } catch (e) {
        // 확장 프로그램이 업데이트/재시작되면 이 탭의 스크립트는 연결이 끊김
        resolve({ ok: false, fatal: true, error: '확장 프로그램이 다시 로드되었습니다. 페이지를 새로고침하세요.' });
      }
    });
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function videoTitle() {
    const h = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.title, .ytp-title-link');
    return ((h && h.textContent) || document.title.replace(/ - YouTube$/, '')).trim().slice(0, 200);
  }

  // ───────────────────────── 실시간(DOM) 대체 모드 ─────────────────────────
  // 생방송 등 자막 트랙을 가로챌 수 없을 때, 화면의 자막 글자를 직접 번역

  function nativeCaptionText() {
    const segs = document.querySelectorAll('.ytp-caption-window-container .ytp-caption-segment');
    if (!segs.length) return '';
    return cleanText(Array.from(segs, (s) => s.textContent || '').join(' '));
  }

  function liveModeUpdate() {
    const text = nativeCaptionText();
    const now = Date.now();
    if (!text) { state.segSeenAt = 0; return null; }
    if (!state.segSeenAt) state.segSeenAt = now;
    if (now - state.segSeenAt < 2500) return null; // 트랙 가로채기를 먼저 기다림
    const L = state.live;
    if (text !== L.text) {
      L.text = text;
      clearTimeout(L.timer);
      const cached = L.cache.get(text);
      if (cached) L.tr = cached;
      else {
        L.timer = setTimeout(async () => {
          const id = ++L.reqId;
          const res = await sendMessage({ type: 'translate', lines: [text], context: {}, sourceLang: '', title: videoTitle() });
          if (res.ok && res.translations && res.translations[0]) {
            L.cache.set(text, res.translations[0]);
            if (L.cache.size > 300) L.cache.delete(L.cache.keys().next().value);
            if (id === L.reqId && L.text === text) { L.tr = res.translations[0]; state.renderKey = ''; }
          } else if (res.error) {
            showStatus(`⚠ ${res.error}`, 5000, true);
          }
        }, 600);
      }
    }
    return { orig: text, tr: L.cache.get(text) || '' };
  }

  // ───────────────────────── 화면 표시 ─────────────────────────

  let overlay = null;
  let statusEl = null;
  let statusTimer = 0;

  function ensureOverlay() {
    const player = getPlayer();
    if (!player) return null;
    if (!overlay || !player.contains(overlay)) {
      overlay = document.createElement('div');
      overlay.className = 'yst-overlay';
      overlay.innerHTML = '<div class="yst-box"><div class="yst-line yst-orig"></div><div class="yst-line yst-tr"></div></div>';
      player.appendChild(overlay);
      state.renderKey = '';
    }
    return overlay;
  }

  function clearOverlay() {
    if (overlay) overlay.style.display = 'none';
    state.renderKey = '';
  }

  function showStatus(text, hideAfter = 0, isError = false) {
    const player = getPlayer();
    if (!player) return;
    if (!statusEl || !player.contains(statusEl)) {
      statusEl = document.createElement('div');
      statusEl.className = 'yst-status';
      player.appendChild(statusEl);
    }
    statusEl.textContent = `자막 번역 · ${text}`;
    statusEl.classList.toggle('yst-error', !!isError);
    statusEl.style.display = 'block';
    clearTimeout(statusTimer);
    if (hideAfter) statusTimer = setTimeout(hideStatus, hideAfter);
  }

  function hideStatus() {
    if (statusEl) statusEl.style.display = 'none';
  }

  function applyNativeCaptionVisibility(active) {
    const hide = ready && settings.enabled && !!active;
    document.documentElement.classList.toggle('yst-hide-native', hide);
  }

  function render() {
    if (!ready || !settings.enabled) { applyNativeCaptionVisibility(false); return; }
    const player = getPlayer();
    const video = getVideo();
    if (!player || !video) return;

    let orig = '';
    let tr = '';
    let active = false;
    const adShowing = player.classList.contains('ad-showing');
    const track = state.track && state.track.videoId === state.videoId ? state.track : null;

    if (!adShowing && ccIsOn()) {
      if (track) {
        active = true;
        const ms = video.currentTime * 1000;
        const i = cueIndexAt(track, ms);
        // 겹치는 자막: 지금 시간에 걸치는 가장 최근 줄
        if (i >= 0 && ms < track.cues[i].e) {
          orig = track.cues[i].text;
          tr = track.tr[i] || '';
        } else if (i > 0 && ms < track.cues[i - 1].e) {
          orig = track.cues[i - 1].text;
          tr = track.tr[i - 1] || '';
        }
      } else {
        const live = liveModeUpdate();
        if (live) {
          active = true;
          orig = live.orig;
          tr = live.tr;
        }
      }
    }
    applyNativeCaptionVisibility(active);

    const ov = ensureOverlay();
    if (!ov) return;
    const dual = settings.displayMode === 'dual' && !(track && track.sameLang);
    // 번역이 아직 없으면 원문을 대신 보여줌
    const showOrig = dual ? orig : '';
    const showTr = tr || (dual ? '' : orig);
    const pending = !!orig && !tr;

    const h = player.clientHeight || 360;
    const fs = Math.max(12, Math.round(h * 0.042 * (settings.fontScale || 1)));
    const controlsShown = !player.classList.contains('ytp-autohide');
    const bottom = controlsShown ? Math.max(58, h * 0.1) : Math.max(16, h * 0.05);
    const key = `${showOrig}\u0001${showTr}\u0001${pending}\u0001${fs}\u0001${Math.round(bottom)}`;
    if (key === state.renderKey) return;
    state.renderKey = key;

    if (!showOrig && !showTr) { ov.style.display = 'none'; return; }
    ov.style.display = 'block';
    ov.style.bottom = `${Math.round(bottom)}px`;
    ov.style.fontSize = `${fs}px`;
    const [o, t] = ov.querySelectorAll('.yst-line');
    o.textContent = showOrig;
    o.style.display = showOrig ? '' : 'none';
    t.textContent = showTr;
    t.style.display = showTr ? '' : 'none';
    t.classList.toggle('yst-pending', pending && !dual);
  }

  function loop() {
    try {
      if (state.videoId !== currentVideoId()) onVideoMaybeChanged();
      render();
    } catch (e) {
      // 확장 프로그램이 다시 로드되면 chrome.* 호출이 실패할 수 있음
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
