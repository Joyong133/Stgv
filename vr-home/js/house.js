// 집 뼈대: 벽 · 바닥 · 천장 · 문 · 창문 · 스위치 · 천장 조명
import * as THREE from 'three';
import { CEILING as H, DOOR_H, ROOMS, WALLS, SWITCHES, DAYLIGHT } from './layout.js';
import { roomMaterials } from './materials.js';
import { noRaycast } from './systems.js';
import { pointInRect, FONT_TITLE } from './util.js';

// 같은 재질끼리 면을 모아 메시 하나로 (그리기 호출 수 줄이기)
export class FaceBucket {
  constructor() {
    this.b = new Map();
  }
  quad(key, p, n, uv, shade = 1) {
    let e = this.b.get(key);
    if (!e) this.b.set(key, (e = { pos: [], nor: [], uv: [], col: [] }));
    const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
    const bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    let order = [0, 1, 2, 0, 2, 3];
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) order = [0, 2, 1, 0, 3, 2];
    for (const i of order) {
      e.pos.push(p[i][0], p[i][1], p[i][2]);
      e.nor.push(n[0], n[1], n[2]);
      e.uv.push(uv[i][0], uv[i][1]);
      e.col.push(shade, shade, shade);
    }
  }
  box(x0, y0, z0, x1, y1, z1, keyFn, uvs = [1, 1], shadeFn = null) {
    const su = uvs[0], sv = uvs[1];
    const faces = [
      ['+x', [1, 0, 0], [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], (p) => [p[2] / su, p[1] / sv]],
      ['-x', [-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], (p) => [p[2] / su, p[1] / sv]],
      ['+z', [0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], (p) => [p[0] / su, p[1] / sv]],
      ['-z', [0, 0, -1], [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], (p) => [p[0] / su, p[1] / sv]],
      ['+y', [0, 1, 0], [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], (p) => [p[0] / su, p[2] / sv]],
      ['-y', [0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], (p) => [p[0] / su, p[2] / sv]],
    ];
    for (const [dir, n, pts, uvf] of faces) {
      const key = keyFn(dir);
      if (!key) continue;
      this.quad(key, pts, n, pts.map(uvf), shadeFn ? shadeFn(dir) : 1);
    }
  }
  meshes(materialFor, { vertexColors = false } = {}) {
    const out = [];
    for (const [key, e] of this.b) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(e.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(e.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(e.uv, 2));
      if (vertexColors) geo.setAttribute('color', new THREE.Float32BufferAttribute(e.col, 3));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, materialFor(key));
      mesh.userData.key = key;
      out.push(mesh);
    }
    return out;
  }
}

export function roomAt(x, z, includeHidden = true) {
  for (const r of ROOMS) {
    if (!includeHidden && r.hidden) continue;
    if (pointInRect(x, z, r.rect)) return r;
  }
  return null;
}

function addBox(g, mat, x0, y0, z0, x1, y1, z1) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  g.add(m);
  return m;
}

// 벽 좌표계: 벽을 따라 s, 벽에 수직 d
const P = (w, s, y, d) => (w.axis === 'x' ? new THREE.Vector3(s, y, w.at + d) : new THREE.Vector3(w.at + d, y, s));

function openingFrame(w, o) {
  const g = new THREE.Group();
  const c = (o.from + o.to) / 2;
  g.position.copy(P(w, c, 0, 0));
  g.rotation.y = w.axis === 'x' ? 0 : -Math.PI / 2;
  // 지역 +z가 세계에서 어느 쪽인지: x벽은 +z, z벽은 -x
  g.userData.localSwing = (s) => (w.axis === 'x' ? s : -s);
  return g;
}

