// 우리집 VR — 시작점
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FURNITURE, ROOMS } from './layout.js';
import { makeMaterials, setFloorType } from './materials.js';
import { CollisionWorld, LightSystem, Toggles } from './systems.js';
import { buildHouse, roomAt } from './house.js';
import { placeFurniture } from './furniture.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Interaction } from './interact.js';
import { Grabbables } from './grab.js';
import { AudioEngine } from './audio.js';
import { VRControls } from './vr.js';
import { Editor, loadState, saveState } from './editor.js';
import { Robot, Cat } from './pets.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { WALL_COLORS, FLOOR_TYPES } from './textures.js';

class Events {
  constructor() {
    this.map = {};
  }
  on(name, fn) {
    (this.map[name] ||= []).push(fn);
  }
  emit(name, data) {
    for (const fn of this.map[name] || []) fn(data);
  }
}

const touch = matchMedia('(pointer: coarse)').matches;
const state = loadState();
const settings = Object.assign(
  { timeMode: 'real', volume: 0.8, muted: false, labels: false, mirrors: true, lights: touch ? 4 : 8, turn: '30', fast: false, sens: 1, mouseLock: true },
  state.settings
);
const WEATHER_NAMES = { clear: '맑음', cloudy: '흐림', rain: '비', snow: '눈' };

// ── 렌더러 · 장면 ──
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 2000);

const app = {
  renderer,
  scene,
  camera,
  state,
  settings,
  events: new Events(),
  collision: new CollisionWorld(),
  toggles: new Toggles(),
  updaters: [],
  doors: {},
  furniture: new Map(),
  ceilingMeshes: [],
  viewerPos: new THREE.Vector3(),
  time: { hour: 12 },
  started: false,
  topView: false,
};
window.urizip = app; // 콘솔에서 살펴보기용

app.M = makeMaterials();
app.audio = new AudioEngine();
app.lights = new LightSystem(scene, settings.lights);
app.hemi = new THREE.HemisphereLight('#cfe2f2', '#b9a58c', 1.5);
app.ambient = new THREE.AmbientLight('#ffffff', 0.2);
scene.add(app.hemi, app.ambient);

app.furnGroup = new THREE.Group();
app.furnGroup.name = 'furniture';
scene.add(app.furnGroup);
app.petGroup = new THREE.Group();
scene.add(app.petGroup);

app.player = new Player(app);
app.interaction = new Interaction(app);
app.grab = new Grabbables(app);
app.spawnGrab = (kind, pos, rot) => app.grab.spawn(kind, pos, rot);
app.editor = new Editor(app);
app.ui = new UI(app);
app.world = new World(app);

// ── 시간 · 날씨 · 조명 도우미 ──
function realHour() {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}
app.time.hour = settings.timeMode === 'real' ? realHour() : state.hour ?? 13;
app.weatherName = () => WEATHER_NAMES[app.world.weather];
app.toast = (msg, ms) => app.ui.toast(msg, ms);
app.setTime = (h) => {
  app.time.hour = ((h % 24) + 24) % 24;
  if (settings.timeMode === 'real') app.setSetting('timeMode', 'stop');
  state.hour = app.time.hour;
  saveState(state);
};
app.cycleTimeMode = () => {
  const order = ['real', 'fast', 'stop'];
  app.setSetting('timeMode', order[(order.indexOf(settings.timeMode) + 1) % 3]);
};
app.setWeather = (w) => {
  app.world.setWeather(w);
  state.weather = w;
  saveState(state);
  app.toast({ clear: '☀️ 맑아졌어요', cloudy: '☁️ 구름이 꼈어요', rain: '🌧️ 비가 내려요', snow: '❄️ 눈이 내려요' }[w]);
};
const lightRooms = () => ROOMS.filter((r) => !r.hidden).map((r) => app.roomLights[r.id]);
app.anyLightOn = () => lightRooms().some((s) => s.on);
app.setAllLights = (on) => {
  for (const s of lightRooms()) s.set(on);
  app.audio.at(camera, 'switch', { volume: 0.4 });
  app.toast(on ? '💡 집 안 불을 모두 켰어요' : '🌙 집 안 불을 모두 껐어요');
};
app.setLabels = (on) => app.setSetting('labels', on);
app.setMuted = (m) => app.setSetting('muted', m);
app.setSetting = (k, v) => {
  settings[k] = v;
  state.settings = settings;
  saveState(state);
  applySettings(k);
  app.ui.refresh && app.started && app.ui.refresh();
};
app.cycleTurn = () => {
  const order = ['30', '45', 'smooth'];
  app.setSetting('turn', order[(order.indexOf(settings.turn) + 1) % 3]);
};
function applySettings(k) {
  if (!k || k === 'volume') app.audio.setVolume(settings.volume);
  if (!k || k === 'muted') app.audio.setMuted(settings.muted);
  if (!k || k === 'labels') app.roomLabels && (app.roomLabels.visible = settings.labels || app.topView);
  if (k === 'lights') app.lights.setCount(renderer.xr.isPresenting ? Math.min(6, settings.lights) : settings.lights);
  if (k === 'timeMode') app.toast({ real: '🕒 실제 시계에 맞춰요', fast: '⏩ 1분에 1시간씩 흘러요', stop: '⏸️ 시간이 멈췄어요' }[settings.timeMode]);
}
app.setWall = (id, hex) => {
  app.roomMats[id].wall.color.set(hex);
  (state.rooms[id] ||= {}).wall = hex;
  saveState(state);
};
app.cycleWall = (id) => {
  const cur = state.rooms[id]?.wall || ROOMS.find((r) => r.id === id).wall;
  const i = WALL_COLORS.indexOf(cur);
  app.setWall(id, WALL_COLORS[(i + 1) % WALL_COLORS.length]);
};
app.setFloor = (id, type) => {
  setFloorType(app.roomMats[id].floor, type);
  (state.rooms[id] ||= {}).floor = type;
  saveState(state);
};
app.cycleFloor = (id) => {
  const keys = Object.keys(FLOOR_TYPES);
  const cur = state.rooms[id]?.floor || ROOMS.find((r) => r.id === id).floor;
  const next = keys[(keys.indexOf(cur) + 1) % keys.length];
  app.setFloor(id, next);
  app.toast(`바닥: ${FLOOR_TYPES[next].name}`);
};
app.resetLayout = () => {
  state.furn = {};
  state.added = [];
  saveState(state);
  location.reload();
};

