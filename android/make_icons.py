"""런처 아이콘 생성: 어두운 바탕 위에 부채꼴로 펼친 세 장(마지막 장은 책갈피 파랑)."""
import os
from PIL import Image, ImageDraw

BG = (22, 24, 29, 255)
PAGE = (236, 238, 243, 255)
PAGE_LINE = (190, 195, 206, 255)
ACCENT = (147, 178, 255, 255)
ACCENT_LINE = (96, 128, 214, 255)
HERE = os.path.dirname(os.path.abspath(__file__))


def page(size, fill, line):
    w, h = size
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=int(w * 0.1), fill=fill)
    pad = int(w * 0.16)
    y = int(h * 0.17)
    while y < h * 0.72:
        d.rounded_rectangle([pad, y, w - pad, y + max(2, int(h * 0.035))], radius=2, fill=line)
        y += int(h * 0.11)
    return im


def fan(canvas):
    """canvas 크기(정사각형) 안 가운데 66% 영역에 세 장을 그린다."""
    S = canvas.size[0]
    pw, ph = int(S * 0.27), int(S * 0.37)
    cx, cy = S / 2, S / 2 + S * 0.02
    for k, (dx, ang, fill, line) in enumerate([
        (-0.17, 11, PAGE, PAGE_LINE),
        (0.0, 0, PAGE, PAGE_LINE),
        (0.17, -11, ACCENT, ACCENT_LINE),
    ]):
        p = page((pw, ph), fill, line).rotate(ang, resample=Image.BICUBIC, expand=True)
        x = int(cx + dx * S - p.size[0] / 2)
        y = int(cy - p.size[1] / 2 - (S * 0.03 if k == 1 else 0))
        canvas.alpha_composite(p, (x, y))
    return canvas


def main():
    big = 1024
    # 적응형 아이콘 전경 (108dp, 안전 영역 66dp)
    fg = fan(Image.new('RGBA', (big, big), (0, 0, 0, 0)))
    # 예전 방식 아이콘: 둥근 사각형 바탕
    legacy = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(legacy).rounded_rectangle([40, 40, big - 41, big - 41], radius=200, fill=BG)
    inner = fan(Image.new('RGBA', (big, big), (0, 0, 0, 0))).resize((int(big * 1.3), int(big * 1.3)), Image.LANCZOS)
    off = (big - inner.size[0]) // 2
    legacy.alpha_composite(inner.crop((-off, -off, -off + big, -off + big)))

    for name, dp in [('mdpi', 1), ('hdpi', 1.5), ('xhdpi', 2), ('xxhdpi', 3), ('xxxhdpi', 4)]:
        d = os.path.join(HERE, 'res', f'mipmap-{name}')
        os.makedirs(d, exist_ok=True)
        legacy.resize((int(48 * dp),) * 2, Image.LANCZOS).save(os.path.join(d, 'ic_launcher.png'), optimize=True)
        fg.resize((int(108 * dp),) * 2, Image.LANCZOS).save(os.path.join(d, 'ic_launcher_fg.png'), optimize=True)
    legacy.resize((512, 512), Image.LANCZOS).save(os.path.join(HERE, 'icon-512.png'), optimize=True)


if __name__ == '__main__':
    main()
