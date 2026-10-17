"""Generate launcher icon PNGs (red play button + magnifier) into res/mipmap-*."""
import os
import sys
from PIL import Image, ImageDraw

SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}


def draw(size):
    s = size * 4  # supersample
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = s * 0.06
    d.rounded_rectangle([pad, pad, s - pad, s - pad], radius=s * 0.22, fill=(211, 47, 47, 255))
    # play triangle
    cx, cy = s * 0.42, s * 0.44
    r = s * 0.2
    d.polygon([(cx - r * 0.7, cy - r), (cx - r * 0.7, cy + r), (cx + r, cy)], fill=(255, 255, 255, 255))
    # magnifier
    mx, my, mr = s * 0.66, s * 0.66, s * 0.13
    w = int(s * 0.045)
    d.ellipse([mx - mr, my - mr, mx + mr, my + mr], outline=(255, 255, 255, 255), width=w)
    d.line([(mx + mr * 0.7, my + mr * 0.7), (mx + mr * 1.8, my + mr * 1.8)], fill=(255, 255, 255, 255), width=int(w * 1.4))
    return img.resize((size, size), Image.LANCZOS)


def main(res_dir):
    for name, size in SIZES.items():
        out = os.path.join(res_dir, "mipmap-" + name)
        os.makedirs(out, exist_ok=True)
        draw(size).save(os.path.join(out, "ic_launcher.png"))


if __name__ == "__main__":
    main(sys.argv[1])
