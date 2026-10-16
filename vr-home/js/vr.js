// VR: 컨트롤러 (이동 · 회전 · 순간이동 · 잡기 · 누르기) + 손목 메뉴
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { ROOMS } from './layout.js';
import { roomAt } from './house.js';
import { noRaycast } from './systems.js';
import { liveCanvas, roundRect, FONT_UI, FONT_TITLE, fmtTime } from './util.js';
import { CATALOG } from './furniture.js';
import { WALL_COLORS, FLOOR_TYPES } from './textures.js';

export class VRControls {
  constructor(app) {
    this.app = app;
    this.hands = [];
    this.turnReady = true;
    this.teleport = null;
    const r = app.renderer;
    const factory = new XRControllerModelFactory();
    for (let i = 0; i < 2; i++) {
      const ctrl = r.xr.getController(i);
      const grip = r.xr.getControllerGrip(i);
      app.player.rig.add(ctrl, grip);
      try {
        grip.add(factory.createControllerModel(grip));
      } catch (e) {}
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 })
      );
      line.raycast = noRaycast;
      line.visible = false;
      ctrl.add(line);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffb547' }));
      dot.raycast = noRaycast;
      dot.visible = false;
      app.scene.add(dot);
      const tip = makeTip();
      tip.sprite.position.set(0, 0.07, -0.08);
      ctrl.add(tip.sprite);
      const hand = { i, ctrl, grip, line, dot, tip, source: null, gp: null, handed: '', prev: [], hist: [], hovered: null, dragging: null, trigger: false, squeeze: false };
      ctrl.addEventListener('connected', (e) => {
        hand.source = e.data;
        hand.gp = e.data.gamepad;
        hand.handed = e.data.handedness;
        line.visible = true;
      });
      ctrl.addEventListener('disconnected', () => {
        hand.source = null;
        hand.gp = null;
        line.visible = false;
        dot.visible = false;
      });
      ctrl.addEventListener('selectstart', () => this.onTrigger(hand, true));
      ctrl.addEventListener('selectend', () => this.onTrigger(hand, false));
      ctrl.addEventListener('squeezestart', () => this.onSqueeze(hand, true));
      ctrl.addEventListener('squeezeend', () => this.onSqueeze(hand, false));
      this.hands.push(hand);
    }
    // 순간이동 포물선
    const pts = new Float32Array(40 * 3);
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.arc = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color: '#7fd1ff' }));
    this.arc.frustumCulled = false;
    this.arc.visible = false;
    this.arc.raycast = noRaycast;
    app.scene.add(this.arc);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.24, 32), new THREE.MeshBasicMaterial({ color: '#7fd1ff', transparent: true, opacity: 0.8, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.ring.raycast = noRaycast;
    app.scene.add(this.ring);
    this.menu = new VRMenu(app);
  }

  ray(hand, origin, dir) {
    hand.ctrl.getWorldPosition(origin);
    dir.set(0, 0, -1).applyQuaternion(hand.ctrl.getWorldQuaternion(new THREE.Quaternion()));
  }

  onTrigger(hand, down) {
    const app = this.app;
    hand.trigger = down;
    if (down) {
      if (hand.menuHit) return this.menu.click(hand.menuHit);
      const held = app.grab.heldBy(hand.grip);
      if (held) return app.grab.use(held);
      const h = hand.hovered;
      if (app.editor.active) {
        if (h && h.furn) {
          app.editor.select(app.furniture.get(h.furn.userData.furn.id));
          app.editor.startMove(h.point);
          hand.dragging = true;
        } else app.editor.select(null);
        return;
      }
      if (h && h.spec) {
        if (h.spec.kind === 'grab') {
          app.grab.pickUp(h.target.userData.grab, hand.grip);
          hand.grabBtn = 'trigger';
        } else h.spec.action(h, hand.grip);
        this.pulse(hand, 0.3, 40);
      }
    } else {
      if (hand.dragging) {
        hand.dragging = false;
        app.editor.place();
      }
      const held = app.grab.heldBy(hand.grip);
      if (held && hand.grabBtn === 'trigger') this.releaseHeld(hand, held);
    }
  }

  onSqueeze(hand, down) {
    const app = this.app;
    hand.squeeze = down;
    const held = app.grab.heldBy(hand.grip);
    if (down) {
      if (held) return;
      const h = hand.hovered;
      let target = h && h.spec && h.spec.kind === 'grab' ? h.target.userData.grab : null;
      if (!target) {
        // 손 가까이 있는 물건
        const p = hand.grip.getWorldPosition(new THREE.Vector3());
        let bd = 0.25;
        for (const it of app.grab.items) {
          const d = it.obj.position.distanceTo(p);
          if (!it.holder && d < bd) {
            bd = d;
            target = it;
          }
        }
      }
      if (target) {
        app.grab.pickUp(target, hand.grip);
        hand.grabBtn = 'squeeze';
        this.pulse(hand, 0.4, 50);
      }
    } else if (held && hand.grabBtn === 'squeeze') this.releaseHeld(hand, held);
  }

  releaseHeld(hand, held) {
    const v = new THREE.Vector3();
    const hs = hand.hist;
    if (hs.length >= 2) {
      const a = hs[0];
      const b = hs[hs.length - 1];
      const dt = Math.max(0.016, b.t - a.t);
      v.subVectors(b.p, a.p).divideScalar(dt);
      if (v.length() > 12) v.setLength(12);
    }
    this.app.grab.release(held, v);
  }

  pulse(hand, intensity, ms) {
    try {
      const a = hand.gp && hand.gp.hapticActuators && hand.gp.hapticActuators[0];
      if (a && a.pulse) a.pulse(intensity, ms);
    } catch (e) {}
  }

  update(dt, time) {
    const app = this.app;
    if (!app.renderer.xr.isPresenting) return;
    const o = new THREE.Vector3();
    const d = new THREE.Vector3();
    const settings = app.settings;
    let moveX = 0;
    let moveY = 0;
    for (const hand of this.hands) {
      if (!hand.source) continue;
      const gp = hand.gp;
      const ax = gp && gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : gp && gp.axes.length >= 2 ? [gp.axes[0], gp.axes[1]] : [0, 0];
      const btn = (k) => !!(gp && gp.buttons[k] && gp.buttons[k].pressed);
      const pressed = (k) => btn(k) && !hand.prev[k];
      // 속도 기록 (던지기용)
      const gpos = hand.grip.getWorldPosition(new THREE.Vector3());
      hand.hist.push({ p: gpos, t: time });
      while (hand.hist.length > 6) hand.hist.shift();
      // 메뉴 버튼 (B · Y)
      if (pressed(5) || pressed(4) && hand.handed === 'left') this.menu.toggle(hand.handed === 'right' ? this.hands.find((h) => h.handed === 'left') || hand : hand);
      if (hand.handed === 'left') {
        moveX = ax[0];
        moveY = ax[1];
      } else {
        // 오른쪽 스틱: 회전 / 앞으로 밀면 순간이동 조준
        const editing = app.editor.active && app.editor.moving;
        if (editing) {
          if (Math.abs(ax[0]) > 0.3) app.editor.rotate(-ax[0] * dt * 120, true);
        } else if (settings.turn === 'smooth') {
          if (Math.abs(ax[0]) > 0.2) app.player.snapTurn(-ax[0] * dt * 2.2);
        } else if (Math.abs(ax[0]) > 0.7 && this.turnReady) {
          app.player.snapTurn((ax[0] > 0 ? -1 : 1) * ((settings.turn === '45' ? 45 : 30) * Math.PI) / 180);
          this.turnReady = false;
        } else if (Math.abs(ax[0]) < 0.3) this.turnReady = true;
        if (!editing) {
          if (ax[1] < -0.7) this.aimTeleport(hand);
          else if (this.teleport && this.teleport.hand === hand && ax[1] > -0.3) this.doTeleport();
        }
        if (pressed(4) && app.player.seat) app.player.standUp();
      }
      if (hand.handed === 'right' && pressed(4) && !app.player.seat && app.editor.active && app.editor.sel) app.editor.rotate(45);
      for (let k = 0; k < (gp ? gp.buttons.length : 0); k++) hand.prev[k] = btn(k);

      // 가리키기
      this.ray(hand, o, d);
      hand.menuHit = this.menu.visible && this.menu.hand !== hand ? this.menu.hit(o, d) : null;
      if (hand.menuHit) {
        hand.hovered = null;
        app.interaction.clear(hand);
        this.setLine(hand, hand.menuHit.distance, true);
        hand.tip.set('');
        continue;
      }
      if (hand.dragging) {
        const t = -o.y / d.y;
        if (d.y < -0.01 && t > 0 && t < 15) app.editor.moveTo(o.clone().addScaledVector(d, t));
      }
      const held = app.grab.heldBy(hand.grip);
      const res = held ? null : app.interaction.cast(o, d, { range: 6, edit: app.editor.active });
      hand.hovered = res;
      app.interaction.setHover(hand, res && (res.spec || res.furn) ? res : null);
      this.setLine(hand, res ? res.distance : 3, !!(res && (res.spec || res.furn)), res && res.point);
      let tip = '';
      if (held) tip = held.use ? `${held.name} · 트리거: 사용` : held.name;
      else if (res && res.furn) tip = `${res.furn.userData.furn.name} · 트리거로 옮기기`;
      else if (res && res.spec) tip = app.interaction.label(hand) + (res.spec.kind === 'grab' ? ' (그립/트리거)' : '');
      hand.tip.set(tip);
    }
    // 왼쪽 스틱 이동
    const mag = Math.hypot(moveX, moveY);
    if (mag > 0.15) {
      if (app.player.seat) app.player.standUp();
      const head = app.camera.getWorldDirection(new THREE.Vector3());
      head.y = 0;
      head.normalize();
      const right = new THREE.Vector3(-head.z, 0, head.x);
      const sp = app.player.speed * (settings.fast ? 1.8 : 1) * dt;
      const mv = head.multiplyScalar(-moveY * sp).addScaledVector(right, moveX * sp);
      app.player.moveHead(mv.x, mv.z);
    }
    this.menu.update(dt);
  }

  setLine(hand, dist, active, point) {
    hand.line.scale.z = Math.max(0.05, dist);
    hand.line.material.color.set(active ? '#ffb547' : '#ffffff');
    hand.line.material.opacity = active ? 0.9 : 0.35;
    hand.dot.visible = !!point;
    if (point) hand.dot.position.copy(point);
  }

  aimTeleport(hand) {
    const app = this.app;
    const o = new THREE.Vector3();
    const d = new THREE.Vector3();
    this.ray(hand, o, d);
    const pos = this.arc.geometry.attributes.position;
    const v = d.clone().multiplyScalar(6.5);
    const p = o.clone();
    const ray = new THREE.Raycaster();
    let target = null;
    let n = 0;
    for (; n < 40; n++) {
      pos.setXYZ(n, p.x, p.y, p.z);
      const next = p.clone().addScaledVector(v, 0.03);
      v.y -= 9.8 * 0.03;
      const seg = next.clone().sub(p);
      ray.set(p, seg.clone().normalize());
      ray.far = seg.length();
      const hit = ray.intersectObjects(app.pickRoots, true)[0];
      if (hit) {
        const nrm = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
        if (nrm.y > 0.7 && hit.point.y < 0.2) target = hit.point;
        p.copy(hit.point);
        n++;
        pos.setXYZ(n, p.x, p.y, p.z);
        n++;
        break;
      }
      p.copy(next);
    }
    for (let k = n; k < 40; k++) pos.setXYZ(k, p.x, p.y, p.z);
    pos.needsUpdate = true;
    const ok = target && roomAt(target.x, target.z) && !app.collision.blocked(target.x, target.z, 0.2);
    this.arc.visible = true;
    this.arc.material.color.set(ok ? '#7fd1ff' : '#ff6b6b');
    this.ring.visible = !!ok;
    if (ok) this.ring.position.set(target.x, 0.02, target.z);
    this.teleport = { hand, target: ok ? target.clone() : null };
  }

  doTeleport() {
    const t = this.teleport;
    this.teleport = null;
    this.arc.visible = false;
    this.ring.visible = false;
    if (t && t.target) {
      this.app.player.teleport(t.target.x, t.target.z);
      this.app.audio.at(this.app.camera, 'pop', { volume: 0.3, rate: 0.7 });
    }
  }

  onSessionEnd() {
    this.menu.hide();
    this.arc.visible = false;
    this.ring.visible = false;
    for (const h of this.hands) {
      h.dot.visible = false;
      this.app.interaction.clear(h);
    }
  }
}

