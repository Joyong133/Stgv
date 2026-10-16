// 가구: 코드로 만든 모델 + 상호작용 (문 열기, 불 켜기, 앉기, TV …)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { deg, rng, liveCanvas, roundRect, FONT_UI, FONT_TITLE, fmtTime } from './util.js';
import { rugPattern } from './textures.js';
import { noRaycast, footprintBox } from './systems.js';

// ── 모양 만들기 도구 ──
function box(p, mat, x0, y0, z0, x1, y1, z1) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0) || 0.001, Math.abs(y1 - y0) || 0.001, Math.abs(z1 - z0) || 0.001), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  p.add(m);
  return m;
}
function cyl(p, mat, rt, rb, h, x, y, z, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y + h / 2, z);
  p.add(m);
  return m;
}
function sph(p, mat, r, x, y, z, sx = 1, sy = 1, sz = 1, seg = 12) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.6 | 0)), mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  p.add(m);
  return m;
}
function xcyl(p, mat, r, len, x, y, z, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  p.add(m);
  return m;
}

// 같은 재질 메시 합치기 (정적인 부분만)
export function bake(root) {
  const groups = new Map();
  for (const ch of [...root.children]) {
    if (!ch.isMesh || ch.userData.dyn || ch.userData.inter || ch.isReflector) continue;
    let arr = groups.get(ch.material);
    if (!arr) groups.set(ch.material, (arr = []));
    arr.push(ch);
  }
  for (const [mat, list] of groups) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      m.updateMatrix();
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      g.applyMatrix4(m.matrix);
      return g;
    });
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    for (const m of list) {
      root.remove(m);
      m.geometry.dispose();
    }
    for (const g of geos) g.dispose();
    const mesh = new THREE.Mesh(merged, mat);
    if (list[0].raycast === noRaycast) mesh.raycast = noRaycast;
    root.add(mesh);
  }
}

function makeCtx(app, root, item) {
  const alive = () => !!root.parent && !root.userData.removed;
  const ctx = {
    app,
    M: app.M,
    item,
    root,
    alive,
    _after: [],
    box,
    cyl,
    sph,
    xcyl,
    inter(obj, spec) {
      obj.userData.inter = spec;
      obj.userData.dyn = true;
      return obj;
    },
    toggle(apply, opts = {}) {
      return app.toggles.make(apply, { ...opts, alive });
    },
    light(spec) {
      const anchor = new THREE.Object3D();
      anchor.position.set(spec.x, spec.y, spec.z);
      (spec.parent || root).add(anchor);
      return app.lights.add({ ...spec, anchor, alive });
    },
    update(fn) {
      app.updaters.push({ fn, alive });
    },
    after(fn) {
      ctx._after.push(fn);
    },
    grab(kind, x, y, z, rotY = 0) {
      ctx.after(() => {
        const p = root.localToWorld(new THREE.Vector3(x, y, z));
        app.spawnGrab(kind, p, rotY + root.rotation.y);
      });
    },
    sfx(obj, name, opts) {
      app.audio.at(obj, name, opts);
    },
    loop(obj, name, opts) {
      return app.audio.loop(obj, name, opts);
    },
    seat(seats, label = '앉기') {
      root.userData.seats = seats;
      root.userData.inter = {
        kind: 'seat',
        label,
        action: (hit) => app.player.sitOn(root, hit && hit.point),
      };
    },
    hingeDoor(parent, o) {
      const { x0, x1, y0, y1, z0, z1, hinge = 'left', mat, label = '문', angle = 0.9 } = o;
      const w = x1 - x0;
      const pivot = new THREE.Group();
      pivot.position.set(hinge === 'left' ? x0 : x1, 0, z0);
      parent.add(pivot);
      const leaf = box(pivot, mat, hinge === 'left' ? 0 : -w, y0, 0, hinge === 'left' ? w : 0, y1, z1 - z0);
      const hx = hinge === 'left' ? w - 0.04 : -w + 0.04;
      if (o.handle !== false) box(pivot, app.M.chrome, hx - 0.008, (y0 + y1) / 2 - 0.06, z1 - z0, hx + 0.008, (y0 + y1) / 2 + 0.06, z1 - z0 + 0.018);
      const theta = (hinge === 'left' ? -1 : 1) * (Math.PI / 2) * angle;
      const tog = ctx.toggle((v) => (pivot.rotation.y = theta * v), { speed: 2.2 });
      ctx.inter(pivot, {
        label: () => (tog.on ? `${label} 닫기` : `${label} 열기`),
        action: () => {
          const on = tog.flip();
          ctx.sfx(pivot, on ? 'cabinetOpen' : 'cabinetClose', { volume: 0.6 });
          o.onChange && o.onChange(on);
        },
      });
      return { pivot, leaf, tog };
    },
    drawer(parent, o) {
      const { x0, x1, y0, y1, z, depth = 0.4, mat, label = '서랍' } = o;
      const g = new THREE.Group();
      parent.add(g);
      box(g, mat, x0, y0, z - 0.02, x1, y1, z);
      box(g, app.M.white, x0 + 0.02, y0 + 0.01, z - depth, x0 + 0.03, y1 - 0.03, z - 0.02);
      box(g, app.M.white, x1 - 0.03, y0 + 0.01, z - depth, x1 - 0.02, y1 - 0.03, z - 0.02);
      box(g, app.M.white, x0 + 0.02, y0 + 0.01, z - depth, x1 - 0.02, y0 + 0.02, z - 0.02);
      box(g, app.M.chrome, (x0 + x1) / 2 - 0.05, (y0 + y1) / 2 - 0.006, z, (x0 + x1) / 2 + 0.05, (y0 + y1) / 2 + 0.006, z + 0.015);
      const tog = ctx.toggle((v) => (g.position.z = v * depth * 0.7), { speed: 2.5 });
      ctx.inter(g, {
        label: () => (tog.on ? `${label} 닫기` : `${label} 열기`),
        action: () => {
          tog.flip();
          ctx.sfx(g, 'drawer', { volume: 0.6 });
        },
      });
      return { group: g, tog };
    },
    screen(parent, w, h, pw, ph, x, y, z) {
      const lc = liveCanvas(pw, ph);
      const onMat = new THREE.MeshBasicMaterial({ map: lc.tex, toneMapped: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), app.M.screen);
      mesh.position.set(x, y, z);
      mesh.userData.dyn = true;
      parent.add(mesh);
      return {
        ...lc,
        mesh,
        set(on) {
          mesh.material = on ? onMat : app.M.screen;
        },
      };
    },
    water(parent, x, yTop, yBottom, z, r = 0.006) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.3, yTop - yBottom, 8), app.M.water);
      m.position.set(x, (yTop + yBottom) / 2, z);
      m.visible = false;
      m.raycast = noRaycast;
      m.userData.dyn = true;
      parent.add(m);
      return m;
    },
    faucetToggle(target, stream, label = '물') {
      let h = null;
      const tog = { on: false };
      ctx.inter(target, {
        label: () => (tog.on ? `${label} 잠그기` : `${label} 틀기`),
        action: () => {
          tog.on = !tog.on;
          stream.visible = tog.on;
          ctx.sfx(target, 'click', { volume: 0.4 });
          if (tog.on) h = ctx.loop(target, 'water', { volume: 0.5 });
          else if (h) h.stop();
        },
      });
      ctx.update(() => {
        if (stream.visible) stream.scale.x = stream.scale.z = 0.85 + Math.random() * 0.3;
      });
      return tog;
    },
    bake: (g) => bake(g),
  };
  return ctx;
}

// ─────────────────────────────────────────────
// 가구 종류
// ─────────────────────────────────────────────
export const TYPES = {};
const def = (type, name, build, extra = {}) => (TYPES[type] = { type, name, build, ...extra });

// 현관
def('shoeCabinet', '신발장', (c) => {
  const { M, root } = c;
  const w = 1.4;
  const d = 0.38;
  box(root, M.cabinet, -w / 2, 0, -d / 2, w / 2, 0.85, d / 2 - 0.02);
  box(root, M.cabinet, -w / 2, 1.2, -d / 2, w / 2, 2.3, d / 2 - 0.02);
  box(root, M.oak, -w / 2, 0.85, -d / 2, w / 2, 0.88, d / 2);
  box(root, M.oak, -w / 2, 1.2, -d / 2, w / 2, 1.22, d / 2 - 0.02);
  box(root, M.white, -w / 2, 0.88, -d / 2, w / 2, 1.2, -d / 2 + 0.01);
  // 간접조명 띠
  const strip = box(root, M.glowWarm, -w / 2 + 0.02, 1.195, -d / 2 + 0.05, w / 2 - 0.02, 1.2, -d / 2 + 0.08);
  strip.raycast = noRaycast;
  // 문짝
  for (let i = 0; i < 4; i++) {
    const x0 = -w / 2 + i * 0.35 + 0.004;
    const x1 = x0 + 0.342;
    if (i === 0) {
      const dr = c.hingeDoor(root, { x0, x1, y0: 1.22, y1: 2.29, z0: d / 2 - 0.02, z1: d / 2, hinge: 'left', mat: M.cabinet, label: '신발장' });
      dr.pivot.userData.dyn = true;
    } else {
      box(root, M.cabinet, x0, 1.22, d / 2 - 0.02, x1, 2.29, d / 2);
      box(root, M.chrome, x0 + 0.3, 1.3, d / 2, x0 + 0.315, 1.45, d / 2 + 0.015);
    }
    box(root, M.cabinet, x0, 0.01, d / 2 - 0.02, x1, 0.84, d / 2);
  }
  // 신발 (안쪽 선반)
  for (let s = 0; s < 3; s++) {
    const y = 1.22 + s * 0.34;
    box(root, M.white, -w / 2 + 0.01, y, -d / 2 + 0.01, -w / 2 + 0.34, y + 0.015, d / 2 - 0.03);
    for (let k = 0; k < 2; k++) box(root, [M.black, M.blue, M.red, M.paper][(s + k) % 4], -w / 2 + 0.04 + k * 0.15, y + 0.015, -0.12, -w / 2 + 0.15 + k * 0.15, y + 0.1, 0.13);
  }
  // 위에 올린 소품
  box(root, M.ceramic, 0.35, 0.88, -0.05, 0.47, 1.0, 0.07);
  c.grab('keys', 0.0, 0.9, 0.05);
  return { w, d };
});

def('mat', '현관 매트', (c) => {
  box(c.root, c.M.charcoal, -0.45, 0, -0.3, 0.45, 0.012, 0.3);
  return { w: 0.9, d: 0.6, solid: false, noBlob: true };
});

def('wallpad', '월패드', (c) => {
  const { M, root, app } = c;
  box(root, M.white, -0.16, -0.12, 0, 0.16, 0.12, 0.02);
  const sc = c.screen(root, 0.27, 0.18, 256, 170, 0, 0.005, 0.021);
  sc.set(true);
  const draw = () => {
    const g = sc.g;
    const grd = g.createLinearGradient(0, 0, 0, 170);
    grd.addColorStop(0, '#173042');
    grd.addColorStop(1, '#0d1b25');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 170);
    g.fillStyle = '#ffffff';
    g.font = `600 34px ${FONT_UI}`;
    g.fillText(fmtTime(app.time.hour).replace('오전 ', '').replace('오후 ', ''), 14, 44);
    g.font = `16px ${FONT_UI}`;
    g.fillStyle = '#9fc3d8';
    g.fillText(app.time.hour < 12 ? '오전' : '오후', 16, 64);
    g.fillText(`${app.weatherName()} · 실내 24°C`, 14, 92);
    const any = app.anyLightOn();
    roundRect(g, 14, 108, 228, 48, 10);
    g.fillStyle = any ? '#ffb547' : '#3b5566';
    g.fill();
    g.fillStyle = any ? '#1c1405' : '#d8e6ee';
    g.font = `600 22px ${FONT_UI}`;
    g.textAlign = 'center';
    g.fillText(any ? '일괄 소등' : '전체 점등', 128, 140);
    g.textAlign = 'left';
    sc.tex.needsUpdate = true;
  };
  let t = 0;
  c.update((dt) => {
    t -= dt;
    if (t <= 0) {
      t = 1;
      draw();
    }
  });
  c.inter(sc.mesh, {
    label: () => (app.anyLightOn() ? '일괄 소등 (집 안 불 모두 끄기)' : '전체 점등 (집 안 불 모두 켜기)'),
    action: () => {
      app.setAllLights(!app.anyLightOn());
      c.sfx(root, 'beep', { volume: 0.5 });
      t = 0;
    },
  });
  return { w: 0.32, d: 0.03, wall: true, fixed: true };
});

def('plate', '호수 표지판', (c) => {
  const { M, root, item } = c;
  const sc = c.screen(root, 0.24, 0.1, 192, 80, 0, 0, 0.012);
  box(root, M.charcoal, -0.13, -0.055, 0, 0.13, 0.055, 0.01);
  sc.set(true);
  sc.g.fillStyle = '#2a2d31';
  sc.g.fillRect(0, 0, 192, 80);
  sc.g.fillStyle = '#f0f0ea';
  sc.g.font = `44px ${FONT_TITLE}`;
  sc.g.textAlign = 'center';
  sc.g.fillText(item.text || '1301', 96, 56);
  sc.tex.needsUpdate = true;
  return { w: 0.26, d: 0.02, wall: true, fixed: true };
});

