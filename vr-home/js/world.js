// 바깥 풍경 · 하늘 · 해와 달 · 날씨 · 시간 흐름
import * as THREE from 'three';
import { CEILING } from './layout.js';
import { FaceBucket } from './house.js';
import { facade, grass, asphalt } from './textures.js';
import { rng, clamp, lerp, smooth } from './util.js';
import { noRaycast } from './systems.js';

export const GROUND = -34; // 13층

const C = (h) => new THREE.Color(h);
const SKY = {
  night: { top: C('#060d1c'), hor: C('#152238'), bot: C('#05080e') },
  dusk: { top: C('#2b4677'), hor: C('#f0a36b'), bot: C('#262733') },
  day: { top: C('#3f86d6'), hor: C('#cfe2f2'), bot: C('#8c99a2') },
  gray: { top: C('#7c8792'), hor: C('#b9c0c6'), bot: C('#6f767c') },
};

export class World {
  constructor(app) {
    this.app = app;
    this.weather = 'clear';
    this.exterior = []; // { mat, base: Color }
    this.dayLevel = 1;
    this.night = 0;
    this.rainAmount = 0;
    this.snowAmount = 0;
    this.cloudAmount = 0;
  }

  build() {
    const { scene } = this.app;
    this.group = new THREE.Group();
    this.group.name = 'outside';
    scene.add(this.group);
    this.buildSky();
    this.buildCity();
    this.buildWeather();
    this.group.traverse((o) => {
      if (o.isMesh || o.isPoints || o.isLineSegments || o.isInstancedMesh) o.raycast = noRaycast;
    });
  }

  extMat(params, base = '#ffffff') {
    const m = new THREE.MeshBasicMaterial(params);
    this.exterior.push({ mat: m, base: new THREE.Color(base) });
    return m;
  }

