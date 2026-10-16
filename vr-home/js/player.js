// 플레이어: PC(마우스·키보드) · 모바일(터치) 이동, 충돌, 앉기·눕기
import * as THREE from 'three';
import { ROOMS, SPAWN } from './layout.js';
import { roomAt } from './house.js';
import { clamp, damp } from './util.js';

const UP = new THREE.Vector3(0, 1, 0);

export class Player {
  constructor(app) {
    this.app = app;
    this.rig = new THREE.Group();
    this.rig.name = 'rig';
    app.scene.add(this.rig);
    this.camera = app.camera;
    this.rig.add(this.camera);
    this.eye = 1.6;
    this.eyeTarget = 1.6;
    this.pitch = 0;
    this.yaw = SPAWN.yaw;
    this.radius = 0.22;
    this.seat = null;
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.vrHeight = 0;
    this.speed = 1.6;
    this.rig.position.set(SPAWN.x, 0, SPAWN.z);
    this.room = null;
    this._v = new THREE.Vector3();
    this.applyDesktopCamera();
  }

  get inVR() {
    return this.app.renderer.xr.isPresenting;
  }

  applyDesktopCamera() {
    this.rig.rotation.y = this.yaw;
    this.camera.position.set(0, this.eye, 0);
    this.camera.rotation.set(this.pitch, 0, 0);
  }

  headWorld(out = this._v) {
    return this.camera.getWorldPosition(out);
  }

  // 사각형 충돌 + 집 밖으로 못 나가게
  tryMove(from, dx, dz) {
    const p = { x: from.x + dx, z: from.z + dz };
    this.app.collision.resolve(p, this.radius);
    if (!roomAt(p.x, p.z)) return { x: from.x, z: from.z };
    return p;
  }

  moveHead(dx, dz) {
    const head = this.headWorld(new THREE.Vector3());
    const p = this.tryMove(head, dx, dz);
    this.rig.position.x += p.x - head.x;
    this.rig.position.z += p.z - head.z;
  }

  teleport(x, z, yaw) {
    this.standUp(true);
    if (this.inVR) {
      const head = this.headWorld(new THREE.Vector3());
      this.rig.position.x += x - head.x;
      this.rig.position.z += z - head.z;
    } else {
      this.rig.position.set(x, 0, z);
      if (yaw !== undefined) {
        this.yaw = yaw;
        this.pitch = 0;
        this.applyDesktopCamera();
      }
    }
  }

  snapTurn(angle) {
    const head = this.headWorld(new THREE.Vector3());
    this.rig.position.sub(head).applyAxisAngle(UP, angle).add(head);
    this.rig.rotation.y += angle;
    this.yaw = this.rig.rotation.y;
  }

  goToRoom(id) {
    const r = ROOMS.find((rr) => rr.id === id);
    if (!r) return;
    let x = (r.rect[0] + r.rect[2]) / 2;
    let z = (r.rect[1] + r.rect[3]) / 2;
    // 가구에 막히면 근처 빈자리 찾기
    for (let k = 0; k < 40 && this.app.collision.blocked(x, z, this.radius); k++) {
      const a = k * 2.4;
      const d = 0.15 + k * 0.04;
      x = (r.rect[0] + r.rect[2]) / 2 + Math.cos(a) * d;
      z = (r.rect[1] + r.rect[3]) / 2 + Math.sin(a) * d;
    }
    this.teleport(x, z, this.yaw);
    this.app.toast(`📍 ${r.name}(으)로 이동했어요`);
  }

