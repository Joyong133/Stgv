// 집을 수 있는 물건 (사과, 컵, 쿠션 …) + 간단한 물리 (던지기 · 떨어지기)
import * as THREE from 'three';
import { noRaycast } from './systems.js';

function mk(M, kind) {
  const g = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.scale.set(sx, sy, sz);
    g.add(m);
    return m;
  };
  const S = (r, seg = 14) => new THREE.SphereGeometry(r, seg, Math.max(6, (seg * 0.7) | 0));
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const C = (rt, rb, h, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);
  switch (kind) {
    case 'apple':
      add(S(0.04), M.red, 0, 0, 0, 0, 0, 0, 1, 0.9, 1);
      add(C(0.003, 0.003, 0.025, 5), M.brown, 0, 0.04, 0);
      return { g, hh: 0.036, r: 0.04, name: '사과' };
    case 'orange':
      add(S(0.042), M.orange);
      return { g, hh: 0.042, r: 0.042, name: '귤' };
    case 'mug':
      add(C(0.04, 0.036, 0.095, 18), M.ceramic);
      add(new THREE.TorusGeometry(0.025, 0.007, 6, 14), M.ceramic, 0.045, 0.0, 0, 0, 0, 0);
      add(new THREE.CircleGeometry(0.035, 16), M.brown, 0, 0.04, 0, -Math.PI / 2);
      return { g, hh: 0.0475, r: 0.05, name: '머그컵', use: 'drink' };
    case 'book':
    case 'book2':
      add(B(0.16, 0.035, 0.23), kind === 'book' ? M.red : M.navy);
      add(B(0.15, 0.03, 0.225), M.paper, 0.006, 0, 0);
      return { g, hh: 0.0175, r: 0.11, name: '책', use: 'read' };
    case 'pillow':
      add(B(0.55, 0.12, 0.36), M.bedding, 0, 0, 0, 0, 0, 0, 1, 1, 1);
      return { g, hh: 0.06, r: 0.25, name: '베개' };
    case 'cushion':
    case 'cushion2':
      add(B(0.4, 0.4, 0.13), kind === 'cushion' ? M.cushion : M.cushion2, 0, 0, 0, -0.25, 0, 0);
      return { g, hh: 0.17, r: 0.2, name: '쿠션' };
    case 'duck':
      add(S(0.05), M.yellow, 0, 0, 0, 0, 0, 0, 1.2, 0.85, 1);
      add(S(0.032), M.yellow, 0.035, 0.05, 0);
      add(new THREE.ConeGeometry(0.012, 0.03, 8), M.orange, 0.07, 0.05, 0, 0, 0, -Math.PI / 2);
      return { g, hh: 0.043, r: 0.06, name: '고무 오리', use: 'squeak' };
    case 'remote':
      add(B(0.05, 0.02, 0.18), M.black);
      add(B(0.012, 0.004, 0.012), M.ledRed, 0, 0.012, -0.06);
      return { g, hh: 0.01, r: 0.09, name: 'TV 리모컨', use: 'tv' };
    case 'kettle':
      add(C(0.07, 0.085, 0.18, 18), M.steel);
      add(C(0.04, 0.06, 0.03, 14), M.black, 0, 0.1, 0);
      add(B(0.02, 0.12, 0.03), M.black, -0.09, 0.03, 0);
      add(C(0.012, 0.02, 0.09, 8), M.steel, 0.09, 0.03, 0, 0, 0, -0.9);
      return { g, hh: 0.09, r: 0.1, name: '전기 주전자' };
    case 'bottle':
      add(C(0.03, 0.03, 0.2, 12), M.green);
      add(C(0.012, 0.025, 0.06, 10), M.green, 0, 0.13, 0);
      return { g, hh: 0.1, r: 0.04, name: '음료수' };
    case 'milk':
      add(B(0.07, 0.17, 0.07), M.paper);
      add(B(0.072, 0.05, 0.072), M.blue, 0, 0.03, 0);
      return { g, hh: 0.085, r: 0.05, name: '우유' };
    case 'teddy':
      add(S(0.08), M.fur, 0, 0, 0, 0, 0, 0, 1, 1.1, 0.85);
      add(S(0.06), M.fur, 0, 0.12, 0);
      add(S(0.022), M.fur, 0.045, 0.17, 0);
      add(S(0.022), M.fur, -0.045, 0.17, 0);
      add(S(0.025), M.fur, 0, 0.11, 0.05, 0, 0, 0, 1, 0.8, 0.8);
      add(S(0.008), M.black, 0.022, 0.135, 0.05);
      add(S(0.008), M.black, -0.022, 0.135, 0.05);
      add(S(0.03), M.fur, 0.07, -0.05, 0.03);
      add(S(0.03), M.fur, -0.07, -0.05, 0.03);
      return { g, hh: 0.085, r: 0.12, name: '곰 인형', use: 'squeak' };
    case 'ball':
      add(S(0.07, 16), M.blue);
      add(new THREE.TorusGeometry(0.07, 0.006, 6, 24), M.yellow, 0, 0, 0, Math.PI / 2);
      return { g, hh: 0.07, r: 0.07, name: '공', bouncy: true };
    case 'soap':
      add(B(0.08, 0.03, 0.05), M.pink);
      return { g, hh: 0.015, r: 0.05, name: '비누' };
    case 'keys':
      add(new THREE.TorusGeometry(0.018, 0.003, 6, 14), M.chrome, 0, 0, 0, Math.PI / 2);
      add(B(0.05, 0.004, 0.018), M.chrome, 0.035, 0, 0);
      add(B(0.025, 0.012, 0.035), M.charcoal, -0.035, 0, 0);
      return { g, hh: 0.006, r: 0.05, name: '열쇠 꾸러미' };
    case 'perfume':
      add(B(0.05, 0.07, 0.03), M.glass);
      add(C(0.012, 0.012, 0.025, 10), M.chrome, 0, 0.045, 0);
      return { g, hh: 0.035, r: 0.04, name: '향수' };
    default:
      add(B(0.08, 0.08, 0.08), M.gray);
      return { g, hh: 0.04, r: 0.05, name: '물건' };
  }
}