  buildSky() {
    const uniforms = {
      top: { value: new THREE.Color() },
      hor: { value: new THREE.Color() },
      bot: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      moonDir: { value: new THREE.Vector3(0, -1, 0) },
      sunCol: { value: new THREE.Color('#fff2d0') },
      sunAmt: { value: 1 },
      moonAmt: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `uniform vec3 top, hor, bot, sunDir, moonDir, sunCol; uniform float sunAmt, moonAmt; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          vec3 col = h > 0.0 ? mix(hor, top, pow(clamp(h,0.0,1.0), 0.55)) : mix(hor, bot, pow(clamp(-h,0.0,1.0), 0.35));
          float s = max(dot(d, sunDir), 0.0);
          col += sunCol * (pow(s, 900.0) * 6.0 + pow(s, 14.0) * 0.28) * sunAmt;
          float m = max(dot(d, moonDir), 0.0);
          col += vec3(0.85,0.9,1.0) * (smoothstep(0.99955, 0.9997, m) * 1.2 + pow(m, 40.0) * 0.08) * moonAmt;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);
    this.skyU = uniforms;

    // 별
    const n = 1400;
    const pos = new Float32Array(n * 3);
    const r = rng(77);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const y = 0.08 + r() * 0.92;
      const rr = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * rr * 850, y * 850, Math.sin(a) * rr * 850], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.frustumCulled = false;
    this.group.add(this.stars);

    // 구름
    const cloudTex = (() => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 128;
      const ctx = c.getContext('2d');
      const rr2 = rng(5);
      for (let i = 0; i < 26; i++) {
        const x = 40 + rr2() * 176;
        const y = 50 + rr2() * 40;
        const rad = 18 + rr2() * 30;
        const grd = ctx.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, 'rgba(255,255,255,0.9)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, 256, 128);
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    this.cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.8, fog: false });
    this.clouds = [];
    const rc = rng(9);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(260, 130), this.cloudMat);
      const a = rc() * Math.PI * 2;
      const d = 300 + rc() * 350;
      m.position.set(Math.cos(a) * d, 140 + rc() * 120, Math.sin(a) * d);
      m.lookAt(0, m.position.y - 60, 0);
      m.userData.a = a;
      m.userData.d = d;
      m.renderOrder = -9;
      this.group.add(m);
      this.clouds.push(m);
    }
  }

  buildCity() {
    const b = new FaceBucket();
    const above = new FaceBucket();
    const shadeFn = (dir) => ({ '+x': 0.82, '-x': 0.72, '+z': 1.0, '-z': 0.66, '+y': 1.05, '-y': 0.5 })[dir];
    const fac = (x0, y0, z0, x1, y1, z1, skip = [], bucket = b) => bucket.box(x0, y0, z0, x1, y1, z1, (dir) => (skip.includes(dir) ? null : 'fac'), [20, 44.8], shadeFn);
    const H = CEILING;
    // 우리 아파트 동 (위·아래층, 옆집) — 윗층은 도면 보기에서 숨김
    fac(-24, GROUND, -0.12, 11.12, -0.02, 10.12, ['+y']);
    fac(-24, H + 0.02, -0.12, 11.12, 26, 10.12, ['-y'], above);
    fac(-24, -0.02, -0.12, -0.12, H + 0.02, 10.12, ['+x']);
    fac(2.7, GROUND, -2.52, 5.3, -0.02, -0.12, ['+y']);
    fac(2.7, H + 0.02, -2.52, 5.3, 26, -0.12, ['-y'], above);
    // 주변 아파트 단지
    const r = rng(42);
    const spots = [
      [-40, 60], [0, 62], [40, 64], [80, 58], [-80, 66],
      [60, -10], [62, 30], [-60, -40], [-20, -48], [20, -46], [60, -50],
      [-90, 10], [100, -20], [-120, 80], [120, 90], [10, 130], [-50, 140], [80, 150],
    ];
    for (const [x, z] of spots) {
      const w = 26 + r() * 10;
      const d = 11 + r() * 3;
      const h = 30 + r() * 45;
      const rot = r() < 0.5;
      const [hw, hd] = rot ? [d / 2, w / 2] : [w / 2, d / 2];
      fac(x - hw, GROUND, z - hd, x + hw, GROUND + h, z + hd, ['-y']);
    }
    const facMat = this.extMat({ map: facade(false), vertexColors: true }, '#ffffff');
    const litMat = new THREE.MeshBasicMaterial({ map: facade(true), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    this.litMat = litMat;
    this.above = [];
    for (const [bucket, isAbove] of [[b, false], [above, true]]) {
      for (const mesh of bucket.meshes(() => facMat, { vertexColors: true })) {
        const lit = new THREE.Mesh(mesh.geometry, litMat);
        lit.renderOrder = 1;
        this.group.add(mesh, lit);
        if (isAbove) this.above.push(mesh, lit);
      }
    }
    // 땅
    const gtex = grass();
    gtex.repeat.set(120, 120);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), this.extMat({ map: gtex }, '#ffffff'));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = GROUND;
    this.group.add(ground);
    const atex = asphalt();
    atex.repeat.set(60, 2);
    const roadMat = this.extMat({ map: atex }, '#ffffff');
    for (const [x, z, w, d] of [[5, 35, 600, 9], [-30, 0, 9, 600], [90, 0, 9, 600], [5, -25, 600, 7]]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, GROUND + 0.05, z);
      this.group.add(road);
    }
    // 놀이터 · 산책로
    const path = new THREE.Mesh(new THREE.RingGeometry(10, 12, 40), this.extMat({ color: '#ffffff' }, '#cdbb9a'));
    path.rotation.x = -Math.PI / 2;
    path.position.set(8, GROUND + 0.06, 22);
    this.group.add(path);
    // 나무
    const trees = [];
    const rt = rng(3);
    while (trees.length < 140) {
      const x = -150 + rt() * 300;
      const z = -100 + rt() * 260;
      if (Math.abs(z - 35) < 7 || Math.abs(x + 30) < 7 || Math.abs(x - 90) < 7 || Math.abs(z + 25) < 6) continue;
      if (x > -26 && x < 13 && z > -5 && z < 13) continue;
      if (spots.some(([sx, sz]) => Math.abs(sx - x) < 22 && Math.abs(sz - z) < 12)) continue;
      trees.push([x, z, 0.8 + rt() * 0.8]);
    }
    const crown = new THREE.InstancedMesh(new THREE.SphereGeometry(2.6, 8, 6), this.extMat({ color: '#ffffff' }, '#4f7a3f'), trees.length);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.4, 4, 6), this.extMat({ color: '#ffffff' }, '#5b4433'), trees.length);
    const m4 = new THREE.Matrix4();
    trees.forEach(([x, z, s], i) => {
      m4.compose(new THREE.Vector3(x, GROUND + 5.2 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 1.15, s));
      crown.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(x, GROUND + 2 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      trunk.setMatrixAt(i, m4);
    });
    this.group.add(crown, trunk);
    // 먼 산
    const mtnMat = this.extMat({ color: '#ffffff' }, '#7f93a6');
    const rm = rng(11);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + rm() * 0.2;
      const d = 560 + rm() * 120;
      const h = 70 + rm() * 140;
      const m = new THREE.Mesh(new THREE.ConeGeometry(120 + rm() * 80, h, 7), mtnMat);
      m.position.set(Math.cos(a) * d, GROUND + h / 2 - 2, Math.sin(a) * d);
      m.rotation.y = rm() * 3;
      this.group.add(m);
    }
  }

  buildWeather() {
    const n = 2600;
    const pos = new Float32Array(n * 2 * 3);
    const end = new Float32Array(n * 2);
    const seed = new Float32Array(n * 2);
    const r = rng(8);
    let i = 0;
    while (i < n) {
      const x = -18 + r() * 47;
      const z = -18 + r() * 47;
      if (x > -0.4 && x < 11.4 && z > -2.7 && z < 10.4) continue;
      const y = -12 + r() * 22;
      const s = r();
      for (let k = 0; k < 2; k++) {
        pos.set([x, y, z], (i * 2 + k) * 3);
        end[i * 2 + k] = k;
        seed[i * 2 + k] = s;
      }
      i++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.rainMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uSnow: { value: 0 } },
      transparent: true,
      depthWrite: false,
      vertexShader: `attribute float aEnd; attribute float aSeed; uniform float uTime; uniform float uSnow; varying float vA;
        void main(){ vec3 p = position; float range = 22.0; float speed = mix(11.0, 1.2, uSnow);
          float f = mod(aSeed*range + uTime*speed, range); p.y = 10.0 - f;
          p.x += uSnow * sin(uTime*0.8 + aSeed*30.0) * 0.6; p.z += uSnow * cos(uTime*0.7 + aSeed*20.0) * 0.6;
          p.y += aEnd * mix(0.45, 0.06, uSnow); p.x += aEnd * mix(0.04, 0.05, uSnow);
          vA = 1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
      fragmentShader: `uniform float uAmt; uniform float uSnow; varying float vA; void main(){ vec3 c = mix(vec3(0.72,0.8,0.9), vec3(1.0), uSnow); gl_FragColor = vec4(c, uAmt*mix(0.45, 0.95, uSnow)); }`,
    });
    this.rain = new THREE.LineSegments(g, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.group.add(this.rain);
  }

  setWeather(w) {
    this.weather = w;
  }

  update(dt, time) {
    const app = this.app;
    const h = app.time.hour;
    const th = ((h - 6) / 12) * Math.PI;
    const sunDir = new THREE.Vector3(Math.cos(th), Math.sin(th) * 0.92, 0.55).normalize();
    const e = Math.sin(th);
    const target = { rain: this.weather === 'rain' ? 1 : 0, snow: this.weather === 'snow' ? 1 : 0, cloud: this.weather === 'clear' ? 0.15 : this.weather === 'cloudy' ? 0.85 : 1 };
    this.rainAmount += (target.rain - this.rainAmount) * Math.min(1, dt * 0.8);
    this.snowAmount += (target.snow - this.snowAmount) * Math.min(1, dt * 0.8);
    this.cloudAmount += (target.cloud - this.cloudAmount) * Math.min(1, dt * 0.8);
    const day = smooth(clamp((e + 0.08) / 0.4, 0, 1));
    const dusk = clamp(1 - Math.abs(e) / 0.28, 0, 1) * (1 - this.cloudAmount * 0.7);
    this.night = 1 - day;
    const gray = this.cloudAmount * 0.85;
    const pick = (k) => {
      const c = SKY.night[k].clone().lerp(SKY.day[k], day);
      c.lerp(SKY.gray[k].clone().multiplyScalar(lerp(0.15, 1, day)), gray);
      if (k !== 'bot') c.lerp(SKY.dusk[k], dusk * (k === 'hor' ? 0.85 : 0.45));
      return c;
    };
    this.skyU.top.value.copy(pick('top'));
    this.skyU.hor.value.copy(pick('hor'));
    this.skyU.bot.value.copy(pick('bot'));
    this.skyU.sunDir.value.copy(sunDir);
    this.skyU.moonDir.value.copy(sunDir).multiplyScalar(-1).setY(Math.abs(sunDir.y) * 0.9 + 0.1).normalize();
    this.skyU.sunAmt.value = clamp(e * 4 + 0.6, 0, 1) * (1 - this.cloudAmount * 0.9);
    this.skyU.moonAmt.value = this.night * (1 - this.cloudAmount * 0.8);
    this.skyU.sunCol.value.set('#fff2d0').lerp(new THREE.Color('#ff9a52'), dusk);
    this.starMat.opacity = this.night * (1 - this.cloudAmount);
    this.sky.position.copy(app.viewerPos);
    this.stars.position.copy(app.viewerPos);
    // 구름
    this.cloudMat.opacity = 0.35 + this.cloudAmount * 0.6;
    this.cloudMat.color.copy(pick('hor')).lerp(new THREE.Color('#ffffff'), day * 0.5);
    for (const c of this.clouds) {
      c.userData.a += dt * 0.002;
      c.position.x = Math.cos(c.userData.a) * c.userData.d;
      c.position.z = Math.sin(c.userData.a) * c.userData.d;
      c.lookAt(0, c.position.y - 60, 0);
    }
    // 바깥 밝기
    const weatherDim = 1 - this.cloudAmount * 0.3 - this.rainAmount * 0.15;
    const level = lerp(0.13, 1.0, day) * weatherDim;
    this.dayLevel = level;
    const tint = new THREE.Color(1, 1, 1).lerp(new THREE.Color('#ffc59a'), dusk * 0.5).lerp(new THREE.Color('#8fa3d6'), this.night * 0.6);
    for (const x of this.exterior) x.mat.color.copy(x.base).multiply(tint).multiplyScalar(level);
    this.litMat.opacity = clamp(this.night * 1.1 - 0.1, 0, 0.8);
    // 실내 기본광 (하늘빛)
    const hemi = app.hemi;
    hemi.color.copy(pick('hor')).lerp(new THREE.Color('#ffffff'), 0.55 * day);
    hemi.groundColor.set('#e2ddd4').multiplyScalar(lerp(0.25, 1, day));
    hemi.intensity = lerp(0.3, 1.55, day) * weatherDim;
    app.ambient.intensity = lerp(0.12, 0.35, day);
    // 창가 햇빛
    for (const s of app.daySources) {
      s.intensity = s.base * lerp(0, 6.5, day) * weatherDim * (s.shade ?? 1);
      s.color.set('#e3ecff').lerp(new THREE.Color('#ffc890'), dusk * 0.7);
    }
    // 비 · 눈
    const amt = Math.max(this.rainAmount, this.snowAmount);
    this.rain.visible = amt > 0.02;
    this.rainMat.uniforms.uTime.value = time;
    this.rainMat.uniforms.uAmt.value = amt;
    this.rainMat.uniforms.uSnow.value = this.snowAmount > this.rainAmount ? 1 : 0;
    // 배경 소리
    const au = app.audio;
    if (au.ready) {
      au.ambient('birds', day * (1 - this.cloudAmount) * 0.22);
      au.ambient('crickets', this.night * (1 - this.rainAmount) * (1 - this.snowAmount) * 0.18);
      au.ambient('rain', this.rainAmount * 0.32);
    }
  }
}
