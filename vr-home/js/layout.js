// ─────────────────────────────────────────────────────────────
//  우리집 평면도 (단위: 미터)
//  x = 서쪽(0) → 동쪽,  z = 북쪽(0, 현관 쪽) → 남쪽(발코니 쪽)
//  방 크기·문 위치·가구를 여기서 고치면 집이 그대로 바뀝니다.
// ─────────────────────────────────────────────────────────────

export const CEILING = 2.4; // 천장 높이
export const DOOR_H = 2.1; // 방문 높이

// 방: rect = [x0, z0, x1, z1] (벽 중심선 기준)
// floor: oak | walnut | ash | tile | tileGray | stone | deck | marble
// wall: 벽 색, wallTex: paper(벽지) | tile(욕실 타일)
export const ROOMS = [
  { id: 'entry', name: '현관', rect: [3.0, 0, 4.4, 1.8], floor: 'stone', wall: '#ece7de', light: [3.7, 0.9] },
  { id: 'hall', name: '복도', rect: [3.0, 1.8, 4.4, 4.8], floor: 'oak', wall: '#efebe4', light: [3.7, 3.3] },
  { id: 'kitchen', name: '주방·식당', rect: [4.4, 0, 7.6, 4.8], floor: 'oak', wall: '#f2efe9', light: [6.0, 1.6] },
  { id: 'living', name: '거실', rect: [3.0, 4.8, 7.6, 8.6], floor: 'oak', wall: '#eeeae3', light: [5.3, 6.9] },
  { id: 'study', name: '작은방 (서재)', rect: [0, 0, 3.0, 3.0], floor: 'oak', wall: '#dfe8e3', light: [1.5, 1.5] },
  { id: 'bath', name: '공용 욕실', rect: [0, 3.0, 3.0, 4.8], floor: 'tile', wall: '#f4f4f2', wallTex: 'tile', light: [1.5, 3.9] },
  { id: 'room2', name: '침실 2', rect: [0, 4.8, 3.0, 8.6], floor: 'oak', wall: '#e6e1ee', light: [1.5, 6.7] },
  { id: 'master', name: '안방', rect: [7.6, 4.8, 11.0, 8.6], floor: 'walnut', wall: '#ede5d8', light: [9.3, 6.7] },
  { id: 'dress', name: '드레스룸', rect: [7.6, 2.6, 9.2, 4.8], floor: 'walnut', wall: '#f1ede7', light: [8.4, 3.7] },
  { id: 'mbath', name: '안방 욕실', rect: [9.2, 2.6, 11.0, 4.8], floor: 'tile', wall: '#eef0f1', wallTex: 'tile', light: [10.1, 3.7] },
  { id: 'utility', name: '다용도실', rect: [7.6, 0, 11.0, 2.6], floor: 'tileGray', wall: '#e8e8e4', light: [9.3, 1.3] },
  { id: 'balcony', name: '발코니', rect: [3.0, 8.6, 11.0, 10.0], floor: 'deck', wall: '#e4dfd6', light: [7.0, 9.3] },
  // 현관문 밖 공용 복도 (메뉴에는 안 보임)
  { id: 'corridor', name: '엘리베이터 홀', rect: [2.8, -2.4, 5.2, 0], floor: 'stone', wall: '#d9d6cf', light: [4.0, -1.2], hidden: true },
];

// 벽: axis 'x' = x 방향으로 뻗은 벽(z = at 고정), axis 'z' = z 방향으로 뻗은 벽(x = at 고정)
// 개구부 type: door(여닫이) · slide(미닫이) · window(창) · open(문 없는 통로)
//   door: hinge 'start'|'end' (경첩 위치), swing +1|-1 (열리는 쪽: x벽은 +z/-z, z벽은 +x/-x), style
//   window: sill(창턱 높이) head(창 윗선)
const EXT = 0.2; // 외벽 두께
const INT = 0.12; // 내벽 두께

