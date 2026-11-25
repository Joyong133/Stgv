#!/usr/bin/env python3
"""한글 폰트를 게임에 쓰는 글자만 남겨 작게 만듭니다 (SIL OFL 폰트).

사용법: python3 tools/subset_fonts.py <원본폴더>
  원본폴더에 NotoSansKR.ttf (가변 폰트), BlackHanSans-Regular.ttf 가 있어야 합니다.
  scripts/*.gd 의 모든 글자 + ASCII 를 포함합니다. 게임 문구를 바꾸면 다시 실행하세요.
"""
import glob
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
OUT = os.path.join(ROOT, "assets", "fonts")


def used_chars():
    chars = set(chr(c) for c in range(0x20, 0x7F))
    chars.update("★☆◀▶·…“”‘’→←↑↓×")
    for path in glob.glob(os.path.join(ROOT, "scripts", "*.gd")):
        with open(path, encoding="utf-8") as f:
            chars.update(f.read())
    return "".join(sorted(c for c in chars if c.isprintable()))


def do_subset(font, text, out_path):
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    sub = subset.Subsetter(options=opts)
    sub.populate(text=text)
    sub.subset(font)
    font.save(out_path)
    print(out_path, os.path.getsize(out_path), "bytes")


def main():
    src = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    text = used_chars()
    noto = TTFont(os.path.join(src, "NotoSansKR.ttf"))
    noto = instancer.instantiateVariableFont(noto, {"wght": 700})
    do_subset(noto, text, os.path.join(OUT, "NotoSansKR-Bold.ttf"))
    bhs = TTFont(os.path.join(src, "BlackHanSans-Regular.ttf"))
    do_subset(bhs, text, os.path.join(OUT, "BlackHanSans-Regular.ttf"))


if __name__ == "__main__":
    main()