def('art', '그림 액자', (c) => {
  const { M, root, item } = c;
  const w = item.w || 0.8;
  const h = item.h || 0.6;
  box(root, item.art === 1 ? M.oak : M.black, -w / 2, -h / 2, 0, w / 2, h / 2, 0.03);
  const sc = c.screen(root, w - 0.06, h - 0.06, 256, Math.round((256 * h) / w), 0, 0, 0.031);
  sc.set(true);
  paintArt(sc.g, 256, Math.round((256 * h) / w), item.art || 0);
  sc.tex.needsUpdate = true;
  sc.mesh.userData.dyn = false;
  return { w, d: 0.03, wall: true };
});

function paintArt(g, w, h, kind) {
  const r = rng(kind * 31 + 7);
  if (kind === 0) {
    g.fillStyle = '#efe6d6';
    g.fillRect(0, 0, w, h);
    const cols = ['#c76f4b', '#2f5d62', '#e2b04a', '#8aa399', '#1e2a33'];
    for (let i = 0; i < 7; i++) {
      g.fillStyle = cols[i % cols.length];
      g.globalAlpha = 0.85;
      g.beginPath();
      g.arc(r() * w, r() * h, 20 + r() * 50, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.strokeStyle = '#1e2a33';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, h * 0.7);
    g.bezierCurveTo(w * 0.3, h * 0.4, w * 0.6, h * 0.95, w, h * 0.55);
    g.stroke();
  } else if (kind === 1) {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#f6c79a');
    grd.addColorStop(1, '#f3e3c8');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    const layers = ['#9aa7b0', '#6f818c', '#4b5d68'];
    layers.forEach((col, i) => {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, h * (0.45 + i * 0.15) - Math.sin(x * 0.03 + i) * 20 - r() * 10);
      g.lineTo(w, h);
      g.fill();
    });
    g.fillStyle = '#fff6e0';
    g.beginPath();
    g.arc(w * 0.7, h * 0.28, 18, 0, Math.PI * 2);
    g.fill();
  } else {
    g.fillStyle = '#f4f1ea';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#4d6b4f';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(w / 2, h * 0.95);
    g.quadraticCurveTo(w * 0.45, h * 0.5, w * 0.55, h * 0.1);
    g.stroke();
    for (let i = 0; i < 9; i++) {
      const y = h * (0.85 - i * 0.08);
      const s = i % 2 ? 1 : -1;
      g.fillStyle = i % 3 ? '#6d9a6a' : '#4d6b4f';
      g.beginPath();
      g.ellipse(w / 2 + s * 26, y, 24, 9, s * 0.5, 0, Math.PI * 2);
      g.fill();
    }
  }
}

// 주방
def('kitchen', '주방 싱크대', (c) => {
  const { M, root, app } = c;
  const L = 3.08;
  const hx = L / 2;
  box(root, M.charcoal, -hx, 0, -0.3, hx, 0.1, 0.22);
  box(root, M.cabinet, -hx, 0.1, -0.3, hx, 0.86, 0.26);
  box(root, M.counter, -hx, 0.86, -0.3, hx, 0.9, 0.31);
  // 앞판 (일부는 열림)
  const fronts = [-1.54, -1.0, -0.46, -0.15, 0.35, 0.85, 1.2];
  for (let i = 0; i < fronts.length - 1; i++) {
    const x0 = fronts[i] + 0.003;
    const x1 = fronts[i + 1] - 0.003;
    if (i === 2 || i === 3) {
      c.hingeDoor(root, { x0, x1, y0: 0.12, y1: 0.84, z0: 0.26, z1: 0.28, hinge: i === 2 ? 'left' : 'right', mat: M.cabinet, label: '싱크대 문' });
    } else if (i === 0) {
      c.drawer(root, { x0, x1, y0: 0.62, y1: 0.84, z: 0.28, depth: 0.45, mat: M.cabinet, label: '수저 서랍' });
      box(root, M.cabinet, x0, 0.12, 0.26, x1, 0.6, 0.28);
      box(root, M.cabinet, x0, 0.12, 0.26, x1, 0.36, 0.281);
    } else {
      box(root, M.cabinet, x0, 0.12, 0.26, x1, 0.84, 0.28);
      box(root, M.chrome, x0 + 0.04, 0.8, 0.28, x1 - 0.04, 0.81, 0.29);
    }
  }
  box(root, M.cabinet, 1.2 + 0.003, 0.12, 0.26, hx, 0.84, 0.28);
  // 싱크볼
  box(root, M.steel, -0.25, 0.9, -0.18, 0.45, 0.905, 0.2);
  box(root, M.charcoal, -0.22, 0.903, -0.15, 0.42, 0.907, 0.17);
  // 수전
  const faucet = new THREE.Group();
  root.add(faucet);
  cyl(faucet, M.chrome, 0.018, 0.022, 0.32, 0.1, 0.9, -0.24);
  xcyl(faucet, M.chrome, 0.012, 0.03, 0.1, 1.2, -0.24).rotation.set(Math.PI / 2, 0, 0);
  const spout = box(faucet, M.chrome, 0.088, 1.2, -0.24, 0.112, 1.215, -0.04);
  box(faucet, M.chrome, 0.06, 1.0, -0.25, 0.075, 1.01, -0.16);
  const stream = c.water(root, 0.1, 1.2, 0.905, -0.05);
  c.faucetToggle(faucet, stream, '싱크대 물');
  // 인덕션
  box(root, M.black, -1.3, 0.9, -0.24, -0.7, 0.908, 0.24);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#3a2a28' });
  for (const [x, z, r] of [[-1.15, -0.1, 0.1], [-0.85, -0.1, 0.08], [-1.0, 0.12, 0.09]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.012, r, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.909, z);
    ring.raycast = noRaycast;
    root.add(ring);
  }
  // 냄비
  cyl(root, M.steel, 0.1, 0.1, 0.13, -1.15, 0.908, -0.1, 20);
  cyl(root, M.charcoal, 0.105, 0.105, 0.012, -1.15, 1.038, -0.1, 20);
  let sizzle = null;
  const cook = { on: false };
  const cookPanel = box(root, M.black, -1.28, 0.909, 0.16, -1.05, 0.912, 0.22);
  c.inter(cookPanel, {
    label: () => (cook.on ? '인덕션 끄기' : '인덕션 켜기'),
    action: () => {
      cook.on = !cook.on;
      ringMat.color.set(cook.on ? '#ff5a24' : '#3a2a28');
      c.sfx(cookPanel, 'beep', { volume: 0.4 });
      if (cook.on) sizzle = c.loop(cookPanel, 'sizzle', { volume: 0.25 });
      else if (sizzle) sizzle.stop();
    },
  });
  // 후드
  box(root, M.steel, -1.32, 1.5, -0.3, -0.68, 1.62, 0.22);
  box(root, M.steel, -1.12, 1.62, -0.3, -0.88, 2.4, -0.06);
  const hoodBtn = box(root, M.black, -0.85, 1.52, 0.22, -0.74, 1.58, 0.225);
  const hoodLight = c.light({ x: -1.0, y: 1.45, z: 0.0, color: '#fff2d8', intensity: 1.2, distance: 3, on: false });
  let hoodSnd = null;
  c.inter(hoodBtn, {
    label: () => (hoodLight.on ? '후드 끄기' : '후드 켜기'),
    action: () => {
      hoodLight.on = !hoodLight.on;
      c.sfx(hoodBtn, 'click', { volume: 0.4 });
      if (hoodLight.on) hoodSnd = c.loop(hoodBtn, 'hood', { volume: 0.3 });
      else if (hoodSnd) hoodSnd.stop();
    },
  });
  // 상부장
  box(root, M.cabinet, 0.86, 1.45, -0.3, hx, 2.25, 0.03);
  box(root, M.white, 0.88, 1.75, -0.28, hx - 0.02, 1.765, 0.0);
  for (let i = 0; i < 4; i++) cyl(root, M.ceramic, 0.11, 0.1, 0.02, 1.05 + (i % 2) * 0.24, 1.47 + Math.floor(i / 2) * 0.3, -0.12, 20);
  c.hingeDoor(root, { x0: 0.865, x1: 1.2, y0: 1.46, y1: 2.24, z0: 0.03, z1: 0.05, hinge: 'left', mat: M.cabinet, label: '찬장' });
  box(root, M.cabinet, 1.205, 1.46, 0.03, hx - 0.003, 2.24, 0.05);
  // 타일 벽
  box(root, M.ceramic, -hx, 0.9, -0.3, -0.6, 1.5, -0.29);
  box(root, M.ceramic, -0.6, 0.9, -0.3, 0.8, 1.1, -0.29);
  box(root, M.ceramic, 0.8, 0.9, -0.3, hx, 1.45, -0.29);
  // 전자레인지
  const mw = new THREE.Group();
  root.add(mw);
  box(mw, M.charcoal, 1.0, 0.9, -0.25, 1.48, 1.18, 0.1);
  const mwWin = new THREE.MeshBasicMaterial({ color: '#15181b' });
  box(mw, mwWin, 1.04, 0.95, 0.1, 1.34, 1.14, 0.102);
  box(mw, M.black, 1.37, 0.95, 0.1, 1.45, 1.14, 0.103);
  const mwLight = c.light({ x: 1.2, y: 1.05, z: 0.2, color: '#ffd59a', intensity: 0.6, distance: 2, on: false });
  let mwTimer = 0;
  let mwSnd = null;
  c.inter(mw, {
    label: () => (mwTimer > 0 ? `전자레인지 (${Math.ceil(mwTimer)}초)` : '전자레인지 돌리기'),
    action: () => {
      if (mwTimer > 0) return;
      mwTimer = 8;
      mwLight.on = true;
      mwWin.color.set('#e8b45c');
      c.sfx(mw, 'beep', { volume: 0.4 });
      mwSnd = c.loop(mw, 'microwave', { volume: 0.35 });
    },
  });
  c.update((dt) => {
    if (mwTimer <= 0) return;
    mwTimer -= dt;
    if (mwTimer <= 0) {
      mwLight.on = false;
      mwWin.color.set('#15181b');
      if (mwSnd) mwSnd.stop();
      c.sfx(mw, 'ding', { volume: 0.6 });
    }
  });
  // 밥솥
  cyl(root, M.white, 0.13, 0.13, 0.22, 0.65, 0.9, -0.12, 20);
  sph(root, M.white, 0.13, 0.65, 1.12, -0.12, 1, 0.35, 1, 16);
  box(root, M.charcoal, 0.6, 1.0, 0.0, 0.7, 1.05, 0.012);
  c.grab('kettle', -0.45, 0.9, 0.0, 0.4);
  c.grab('mug', 0.75, 0.9, 0.18);
  return { w: L, d: 0.6 };
});

def('fridge', '양문형 냉장고', (c) => {
  const { M, root } = c;
  const w = 0.9;
  const d = 0.75;
  const h = 1.8;
  const zf = 0.3;
  box(root, M.fridge, -w / 2, 0, -d / 2, w / 2, 0.06, zf);
  box(root, M.fridge, -w / 2, h - 0.04, -d / 2, w / 2, h, zf);
  box(root, M.fridge, -w / 2, 0, -d / 2, -w / 2 + 0.03, h, zf);
  box(root, M.fridge, w / 2 - 0.03, 0, -d / 2, w / 2, h, zf);
  box(root, M.white, -w / 2, 0, -d / 2, w / 2, h, -d / 2 + 0.03);
  box(root, M.white, -0.105, 0.06, -d / 2, -0.075, h - 0.04, zf);
  box(root, M.white, -w / 2 + 0.03, 0.06, -d / 2 + 0.03, w / 2 - 0.03, 0.08, zf);
  const shelfMat = c.M.glass;
  for (const y of [0.45, 0.85, 1.25]) {
    box(root, M.white, -0.075, y, -d / 2 + 0.03, w / 2 - 0.03, y + 0.012, zf - 0.02);
    box(root, M.white, -w / 2 + 0.03, y, -d / 2 + 0.03, -0.105, y + 0.012, zf - 0.02);
  }
  // 내용물
  const cols = [M.red, M.green, M.yellow, M.orange, M.paper, M.blue];
  const r = rng(4);
  for (const y of [0.462, 0.862, 1.262]) {
    for (let i = 0; i < 4; i++) {
      const x = 0.0 + i * 0.1 + r() * 0.02;
      if (r() < 0.5) cyl(root, cols[(i + y * 10) % cols.length | 0], 0.03, 0.03, 0.1 + r() * 0.1, x, y, -0.15 + r() * 0.2, 10);
      else box(root, cols[(i * 3 + y * 7) % cols.length | 0], x - 0.04, y, -0.2, x + 0.04, y + 0.09, -0.05);
    }
    box(root, M.lightgray, -0.36, y, -0.2, -0.13, y + 0.14, 0.15);
  }
  c.grab('apple', 0.2, 0.08, 0.1);
  c.grab('milk', 0.05, 0.462, 0.1);
  c.grab('bottle', 0.3, 0.862, 0.12);
  // 실내등
  const glow = new THREE.MeshBasicMaterial({ color: '#bbbbbb' });
  box(root, glow, -0.07, h - 0.08, -0.2, w / 2 - 0.05, h - 0.04, 0.1).raycast = noRaycast;
  const inner = c.light({ x: 0.15, y: 1.2, z: 0.6, color: '#eef6ff', intensity: 1.6, distance: 3.5, on: false });
  let doorsOpen = 0;
  const onChange = (on) => {
    doorsOpen += on ? 1 : -1;
    inner.on = doorsOpen > 0;
    glow.color.set(doorsOpen > 0 ? '#ffffff' : '#bbbbbb');
  };
  const left = c.hingeDoor(root, { x0: -w / 2, x1: -0.092, y0: 0.0, y1: h, z0: zf, z1: d / 2, hinge: 'left', mat: M.fridge, label: '냉동실 문', handle: false, onChange });
  const right = c.hingeDoor(root, { x0: -0.088, x1: w / 2, y0: 0.0, y1: h, z0: zf, z1: d / 2, hinge: 'right', mat: M.fridge, label: '냉장실 문', handle: false, onChange });
  box(left.pivot, M.chrome, 0.32, 0.8, 0.075, 0.335, 1.4, 0.1);
  box(right.pivot, M.chrome, -0.555, 0.8, 0.075, -0.54, 1.4, 0.1);
  for (const y of [0.5, 0.95, 1.4]) {
    box(right.pivot, M.white, -0.52, y, -0.08, -0.04, y + 0.08, 0.0);
    box(left.pivot, M.white, 0.03, y, -0.08, 0.33, y + 0.08, 0.0);
  }
  box(right.pivot, M.screen, -0.45, 1.35, 0.076, -0.3, 1.47, 0.08);
  c.after(() => c.loop(root, 'fridgeHum', { volume: 0.12 }));
  return { w, d };
});