export const WALLS = [
  // ── 외벽 ──
  {
    axis: 'x', at: 0, from: -0.1, to: 11.1, t: EXT,
    openings: [
      { id: 'w-study', type: 'window', from: 0.8, to: 2.2, sill: 0.9, head: 2.1 },
      { id: 'd-front', type: 'door', from: 3.25, to: 4.15, hinge: 'start', swing: -1, style: 'front' },
      { id: 'w-kitchen', type: 'window', from: 5.4, to: 6.8, sill: 1.1, head: 2.0 },
    ],
  },
  { axis: 'z', at: 0, from: -0.1, to: 8.7, t: EXT, openings: [] },
  {
    axis: 'z', at: 11.0, from: -0.1, to: 10.1, t: EXT,
    openings: [
      { id: 'w-utility', type: 'window', from: 0.6, to: 2.0, sill: 1.0, head: 2.0 },
      { id: 'w-mbath', type: 'window', from: 3.3, to: 4.1, sill: 1.5, head: 2.0, frosted: true },
      { id: 'w-balcony-e', type: 'window', from: 8.8, to: 9.8, sill: 0.9, head: 2.2 },
    ],
  },
  {
    axis: 'x', at: 8.6, from: -0.1, to: 11.1, t: EXT,
    openings: [
      { id: 'w-room2', type: 'window', from: 0.5, to: 2.5, sill: 0.9, head: 2.2 },
      { id: 's-living', type: 'slide', from: 3.6, to: 7.0, head: 2.25, style: 'balcony' },
      { id: 's-master', type: 'slide', from: 8.2, to: 10.4, head: 2.25, style: 'balcony' },
    ],
  },
  {
    axis: 'x', at: 10.0, from: 2.9, to: 11.1, t: EXT,
    openings: [{ id: 'w-balcony', type: 'window', from: 3.2, to: 10.8, sill: 0.9, head: 2.3, mullions: 6 }],
  },
  { axis: 'z', at: 3.0, from: 8.6, to: 10.0, t: EXT, openings: [] },

  // ── 내벽 ──
  {
    axis: 'z', at: 3.0, from: 0, to: 8.6, t: INT,
    openings: [
      { id: 'd-study', type: 'door', from: 2.0, to: 2.9, hinge: 'end', swing: -1 },
      { id: 'd-bath', type: 'door', from: 3.65, to: 4.4, hinge: 'start', swing: -1, style: 'bath' },
      { id: 'd-room2', type: 'door', from: 5.0, to: 5.9, hinge: 'start', swing: -1 },
    ],
  },
  { axis: 'x', at: 3.0, from: 0, to: 3.0, t: INT, openings: [] },
  { axis: 'x', at: 4.8, from: 0, to: 3.0, t: INT, openings: [] },
  { axis: 'z', at: 4.4, from: 0, to: 3.0, t: INT, openings: [] },
  {
    axis: 'x', at: 1.8, from: 3.0, to: 4.4, t: INT,
    openings: [{ id: 's-middle', type: 'slide', from: 3.06, to: 4.34, head: 2.1, style: 'glass' }],
  },
  {
    axis: 'z', at: 7.6, from: 0, to: 8.6, t: INT,
    openings: [
      { id: 'd-utility', type: 'door', from: 0.9, to: 1.8, hinge: 'start', swing: 1 },
      { id: 'd-master', type: 'door', from: 5.0, to: 5.9, hinge: 'end', swing: 1 },
    ],
  },
  { axis: 'x', at: 2.6, from: 7.6, to: 11.0, t: INT, openings: [] },
  {
    axis: 'x', at: 4.8, from: 7.6, to: 11.0, t: INT,
    openings: [
      { id: 'o-dress', type: 'open', from: 7.85, to: 8.85, head: 2.1 },
      { id: 'd-mbath', type: 'door', from: 9.7, to: 10.45, hinge: 'end', swing: -1, style: 'bath' },
    ],
  },
  { axis: 'z', at: 9.2, from: 2.6, to: 4.8, t: INT, openings: [] },

  // ── 공용 복도 (현관 밖) ──
  { axis: 'x', at: -2.4, from: 2.7, to: 5.3, t: EXT, openings: [] },
  { axis: 'z', at: 2.8, from: -2.4, to: 0, t: EXT, openings: [] },
  { axis: 'z', at: 5.2, from: -2.4, to: 0, t: EXT, openings: [] },
];

// 조명 스위치: 벽 표면 위치와 바라보는 방향(n)
export const SWITCHES = [
  { room: 'entry', x: 4.34, z: 1.45, n: '-x' },
  { room: 'hall', x: 4.34, z: 2.25, n: '-x' },
  { room: 'kitchen', x: 4.46, z: 2.8, n: '+x' },
  { room: 'living', x: 3.06, z: 6.0, n: '+x', y: 1.25 },
  { room: 'study', x: 2.94, z: 1.85, n: '-x' },
  { room: 'bath', x: 3.06, z: 4.6, n: '+x' },
  { room: 'room2', x: 2.94, z: 6.05, n: '-x' },
  { room: 'master', x: 9.02, z: 4.86, n: '+z' },
  { room: 'dress', x: 9.16, z: 4.86, n: '+z' },
  { room: 'mbath', x: 9.3, z: 4.86, n: '+z' },
  { room: 'utility', x: 7.54, z: 2.0, n: '-x' },
  { room: 'balcony', x: 3.32, z: 8.54, n: '-z' },
];

