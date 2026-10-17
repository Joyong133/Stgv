'use strict';
// ───────────────────────── 기본 상수 ─────────────────────────
const TILE = 32;                         // 타일 한 칸 = 월드 32픽셀
const MAP_W = 96, MAP_H = 96;            // 맵 크기 (타일)
const WORLD_W = MAP_W * TILE, WORLD_H = MAP_H * TILE;
const N_TILES = MAP_W * MAP_H;
const TAU = Math.PI * 2;
const TEAM_COLOR = ['#3d8bff', '#e0405f'];
const TEAM_DARK = ['#1c4a94', '#7c1530'];
const TEAM_LIGHT = ['#a8cdff', '#ffa3b5'];

// ───────────────────────── 유틸 ─────────────────────────
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const randf = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return d;
}
function turnTo(cur, target, step) {
  const d = angDiff(cur, target);
  return Math.abs(d) <= step ? target : cur + Math.sign(d) * step;
}
function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// 점과 사각형 사이 거리 (안에 있으면 0)
function rectDist(px, py, rx, ry, rw, rh) {
  const dx = Math.max(rx - px, 0, px - (rx + rw));
  const dy = Math.max(ry - py, 0, py - (ry + rh));
  return Math.hypot(dx, dy);
}
// 점과 선분 사이 거리
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
  const t = l2 ? clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

// 좌표 해시 → 0..1 (같은 칸은 늘 같은 값)
function hash2(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// 부드러운 값 노이즈 0..1
function makeNoise(seed) {
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
}
function fbm(noise, x, y, oct = 3) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += noise(x * f, y * f) * amp; n += amp; amp *= 0.5; f *= 2; }
  return s / n;
}

// 색 섞기: '#rrggbb' 두 개를 t 비율로
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mixColor(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  const c = A.map((v, i) => Math.round(lerp(v, B[i], t)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function rgba(h, a) { const c = hexRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

// 설정 저장 (사파리 비공개 창 등에서는 조용히 실패)
const Store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 */ } },
};