export function buildHouse(app) {
  const { M, scene } = app;
  const house = new THREE.Group();
  house.name = 'house';
  scene.add(house);
  const bucket = new FaceBucket();
  const roomMats = {};
  for (const r of ROOMS) roomMats[r.id] = roomMaterials(r);
  app.roomMats = roomMats;

  const wallBoxes = [];
  const sideKey = (x, z) => {
    const r = roomAt(x, z);
    return r ? 'wall:' + r.id : 'exterior';
  };

  // ── 벽 ──
  for (const w of WALLS) {
    const half = w.t / 2;
    const breaks = new Set([w.from, w.to]);
    for (const o of w.openings) {
      breaks.add(o.from);
      breaks.add(o.to);
    }
    for (const r of ROOMS) {
      const e = w.axis === 'x' ? [r.rect[0], r.rect[2]] : [r.rect[1], r.rect[3]];
      for (const v of e) if (v > w.from && v < w.to) breaks.add(v);
    }
    const xs = [...breaks].sort((a, b) => a - b);
    const intervals = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const s0 = xs[i];
      const s1 = xs[i + 1];
      if (s1 - s0 < 1e-4) continue;
      const mid = (s0 + s1) / 2;
      const op = w.openings.find((o) => mid > o.from && mid < o.to);
      const parts = [];
      if (!op) parts.push([0, H]);
      else {
        if (op.type === 'window' && op.sill > 0) parts.push([0, op.sill]);
        const head = op.head ?? DOOR_H;
        if (head < H) parts.push([head, H]);
      }
      intervals.push({ s0, s1, mid, op, parts });
    }
    intervals.forEach((iv, i) => {
      const prev = intervals[i - 1];
      const next = intervals[i + 1];
      const solid = !iv.op;
      const nA = sideKey(...(w.axis === 'x' ? [iv.mid, w.at + half + 0.04] : [w.at + half + 0.04, iv.mid]));
      const nB = sideKey(...(w.axis === 'x' ? [iv.mid, w.at - half - 0.04] : [w.at - half - 0.04, iv.mid]));
      for (const [y0, y1] of iv.parts) {
        const startFace = !prev || (solid && prev.op);
        const endFace = !next || (solid && next.op);
        const keyFn = (dir) => {
          if (w.axis === 'x') {
            if (dir === '+z') return nA;
            if (dir === '-z') return nB;
            if (dir === '-x') return startFace ? (prev ? 'trim' : nA) : null;
            if (dir === '+x') return endFace ? (next ? 'trim' : nA) : null;
          } else {
            if (dir === '+x') return nA;
            if (dir === '-x') return nB;
            if (dir === '-z') return startFace ? (prev ? 'trim' : nA) : null;
            if (dir === '+z') return endFace ? (next ? 'trim' : nA) : null;
          }
          if (dir === '+y') return y1 < H - 1e-3 ? 'sill' : null;
          if (dir === '-y') return y0 > 1e-3 ? 'trim' : null;
          return null;
        };
        if (w.axis === 'x') bucket.box(iv.s0, y0, w.at - half, iv.s1, y1, w.at + half, keyFn);
        else bucket.box(w.at - half, y0, iv.s0, w.at + half, y1, iv.s1, keyFn);
        // 충돌 상자 (허리 아래까지 막는 부분)
        if (y0 < 1.0) {
          wallBoxes.push(
            w.axis === 'x'
              ? { x0: iv.s0, x1: iv.s1, z0: w.at - half, z1: w.at + half }
              : { x0: w.at - half, x1: w.at + half, z0: iv.s0, z1: iv.s1 }
          );
        }
        // 걸레받이
        if (y0 === 0) {
          for (const [side, key] of [[1, nA], [-1, nB]]) {
            if (key === 'exterior') continue;
            const rid = key.slice(5);
            const room = ROOMS.find((r) => r.id === rid);
            if (!room || room.wallTex === 'tile' || room.id === 'balcony') continue;
            const d0 = side * half;
            const d1 = side * (half + 0.012);
            if (w.axis === 'x')
              bucket.box(iv.s0, 0, Math.min(w.at + d0, w.at + d1), iv.s1, 0.075, Math.max(w.at + d0, w.at + d1), (dir) => (dir === '-y' ? null : 'baseboard'));
            else
              bucket.box(Math.min(w.at + d0, w.at + d1), 0, iv.s0, Math.max(w.at + d0, w.at + d1), 0.075, iv.s1, (dir) => (dir === '-y' ? null : 'baseboard'));
          }
        }
      }
    });
  }
  app.collision.set('walls', wallBoxes);

  // ── 바닥 · 천장 ──
  for (const r of ROOMS) {
    const [x0, z0, x1, z1] = r.rect;
    bucket.quad('floor:' + r.id, [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], [0, 1, 0], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
    bucket.quad('ceiling', [[x0, H, z0], [x1, H, z0], [x1, H, z1], [x0, H, z1]], [0, -1, 0], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
  }

  const matFor = (key) => {
    if (key.startsWith('wall:')) return roomMats[key.slice(5)].wall;
    if (key.startsWith('floor:')) return roomMats[key.slice(6)].floor;
    return { ceiling: M.ceiling, trim: M.trim, sill: M.sill, baseboard: M.trim, exterior: M.exterior }[key] || M.white;
  };
  app.floorMeshes = [];
  app.shellMeshes = [];
  for (const mesh of bucket.meshes(matFor)) {
    house.add(mesh);
    app.shellMeshes.push(mesh);
    if (mesh.userData.key.startsWith('floor:')) {
      app.floorMeshes.push(mesh);
      mesh.userData.room = mesh.userData.key.slice(6);
    }
    if (mesh.userData.key === 'ceiling') app.ceilingMeshes.push(mesh);
  }

  // ── 문 · 창문 ──
  for (const w of WALLS) for (const o of w.openings) buildOpening(app, house, w, o);

  // ── 천장 조명 + 스위치 ──
  app.roomLights = {};
  for (const r of ROOMS) buildRoomLight(app, house, r);
  for (const s of SWITCHES) buildSwitch(app, house, s);

  // ── 낮 햇빛 (창가) ──
  app.daySources = DAYLIGHT.map((d) =>
    app.lights.add({ pos: new THREE.Vector3(d.x, 1.7, d.z), color: '#dfe9ff', intensity: 0, base: d.s, distance: 9, on: true, kind: 'day', shade: 1 })
  );

  // ── 방 이름표 ──
  app.roomLabels = new THREE.Group();
  for (const r of ROOMS) {
    if (r.hidden) continue;
    const s = makeLabelSprite(r.name);
    s.position.set((r.rect[0] + r.rect[2]) / 2, 2.05, (r.rect[1] + r.rect[3]) / 2);
    app.roomLabels.add(s);
  }
  app.roomLabels.visible = false;
  house.add(app.roomLabels);
  return house;
}

export function makeLabelSprite(text, { size = 0.32, color = '#1b2530', bg = 'rgba(255,255,255,0.86)' } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = `56px ${FONT_TITLE}`;
  g.font = font;
  const tw = Math.ceil(g.measureText(text).width) + 56;
  c.width = tw;
  c.height = 88;
  g.font = font;
  g.fillStyle = bg;
  const r = 30;
  g.beginPath();
  g.roundRect ? g.roundRect(0, 0, tw, 88, r) : g.rect(0, 0, tw, 88);
  g.fill();
  g.fillStyle = color;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(text, tw / 2, 47);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set((size * tw) / 88, size, 1);
  sp.renderOrder = 10;
  sp.raycast = noRaycast;
  return sp;
}

// ── 개구부 ──
function buildOpening(app, house, w, o) {
  const { M } = app;
  const width = o.to - o.from;
  const g = openingFrame(w, o);
  house.add(g);
  const T = w.t + 0.02;
  if (o.type === 'void') return;

  if (o.type === 'window') {
    const fm = o.mullions ? M.aluminum : M.trim;
    const fw = 0.05;
    const y0 = o.sill;
    const y1 = o.head;
    addBox(g, fm, -width / 2, y0, -0.05, width / 2, y0 + fw, 0.05);
    addBox(g, fm, -width / 2, y1 - fw, -0.05, width / 2, y1, 0.05);
    addBox(g, fm, -width / 2, y0, -0.05, -width / 2 + fw, y1, 0.05);
    addBox(g, fm, width / 2 - fw, y0, -0.05, width / 2, y1, 0.05);
    const n = o.mullions || 2;
    for (let i = 1; i < n; i++) {
      const x = -width / 2 + (width * i) / n;
      addBox(g, fm, x - 0.025, y0, -0.04, x + 0.025, y1, 0.04);
    }
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(width - fw * 2, y1 - y0 - fw * 2), o.frosted ? M.frosted : M.glass);
    glass.position.set(0, (y0 + y1) / 2, 0);
    glass.userData.glass = true;
    g.add(glass);
    return;
  }

  const head = o.head ?? DOOR_H;
  // 문틀
  const jamb = o.style === 'balcony' ? M.aluminum : M.trim;
  addBox(g, jamb, -width / 2 - 0.045, 0, -T / 2, -width / 2 + 0.03, head + 0.045, T / 2);
  addBox(g, jamb, width / 2 - 0.03, 0, -T / 2, width / 2 + 0.045, head + 0.045, T / 2);
  addBox(g, jamb, -width / 2 - 0.045, head - 0.03, -T / 2, width / 2 + 0.045, head + 0.045, T / 2);
  if (o.type === 'open') return;

  if (o.type === 'door') buildHingedDoor(app, g, w, o, width, head);
  else if (o.type === 'slide') buildSlideDoor(app, g, w, o, width, head);
}

