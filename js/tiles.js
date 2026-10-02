'use strict';
// ───────────────────────── 지형 테마 ─────────────────────────
const THEMES = {
  island: { g: '#6cc650', g2: '#58b041', g3: '#8ade66', dirt: '#dcb97c', dirt2: '#c29a5e', wall: '#a07a54', wall2: '#84623f', tree: 'round', leaf: '#3c9a3a', leaf2: '#5cc04e', water: '#4ab0ee', sky: ['#8fd3ff', '#d8f2ff'], far: '#7cc0e8' },
  town: { g: '#72cc55', g2: '#5db847', g3: '#94e070', dirt: '#e2c288', dirt2: '#c8a468', wall: '#a07a54', wall2: '#84623f', tree: 'round', leaf: '#3ea040', leaf2: '#66c855', water: '#4ab0ee', sky: ['#9ad8ff', '#e6f6ff'], far: '#8ccaf0' },
  field: { g: '#66c04c', g2: '#52aa3e', g3: '#84d664', dirt: '#d6b074', dirt2: '#ba9158', wall: '#9a7450', wall2: '#7c5a3a', tree: 'round', leaf: '#368f36', leaf2: '#56b648', water: '#46a8e6', sky: ['#7ec8f8', '#d0eeff'], far: '#6aaee0' },
  forest: { g: '#3f9a5c', g2: '#33844d', g3: '#5ab874', dirt: '#b89a6a', dirt2: '#9a7c50', wall: '#6a5a44', wall2: '#504232', tree: 'tall', leaf: '#23704a', leaf2: '#3a9a62', water: '#3c98c8', sky: ['#5aa88a', '#bfe8c8'], far: '#3a8a6a' },
  rock: { g: '#c88c5c', g2: '#b4784a', g3: '#daa070', dirt: '#a86c44', dirt2: '#8c5636', wall: '#a8563a', wall2: '#843e28', tree: 'dead', leaf: '#8a6a3a', leaf2: '#a8885a', water: '#4a90c0', sky: ['#f0b070', '#ffe4b8'], far: '#c87a4a' },
  city: { g: '#5c6272', g2: '#535868', g3: '#686e80', dirt: '#8e94a2', dirt2: '#7a808e', wall: '#4a4f62', wall2: '#3a3e4e', tree: 'lamp', leaf: '#3a8a4a', leaf2: '#5aaa5a', water: '#3a6a8a', sky: ['#3a3f6a', '#8a7ab0'], far: '#2a2e4a' },
  cave: { g: '#4c423a', g2: '#40372f', g3: '#5a4e44', dirt: '#62564a', dirt2: '#52463c', wall: '#2e2722', wall2: '#221c18', tree: 'stalag', leaf: '#6a5a4a', leaf2: '#8a7a68', water: '#2a4a6a', sky: ['#1a1418', '#3a2e30'], far: '#2a2024' }
};

const SOLID_TILES = new Set(['~', '#', 'T', 'R', 'k', 'F', 'o', 'l', 'S', 'x']);

