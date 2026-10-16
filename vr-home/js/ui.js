// 화면 UI: 시작 화면, 상단 정보, 힌트, 미니맵, 메뉴, 편집 막대, 사진
import { ROOMS, WALLS } from './layout.js';
import { CATALOG } from './furniture.js';
import { WALL_COLORS, FLOOR_TYPES } from './textures.js';
import { fmtTime, FONT_UI, FONT_TITLE } from './util.js';

const $ = (id) => document.getElementById(id);

// 평면도 그리기 (시작 화면 · 미니맵 공용)
export function drawPlan(g, W, H, { player, yaw, areas = false, current, bg = true, pad = 10 } = {}) {
  const x0 = -0.2;
  const z0 = -2.5;
  const x1 = 11.2;
  const z1 = 10.2;
  const s = Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2) / (z1 - z0));
  const ox = (W - (x1 - x0) * s) / 2 - x0 * s;
  const oz = (H - (z1 - z0) * s) / 2 - z0 * s;
  const X = (x) => ox + x * s;
  const Z = (z) => oz + z * s;
  g.clearRect(0, 0, W, H);
  if (bg) {
    g.fillStyle = 'rgba(15,21,27,0.86)';
    g.fillRect(0, 0, W, H);
  }
  for (const r of ROOMS) {
    const [a, b, c, d] = r.rect;
    g.fillStyle = r.id === (current && current.id) ? 'rgba(255,181,71,0.28)' : r.hidden ? 'rgba(255,255,255,0.03)' : r.id === 'balcony' ? 'rgba(127,209,255,0.08)' : 'rgba(255,255,255,0.07)';
    g.fillRect(X(a), Z(b), (c - a) * s, (d - b) * s);
  }
  g.strokeStyle = '#d9dfe3';
  g.lineCap = 'square';
  for (const w of WALLS) {
    g.lineWidth = Math.max(1.5, w.t * s * 0.9);
    const segs = [];
    let cur = w.from;
    for (const o of [...w.openings].sort((p, q) => p.from - q.from)) {
      segs.push([cur, o.from]);
      cur = o.to;
    }
    segs.push([cur, w.to]);
    g.beginPath();
    for (const [p, q] of segs) {
      if (q - p < 0.01) continue;
      if (w.axis === 'x') {
        g.moveTo(X(p), Z(w.at));
        g.lineTo(X(q), Z(w.at));
      } else {
        g.moveTo(X(w.at), Z(p));
        g.lineTo(X(w.at), Z(q));
      }
    }
    g.stroke();
    // 창문은 가는 선
    g.lineWidth = 1;
    g.strokeStyle = '#7fd1ff';
    g.beginPath();
    for (const o of w.openings) {
      if (o.type !== 'window' && !(o.type === 'slide' && o.style === 'balcony')) continue;
      if (w.axis === 'x') {
        g.moveTo(X(o.from), Z(w.at));
        g.lineTo(X(o.to), Z(w.at));
      } else {
        g.moveTo(X(w.at), Z(o.from));
        g.lineTo(X(w.at), Z(o.to));
      }
    }
    g.stroke();
    g.strokeStyle = '#d9dfe3';
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const r of ROOMS) {
    if (r.hidden) continue;
    const [a, b, c, d] = r.rect;
    const cx = X((a + c) / 2);
    const cz = Z((b + d) / 2);
    const name = r.name.replace(' (서재)', '');
    let fs = Math.max(9, Math.min(15, s * 0.42));
    g.font = `${fs}px ${FONT_TITLE}`;
    const room = (c - a) * s - 6;
    const tw = g.measureText(name).width;
    if (tw > room) fs = Math.max(7, (fs * room) / tw);
    g.fillStyle = '#eef1ee';
    g.font = `${fs}px ${FONT_TITLE}`;
    g.fillText(name, cx, cz - (areas ? fs * 0.45 : 0));
    if (areas) {
      g.fillStyle = '#93a2ad';
      g.font = `${Math.max(8, fs * 0.72)}px ${FONT_UI}`;
      g.fillText(`${((c - a) * (d - b)).toFixed(1)}㎡`, cx, cz + fs * 0.6);
    }
  }
  if (player) {
    const px = X(player.x);
    const pz = Z(player.z);
    g.save();
    g.translate(px, pz);
    g.rotate(-yaw);
    g.fillStyle = '#ffb547';
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(6, 6);
    g.lineTo(0, 3);
    g.lineTo(-6, 6);
    g.closePath();
    g.fill();
    g.restore();
  }
  return { X, Z, s, toWorld: (px, pz) => ({ x: (px - ox) / s, z: (pz - oz) / s }) };
}