def('diningTable', '식탁', (c) => {
  const { M, root } = c;
  const w = 1.6;
  const d = 0.9;
  box(root, M.oak, -w / 2, 0.71, -d / 2, w / 2, 0.75, d / 2);
  box(root, M.oak, -w / 2 + 0.05, 0.64, -d / 2 + 0.05, w / 2 - 0.05, 0.71, d / 2 - 0.05);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(root, M.oak, sx * (w / 2 - 0.1) - 0.03, 0, sz * (d / 2 - 0.08) - 0.03, sx * (w / 2 - 0.1) + 0.03, 0.71, sz * (d / 2 - 0.08) + 0.03);
  // 과일 그릇
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.ceramic);
  bowl.scale.y = 0.55;
  bowl.position.set(0.1, 0.83, 0);
  root.add(bowl);
  c.grab('apple', 0.06, 0.8, 0.0);
  c.grab('apple', 0.16, 0.8, 0.04);
  c.grab('orange', 0.1, 0.84, -0.06);
  c.grab('mug', -0.4, 0.75, 0.15);
  // 꽃병
  cyl(root, M.glass, 0.04, 0.05, 0.2, -0.3, 0.75, -0.15, 12);
  for (let i = 0; i < 5; i++) sph(root, [M.pink, M.yellow, M.red][i % 3], 0.03, -0.3 + Math.sin(i * 1.3) * 0.05, 1.0 + (i % 2) * 0.04, -0.15 + Math.cos(i * 1.3) * 0.05);
  return { w, d };
});

def('chair', '의자', (c) => {
  const { M, root } = c;
  box(root, M.oak, -0.22, 0.43, -0.21, 0.22, 0.47, 0.21);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(root, M.oak, sx * 0.19 - 0.018, 0, sz * 0.18 - 0.018, sx * 0.19 + 0.018, 0.43, sz * 0.18 + 0.018);
  for (const sx of [-1, 1]) box(root, M.oak, sx * 0.19 - 0.018, 0.47, -0.198, sx * 0.19 + 0.018, 0.9, -0.162);
  box(root, M.oak, -0.21, 0.72, -0.2, 0.21, 0.88, -0.17);
  box(root, M.cushion, -0.2, 0.47, -0.19, 0.2, 0.5, 0.19);
  c.seat([{ x: 0, z: 0.02, y: 0.48, yaw: 0 }]);
  return { w: 0.44, d: 0.44, solid: false };
});

def('clock', '벽시계', (c) => {
  const { M, root, app } = c;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 32), M.charcoal);
  ring.rotation.x = Math.PI / 2;
  ring.position.z = 0.02;
  root.add(ring);
  const lc = liveCanvas(128, 128);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.155, 32), new THREE.MeshLambertMaterial({ map: lc.tex }));
  face.position.z = 0.041;
  face.userData.dyn = true;
  root.add(face);
  let last = -1;
  c.update(() => {
    const minute = Math.floor(app.time.hour * 60);
    if (minute === last) return;
    last = minute;
    const g = lc.g;
    g.fillStyle = '#f7f5f0';
    g.fillRect(0, 0, 128, 128);
    g.translate(64, 64);
    for (let i = 0; i < 12; i++) {
      g.save();
      g.rotate((i * Math.PI) / 6);
      g.fillStyle = '#2a2d31';
      g.fillRect(-1.5, -58, 3, i % 3 ? 8 : 14);
      g.restore();
    }
    const h = app.time.hour % 12;
    const m = (app.time.hour % 1) * 60;
    const hand = (a, len, wdt, col) => {
      g.save();
      g.rotate(a);
      g.fillStyle = col;
      g.fillRect(-wdt / 2, -len, wdt, len + 6);
      g.restore();
    };
    hand((h / 12) * Math.PI * 2, 32, 5, '#2a2d31');
    hand((m / 60) * Math.PI * 2, 48, 3, '#2a2d31');
    g.fillStyle = '#c0473d';
    g.beginPath();
    g.arc(0, 0, 4, 0, Math.PI * 2);
    g.fill();
    g.setTransform(1, 0, 0, 1, 0, 0);
    lc.tex.needsUpdate = true;
  });
  c.inter(face, { label: () => `지금은 ${fmtTime(app.time.hour)}`, action: () => c.sfx(root, 'tick', { volume: 0.5 }) });
  return { w: 0.34, d: 0.04, wall: true };
});

// 거실
def('sofa', '3인 소파', (c) => {
  const { M, root } = c;
  const w = 2.2;
  const d = 0.9;
  box(root, M.sofa, -w / 2, 0.08, -d / 2, w / 2, 0.42, d / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(root, M.walnut, 0.025, 0.02, 0.08, sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08), 8);
  for (const sx of [-1, 1]) box(root, M.sofa, sx * (w / 2) - (sx > 0 ? 0.16 : 0), 0.08, -d / 2, sx * (w / 2) + (sx > 0 ? 0 : 0.16), 0.66, d / 2);
  for (let i = 0; i < 3; i++) {
    const x0 = -w / 2 + 0.165 + i * 0.623;
    box(root, M.sofa, x0 + 0.005, 0.42, -0.22, x0 + 0.618, 0.54, d / 2 - 0.01);
    const back = box(root, M.sofa, x0 + 0.005, 0.42, -d / 2 + 0.02, x0 + 0.618, 0.9, -0.22);
    back.rotation.x = -0.12;
  }
  c.grab('cushion', -0.85, 0.6, -0.15, 0.3);
  c.grab('cushion2', 0.85, 0.6, -0.15, -0.3);
  c.seat([
    { x: -0.62, z: 0.08, y: 0.52, yaw: 0 },
    { x: 0, z: 0.08, y: 0.52, yaw: 0 },
    { x: 0.62, z: 0.08, y: 0.52, yaw: 0 },
  ]);
  return { w, d };
});

def('rug', '러그', (c) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.7), new THREE.MeshLambertMaterial({ map: rugPattern() }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.006;
  c.root.add(m);
  return { w: 2.4, d: 1.7, solid: false, noBlob: true };
});

def('coffeeTable', '거실 테이블', (c) => {
  const { M, root } = c;
  box(root, M.walnut, -0.55, 0.36, -0.28, 0.55, 0.4, 0.28);
  box(root, M.walnut, -0.5, 0.08, -0.24, 0.5, 0.1, 0.24);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(root, M.charcoal, sx * 0.5 - 0.015, 0, sz * 0.23 - 0.015, sx * 0.5 + 0.015, 0.36, sz * 0.23 + 0.015);
  box(root, M.navy, -0.4, 0.1, -0.1, -0.15, 0.13, 0.12);
  box(root, M.paper, -0.38, 0.13, -0.08, -0.16, 0.15, 0.1);
  c.grab('remote', 0.2, 0.4, 0.05, 0.3);
  c.grab('mug', -0.25, 0.4, -0.1);
  c.grab('book', 0.0, 0.4, -0.12, 0.2);
  return { w: 1.1, d: 0.56 };
});

const TV_CHANNELS = ['우리집 뉴스', '자연 다큐', '어린이 만화', '음악 방송'];
const TV_SOUNDS = ['tvNews', 'waves', 'chiptune', 'lofi'];

def('tv', 'TV와 거실장', (c) => {
  const { M, root, app } = c;
  const w = 1.8;
  const d = 0.45;
  box(root, M.charcoal, -w / 2 + 0.05, 0, -d / 2, w / 2 - 0.05, 0.06, d / 2 - 0.03);
  box(root, M.white, -w / 2, 0.06, -d / 2, w / 2, 0.42, d / 2);
  box(root, M.oak, -w / 2, 0.42, -d / 2, w / 2, 0.45, d / 2);
  for (let i = 0; i < 3; i++) box(root, M.offwhite, -w / 2 + 0.02 + i * 0.59, 0.08, d / 2, -w / 2 + 0.59 + i * 0.59, 0.4, d / 2 + 0.005);
  // TV 본체
  const tvW = 1.45;
  const tvH = 0.83;
  const y0 = 0.53;
  box(root, M.black, -0.2, 0.45, -0.15, 0.2, 0.47, 0.0);
  box(root, M.black, -0.03, 0.47, -0.12, 0.03, y0 + 0.1, -0.08);
  const panel = box(root, M.black, -tvW / 2, y0, -0.12, tvW / 2, y0 + tvH, -0.085);
  const sc = c.screen(root, tvW - 0.02, tvH - 0.02, 384, 216, 0, y0 + tvH / 2, -0.084);
  const bar = box(root, M.charcoal, -0.45, 0.45, 0.02, 0.45, 0.51, 0.1);
  const glow = c.light({ x: 0, y: 0.95, z: 0.5, color: '#a9c4ff', intensity: 1.6, distance: 5, on: false });
  const st = { on: false, ch: 0, snd: null, t: 0 };
  const playSnd = () => {
    if (st.snd) st.snd.stop();
    st.snd = st.on ? c.loop(sc.mesh, TV_SOUNDS[st.ch], { volume: 0.5 }) : null;
  };
  const press = () => {
    if (!st.on) {
      st.on = true;
      st.ch = 0;
    } else if (st.ch < TV_CHANNELS.length - 1) st.ch++;
    else st.on = false;
    sc.set(st.on);
    glow.on = st.on;
    c.sfx(sc.mesh, 'click', { volume: 0.4 });
    playSnd();
    app.toast(st.on ? `📺 ${st.ch + 1}번 채널 · ${TV_CHANNELS[st.ch]}` : 'TV를 껐어요');
  };
  const spec = { label: () => (st.on ? `채널 바꾸기 (${st.ch + 1}/${TV_CHANNELS.length} ${TV_CHANNELS[st.ch]})` : 'TV 켜기'), action: press };
  c.inter(sc.mesh, spec);
  c.inter(panel, spec);
  c.inter(bar, {
    label: () => (st.on ? 'TV 끄기' : 'TV 켜기'),
    action: () => {
      if (st.on) {
        st.on = false;
        sc.set(false);
        glow.on = false;
        playSnd();
        c.sfx(bar, 'click', { volume: 0.4 });
      } else press();
    },
  });
  app.tv = { press, state: st };
  c.update((dt, time) => {
    if (!st.on) return;
    st.t -= dt;
    if (st.t > 0) return;
    st.t = 1 / 20;
    drawChannel(sc.g, 384, 216, st.ch, time, app);
    sc.tex.needsUpdate = true;
    const tint = ['#9cb8ff', '#b9e0ff', '#ffd59e', '#d7a8ff'][st.ch];
    glow.color.set(tint);
  });
  return { w, d };
});

