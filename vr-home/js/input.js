// PC · 모바일 입력: 마우스 시점, 키보드 이동, 클릭/탭 상호작용, 가상 조이스틱
import * as THREE from 'three';

export class Input {
  constructor(app) {
    this.app = app;
    this.canvas = app.renderer.domElement;
    this.locked = false;
    this.lockFailed = false;
    this.mouse = new THREE.Vector2(0, 0);
    this.ray = new THREE.Raycaster();
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.drag = null;
    this.enabled = false;
    this.bind();
  }

  bind() {
    const c = this.canvas;
    const app = this.app;
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === c;
      app.ui.onLock(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockFailed = true;
      app.ui.onLock(false);
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousedown', (e) => {
      if (!this.enabled || app.topView) return;
      this.drag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button };
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || app.topView) return;
      if (this.locked) {
        app.player.look(e.movementX * 0.0022 * app.settings.sens, e.movementY * 0.0022 * app.settings.sens);
        return;
      }
      const r = c.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if (this.drag) {
        const dx = e.clientX - this.drag.x;
        const dy = e.clientY - this.drag.y;
        this.drag.moved += Math.abs(dx) + Math.abs(dy);
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
        app.player.look(dx * 0.004, dy * 0.004);
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (!this.enabled || app.topView || !this.drag) return;
      const d = this.drag;
      this.drag = null;
      if (d.moved > 6) return;
      if (this.locked) {
        if (e.button === 2) this.secondary();
        else this.primary();
      } else if (!this.lockFailed && !this.touch && app.settings.mouseLock) {
        const p = c.requestPointerLock();
        if (p && p.catch)
          p.catch(() => {
            this.lockFailed = true;
            app.ui.onLock(false);
          });
      } else {
        if (e.button === 2) this.secondary();
        else this.primary();
      }
    });
    c.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      if (app.editor.active && app.editor.sel) {
        e.preventDefault();
        app.editor.rotate(e.deltaY > 0 ? -15 : 15);
      }
    }, { passive: false });
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => app.player.keys.clear());
    this.bindTouch();
  }

  key(e, down) {
    const app = this.app;
    if (!this.enabled) return;
    if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) && e.code !== 'Escape') return;
    const k = e.code;
    if (down) app.player.keys.add(k);
    else app.player.keys.delete(k);
    if (!down || e.repeat) return;
    const ed = app.editor;
    switch (k) {
      case 'KeyE':
        this.primary(true);
        break;
      case 'KeyF':
        this.use();
        break;
      case 'KeyQ':
        this.drop();
        break;
      case 'Space':
        e.preventDefault();
        if (app.player.seat) app.player.standUp();
        break;
      case 'KeyC':
        app.player.toggleCrouch();
        break;
      case 'Tab':
        e.preventDefault();
        app.ui.toggleMenu();
        break;
      case 'KeyM':
        app.ui.toggleMinimap();
        break;
      case 'KeyT':
        app.toggleTopView();
        break;
      case 'KeyP':
        app.takePhoto();
        break;
      case 'KeyL':
        app.setAllLights(!app.anyLightOn());
        break;
      case 'KeyN':
        app.setLabels(!app.settings.labels);
        break;
      case 'KeyB':
        ed.setActive(!ed.active);
        break;
      case 'KeyR':
        if (ed.active && ed.sel) ed.rotate(e.shiftKey ? -15 : 15);
        break;
      case 'Delete':
      case 'Backspace':
        if (ed.active && ed.sel) ed.remove();
        break;
      case 'Digit1':
        app.setTime(8);
        break;
      case 'Digit2':
        app.setTime(13);
        break;
      case 'Digit3':
        app.setTime(18.6);
        break;
      case 'Digit4':
        app.setTime(22.5);
        break;
      case 'Escape':
        if (app.ui.menuOpen) app.ui.toggleMenu(false);
        else if (app.topView) app.toggleTopView(false);
        break;
    }
  }

  // 화면 가운데(또는 마우스·탭 위치)에서 광선
  pointerRay(ndc) {
    const cam = this.app.camera;
    this.ray.setFromCamera(ndc || (this.locked || this.touch ? new THREE.Vector2(0, 0) : this.mouse), cam);
    return this.ray.ray;
  }

  primary(fromKey) {
    const app = this.app;
    const ed = app.editor;
    if (ed.active) {
      if (ed.moving) return ed.place();
      const h = app.interaction.hover.get('desktop');
      if (h && h.furn) {
        ed.select(app.furniture.get(h.furn.userData.furn.id));
        ed.startMove(h.point);
      } else ed.select(null);
      return;
    }
    const held = app.grab.heldBy('desktop');
    if (held) {
      // 들고 있을 때: 클릭은 던지기, E는 가리킨 것 쓰기(없으면 내려놓기)
      if (!fromKey) return this.throw();
      const h = app.interaction.hover.get('desktop');
      if (!h || !h.spec || h.spec.kind === 'grab') return this.drop();
    }
    app.interaction.activate('desktop', 'desktop');
  }
  secondary() {
    if (this.app.grab.heldBy('desktop')) this.use();
    else if (this.app.player.seat) this.app.player.standUp();
  }
  use() {
    const held = this.app.grab.heldBy('desktop');
    if (held) this.app.grab.use(held);
  }
  drop() {
    const held = this.app.grab.heldBy('desktop');
    if (!held) return;
    const dir = this.app.camera.getWorldDirection(new THREE.Vector3());
    this.app.grab.release(held, dir.multiplyScalar(0.6));
  }
  throw() {
    const held = this.app.grab.heldBy('desktop');
    if (!held) return;
    const dir = this.app.camera.getWorldDirection(new THREE.Vector3());
    this.app.grab.release(held, dir.multiplyScalar(6).add(new THREE.Vector3(0, 1.2, 0)));
    this.app.audio.at(held.obj, 'curtain', { volume: 0.3, rate: 1.8 });
  }

  // ── 터치 ──
  bindTouch() {
    const app = this.app;
    const c = this.canvas;
    const joy = document.getElementById('joy');
    const knob = document.getElementById('joyKnob');
    const touches = new Map();
    const R = 46;
    c.addEventListener(
      'touchstart',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        for (const t of e.changedTouches) {
          const isJoy = t.clientX < window.innerWidth * 0.42 && t.clientY > window.innerHeight * 0.35 && ![...touches.values()].some((v) => v.joy);
          touches.set(t.identifier, { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t: performance.now(), joy: isJoy, moved: 0 });
          if (isJoy) {
            joy.style.left = `${t.clientX - 60}px`;
            joy.style.top = `${t.clientY - 60}px`;
            joy.classList.add('on');
          }
        }
      },
      { passive: false }
    );
    c.addEventListener(
      'touchmove',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        for (const t of e.changedTouches) {
          const s = touches.get(t.identifier);
          if (!s) continue;
          const dx = t.clientX - s.x;
          const dy = t.clientY - s.y;
          s.moved += Math.abs(dx) + Math.abs(dy);
          s.x = t.clientX;
          s.y = t.clientY;
          if (s.joy) {
            let jx = t.clientX - s.sx;
            let jy = t.clientY - s.sy;
            const m = Math.hypot(jx, jy);
            if (m > R) {
              jx *= R / m;
              jy *= R / m;
            }
            knob.style.transform = `translate(${jx}px, ${jy}px)`;
            app.player.joy.x = jx / R;
            app.player.joy.y = jy / R;
          } else if (app.topView) {
            // 도면 보기에서는 OrbitControls가 처리
          } else {
            app.player.look(dx * 0.0055 * app.settings.sens, dy * 0.0055 * app.settings.sens);
          }
        }
      },
      { passive: false }
    );
    const end = (e) => {
      for (const t of e.changedTouches) {
        const s = touches.get(t.identifier);
        touches.delete(t.identifier);
        if (!s) continue;
        if (s.joy) {
          knob.style.transform = '';
          joy.classList.remove('on');
          app.player.joy.x = 0;
          app.player.joy.y = 0;
        } else if (s.moved < 12 && performance.now() - s.t < 350 && this.enabled && !app.topView) {
          this.tap(t.clientX, t.clientY);
        }
      }
    };
    c.addEventListener('touchend', end);
    c.addEventListener('touchcancel', end);
  }

  tap(x, y) {
    const app = this.app;
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    const ray = this.pointerRay(ndc);
    const res = app.interaction.cast(ray.origin, ray.direction, { range: 3.4, edit: app.editor.active });
    const ed = app.editor;
    if (ed.active) {
      if (ed.sel && ed.moving) {
        const t = -ray.origin.y / ray.direction.y;
        if (ray.direction.y < 0 && t > 0) ed.moveTo(ray.origin.clone().addScaledVector(ray.direction, t));
        ed.place();
      } else if (res && res.furn) {
        ed.select(app.furniture.get(res.furn.userData.furn.id));
        ed.startMove(res.point);
        app.toast('바닥을 탭하면 거기로 옮겨요');
      } else ed.select(null);
      return;
    }
    if (res && res.spec) {
      app.interaction.setHover('desktop', res);
      res.spec.action(res, 'desktop');
    }
  }

  update(dt) {
    const app = this.app;
    if (!this.enabled || app.renderer.xr.isPresenting || app.topView) {
      app.interaction.clear('desktop');
      return;
    }
    const ray = this.pointerRay();
    const ed = app.editor;
    const held = app.grab.heldBy('desktop');
    const res = app.interaction.cast(ray.origin, ray.direction, { range: 3.2, edit: ed.active });
    app.interaction.setHover('desktop', res && (res.spec || res.furn) && !(ed.moving && res.furn) ? res : null);
    if (ed.active && ed.moving && !this.touch) {
      const t = -ray.origin.y / ray.direction.y;
      if (ray.direction.y < -0.02 && t > 0 && t < 12) ed.moveTo(ray.origin.clone().addScaledVector(ray.direction, t));
    }
    if (held) {
      const cam = app.camera;
      const dir = cam.getWorldDirection(new THREE.Vector3());
      const pos = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, 0.6);
      pos.y -= 0.15;
      this.holdInfo = { pos, yaw: app.player.yaw };
    } else this.holdInfo = null;
  }
}
