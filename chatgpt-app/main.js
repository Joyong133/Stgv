// ChatGPT 데스크톱 — chatgpt.com 웹사이트를 전용 창으로 띄우는 Electron 앱
// 로그인은 사용자가 직접 하고, 로그인 상태는 앱 안에 저장되어 다음 실행 때도 유지됩니다.
const { app, BrowserWindow, Menu, shell, globalShortcut, session } = require('electron');
const fs = require('fs');
const path = require('path');

const START_URL = process.env.CHATGPT_URL || 'https://chatgpt.com/';
const PARTITION = 'persist:chatgpt';
const TOGGLE_SHORTCUT = 'CommandOrControl+Shift+Space';

// 앱 안에서 열어도 되는 사이트 (ChatGPT와 로그인 화면들). 나머지 링크는 기본 브라우저로 엽니다.
const INTERNAL_HOSTS = [
  'chatgpt.com', 'openai.com', 'oaiusercontent.com', 'oaistatic.com',
  'challenges.cloudflare.com',
  'accounts.google.com', 'login.microsoftonline.com', 'login.live.com', 'appleid.apple.com',
];
const startHost = new URL(START_URL).hostname;

function isInternal(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol === 'data:' || protocol === 'about:') return true;
    if (protocol !== 'https:' && !(protocol === 'http:' && hostname === startHost)) return false;
    return hostname === startHost || INTERNAL_HOSTS.some((h) => hostname === h || hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

function openExternal(url) {
  if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
}

// ---------- 창 위치 · 크기 기억 ----------
const stateFile = () => path.join(app.getPath('userData'), 'window.json');
function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; }
}
function saveState(win) {
  try {
    const state = { ...win.getNormalBounds(), maximized: win.isMaximized(), alwaysOnTop: win.isAlwaysOnTop() };
    fs.writeFileSync(stateFile(), JSON.stringify(state));
  } catch { /* 저장 실패는 무시 */ }
}

// ---------- 연결 실패 화면 ----------
function errorPage(detail) {
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>연결 실패</title>
<style>
  body{margin:0;height:100vh;display:grid;place-items:center;font-family:system-ui,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;background:#fff;color:#222}
  @media (prefers-color-scheme:dark){body{background:#18181b;color:#eee}}
  main{text-align:center;padding:24px} p{color:#888} small{color:#888}
  a{display:inline-block;margin-top:12px;padding:10px 20px;border-radius:8px;background:#10a37f;color:#fff;text-decoration:none}
</style>
<main><h1>ChatGPT에 연결할 수 없어요</h1><p>인터넷 연결을 확인한 뒤 다시 시도해 주세요.</p>
<small>${String(detail).replace(/[<>&]/g, '')}</small><br><a href="${START_URL}">다시 시도</a></main></html>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

let win = null;

function createWindow() {
  const state = loadState();
  win = new BrowserWindow({
    width: state.width || 1100,
    height: state.height || 800,
    x: state.x,
    y: state.y,
    minWidth: 380,
    minHeight: 500,
    title: 'ChatGPT',
    alwaysOnTop: !!state.alwaysOnTop,
    autoHideMenuBar: true,
    backgroundColor: '#212121',
    show: false,
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  if (state.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', () => saveState(win));
  win.on('closed', () => { win = null; });

  const wc = win.webContents;

  // 앱 밖 링크는 기본 브라우저로
  wc.on('will-navigate', (e, url) => {
    if (!isInternal(url)) { e.preventDefault(); openExternal(url); }
  });
  // 새 창: 로그인 팝업은 앱 안에서, 나머지는 기본 브라우저로
  wc.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520, height: 720, parent: win, autoHideMenuBar: true,
          webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
        },
      };
    }
    openExternal(url);
    return { action: 'deny' };
  });

  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    // -3(ERR_ABORTED)은 페이지 이동 중 정상적으로 생기는 값이라 무시
    if (isMainFrame && code !== -3) win.loadURL(errorPage(`${desc} (${code})`));
  });

  win.loadURL(START_URL);
}

function toggleWindow() {
  if (!win) { createWindow(); return; }
  if (win.isVisible() && win.isFocused()) {
    if (process.platform === 'darwin') app.hide(); else win.minimize();
  } else {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const withWin = (fn) => () => { if (win) fn(win); };
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '채팅',
      submenu: [
        { label: '새 채팅', accelerator: 'CommandOrControl+N', click: withWin((w) => w.loadURL(START_URL)) },
        { label: '임시 채팅', accelerator: 'CommandOrControl+Shift+N', click: withWin((w) => w.loadURL(new URL('/?temporary-chat=true', START_URL).href)) },
        { type: 'separator' },
        { label: '뒤로', accelerator: 'Alt+Left', click: withWin((w) => w.webContents.navigationHistory.canGoBack() && w.webContents.navigationHistory.goBack()) },
        { label: '앞으로', accelerator: 'Alt+Right', click: withWin((w) => w.webContents.navigationHistory.canGoForward() && w.webContents.navigationHistory.goForward()) },
        { type: 'separator' },
        isMac ? { role: 'close', label: '창 닫기' } : { role: 'quit', label: '끝내기' },
      ],
    },
    {
      label: '편집',
      submenu: [
        { role: 'undo', label: '실행 취소' }, { role: 'redo', label: '다시 실행' }, { type: 'separator' },
        { role: 'cut', label: '잘라내기' }, { role: 'copy', label: '복사' }, { role: 'paste', label: '붙여넣기' },
        { role: 'selectAll', label: '모두 선택' },
      ],
    },
    {
      label: '보기',
      submenu: [
        { role: 'reload', label: '새로고침' },
        { type: 'separator' },
        { role: 'zoomIn', label: '확대' }, { role: 'zoomOut', label: '축소' }, { role: 'resetZoom', label: '원래 크기' },
        { type: 'separator' },
        {
          label: '항상 위에 표시', type: 'checkbox', checked: !!loadState().alwaysOnTop,
          click: (item) => win && win.setAlwaysOnTop(item.checked),
        },
        { role: 'togglefullscreen', label: '전체 화면' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '개발자 도구' },
      ],
    },
    {
      label: '도움말',
      submenu: [
        { label: `창 불러오기/숨기기: ${isMac ? 'Cmd' : 'Ctrl'}+Shift+Space`, enabled: false },
        { label: '기본 브라우저에서 열기', click: withWin((w) => openExternal(w.webContents.getURL())) },
        {
          label: '로그아웃 (앱에 저장된 로그인 지우기)',
          click: async () => {
            await session.fromPartition(PARTITION).clearStorageData();
            if (win) win.loadURL(START_URL);
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- 앱 시작 ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => toggleWindow());

  app.whenReady().then(() => {
    // 마이크(음성 입력) · 알림 · 클립보드 권한은 ChatGPT 관련 사이트에만 허용
    session.fromPartition(PARTITION).setPermissionRequestHandler((wc, permission, callback) => {
      const allowed = ['media', 'notifications', 'clipboard-sanitized-write', 'fullscreen'];
      callback(allowed.includes(permission) && isInternal(wc.getURL()));
    });

    buildMenu();
    createWindow();
    globalShortcut.register(TOGGLE_SHORTCUT, toggleWindow);

    app.on('activate', () => { if (!win) createWindow(); else win.show(); });
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