function drawChannel(g, w, h, ch, t, app) {
  if (ch === 0) {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#16324f');
    grd.addColorStop(1, '#0c1a2b');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8eef5';
    g.font = `600 22px ${FONT_UI}`;
    g.fillText('우리집 뉴스', 16, 32);
    g.fillStyle = '#ffb547';
    g.fillRect(16, 40, 60, 3);
    g.fillStyle = '#c9d6e3';
    g.font = `15px ${FONT_UI}`;
    g.fillText(`현재 ${fmtTime(app.time.hour)}`, 16, 66);
    g.fillText(`날씨: ${app.weatherName()}`, 16, 88);
    // 앵커
    g.fillStyle = '#2b4a6b';
    g.fillRect(250, 60, 110, 120);
    g.fillStyle = '#e9c6a5';
    g.beginPath();
    g.arc(305, 96, 20, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1d2a3a';
    g.fillRect(278, 120, 54, 60);
    const mouth = Math.abs(Math.sin(t * 9)) * 4;
    g.fillStyle = '#7a3b3b';
    g.fillRect(299, 104, 12, 1 + mouth);
    g.fillStyle = '#c0473d';
    g.fillRect(0, h - 34, w, 34);
    g.fillStyle = '#fff';
    g.font = `600 16px ${FONT_UI}`;
    const msg = '속보 · 오늘 우리집 VR 개장! 모든 문과 가전을 직접 써 보세요 · 로봇청소기는 거실에서 대기 중 · 고양이 나비가 집 안을 돌아다닙니다 · ';
    const tw = g.measureText(msg).width;
    const x = -((t * 70) % tw);
    g.fillText(msg + msg, x, h - 11);
  } else if (ch === 1) {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#7fb6e6');
    grd.addColorStop(0.55, '#f1d5b0');
    grd.addColorStop(0.56, '#2f6f95');
    grd.addColorStop(1, '#173c57');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff3d0';
    g.beginPath();
    g.arc(280, 100 + Math.sin(t * 0.2) * 4, 22, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 2;
    for (let k = 0; k < 7; k++) {
      g.beginPath();
      const yy = 128 + k * 13;
      for (let x = 0; x <= w; x += 8) g.lineTo(x, yy + Math.sin(x * 0.05 + t * (1.5 + k * 0.2) + k) * (2 + k * 0.6));
      g.stroke();
    }
    g.strokeStyle = '#1d2a33';
    g.lineWidth = 2;
    for (let b = 0; b < 3; b++) {
      const bx = ((t * 30 + b * 90) % (w + 60)) - 30;
      const by = 50 + b * 14 + Math.sin(t * 2 + b) * 6;
      const f = Math.sin(t * 8 + b) * 4;
      g.beginPath();
      g.moveTo(bx - 8, by - f);
      g.lineTo(bx, by);
      g.lineTo(bx + 8, by - f);
      g.stroke();
    }
  } else if (ch === 2) {
    g.fillStyle = '#fff4dc';
    g.fillRect(0, 0, w, h);
    const cols = ['#ff6b6b', '#4ecdc4', '#ffd93d', '#6c5ce7', '#ff9f43'];
    for (let i = 0; i < 5; i++) {
      const x = w / 2 + Math.sin(t * (1 + i * 0.3) + i) * (140 - i * 10);
      const y = h - 40 - Math.abs(Math.sin(t * (2 + i * 0.4) + i)) * (120 - i * 8);
      g.fillStyle = cols[i];
      g.beginPath();
      g.arc(x, y, 18 - i, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#222';
      g.fillRect(x - 6, y - 4, 3, 4);
      g.fillRect(x + 3, y - 4, 3, 4);
    }
    g.fillStyle = '#8bc34a';
    g.fillRect(0, h - 22, w, 22);
    g.fillStyle = '#333';
    g.font = `22px ${FONT_TITLE}`;
    g.fillText('통통 친구들', 14, 32);
  } else {
    g.fillStyle = '#16101f';
    g.fillRect(0, 0, w, h);
    const n = 24;
    for (let i = 0; i < n; i++) {
      const v = (Math.sin(t * 3 + i * 0.7) * 0.5 + 0.5) * (Math.sin(t * 5.3 + i * 1.9) * 0.3 + 0.7);
      const bh = 20 + v * 130;
      const hue = 260 + i * 4;
      g.fillStyle = `hsl(${hue},70%,${55 + v * 15}%)`;
      g.fillRect(20 + i * 14.5, h - 30 - bh, 10, bh);
    }
    g.fillStyle = '#f0e6ff';
    g.font = `600 18px ${FONT_UI}`;
    g.fillText('♪ 지금 재생 중 · 우리집 라디오', 16, 30);
  }
}

def('speaker', '블루투스 스피커', (c) => {
  const { M, root } = c;
  cyl(root, M.charcoal, 0.06, 0.065, 0.2, 0, 0, 0, 20);
  const ledMat = new THREE.MeshBasicMaterial({ color: '#333' });
  const led = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 6, 24), ledMat);
  led.rotation.x = Math.PI / 2;
  led.position.y = 0.201;
  led.userData.dyn = true;
  root.add(led);
  const st = { on: false, h: null };
  c.inter(root, {
    label: () => (st.on ? '음악 끄기' : '음악 틀기'),
    action: () => {
      st.on = !st.on;
      if (st.on) st.h = c.loop(root, 'lofi', { volume: 0.6 });
      else if (st.h) st.h.stop();
      c.app.toast(st.on ? '🎵 스피커에서 음악이 나와요' : '음악을 껐어요');
    },
  });
  c.update((dt, t) => {
    if (st.on) ledMat.color.setHSL((t * 0.1) % 1, 0.7, 0.55);
    else ledMat.color.set('#333');
  });
  return { w: 0.13, d: 0.13, solid: false, noBlob: true };
});

def('floorLamp', '스탠드 조명', (c) => {
  const { M, root } = c;
  cyl(root, M.charcoal, 0.15, 0.16, 0.03, 0, 0, 0, 24);
  cyl(root, M.charcoal, 0.012, 0.012, 1.4, 0, 0.03, 0, 8);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.3, 24, 1, true), c.M.curtain);
  shade.position.y = 1.5;
  root.add(shade);
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#e0dbd0' });
  sph(root, bulbMat, 0.05, 0, 1.45, 0).userData.dyn = true;
  const L = c.light({ x: 0, y: 1.45, z: 0, color: '#ffcf8a', intensity: 3.5, distance: 6, on: false });
  c.inter(root, {
    label: () => (L.on ? '스탠드 끄기' : '스탠드 켜기'),
    action: () => {
      L.on = !L.on;
      bulbMat.color.set(L.on ? '#fff0c8' : '#e0dbd0');
      c.sfx(root, 'switch', { volume: 0.5 });
    },
  });
  return { w: 0.32, d: 0.32 };
});

def('standAC', '스탠드 에어컨', (c) => {
  const { M, root, app } = c;
  box(root, M.white, -0.18, 0, -0.15, 0.18, 1.75, 0.15);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.008, 6, 28), M.lightgray);
    ring.position.set(0, 1.4 - i * 0.24, 0.152);
    root.add(ring);
    const disk = new THREE.Mesh(new THREE.CircleGeometry(0.085, 28), M.offwhite);
    disk.position.set(0, 1.4 - i * 0.24, 0.151);
    root.add(disk);
  }
  const led = new THREE.MeshBasicMaterial({ color: '#2a2d31' });
  box(root, led, -0.06, 0.62, 0.15, 0.06, 0.66, 0.155);
  const st = { on: false, h: null };
  c.inter(root, {
    label: () => (st.on ? '에어컨 끄기' : '에어컨 켜기 (냉방 24°C)'),
    action: () => {
      st.on = !st.on;
      led.color.set(st.on ? '#5ac8ff' : '#2a2d31');
      c.sfx(root, 'beep', { volume: 0.5 });
      if (st.on) st.h = c.loop(root, 'ac', { volume: 0.35 });
      else if (st.h) st.h.stop();
      app.toast(st.on ? '❄️ 시원한 바람이 나와요' : '에어컨을 껐어요');
    },
  });
  return { w: 0.36, d: 0.3 };
});

def('vacuumDock', '로봇청소기 충전대', (c) => {
  const { M, root, app } = c;
  box(root, M.white, -0.16, 0, -0.06, 0.16, 0.11, 0.06);
  box(root, M.charcoal, -0.14, 0, 0.06, 0.14, 0.01, 0.16);
  const led = new THREE.MeshBasicMaterial({ color: '#47d17a' });
  box(root, led, -0.01, 0.08, 0.06, 0.01, 0.09, 0.062);
  c.inter(root, {
    label: () => (app.robot && app.robot.running ? '로봇청소기 멈추기' : '로봇청소기 시작'),
    action: () => app.robot && app.robot.toggle(),
  });
  c.after(() => app.events.emit('dock', root));
  return { w: 0.32, d: 0.12, solid: false };
});

def('plant', '화분', (c) => {
  const { M, root, item } = c;
  const s = item.size || 1;
  const r = rng((item.id || 'p').length * 17 + s * 10);
  cyl(root, M.pot, 0.16 * s, 0.12 * s, 0.32 * s, 0, 0, 0, 16);
  cyl(root, M.soil, 0.15 * s, 0.15 * s, 0.01, 0, 0.31 * s, 0, 16);
  const leaves = new THREE.Group();
  root.add(leaves);
  const tall = s > 0.85;
  if (tall) cyl(leaves, M.brown, 0.015 * s, 0.02 * s, 0.7 * s, 0, 0.3 * s, 0, 6);
  const n = tall ? 14 : 10;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const y = tall ? (0.6 + r() * 0.6) * s : (0.35 + r() * 0.25) * s;
    const rad = (tall ? 0.12 + r() * 0.15 : 0.05 + r() * 0.1) * s;
    const lf = sph(leaves, i % 3 ? M.leaf : M.leaf2, 0.1 * s, Math.cos(a) * rad, y, Math.sin(a) * rad, 1.6, 0.35, 0.8, 8);
    lf.rotation.set(r() - 0.5, a, (r() - 0.5) * 0.8);
  }
  bake(leaves);
  let grow = 1;
  c.inter(root, {
    label: () => (grow < 1.3 ? '물 주기' : '물 주기 (충분히 자랐어요)'),
    action: () => {
      c.sfx(root, 'splash', { volume: 0.5 });
      if (grow < 1.3) grow += 0.06;
      c.app.toast(grow < 1.3 ? '🌱 화분에 물을 줬어요. 조금 자랐어요!' : '🌿 이미 무럭무럭 자랐어요');
    },
  });
  c.update((dt) => {
    const cur = leaves.scale.x;
    if (Math.abs(cur - grow) > 0.001) leaves.scale.setScalar(cur + (grow - cur) * Math.min(1, dt * 2));
  });
  return { w: 0.34 * s, d: 0.34 * s };
});

def('campChair', '캠핑 의자', (c) => {
  const { M, root } = c;
  for (const sx of [-1, 1]) {
    box(root, M.aluminum, sx * 0.25 - 0.012, 0, -0.2, sx * 0.25 + 0.012, 0.4, -0.18).rotation.x = 0.2;
    box(root, M.aluminum, sx * 0.25 - 0.012, 0, 0.18, sx * 0.25 + 0.012, 0.4, 0.2).rotation.x = -0.2;
    box(root, M.aluminum, sx * 0.25 - 0.012, 0.4, -0.25, sx * 0.25 + 0.012, 0.85, -0.23).rotation.x = -0.25;
  }
  box(root, M.green, -0.25, 0.36, -0.2, 0.25, 0.4, 0.2);
  const back = box(root, M.green, -0.25, 0.42, -0.26, 0.25, 0.84, -0.24);
  back.rotation.x = -0.25;
  c.seat([{ x: 0, z: 0.0, y: 0.42, yaw: 0 }]);
  return { w: 0.55, d: 0.5, solid: false };
});

def('sideTable', '사이드 테이블', (c) => {
  const { M, root } = c;
  cyl(root, M.birch, 0.22, 0.22, 0.03, 0, 0.5, 0, 24);
  cyl(root, M.charcoal, 0.015, 0.015, 0.5, 0, 0, 0, 8);
  cyl(root, M.charcoal, 0.14, 0.15, 0.02, 0, 0, 0, 20);
  c.grab('mug', 0.05, 0.53, 0.02);
  return { w: 0.44, d: 0.44 };
});

def('dryingRack', '빨래 건조대', (c) => {
  const { M, root } = c;
  for (const sx of [-1, 1]) {
    box(root, M.lightgray, sx * 0.55 - 0.01, 0, -0.3, sx * 0.55 + 0.01, 1.0, -0.28).rotation.x = 0.3;
    box(root, M.lightgray, sx * 0.55 - 0.01, 0, 0.28, sx * 0.55 + 0.01, 1.0, 0.3).rotation.x = -0.3;
  }
  for (const z of [-0.12, 0, 0.12]) xcyl(root, M.lightgray, 0.006, 1.1, 0, 0.95, z, 6);
  const cols = [M.blue, M.paper, M.pink, M.yellow, M.navy, M.white];
  for (let i = 0; i < 6; i++) {
    const x = -0.45 + i * 0.18;
    const z = [-0.12, 0, 0.12][i % 3];
    box(root, cols[i], x - 0.07, 0.6 + (i % 2) * 0.1, z - 0.003, x + 0.07, 0.95, z + 0.003);
  }
  return { w: 1.15, d: 0.6 };
});