export class UI {
  constructor(app) {
    this.app = app;
    this.menuOpen = false;
    this.toastT = 0;
    this.miniT = 0;
    this.showMini = !matchMedia('(pointer: coarse)').matches;
    this.lastHint = '';
  }

  init() {
    const app = this.app;
    // 시작 화면 평면도
    const plan = $('plan');
    const pg = plan.getContext('2d');
    const drawStart = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = plan.clientWidth || 360;
      const h = Math.round(w * 0.95);
      plan.width = w * dpr;
      plan.height = h * dpr;
      plan.style.height = `${h}px`;
      pg.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPlan(pg, w, h, { areas: true, bg: false, pad: 4 });
    };
    document.fonts && document.fonts.ready.then(drawStart);
    drawStart();
    window.addEventListener('resize', drawStart);

    $('btnWalk').addEventListener('click', () => app.startWalk());
    $('btnVR').addEventListener('click', () => app.enterVR());
    $('btnMenu').addEventListener('click', () => this.toggleMenu());
    $('btnTop').addEventListener('click', () => app.toggleTopView());
    $('btnPhoto').addEventListener('click', () => app.takePhoto());
    $('btnSound').addEventListener('click', () => app.setMuted(!app.settings.muted));
    $('btnHudVR').addEventListener('click', () => app.enterVR());
    $('menuClose').addEventListener('click', () => this.toggleMenu(false));
    $('btnStand').addEventListener('click', () => app.player.standUp());
    $('heldUse').addEventListener('click', () => app.input.use());
    $('heldDrop').addEventListener('click', () => app.input.drop());
    $('heldThrow').addEventListener('click', () => app.input.throw());
    $('photoClose').addEventListener('click', () => ($('photo').hidden = true));
    $('btnTopExit').addEventListener('click', () => app.toggleTopView(false));
    $('pauseNote').addEventListener('click', () => {
      const p = app.renderer.domElement.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    });
    // 편집 막대
    const ed = app.editor;
    $('edRotL').addEventListener('click', () => ed.rotate(15));
    $('edRotR').addEventListener('click', () => ed.rotate(-15));
    $('edDup').addEventListener('click', () => ed.duplicate());
    $('edDel').addEventListener('click', () => ed.remove());
    $('edPlace').addEventListener('click', () => ed.place());
    $('edAdd').addEventListener('click', () => ($('catalog').hidden = !$('catalog').hidden));
    $('edDone').addEventListener('click', () => ed.setActive(false));
    const cat = $('catalogList');
    for (const c of CATALOG) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = c.name;
      b.addEventListener('click', () => {
        ed.add(c);
        $('catalog').hidden = true;
      });
      cat.appendChild(b);
    }
    // 미니맵 클릭 → 순간이동
    $('minimap').addEventListener('click', (e) => {
      if (!this.miniMap) return;
      const r = e.target.getBoundingClientRect();
      const p = this.miniMap.toWorld(e.clientX - r.left, e.clientY - r.top);
      const room = ROOMS.find((rr) => p.x >= rr.rect[0] && p.x <= rr.rect[2] && p.z >= rr.rect[1] && p.z <= rr.rect[3]);
      if (room) app.player.goToRoom(room.id);
    });
    this.buildMenu();
    this.onEdit();
  }

  buildMenu() {
    const app = this.app;
    const S = app.settings;
    // 시간
    const slider = $('timeSlider');
    slider.addEventListener('input', () => app.setTime(+slider.value));
    this.chips('timeMode', [['real', '실제 시간'], ['fast', '빠르게 (1분=1시간)'], ['stop', '멈춤']], () => S.timeMode, (v) => app.setSetting('timeMode', v));
    this.chips('weather', [['clear', '맑음'], ['cloudy', '흐림'], ['rain', '비'], ['snow', '눈']], () => app.world.weather, (v) => app.setWeather(v));
    // 조명
    $('lightsOn').addEventListener('click', () => app.setAllLights(true));
    $('lightsOff').addEventListener('click', () => app.setAllLights(false));
    const lights = $('lightList');
    for (const r of ROOMS) {
      if (r.hidden) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip-btn';
      b.textContent = r.name.replace(' (서재)', '');
      b.addEventListener('click', () => {
        const st = app.roomLights[r.id];
        st.set(!st.on);
        app.audio.at(app.camera, 'switch', { volume: 0.4 });
      });
      b.dataset.room = r.id;
      lights.appendChild(b);
    }
    // 방 이동
    const rooms = $('roomList');
    for (const r of ROOMS) {
      if (r.hidden) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'room-btn';
      const [a, bb, c, d] = r.rect;
      b.innerHTML = `<span>${r.name}</span><small>${((c - a) * (d - bb)).toFixed(1)}㎡</small>`;
      b.addEventListener('click', () => {
        app.player.goToRoom(r.id);
        this.toggleMenu(false);
      });
      rooms.appendChild(b);
    }
    // 꾸미기
    const sw = $('wallSwatches');
    for (const c of WALL_COLORS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = c;
      b.setAttribute('aria-label', `벽 색 ${c}`);
      b.addEventListener('click', () => {
        const room = app.player.room;
        if (room && !room.hidden) app.setWall(room.id, c);
      });
      sw.appendChild(b);
    }
    const fl = $('floorTypes');
    for (const [k, v] of Object.entries(FLOOR_TYPES)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip-btn';
      b.dataset.floor = k;
      b.innerHTML = `<i style="background:${v.color}"></i>${v.name}`;
      b.addEventListener('click', () => {
        const room = app.player.room;
        if (room && !room.hidden) app.setFloor(room.id, k);
      });
      fl.appendChild(b);
    }
    // 가구
    $('editToggle').addEventListener('click', () => {
      app.editor.setActive(!app.editor.active);
      this.toggleMenu(false);
    });
    $('resetLayout').addEventListener('click', () => {
      const b = $('resetLayout');
      if (b.dataset.confirm) app.resetLayout();
      else {
        b.dataset.confirm = '1';
        b.textContent = '정말 처음 배치로 되돌릴까요? 한 번 더 누르세요';
        setTimeout(() => {
          delete b.dataset.confirm;
          b.textContent = '가구 배치 처음으로';
        }, 4000);
      }
    });
    $('resetItems').addEventListener('click', () => app.grab.resetAll());
    // 설정
    const vol = $('volume');
    vol.value = S.volume;
    vol.addEventListener('input', () => app.setSetting('volume', +vol.value));
    const sens = $('sens');
    sens.value = S.sens;
    sens.addEventListener('input', () => app.setSetting('sens', +sens.value));
    this.toggle('optLabels', () => S.labels, (v) => app.setLabels(v));
    this.toggle('optMirrors', () => S.mirrors, (v) => {
      app.setSetting('mirrors', v);
      this.app.toast('거울 설정은 새로고침하면 적용돼요');
    });
    this.toggle('optFast', () => S.fast, (v) => app.setSetting('fast', v));
    this.toggle('optLock', () => S.mouseLock, (v) => app.setSetting('mouseLock', v));
    this.chips('quality', [['4', '가볍게'], ['8', '보통'], ['12', '선명하게']], () => String(S.lights), (v) => app.setSetting('lights', +v));
    this.chips('turnMode', [['30', '스냅 30°'], ['45', '스냅 45°'], ['smooth', '부드럽게']], () => S.turn, (v) => app.setSetting('turn', v));
  }

  chips(id, opts, get, set) {
    const el = $(id);
    el.innerHTML = '';
    const btns = opts.map(([v, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip-btn';
      b.textContent = label;
      b.addEventListener('click', () => {
        set(v);
        this.refresh();
      });
      b._v = v;
      el.appendChild(b);
      return b;
    });
    (this._chips ||= []).push(() => btns.forEach((b) => b.classList.toggle('on', String(get()) === String(b._v))));
  }
  toggle(id, get, set) {
    const el = $(id);
    el.checked = !!get();
    el.addEventListener('change', () => set(el.checked));
    (this._chips ||= []).push(() => (el.checked = !!get()));
  }

  refresh() {
    const app = this.app;
    for (const f of this._chips || []) f();
    $('timeSlider').value = app.time.hour.toFixed(2);
    $('timeValue').textContent = fmtTime(app.time.hour);
    for (const b of $('lightList').children) b.classList.toggle('on', app.roomLights[b.dataset.room].on);
    const room = app.player.room;
    $('decorRoom').textContent = room && !room.hidden ? room.name : '방 안에 서 있을 때 바꿀 수 있어요';
    const ft = room && app.state.rooms[room.id]?.floor || room?.floor;
    for (const b of $('floorTypes').children) b.classList.toggle('on', b.dataset.floor === ft);
    $('editToggle').textContent = app.editor.active ? '편집 모드 끝내기' : '가구 옮기기 시작 (B)';
    $('btnSound').textContent = app.settings.muted ? '소리 켜기' : '소리 끄기';
    $('btnSound').setAttribute('aria-pressed', String(!app.settings.muted));
  }

  toggleMenu(open = !this.menuOpen) {
    this.menuOpen = open;
    $('menu').hidden = !open;
    if (open) {
      if (document.pointerLockElement) document.exitPointerLock();
      this.refresh();
    }
  }
  toggleMinimap() {
    this.showMini = !this.showMini;
  }
  onLock(locked) {
    $('crosshair').classList.toggle('free', !locked && !this.app.input.touch);
    $('pauseNote').hidden = locked || this.app.input.touch || this.app.input.lockFailed || !this.app.started || this.menuOpen || !this.app.settings.mouseLock;
  }
  onEdit() {
    const ed = this.app.editor;
    $('editBar').hidden = !ed.active;
    if (!ed.active) $('catalog').hidden = true;
    $('edName').textContent = ed.sel ? ed.sel.name : this.app.input && this.app.input.touch ? '가구를 탭해서 고르세요' : '가구를 클릭해서 고르세요';
    for (const id of ['edRotL', 'edRotR', 'edDup', 'edDel']) $(id).disabled = !ed.sel;
    $('edPlace').hidden = !ed.moving;
    document.body.classList.toggle('editing', ed.active);
  }

  toast(msg, ms = 2200) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    this.toastT = ms / 1000;
  }

  update(dt) {
    const app = this.app;
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) $('toast').classList.remove('show');
    }
    if (!app.started) return;
    const room = app.player.room;
    $('roomChip').textContent = room ? room.name : '';
    $('timeChip').textContent = `${fmtTime(app.time.hour)} · ${app.weatherName()}`;
    // 힌트
    let hint = '';
    const touch = app.input.touch;
    const held = app.grab.heldBy('desktop');
    if (app.topView) hint = touch ? '두 손가락으로 돌려 보고, 바닥을 탭하면 그곳으로 가요' : '드래그: 돌려 보기 · 휠: 확대 · 바닥 클릭: 그곳으로 이동';
    else if (app.editor.active) {
      const l = app.interaction.label('desktop');
      hint = app.editor.moving ? (touch ? '바닥을 탭하면 거기에 놓아요' : '클릭: 여기에 놓기 · R/휠: 돌리기') : l ? (touch ? `탭: ${l}` : `클릭: ${l}`) : '';
    } else {
      const l = app.interaction.label('desktop');
      if (l) hint = touch ? `탭: ${l}` : `E · 클릭: ${l}`;
      if (held && !touch) hint = `${held.name} 들고 있음 · 클릭: 던지기 · Q: 내려놓기${held.use ? ' · F: 쓰기' : ''}${l ? ` · E: ${l}` : ''}`;
    }
    if (hint !== this.lastHint) {
      this.lastHint = hint;
      $('hint').textContent = hint;
      $('hint').classList.toggle('show', !!hint);
    }
    $('crosshair').classList.toggle('hot', !!app.interaction.label('desktop'));
    $('heldBar').hidden = !(held && touch);
    if (held) $('heldName').textContent = held.name;
    $('heldUse').hidden = !(held && held.use);
    $('seatBar').hidden = !app.player.seat;
    // 미니맵
    const mm = $('minimap');
    mm.hidden = !this.showMini || app.topView;
    this.miniT -= dt;
    if (!mm.hidden && this.miniT <= 0) {
      this.miniT = 0.1;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = mm.clientWidth || 200;
      const h = mm.clientHeight || 220;
      if (mm.width !== Math.round(w * dpr)) {
        mm.width = Math.round(w * dpr);
        mm.height = Math.round(h * dpr);
      }
      const g = mm.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.miniDpr = dpr;
      this.miniMap = drawPlan(g, w, h, { player: app.viewerPos, yaw: app.player.yaw, current: room, pad: 8 });
    }
    if (this.menuOpen) {
      this.refreshT = (this.refreshT || 0) - dt;
      if (this.refreshT <= 0) {
        this.refreshT = 0.5;
        this.refresh();
      }
    }
  }

  showPhoto(url) {
    $('photoImg').src = url;
    $('photoSave').href = url;
    $('photo').hidden = false;
  }
}
