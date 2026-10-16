// 소리: 모든 효과음 · 음악을 코드로 합성 (WebAudio, 3D 위치 소리)
import * as THREE from 'three';

const TAU = Math.PI * 2;
const rnd = () => Math.random() * 2 - 1;

function lp(fc, sr) {
  const a = 1 - Math.exp((-TAU * fc) / sr);
  let y = 0;
  return (x) => (y += a * (x - y));
}
function loopify(arr, fade) {
  const n = arr.length - fade;
  const out = new Float32Array(n);
  out.set(arr.subarray(0, n));
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    out[i] = arr[i] * k + arr[n + i] * (1 - k);
  }
  return out;
}
function norm(arr, peak = 0.8) {
  let m = 0;
  for (const v of arr) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < arr.length; i++) arr[i] *= peak / m;
  return arr;
}
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

// 이름 → (sr) => Float32Array
const GEN = {
  click(sr) {
    const a = new Float32Array(sr * 0.06);
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      a[i] = rnd() * Math.exp(-t * 140) * 0.5 + Math.sin(TAU * 2300 * t) * Math.exp(-t * 220) * 0.4;
    }
    return a;
  },
  switch(sr) {
    const a = new Float32Array(sr * 0.08);
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      a[i] = (rnd() * 0.6 + Math.sin(TAU * 1500 * t) * 0.5) * Math.exp(-t * 160) + (t > 0.025 ? rnd() * 0.3 * Math.exp(-(t - 0.025) * 200) : 0);
    }
    return a;
  },
  tick(sr) {
    const a = new Float32Array(sr * 0.03);
    for (let i = 0; i < a.length; i++) a[i] = Math.sin(TAU * 3200 * (i / sr)) * Math.exp((-i / sr) * 300) * 0.5;
    return a;
  },
  beep(sr) {
    const a = new Float32Array(sr * 0.14);
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      a[i] = Math.sin(TAU * 2093 * t) * Math.min(1, t * 400) * Math.min(1, (0.14 - t) * 60) * 0.5;
    }
    return a;
  },
  doorOpen(sr) {
    const a = new Float32Array(sr * 0.9);
    const f = lp(900, sr);
    let ph = 0;
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      const latch = t < 0.04 ? rnd() * Math.exp(-t * 120) * 0.6 : 0;
      const env = t > 0.05 ? Math.sin(Math.min(1, (t - 0.05) / 0.75) * Math.PI) : 0;
      ph += (170 + 50 * Math.sin(t * 7) + 20 * Math.sin(t * 23)) / sr;
      const creak = ((ph % 1) * 2 - 1) * (0.5 + 0.5 * Math.sin(t * 90)) * 0.12;
      a[i] = latch + f(creak + rnd() * 0.05) * env * 1.2;
    }
    return norm(a, 0.6);
  },
  doorClose(sr) {
    const a = new Float32Array(sr * 0.45);
    const f = lp(500, sr);
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      a[i] = Math.sin(TAU * 70 * t) * Math.exp(-t * 14) * 0.8 + f(rnd()) * Math.exp(-t * 28) * 1.2 + (t > 0.05 && t < 0.09 ? rnd() * Math.exp(-(t - 0.05) * 90) * 0.4 : 0);
    }
    return norm(a, 0.8);
  },
  doorlock(sr) {
    const a = new Float32Array(sr * 1.0);
    const notes = [1047, 1319, 1568, 2093];
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      const k = Math.floor(t / 0.09);
      if (k < 4) {
        const tt = t - k * 0.09;
        a[i] = Math.sign(Math.sin(TAU * notes[k] * t)) * 0.2 * Math.min(1, (0.08 - tt) * 80) * (tt < 0.08 ? 1 : 0);
      } else if (t > 0.45 && t < 0.85) {
        const tt = t - 0.45;
        a[i] = (((t * 95) % 1) * 2 - 1) * 0.25 * Math.sin((tt / 0.4) * Math.PI) + rnd() * 0.05;
      }
    }
    return a;
  },
  lockClose(sr) {
    const a = new Float32Array(sr * 0.7);
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      if (t < 0.3) a[i] = (((t * 90) % 1) * 2 - 1) * 0.22 * Math.sin((t / 0.3) * Math.PI);
      else if (t < 0.4) a[i] = Math.sin(TAU * 1568 * t) * 0.25;
      else if (t > 0.45 && t < 0.55) a[i] = Math.sin(TAU * 1047 * t) * 0.25;
    }
    return a;
  },
  slide(sr) {
    const a = new Float32Array(sr * 0.8);
    const f = lp(700, sr);
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      a[i] = f(rnd()) * Math.sin((t / 0.8) * Math.PI) * (0.8 + 0.2 * Math.sin(t * 60)) + Math.sin(TAU * 55 * t) * 0.05;
    }
    return norm(a, 0.5);
  },
  curtain(sr) {
    const a = new Float32Array(sr * 0.9);
    const f = lp(3000, sr);
    const g = lp(600, sr);
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      const x = rnd();
      a[i] = (f(x) - g(x)) * Math.sin((t / 0.9) * Math.PI) ** 2;
    }
    return norm(a, 0.35);
  },
  cabinetOpen(sr) {
    const a = new Float32Array(sr * 0.25);
    const f = lp(1200, sr);
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      a[i] = f(rnd()) * Math.exp(-t * 25) + Math.sin(TAU * 180 * t) * Math.exp(-t * 40) * 0.3;
    }
    return norm(a, 0.5);
  },
  cabinetClose(sr) {
    const a = new Float32Array(sr * 0.25);
    const f = lp(600, sr);
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      a[i] = f(rnd()) * Math.exp(-t * 35) + Math.sin(TAU * 110 * t) * Math.exp(-t * 30) * 0.5;
    }
    return norm(a, 0.6);
  },
  drawer(sr) {
    const a = new Float32Array(sr * 0.45);
    const f = lp(1600, sr);
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      a[i] = f(rnd()) * Math.sin((t / 0.45) * Math.PI) * (0.7 + 0.3 * Math.sin(t * 140));
    }
    return norm(a, 0.4);
  },
  water(sr) {
    const n = sr * 2.3;
    const a = new Float32Array(n);
    const f1 = lp(3500, sr);
    const f2 = lp(250, sr);
    let flutter = 0;
    for (let i = 0; i < n; i++) {
      flutter += (rnd() * 0.5 - flutter) * 0.002;
      const x = rnd();
      a[i] = (f1(x) - f2(x)) * (0.8 + flutter * 0.4) + (Math.random() < 0.0008 ? 0.6 : 0);
    }
    return loopify(norm(a, 0.5), sr * 0.3);
  },
  shower(sr) {
    const n = sr * 2.3;
    const a = new Float32Array(n);
    const f1 = lp(6000, sr);
    const f2 = lp(500, sr);
    for (let i = 0; i < n; i++) {
      const x = rnd();
      a[i] = f1(x) - f2(x);
    }
    return loopify(norm(a, 0.45), sr * 0.3);
  },
  flush(sr) {
    const a = new Float32Array(sr * 3.6);
    let y = 0;
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      const fc = 2200 - t * 450;
      const k = 1 - Math.exp((-TAU * Math.max(200, fc)) / sr);
      y += k * (rnd() - y);
      const env = Math.min(1, t * 6) * Math.exp(-Math.max(0, t - 1.4) * 1.6);
      const gurgle = Math.sin(TAU * (120 + 80 * Math.sin(t * 13)) * t) * 0.25 * (t > 1.2 ? Math.exp(-(t - 1.2) * 1.2) : 0) * (Math.sin(t * 31) > 0.3 ? 1 : 0.2);
      a[i] = y * env + gurgle;
    }
    return norm(a, 0.7);
  },
  drain(sr) {
    const a = new Float32Array(sr * 2);
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      a[i] = Math.sin(TAU * (160 + 140 * Math.abs(Math.sin(t * 9))) * t) * (Math.sin(t * 27) > 0.6 ? 0.4 : 0.05) * Math.min(1, (2 - t) * 2);
    }
    return a;
  },
  splash(sr) {
    const a = new Float32Array(sr * 0.7);
    const f = lp(2500, sr);
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      a[i] = f(rnd()) * Math.exp(-t * 7) + (Math.random() < 0.002 ? Math.sin(TAU * 900 * t) * 0.5 : 0);
    }
    return norm(a, 0.5);
  },
  hum(sr) {
    const n = sr * 2;
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      a[i] = Math.sin(TAU * 60 * t) * 0.5 + Math.sin(TAU * 120 * t) * 0.25 + rnd() * 0.03;
    }
    return a;
  },
  fridgeHum(sr) {
    const n = sr * 2;
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      a[i] = Math.sin(TAU * 55 * t) * 0.4 + Math.sin(TAU * 110 * t) * 0.2 + Math.sin(TAU * 220 * t) * 0.05 + rnd() * 0.02;
    }
    return a;
  },
  ac(sr) {
    const n = sr * 2.3;
    const a = new Float32Array(n);
    const f = lp(900, sr);
    for (let i = 0; i < n; i++) a[i] = f(rnd()) * 1.6 + Math.sin(TAU * 100 * (i / sr)) * 0.04;
    return loopify(norm(a, 0.5), sr * 0.3);
  },
  hood(sr) {
    const n = sr * 2.3;
    const a = new Float32Array(n);
    const f = lp(1300, sr);
    for (let i = 0; i < n; i++) a[i] = f(rnd()) * 1.4 + Math.sin(TAU * 100 * (i / sr)) * 0.1;
    return loopify(norm(a, 0.55), sr * 0.3);
  },
  microwave(sr) {
    const n = sr * 2;
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      a[i] = Math.sign(Math.sin(TAU * 120 * t)) * 0.12 + Math.sin(TAU * 240 * t) * 0.15 + rnd() * 0.03;
    }
    return a;
  },
  sizzle(sr) {
    const n = sr * 2.3;
    const a = new Float32Array(n);
    const f = lp(5000, sr);
    const g = lp(1500, sr);
    for (let i = 0; i < n; i++) {
      const x = rnd() * (Math.random() < 0.02 ? 3 : 0.4);
      a[i] = f(x) - g(x);
    }
    return loopify(norm(a, 0.4), sr * 0.3);
  },
  washer(sr) {
    const n = sr * 4.3;
    const a = new Float32Array(n);
    const f = lp(500, sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const slosh = f(rnd()) * (0.5 + 0.5 * Math.sin(t * Math.PI));
      a[i] = Math.sin(TAU * 45 * t) * 0.3 * (0.6 + 0.4 * Math.sin(t * TAU)) + slosh * 1.5;
    }
    return loopify(norm(a, 0.5), sr * 0.3);
  },
  dryer(sr) {
    const n = sr * 3.1;
    const a = new Float32Array(n);
    const f = lp(700, sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const ph = t % 0.7;
      a[i] = f(rnd()) * 0.8 + Math.sin(TAU * 70 * t) * Math.exp(-ph * 30) * 0.6 + Math.sin(TAU * 80 * t) * 0.08;
    }
    return loopify(norm(a, 0.45), sr * 0.1);
  },
  vacuum(sr) {
    const n = sr * 2.3;
    const a = new Float32Array(n);
    const f = lp(2500, sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      a[i] = Math.sin(TAU * 1150 * t) * 0.08 + Math.sin(TAU * 180 * t) * 0.15 + f(rnd()) * 0.6;
    }
    return loopify(norm(a, 0.4), sr * 0.3);
  },
  ding(sr) {
    const a = new Float32Array(sr * 1.8);
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      const t2 = Math.max(0, t - 0.35);
      a[i] =
        (Math.sin(TAU * 1319 * t) + Math.sin(TAU * 2638 * t) * 0.3) * Math.exp(-t * 3) * 0.5 +
        (t > 0.35 ? (Math.sin(TAU * 1047 * t2) + Math.sin(TAU * 2094 * t2) * 0.3) * Math.exp(-t2 * 2.5) * 0.5 : 0);
    }
    return norm(a, 0.6);
  },
  melody(sr) {
    const notes = [72, 76, 79, 84, 79, 84];
    const a = new Float32Array(sr * 2.4);
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      const k = Math.min(notes.length - 1, Math.floor(t / 0.3));
      const tt = t - k * 0.3;
      const f = mtof(notes[k]);
      a[i] = (Math.sin(TAU * f * t) + Math.sin(TAU * 2 * f * t) * 0.2) * Math.exp(-tt * (k === notes.length - 1 ? 2 : 6)) * 0.4;
    }
    return a;
  },
  boot(sr) {
    const notes = [60, 67, 72, 76];
    const a = new Float32Array(sr * 1.8);
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      let v = 0;
      notes.forEach((m, k) => {
        const tt = t - k * 0.08;
        if (tt > 0) v += Math.sin(TAU * mtof(m) * t) * Math.exp(-tt * 2) * 0.2;
      });
      a[i] = v;
    }
    return a;
  },
  ignite(sr) {
    const a = new Float32Array(sr * 1.1);
    let y = 0;
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      const k = 1 - Math.exp((-TAU * (200 + t * 900)) / sr);
      y += k * (rnd() - y);
      a[i] = (t < 0.03 ? rnd() * 0.5 : 0) + y * Math.sin(Math.min(1, t / 1.1) * Math.PI) * 1.3;
    }
    return norm(a, 0.5);
  },
  meow(sr) {
    const a = new Float32Array(sr * 0.85);
    let ph = 0;
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      const k = t / 0.85;
      const f0 = 480 + 320 * Math.sin(Math.min(1, k * 1.4) * Math.PI) - 80 * k + 8 * Math.sin(t * 40);
      ph += f0 / sr;
      let v = 0;
      for (let h = 1; h <= 8; h++) v += Math.sin(TAU * ph * h) * (h === 2 || h === 3 ? 0.9 : 0.4 / h);
      a[i] = v * Math.sin(k * Math.PI) ** 0.6 * 0.25;
    }
    return norm(a, 0.6);
  },
  purr(sr) {
    const n = sr * 1.6;
    const a = new Float32Array(n);
    const f = lp(220, sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      a[i] = f(rnd()) * (0.4 + 0.6 * Math.max(0, Math.sin(TAU * 24 * t))) * Math.sin((t / 1.6) * Math.PI);
    }
    return norm(a, 0.7);
  },
  squeak(sr) {
    const a = new Float32Array(sr * 0.32);
    let ph = 0;
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      ph += (1300 + 900 * Math.sin((t / 0.32) * Math.PI) + 60 * Math.sin(t * 90)) / sr;
      a[i] = Math.sin(TAU * ph) * Math.sin((t / 0.32) * Math.PI) * 0.4;
    }
    return a;
  },
  pop(sr) {
    const a = new Float32Array(sr * 0.08);
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      a[i] = Math.sin(TAU * (600 - t * 4000) * t) * Math.exp(-t * 50) * 0.5;
    }
    return a;
  },
  thud(sr) {
    const a = new Float32Array(sr * 0.2);
    const f = lp(800, sr);
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      a[i] = Math.sin(TAU * 120 * t) * Math.exp(-t * 30) * 0.6 + f(rnd()) * Math.exp(-t * 50);
    }
    return norm(a, 0.6);
  },
  rain(sr) {
    const n = sr * 3.3;
    const a = new Float32Array(n);
    const f = lp(7000, sr);
    const g = lp(400, sr);
    for (let i = 0; i < n; i++) {
      const x = rnd();
      a[i] = (f(x) - g(x)) * 0.7 + (Math.random() < 0.004 ? rnd() * 0.8 : 0);
    }
    return loopify(norm(a, 0.5), sr * 0.3);
  },
  birds(sr) {
    const n = sr * 9;
    const a = new Float32Array(n);
    const chirps = [];
    for (let k = 0; k < 14; k++) chirps.push({ t: Math.random() * 8.4, f: 2500 + Math.random() * 2500, d: 0.05 + Math.random() * 0.12, s: (Math.random() - 0.3) * 4000, n: 1 + ((Math.random() * 3) | 0) });
    for (const c of chirps) {
      for (let r = 0; r < c.n; r++) {
        const start = Math.floor((c.t + r * (c.d + 0.04)) * sr);
        const len = Math.floor(c.d * sr);
        let ph = 0;
        for (let i = 0; i < len && start + i < n; i++) {
          const t = i / sr;
          ph += (c.f + c.s * (t / c.d)) / sr;
          a[start + i] += Math.sin(TAU * ph) * Math.sin((t / c.d) * Math.PI) * 0.3;
        }
      }
    }
    return a;
  },
  crickets(sr) {
    const n = sr * 4;
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const train = t % 0.9 < 0.3 ? 1 : 0;
      const pulse = Math.max(0, Math.sin(TAU * 32 * t));
      a[i] = Math.sin(TAU * 4400 * t) * pulse * train * 0.12 + Math.sin(TAU * 3900 * (t + 0.37)) * Math.max(0, Math.sin(TAU * 28 * t)) * ((t + 0.4) % 1.3 < 0.35 ? 1 : 0) * 0.07;
    }
    return a;
  },
  waves(sr) {
    const n = sr * 8.3;
    const a = new Float32Array(n);
    const f = lp(900, sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const swell = 0.25 + 0.75 * Math.max(0, Math.sin((t / 8) * TAU * 2)) ** 2;
      a[i] = f(rnd()) * swell * 2;
    }
    return loopify(norm(a, 0.5), sr * 0.3);
  },
  tvNews(sr) {
    const bpm = 96;
    const beat = 60 / bpm;
    const n = Math.floor(sr * beat * 16);
    const a = new Float32Array(n);
    const chords = [[62, 65, 69], [60, 64, 67], [58, 62, 65], [60, 64, 67]];
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const bar = Math.floor(t / (beat * 4)) % 4;
      let v = 0;
      for (const m of chords[bar]) v += Math.sin(TAU * mtof(m) * t) * 0.12;
      const b = Math.floor(t / (beat / 2));
      const tt = t - b * (beat / 2);
      const arp = chords[bar][b % 3] + 12;
      v += Math.sin(TAU * mtof(arp) * t) * Math.exp(-tt * 6) * 0.15;
      v += Math.sin(TAU * mtof(chords[bar][0] - 24) * t) * 0.15;
      a[i] = v;
    }
    return norm(a, 0.5);
  },
  chiptune(sr) {
    const step = 0.15;
    const mel = [72, 76, 79, 76, 77, 81, 84, 81, 79, 76, 72, 76, 74, 77, 79, 0, 72, 76, 79, 84, 83, 79, 76, 74, 72, 74, 76, 77, 79, 77, 76, 74];
    const bass = [48, 48, 53, 53, 55, 55, 48, 48];
    const n = Math.floor(sr * step * mel.length);
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const k = Math.floor(t / step);
      const tt = t - k * step;
      let v = 0;
      if (mel[k]) v += (Math.sin(TAU * mtof(mel[k]) * t) > 0 ? 0.12 : -0.12) * Math.min(1, (step - tt) * 30);
      const bk = Math.floor(t / (step * 4)) % bass.length;
      v += (((t * mtof(bass[bk])) % 1) * 2 - 1) * 0.1;
      if (k % 2 === 0) v += rnd() * Math.exp(-tt * 60) * 0.15;
      a[i] = v;
    }
    return a;
  },
  lofi(sr) {
    const bpm = 78;
    const beat = 60 / bpm;
    const bars = 4;
    const n = Math.floor(sr * beat * 4 * bars);
    const a = new Float32Array(n);
    const chords = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]];
    const mel = [76, 0, 74, 72, 0, 69, 72, 0, 74, 0, 72, 71, 0, 67, 69, 0];
    const f = lp(1800, sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const bar = Math.floor(t / (beat * 4)) % 4;
      const inBar = t - Math.floor(t / (beat * 4)) * beat * 4;
      let v = 0;
      const trem = 0.8 + 0.2 * Math.sin(TAU * 4 * t);
      for (const m of chords[bar]) {
        const fr = mtof(m);
        v += (Math.sin(TAU * fr * t) + Math.sin(TAU * fr * 2 * t) * 0.15) * 0.07 * trem * Math.exp(-inBar * 0.4);
      }
      v += Math.sin(TAU * mtof(chords[bar][0] - 12) * t) * 0.14 * (inBar % (beat * 2) < beat * 1.6 ? 1 : 0.2);
      const half = Math.floor(t / (beat / 2));
      const mt = t - half * (beat / 2);
      const m = mel[half % mel.length];
      if (m) v += Math.sin(TAU * mtof(m) * t) * Math.exp(-mt * 3) * 0.09;
      const bt = t % beat;
      const bi = Math.floor(t / beat) % 4;
      if (bi === 0 || bi === 2) v += Math.sin(TAU * (55 + 60 * Math.exp(-bt * 30)) * bt) * Math.exp(-bt * 12) * 0.4;
      if (bi === 1 || bi === 3) v += rnd() * Math.exp(-bt * 18) * 0.15;
      const ht = t % (beat / 2);
      v += rnd() * Math.exp(-ht * 90) * 0.05;
      v += Math.random() < 0.0004 ? rnd() * 0.2 : 0;
      a[i] = f(v);
    }
    return norm(a, 0.55);
  },
};

