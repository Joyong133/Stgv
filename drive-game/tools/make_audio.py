#!/usr/bin/env python3
"""효과음(WAV)과 배경 음악(OGG)을 코드로 합성해 assets/audio 에 저장합니다.

사용법: python3 tools/make_audio.py   (OGG 변환에 ffmpeg 필요)
"""
import os
import subprocess
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "assets", "audio")
SR = 22050
rng = np.random.default_rng(3)


def write_wav(name, x, sr=SR):
    x = np.asarray(x, dtype=np.float64)
    peak = np.max(np.abs(x)) + 1e-9
    x = x / peak * 0.9
    data = (np.clip(x, -1, 1) * 32767).astype("<i2")
    ch = 1 if x.ndim == 1 else x.shape[1]
    with wave.open(os.path.join(OUT, name + ".wav"), "wb") as w:
        w.setnchannels(ch)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(data.tobytes())


def onepole_lp(x, cutoff, sr=SR):
    """1차 저역 통과 (루프, 짧은 신호용)"""
    a = np.exp(-2 * np.pi * cutoff / sr)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def fft_band(x, lo, hi, sr=SR):
    """FFT 로 대역 통과 (주기 신호 그대로 유지 -> 루프에 좋음)"""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / sr)
    mask = np.clip((f - lo * 0.7) / (lo * 0.3 + 1e-9), 0, 1) * np.clip((hi * 1.3 - f) / (hi * 0.3 + 1e-9), 0, 1)
    return np.fft.irfft(X * mask, len(x))


def env(n, a, d, sustain=1.0):
    t = np.arange(n) / SR
    e = np.minimum(1.0, t / max(a, 1e-4))
    return e * np.exp(-np.maximum(0, t - a) / max(d, 1e-4)) * sustain


# ------------------------------------------------------------------ 엔진 (루프)

def engine(name, period, cycles, bright):
    n = period * cycles
    out = np.zeros(n)
    t = np.arange(period) / SR
    for c in range(cycles):
        amp = 1.0 + rng.normal(0, 0.08)
        # 폭발 펄스: 빠르게 감쇠하는 몇 개의 배음
        pulse = np.zeros(period)
        f0 = SR / period
        for h in range(1, 9):
            pulse += np.sin(2 * np.pi * f0 * h * t + rng.normal(0, 0.15)) / (h ** (1.25 - bright * 0.4))
        pulse *= 0.6 + 0.4 * np.exp(-t * f0 * 3.0)
        noise = rng.normal(0, 0.25 + bright * 0.15, period) * np.exp(-t * f0 * 4.0)
        out[c * period:(c + 1) * period] = (pulse + noise) * amp
    out = fft_band(out, 25, 2600 + bright * 2500)
    out = np.tanh(out * 1.6)
    write_wav(name, out)


# ------------------------------------------------------------------ 효과음

def seamless(x, fade=0.06):
    """앞뒤를 겹쳐 이어지는 루프로"""
    n = int(len(x) * fade)
    head = x[:n].copy()
    tail = x[-n:].copy()
    w = np.linspace(0, 1, n)
    x = x[:-n].copy()
    x[:n] = tail * (1 - w) + head * w
    return x


def skid():
    n = int(SR * 1.2)
    t = np.arange(n) / SR
    noise = rng.normal(0, 1, n)
    hiss = fft_band(noise, 900, 3200)
    squeal = np.sin(2 * np.pi * (1050 + 60 * np.sin(2 * np.pi * 5.5 * t)) * t) * 0.6
    squeal += np.sin(2 * np.pi * (2110 + 90 * np.sin(2 * np.pi * 4.1 * t)) * t) * 0.25
    x = hiss * 0.8 + squeal * (0.7 + 0.3 * np.sin(2 * np.pi * 3.0 * t))
    write_wav("skid", seamless(np.tanh(x * 0.9)))


