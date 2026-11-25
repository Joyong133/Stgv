#!/usr/bin/env python3
"""선셋 드라이브 아이콘(PNG)을 그려서 assets/icons 와 프로젝트 icon.png 로 저장합니다.

사용법: python3 tools/make_icons.py
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))

SS = 4  # 슈퍼샘플링 배율


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_col(c1, c2, t):
    return tuple(int(round(lerp(c1[i], c2[i], t))) for i in range(len(c1)))


def sky_gradient(size, horizon):
    """위쪽 보라 -> 분홍 -> 주황 노을 그라디언트."""
    img = Image.new("RGBA", (size, size))
    px = img.load()
    stops = [(0.0, (34, 12, 74)), (0.45, (140, 32, 110)), (0.78, (240, 90, 90)), (1.0, (255, 170, 80))]
    for y in range(size):
        t = min(1.0, y / max(1, horizon))
        for i in range(len(stops) - 1):
            if stops[i][0] <= t <= stops[i + 1][0]:
                k = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0])
                c = lerp_col(stops[i][1], stops[i + 1][1], k)
                break
        if y > horizon:
            c = (40, 16, 60)
        for x in range(size):
            px[x, y] = c + (255,)
    return img


def draw_sun(img, cx, cy, r, horizon):
    """줄무늬가 있는 레트로 태양."""
    sun = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(sun)
    for y in range(int(cy - r), int(cy + r) + 1):
        if y >= horizon:
            break
        dy = y - cy
        half = math.sqrt(max(0.0, r * r - dy * dy))
        t = (y - (cy - r)) / (2 * r)
        col = lerp_col((255, 236, 120), (255, 92, 120), t)
        # 아래쪽으로 갈수록 두꺼워지는 가로 줄무늬
        band = (y - cy) / r
        if band > 0.05:
            period = r * 0.22
            gap = period * (0.15 + 0.45 * band)
            if (y - cy) % period < gap:
                continue
        d.line([(cx - half, y), (cx + half, y)], fill=col + (255,))
    glow = sun.filter(ImageFilter.GaussianBlur(r * 0.25))
    img.alpha_composite(glow)
    img.alpha_composite(sun)


def draw_ground(img, horizon):
    size = img.size[0]
    d = ImageDraw.Draw(img)
    d.rectangle([0, horizon, size, size], fill=(36, 14, 58, 255))
    # 원근 격자 (신스웨이브 느낌)
    vx = size / 2
    for i in range(-12, 13):
        x2 = vx + i * size * 0.16
        d.line([(vx + i * size * 0.012, horizon), (x2, size)], fill=(255, 80, 170, 120), width=max(1, size // 160))
    y = horizon
    step = size * 0.012
    while y < size:
        d.line([(0, y), (size, y)], fill=(255, 80, 170, 110), width=max(1, size // 200))
        step *= 1.35
        y += step


def draw_road(img, horizon):
    size = img.size[0]
    d = ImageDraw.Draw(img)
    vx = size / 2
    top_w = size * 0.03
    bot_w = size * 0.62
    d.polygon([(vx - top_w, horizon), (vx + top_w, horizon), (vx + bot_w, size), (vx - bot_w, size)],
              fill=(28, 26, 38, 255))
    # 가장자리 흰 선
    for s in (-1, 1):
        d.line([(vx + s * top_w * 0.92, horizon), (vx + s * bot_w * 0.92, size)], fill=(240, 240, 250, 255),
               width=max(2, size // 70))
    # 가운데 점선
    n = 7
    for i in range(n):
        t0 = (i / n) ** 1.8
        t1 = ((i + 0.5) / n) ** 1.8
        y0 = lerp(horizon, size, t0)
        y1 = lerp(horizon, size, t1)
        w0 = lerp(size * 0.002, size * 0.02, t0)
        w1 = lerp(size * 0.002, size * 0.02, t1)
        d.polygon([(vx - w0, y0), (vx + w0, y0), (vx + w1, y1), (vx - w1, y1)], fill=(255, 210, 80, 255))


def draw_car(img, cx, base_y, w):
    """뒤에서 본 스포츠카 실루엣."""
    d = ImageDraw.Draw(img)
    h = w * 0.42
    # 그림자
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([cx - w * 0.58, base_y - h * 0.12, cx + w * 0.58, base_y + h * 0.16], fill=(0, 0, 0, 150))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(w * 0.04)))
    # 타이어
    tw, th = w * 0.17, h * 0.36
    for s in (-1, 1):
        x = cx + s * (w * 0.5 - tw * 0.5)
        d.rounded_rectangle([x - tw / 2, base_y - th, x + tw / 2, base_y], radius=tw * 0.25, fill=(16, 16, 20, 255))
    # 차체
    body_top = base_y - h * 0.86
    d.rounded_rectangle([cx - w * 0.5, body_top, cx + w * 0.5, base_y - h * 0.16], radius=w * 0.08,
                        fill=(225, 40, 60, 255))
    # 캐빈(유리)
    d.polygon([(cx - w * 0.36, body_top + 2), (cx + w * 0.36, body_top + 2), (cx + w * 0.27, body_top - h * 0.5),
               (cx - w * 0.27, body_top - h * 0.5)], fill=(190, 30, 50, 255))
    d.polygon([(cx - w * 0.31, body_top - h * 0.04), (cx + w * 0.31, body_top - h * 0.04),
               (cx + w * 0.245, body_top - h * 0.43), (cx - w * 0.245, body_top - h * 0.43)], fill=(40, 30, 60, 255))
    # 스포일러
    d.rounded_rectangle([cx - w * 0.47, body_top - h * 0.12, cx + w * 0.47, body_top + h * 0.02], radius=w * 0.02,
                        fill=(30, 24, 34, 255))
    # 미등
    for s in (-1, 1):
        x0 = cx + s * w * 0.42
        x1 = cx + s * w * 0.2
        d.rounded_rectangle([min(x0, x1), body_top + h * 0.12, max(x0, x1), body_top + h * 0.26], radius=h * 0.05,
                            fill=(255, 60, 80, 255))
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for s in (-1, 1):
        x0 = cx + s * w * 0.42
        x1 = cx + s * w * 0.2
        gd.rounded_rectangle([min(x0, x1), body_top + h * 0.1, max(x0, x1), body_top + h * 0.28], radius=h * 0.05,
                             fill=(255, 80, 110, 200))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(w * 0.05)))
    # 번호판
    d.rectangle([cx - w * 0.1, body_top + h * 0.38, cx + w * 0.1, body_top + h * 0.52], fill=(245, 245, 235, 255))


def full_icon(px):
    """정사각형 전체 아이콘 (레거시 아이콘, 웹 파비콘용)."""
    s = px * SS
    horizon = int(s * 0.56)
    img = sky_gradient(s, horizon)
    draw_sun(img, s / 2, horizon - s * 0.02, s * 0.27, horizon)
    draw_ground(img, horizon)
    draw_road(img, horizon)
    draw_car(img, s / 2, s * 0.9, s * 0.5)
    return img.resize((px, px), Image.LANCZOS)


def rounded(img, radius_frac=0.22):
    s = img.size[0]
    mask = Image.new("L", (s * SS, s * SS), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s * SS - 1, s * SS - 1], radius=int(s * SS * radius_frac), fill=255)
    mask = mask.resize((s, s), Image.LANCZOS)
    out = img.copy()
    out.putalpha(mask)
    return out


def adaptive_layers(px108):
    """적응형 아이콘: 108dp 캔버스. 배경(하늘+태양+땅) / 전경(도로+자동차)."""
    s = px108 * SS
    horizon = int(s * 0.55)
    bg = sky_gradient(s, horizon)
    draw_sun(bg, s / 2, horizon - s * 0.02, s * 0.2, horizon)
    draw_ground(bg, horizon)
    fg = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    # 전경은 안전 영역(가운데 66dp) 안에 들어오게 그립니다.
    road = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw_road(road, horizon)
    # 도로는 가운데 아래쪽만 보이도록 마스크
    fg.alpha_composite(road)
    draw_car(fg, s / 2, s * 0.8, s * 0.34)
    return bg.resize((px108, px108), Image.LANCZOS), fg.resize((px108, px108), Image.LANCZOS)


def main():
    out = os.path.join(HERE, "..", "assets", "icons")
    os.makedirs(out, exist_ok=True)
    # 안드로이드 런처 아이콘 (Godot 내보내기 설정에서 사용)
    rounded(full_icon(192)).save(os.path.join(out, "icon_192.png"))
    bg, fg = adaptive_layers(432)
    bg.save(os.path.join(out, "icon_bg_432.png"))
    fg.save(os.path.join(out, "icon_fg_432.png"))
    # 프로젝트 아이콘
    rounded(full_icon(256)).save(os.path.join(HERE, "..", "icon.png"))
    print("icons written to", os.path.normpath(out))


if __name__ == "__main__":
    main()