// 서재 · 침실
def('desk', '책상', (c) => {
  const { M, root, item, app } = c;
  const w = item.w || 1.4;
  const d = 0.7;
  box(root, M.birch, -w / 2, 0.7, -d / 2, w / 2, 0.73, d / 2);
  for (const sx of [-1, 1]) {
    box(root, M.white, sx * (w / 2 - 0.04) - 0.02, 0, -d / 2 + 0.03, sx * (w / 2 - 0.04) + 0.02, 0.7, -d / 2 + 0.07);
    box(root, M.white, sx * (w / 2 - 0.04) - 0.02, 0, d / 2 - 0.07, sx * (w / 2 - 0.04) + 0.02, 0.7, d / 2 - 0.03);
    box(root, M.white, sx * (w / 2 - 0.04) - 0.02, 0.0, -d / 2 + 0.03, sx * (w / 2 - 0.04) + 0.02, 0.03, d / 2 - 0.03);
  }
  // 서랍장
  box(root, M.white, w / 2 - 0.47, 0.02, -d / 2 + 0.05, w / 2 - 0.08, 0.68, d / 2 - 0.05);
  c.drawer(root, { x0: w / 2 - 0.465, x1: w / 2 - 0.085, y0: 0.47, y1: 0.67, z: d / 2 - 0.03, depth: 0.5, mat: M.white, label: '책상 서랍' });
  box(root, M.white, w / 2 - 0.465, 0.04, d / 2 - 0.05, w / 2 - 0.085, 0.45, d / 2 - 0.03);
  if (item.pc) {
    // 모니터
    box(root, M.charcoal, -0.12, 0.73, -0.25, 0.12, 0.745, -0.1);
    box(root, M.charcoal, -0.02, 0.745, -0.2, 0.02, 0.95, -0.17);
    const mon = box(root, M.black, -0.33, 0.9, -0.17, 0.33, 1.28, -0.14);
    const sc = c.screen(root, 0.64, 0.36, 320, 180, 0, 1.09, -0.139);
    box(root, M.charcoal, -0.24, 0.73, 0.0, 0.24, 0.745, 0.15);
    for (let r2 = 0; r2 < 4; r2++) box(root, M.gray, -0.22, 0.745, 0.012 + r2 * 0.034, 0.22, 0.75, 0.04 + r2 * 0.034);
    sph(root, M.charcoal, 0.03, 0.36, 0.745, 0.08, 1, 0.5, 1.5);
    // 본체
    box(root, M.black, -w / 2 + 0.1, 0, -0.2, -w / 2 + 0.32, 0.46, 0.25);
    const rgb = new THREE.MeshBasicMaterial({ color: '#222' });
    box(root, rgb, -w / 2 + 0.1, 0.05, 0.25, -w / 2 + 0.105, 0.42, 0.252).userData.dyn = true;
    const glow = c.light({ x: 0, y: 1.1, z: 0.3, color: '#bcd0ff', intensity: 0.8, distance: 3, on: false });
    const st = { on: false, t: 0 };
    const spec = {
      label: () => (st.on ? '컴퓨터 끄기' : '컴퓨터 켜기'),
      action: () => {
        st.on = !st.on;
        sc.set(st.on);
        glow.on = st.on;
        c.sfx(mon, st.on ? 'boot' : 'click', { volume: 0.5 });
      },
    };
    c.inter(mon, spec);
    c.inter(sc.mesh, spec);
    c.update((dt, t) => {
      rgb.color.setHSL(st.on ? (t * 0.15) % 1 : 0, st.on ? 0.8 : 0, st.on ? 0.55 : 0.1);
      if (!st.on) return;
      st.t -= dt;
      if (st.t > 0) return;
      st.t = 0.5;
      drawDesktop(sc.g, 320, 180, t, app);
      sc.tex.needsUpdate = true;
    });
    c.grab('mug', 0.5, 0.73, -0.1);
  } else {
    // 탁상 스탠드 + 책
    cyl(root, M.charcoal, 0.07, 0.08, 0.02, -w / 2 + 0.15, 0.73, -0.2, 16);
    box(root, M.charcoal, -w / 2 + 0.145, 0.75, -0.205, -w / 2 + 0.155, 1.1, -0.195);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.1, 16, 1, true), M.charcoal);
    head.position.set(-w / 2 + 0.2, 1.08, -0.15);
    head.rotation.z = -0.6;
    root.add(head);
    const L = c.light({ x: -w / 2 + 0.22, y: 1.0, z: -0.12, color: '#ffe0b0', intensity: 1.5, distance: 3, on: false });
    c.inter(head, {
      label: () => (L.on ? '책상 스탠드 끄기' : '책상 스탠드 켜기'),
      action: () => {
        L.on = !L.on;
        c.sfx(head, 'switch', { volume: 0.4 });
      },
    });
    box(root, M.blue, 0.1, 0.73, -0.25, 0.4, 0.76, -0.05);
    box(root, M.paper, 0.12, 0.76, -0.24, 0.38, 0.78, -0.06);
    c.grab('book', -0.05, 0.73, 0.05, 0.4);
  }
  return { w, d };
});

function drawDesktop(g, w, h, t, app) {
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, '#2c5364');
  grd.addColorStop(1, '#203a43');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#10151a';
  roundRect(g, 20, 16, 200, 128, 6);
  g.fill();
  g.fillStyle = '#2a3440';
  g.fillRect(20, 16, 200, 14);
  for (const [i, col] of ['#ff5f56', '#ffbd2e', '#27c93f'].entries()) {
    g.fillStyle = col;
    g.beginPath();
    g.arc(30 + i * 10, 23, 3, 0, Math.PI * 2);
    g.fill();
  }
  const lines = ['const home = build("우리집");', 'home.rooms = 3;', 'home.enterVR();', 'for (const room of home)', '  room.lights.on();', '// 오늘도 수고했어요', 'cat.feed("나비");', 'robot.clean();'];
  g.font = `10px monospace`;
  const off = Math.floor(t * 2) % lines.length;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = ['#8be9fd', '#f8f8f2', '#50fa7b', '#ff79c6'][(i + off) % 4];
    g.fillText(lines[(i + off) % lines.length], 28, 44 + i * 12);
  }
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, h - 20, w, 20);
  g.fillStyle = '#fff';
  g.font = `11px ${FONT_UI}`;
  g.fillText(fmtTime(app.time.hour), w - 70, h - 6);
}

def('officeChair', '사무용 의자', (c) => {
  const { M, root } = c;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = box(root, M.charcoal, -0.015, 0.04, 0, 0.015, 0.06, 0.28);
    leg.rotation.y = a;
    leg.position.set(Math.sin(a) * 0.14, 0.05, Math.cos(a) * 0.14);
    sph(root, M.black, 0.025, Math.sin(a) * 0.27, 0.025, Math.cos(a) * 0.27);
  }
  cyl(root, M.chrome, 0.025, 0.025, 0.36, 0, 0.06, 0, 10);
  box(root, M.charcoal, -0.24, 0.42, -0.22, 0.24, 0.5, 0.22);
  box(root, M.charcoal, -0.02, 0.5, -0.24, 0.02, 0.62, -0.2);
  const back = box(root, M.charcoal, -0.22, 0.6, -0.27, 0.22, 1.05, -0.22);
  back.rotation.x = -0.08;
  c.seat([{ x: 0, z: 0.03, y: 0.5, yaw: 0 }]);
  return { w: 0.56, d: 0.56, solid: false };
});

def('bookshelf', '책장', (c) => {
  const { M, root } = c;
  const w = 1.0;
  const d = 0.35;
  const h = 2.0;
  box(root, M.walnut, -w / 2, 0, -d / 2, -w / 2 + 0.025, h, d / 2);
  box(root, M.walnut, w / 2 - 0.025, 0, -d / 2, w / 2, h, d / 2);
  box(root, M.walnut, -w / 2, h - 0.025, -d / 2, w / 2, h, d / 2);
  box(root, M.walnut, -w / 2, 0, -d / 2, w / 2, 0.08, d / 2);
  box(root, M.walnut, -w / 2, 0, -d / 2, w / 2, h, -d / 2 + 0.01);
  const shelves = [0.08, 0.46, 0.84, 1.22, 1.6];
  const r = rng(12);
  const cols = [M.red, M.blue, M.navy, M.green, M.yellow, M.paper, M.brown, M.charcoal, M.orange, M.pink];
  shelves.forEach((y, si) => {
    if (si > 0) box(root, M.walnut, -w / 2 + 0.02, y - 0.02, -d / 2, w / 2 - 0.02, y, d / 2);
    let x = -w / 2 + 0.03;
    const end = si === 2 ? 0.1 : w / 2 - 0.04;
    while (x < end) {
      const bw = 0.022 + r() * 0.03;
      const bh = 0.18 + r() * 0.12;
      if (r() < 0.12) {
        x += 0.05;
        continue;
      }
      box(root, cols[(r() * cols.length) | 0], x, y, -d / 2 + 0.04, x + bw, y + bh, d / 2 - 0.04);
      x += bw + 0.002;
    }
  });
  sph(root, M.leaf, 0.07, 0.3, 0.92, 0.0, 1.2, 0.8, 1.2);
  cyl(root, M.pot2, 0.05, 0.04, 0.08, 0.3, 0.84, 0.0, 12);
  c.grab('book', 0.2, 0.86, 0.06, 0.1);
  c.grab('book2', 0.36, 0.86, 0.06, -0.2);
  c.grab('ball', -0.3, 1.62, 0.0);
  return { w, d };
});

const NOTE_NAMES = ['도', '도#', '레', '레#', '미', '파', '파#', '솔', '솔#', '라', '라#', '시'];
def('piano', '디지털 피아노', (c) => {
  const { M, root, app } = c;
  const W = 1.0;
  box(root, M.black, -W / 2, 0.66, -0.2, W / 2, 0.72, 0.17);
  box(root, M.black, -W / 2, 0.72, -0.2, W / 2, 0.82, -0.08);
  box(root, M.black, -W / 2, 0, -0.18, -W / 2 + 0.03, 0.66, 0.12);
  box(root, M.black, W / 2 - 0.03, 0, -0.18, W / 2, 0.66, 0.12);
  box(root, M.black, -W / 2, 0.05, -0.2, W / 2, 0.6, -0.18);
  box(root, M.black, -0.42, 0.82, -0.18, 0.42, 1.08, -0.15).rotation.x = -0.15;
  box(root, M.paper, -0.2, 0.86, -0.15, 0.08, 1.06, -0.14).rotation.x = -0.15;
  box(root, M.black, -W / 2 + 0.03, 0.72, 0.0, -0.42, 0.75, 0.17);
  box(root, M.black, 0.42, 0.72, 0.0, W / 2 - 0.03, 0.75, 0.17);
  const kw = 0.06;
  const x0 = -0.42;
  const keys = [];
  const whiteSteps = [0, 2, 4, 5, 7, 9, 11];
  const press = (k, quiet) => {
    app.audio.note(k.freq, root);
    k.t = 0.18;
    if (!quiet) app.toast(`🎹 ${k.name}`, 600);
  };
  for (let o = 0; o < 2; o++)
    for (let i = 0; i < 7; i++) {
      const midi = 60 + o * 12 + whiteSteps[i];
      const k = box(root, M.ceramic, x0 + (o * 7 + i) * kw + 0.002, 0.72, -0.05, x0 + (o * 7 + i + 1) * kw - 0.002, 0.745, 0.16);
      const info = { mesh: k, freq: 440 * 2 ** ((midi - 69) / 12), name: NOTE_NAMES[whiteSteps[i]] + (o ? ' (높은)' : ''), t: 0, base: k.position.y, midi };
      keys.push(info);
      c.inter(k, { kind: 'key', label: `건반 ${info.name}`, action: () => press(info) });
    }
  const blacks = [1, 3, 6, 8, 10];
  const bx = [1, 2, 4, 5, 6];
  for (let o = 0; o < 2; o++)
    blacks.forEach((step, j) => {
      const midi = 60 + o * 12 + step;
      const cx = x0 + (o * 7 + bx[j]) * kw;
      const k = box(root, M.black, cx - 0.017, 0.745, -0.05, cx + 0.017, 0.772, 0.08);
      const info = { mesh: k, freq: 440 * 2 ** ((midi - 69) / 12), name: NOTE_NAMES[step] + (o ? ' (높은)' : ''), t: 0, base: k.position.y, midi };
      keys.push(info);
      c.inter(k, { kind: 'key', label: `건반 ${info.name}`, action: () => press(info) });
    });
  // 자동 연주 (작은 별)
  const song = [60, 60, 67, 67, 69, 69, 67, 0, 65, 65, 64, 64, 62, 62, 60, 0, 67, 67, 65, 65, 64, 64, 62, 0, 67, 67, 65, 65, 64, 64, 62, 0, 60, 60, 67, 67, 69, 69, 67, 0, 65, 65, 64, 64, 62, 62, 60];
  const auto = { i: -1, t: 0 };
  const btnMat = new THREE.MeshBasicMaterial({ color: '#c0473d' });
  const btn = box(root, btnMat, -W / 2 + 0.06, 0.75, 0.05, -W / 2 + 0.1, 0.758, 0.09);
  c.inter(btn, {
    label: () => (auto.i >= 0 ? '자동 연주 멈추기' : '자동 연주 (작은 별)'),
    action: () => {
      auto.i = auto.i >= 0 ? -1 : 0;
      auto.t = 0;
    },
  });
  c.update((dt) => {
    for (const k of keys) {
      if (k.t > 0) {
        k.t -= dt;
        k.mesh.position.y = k.base - (k.t > 0 ? 0.008 : 0);
      }
    }
    if (auto.i >= 0) {
      btnMat.color.set('#47d17a');
      auto.t -= dt;
      if (auto.t <= 0) {
        const m = song[auto.i];
        if (m) {
          const k = keys.find((kk) => kk.midi === m);
          if (k) press(k, true);
        }
        auto.i++;
        auto.t = 0.42;
        if (auto.i >= song.length) auto.i = -1;
      }
    } else btnMat.color.set('#c0473d');
  });
  return { w: W, d: 0.38 };
});

def('bench', '피아노 의자', (c) => {
  const { M, root } = c;
  box(root, M.black, -0.3, 0.44, -0.16, 0.3, 0.5, 0.16);
  for (const sx of [-1, 1]) box(root, M.black, sx * 0.26 - 0.02, 0, -0.14, sx * 0.26 + 0.02, 0.44, 0.14);
  c.seat([{ x: 0, z: 0.0, y: 0.5, yaw: 0, any: true }]);
  return { w: 0.6, d: 0.32, solid: false };
});

