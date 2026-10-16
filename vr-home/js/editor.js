// 가구 배치 편집: 고르기 · 옮기기 · 돌리기 · 복제 · 삭제 · 추가 (브라우저에 저장)
import * as THREE from 'three';
import { placeFurniture, removeFurniture, updateFurnCollision } from './furniture.js';
import { noRaycast } from './systems.js';

const KEY = 'urizip-vr-v1';
export function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s === 'object') return { furn: {}, added: [], rooms: {}, settings: {}, ...s };
  } catch (e) {}
  return { furn: {}, added: [], rooms: {}, settings: {} };
}
export function saveState(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {}
}

export class Editor {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.sel = null;
    this.moving = false;
    this.offset = new THREE.Vector3();
    this.helper = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#7fd1ff'));
    this.helper.material.depthTest = false;
    this.helper.material.transparent = true;
    this.helper.renderOrder = 21;
    this.helper.raycast = noRaycast;
    this.helper.visible = false;
    app.scene.add(this.helper);
  }
  setActive(on) {
    if (this.active === on) return;
    if (!on) {
      this.place();
      this.select(null);
    }
    this.active = on;
    this.app.ui.onEdit();
    this.app.toast(on ? '🛠️ 편집 모드: 가구를 눌러서 옮기세요' : '편집을 마쳤어요 (자동 저장됨)');
  }
  select(rec) {
    if (this.moving) this.place();
    this.sel = rec || null;
    this.helper.visible = !!rec;
    this.app.ui.onEdit();
  }
  startMove(point) {
    if (!this.sel) return;
    this.moving = true;
    const p = this.sel.root.position;
    this.offset.set(p.x - point.x, 0, p.z - point.z);
    this.app.ui.onEdit();
  }
  moveTo(point) {
    if (!this.moving || !this.sel) return;
    const r = this.sel.root;
    r.position.x = Math.round((point.x + this.offset.x) / 0.05) * 0.05;
    r.position.z = Math.round((point.z + this.offset.z) / 0.05) * 0.05;
    updateFurnCollision(this.app, this.sel);
  }
  place() {
    if (!this.moving || !this.sel) {
      this.moving = false;
      return;
    }
    this.moving = false;
    this.commit(this.sel);
    this.app.grab.wakeAll();
    this.app.audio.at(this.sel.root, 'thud', { volume: 0.4 });
    this.app.ui.onEdit();
  }
  rotate(deg, continuous) {
    if (!this.sel) return;
    const r = this.sel.root;
    r.rotation.y += (deg * Math.PI) / 180;
    if (!continuous) r.rotation.y = Math.round(r.rotation.y / (Math.PI / 12)) * (Math.PI / 12);
    updateFurnCollision(this.app, this.sel);
    if (!this.moving) this.commit(this.sel);
  }
  commit(rec) {
    const st = this.app.state;
    const it = rec.item;
    it.x = +rec.root.position.x.toFixed(3);
    it.z = +rec.root.position.z.toFixed(3);
    it.rot = +((rec.root.rotation.y * 180) / Math.PI).toFixed(1);
    if (it.added) {
      const a = st.added.find((x) => x.id === it.id);
      if (a) Object.assign(a, { x: it.x, z: it.z, rot: it.rot });
    } else st.furn[it.id] = { ...(st.furn[it.id] || {}), x: it.x, z: it.z, rot: it.rot };
    saveState(st);
  }
  remove() {
    if (!this.sel) return;
    const rec = this.sel;
    this.moving = false;
    this.select(null);
    removeFurniture(this.app, rec);
    const st = this.app.state;
    if (rec.item.added) st.added = st.added.filter((x) => x.id !== rec.item.id);
    else st.furn[rec.item.id] = { ...(st.furn[rec.item.id] || {}), removed: true };
    saveState(st);
    this.app.grab.wakeAll();
    this.app.toast(`${rec.name}을(를) 치웠어요`);
  }
  spawn(type, opts, x, z, rot) {
    const item = { ...opts, id: 'u' + Date.now().toString(36) + Math.floor(Math.random() * 99), type, x, z, rot, added: true };
    const rec = placeFurniture(this.app, item);
    if (!rec) return null;
    this.app.state.added.push(item);
    saveState(this.app.state);
    this.select(rec);
    // PC·모바일은 바로 따라다니며 옮기기, VR은 트리거로 집어서 옮기기
    this.moving = !this.app.renderer.xr.isPresenting;
    this.offset.set(0, 0, 0);
    this.app.ui.onEdit();
    return rec;
  }
  duplicate() {
    if (!this.sel) return;
    const it = this.sel.item;
    const { id, x, z, rot, added, ...opts } = it;
    const rec = this.spawn(it.type, opts, x + 0.4, z + 0.4, rot);
    if (rec) this.app.toast(`${rec.name} 복제 · 원하는 곳에 놓으세요`);
  }
  add(cat) {
    const p = this.app.viewerPos;
    const dir = this.app.camera.getWorldDirection(new THREE.Vector3());
    dir.y = 0;
    dir.normalize();
    const x = p.x + dir.x * 1.5;
    const z = p.z + dir.z * 1.5;
    const rot = (Math.atan2(-dir.x, -dir.z) * 180) / Math.PI;
    const rec = this.spawn(cat.type, cat.opts || {}, x, z, rot);
    if (rec) this.app.toast(`${cat.name} 추가 · 원하는 곳에 놓으세요`);
  }
  update() {
    if (this.sel && this.helper.visible) {
      this.helper.box.setFromObject(this.sel.root);
      this.helper.box.expandByScalar(0.02);
    }
  }
}