export class Grabbables {
  constructor(app) {
    this.app = app;
    this.items = [];
    this.group = new THREE.Group();
    this.group.name = 'grabbables';
    app.scene.add(this.group);
    this.ray = new THREE.Raycaster();
    this._v = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this.held = new Map(); // holder -> item
  }
  spawn(kind, pos, rotY = 0) {
    const { g, hh, r, name, use, bouncy } = mk(this.app.M, kind);
    g.position.copy(pos);
    g.position.y += hh;
    g.rotation.y = rotY;
    this.group.add(g);
    const item = { kind, obj: g, hh, r, name, use, bouncy, vel: new THREE.Vector3(), spin: new THREE.Vector3(), resting: true, holder: null, home: g.position.clone(), homeRot: rotY };
    g.userData.grab = item;
    g.userData.inter = {
      kind: 'grab',
      label: () => `${name} 집기`,
      action: (hit, source) => this.pickUp(item, source || 'desktop'),
    };
    this.items.push(item);
    return item;
  }
  heldBy(holder) {
    return this.held.get(holder) || null;
  }
  pickUp(item, holder) {
    if (item.holder) this.release(item, new THREE.Vector3());
    const prev = this.held.get(holder);
    if (prev) this.release(prev, new THREE.Vector3());
    item.holder = holder;
    item.resting = false;
    item.vel.set(0, 0, 0);
    this.held.set(holder, item);
    if (holder !== 'desktop') {
      holder.attach(item.obj);
      // 멀리서 잡았으면 손으로 끌어오기
      const d = item.obj.position.length();
      if (d > 0.25) item.pull = 1;
    }
    this.app.audio.at(item.obj, 'pop', { volume: 0.3 });
    this.app.events.emit('grab', item);
  }
  release(item, vel) {
    if (!item.holder) return;
    const holder = item.holder;
    this.held.delete(holder);
    item.holder = null;
    item.pull = 0;
    this.group.attach(item.obj);
    item.vel.copy(vel);
    item.spin.set((Math.random() - 0.5) * vel.length() * 2, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * vel.length() * 2);
    item.resting = false;
  }
  use(item) {
    const app = this.app;
    if (item.use === 'tv' && app.tv) app.tv.press();
    else if (item.use === 'squeak') app.audio.at(item.obj, 'squeak', { volume: 0.6 });
    else if (item.use === 'drink') {
      app.audio.at(item.obj, 'splash', { volume: 0.25, rate: 1.6 });
      app.toast('☕ 후루룩… 따뜻한 차 한 잔');
    } else if (item.use === 'read') app.toast('📖 재미있는 책이네요');
    else app.toast(`${item.name}을(를) 들고 있어요`);
  }
  wakeAll() {
    for (const it of this.items) if (!it.holder) it.resting = false;
  }
  resetAll() {
    for (const it of this.items) {
      if (it.holder) this.release(it, new THREE.Vector3());
      it.obj.position.copy(it.home);
      it.obj.rotation.set(0, it.homeRot, 0);
      it.vel.set(0, 0, 0);
      it.resting = true;
    }
  }
  update(dt, desktopHold) {
    const app = this.app;
    const solids = app.solidRoots;
    for (const it of this.items) {
      if (it.holder) {
        if (it.holder === 'desktop' && desktopHold) {
          it.obj.position.lerp(desktopHold.pos, Math.min(1, dt * 18));
          it.obj.rotation.set(0, desktopHold.yaw, 0);
        } else if (it.pull > 0) {
          it.obj.position.multiplyScalar(Math.max(0, 1 - dt * 10));
          if (it.obj.position.length() < 0.03) it.pull = 0;
        }
        continue;
      }
      if (it.resting) continue;
      const p = it.obj.position;
      it.vel.y -= 9.8 * dt;
      const step = this._v.copy(it.vel).multiplyScalar(dt);
      const len = step.length();
      if (len > 1e-6) {
        this.ray.set(p, step.clone().normalize());
        this.ray.far = len + it.r * 0.8;
        const hits = this.ray.intersectObjects(solids, true);
        const hit = hits.find((h) => !isPart(h.object, it.obj) && h.object.visible !== false);
        if (hit && hit.face) {
          const n = this._n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
          if (n.y > 0.6) {
            p.copy(hit.point);
            p.y += it.hh;
            const impact = -it.vel.y;
            if (impact > 1.5) app.audio.at(it.obj, 'thud', { volume: Math.min(0.8, impact * 0.12) });
            it.vel.y = impact > (it.bouncy ? 0.6 : 1.6) ? impact * (it.bouncy ? 0.65 : 0.25) : 0;
            it.vel.x *= 0.7;
            it.vel.z *= 0.7;
            it.spin.multiplyScalar(0.5);
          } else {
            const along = it.vel.dot(n);
            it.vel.addScaledVector(n, -2 * along).multiplyScalar(it.bouncy ? 0.7 : 0.35);
            p.copy(hit.point).addScaledVector(n, it.r);
            if (Math.abs(along) > 1.5) app.audio.at(it.obj, 'thud', { volume: 0.4 });
          }
        } else p.add(step);
      }
      it.obj.rotation.x += it.spin.x * dt;
      it.obj.rotation.y += it.spin.y * dt;
      it.obj.rotation.z += it.spin.z * dt;
      // 멈춤 판정
      if (it.vel.lengthSq() < 0.004) {
        this.ray.set(p, new THREE.Vector3(0, -1, 0));
        this.ray.far = it.hh + 0.03;
        const below = this.ray.intersectObjects(solids, true).find((h) => !isPart(h.object, it.obj));
        if (below) {
          it.resting = true;
          it.vel.set(0, 0, 0);
          p.y = below.point.y + it.hh;
          // 바로 세우기
          it.obj.rotation.x = 0;
          it.obj.rotation.z = 0;
        }
      }
      if (p.y < -3) {
        p.copy(it.home);
        it.vel.set(0, 0, 0);
        it.resting = true;
      }
    }
  }
}

function isPart(obj, root) {
  while (obj) {
    if (obj === root) return true;
    if (obj.userData && obj.userData.grab) return true;
    obj = obj.parent;
  }
  return false;
}
export { noRaycast };