// 욕실
def('bathtub', '욕조', (c) => {
  const { M, root, app } = c;
  const L = 1.68;
  const d = 0.75;
  const h = 0.55;
  box(root, M.ceramic, -L / 2, 0, -d / 2, L / 2, 0.1, d / 2);
  box(root, M.ceramic, -L / 2, 0, d / 2 - 0.08, L / 2, h, d / 2);
  box(root, M.ceramic, -L / 2, 0, -d / 2, L / 2, h, -d / 2 + 0.08);
  box(root, M.ceramic, -L / 2, 0, -d / 2, -L / 2 + 0.1, h, d / 2);
  box(root, M.ceramic, L / 2 - 0.1, 0, -d / 2, L / 2, h, d / 2);
  box(root, M.white, -L / 2 + 0.1, 0.1, -d / 2 + 0.08, L / 2 - 0.1, 0.12, d / 2 - 0.08);
  const water = box(root, M.water, -L / 2 + 0.1, 0.12, -d / 2 + 0.08, L / 2 - 0.1, 0.13, d / 2 - 0.08);
  water.userData.dyn = true;
  water.raycast = noRaycast;
  water.visible = false;
  // 수전 + 샤워기
  const tap = new THREE.Group();
  root.add(tap);
  cyl(tap, M.chrome, 0.03, 0.03, 0.08, L / 2 - 0.25, 0.6, -d / 2 + 0.03, 12).rotation.x = Math.PI / 2;
  box(tap, M.chrome, L / 2 - 0.27, 0.62, -d / 2 + 0.02, L / 2 - 0.23, 0.64, -d / 2 + 0.17);
  const stream = c.water(root, L / 2 - 0.25, 0.62, 0.12, -d / 2 + 0.16, 0.008);
  const run = { on: false, fill: 0, h: null };
  c.inter(tap, {
    label: () => (run.on ? '욕조 물 잠그기' : run.fill > 0.95 ? '욕조가 가득 찼어요' : '욕조에 물 받기'),
    action: () => {
      run.on = !run.on;
      stream.visible = run.on;
      if (run.on) run.h = c.loop(tap, 'water', { volume: 0.6 });
      else if (run.h) run.h.stop();
    },
  });
  const plug = cyl(root, M.chrome, 0.025, 0.025, 0.01, -L / 2 + 0.2, 0.12, 0, 12);
  c.inter(plug, {
    label: '욕조 물 빼기',
    action: () => {
      run.drain = true;
      c.sfx(plug, 'drain', { volume: 0.6 });
    },
  });
  c.update((dt) => {
    if (run.on) {
      run.fill = Math.min(1, run.fill + dt / 20);
      if (run.fill >= 1) {
        run.on = false;
        stream.visible = false;
        if (run.h) run.h.stop();
        app.toast('🛁 욕조에 물이 가득 찼어요');
      }
    }
    if (run.drain) {
      run.fill = Math.max(0, run.fill - dt / 8);
      if (run.fill <= 0) run.drain = false;
    }
    water.visible = run.fill > 0.01;
    water.scale.y = 1;
    water.position.y = 0.12 + run.fill * 0.36;
  });
  // 벽 샤워기
  box(root, M.chrome, L / 2 - 0.42, 0.7, -d / 2 + 0.005, L / 2 - 0.4, 1.95, -d / 2 + 0.025);
  const head = new THREE.Group();
  root.add(head);
  cyl(head, M.chrome, 0.07, 0.05, 0.03, L / 2 - 0.41, 1.95, -d / 2 + 0.12, 16);
  box(head, M.chrome, L / 2 - 0.42, 1.97, -d / 2 + 0.01, L / 2 - 0.4, 1.99, -d / 2 + 0.12);
  const shower = makeShower(c, root, L / 2 - 0.41, 1.95, -d / 2 + 0.12, 0.12);
  c.inter(head, { label: () => (shower.on ? '샤워기 끄기' : '샤워기 켜기'), action: () => shower.toggle(head) });
  c.grab('duck', -0.5, h, d / 2 - 0.04);
  return { w: L, d };
});

// 샤워 물줄기 (점 입자)
function makeShower(c, parent, x, y, z, spread) {
  const n = 240;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * spread;
    pos[i * 3] = x + Math.cos(a) * r;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z + Math.sin(a) * r;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uTop: { value: y }, uSize: { value: 3.0 }, uC: { value: new THREE.Vector2(x, z) } },
    vertexShader: `attribute float seed; uniform float uTime; uniform float uTop; uniform float uSize; uniform vec2 uC;
      void main(){ vec3 p = position; float f = fract(seed + uTime*1.6); p.y = uTop - f*(uTop-0.08); p.x += (p.x-uC.x)*f*0.6; p.z += (p.z-uC.y)*f*0.6;
      vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = uSize*(2.0/-mv.z); }`,
    fragmentShader: `void main(){ vec2 d = gl_PointCoord-0.5; if(dot(d,d)>0.25) discard; gl_FragColor = vec4(0.8,0.9,1.0,0.7); }`,
    transparent: true,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.visible = false;
  pts.frustumCulled = false;
  pts.raycast = noRaycast;
  pts.userData.dyn = true;
  parent.add(pts);
  const st = {
    on: false,
    h: null,
    toggle(obj) {
      st.on = !st.on;
      pts.visible = st.on;
      if (st.on) st.h = c.loop(obj, 'shower', { volume: 0.6 });
      else if (st.h) st.h.stop();
    },
  };
  c.update((dt, t) => {
    if (st.on) mat.uniforms.uTime.value = t;
  });
  return st;
}

def('toilet', '변기', (c) => {
  const { M, root } = c;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.3, 20), M.ceramic);
  base.scale.z = 1.3;
  base.position.set(0, 0.15, 0.05);
  root.add(base);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.14, 0.12, 24), M.ceramic);
  bowl.scale.z = 1.25;
  bowl.position.set(0, 0.34, 0.08);
  root.add(bowl);
  box(root, M.ceramic, -0.2, 0.3, -0.35, 0.2, 0.78, -0.17);
  const btn = cyl(root, M.chrome, 0.025, 0.025, 0.012, 0, 0.78, -0.26, 16);
  const seat = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 28), M.ceramic);
  seat.rotation.x = Math.PI / 2;
  seat.scale.y = 1.25;
  seat.position.set(0, 0.41, 0.08);
  root.add(seat);
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.42, -0.14);
  root.add(lidPivot);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 24), M.ceramic);
  lid.scale.z = 1.22;
  lid.position.set(0, 0.012, 0.22);
  lidPivot.add(lid);
  const tog = c.toggle((v) => (lidPivot.rotation.x = -1.65 * v), { speed: 2.5 });
  c.inter(lidPivot, {
    label: () => (tog.on ? '변기 뚜껑 닫기' : '변기 뚜껑 열기'),
    action: () => {
      tog.flip();
      c.sfx(lidPivot, 'cabinetClose', { volume: 0.4 });
    },
  });
  let busy = 0;
  c.inter(btn, {
    label: '물 내리기',
    action: () => {
      if (busy > 0) return;
      busy = 3;
      c.sfx(btn, 'flush', { volume: 0.8 });
    },
  });
  c.update((dt) => (busy -= dt));
  return { w: 0.42, d: 0.7 };
});

def('vanity', '세면대', (c) => {
  const { M, root, item, app } = c;
  const w = item.w || 0.8;
  box(root, M.oak, -w / 2, 0.15, -0.24, w / 2, 0.82, 0.24);
  box(root, M.counter, -w / 2, 0.82, -0.24, w / 2, 0.85, 0.25);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.12, 24), M.ceramic);
  basin.scale.z = 0.8;
  basin.position.set(0, 0.91, 0.02);
  root.add(basin);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), M.lightgray);
  inner.rotation.x = -Math.PI / 2;
  inner.scale.y = 0.8;
  inner.position.set(0, 0.968, 0.02);
  root.add(inner);
  const tap = new THREE.Group();
  root.add(tap);
  cyl(tap, M.chrome, 0.015, 0.018, 0.18, 0, 0.85, -0.18, 12);
  box(tap, M.chrome, -0.008, 1.0, -0.18, 0.008, 1.015, -0.08);
  box(tap, M.chrome, -0.01, 1.04, -0.2, 0.01, 1.05, -0.12);
  const stream = c.water(root, 0, 1.0, 0.95, -0.085);
  c.faucetToggle(tap, stream, '세면대 물');
  c.hingeDoor(root, { x0: -w / 2 + 0.01, x1: -0.005, y0: 0.17, y1: 0.8, z0: 0.24, z1: 0.26, hinge: 'left', mat: M.oak, label: '수납장' });
  box(root, M.oak, 0.005, 0.17, 0.24, w / 2 - 0.01, 0.8, 0.26);
  // 거울
  if (item.mirror !== false && app.settings.mirrors) {
    const mirror = new Reflector(new THREE.PlaneGeometry(w - 0.04, 0.78), {
      textureWidth: 512,
      textureHeight: 512,
      color: 0xb8bfc4,
      multisample: 0,
    });
    mirror.position.set(0, 1.5, -0.235);
    mirror.raycast = noRaycast;
    root.add(mirror);
    box(root, M.chrome, -w / 2, 1.09, -0.24, w / 2, 1.91, -0.238);
  } else {
    box(root, M.mirror, -w / 2 + 0.02, 1.1, -0.24, w / 2 - 0.02, 1.9, -0.225);
  }
  cyl(root, M.blue, 0.03, 0.025, 0.09, -w / 2 + 0.1, 0.85, -0.15, 10);
  box(root, M.green, -w / 2 + 0.085, 0.94, -0.16, -w / 2 + 0.09, 1.02, -0.155);
  c.grab('soap', w / 2 - 0.1, 0.85, -0.1);
  return { w, d: 0.5 };
});

def('showerBooth', '샤워 부스', (c) => {
  const { M, root } = c;
  const s = 0.42;
  box(root, M.ceramic, -s, 0, -s, s, 0.05, s);
  cyl(root, M.charcoal, 0.04, 0.04, 0.005, 0, 0.05, 0, 12);
  const glassF = new THREE.Mesh(new THREE.PlaneGeometry(s, 1.95), M.showerGlass);
  glassF.position.set(-s / 2, 1.025, s);
  root.add(glassF);
  const glassS = new THREE.Mesh(new THREE.PlaneGeometry(2 * s, 1.95), M.showerGlass);
  glassS.rotation.y = Math.PI / 2;
  glassS.position.set(-s, 1.025, 0);
  root.add(glassS);
  box(root, M.chrome, -s - 0.01, 0.05, s - 0.01, -s + 0.01, 2.0, s + 0.01);
  box(root, M.chrome, -s, 1.99, -s, -s + 0.02, 2.01, s);
  box(root, M.chrome, -s, 1.99, s - 0.01, s, 2.01, s + 0.01);
  // 미닫이 유리문
  const door = new THREE.Group();
  root.add(door);
  const dg = new THREE.Mesh(new THREE.PlaneGeometry(s, 1.9), M.showerGlass);
  dg.position.set(s / 2, 1.0, s + 0.025);
  door.add(dg);
  box(door, M.chrome, 0.02, 0.9, s + 0.025, 0.035, 1.2, s + 0.05);
  const tog = c.toggle((v) => (door.position.x = -v * (s - 0.02)), { speed: 1.8 });
  c.inter(door, {
    label: () => (tog.on ? '샤워부스 문 닫기' : '샤워부스 문 열기'),
    action: () => {
      tog.flip();
      c.sfx(door, 'slide', { volume: 0.5 });
    },
  });
  // 레인 샤워 + 수전
  box(root, M.chrome, -0.01, 2.05, -s, 0.01, 2.07, -0.05);
  cyl(root, M.chrome, 0.13, 0.13, 0.015, 0, 2.03, 0.0, 24);
  const mixer = new THREE.Group();
  root.add(mixer);
  box(mixer, M.chrome, 0.15, 1.0, -s, 0.3, 1.15, -s + 0.03);
  box(mixer, M.chrome, 0.21, 1.06, -s + 0.03, 0.24, 1.09, -s + 0.1);
  const shower = makeShower(c, root, 0, 2.02, 0, 0.12);
  c.inter(mixer, { label: () => (shower.on ? '샤워 끄기' : '샤워 켜기'), action: () => shower.toggle(mixer) });
  return { w: 0.84, d: 0.84, solid: false };
});

// 다용도실
function laundry(name, isDryer) {
  return (c) => {
    const { M, root, app } = c;
    const body = new THREE.Group();
    root.add(body);
    const shell = isDryer ? M.offwhite : M.white;
    box(body, shell, -0.3, 0.02, -0.33, 0.3, 0.85, 0.33);
    box(body, M.lightgray, -0.29, 0.73, 0.33, 0.29, 0.83, 0.335);
    const disp = new THREE.MeshBasicMaterial({ color: '#202428' });
    box(body, disp, 0.05, 0.75, 0.335, 0.2, 0.81, 0.337);
    cyl(body, M.chrome, 0.025, 0.025, 0.02, -0.18, 0.76, 0.34, 16).rotation.x = Math.PI / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 10, 32), M.chrome);
    ring.position.set(0, 0.4, 0.34);
    body.add(ring);
    const lc = liveCanvas(128, 128);
    const g = lc.g;
    g.fillStyle = '#2a2f36';
    g.fillRect(0, 0, 128, 128);
    const r = rng(isDryer ? 3 : 2);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = ['#4b74b5', '#e3a3a8', '#e7c24a', '#f5f2ea', '#5d9a5a'][i % 5];
      g.beginPath();
      g.ellipse(64 + (r() - 0.5) * 80, 64 + (r() - 0.5) * 80, 14 + r() * 12, 8 + r() * 6, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    lc.tex.needsUpdate = true;
    const drum = new THREE.Mesh(new THREE.CircleGeometry(0.15, 28), new THREE.MeshLambertMaterial({ map: lc.tex }));
    drum.position.set(0, 0.4, 0.331);
    drum.userData.dyn = true;
    body.add(drum);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.155, 28), c.M.glass);
    glass.position.set(0, 0.4, 0.345);
    body.add(glass);
    bake(body);
    const st = { on: false, t: 0, h: null };
    const stop = (done) => {
      st.on = false;
      disp.color.set('#202428');
      if (st.h) st.h.stop();
      if (done) {
        c.sfx(body, 'melody', { volume: 0.6 });
        app.toast(isDryer ? '👕 건조가 끝났어요' : '🧺 빨래가 끝났어요');
      }
    };
    c.inter(body, {
      label: () => (st.on ? `${name} 멈추기 (${Math.ceil(st.t)}초 남음)` : `${name} 시작`),
      action: () => {
        if (st.on) return stop(false);
        st.on = true;
        st.t = 40;
        disp.color.set(isDryer ? '#ffb547' : '#5ac8ff');
        c.sfx(body, 'beep', { volume: 0.5 });
        st.h = c.loop(body, isDryer ? 'dryer' : 'washer', { volume: 0.5 });
      },
    });
    c.update((dt, t) => {
      if (!st.on) {
        body.position.set(0, 0, 0);
        return;
      }
      st.t -= dt;
      drum.rotation.z -= dt * (isDryer ? 3 : 5);
      body.position.x = Math.sin(t * 40) * 0.002;
      if (st.t <= 0) stop(true);
    });
    return { w: 0.6, d: 0.66 };
  };
}
def('washer', '드럼 세탁기', laundry('세탁', false));
def('dryer', '건조기', laundry('건조', true));