// ── 집 짓기 ──
const house = buildHouse(app);
app.world.build();
for (const item of FURNITURE) {
  const o = state.furn[item.id];
  if (o && o.removed) continue;
  placeFurniture(app, o ? { ...item, x: o.x ?? item.x, z: o.z ?? item.z, rot: o.rot ?? item.rot } : { ...item });
}
for (const item of state.added) placeFurniture(app, { ...item, added: true });
for (const [id, r] of Object.entries(state.rooms)) {
  if (!app.roomMats[id]) continue;
  if (r.wall) app.roomMats[id].wall.color.set(r.wall);
  if (r.floor) setFloorType(app.roomMats[id].floor, r.floor);
}
if (state.weather) app.world.setWeather(state.weather);
app.pickRoots = [house, app.furnGroup, app.grab.group, app.petGroup];
app.solidRoots = [house, app.furnGroup];
app.robot = new Robot(app);
app.cat = new Cat(app);
app.vr = new VRControls(app);
app.input = new Input(app);
app.ui.init();
applySettings();

// 처음 켜 둘 불
const night = app.time.hour < 7 || app.time.hour > 17.5;
for (const id of ['entry', 'hall', 'living', ...(night ? ['kitchen'] : [])]) app.roomLights[id].set(true);

// 위치 표시 (도면 보기용)
const marker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 16), new THREE.MeshBasicMaterial({ color: '#ffb547' }));
marker.rotation.x = Math.PI;
marker.visible = false;
marker.raycast = () => {};
scene.add(marker);

// ── 도면 보기 ──
const topCam = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
topCam.position.set(5.5, 15, 16);
const orbit = new OrbitControls(topCam, renderer.domElement);
orbit.target.set(5.5, 0, 4.2);
orbit.enableDamping = true;
orbit.maxPolarAngle = 1.3;
orbit.minDistance = 4;
orbit.maxDistance = 32;
orbit.enabled = false;
orbit.update();
app.toggleTopView = (on = !app.topView) => {
  if (renderer.xr.isPresenting) return;
  app.topView = on;
  orbit.enabled = on;
  for (const m of app.ceilingMeshes) m.visible = !on;
  for (const m of app.world.above) m.visible = !on;
  marker.visible = on;
  app.roomLabels.visible = settings.labels || on;
  document.body.classList.toggle('topview', on);
  if (on && document.pointerLockElement) document.exitPointerLock();
  if (on) app.toast('🗺️ 도면 보기 · 바닥을 누르면 그곳으로 가요');
};
{
  let down = null;
  const pick = (cx, cy) => {
    const r = renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), topCam);
    const hit = ray.intersectObjects(app.floorMeshes, false)[0];
    if (hit && roomAt(hit.point.x, hit.point.z) && !app.collision.blocked(hit.point.x, hit.point.z, 0.2)) {
      app.player.teleport(hit.point.x, hit.point.z, app.player.yaw);
      app.toggleTopView(false);
    }
  };
  renderer.domElement.addEventListener('pointerdown', (e) => app.topView && (down = { x: e.clientX, y: e.clientY }));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!app.topView || !down) return;
    if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) < 6) pick(e.clientX, e.clientY);
    down = null;
  });
}

// ── 사진 ──
app.takePhoto = () => {
  app.photoPending = true;
  app.audio.at(camera, 'click', { volume: 0.6, rate: 0.6 });
};

