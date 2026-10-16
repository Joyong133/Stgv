// 무엇을 가리키고 있는지 찾고, 테두리로 표시하고, 실행하기
import * as THREE from 'three';
import { findInter, findFurn, labelOf, noRaycast } from './systems.js';

function visibleChain(o) {
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}

function heldItem(o) {
  while (o) {
    if (o.userData.grab) return !!o.userData.grab.holder;
    o = o.parent;
  }
  return false;
}

export class Interaction {
  constructor(app) {
    this.app = app;
    this.ray = new THREE.Raycaster();
    this.helpers = new Map();
    this.hover = new Map();
  }
  helper(source) {
    let h = this.helpers.get(source);
    if (!h) {
      h = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#ffb547'));
      h.material.depthTest = false;
      h.material.transparent = true;
      h.material.opacity = 0.85;
      h.renderOrder = 20;
      h.raycast = noRaycast;
      h.visible = false;
      this.app.scene.add(h);
      this.helpers.set(source, h);
    }
    return h;
  }
  // 광선 하나 쏘기 → 맨 앞 물체
  cast(origin, dir, { range = 3.2, edit = false } = {}) {
    this.ray.set(origin, dir);
    this.ray.far = 40;
    const hits = this.ray.intersectObjects(this.app.pickRoots, true);
    for (const h of hits) {
      if (!visibleChain(h.object) || heldItem(h.object)) continue;
      const res = { point: h.point, distance: h.distance, object: h.object, face: h.face };
      if (edit) {
        const furn = findFurn(h.object);
        if (furn && !furn.userData.furn.info.fixed && h.distance < 12) res.furn = furn;
        return res;
      }
      const it = findInter(h.object);
      const reach = it && it.spec.kind === 'grab' ? range + 0.6 : range;
      if (it && h.distance <= reach) {
        res.spec = it.spec;
        res.target = it.obj;
      }
      return res;
    }
    return null;
  }
  setHover(source, res) {
    const h = this.helper(source);
    const target = res && (res.furn || res.target);
    this.hover.set(source, res);
    if (!target) {
      h.visible = false;
      return;
    }
    h.box.setFromObject(target);
    if (h.box.isEmpty()) {
      h.visible = false;
      return;
    }
    h.box.expandByScalar(0.01);
    h.material.color.set(res.furn ? '#7fd1ff' : '#ffb547');
    h.visible = true;
  }
  clear(source) {
    this.setHover(source, null);
  }
  label(source) {
    const r = this.hover.get(source);
    if (!r) return '';
    if (r.furn) return `${r.furn.userData.furn.name} 선택`;
    if (r.spec) return labelOf(r.spec);
    return '';
  }
  activate(source, holder) {
    const r = this.hover.get(source);
    if (!r || !r.spec) return false;
    r.spec.action(r, holder);
    return true;
  }
}