def('utilitySink', '다용도 개수대', (c) => {
  const { M, root } = c;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(root, M.lightgray, sx * 0.26 - 0.02, 0, sz * 0.24 - 0.02, sx * 0.26 + 0.02, 0.6, sz * 0.24 + 0.02);
  box(root, M.lightgray, -0.3, 0.6, -0.28, 0.3, 0.62, 0.28);
  box(root, M.lightgray, -0.3, 0.62, -0.28, 0.3, 0.85, -0.25);
  box(root, M.lightgray, -0.3, 0.62, 0.25, 0.3, 0.85, 0.28);
  box(root, M.lightgray, -0.3, 0.62, -0.28, -0.27, 0.85, 0.28);
  box(root, M.lightgray, 0.27, 0.62, -0.28, 0.3, 0.85, 0.28);
  const tap = new THREE.Group();
  root.add(tap);
  box(tap, M.chrome, -0.01, 0.85, -0.29, 0.01, 1.05, -0.27);
  box(tap, M.chrome, -0.01, 1.03, -0.29, 0.01, 1.05, -0.12);
  const stream = c.water(root, 0, 1.03, 0.62, -0.13);
  c.faucetToggle(tap, stream, '개수대 물');
  cyl(root, M.blue, 0.12, 0.1, 0.25, 0.0, 0.62, 0.05, 16);
  return { w: 0.6, d: 0.56 };
});

def('boiler', '보일러', (c) => {
  const { M, root, app } = c;
  box(root, M.white, -0.21, -0.32, 0, 0.21, 0.32, 0.26);
  const led = new THREE.MeshBasicMaterial({ color: '#202428' });
  box(root, led, -0.08, 0.1, 0.26, 0.08, 0.18, 0.262);
  for (const x of [-0.12, -0.04, 0.04, 0.12]) cyl(root, M.chrome, 0.012, 0.012, 0.35, x, -0.67, 0.1, 8);
  const st = { on: false, h: null };
  c.inter(root, {
    label: () => (st.on ? '난방 끄기' : '난방 켜기 (바닥 난방)'),
    action: () => {
      st.on = !st.on;
      led.color.set(st.on ? '#ff8a3d' : '#202428');
      c.sfx(root, st.on ? 'ignite' : 'click', { volume: 0.6 });
      if (st.on) st.h = c.loop(root, 'hum', { volume: 0.15 });
      else if (st.h) st.h.stop();
      app.toast(st.on ? '🔥 바닥 난방을 켰어요. 따뜻해져요!' : '난방을 껐어요');
    },
  });
  return { w: 0.42, d: 0.26, wall: true, fixed: true };
});

def('elevator', '엘리베이터', (c) => {
  const { M, root, app } = c;
  // 문틀
  box(root, M.steel, -0.56, 0, 0, -0.45, 2.25, 0.04);
  box(root, M.steel, 0.45, 0, 0, 0.56, 2.25, 0.04);
  box(root, M.steel, -0.56, 2.1, 0, 0.56, 2.25, 0.04);
  // 칸 내부
  const car = new THREE.Group();
  root.add(car);
  box(car, M.steel, -0.7, 0, -1.7, 0.7, 0.02, -0.15);
  box(car, M.steel, -0.72, 0, -1.7, -0.7, 2.3, -0.15);
  box(car, M.steel, 0.7, 0, -1.7, 0.72, 2.3, -0.15);
  box(car, M.mirror, -0.7, 0, -1.72, 0.7, 2.3, -1.7);
  box(car, M.white, -0.7, 2.3, -1.7, 0.7, 2.32, -0.15);
  const carGlow = new THREE.MeshBasicMaterial({ color: '#f5f2ea' });
  box(car, carGlow, -0.4, 2.29, -1.3, 0.4, 2.3, -0.5);
  xcyl(car, M.chrome, 0.015, 1.3, 0, 0.9, -1.62);
  // 문짝
  const doors = [];
  for (const s of [-1, 1]) {
    const d = new THREE.Group();
    root.add(d);
    box(d, M.steel, s > 0 ? 0 : -0.45, 0, -0.06, s > 0 ? 0.45 : 0, 2.1, -0.03);
    doors.push({ g: d, s });
  }
  // 층 표시
  const sc = c.screen(root, 0.3, 0.12, 128, 52, 0, 2.38, 0.02);
  sc.set(true);
  const drawFloor = (txt) => {
    sc.g.fillStyle = '#0b0d10';
    sc.g.fillRect(0, 0, 128, 52);
    sc.g.fillStyle = '#ff5a4a';
    sc.g.font = `bold 34px monospace`;
    sc.g.textAlign = 'center';
    sc.g.fillText(txt, 64, 38);
    sc.tex.needsUpdate = true;
  };
  drawFloor('1');
  // 호출 버튼
  box(root, M.steel, 0.7, 1.0, 0, 0.82, 1.22, 0.015);
  const btnMat = new THREE.MeshBasicMaterial({ color: '#e8e8e8' });
  const btn = cyl(root, btnMat, 0.022, 0.022, 0.01, 0.76, 1.11, 0.02, 16);
  btn.rotation.x = Math.PI / 2;
  const st = { phase: 'idle', t: 0, floor: 1 };
  const tog = c.toggle((v) => doors.forEach((d) => (d.g.position.x = d.s * v * 0.44)), { speed: 1.2 });
  c.inter(btn, {
    label: () => (st.phase === 'idle' ? '엘리베이터 부르기' : st.phase === 'coming' ? `엘리베이터 오는 중… ${st.floor}층` : '엘리베이터 도착'),
    action: () => {
      if (st.phase !== 'idle') return;
      st.phase = 'coming';
      st.t = 0;
      st.floor = 1;
      btnMat.color.set('#ffb547');
      c.sfx(btn, 'beep', { volume: 0.5 });
    },
  });
  c.update((dt) => {
    if (st.phase === 'coming') {
      st.t += dt;
      const f = Math.min(13, 1 + Math.floor(st.t * 3));
      if (f !== st.floor) {
        st.floor = f;
        drawFloor(String(f));
      }
      if (f >= 13) {
        st.phase = 'open';
        st.t = 0;
        tog.set(true);
        btnMat.color.set('#e8e8e8');
        c.sfx(btn, 'ding', { volume: 0.7 });
        app.toast('🛗 띵동! 엘리베이터가 도착했어요 (13층)');
      }
    } else if (st.phase === 'open') {
      st.t += dt;
      if (st.t > 7) {
        tog.set(false);
        st.phase = 'closing';
        st.t = 0;
      }
    } else if (st.phase === 'closing') {
      st.t += dt;
      if (st.t > 1.2) st.phase = 'idle';
    }
  });
  c.after(() => {
    const p = root.position;
    app.collision.set('elevator', [{ x0: p.x - 0.5, x1: p.x + 0.5, z0: p.z - 0.3, z1: p.z + 0.02 }]);
  });
  return { w: 1.1, d: 0.1, wall: true, fixed: true };
});

// 안방 · 드레스룸
def('bed', '침대', (c) => {
  const { M, root, item } = c;
  const queen = item.size === 'queen';
  const w = queen ? 1.6 : 1.1;
  const L = queen ? 2.05 : 2.0;
  const d = L + 0.08;
  const z0 = -d / 2;
  box(root, M.walnut, -w / 2 - 0.03, 0, z0, w / 2 + 0.03, queen ? 1.1 : 0.95, z0 + 0.08);
  box(root, M.walnut, -w / 2 - 0.02, 0.06, z0 + 0.08, w / 2 + 0.02, 0.3, d / 2);
  box(root, M.bedding, -w / 2 + 0.01, 0.3, z0 + 0.09, w / 2 - 0.01, 0.52, d / 2 - 0.01);
  const blanket = queen ? M.blanket : M.blanket2;
  box(root, blanket, -w / 2 - 0.02, 0.5, z0 + 0.6, w / 2 + 0.02, 0.58, d / 2 + 0.02);
  box(root, blanket, -w / 2 - 0.025, 0.3, d / 2 - 0.01, w / 2 + 0.025, 0.58, d / 2 + 0.025);
  for (const sx of [-1, 1]) box(root, blanket, sx * (w / 2 + 0.005) - 0.015, 0.32, z0 + 0.6, sx * (w / 2 + 0.005) + 0.015, 0.58, d / 2 + 0.02);
  box(root, M.bedding, -w / 2, 0.52, z0 + 0.6, w / 2, 0.6, z0 + 0.85);
  if (queen) {
    c.grab('pillow', -0.38, 0.54, z0 + 0.3);
    c.grab('pillow', 0.38, 0.54, z0 + 0.3);
  } else {
    c.grab('pillow', 0, 0.54, z0 + 0.3);
    c.grab('teddy', 0.25, 0.58, 0.2, Math.PI);
  }
  root.userData.seats = [{ x: 0, z: z0 + 0.45, y: 0.62, yaw: 0, lie: true }];
  root.userData.inter = { kind: 'seat', label: '침대에 눕기', action: (hit) => c.app.player.sitOn(root, hit && hit.point) };
  return { w: w + 0.06, d };
});

def('nightstand', '협탁', (c) => {
  const { M, root, item } = c;
  box(root, M.walnut, -0.225, 0, -0.2, 0.225, 0.5, 0.18);
  box(root, M.walnut, -0.225, 0.02, 0.18, 0.225, 0.26, 0.2);
  c.drawer(root, { x0: -0.215, x1: 0.215, y0: 0.28, y1: 0.48, z: 0.2, depth: 0.32, mat: M.walnut, label: '협탁 서랍' });
  if (item.lamp) {
    cyl(root, M.ceramic, 0.06, 0.07, 0.2, 0.05, 0.5, -0.05, 16);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.18, 20, 1, true), M.curtain);
    shade.position.set(0.05, 0.78, -0.05);
    root.add(shade);
    const bulb = new THREE.MeshBasicMaterial({ color: '#e0dbd0' });
    sph(root, bulb, 0.04, 0.05, 0.75, -0.05).userData.dyn = true;
    const L = c.light({ x: 0.05, y: 0.75, z: -0.05, color: '#ffc983', intensity: 1.8, distance: 4, on: false });
    c.inter(shade, {
      label: () => (L.on ? '무드등 끄기' : '무드등 켜기'),
      action: () => {
        L.on = !L.on;
        bulb.color.set(L.on ? '#fff0c8' : '#e0dbd0');
        c.sfx(shade, 'switch', { volume: 0.4 });
      },
    });
  }
  return { w: 0.45, d: 0.4 };
});

def('wardrobe', '옷장', (c) => {
  const { M, root, item } = c;
  const w = item.w || 1.8;
  const d = 0.6;
  const h = 2.2;
  box(root, M.cabinet, -w / 2, 0, -d / 2, -w / 2 + 0.02, h, d / 2 - 0.02);
  box(root, M.cabinet, w / 2 - 0.02, 0, -d / 2, w / 2, h, d / 2 - 0.02);
  box(root, M.cabinet, -w / 2, h - 0.02, -d / 2, w / 2, h, d / 2 - 0.02);
  box(root, M.cabinet, -w / 2, 0, -d / 2, w / 2, 0.06, d / 2 - 0.02);
  box(root, M.white, -w / 2, 0, -d / 2, w / 2, h, -d / 2 + 0.01);
  box(root, M.cabinet, -w / 2, 1.9, -d / 2, w / 2, 1.92, d / 2 - 0.02);
  xcyl(root, M.chrome, 0.012, w - 0.04, 0, 1.8, 0, 8);
  const r = rng(w * 10);
  const cols = [M.navy, M.paper, M.blue, M.charcoal, M.pink, M.blanket, M.cushion2];
  for (let x = -w / 2 + 0.06; x < w / 2 - 0.06; x += 0.05 + r() * 0.03) {
    box(root, cols[(r() * cols.length) | 0], x, 0.85 + r() * 0.35, -0.22, x + 0.025, 1.78, 0.22);
  }
  box(root, M.cushion, -w / 2 + 0.1, 1.92, -0.2, -w / 2 + 0.5, 2.1, 0.2);
  box(root, M.brown, 0.2, 1.92, -0.2, 0.6, 2.05, 0.15);
  const n = Math.round(w / 0.6);
  const dw = w / n;
  for (let i = 0; i < n; i++) {
    const x0 = -w / 2 + i * dw + 0.003;
    const x1 = x0 + dw - 0.006;
    c.hingeDoor(root, { x0, x1, y0: 0.005, y1: h - 0.005, z0: d / 2 - 0.02, z1: d / 2, hinge: i % 2 ? 'right' : 'left', mat: M.cabinet, label: '옷장 문' });
  }
  return { w, d };
});