function hash2(x, y, s = 0) {
  let n = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

// 맵 전체를 아래층/위층 캔버스로 미리 그려 둔다 (도트 16px = 타일 1칸)
function renderMapLayers(map) {
  const T = THEMES[map.theme];
  const mw = map.w, mh = map.h;
  const lower = makeCanvas(mw * 16, mh * 16), upper = makeCanvas(mw * 16, mh * 16);
  const L = painter(lower), U = painter(upper);
  const at = (x, y) => (x < 0 || y < 0 || x >= mw || y >= mh) ? '#' : map.rows[y][x];
  map.water = [];

  for (let ty = 0; ty < mh; ty++) for (let tx = 0; tx < mw; tx++) {
    const ch = at(tx, ty), X = tx * 16, Y = ty * 16;
    const r = (s) => hash2(tx, ty, s);
    // 바닥
    const ground = () => {
      L.rect(X, Y, 16, 16, T.g);
      for (let i = 0; i < 6; i++) {
        const gx = X + Math.floor(r(i) * 15), gy = Y + 1 + Math.floor(r(i + 9) * 14);
        if (map.theme === 'city') { L.px(gx, gy, i % 2 ? T.g2 : T.g3); continue; }
        if (map.theme === 'cave' || map.theme === 'rock') { L.rect(gx, gy, 2, 1, i % 2 ? T.g2 : T.g3); continue; }
        L.px(gx, gy, T.g3); L.px(gx + 1, gy - 1, T.g3); L.px(gx + 1, gy, T.g2);
      }
    };
    switch (ch) {
      case ',': {
        ground();
        const cols = ['#ff6b8a', '#ffd23f', '#ffffff', '#c58aff', '#ff9a3c'];
        for (let i = 0; i < 3; i++) {
          const fx = X + 2 + Math.floor(r(20 + i) * 11), fy = Y + 2 + Math.floor(r(30 + i) * 11), fc = cols[Math.floor(r(40 + i) * cols.length)];
          L.px(fx - 1, fy, fc); L.px(fx + 1, fy, fc); L.px(fx, fy - 1, fc); L.px(fx, fy + 1, fc); L.px(fx, fy, '#ffe680');
        }
        break;
      }
      case ':': {
        L.rect(X, Y, 16, 16, T.dirt);
        for (let i = 0; i < 4; i++) L.rect(X + Math.floor(r(i) * 14), Y + Math.floor(r(i + 5) * 14), 2, 1, T.dirt2);
        const edge = (c) => c !== ':' && c !== '=' && c !== 'b' && c !== 's';
        if (edge(at(tx, ty - 1))) L.rect(X, Y, 16, 1, T.dirt2);
        if (edge(at(tx, ty + 1))) L.rect(X, Y + 15, 16, 1, T.dirt2);
        if (edge(at(tx - 1, ty))) L.rect(X, Y, 1, 16, T.dirt2);
        if (edge(at(tx + 1, ty))) L.rect(X + 15, Y, 1, 16, T.dirt2);
        break;
      }
      case '=': {
        const base = map.theme === 'city' ? '#9aa0ae' : map.theme === 'cave' ? '#6a5e52' : '#d8ccb4';
        const line = shade(base, -18);
        L.rect(X, Y, 16, 16, base);
        L.rect(X, Y + 7, 16, 1, line); L.rect(X, Y + 15, 16, 1, line);
        const off = ty % 2 ? 4 : 12;
        L.rect(X + off, Y, 1, 7, line); L.rect(X + (off + 8) % 16, Y + 8, 1, 7, line);
        L.px(X + 2, Y + 2, shade(base, 15));
        break;
      }
      case '~': {
        L.rect(X, Y, 16, 16, T.water);
        const hi = shade(T.water, 30);
        L.rect(X + 2 + Math.floor(r(1) * 6), Y + 4, 4, 1, hi); L.rect(X + 6 + Math.floor(r(2) * 5), Y + 11, 3, 1, hi);
        if (at(tx, ty - 1) !== '~') { L.rect(X, Y, 16, 2, '#e8f8ff'); L.rect(X, Y + 2, 16, 1, shade(T.water, 20)); }
        if (at(tx - 1, ty) !== '~') L.rect(X, Y, 1, 16, '#d0f0ff');
        if (at(tx + 1, ty) !== '~') L.rect(X + 15, Y, 1, 16, '#d0f0ff');
        map.water.push([tx, ty]);
        break;
      }
      case 's':
        L.rect(X, Y, 16, 16, '#f0dca2');
        for (let i = 0; i < 5; i++) L.px(X + Math.floor(r(i) * 16), Y + Math.floor(r(i + 7) * 16), '#d8c084');
        break;
      case 'b':
        L.rect(X, Y, 16, 16, '#b47c48');
        for (let i = 0; i < 4; i++) L.rect(X, Y + i * 4 + 3, 16, 1, '#8a5a30');
        L.px(X + 2, Y + 1, '#5a3a20'); L.px(X + 13, Y + 1, '#5a3a20');
        break;
      case '#': {
        const top = at(tx, ty - 1) !== '#';
        if (map.theme === 'city') {
          L.rect(X, Y, 16, 16, T.wall);
          L.rect(X, Y + 15, 16, 1, T.wall2);
          if (r(3) > 0.35) { const lit = r(4) > 0.5; L.rect(X + 3, Y + 3, 4, 5, lit ? '#ffe08a' : '#2a2e3e'); L.rect(X + 9, Y + 3, 4, 5, r(5) > 0.5 ? '#ffe08a' : '#2a2e3e'); }
          if (top) L.rect(X, Y, 16, 2, shade(T.wall, 20));
        } else {
          L.rect(X, Y, 16, 16, T.wall);
          for (let i = 0; i < 3; i++) L.rect(X + Math.floor(r(i) * 13), Y + 3 + Math.floor(r(i + 4) * 10), 3, 2, T.wall2);
          L.rect(X + Math.floor(r(8) * 14), Y, 1, 16, T.wall2);
          if (top) {
            const lip = map.theme === 'cave' ? shade(T.wall, 25) : map.theme === 'rock' ? T.g : T.g;
            L.rect(X, Y, 16, 4, lip); L.rect(X, Y + 4, 16, 1, shade(lip, -30));
            if (map.theme !== 'cave') for (let i = 0; i < 4; i++) L.px(X + Math.floor(r(i + 20) * 16), Y + 5, lip);
          }
          if (at(tx, ty + 1) !== '#') L.rect(X, Y + 14, 16, 2, T.wall2);
        }
        break;
      }
      default:
        ground();
    }
    // 바닥 위의 물건
    switch (ch) {
      case 'T': drawTree(L, U, X, Y, T, map.theme, r); break;
      case 'R':
        L.ell(X + 8, Y + 10, 7, 5.5, '#9a9aa6'); L.ell(X + 7, Y + 8, 4, 2.5, '#c0c0cc'); L.rect(X + 2, Y + 13, 12, 2, '#6a6a76');
        break;
      case 'k':
        L.ell(X + 8, Y + 9, 7.5, 6.5, T.leaf); L.ell(X + 6, Y + 7, 4, 3, T.leaf2); L.px(X + 4, Y + 6, shade(T.leaf2, 30));
        if (map.theme !== 'cave' && r(7) > 0.5) { L.px(X + 10, Y + 6, '#ff5a6a'); L.px(X + 5, Y + 11, '#ff5a6a'); }
        break;
      case 'F':
        L.rect(X, Y + 6, 16, 2, '#c08a52'); L.rect(X, Y + 11, 16, 2, '#c08a52');
        L.rect(X + 2, Y + 3, 3, 12, '#9a6a3a'); L.rect(X + 11, Y + 3, 3, 12, '#9a6a3a');
        L.rect(X + 2, Y + 3, 3, 1, '#d8a870'); L.rect(X + 11, Y + 3, 3, 1, '#d8a870');
        break;
      case 'o':
        L.ell(X + 8, Y + 9, 6, 6.5, '#a8703a'); L.rect(X + 2, Y + 6, 12, 1, '#5a5a62'); L.rect(X + 2, Y + 12, 12, 1, '#5a5a62');
        L.ell(X + 8, Y + 3.5, 5, 1.6, '#c89058');
        break;
      case 'l':
        L.rect(X + 7, Y - 2, 2, 17, '#3a3e4a'); L.rect(X + 5, Y + 13, 6, 2, '#3a3e4a');
        U.rect(X + 4, Y - 8, 8, 6, '#3a3e4a'); U.rect(X + 5, Y - 7, 6, 4, '#ffe9a0');
        break;
      case 'S':
        L.rect(X + 7, Y + 6, 2, 9, '#7a4a26'); L.rect(X + 1, Y + 1, 14, 7, '#c8925a'); L.rect(X + 2, Y + 2, 12, 5, '#e0b07a');
        L.rect(X + 4, Y + 4, 8, 1, '#7a4a26');
        break;
    }
  }

  // 건물
  for (const h of map.houses || []) drawHouse(L, U, h, T);
  map.lower = lower; map.upper = upper;
}

function drawTree(L, U, X, Y, T, theme, r) {
  switch (T.tree) {
    case 'round':
      L.rect(X + 6, Y + 6, 4, 9, '#8a5a30'); L.rect(X + 6, Y + 6, 1, 9, '#6a4220'); L.ell(X + 8, Y + 15, 5, 1.5, 'rgba(0,0,0,0.2)');
      U.ell(X + 8, Y + 1, 9, 8.5, T.leaf); U.ell(X + 6, Y - 2, 5.5, 4.5, T.leaf2); U.ell(X + 11, Y + 3, 3.5, 3, T.leaf2);
      U.px(X + 4, Y - 4, shade(T.leaf2, 35)); U.px(X + 5, Y - 5, shade(T.leaf2, 35));
      if (r(11) > 0.6) { U.px(X + 12, Y - 1, '#ff5a4a'); U.px(X + 3, Y + 3, '#ff5a4a'); }
      break;
    case 'tall':
      L.rect(X + 5, Y + 2, 6, 13, '#6a4a32'); L.rect(X + 5, Y + 2, 2, 13, '#4a3222'); L.rect(X + 3, Y + 13, 10, 2, '#6a4a32');
      U.ell(X + 8, Y - 6, 10, 9, T.leaf); U.ell(X + 8, Y - 2, 9, 5, shade(T.leaf, -15)); U.ell(X + 5, Y - 9, 5, 4, T.leaf2); U.ell(X + 12, Y - 5, 3, 3, T.leaf2);
      break;
    case 'dead':
      L.rect(X + 7, Y + 2, 3, 13, '#6a4a32'); L.line(X + 8, Y + 6, X + 3, Y + 1, '#6a4a32'); L.line(X + 9, Y + 4, X + 13, Y - 1, '#6a4a32');
      U.line(X + 8, Y + 2, X + 6, Y - 4, '#6a4a32'); U.line(X + 3, Y + 1, X + 1, Y - 1, '#6a4a32');
      break;
    case 'lamp':
      L.rect(X + 7, Y - 1, 2, 16, '#2a2e3a'); L.rect(X + 5, Y + 13, 6, 2, '#2a2e3a');
      U.rect(X + 4, Y - 7, 8, 6, '#2a2e3a'); U.rect(X + 5, Y - 6, 6, 4, '#ffe9a0'); U.rect(X + 2, Y - 8, 12, 1, '#2a2e3a');
      break;
    case 'stalag':
      L.tri(X + 2, Y + 15, X + 14, Y + 15, X + 8, Y - 6, '#5a4c40'); L.tri(X + 4, Y + 15, X + 8, Y + 15, X + 7, Y - 2, '#7a6a5a');
      L.px(X + 7, Y + 4, '#9a8a78');
      break;
  }
}

function drawHouse(L, U, h, T) {
  const X = h.x * 16, Y = h.y * 16, w = h.w * 16, ht = h.h * 16;
  const roof = h.roof || '#e04a3a';
  const door = (dx, dy) => { L.rect(dx - 4, dy - 10, 8, 10, '#6a3e20'); L.rect(dx - 3, dy - 9, 6, 9, '#8a5430'); L.px(dx + 1, dy - 5, '#ffd23f'); };
  switch (h.style) {
    case 'mushroom': {
      const sx = X + w * 0.18, sw = w * 0.64;
      L.rect(sx, Y + ht * 0.45, sw, ht * 0.55, '#fbe6c8');
      L.rect(sx, Y + ht * 0.45, 2, ht * 0.55, shade('#fbe6c8', -15));
      door(X + w / 2, Y + ht);
      L.ell(sx + sw * 0.22, Y + ht * 0.66, 3, 3, '#7ac8ff'); L.ell(sx + sw * 0.78, Y + ht * 0.66, 3, 3, '#7ac8ff');
      L.ell(X + w / 2, Y + ht * 0.36, w / 2, ht * 0.36, roof, y => y <= Y + ht * 0.48);
      L.rect(X + 2, Y + ht * 0.44, w - 4, 3, shade(roof, -25));
      [[0.25, 0.2], [0.55, 0.12], [0.78, 0.3], [0.4, 0.34]].forEach(([fx, fy], i) => L.ell(X + w * fx, Y + ht * fy, 3 - (i % 2), 2.2, '#ffffff'));
      break;
    }
    case 'cottage': {
      L.rect(X + 2, Y + ht * 0.4, w - 4, ht * 0.6, '#e8d2a8');
      for (let i = 0; i < 4; i++) L.rect(X + 2, Y + ht * 0.4 + 6 + i * 6, w - 4, 1, '#cbb084');
      door(X + w / 2, Y + ht);
      L.rect(X + 8, Y + ht * 0.55, 8, 7, '#7ac8ff'); L.rect(X + w - 16, Y + ht * 0.55, 8, 7, '#7ac8ff');
      L.tri(X - 2, Y + ht * 0.44, X + w + 2, Y + ht * 0.44, X + w / 2, Y, roof);
      L.rect(X - 2, Y + ht * 0.42, w + 4, 3, shade(roof, -25));
      L.rect(X + w * 0.72, Y + 4, 5, 10, '#8a6a5a');
      break;
    }
    case 'tree': {
      L.rect(X + w * 0.25, Y + ht * 0.3, w * 0.5, ht * 0.7, '#7a5236');
      L.rect(X + w * 0.25, Y + ht * 0.3, 3, ht * 0.7, '#5a3a24');
      door(X + w / 2, Y + ht);
      L.ell(X + w / 2, Y + ht * 0.55, 3, 3, '#ffe08a');
      L.ell(X + w / 2, Y + ht * 0.24, w / 2, ht * 0.26, T.leaf); L.ell(X + w * 0.35, Y + ht * 0.16, w * 0.22, ht * 0.14, T.leaf2);
      break;
    }
    case 'tent': {
      L.tri(X, Y + ht, X + w, Y + ht, X + w / 2, Y + 2, roof);
      for (let i = 1; i < 4; i++) L.line(X + w / 2, Y + 2, X + (w * i) / 4, Y + ht, shade(roof, -25));
      L.tri(X + w / 2 - 7, Y + ht, X + w / 2 + 7, Y + ht, X + w / 2, Y + ht * 0.5, '#3a2418');
      L.rect(X + w / 2, Y - 4, 1, 7, '#5a3a20'); L.tri(X + w / 2 + 1, Y - 4, X + w / 2 + 1, Y, X + w / 2 + 7, Y - 2, '#ffd23f');
      break;
    }
    case 'building': {
      L.rect(X, Y, w, ht, '#3a4054'); L.rect(X, Y, w, 3, '#5a6276');
      for (let yy = Y + 7; yy < Y + ht - 14; yy += 10) for (let xx = X + 4; xx < X + w - 6; xx += 9) L.rect(xx, yy, 5, 6, hash2(xx, yy) > 0.4 ? '#ffe08a' : '#1e2230');
      L.rect(X + w / 2 - 6, Y + ht - 12, 12, 12, '#1a1d28'); L.rect(X + w / 2 - 5, Y + ht - 11, 10, 11, '#4a6a8a');
      L.rect(X + 4, Y + ht - 16, w - 8, 3, roof);
      break;
    }
    case 'stall': {
      L.rect(X + 3, Y + ht * 0.45, w - 6, ht * 0.55, '#c08a52');
      L.rect(X + 3, Y + ht * 0.45, w - 6, 3, '#e0b07a');
      for (let i = 0; i < w / 6; i++) L.rect(X + i * 6, Y + ht * 0.2, 6, 8, i % 2 ? '#ffffff' : roof);
      L.rect(X, Y + ht * 0.2 + 8, w, 2, shade(roof, -25));
      L.rect(X + 4, Y + ht * 0.2, 2, ht * 0.3, '#7a4a26'); L.rect(X + w - 6, Y + ht * 0.2, 2, ht * 0.3, '#7a4a26');
      for (let i = 0; i < 3; i++) L.ell(X + 10 + i * 10, Y + ht * 0.45 - 2, 3, 2.5, ['#ff5a4a', '#ffd23f', '#5fbf4a'][i]);
      break;
    }
    case 'ship': {
      L.tri(X, Y + ht * 0.45, X + 12, Y + ht, X + 12, Y + ht * 0.45, '#8a5430');
      L.rect(X + 12, Y + ht * 0.45, w - 24, ht * 0.55, '#8a5430');
      L.tri(X + w, Y + ht * 0.45, X + w - 12, Y + ht, X + w - 12, Y + ht * 0.45, '#8a5430');
      L.rect(X, Y + ht * 0.45, w, 3, '#c08a52'); L.rect(X + 10, Y + ht * 0.7, w - 20, 2, '#6a3a1a');
      for (let i = 0; i < 4; i++) L.ell(X + 22 + i * 14, Y + ht * 0.6, 2, 2, '#ffe08a');
      L.rect(X + w / 2 - 1, Y - 10, 3, ht * 0.5 + 10, '#6a4220');
      L.tri(X + w / 2 + 2, Y - 8, X + w / 2 + 2, Y + ht * 0.38, X + w / 2 + 24, Y + ht * 0.36, '#f4f0e6');
      L.tri(X + w / 2 - 2, Y - 4, X + w / 2 - 2, Y + ht * 0.36, X + w / 2 - 20, Y + ht * 0.34, '#e8e2d4');
      drawMapleLeaf(L.g, X + w / 2 + 11, Y + ht * 0.18, 5, '#ff8a1f');
      break;
    }
    case 'statue': {
      L.rect(X + 4, Y + ht - 10, w - 8, 10, '#a8a8b4'); L.rect(X + 4, Y + ht - 10, w - 8, 2, '#c8c8d4');
      drawMapleLeaf(L.g, X + w / 2, Y + ht * 0.4, Math.min(w, ht) * 0.4, '#ff8a1f');
      break;
    }
  }
}
