// 코드로 그린 텍스처 (회색조로 그리고 재질 색을 곱해서 씀) — 텍스처 1장 = 1m
import * as THREE from 'three';
import { canvasTexture, rng } from './util.js';

const cache = {};
const once = (key, fn) => cache[key] || (cache[key] = fn());

function noise(g, w, h, amount, seed, alpha = 1) {
  const r = rng(seed);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount * alpha;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

export function planks() {
  return once('planks', () =>
    canvasTexture(512, 512, (g, w, h) => {
      const r = rng(7);
      const rows = 6; // 약 0.17m 폭
      const rh = h / rows;
      for (let row = 0; row < rows; row++) {
        let x = -r() * w;
        while (x < w) {
          const len = w * (0.9 + r() * 0.6);
          const v = 200 + Math.floor(r() * 50);
          g.fillStyle = `rgb(${v},${v},${v})`;
          const draw = (ox) => {
            g.fillRect(x + ox, row * rh, len, rh);
            // 나뭇결
            for (let k = 0; k < 14; k++) {
              const yy = row * rh + r() * rh;
              g.strokeStyle = `rgba(0,0,0,${0.03 + r() * 0.06})`;
              g.lineWidth = 0.6 + r() * 1.4;
              g.beginPath();
              g.moveTo(x + ox, yy);
              g.bezierCurveTo(x + ox + len * 0.3, yy + (r() - 0.5) * 6, x + ox + len * 0.7, yy + (r() - 0.5) * 6, x + ox + len, yy + (r() - 0.5) * 4);
              g.stroke();
            }
            if (r() < 0.35) {
              g.fillStyle = 'rgba(60,40,20,0.12)';
              g.beginPath();
              g.ellipse(x + ox + r() * len, row * rh + rh * 0.5, 6 + r() * 6, 2 + r() * 2, 0, 0, Math.PI * 2);
              g.fill();
            }
            g.fillStyle = 'rgba(0,0,0,0.35)';
            g.fillRect(x + ox, row * rh, 1.5, rh);
          };
          draw(0);
          if (x + len > w) draw(-w);
          x += len;
        }
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.fillRect(0, row * rh, w, 1.5);
      }
      noise(g, w, h, 10, 3);
    })
  );
}

export function tiles(n = 4, key = 'tiles4', grout = 'rgba(120,120,120,1)') {
  return once(key, () =>
    canvasTexture(512, 512, (g, w, h) => {
      const r = rng(n * 11);
      g.fillStyle = grout;
      g.fillRect(0, 0, w, h);
      const s = w / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const v = 232 + Math.floor(r() * 18);
          g.fillStyle = `rgb(${v},${v},${v})`;
          g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
          const grd = g.createLinearGradient(i * s, j * s, i * s + s, j * s + s);
          grd.addColorStop(0, 'rgba(255,255,255,0.08)');
          grd.addColorStop(1, 'rgba(0,0,0,0.05)');
          g.fillStyle = grd;
          g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
        }
      noise(g, w, h, 8, n);
    })
  );
}

export function stone() {
  return once('stone', () =>
    canvasTexture(512, 512, (g, w, h) => {
      const r = rng(21);
      g.fillStyle = '#8a8a8a';
      g.fillRect(0, 0, w, h);
      const s = w / 2;
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++) {
          const v = 225 + Math.floor(r() * 25);
          g.fillStyle = `rgb(${v},${v},${v})`;
          g.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
          g.save();
          g.beginPath();
          g.rect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
          g.clip();
          for (let k = 0; k < 5; k++) {
            g.strokeStyle = `rgba(90,90,90,${0.08 + r() * 0.15})`;
            g.lineWidth = 0.6 + r() * 1.6;
            g.beginPath();
            let x = i * s + r() * s;
            let y = j * s;
            g.moveTo(x, y);
            for (let t = 0; t < 8; t++) {
              x += (r() - 0.5) * 50;
              y += s / 7;
              g.lineTo(x, y);
            }
            g.stroke();
          }
          g.restore();
        }
      noise(g, w, h, 14, 5);
    })
  );
}

export function wallpaper() {
  return once('wallpaper', () =>
    canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#f6f6f6';
      g.fillRect(0, 0, w, h);
      const r = rng(9);
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = `rgba(0,0,0,${r() * 0.03})`;
        g.fillRect(r() * w, r() * h, 1 + r() * 3, 1);
        g.fillStyle = `rgba(0,0,0,${r() * 0.025})`;
        g.fillRect(r() * w, r() * h, 1, 1 + r() * 3);
      }
      noise(g, w, h, 6, 9);
    })
  );
}

export function wallTiles() {
  return once('wallTiles', () =>
    canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = '#b8b8b8';
      g.fillRect(0, 0, w, h);
      const r = rng(31);
      const cols = 3;
      const rows = 5;
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          const v = 240 + Math.floor(r() * 12);
          g.fillStyle = `rgb(${v},${v},${v})`;
          g.fillRect((i * w) / cols + 1.5, (j * h) / rows + 1.5, w / cols - 3, h / rows - 3);
          const grd = g.createLinearGradient(0, (j * h) / rows, 0, ((j + 1) * h) / rows);
          grd.addColorStop(0, 'rgba(255,255,255,0.1)');
          grd.addColorStop(1, 'rgba(0,0,0,0.04)');
          g.fillStyle = grd;
          g.fillRect((i * w) / cols + 1.5, (j * h) / rows + 1.5, w / cols - 3, h / rows - 3);
        }
    })
  );
}

