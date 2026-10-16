// 집 안을 돌아다니는 것들: 로봇청소기 · 고양이 나비
import * as THREE from 'three';
import { ROOMS } from './layout.js';
import { roomAt } from './house.js';
import { bake } from './furniture.js';
import { liveCanvas } from './util.js';
import { noRaycast } from './systems.js';

const TAU = Math.PI * 2;

export class Robot {
  constructor(app) {
    this.app = app;
    const { M } = app;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 32), M.white);
    body.position.y = 0.05;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.012, 32), M.charcoal);
    top.position.y = 0.095;
    const lidar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.025, 16), M.white);
    lidar.position.set(0, 0.112, -0.06);
    const bumper = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.04, 32, 1, true, -1.2, 2.4), M.gray);
    bumper.position.y = 0.04;
    g.add(body, top, lidar, bumper);
    bake(g);
    this.led = new THREE.MeshBasicMaterial({ color: '#47d17a' });
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.012, 12), this.led);
    led.rotation.x = -Math.PI / 2;
    led.position.set(0, 0.102, 0.05);
    g.add(led);
    this.brush = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.004, 0.012), M.charcoal);
    this.brush.position.set(0.1, 0.01, 0.12);
    g.add(this.brush);
    g.userData.inter = {
      label: () => (this.running ? '로봇청소기 멈추기' : '로봇청소기 시작'),
      action: () => this.toggle(),
    };
    this.g = g;
    app.petGroup.add(g);
    this.state = 'docked';
    this.heading = 0;
    this.dock = new THREE.Vector3(7.2, 0, 6.05);
    this.dockYaw = -Math.PI / 2;
    g.position.copy(this.dock);
    app.events.on('dock', (root) => {
      const p = root.localToWorld(new THREE.Vector3(0, 0, 0.3));
      this.dock.set(p.x, 0, p.z);
      this.dockYaw = root.rotation.y;
      if (this.state === 'docked') {
        g.position.copy(this.dock);
        g.rotation.y = this.dockYaw;
      }
    });
  }
  get running() {
    return this.state === 'cleaning';
  }
  toggle() {
    if (this.state === 'cleaning') {
      this.state = 'returning';
      this.t = 0;
      this.app.toast('🤖 로봇청소기가 충전대로 돌아가요');
    } else {
      this.state = 'cleaning';
      this.t = 0;
      this.heading = this.dockYaw + Math.PI;
      if (!this.snd) this.snd = this.app.audio.loop(this.g, 'vacuum', { volume: 0.35 });
      this.app.audio.at(this.g, 'melody', { volume: 0.4, rate: 1.3 });
      this.app.toast('🤖 청소를 시작할게요!');
    }
  }
  stopSound() {
    if (this.snd) {
      this.snd.stop();
      this.snd = null;
    }
  }
  free(x, z) {
    return roomAt(x, z) && !this.app.collision.blocked(x, z, 0.17, { skip: (k) => k === 'elevator' });
  }
  update(dt) {
    const g = this.g;
    if (this.state === 'docked') {
      this.led.color.set('#47d17a');
      return;
    }
    this.t += dt;
    this.brush.rotation.y += dt * 18;
    this.led.color.set(this.state === 'cleaning' ? '#5ac8ff' : '#ffb547');
    const sp = 0.28 * dt;
    if (this.state === 'returning') {
      const dx = this.dock.x - g.position.x;
      const dz = this.dock.z - g.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.08 || this.t > 50) {
        g.position.copy(this.dock);
        g.rotation.y = this.dockYaw;
        this.state = 'docked';
        this.stopSound();
        return;
      }
      if (!this.bumpT || this.bumpT <= 0) this.heading = Math.atan2(dx, dz);
    } else if (this.t > 150) {
      this.state = 'returning';
      this.t = 0;
    } else if (Math.random() < dt * 0.25) this.heading += (Math.random() - 0.5) * 1.2;
    if (this.bumpT > 0) this.bumpT -= dt;
    const nx = g.position.x + Math.sin(this.heading) * sp;
    const nz = g.position.z + Math.cos(this.heading) * sp;
    if (this.free(nx, nz)) {
      g.position.x = nx;
      g.position.z = nz;
    } else {
      this.heading += Math.PI / 2 + Math.random() * Math.PI;
      this.bumpT = 1.5;
      if (Math.random() < 0.4) this.app.audio.at(g, 'tick', { volume: 0.3 });
    }
    const target = this.heading;
    let diff = ((target - g.rotation.y + Math.PI) % TAU + TAU) % TAU - Math.PI;
    g.rotation.y += diff * Math.min(1, dt * 6);
  }
}