// 낮에 창으로 들어오는 빛
export const DAYLIGHT = [
  { x: 5.3, z: 8.1, s: 1.4 },
  { x: 9.3, z: 8.1, s: 1.0 },
  { x: 1.5, z: 8.2, s: 0.8 },
  { x: 1.5, z: 0.4, s: 0.7 },
  { x: 6.1, z: 0.4, s: 0.6 },
  { x: 10.6, z: 1.3, s: 0.5 },
  { x: 7.0, z: 9.4, s: 1.6 },
];

// 가구: type은 furniture.js 목록, rot은 도(°) — 0이면 앞면이 남쪽(+z)
export const FURNITURE = [
  // 현관
  { id: 'shoes', type: 'shoeCabinet', x: 3.25, z: 0.95, rot: 90 },
  { id: 'entrymat', type: 'mat', x: 3.85, z: 0.75, rot: 0 },
  { id: 'wallpad', type: 'wallpad', x: 4.34, z: 0.95, rot: -90, y: 1.35 },
  { id: 'hallart', type: 'art', x: 3.06, z: 3.27, rot: 90, y: 1.45, w: 0.45, h: 0.6, art: 2 },

  // 주방·식당
  { id: 'kitchen', type: 'kitchen', x: 6.0, z: 0.4, rot: 0 },
  { id: 'fridge', type: 'fridge', x: 4.84, z: 1.27, rot: 90 },
  { id: 'table', type: 'diningTable', x: 6.0, z: 3.0, rot: 0 },
  { id: 'chair1', type: 'chair', x: 5.6, z: 2.32, rot: 0 },
  { id: 'chair2', type: 'chair', x: 6.4, z: 2.32, rot: 0 },
  { id: 'chair3', type: 'chair', x: 5.6, z: 3.68, rot: 180 },
  { id: 'chair4', type: 'chair', x: 6.4, z: 3.68, rot: 180 },
  { id: 'kclock', type: 'clock', x: 7.54, z: 3.4, rot: -90, y: 1.9 },

  // 거실
  { id: 'sofa', type: 'sofa', x: 3.52, z: 7.0, rot: 90 },
  { id: 'rug', type: 'rug', x: 4.95, z: 7.05, rot: 90 },
  { id: 'coffee', type: 'coffeeTable', x: 4.85, z: 7.05, rot: 90 },
  { id: 'tv', type: 'tv', x: 7.33, z: 7.1, rot: -90 },
  { id: 'speaker', type: 'speaker', x: 7.36, z: 6.28, rot: -90, y: 0.45 },
  { id: 'floorlamp', type: 'floorLamp', x: 3.33, z: 8.33, rot: 45 },
  { id: 'aircon', type: 'standAC', x: 7.3, z: 8.3, rot: -135 },
  { id: 'vacdock', type: 'vacuumDock', x: 7.47, z: 6.05, rot: -90 },
  { id: 'livingart', type: 'art', x: 3.06, z: 7.0, rot: 90, y: 1.6, w: 1.1, h: 0.7, art: 0 },
  { id: 'kplant', type: 'plant', x: 7.28, z: 4.5, rot: 0, size: 0.8 },

  // 발코니
  { id: 'bchair1', type: 'campChair', x: 3.45, z: 9.4, rot: 0 },
  { id: 'bchair2', type: 'campChair', x: 4.55, z: 9.4, rot: 0 },
  { id: 'btable', type: 'sideTable', x: 4.0, z: 9.45, rot: 0 },
  { id: 'rack', type: 'dryingRack', x: 6.1, z: 9.35, rot: 0 },
  { id: 'bplant1', type: 'plant', x: 10.6, z: 9.65, rot: 0, size: 1.1 },
  { id: 'bplant2', type: 'plant', x: 9.95, z: 9.72, rot: 30, size: 0.7 },
  { id: 'bplant3', type: 'plant', x: 7.6, z: 9.7, rot: 70, size: 0.9 },

  // 작은방 (서재)
  { id: 'desk', type: 'desk', x: 1.5, z: 0.45, rot: 0, pc: true },
  { id: 'officechair', type: 'officeChair', x: 1.5, z: 1.2, rot: 180 },
  { id: 'bookshelf', type: 'bookshelf', x: 0.28, z: 1.65, rot: 90 },
  { id: 'piano', type: 'piano', x: 1.05, z: 2.76, rot: 180 },
  { id: 'pianobench', type: 'bench', x: 1.05, z: 2.25, rot: 0 },

  // 공용 욕실
  { id: 'tub', type: 'bathtub', x: 0.48, z: 3.9, rot: 90 },
  { id: 'toilet', type: 'toilet', x: 1.35, z: 4.4, rot: 180 },
  { id: 'vanity', type: 'vanity', x: 1.75, z: 3.3, rot: 0, mirror: true },

  // 침실 2
  { id: 'bed2', type: 'bed', x: 0.66, z: 7.49, rot: 180, size: 'single' },
  { id: 'night2', type: 'nightstand', x: 1.45, z: 8.3, rot: 180, lamp: true },
  { id: 'wardrobe2', type: 'wardrobe', x: 1.0, z: 5.16, rot: 0, w: 1.8 },
  { id: 'desk2', type: 'desk', x: 2.64, z: 7.15, rot: -90, w: 1.2 },
  { id: 'chair2b', type: 'officeChair', x: 2.05, z: 7.15, rot: 90 },

  // 안방
  { id: 'bed', type: 'bed', x: 9.88, z: 6.9, rot: -90, size: 'queen' },
  { id: 'nightL', type: 'nightstand', x: 10.72, z: 5.78, rot: -90, lamp: true },
  { id: 'nightR', type: 'nightstand', x: 10.72, z: 8.02, rot: -90, lamp: true },
  { id: 'dresser', type: 'dresser', x: 7.86, z: 7.3, rot: 90 },
  { id: 'wallac', type: 'wallAC', x: 7.66, z: 7.3, rot: 90, y: 2.0 },
  { id: 'mplant', type: 'plant', x: 8.0, z: 8.3, rot: 10, size: 0.9 },
  { id: 'mclock', type: 'clock', x: 10.9, z: 6.9, rot: -90, y: 1.95 },

  // 드레스룸
  { id: 'closet', type: 'clothesRack', x: 7.95, z: 3.62, rot: 90 },
  { id: 'dshelf', type: 'shelf', x: 8.97, z: 3.75, rot: -90, w: 1.6 },
  { id: 'dmirror', type: 'tallMirror', x: 8.55, z: 2.68, rot: 0 },

  // 안방 욕실
  { id: 'shower', type: 'showerBooth', x: 10.52, z: 3.08, rot: 0 },
  { id: 'mtoilet', type: 'toilet', x: 9.62, z: 3.05, rot: 90 },
  { id: 'mvanity', type: 'vanity', x: 9.5, z: 4.1, rot: 90, w: 0.7, mirror: false },

  // 다용도실
  { id: 'washer', type: 'washer', x: 8.6, z: 0.44, rot: 0 },
  { id: 'dryer', type: 'dryer', x: 9.3, z: 0.44, rot: 0 },
  { id: 'usink', type: 'utilitySink', x: 10.15, z: 0.4, rot: 0 },
  { id: 'ushelf', type: 'shelf', x: 9.4, z: 2.36, rot: 180, w: 1.4 },
  { id: 'boiler', type: 'boiler', x: 10.6, z: 0.1, rot: 0, y: 1.45 },

  // 커튼 · 블라인드
  // (벽에 붙는 물건은 x,z가 벽 표면, 앞면이 방 쪽)
  { id: 'curtainL', type: 'curtain', x: 5.3, z: 8.5, rot: 180, w: 3.9 },
  { id: 'curtainM', type: 'curtain', x: 9.3, z: 8.5, rot: 180, w: 2.7 },
  { id: 'blind2', type: 'blind', x: 1.5, z: 8.5, rot: 180, w: 2.1, sill: 0.9, head: 2.2 },
  { id: 'blindS', type: 'blind', x: 1.5, z: 0.1, rot: 0, w: 1.5, sill: 0.9, head: 2.1 },

  // 엘리베이터 홀
  { id: 'elevator', type: 'elevator', x: 4.15, z: -2.3, rot: 0 },
];

// 처음 서 있는 위치 (중문 지나 복도, 거실 방향)
export const SPAWN = { x: 3.72, z: 2.5, yaw: Math.PI - 0.12 };