def nitro():
    n = int(SR * 1.2)
    t = np.arange(n) / SR
    noise = rng.normal(0, 1, n)
    x = fft_band(noise, 300, 5000) * 0.8 + fft_band(noise, 40, 200) * 1.2
    x *= 0.8 + 0.2 * np.sin(2 * np.pi * 9 * t)
    write_wav("nitro", seamless(np.tanh(x)))


def crash():
    n = int(SR * 0.7)
    t = np.arange(n) / SR
    thump = np.sin(2 * np.pi * (40 + 80 * np.exp(-t * 18)) * t) * np.exp(-t * 9)
    noise = fft_band(rng.normal(0, 1, n), 200, 6000) * np.exp(-t * 16)
    clank = sum(np.sin(2 * np.pi * f * t) * np.exp(-t * d) for f, d in ((523, 14), (811, 18), (1290, 22), (1873, 26)))
    write_wav("crash", np.tanh((thump * 1.4 + noise * 0.9 + clank * 0.35) * 1.3))


def tone(freqs, dur, decay, harm=(1.0, 0.3, 0.12)):
    n = int(SR * dur)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for f in freqs:
        for k, a in enumerate(harm):
            x += a * np.sin(2 * np.pi * f * (k + 1) * t)
    return x * env(n, 0.005, decay)


def sequence(notes, step, decay, harm=(1.0, 0.35, 0.15), tail=0.6):
    n = int(SR * (step * len(notes) + tail))
    x = np.zeros(n)
    for i, f in enumerate(notes):
        if f <= 0:
            continue
        s = tone([f], step + tail, decay, harm)
        o = int(i * step * SR)
        x[o:o + len(s)] += s[:n - o]
    return x


def sfx():
    write_wav("beep", tone([660], 0.22, 0.12))
    write_wav("go", tone([1320, 1980], 0.6, 0.3))
    write_wav("lap", sequence([880, 1320], 0.11, 0.2))
    write_wav("record", sequence([784, 988, 1175, 1568, 1976], 0.07, 0.25, tail=0.8))
    write_wav("finish", sequence([523, 659, 784, 1047, 0, 784, 1047], 0.13, 0.35, tail=1.0))
    n = int(SR * 0.05)
    t = np.arange(n) / SR
    write_wav("click", np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 90) + rng.normal(0, 0.1, n) * np.exp(-t * 200))
    n = int(SR * 0.8)
    t = np.arange(n) / SR
    whoosh = fft_band(rng.normal(0, 1, n), 400, 4000) * np.sin(np.pi * t / 0.8) ** 2
    write_wav("boost", whoosh)


# ------------------------------------------------------------------ 음악

NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8,
        "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def midi(name, octave):
    return 12 * (octave + 1) + NOTE[name]


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def chord_notes(root, minor):
    r = midi(root, 3)
    return [r, r + (3 if minor else 4), r + 7]


def add(buf, start, sig):
    """원형 버퍼에 더하기 (끝을 넘는 꼬리는 처음으로 -> 매끄러운 루프)"""
    n = len(buf)
    idx = (np.arange(len(sig)) + start) % n
    np.add.at(buf, idx, sig)


def saw(f, n, harmonics, detune=0.0):
    t = np.arange(n) / SR
    x = np.zeros(n)
    for k in range(1, harmonics + 1):
        x += np.sin(2 * np.pi * f * (1 + detune) * k * t) / k
    return x


def square(f, n, harmonics):
    t = np.arange(n) / SR
    x = np.zeros(n)
    for k in range(1, harmonics * 2, 2):
        x += np.sin(2 * np.pi * f * k * t) / k
    return x