def('dresser', '화장대', (c) => {
  const { M, root } = c;
  box(root, M.white, -0.5, 0.0, -0.22, 0.5, 0.72, 0.2);
  box(root, M.oak, -0.5, 0.72, -0.22, 0.5, 0.75, 0.23);
  c.drawer(root, { x0: -0.48, x1: -0.01, y0: 0.5, y1: 0.7, z: 0.22, depth: 0.35, mat: M.white, label: '화장대 서랍' });
  box(root, M.white, 0.01, 0.5, 0.2, 0.48, 0.7, 0.22);
  box(root, M.oak, -0.33, 0.75, -0.22, 0.33, 1.65, -0.19);
  box(root, M.mirror, -0.3, 0.79, -0.19, 0.3, 1.62, -0.185);
  for (let i = 0; i < 4; i++) cyl(root, [M.pink, M.paper, M.yellow, M.charcoal][i], 0.022, 0.022, 0.08 + i * 0.02, -0.35 + i * 0.07, 0.75, 0.0, 10);
  // 스툴
  cyl(root, M.cushion, 0.17, 0.17, 0.06, 0, 0.42, 0.48, 20);
  cyl(root, M.chrome, 0.02, 0.02, 0.42, 0, 0, 0.48, 8);
  cyl(root, M.chrome, 0.15, 0.15, 0.01, 0, 0, 0.48, 20);
  c.seat([{ x: 0, z: 0.48, y: 0.48, yaw: Math.PI }]);
  c.grab('perfume', 0.3, 0.75, 0.05);
  return { w: 1.0, d: 0.45 };
});

def('wallAC', '벽걸이 에어컨', (c) => {
  const { M, root, app } = c;
  box(root, M.white, -0.45, -0.14, 0, 0.45, 0.14, 0.22);
  const flapPivot = new THREE.Group();
  flapPivot.position.set(0, -0.12, 0.22);
  root.add(flapPivot);
  box(flapPivot, M.offwhite, -0.42, -0.005, -0.08, 0.42, 0.005, 0.0);
  const led = new THREE.MeshBasicMaterial({ color: '#2a2d31' });
  box(root, led, 0.3, 0.0, 0.22, 0.36, 0.02, 0.222);
  const tog = c.toggle((v) => (flapPivot.rotation.x = 0.9 * v), { speed: 1.5 });
  let h = null;
  c.inter(root, {
    label: () => (tog.on ? '에어컨 끄기' : '에어컨 켜기 (안방)'),
    action: () => {
      tog.flip();
      led.color.set(tog.on ? '#5ac8ff' : '#2a2d31');
      c.sfx(root, 'beep', { volume: 0.5 });
      if (tog.on) h = c.loop(root, 'ac', { volume: 0.25 });
      else if (h) h.stop();
      app.toast(tog.on ? '❄️ 안방 에어컨을 켰어요' : '안방 에어컨을 껐어요');
    },
  });
  return { w: 0.9, d: 0.22, wall: true, fixed: true };
});

def('clothesRack', '드레스룸 행거', (c) => {
  const { M, root, item } = c;
  const w = item.w || 1.7;
  const d = 0.55;
  for (const sx of [-1, 1]) box(root, M.walnut, sx * w / 2 - 0.02, 0, -d / 2, sx * w / 2 + 0.02, 2.3, d / 2);
  box(root, M.walnut, -w / 2, 2.0, -d / 2, w / 2, 2.03, d / 2);
  box(root, M.walnut, -w / 2, 0.12, -d / 2, w / 2, 0.15, d / 2);
  xcyl(root, M.chrome, 0.012, w, 0, 1.9, 0, 8);
  xcyl(root, M.chrome, 0.012, w * 0.45, -w * 0.27, 1.0, 0, 8);
  const r = rng(5);
  const cols = [M.navy, M.paper, M.blue, M.charcoal, M.pink, M.blanket, M.cushion2, M.green, M.white];
  for (let x = -w / 2 + 0.05; x < w / 2 - 0.05; x += 0.045 + r() * 0.03) {
    const low = x < 0 && r() < 0.5;
    if (x < 0) box(root, cols[(r() * cols.length) | 0], x, 1.15 + r() * 0.15, -0.22, x + 0.03, 1.88, 0.22);
    else box(root, cols[(r() * cols.length) | 0], x, 0.8 + r() * 0.5, -0.22, x + 0.03, 1.88, 0.22);
    if (low) box(root, cols[(r() * cols.length) | 0], x, 0.5, -0.2, x + 0.025, 0.98, 0.2);
  }
  for (let i = 0; i < 5; i++) box(root, [M.black, M.brown, M.paper][i % 3], -w / 2 + 0.1 + i * 0.3, 0.15, -0.12, -w / 2 + 0.22 + i * 0.3, 0.24, 0.15);
  for (let i = 0; i < 4; i++) box(root, [M.cushion, M.brown, M.pink, M.navy][i], -w / 2 + 0.1 + i * 0.38, 2.03, -0.18, -w / 2 + 0.4 + i * 0.38, 2.2, 0.18);
  return { w, d };
});

def('shelf', '수납 선반', (c) => {
  const { M, root, item } = c;
  const w = item.w || 1.4;
  const d = 0.35;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(root, M.charcoal, sx * w / 2 - 0.015, 0, sz * d / 2 - 0.015, sx * w / 2 + 0.015, 1.8, sz * d / 2 + 0.015);
  const r = rng(w * 7);
  const items = [M.blue, M.paper, M.cushion, M.green, M.pink, M.brown, M.white, M.lightgray];
  for (const y of [0.05, 0.5, 0.95, 1.4, 1.78]) {
    box(root, M.birch, -w / 2, y, -d / 2, w / 2, y + 0.02, d / 2);
    if (y > 1.7) continue;
    let x = -w / 2 + 0.05;
    while (x < w / 2 - 0.2) {
      const bw = 0.15 + r() * 0.25;
      const bh = 0.12 + r() * 0.22;
      if (r() < 0.3) cyl(root, items[(r() * items.length) | 0], 0.05, 0.05, bh, x + 0.06, y + 0.02, 0, 12);
      else box(root, items[(r() * items.length) | 0], x, y + 0.02, -d / 2 + 0.03, x + bw, y + 0.02 + bh, d / 2 - 0.03);
      x += bw + 0.04;
    }
  }
  return { w, d };
});

def('tallMirror', '전신 거울', (c) => {
  const { M, root, app } = c;
  box(root, M.oak, -0.32, 0.05, 0, 0.32, 1.85, 0.03);
  if (app.settings.mirrors) {
    const mirror = new Reflector(new THREE.PlaneGeometry(0.56, 1.72), { textureWidth: 384, textureHeight: 768, color: 0xc0c5c9, multisample: 0 });
    mirror.position.set(0, 0.95, 0.032);
    mirror.raycast = noRaycast;
    root.add(mirror);
  } else box(root, M.mirror, -0.28, 0.09, 0.03, 0.28, 1.81, 0.033);
  return { w: 0.64, d: 0.05, wall: true };
});

// 커튼 · 블라인드
function pleatGeo(h, seg = 24) {
  const g = new THREE.PlaneGeometry(1, h, seg, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + 0.5;
    p.setX(i, x);
    p.setZ(i, Math.sin(x * Math.PI * seg) * 0.03);
  }
  g.translate(0, h / 2, 0);
  g.computeVertexNormals();
  return g;
}

function shadeLink(c, factorFn) {
  c.after(() => {
    const p = c.root.getWorldPosition(new THREE.Vector3());
    let best = null;
    let bd = 2.5;
    for (const s of c.app.daySources || []) {
      const dd = Math.hypot(s.pos.x - p.x, s.pos.z - p.z);
      if (dd < bd) {
        bd = dd;
        best = s;
      }
    }
    if (best) c.update(() => (best.shade = factorFn()));
  });
}

def('curtain', '커튼', (c) => {
  const { M, root, item } = c;
  const w = item.w || 2.6;
  const h = 2.33;
  xcyl(root, M.chrome, 0.012, w + 0.2, 0, h + 0.02, 0.13, 8);
  const geo = pleatGeo(h - 0.02);
  const L = new THREE.Mesh(geo, M.curtain);
  const R = new THREE.Mesh(geo, M.curtain);
  L.position.set(-w / 2 - 0.08, 0.02, 0.12);
  R.position.set(w / 2 + 0.08, 0.02, 0.12);
  R.scale.x = -1;
  L.userData.dyn = R.userData.dyn = true;
  root.add(L, R);
  const open = 0.28;
  const closed = w / 2 + 0.1;
  const tog = c.toggle(
    (v) => {
      L.scale.x = open + (closed - open) * v;
      R.scale.x = -(open + (closed - open) * v);
    },
    { speed: 0.9 }
  );
  const spec = {
    label: () => (tog.on ? '커튼 열기' : '커튼 닫기'),
    action: () => {
      tog.flip();
      c.sfx(L, 'curtain', { volume: 0.5 });
    },
  };
  c.inter(L, spec);
  c.inter(R, spec);
  shadeLink(c, () => 1 - tog.v * 0.8);
  return { w: w + 0.3, d: 0.15, wall: true, fixed: true };
});

def('blind', '롤 블라인드', (c) => {
  const { M, root, item } = c;
  const w = item.w || 1.6;
  const top = (item.head || 2.15) + 0.06;
  const full = top - (item.sill || 0.9) - 0.04;
  xcyl(root, M.white, 0.03, w + 0.06, 0, top, 0.06, 12);
  const g = new THREE.PlaneGeometry(w, 1);
  g.translate(0, -0.5, 0);
  const cloth = new THREE.Mesh(g, M.blind);
  cloth.position.set(0, top - 0.02, 0.07);
  cloth.userData.dyn = true;
  root.add(cloth);
  const bar = box(root, M.white, -w / 2, -0.012, 0.06, w / 2, 0.0, 0.08);
  bar.userData.dyn = true;
  const tog = c.toggle(
    (v) => {
      const len = 0.06 + (full - 0.06) * v;
      cloth.scale.y = len;
      bar.position.y = top - 0.02 - len;
    },
    { speed: 0.8 }
  );
  const spec = {
    label: () => (tog.on ? '블라인드 올리기' : '블라인드 내리기'),
    action: () => {
      tog.flip();
      c.sfx(cloth, 'curtain', { volume: 0.5 });
    },
  };
  c.inter(cloth, spec);
  c.inter(bar, spec);
  shadeLink(c, () => 1 - tog.v * 0.85);
  return { w, d: 0.1, wall: true, fixed: true };
});

// 편집 모드에서 추가할 수 있는 가구
export const CATALOG = [
  { type: 'chair', name: '의자' },
  { type: 'officeChair', name: '사무용 의자' },
  { type: 'campChair', name: '캠핑 의자' },
  { type: 'sofa', name: '3인 소파' },
  { type: 'coffeeTable', name: '거실 테이블' },
  { type: 'sideTable', name: '사이드 테이블' },
  { type: 'diningTable', name: '식탁' },
  { type: 'desk', name: '책상' },
  { type: 'bookshelf', name: '책장' },
  { type: 'shelf', name: '수납 선반' },
  { type: 'bed', name: '싱글 침대', opts: { size: 'single' } },
  { type: 'bed', name: '퀸 침대', opts: { size: 'queen' } },
  { type: 'nightstand', name: '협탁 + 무드등', opts: { lamp: true } },
  { type: 'wardrobe', name: '옷장', opts: { w: 1.2 } },
  { type: 'floorLamp', name: '스탠드 조명' },
  { type: 'plant', name: '화분 (큰)', opts: { size: 1.1 } },
  { type: 'plant', name: '화분 (작은)', opts: { size: 0.6 } },
  { type: 'rug', name: '러그' },
  { type: 'piano', name: '디지털 피아노' },
  { type: 'standAC', name: '스탠드 에어컨' },
  { type: 'speaker', name: '블루투스 스피커' },
  { type: 'dryingRack', name: '빨래 건조대' },
];

// ── 배치 ──
export function placeFurniture(app, item) {
  const d = TYPES[item.type];
  if (!d) {
    console.warn('알 수 없는 가구', item.type);
    return null;
  }
  const root = new THREE.Group();
  root.name = item.id;
  root.userData.furnRoot = true;
  const ctx = makeCtx(app, root, item);
  const info = Object.assign({ solid: true }, d.build(ctx, item) || {});
  if (!info.wall && !info.noBlob) {
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(info.w * 1.25, info.d * 1.25), app.M.blob);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.003;
    blob.raycast = noRaycast;
    root.add(blob);
  }
  bake(root);
  root.position.set(item.x, item.y || 0, item.z);
  root.rotation.y = deg(item.rot || 0);
  root.userData.furn = { id: item.id, type: item.type, item, info, name: d.name };
  app.furnGroup.add(root);
  root.updateMatrixWorld(true);
  for (const fn of ctx._after) fn();
  const rec = { id: item.id, item, root, info, name: d.name };
  app.furniture.set(item.id, rec);
  updateFurnCollision(app, rec);
  return rec;
}

export function updateFurnCollision(app, rec) {
  const { info, root } = rec;
  if (info.wall || info.solid === false) return;
  app.collision.set('furn:' + rec.id, [footprintBox(root.position.x, root.position.z, info.w, info.d, root.rotation.y, -0.03)], () => !root.userData.removed && !!root.parent);
}

export function removeFurniture(app, rec) {
  rec.root.userData.removed = true;
  app.furnGroup.remove(rec.root);
  app.collision.remove('furn:' + rec.id);
  app.furniture.delete(rec.id);
}