export class AudioEngine {
  constructor() {
    this.ready = false;
    this.pending = [];
    this.volume = 0.8;
    this.muted = false;
    this.buffers = {};
  }
  init(camera) {
    if (this.ready) return;
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.ctx = this.listener.context;
    this.sr = this.ctx.sampleRate;
    this.ready = true;
    this.applyVolume();
    this.amb = {};
    const p = this.pending;
    this.pending = [];
    for (const job of p) if (!job.handle.stopped) job.handle._start();
  }
  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
  }
  applyVolume() {
    if (this.listener) this.listener.setMasterVolume(this.muted ? 0 : this.volume);
  }
  setVolume(v) {
    this.volume = v;
    this.applyVolume();
  }
  setMuted(m) {
    this.muted = m;
    this.applyVolume();
  }
  buf(name) {
    if (!this.buffers[name]) {
      const gen = GEN[name] || GEN.click;
      const data = gen(this.sr);
      const b = this.ctx.createBuffer(1, data.length, this.sr);
      b.copyToChannel(data, 0);
      this.buffers[name] = b;
    }
    return this.buffers[name];
  }
  at(obj, name, { volume = 1, rate = 1, ref = 1.2 } = {}) {
    if (!this.ready || !obj) return;
    const s = new THREE.PositionalAudio(this.listener);
    s.setBuffer(this.buf(name));
    s.setRefDistance(ref);
    s.setRolloffFactor(1.4);
    s.setVolume(volume);
    s.setPlaybackRate(rate);
    obj.add(s);
    s.play();
    s.source.onended = () => {
      obj.remove(s);
      try {
        s.disconnect();
      } catch (e) {}
    };
  }
  loop(obj, name, opts = {}) {
    const handle = {
      stopped: false,
      s: null,
      stop() {
        this.stopped = true;
        if (this.s) {
          try {
            this.s.stop();
            this.s.disconnect();
          } catch (e) {}
          obj.remove(this.s);
          this.s = null;
        }
      },
      setVolume(v) {
        if (this.s) this.s.setVolume(v);
      },
      _start: () => {
        const s = new THREE.PositionalAudio(this.listener);
        s.setBuffer(this.buf(name));
        s.setLoop(true);
        s.setRefDistance(opts.ref ?? 1.2);
        s.setRolloffFactor(1.4);
        s.setVolume(opts.volume ?? 1);
        obj.add(s);
        s.play();
        handle.s = s;
      },
    };
    if (this.ready) handle._start();
    else this.pending.push({ handle });
    return handle;
  }
  // 배경음 (위치 없음): 이름별 볼륨 조절
  ambient(name, volume) {
    if (!this.ready) return;
    let a = this.amb[name];
    if (!a) {
      if (volume <= 0.001) return;
      a = new THREE.Audio(this.listener);
      a.setBuffer(this.buf(name));
      a.setLoop(true);
      a.setVolume(0);
      a.play();
      this.amb[name] = a;
    }
    a.setVolume(volume);
  }
  note(freq, obj) {
    if (!this.ready) return;
    let pa = obj.userData._noteAudio;
    if (!pa) {
      pa = new THREE.PositionalAudio(this.listener);
      pa.setRefDistance(1.5);
      obj.add(pa);
      obj.userData._noteAudio = pa;
    }
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    for (const [mul, amp, type] of [[1, 1, 'triangle'], [2, 0.25, 'sine'], [3, 0.08, 'sine']]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq * mul;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 1.7);
    }
    g.connect(pa.panner);
  }
}