def music(name, bpm, prog, style):
    beat = 60.0 / bpm
    bars = 16
    n = int(round(SR * beat * 4 * bars))
    L = np.zeros(n)
    R = np.zeros(n)
    b = int(SR * beat)
    for bar in range(bars):
        root, minor = prog[bar % len(prog)]
        notes = chord_notes(root, minor)
        bs = int(bar * 4 * beat * SR)
        # 패드
        dur = int(4 * beat * SR)
        e = np.minimum(1, np.arange(dur) / (SR * 0.35)) * np.minimum(1, (dur - np.arange(dur)) / (SR * 0.4))
        for m in notes:
            f = hz(m + 12)
            add(L, bs, saw(f, dur, 6, -0.003) * e * 0.05)
            add(R, bs, saw(f, dur, 6, 0.003) * e * 0.05)
        # 베이스 (8분음표)
        for k in range(8):
            if style == "chill" and k % 2 == 1:
                continue
            m = notes[0] - 12 + (12 if (style == "drive" and k % 4 == 3) else 0)
            dn = int(beat * 0.5 * SR)
            sig = saw(hz(m), dn, 5) * env(dn, 0.005, 0.18) * 0.22
            add(L, bs + k * dn, sig)
            add(R, bs + k * dn, sig)
        # 아르페지오 (16분음표)
        if style != "chill" or bar % 2 == 1:
            arp = notes + [notes[1] + 12, notes[2] + 12, notes[0] + 24]
            for k in range(16):
                m = arp[(k * 2 + bar) % len(arp)] + 12
                dn = int(beat * 0.25 * SR)
                sig = square(hz(m), dn * 2, 4) * env(dn * 2, 0.003, 0.09) * 0.045
                pan = 0.5 + 0.35 * np.sin(k * 0.8)
                add(L, bs + k * dn, sig * (1 - pan) * 2)
                add(R, bs + k * dn, sig * pan * 2)
        # 드럼
        for k in range(4):
            o = bs + k * b
            kick_on = style != "chill" or k % 2 == 0
            if kick_on:
                kn = int(SR * 0.3)
                t = np.arange(kn) / SR
                kick = np.sin(2 * np.pi * (45 + 90 * np.exp(-t * 30)) * t) * np.exp(-t * 9) * 0.55
                add(L, o, kick)
                add(R, o, kick)
            if k % 2 == 1:
                sn = int(SR * 0.25)
                t = np.arange(sn) / SR
                snare = (rng.normal(0, 1, sn) * 0.5 + np.sin(2 * np.pi * 190 * t)) * np.exp(-t * 16) * 0.16
                add(L, o, snare)
                add(R, o, snare)
            for hh in range(2):
                hn = int(SR * 0.05)
                hat = np.diff(rng.normal(0, 1, hn + 1)) * np.exp(-np.arange(hn) / SR * 70) * 0.05
                add(L, o + hh * b // 2, hat * 0.8)
                add(R, o + hh * b // 2, hat * 1.2)
    st = np.stack([L, R], axis=1)
    st = np.tanh(st * 1.4)
    wav_path = os.path.join(OUT, name + "_tmp.wav")
    peak = np.max(np.abs(st)) + 1e-9
    data = (st / peak * 0.85 * 32767).astype("<i2")
    with wave.open(wav_path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    ogg = os.path.join(OUT, name + ".ogg")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path, "-c:a", "libvorbis", "-q:a", "2", ogg],
                   check=True)
    os.remove(wav_path)
    print(name, os.path.getsize(ogg), "bytes")


def main():
    os.makedirs(OUT, exist_ok=True)
    engine("engine_lo", 330, 67, 0.0)
    engine("engine_hi", 132, 167, 1.0)
    skid()
    nitro()
    crash()
    sfx()
    music("music_menu", 92, [("A", True), ("F", False), ("C", False), ("G", False)], "chill")
    music("music_coast", 104, [("F", False), ("G", False), ("E", True), ("A", True)], "drive")
    music("music_forest", 116, [("C", False), ("G", False), ("A", True), ("F", False)], "drive")
    music("music_city", 110, [("D", True), ("Bb", False), ("F", False), ("C", False)], "drive")
    print("audio written to", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