export class Cat {
  constructor(app) {
    this.app = app;
    const { M } = app;
    const fur = M.fur;
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);
    const S = (r, x, y, z, sx = 1, sy = 1, sz = 1, mat = fur) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      return m;
    };
    this.torso = S(0.1, 0, 0.19, 0, 0.85, 0.8, 1.6);
    body.add(this.torso);
    const white = M.white;
    body.add(S(0.07, 0, 0.16, 0.07, 0.9, 0.8, 1.2, white));
    // 머리
    this.head = new THREE.Group();
    this.head.position.set(0, 0.3, 0.17);
    body.add(this.head);
    this.head.add(S(0.075, 0, 0, 0, 1.1, 0.95, 1));
    this.head.add(S(0.035, 0, -0.02, 0.06, 1.2, 0.8, 0.8, white));
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 4), fur);
      ear.position.set(sx * 0.045, 0.07, -0.005);
      ear.rotation.z = -sx * 0.25;
      this.head.add(ear);
      this.head.add(S(0.012, sx * 0.03, 0.015, 0.066, 1, 1.2, 0.6, M.black));
    }
    this.head.add(S(0.009, 0, -0.005, 0.078, 1, 0.8, 0.8, M.pink));
    // 다리
    this.legs = [];
    for (const [x, z] of [[-0.05, 0.1], [0.05, 0.1], [-0.05, -0.1], [0.05, -0.1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.15, z);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.15, 8), fur);
      leg.position.y = -0.075;
      pivot.add(leg);
      pivot.add(S(0.02, 0, -0.145, 0.005, 1, 0.6, 1.3, white));
      body.add(pivot);
      this.legs.push(pivot);
    }
    // 꼬리
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.22, -0.15);
    body.add(this.tail);
    let parent = this.tail;
    this.tailSegs = [];
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group();
      seg.position.y = i === 0 ? 0 : 0.05;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.055, 6), fur);
      m.position.y = 0.025;
      seg.add(m);
      parent.add(seg);
      parent = seg;
      this.tailSegs.push(seg);
    }
    this.tail.rotation.x = -0.9;
    this.body = body;
    this.g = g;
    g.position.set(4.6, 0, 6.2);
    g.userData.inter = { label: '나비 쓰다듬기', action: () => this.pet() };
    app.petGroup.add(g);
    this.state = 'idle';
    this.t = 2;
    this.target = new THREE.Vector3();
    this.pets = 0;
    this.phase = 0;
    this.heart = makeHeart();
    this.heart.visible = false;
    app.scene.add(this.heart);
  }
  pet() {
    this.pets++;
    this.state = 'happy';
    this.t = 3.5;
    const p = this.app.viewerPos;
    this.faceYaw = Math.atan2(p.x - this.g.position.x, p.z - this.g.position.z);
    this.app.audio.at(this.g, this.pets % 3 === 0 ? 'meow' : 'purr', { volume: 0.7 });
    this.heart.visible = true;
    this.heartT = 0;
    if (this.pets === 1) this.app.toast('🐱 나비가 좋아해요. 골골골…');
  }
  pickTarget() {
    const rooms = ROOMS.filter((r) => !r.hidden && !['bath', 'mbath', 'balcony', 'utility'].includes(r.id));
    const near = roomAt(this.g.position.x, this.g.position.z);
    const r = Math.random() < 0.6 && near && rooms.includes(near) ? near : rooms[(Math.random() * rooms.length) | 0];
    for (let k = 0; k < 12; k++) {
      const x = r.rect[0] + 0.3 + Math.random() * (r.rect[2] - r.rect[0] - 0.6);
      const z = r.rect[1] + 0.3 + Math.random() * (r.rect[3] - r.rect[1] - 0.6);
      if (!this.app.collision.blocked(x, z, 0.16)) {
        this.target.set(x, 0, z);
        return true;
      }
    }
    return false;
  }
  update(dt, time) {
    const g = this.g;
    this.t -= dt;
    let moving = false;
    if (this.state === 'idle' || this.state === 'sleep') {
      if (this.t <= 0) {
        if (this.state === 'idle' && Math.random() < 0.25 && this.app.world.night > 0.5) {
          this.state = 'sleep';
          this.t = 20 + Math.random() * 20;
        } else if (this.pickTarget()) {
          this.state = 'walk';
          this.t = 14;
          this.stuck = 0;
        } else this.t = 2;
      }
    } else if (this.state === 'walk') {
      const dx = this.target.x - g.position.x;
      const dz = this.target.z - g.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.15 || this.t <= 0 || this.stuck > 1.5) {
        this.state = 'idle';
        this.t = 3 + Math.random() * 6;
      } else {
        let want = Math.atan2(dx, dz);
        const sp = 0.42 * dt;
        let ok = false;
        for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
          const a = want + off;
          const nx = g.position.x + Math.sin(a) * sp;
          const nz = g.position.z + Math.cos(a) * sp;
          if (roomAt(nx, nz) && !this.app.collision.blocked(nx, nz, 0.15, { skip: (k) => k === 'elevator' })) {
            g.position.x = nx;
            g.position.z = nz;
            want = a;
            ok = true;
            break;
          }
        }
        if (!ok) this.stuck += dt;
        else moving = true;
        this.turnTo(want, dt, 5);
      }
    } else if (this.state === 'happy') {
      this.turnTo(this.faceYaw, dt, 6);
      if (this.t <= 0) {
        this.state = 'idle';
        this.t = 2;
      }
    }
    // 동작
    this.phase += dt * (moving ? 9 : 0);
    const sitting = this.state === 'idle' || this.state === 'happy';
    this.legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(this.phase + (i % 2 === (i < 2 ? 0 : 1) ? 0 : Math.PI)) * 0.5 : 0));
    const sleep = this.state === 'sleep';
    this.body.rotation.x = sitting && !moving ? -0.35 : 0;
    this.body.position.y = sitting && !moving ? -0.02 : sleep ? -0.1 : Math.abs(Math.sin(this.phase)) * 0.01;
    this.body.position.z = sitting && !moving ? -0.06 : 0;
    this.torso.scale.y = sleep ? 0.6 : 0.8;
    this.head.position.y = sleep ? 0.18 : 0.3;
    this.head.rotation.y = this.state === 'idle' ? Math.sin(time * 0.6) * 0.4 : 0;
    this.head.rotation.x = this.state === 'happy' ? -0.25 : 0;
    const wag = this.state === 'happy' ? 3 : 1.2;
    this.tailSegs.forEach((s, i) => (s.rotation.z = Math.sin(time * wag + i * 0.6) * 0.25));
    // 하트
    if (this.heart.visible) {
      this.heartT += dt;
      this.heart.position.set(g.position.x, 0.5 + this.heartT * 0.25, g.position.z);
      this.heart.material.opacity = Math.max(0, 1 - this.heartT / 1.6);
      if (this.heartT > 1.6) this.heart.visible = false;
    }
    // 가끔 야옹
    if (Math.random() < dt * 0.01 && g.position.distanceTo(this.app.viewerPos) < 3) this.app.audio.at(g, 'meow', { volume: 0.5, rate: 1 + Math.random() * 0.2 });
  }
  turnTo(a, dt, rate) {
    const diff = ((a - this.g.rotation.y + Math.PI) % TAU + TAU) % TAU - Math.PI;
    this.g.rotation.y += diff * Math.min(1, dt * rate);
  }
}

function makeHeart() {
  const lc = liveCanvas(64, 64);
  lc.g.font = '48px serif';
  lc.g.textAlign = 'center';
  lc.g.fillStyle = '#ff5a7a';
  lc.g.fillText('♥', 32, 48);
  lc.tex.needsUpdate = true;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: lc.tex, transparent: true, depthWrite: false }));
  s.scale.set(0.14, 0.14, 1);
  s.raycast = noRaycast;
  return s;
}