function buildHingedDoor(app, g, w, o, width, head) {
  const { M } = app;
  const front = o.style === 'front';
  const swingL = g.userData.localSwing(o.swing);
  const dir = o.hinge === 'start' ? 1 : -1;
  const Lw = width - 0.064;
  const Lh = head - 0.035;
  const th = front ? 0.06 : 0.04;
  const pivot = new THREE.Group();
  pivot.position.set(o.hinge === 'start' ? -width / 2 + 0.032 : width / 2 - 0.032, 0, swingL * (w.t / 2 - th / 2 - 0.005));
  g.add(pivot);
  const leafMat = front ? M.doorDark : o.style === 'bath' ? M.offwhite : M.door;
  const x0 = Math.min(0, dir * Lw);
  const x1 = Math.max(0, dir * Lw);
  addBox(pivot, leafMat, x0, 0.01, -th / 2, x1, Lh, th / 2);
  if (!front) {
    // 문짝 몰딩 두 줄
    for (const s of [1, -1]) {
      addBox(pivot, M.trim, x0 + 0.12, 0.25, s * th / 2 - 0.003, x1 - 0.12, 0.27, s * th / 2 + 0.003);
      addBox(pivot, M.trim, x0 + 0.12, Lh - 0.27, s * th / 2 - 0.003, x1 - 0.12, Lh - 0.25, s * th / 2 + 0.003);
    }
  }
  // 손잡이
  const hx = dir * (Lw - 0.07);
  for (const s of [1, -1]) {
    const z = s * (th / 2 + 0.012);
    const ros = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 16), M.chrome);
    ros.rotation.x = Math.PI / 2;
    ros.position.set(hx, 1.0, z - s * 0.004);
    pivot.add(ros);
    if (front) {
      addBox(pivot, M.chrome, hx - 0.012, 0.85, z + s * 0.02 - 0.01, hx + 0.012, 1.25, z + s * 0.02 + 0.01);
    } else {
      addBox(pivot, M.chrome, Math.min(hx, hx - dir * 0.12), 0.99, z + s * 0.012 - 0.008, Math.max(hx, hx - dir * 0.12), 1.01, z + s * 0.012 + 0.008);
    }
  }
  if (front) {
    // 도어락 (안쪽)
    const s = -swingL;
    addBox(pivot, M.black, hx - 0.035, 1.12, s * (th / 2) - 0.0, hx + 0.035, 1.3, s * (th / 2 + 0.03));
    const led = addBox(pivot, M.led, hx - 0.012, 1.26, s * (th / 2 + 0.031), hx + 0.012, 1.27, s * (th / 2 + 0.033));
    led.raycast = noRaycast;
  }

  const openAngle = -swingL * dir * (Math.PI / 2) * 0.93;
  const tog = app.toggles.make((v) => (pivot.rotation.y = openAngle * v), { speed: 1.3 });
  const label = front ? '현관문' : '문';
  pivot.userData.inter = {
    label: () => (tog.on ? `${label} 닫기` : `${label} 열기`),
    action: () => {
      const on = tog.flip();
      if (front) app.audio.at(pivot, on ? 'doorlock' : 'lockClose', { volume: 0.7 });
      app.audio.at(pivot, on ? 'doorOpen' : 'doorClose', { volume: 0.8 });
      app.events.emit('door', { id: o.id, open: on });
    },
  };
  app.doors[o.id] = tog;
  const half = w.t / 2;
  const box = w.axis === 'x' ? { x0: o.from, x1: o.to, z0: w.at - half, z1: w.at + half } : { x0: w.at - half, x1: w.at + half, z0: o.from, z1: o.to };
  app.collision.set('door:' + o.id, [box], () => tog.v < 0.4);
}

