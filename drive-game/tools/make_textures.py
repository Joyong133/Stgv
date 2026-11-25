#!/usr/bin/env python3
"""게임에 쓰는 텍스처(PNG)를 코드로 그려 assets/textures 에 저장합니다.

사용법: python3 tools/make_textures.py
"""
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "assets", "textures")
rng = np.random.default_rng(7)


def save(name, arr):
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    mode = "RGBA" if arr.shape[2] == 4 else "RGB"
    Image.fromarray(arr, mode).save(os.path.join(OUT, name + ".png"))


def tile_noise(h, w, scale, octaves=4, seed=0):
    """주기적(타일링되는) 값 노이즈. 결과 0..1"""
    r = np.random.default_rng(seed)
    out = np.zeros((h, w))
    amp = 1.0
    total = 0.0
    for o in range(octaves):
        gh = max(2, int(h / scale) * (2 ** o))
        gw = max(2, int(w / scale) * (2 ** o))
        grid = r.random((gh, gw))
        ys = np.arange(h) * gh / h
        xs = np.arange(w) * gw / w
        y0 = np.floor(ys).astype(int)
        x0 = np.floor(xs).astype(int)
        ty = ys - y0
        tx = xs - x0
        ty = ty * ty * (3 - 2 * ty)
        tx = tx * tx * (3 - 2 * tx)
        y1 = (y0 + 1) % gh
        x1 = (x0 + 1) % gw
        a = grid[y0][:, x0]
        b = grid[y0][:, x1]
        c = grid[y1][:, x0]
        d = grid[y1][:, x1]
        top = a + (b - a) * tx[None, :]
        bot = c + (d - c) * tx[None, :]
        layer = top + (bot - top) * ty[:, None]
        out += layer * amp
        total += amp
        amp *= 0.5
    return out / total


def asphalt():
    h, w = 512, 512   # 세로: 도로 진행 12m, 가로: 도로 폭
    n = tile_noise(h, w, 32, 5, 1)
    fine = rng.random((h, w))
    base = 52 + (n - 0.5) * 26 + (fine - 0.5) * 16
    # 바퀴 자국 (조금 어두운 띠)
    xs = np.arange(w) / w
    for c in (0.2, 0.32, 0.68, 0.8):
        base -= 6 * np.exp(-((xs - c) / 0.035) ** 2)[None, :]
    rgb = np.stack([base, base, base * 1.06], axis=2)
    # 흰 가장자리 선
    for x0, x1 in ((0.03, 0.055), (0.945, 0.97)):
        m = (xs >= x0) & (xs <= x1)
        rgb[:, m, :] = np.array([214, 214, 210]) + (fine[:, m, None] - 0.5) * 20
    # 노란 중앙 점선 (12m 중 5m)
    ys = np.arange(h) / h
    cm = (xs >= 0.488) & (xs <= 0.512)
    dash = ys < 0.42
    sub = rgb[dash][:, cm, :]
    rgb[np.ix_(dash, cm)] = np.array([235, 180, 40]) + (fine[np.ix_(dash, cm)][..., None] - 0.5) * 24
    del sub
    # 자갈 반점
    speck = rng.random((h, w)) > 0.985
    rgb[speck] += 28
    save("asphalt", rgb)


def curb():
    h, w = 256, 64   # 세로: 진행 4m, 가로: 연석 폭
    ys = np.arange(h)[:, None] / h
    xs = np.arange(w)[None, :] / w
    red = (ys % 1.0) < 0.5
    rgb = np.where(red[..., None], np.array([200, 30, 35]), np.array([235, 235, 235])).astype(float)
    rgb = rgb * np.ones((h, w, 1))
    # 바깥쪽으로 약간 어둡게 (입체감)
    rgb *= (1.0 - 0.18 * xs)[..., None]
    rgb += (rng.random((h, w, 1)) - 0.5) * 14
    save("curb", rgb)


def detail():
    h = w = 256
    n = tile_noise(h, w, 24, 5, 3)
    fine = rng.random((h, w))
    v = 190 + (n - 0.5) * 90 + (fine - 0.5) * 30
    save("detail", np.stack([v, v, v], axis=2))


def pavement():
    h = w = 256
    n = tile_noise(h, w, 32, 4, 5)
    v = 175 + (n - 0.5) * 40 + (rng.random((h, w)) - 0.5) * 18
    grid = np.zeros((h, w), bool)
    grid[::64, :] = True
    grid[:, ::64] = True
    grid[1::64, :] = True
    grid[:, 1::64] = True
    v[grid] -= 55
    save("pavement", np.stack([v, v, v * 1.03], axis=2))


def guardrail():
    # 가로축(u) = 높이 (0 = 맨 위, 1 = 바닥 근처), 세로축(v) = 진행 방향 4m
    h, w = 256, 64
    img = np.zeros((h, w, 4))
    us = np.arange(w) / w
    vs = np.arange(h) / h
    # W 빔 (위에서 0.18~0.5)
    beam = (us >= 0.16) & (us <= 0.5)
    ridge = np.cos((us - 0.16) / 0.34 * np.pi * 2) * 0.5 + 0.5
    shade = 150 + ridge * 90
    img[:, beam, 0] = shade[beam] * 0.95
    img[:, beam, 1] = shade[beam] * 0.97
    img[:, beam, 2] = shade[beam] * 1.0
    img[:, beam, 3] = 255
    # 기둥 2m 마다
    for c in (0.25, 0.75):
        pm = np.abs(vs - c) < 0.022
        post_u = us >= 0.42
        img[np.ix_(pm, post_u)] = [95, 98, 105, 255]
        # 반사판
        rm = np.abs(vs - c) < 0.03
        ru = (us >= 0.27) & (us <= 0.37)
        img[np.ix_(rm, ru)] = [255, 160, 40, 255]
    # 위쪽 테두리 그림자
    img[:, (us >= 0.16) & (us < 0.19), :3] *= 0.6
    save("guardrail", img)