// ── 시작 · VR ──
app.startWalk = () => {
  if (!app.started) {
    app.audio.init(camera);
    applySettings();
    app.started = true;
    document.body.classList.add('started');
    document.getElementById('start').hidden = true;
    document.getElementById('hud').hidden = false;
    app.input.enabled = true;
    app.toast(app.input.touch ? '왼쪽 아래를 끌면 걷고, 화면을 밀면 둘러봐요' : '클릭하면 마우스로 둘러볼 수 있어요 · WASD로 걸어요', 4000);
  }
  app.audio.resume();
  if (!app.input.touch && settings.mouseLock && !renderer.xr.isPresenting) {
    try {
      const p = renderer.domElement.requestPointerLock();
      if (p && p.catch)
        p.catch(() => {
          app.input.lockFailed = true;
          app.ui.onLock(false);
        });
    } catch (e) {
      app.input.lockFailed = true;
      app.ui.onLock(false);
    }
  }
};
app.enterVR = async () => {
  if (!navigator.xr) return app.toast('이 브라우저는 VR을 지원하지 않아요. 퀘스트 브라우저에서 열어 주세요', 4000);
  try {
    if (document.pointerLockElement) document.exitPointerLock();
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    app.startWalk();
    if (document.pointerLockElement) document.exitPointerLock();
    await renderer.xr.setSession(session);
  } catch (e) {
    console.warn(e);
    app.toast('VR을 시작하지 못했어요. 헤드셋이 연결돼 있는지 확인해 주세요', 4000);
  }
};
renderer.xr.addEventListener('sessionstart', () => {
  app.player.onEnterVR();
  app.lights.setCount(Math.min(6, settings.lights));
  if (app.topView) app.toggleTopView(false);
  app.ui.toggleMenu(false);
  document.body.classList.add('in-vr');
});
renderer.xr.addEventListener('sessionend', () => {
  app.player.onExitVR();
  app.vr.onSessionEnd();
  app.lights.setCount(settings.lights);
  document.body.classList.remove('in-vr');
});
(async () => {
  const btn = document.getElementById('btnVR');
  const hudBtn = document.getElementById('btnHudVR');
  const note = document.getElementById('vrNote');
  let ok = false;
  try {
    ok = !!(navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr')));
  } catch (e) {}
  btn.disabled = !ok;
  hudBtn.hidden = !ok;
  note.textContent = ok ? 'VR 헤드셋이 준비됐어요. 들어가면 왼손 스틱으로 걷고, 오른손 스틱을 앞으로 밀어 순간이동해요.' : '지금 기기는 VR을 지원하지 않아요. 메타 퀘스트 같은 VR 헤드셋의 브라우저에서 이 페이지를 열면 VR로 들어갈 수 있어요.';
})();

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  topCam.aspect = w / h;
  topCam.updateProjectionMatrix();
});

// ── 매 프레임 ──
const clock = new THREE.Clock();
let elapsed = 0;
let saveT = 0;
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;
  if (settings.timeMode === 'real') app.time.hour = realHour();
  else if (settings.timeMode === 'fast') app.time.hour = (app.time.hour + dt / 60) % 24;
  saveT -= dt;
  if (saveT <= 0 && settings.timeMode !== 'real') {
    saveT = 5;
    state.hour = app.time.hour;
    saveState(state);
  }

  app.player.update(dt);
  camera.getWorldPosition(app.viewerPos);
  app.input.update(dt);
  app.vr.update(dt, elapsed);
  app.grab.update(dt, app.input.holdInfo);
  app.toggles.update(dt);
  for (let i = app.updaters.length - 1; i >= 0; i--) {
    const u = app.updaters[i];
    if (u.alive && !u.alive()) {
      app.updaters.splice(i, 1);
      continue;
    }
    u.fn(dt, elapsed);
  }
  app.robot.update(dt);
  app.cat.update(dt, elapsed);
  app.editor.update(dt);
  // 엘리베이터 홀 센서등
  const pr = app.player.room;
  const nearDoor = app.viewerPos.z < 0.9 && app.viewerPos.x > 2.8 && app.viewerPos.x < 5.2;
  const sensor = (pr && pr.id === 'corridor') || (app.doors['d-front'] && app.doors['d-front'].v > 0.1) || nearDoor;
  if (app.roomLights.corridor.on !== sensor) app.roomLights.corridor.set(sensor);
  app.world.update(dt, elapsed);
  app.lights.update(dt, app.viewerPos);
  app.ui.update(dt);

  if (app.topView) {
    orbit.update();
    marker.position.set(app.viewerPos.x, 2.9 + Math.sin(elapsed * 3) * 0.1, app.viewerPos.z);
    renderer.render(scene, topCam);
  } else renderer.render(scene, camera);

  if (app.photoPending) {
    app.photoPending = false;
    try {
      app.ui.showPhoto(renderer.domElement.toDataURL('image/jpeg', 0.92));
    } catch (e) {
      app.toast('사진을 찍지 못했어요');
    }
  }
}
renderer.setAnimationLoop(frame);
document.body.classList.add('ready');