function buildSlideDoor(app, g, w, o, width, head) {
  const { M } = app;
  const balcony = o.style === 'balcony';
  const pw = width / 2 + 0.03;
  const frame = balcony ? M.aluminum : M.charcoal;
  const fw = balcony ? 0.05 : 0.035;
  const ph = head - 0.03;
  const panel = (z) => {
    const p = new THREE.Group();
    p.position.z = z;
    addBox(p, frame, -pw / 2, 0.01, -0.02, pw / 2, 0.01 + fw * 1.6, 0.02);
    addBox(p, frame, -pw / 2, ph - fw, -0.02, pw / 2, ph, 0.02);
    addBox(p, frame, -pw / 2, 0.01, -0.02, -pw / 2 + fw, ph, 0.02);
    addBox(p, frame, pw / 2 - fw, 0.01, -0.02, pw / 2, ph, 0.02);
    if (!balcony) for (const y of [0.7, 1.4]) addBox(p, frame, -pw / 2, y, -0.012, pw / 2, y + 0.02, 0.012);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(pw - fw * 2, ph - fw * 2.6), M.glass);
    glass.position.y = (ph + fw * 0.6) / 2 + 0.01;
    p.add(glass);
    g.add(p);
    return p;
  };
  // 레일
  addBox(g, M.aluminum, -width / 2, 0, -0.06, width / 2, 0.012, 0.06);
  const a = panel(-0.03);
  a.position.x = -width / 2 + pw / 2;
  const b = panel(0.03);
  const closedX = width / 2 - pw / 2;
  const openX = -width / 2 + pw / 2 + 0.06;
  const tog = app.toggles.make((v) => (b.position.x = closedX + (openX - closedX) * v), { speed: 1.2 });
  // 손잡이
  addBox(b, M.charcoal, -pw / 2 + 0.06, 0.9, 0.02, -pw / 2 + 0.08, 1.2, 0.04);
  const name = balcony ? '발코니 문' : '중문';
  const spec = {
    label: () => (tog.on ? `${name} 닫기` : `${name} 열기`),
    action: () => {
      tog.flip();
      app.audio.at(b, 'slide', { volume: 0.7 });
    },
  };
  a.userData.inter = spec;
  b.userData.inter = spec;
  app.doors[o.id] = tog;
  const half = w.t / 2;
  const span = (s0, s1) => (w.axis === 'x' ? { x0: s0, x1: s1, z0: w.at - half, z1: w.at + half } : { x0: w.at - half, x1: w.at + half, z0: s0, z1: s1 });
  app.collision.set('slide:' + o.id, [span(o.from, o.to)], () => tog.v < 0.6);
  // 열려도 고정 패널 쪽은 막힘 (z벽은 지역 x가 세계 z와 같은 방향)
  app.collision.set('slideFixed:' + o.id, [span(o.from, o.from + pw - 0.05)], () => tog.v >= 0.6);
}