  // ── 앉기 · 눕기 ──
  sitOn(root, point) {
    const seats = root.userData.seats || [];
    if (!seats.length) return;
    let best = seats[0];
    let bd = Infinity;
    for (const s of seats) {
      const w = root.localToWorld(new THREE.Vector3(s.x, s.y, s.z));
      const d = point ? w.distanceTo(point) : 0;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    const world = root.localToWorld(new THREE.Vector3(best.x, best.y, best.z));
    const face = root.rotation.y + (best.yaw || 0);
    const front = root.localToWorld(new THREE.Vector3(best.x, 0, best.z + (best.lie ? 0 : 0.55)));
    if (best.lie) {
      // 침대 옆으로 일어나기
      const side = root.localToWorld(new THREE.Vector3((root.userData.furn?.info?.w || 1.2) / 2 + 0.35, 0, best.z + 0.6));
      front.copy(side);
    }
    this.seat = { root, best, prev: this.rig.position.clone(), stand: front, lie: !!best.lie };
    const eyeY = best.lie ? best.y + 0.12 : best.y + 0.68;
    if (this.inVR) {
      const head = this.headWorld(new THREE.Vector3());
      this.rig.position.x += world.x - head.x;
      this.rig.position.z += world.z - head.z;
      this.rig.position.y = eyeY - this.camera.position.y;
    } else {
      this.rig.position.set(world.x, 0, world.z);
      this.eyeTarget = eyeY;
      this.yaw = face + Math.PI;
      this.pitch = best.lie ? 0.95 : -0.05;
      this.applyDesktopCamera();
    }
    this.app.audio.at(root, 'cabinetClose', { volume: 0.25, rate: 0.7 });
    this.app.events.emit('seat', this.seat);
    this.app.toast(best.lie ? '🛏️ 누웠어요 · 움직이면 일어나요' : '🪑 앉았어요 · 움직이면 일어나요');
  }

  standUp(silent) {
    if (!this.seat) return;
    const s = this.seat;
    this.seat = null;
    let p = s.stand;
    if (this.app.collision.blocked(p.x, p.z, this.radius) || !roomAt(p.x, p.z)) p = s.prev;
    if (this.inVR) {
      const head = this.headWorld(new THREE.Vector3());
      this.rig.position.x += p.x - head.x;
      this.rig.position.z += p.z - head.z;
      this.rig.position.y = this.vrHeight;
    } else {
      this.rig.position.set(p.x, 0, p.z);
      this.eyeTarget = this.crouch ? 1.0 : 1.6;
      if (this.pitch > 0.5) this.pitch = 0;
      this.applyDesktopCamera();
    }
    this.app.events.emit('seat', null);
    if (!silent) this.app.toast('일어났어요');
  }

  onEnterVR() {
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
    this.rig.position.y = this.vrHeight;
  }
  onExitVR() {
    this.rig.position.y = 0;
    this.yaw = this.rig.rotation.y;
    this.pitch = 0;
    this.applyDesktopCamera();
  }
  calibrateHeight() {
    // 지금 머리 높이를 1.6m로 맞춤 (앉아서 할 때)
    const local = this.camera.position.y;
    this.vrHeight = clamp(1.62 - local, -0.5, 1.2);
    if (!this.seat) this.rig.position.y = this.vrHeight;
    this.app.toast(`키 맞춤 완료 (${this.vrHeight >= 0 ? '+' : ''}${Math.round(this.vrHeight * 100)}cm)`);
  }

  // ── PC · 모바일 이동 ──
  update(dt) {
    const app = this.app;
    if (this.inVR) {
      this.room = roomAt(...this.xz(this.headWorld()));
      return;
    }
    const k = this.keys;
    let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    let turn = (k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0);
    f += -this.joy.y;
    s += this.joy.x;
    const mag = Math.hypot(f, s);
    if (mag > 1) {
      f /= mag;
      s /= mag;
    }
    if (turn) {
      this.yaw += turn * dt * 1.8;
    }
    if (mag > 0.05 && this.seat) this.standUp();
    if (mag > 0.05 && !this.seat && !app.topView) {
      const run = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(this.joy.x, this.joy.y) > 0.95;
      const sp = this.speed * (run ? 1.9 : 1) * (this.crouch ? 0.55 : 1);
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      const dx = (-sin * f + cos * s) * sp * dt;
      const dz = (-cos * f - sin * s) * sp * dt;
      const p = this.tryMove(this.rig.position, dx, dz);
      this.rig.position.x = p.x;
      this.rig.position.z = p.z;
      this.bob = (this.bob || 0) + dt * sp * 5.5;
    }
    this.eye = damp(this.eye, this.eyeTarget, 8, dt);
    const bob = this.seat || mag < 0.05 ? 0 : Math.sin(this.bob) * 0.018;
    this.rig.rotation.y = this.yaw;
    this.camera.position.set(0, this.eye + bob, 0);
    this.camera.rotation.set(this.pitch, 0, 0);
    this.room = roomAt(this.rig.position.x, this.rig.position.z);
  }
  xz(v) {
    return [v.x, v.z];
  }
  look(dx, dy) {
    this.yaw -= dx;
    this.pitch = clamp(this.pitch - dy, -1.45, 1.45);
  }
  toggleCrouch() {
    this.crouch = !this.crouch;
    if (!this.seat) this.eyeTarget = this.crouch ? 1.0 : 1.6;
  }
}
