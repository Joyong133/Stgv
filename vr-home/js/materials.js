// 공용 재질 (가벼운 Lambert 위주 — VR 기기에서도 부드럽게)
import * as THREE from 'three';
import { grain, fabric, wallpaper, wallTiles, FLOOR_TYPES } from './textures.js';

const L = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

export function makeMaterials() {
  const M = {
    white: L('#f4f3ef'),
    offwhite: L('#e9e6df'),
    trim: L('#f7f6f2'),
    ceiling: L('#fbfbf9'),
    exterior: L('#d9d5cc'),
    concrete: L('#b9b6b0'),
    sill: L('#e8e4dc'),
    oak: L('#c9a27a', { map: grain() }),
    walnut: L('#7a5238', { map: grain() }),
    birch: L('#e2cfae', { map: grain() }),
    darkwood: L('#4a3528', { map: grain() }),
    sofa: L('#8e9a96', { map: fabric() }),
    cushion: L('#d8c9ad', { map: fabric() }),
    cushion2: L('#b8794e', { map: fabric() }),
    bedding: L('#f1efe9', { map: fabric() }),
    blanket: L('#9fb1c4', { map: fabric() }),
    blanket2: L('#d9b9a8', { map: fabric() }),
    curtain: L('#d9cfbe', { map: fabric(), side: THREE.DoubleSide }),
    blind: L('#efebe3', { map: fabric(), side: THREE.DoubleSide }),
    black: L('#1d1f22'),
    charcoal: L('#3a3d42'),
    gray: L('#8a8d91'),
    lightgray: L('#c9cbcd'),
    steel: new THREE.MeshPhongMaterial({ color: '#b9bec4', shininess: 80, specular: '#ffffff' }),
    chrome: new THREE.MeshPhongMaterial({ color: '#d7dbe0', shininess: 120, specular: '#ffffff' }),
    ceramic: new THREE.MeshPhongMaterial({ color: '#f7f7f5', shininess: 70, specular: '#888888' }),
    counter: new THREE.MeshPhongMaterial({ color: '#efede8', shininess: 40, specular: '#555555' }),
    cabinet: L('#f1efea'),
    cabinetDark: L('#5b6168'),
    fridge: new THREE.MeshPhongMaterial({ color: '#d8dadc', shininess: 60, specular: '#666666' }),
    screen: new THREE.MeshPhongMaterial({ color: '#08090b', shininess: 90, specular: '#444444' }),
    glass: new THREE.MeshLambertMaterial({ color: '#cfe3ef', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
    frosted: new THREE.MeshLambertMaterial({ color: '#eef3f6', transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    showerGlass: new THREE.MeshLambertMaterial({ color: '#d9ecf2', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    aluminum: L('#5d6166'),
    door: L('#eeeae3'),
    doorDark: L('#545a60'),
    leaf: L('#4f7d45'),
    leaf2: L('#6d9a4f'),
    pot: L('#c9b8a3'),
    pot2: L('#5f6b70'),
    soil: L('#3e3026'),
    water: new THREE.MeshPhongMaterial({ color: '#9fcfe6', transparent: true, opacity: 0.55, shininess: 100, specular: '#ffffff', depthWrite: false }),
    mirror: new THREE.MeshPhongMaterial({ color: '#b7c2c8', shininess: 150, specular: '#ffffff' }),
    paper: L('#f5f2ea'),
    red: L('#c0473d'),
    orange: L('#de8a3c'),
    yellow: L('#e7c24a'),
    green: L('#5d9a5a'),
    blue: L('#4b74b5'),
    navy: L('#2f3f5e'),
    pink: L('#e3a3a8'),
    brown: L('#8a5d3b'),
    fur: L('#e0a768', { map: fabric() }),
    blob: new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }),
    bulbOff: L('#efeae0'),
    glowWarm: new THREE.MeshBasicMaterial({ color: '#fff3d6' }),
    glowCool: new THREE.MeshBasicMaterial({ color: '#e8f4ff' }),
    led: new THREE.MeshBasicMaterial({ color: '#47d17a' }),
    ledRed: new THREE.MeshBasicMaterial({ color: '#ff5a4a' }),
  };
  M.blob.map = blobTexture();
  return M;
}

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

// 방마다 벽·바닥 재질 (색을 바꿀 수 있게 따로 만듦)
export function roomMaterials(room) {
  const wallMap = room.wallTex === 'tile' ? wallTiles() : wallpaper();
  const wall = new THREE.MeshLambertMaterial({ color: room.wall, map: wallMap });
  const ft = FLOOR_TYPES[room.floor] || FLOOR_TYPES.oak;
  const floor = new THREE.MeshLambertMaterial({ color: ft.color, map: ft.tex() });
  return { wall, floor };
}

export function setFloorType(mat, type) {
  const ft = FLOOR_TYPES[type];
  if (!ft) return;
  mat.color.set(ft.color);
  mat.map = ft.tex();
  mat.needsUpdate = true;
}