// ── 천장 조명 ──
function buildRoomLight(app, house, r) {
  const { M } = app;
  const [lx, lz] = r.light;
  const glow = new THREE.MeshBasicMaterial({ color: '#d9d5cc' });
  const g = new THREE.Group();
  house.add(g);
  app.ceilingMeshes.push(g);
  const area = (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]);
  const warm = ['living', 'master', 'room2', 'study', 'dress', 'entry', 'corridor'].includes(r.id);
  const glowOn = warm ? '#fff1d6' : '#f6f8ff';
  const panel = (w, d, x = lx, z = lz) => {
    addBox(g, M.white, x - w / 2 - 0.02, H - 0.035, z - d / 2 - 0.02, x + w / 2 + 0.02, H, z + d / 2 + 0.02);
    const p = addBox(g, glow, x - w / 2, H - 0.04, z - d / 2, x + w / 2, H - 0.034, z + d / 2);
    return p;
  };
  const down = (x, z) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 20), glow);
    m.position.set(x, H - 0.005, z);
    g.add(m);
  };
  if (r.id === 'living') {
    panel(1.3, 0.7);
    for (const z of [5.2, 8.25]) for (const x of [3.6, 5.3, 7.0]) down(x, z);
  } else if (r.id === 'kitchen') {
    panel(1.0, 0.4);
    for (const x of [5.6, 6.4]) {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, H - 1.75, 6), M.black);
      cord.position.set(x, (H + 1.75) / 2, 3.0);
      g.add(cord);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.2, 24, 1, true), M.charcoal);
      shade.material = M.charcoal;
      shade.position.set(x, 1.66, 3.0);
      g.add(shade);
      const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), glow);
      bulb.rotation.x = Math.PI / 2;
      bulb.position.set(x, 1.565, 3.0);
      g.add(bulb);
    }
  } else if (r.id === 'bath' || r.id === 'mbath') {
    down(lx - 0.45, lz);
    down(lx + 0.45, lz);
  } else if (r.id === 'balcony') {
    down(4.5, 9.3);
    down(9.5, 9.3);
  } else if (r.id === 'corridor') {
    down(lx, lz);
  } else if (r.id === 'master') {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.06, 32), glow);
    ring.position.set(lx, H - 0.03, lz);
    g.add(ring);
  } else {
    const s = area > 6 ? 0.55 : 0.42;
    panel(s, s);
  }
  const intensity = 2.5 + area * 0.62;
  const srcs = [app.lights.add({ pos: new THREE.Vector3(lx, H - 0.45, lz), color: warm ? '#ffe2bd' : '#fff4e8', intensity, distance: 10, on: false, kind: 'room', room: r.id })];
  if (r.id === 'kitchen') srcs.push(app.lights.add({ pos: new THREE.Vector3(6.0, 1.45, 3.0), color: '#ffdcae', intensity: 4, distance: 6, on: false, kind: 'room', room: r.id }));
  if (r.id === 'living') srcs.push(app.lights.add({ pos: new THREE.Vector3(5.3, H - 0.4, 5.3), color: '#ffe2bd', intensity: 5, distance: 7, on: false, kind: 'room', room: r.id }));
  const state = {
    room: r,
    on: false,
    set(on) {
      this.on = on;
      for (const s of srcs) s.on = on;
      glow.color.set(on ? glowOn : '#d9d5cc');
      app.events.emit('light', { room: r.id, on });
    },
  };
  app.roomLights[r.id] = state;
}

function buildSwitch(app, house, s) {
  const { M } = app;
  const g = new THREE.Group();
  g.position.set(s.x, s.y ?? 1.2, s.z);
  g.rotation.y = { '+z': 0, '-z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 }[s.n];
  house.add(g);
  addBox(g, M.white, -0.04, -0.06, 0, 0.04, 0.06, 0.012);
  const rocker = addBox(g, M.offwhite, -0.025, -0.035, 0.012, 0.025, 0.035, 0.02);
  const state = app.roomLights[s.room];
  const room = state.room;
  g.userData.inter = {
    label: () => `${room.name} 불 ${state.on ? '끄기' : '켜기'}`,
    action: () => {
      state.set(!state.on);
      app.audio.at(g, 'switch', { volume: 0.6 });
    },
  };
  app.events.on('light', (e) => {
    if (e.room === s.room) rocker.rotation.x = e.on ? -0.18 : 0.18;
  });
  rocker.rotation.x = 0.18;
}