export function fabric() {
  return once('fabric', () =>
    canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#e8e8e8';
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) {
        g.fillStyle = 'rgba(0,0,0,0.05)';
        g.fillRect(0, y, w, 1);
      }
      for (let x = 0; x < w; x += 2) {
        g.fillStyle = 'rgba(255,255,255,0.06)';
        g.fillRect(x, 0, 1, h);
      }
      noise(g, w, h, 22, 4);
    })
  );
}

export function grain() {
  return once('grain', () =>
    canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#e4e4e4';
      g.fillRect(0, 0, w, h);
      const r = rng(13);
      for (let k = 0; k < 60; k++) {
        const y = r() * h;
        g.strokeStyle = `rgba(0,0,0,${0.03 + r() * 0.07})`;
        g.lineWidth = 0.5 + r() * 2;
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 14, w * 0.6, y + (r() - 0.5) * 14, w, y);
        g.stroke();
      }
      noise(g, w, h, 8, 13);
    })
  );
}

export function rugPattern() {
  return once('rug', () =>
    canvasTexture(512, 384, (g, w, h) => {
      g.fillStyle = '#d9d2c6';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#7d8a83';
      g.lineWidth = 14;
      g.strokeRect(22, 22, w - 44, h - 44);
      g.strokeStyle = '#b8794e';
      g.lineWidth = 4;
      g.strokeRect(46, 46, w - 92, h - 92);
      const r = rng(5);
      for (let i = 0; i < 9; i++) {
        g.fillStyle = ['#7d8a83', '#b8794e', '#c9b99c'][i % 3];
        g.beginPath();
        g.arc(110 + (i % 3) * 145, 110 + Math.floor(i / 3) * 82, 18 + r() * 10, 0, Math.PI * 2);
        g.fill();
      }
      noise(g, w, h, 26, 8);
    }, { repeat: false })
  );
}

// ── 바깥 풍경 ──
export function grass() {
  return once('grass', () =>
    canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#6f8f55';
      g.fillRect(0, 0, w, h);
      const r = rng(17);
      for (let i = 0; i < 2200; i++) {
        const v = r();
        g.fillStyle = v < 0.5 ? 'rgba(40,70,30,0.25)' : 'rgba(150,180,100,0.2)';
        g.fillRect(r() * w, r() * h, 2, 2 + r() * 3);
      }
    })
  );
}

export function facade(lit) {
  return once('facade' + (lit ? 'L' : 'D'), () =>
    canvasTexture(256, 512, (g, w, h) => {
      const r = rng(lit ? 99 : 98);
      g.fillStyle = lit ? '#000' : '#e2ded6';
      g.fillRect(0, 0, w, h);
      const cols = 8;
      const rows = 16;
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          const x = (i * w) / cols + 5;
          const y = (j * h) / rows + 7;
          const ww = w / cols - 10;
          const hh = h / rows - 13;
          if (lit) {
            if (r() < 0.45) {
              const warm = r() < 0.7;
              g.fillStyle = warm ? `rgba(255,${200 + r() * 40},${120 + r() * 60},1)` : 'rgba(190,215,255,1)';
              g.fillRect(x, y, ww, hh);
            }
          } else {
            g.fillStyle = r() < 0.5 ? '#7d8f9c' : '#93a3ae';
            g.fillRect(x, y, ww, hh);
            g.fillStyle = 'rgba(255,255,255,0.25)';
            g.fillRect(x, y, ww, 2);
          }
        }
      if (!lit) noise(g, w, h, 10, 2);
    })
  );
}

export function asphalt() {
  return once('asphalt', () =>
    canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#55585b';
      g.fillRect(0, 0, w, h);
      noise(g, w, h, 30, 6);
    })
  );
}

// 바닥 종류: 텍스처 + 색
export const FLOOR_TYPES = {
  oak: { name: '오크 마루', tex: planks, color: '#c99c6e' },
  walnut: { name: '월넛 마루', tex: planks, color: '#8c6142' },
  ash: { name: '화이트 오크', tex: planks, color: '#e3d2b6' },
  tile: { name: '밝은 타일', tex: () => tiles(4), color: '#e9e8e4' },
  tileGray: { name: '회색 타일', tex: () => tiles(3, 'tiles3'), color: '#b7b6b1' },
  stone: { name: '현무암 석재', tex: stone, color: '#8f8c87' },
  marble: { name: '대리석', tex: stone, color: '#f2efea' },
  deck: { name: '데크 타일', tex: () => tiles(2, 'tiles2', 'rgba(90,90,90,1)'), color: '#aaa59b' },
};

export const WALL_COLORS = ['#f2efe9', '#eeeae3', '#e6e1ee', '#dfe8e3', '#e3ebf2', '#f3e6da', '#ece5d8', '#d9e4d4', '#f4f4f2', '#d8dbe0', '#f0dede', '#cdd7c5'];

export function sRGB(hex) {
  return new THREE.Color(hex);
}
