// 페이지(MAIN world)에서 실행: 유튜브 플레이어가 받아오는 자막(timedtext) 응답을 가로채
// 콘텐츠 스크립트로 전달합니다. 플레이어 자신의 요청을 쓰므로 별도 토큰이 필요 없습니다.
(() => {
  if (window.__ystInjected) return;
  window.__ystInjected = true;

  const isTimedText = (url) => typeof url === 'string' && url.includes('/api/timedtext');
  const post = (url, body) => {
    window.postMessage({ source: 'yst-inject', type: 'timedtext', url, body }, '*');
  };

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const p = origFetch.apply(this, arguments);
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || String(input || '');
      if (isTimedText(url)) {
        p.then((res) => {
          if (res.ok) res.clone().text().then((t) => t && post(res.url || url, t)).catch(() => {});
        }).catch(() => {});
      }
    } catch (_) { /* 무시 */ }
    return p;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try { this.__ystUrl = String(url); } catch (_) { /* 무시 */ }
    return origOpen.apply(this, arguments);
  };

  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    if (isTimedText(this.__ystUrl)) {
      this.addEventListener('load', () => {
        try {
          if (this.status !== 200) return;
          let body = '';
          const rt = this.responseType;
          if (rt === '' || rt === 'text') body = this.responseText;
          else if (rt === 'json') body = JSON.stringify(this.response);
          else if (rt === 'arraybuffer') body = new TextDecoder().decode(this.response);
          if (body) post(this.responseURL || this.__ystUrl, body);
        } catch (_) { /* 무시 */ }
      });
    }
    return origSend.apply(this, arguments);
  };
})();