def barrier():
    h, w = 256, 64   # 가로 = 높이 (0 위, 1 바닥), 세로 = 진행 4m
    n = tile_noise(h, w, 16, 4, 9)
    us = np.arange(w)[None, :] / w
    vs = np.arange(h)[:, None] / h
    v = 170 + (n - 0.5) * 40
    v = v * (1.0 - 0.35 * np.clip((us - 0.6) / 0.4, 0, 1))  # 아래쪽 때
    rgb = np.stack([v, v, v * 1.04], axis=2)
    # 빨강/흰 경고 줄무늬 띠
    band = (us > 0.12) & (us < 0.34)
    stripe = ((vs * 8 + us * 3) % 1.0) < 0.5
    red = band & stripe
    white = band & ~stripe
    rgb[np.broadcast_to(red, (h, w))] = [210, 40, 50]
    rgb[np.broadcast_to(white, (h, w))] = [240, 240, 240]
    # 위쪽 시안 네온 줄
    neon = (us >= 0.02) & (us < 0.07)
    rgb[np.broadcast_to(neon, (h, w))] = [90, 230, 255]
    save("barrier", rgb)


def checker():
    h = w = 64
    ys, xs = np.mgrid[0:h, 0:w]
    c = (((ys // 32) + (xs // 32)) % 2 == 0)
    v = np.where(c, 240, 20).astype(float)
    save("checker", np.stack([v, v, v], axis=2))


def windows():
    h = w = 256
    cells = 4
    cs = w // cells
    alb = np.zeros((h, w, 3))
    emi = np.zeros((h, w, 3))
    n = tile_noise(h, w, 32, 3, 11)
    wall = 60 + (n - 0.5) * 20
    alb[...] = np.stack([wall, wall * 1.02, wall * 1.08], axis=2)
    r = np.random.default_rng(21)
    for cy in range(cells):
        for cx in range(cells):
            y0, x0 = cy * cs + 9, cx * cs + 7
            y1, x1 = (cy + 1) * cs - 9, (cx + 1) * cs - 7
            lit = r.random() < 0.42
            if lit:
                warm = r.random() < 0.65
                col = np.array([255, 205, 120]) if warm else np.array([170, 215, 255])
                col = col * r.uniform(0.7, 1.0)
                alb[y0:y1, x0:x1] = col * 0.8
                emi[y0:y1, x0:x1] = col
                # 블라인드 줄
                emi[y0:y1:6, x0:x1] *= 0.55
            else:
                alb[y0:y1, x0:x1] = [22, 28, 42]
            # 창틀
            alb[y0 - 2:y0, x0 - 2:x1 + 2] = [95, 98, 108]
    save("windows", alb)
    save("windows_emit", emi)


def soft_sprite(name, size, falloff=2.2):
    h = w = size
    ys, xs = np.mgrid[0:h, 0:w]
    d = np.sqrt(((xs - w / 2 + 0.5) / (w / 2)) ** 2 + ((ys - h / 2 + 0.5) / (h / 2)) ** 2)
    a = np.clip(1.0 - d, 0, 1) ** falloff * 255
    img = np.zeros((h, w, 4))
    img[..., :3] = 255
    img[..., 3] = a
    save(name, img)


def shadow():
    h, w = 256, 128
    ys, xs = np.mgrid[0:h, 0:w]
    # 둥근 사각형 거리
    px = np.abs((xs + 0.5) / w * 2 - 1)
    py = np.abs((ys + 0.5) / h * 2 - 1)
    qx = np.maximum(px - 0.55, 0) / 0.45
    qy = np.maximum(py - 0.7, 0) / 0.3
    d = np.sqrt(qx ** 2 + qy ** 2)
    a = np.clip(1 - d, 0, 1) ** 1.5 * 210
    img = np.zeros((h, w, 4))
    img[..., 3] = a
    save("shadow", img)


def cloud():
    h, w = 128, 256
    ys, xs = np.mgrid[0:h, 0:w]
    a = np.zeros((h, w))
    r = np.random.default_rng(5)
    for _ in range(26):
        cx = r.uniform(0.18, 0.82) * w
        cy = r.uniform(0.42, 0.68) * h
        rad = r.uniform(0.09, 0.2) * w
        a = np.maximum(a, np.exp(-(((xs - cx) ** 2 + ((ys - cy) * 1.6) ** 2) / (rad ** 2))))
    n = tile_noise(h, w, 16, 4, 8)
    a = np.clip(a * (0.75 + 0.5 * n) - 0.15, 0, 1) * 255
    shade = 255 - (ys / h) * 50
    img = np.zeros((h, w, 4))
    img[..., 0] = shade
    img[..., 1] = shade
    img[..., 2] = shade
    img[..., 3] = a
    save("cloud", img)


def main():
    os.makedirs(OUT, exist_ok=True)
    asphalt()
    curb()
    detail()
    pavement()
    guardrail()
    barrier()
    checker()
    windows()
    soft_sprite("smoke", 64)
    soft_sprite("glow", 64, 1.4)
    shadow()
    cloud()
    print("textures written to", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
