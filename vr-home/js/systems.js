// 충돌 · 조명 풀 · 상호작용 · 토글 애니메이션
import * as THREE from 'three';
import { clamp, smooth } from './util.js';

// ── 2D 충돌 (위에서 본 사각형들) ──
export class CollisionWorld {
  constructor() {
    this.groups = new Map(); // key -> { boxes, active() }
  }
  set(key, boxes, active = null) {
    this.groups.set(key, { boxes, active });
  }
  remove(key) {
    this.groups.delete(key);
  }
  *all(opts) {
    for (const [key, g] of this.groups) {
      if (opts && opts.skip && opts.skip(key)) continue;
      if (g.active && !g.active()) continue;
      for (const b of g.boxes) yield b;
    }
  }
  // 원(플레이어)을 사각형 밖으로 밀어냄
  resolve(p, r, opts) {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of this.all(opts)) {
        const cx = clamp(p.x, b.x0, b.x1);
        const cz = clamp(p.z, b.z0, b.z1);
        const dx = p.x - cx;
        const dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = moved = true;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          p.x += (dx / d) * (r - d);
          p.z += (dz / d) * (r - d);
        } else {
          const l = p.x - b.x0;
          const rr = b.x1 - p.x;
          const t = p.z - b.z0;
          const bt = b.z1 - p.z;
          const m = Math.min(l, rr, t, bt);
          if (m === l) p.x = b.x0 - r;
          else if (m === rr) p.x = b.x1 + r;
          else if (m === t) p.z = b.z0 - r;
          else p.z = b.z1 + r;
        }
      }
      if (!moved) break;
    }
    return hit;
  }
  blocked(x, z, r, opts) {
    for (const b of this.all(opts)) {
      const cx = clamp(x, b.x0, b.x1);
      const cz = clamp(z, b.z0, b.z1);
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
    }
    return false;
  }
}

// 회전된 사각형 발자국 → 축 정렬 상자
export function footprintBox(x, z, w, d, rotRad, pad = 0) {
  const c = Math.abs(Math.cos(rotRad));
  const s = Math.abs(Math.sin(rotRad));
  const hw = (w * c + d * s) / 2 + pad;
  const hd = (w * s + d * c) / 2 + pad;
  return { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd };
}

// ── 조명: 켜진 광원 중 가까운 것만 실제 PointLight에 배정 (VR에서도 가볍게) ──
export class LightSystem {
  constructor(scene, count) {
    this.scene = scene;
    this.sources = [];
    this.pool = [];
    this.timer = 0;
    this.setCount(count);
    this.daylight = 0;
    this._v = new THREE.Vector3();
  }
  setCount(n) {
    for (const p of this.pool) this.scene.remove(p.light);
    this.pool = [];
    for (let i = 0; i < n; i++) {
      const light = new THREE.PointLight('#ffffff', 0, 9, 2);
      this.scene.add(light);
      this.pool.push({ light, src: null, cur: 0 });
    }
    this.timer = 0;
  }
  add(src) {
    // src: { anchor(Object3D) | pos(Vector3), color, intensity, distance, on, kind, room, alive() }
    src.on = !!src.on;
    src.factor = src.factor ?? 1;
    src.color = new THREE.Color(src.color || '#fff1dc');
    src.distance = src.distance || 8;
    src.world = new THREE.Vector3();
    this.sources.push(src);
    return src;
  }
  remove(src) {
    const i = this.sources.indexOf(src);
    if (i >= 0) this.sources.splice(i, 1);
  }
  strength(s) {
    if (!s.on || (s.alive && !s.alive())) return 0;
    return s.intensity * s.factor;
  }
  update(dt, viewer) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.25;
      const ranked = [];
      for (const s of this.sources) {
        const k = this.strength(s);
        if (k <= 0.01) continue;
        if (s.anchor) s.anchor.getWorldPosition(s.world);
        else s.world.copy(s.pos);
        const d2 = s.world.distanceToSquared(viewer);
        ranked.push({ s, score: k / (1 + d2 * 0.6) });
      }
      ranked.sort((a, b) => b.score - a.score);
      const chosen = ranked.slice(0, this.pool.length).map((r) => r.s);
      // 이미 배정된 건 유지, 빈 자리에 새 광원
      const free = [];
      for (const p of this.pool) {
        if (p.src && chosen.includes(p.src)) chosen.splice(chosen.indexOf(p.src), 1);
        else free.push(p);
      }
      for (const p of free) {
        const s = chosen.shift() || null;
        if (s !== p.src) {
          p.src = s;
          p.cur = 0;
          if (s) {
            p.light.position.copy(s.world);
            p.light.color.copy(s.color);
            p.light.distance = s.distance;
          }
        }
      }
    }
    for (const p of this.pool) {
      const target = p.src ? this.strength(p.src) : 0;
      p.cur += (target - p.cur) * Math.min(1, dt * 8);
      if (p.src) {
        if (p.src.anchor) p.src.anchor.getWorldPosition(p.light.position);
        p.light.color.copy(p.src.color);
      }
      p.light.intensity = Math.max(0, p.cur);
    }
  }
}

// ── 부드러운 켜기/끄기 애니메이션 ──
export class Toggles {
  constructor() {
    this.list = [];
  }
  make(apply, { speed = 2, on = false, alive } = {}) {
    const t = {
      v: on ? 1 : 0,
      target: on ? 1 : 0,
      speed,
      apply,
      alive,
      get on() {
        return this.target > 0.5;
      },
      set(v) {
        this.target = v ? 1 : 0;
      },
      flip() {
        this.target = this.target > 0.5 ? 0 : 1;
        return this.on;
      },
    };
    apply(smooth(t.v), t);
    this.list.push(t);
    return t;
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i];
      if (t.alive && !t.alive()) {
        this.list.splice(i, 1);
        continue;
      }
      if (t.v === t.target) continue;
      const step = dt * t.speed;
      t.v = t.v < t.target ? Math.min(t.target, t.v + step) : Math.max(t.target, t.v - step);
      t.apply(smooth(t.v), t);
    }
  }
}

// ── 상호작용: 오브젝트에 {label, action} 붙이고 광선으로 찾기 ──
export const noRaycast = () => {};

export function findInter(obj) {
  while (obj) {
    if (obj.userData.inter) return { obj, spec: obj.userData.inter };
    if (obj.userData.furnRoot) return null;
    obj = obj.parent;
  }
  return null;
}

export function findFurn(obj) {
  while (obj) {
    if (obj.userData.furn) return obj;
    obj = obj.parent;
  }
  return null;
}

export function labelOf(spec) {
  return typeof spec.label === 'function' ? spec.label() : spec.label;
}