// 컨트롤러 위 말풍선
function makeTip() {
  const lc = liveCanvas(512, 96);
  const mat = new THREE.SpriteMaterial({ map: lc.tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.2, 0.0375, 1);
  sprite.renderOrder = 30;
  sprite.visible = false;
  let last = '';
  return {
    sprite,
    set(text) {
      if (text === last) return;
      last = text;
      sprite.visible = !!text;
      if (!text) return;
      const g = lc.g;
      g.clearRect(0, 0, 512, 96);
      g.font = `600 34px ${FONT_UI}`;
      const w = Math.min(500, g.measureText(text).width + 40);
      roundRect(g, 256 - w / 2, 14, w, 66, 20);
      g.fillStyle = 'rgba(16,22,28,0.88)';
      g.fill();
      g.fillStyle = '#ffd38a';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 256, 49, 470);
      lc.tex.needsUpdate = true;
    },
  };
}

// ── 손목 메뉴 ──
class VRMenu {
  constructor(app) {
    this.app = app;
    this.tab = 'home';
    this.page = 0;
    this.W = 640;
    this.H = 800;
    this.lc = liveCanvas(this.W, this.H);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.375), new THREE.MeshBasicMaterial({ map: this.lc.tex, transparent: true, depthTest: false, toneMapped: false }));
    this.mesh.renderOrder = 25;
    this.mesh.raycast = THREE.Mesh.prototype.raycast;
    this.mesh.visible = false;
    this.items = [];
    this.hoverItem = null;
    this.t = 0;
    this.hand = null;
    this.ray = new THREE.Raycaster();
  }
  get visible() {
    return this.mesh.visible;
  }
  toggle(hand) {
    if (this.visible) return this.hide();
    this.hand = hand;
    hand.grip.add(this.mesh);
    this.mesh.position.set(0, 0.16, -0.06);
    this.mesh.rotation.set(-0.6, 0, 0);
    this.mesh.visible = true;
    this.draw();
    this.app.audio.at(hand.grip, 'click', { volume: 0.4 });
  }
  hide() {
    this.mesh.visible = false;
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
  }
  hit(origin, dir) {
    this.ray.set(origin, dir);
    const h = this.ray.intersectObject(this.mesh, false)[0];
    if (!h || !h.uv) {
      if (this.hoverItem) {
        this.hoverItem = null;
        this.draw();
      }
      return null;
    }
    const x = h.uv.x * this.W;
    const y = (1 - h.uv.y) * this.H;
    const item = this.items.find((it) => x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h) || null;
    if (item !== this.hoverItem) {
      this.hoverItem = item;
      this.draw();
    }
    return { item, distance: h.distance };
  }
  click(hit) {
    if (!hit.item) return;
    this.app.audio.at(this.mesh, 'click', { volume: 0.4 });
    hit.item.action();
    this.draw();
  }
  update(dt) {
    if (!this.visible) return;
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 1;
      this.draw();
    }
  }
  layout() {
    const app = this.app;
    const S = app.settings;
    const items = [];
    const pad = 28;
    let y = 120;
    const row = (defs, h = 64) => {
      const n = defs.length;
      const gap = 12;
      const w = (this.W - pad * 2 - gap * (n - 1)) / n;
      defs.forEach((d, i) => d && items.push({ x: pad + i * (w + gap), y, w, h, ...d }));
      y += h + 12;
    };
    const head = (t) => {
      items.push({ x: pad, y, w: this.W - pad * 2, h: 34, label: t, header: true, action: () => {} });
      y += 40;
    };
    // 탭
    const tabs = [['home', '집'], ['move', '이동'], ['edit', '꾸미기']];
    tabs.forEach(([id, name], i) => items.push({ x: pad + i * 196, y: 40, w: 184, h: 58, label: name, active: this.tab === id, tab: true, action: () => ((this.tab = id), (this.page = 0)) }));
    if (this.tab === 'home') {
      head(`${fmtTime(app.time.hour)} · ${app.weatherName()}`);
      row([['아침', 8], ['낮', 13], ['저녁', 18.6], ['밤', 22.5]].map(([l, h]) => ({ label: l, action: () => app.setTime(h) })));
      row([
        { label: '−1시간', action: () => app.setTime(app.time.hour - 1) },
        { label: '+1시간', action: () => app.setTime(app.time.hour + 1) },
        { label: { real: '실제 시간', fast: '빠르게', stop: '시간 멈춤' }[S.timeMode], active: true, action: () => app.cycleTimeMode() },
      ]);
      row(['clear', 'cloudy', 'rain', 'snow'].map((w) => ({ label: { clear: '맑음', cloudy: '흐림', rain: '비', snow: '눈' }[w], active: app.world.weather === w, action: () => app.setWeather(w) })));
      head('조명');
      row([
        { label: '불 모두 켜기', action: () => app.setAllLights(true) },
        { label: '불 모두 끄기', action: () => app.setAllLights(false) },
      ]);
      head('보기 · 소리');
      row([
        { label: S.labels ? '방 이름표 끄기' : '방 이름표 켜기', active: S.labels, action: () => app.setLabels(!S.labels) },
        { label: S.muted ? '소리 켜기' : '소리 끄기', active: !S.muted, action: () => app.setMuted(!S.muted) },
      ]);
      row([{ label: '물건 제자리로', action: () => app.grab.resetAll() }, { label: 'VR 나가기', action: () => app.renderer.xr.getSession()?.end() }]);
    } else if (this.tab === 'move') {
      head('방으로 순간이동');
      const rooms = ROOMS.filter((r) => !r.hidden);
      for (let i = 0; i < rooms.length; i += 3) row(rooms.slice(i, i + 3).map((r) => ({ label: r.name.replace(' (서재)', ''), active: app.player.room && app.player.room.id === r.id, action: () => app.player.goToRoom(r.id) })), 56);
      head('편하게');
      row([
        { label: '키 맞추기', action: () => app.player.calibrateHeight() },
        { label: { 30: '스냅 30°', 45: '스냅 45°', smooth: '부드럽게' }[S.turn], active: true, action: () => app.cycleTurn() },
        { label: S.fast ? '빠르게 걷기' : '보통 걷기', active: S.fast, action: () => app.setSetting('fast', !S.fast) },
      ]);
    } else {
      const ed = app.editor;
      head('가구 옮기기');
      row([{ label: ed.active ? '편집 모드 끄기' : '편집 모드 켜기', active: ed.active, action: () => ed.setActive(!ed.active) }]);
      if (ed.active) {
        head(ed.sel ? `선택: ${ed.sel.name}` : '가구를 트리거로 집어 옮기세요');
        if (ed.sel)
          row([
            { label: '⟲ 45°', action: () => ed.rotate(45) },
            { label: '⟳ 45°', action: () => ed.rotate(-45) },
            { label: '복제', action: () => ed.duplicate() },
            { label: '삭제', action: () => ed.remove() },
          ]);
        head('가구 추가');
        const per = 6;
        const list = CATALOG.slice(this.page * per, this.page * per + per);
        for (let i = 0; i < list.length; i += 2) row(list.slice(i, i + 2).map((c) => ({ label: c.name, action: () => ed.add(c) })), 52);
        row([
          { label: '◀ 이전', action: () => (this.page = Math.max(0, this.page - 1)) },
          { label: `${this.page + 1} / ${Math.ceil(CATALOG.length / per)}`, header: true, action: () => {} },
          { label: '다음 ▶', action: () => (this.page = Math.min(Math.ceil(CATALOG.length / per) - 1, this.page + 1)) },
        ], 52);
      } else {
        const room = app.player.room;
        head(room ? `이 방 꾸미기: ${room.name}` : '방 안에 서 있어야 꾸밀 수 있어요');
        if (room && !room.hidden) {
          row([
            { label: '벽 색 바꾸기', action: () => app.cycleWall(room.id) },
            { label: '바닥 바꾸기', action: () => app.cycleFloor(room.id) },
          ]);
        }
        row([{ label: '배치 처음으로', action: () => app.resetLayout() }]);
      }
    }
    this.items = items;
  }
  draw() {
    this.layout();
    const g = this.lc.g;
    const { W, H } = this;
    g.clearRect(0, 0, W, H);
    roundRect(g, 4, 4, W - 8, H - 8, 36);
    g.fillStyle = 'rgba(14,20,26,0.94)';
    g.fill();
    g.strokeStyle = 'rgba(255,181,71,0.5)';
    g.lineWidth = 3;
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const it of this.items) {
      if (it.header) {
        g.fillStyle = '#9fb0bd';
        g.font = `500 26px ${FONT_UI}`;
        g.textAlign = it.tab ? 'center' : 'left';
        g.fillText(it.label, it.x + (it.tab ? it.w / 2 : 4), it.y + it.h / 2, it.w);
        g.textAlign = 'center';
        continue;
      }
      roundRect(g, it.x, it.y, it.w, it.h, 16);
      const hov = it === this.hoverItem;
      g.fillStyle = it.active ? (it.tab ? '#ffb547' : 'rgba(255,181,71,0.22)') : hov ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)';
      g.fill();
      if (hov) {
        g.strokeStyle = '#ffb547';
        g.lineWidth = 3;
        g.stroke();
      }
      g.fillStyle = it.tab && it.active ? '#1b1205' : '#eef1f3';
      g.font = `${it.tab ? 32 : 26}px ${it.tab ? FONT_TITLE : FONT_UI}`;
      g.fillText(it.label, it.x + it.w / 2, it.y + it.h / 2 + 1, it.w - 12);
    }
    g.fillStyle = '#6f7f8b';
    g.font = `22px ${FONT_UI}`;
    g.fillText('B / Y 버튼: 메뉴 닫기 · 오른손 트리거: 누르기', W / 2, H - 30);
    this.lc.tex.needsUpdate = true;
  }
}
