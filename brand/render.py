#!/usr/bin/env python3
"""Render the brand sources in this directory to the files the site serves from public/.

  favicon.svg           mark.svg, copied
  favicon.ico           the mark at 16 and 32
  apple-touch-icon.png  the mark at 180, opaque on paper
  og.png                og-card.html at 1200x630

Needs Google Chrome at CHROME, Pillow, and network access: the card loads its fonts from Google
Fonts at render time. Run from anywhere: python3 brand/render.py
"""
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent / "public"
PAPER = (0xFA, 0xFA, 0xF9)
MARK_PX = 512


def shoot(url, out, width, height, transparent=False):
    args = [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
            "--virtual-time-budget=4000", f"--window-size={width},{height}", f"--screenshot={out}"]
    if transparent:
        args.append("--default-background-color=00000000")
    subprocess.run(args + [url], check=True, capture_output=True)
    with Image.open(out) as im:
        assert im.size == (width, height), (out, im.size)


def main():
    PUBLIC.mkdir(exist_ok=True)
    shutil.copyfile(HERE / "mark.svg", PUBLIC / "favicon.svg")

    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "mark.html"
        page.write_text(
            "<!doctype html><html><head><style>html,body{margin:0;background:transparent}"
            f"img{{display:block;width:{MARK_PX}px;height:{MARK_PX}px}}</style></head>"
            f'<body><img src="{(HERE / "mark.svg").as_uri()}"></body></html>'
        )
        big = Path(tmp) / "mark.png"
        shoot(page.as_uri(), big, MARK_PX, MARK_PX, transparent=True)
        mark = Image.open(big).convert("RGBA")
        assert mark.getpixel((0, 0))[3] == 0, "the mark's corners rendered opaque; Chrome ignored the transparent background"

    ico = PUBLIC / "favicon.ico"
    frames = [mark.resize((s, s), Image.LANCZOS) for s in (16, 32)]
    frames[1].save(ico, format="ICO", sizes=[(16, 16), (32, 32)], append_images=[frames[0]])
    with Image.open(ico) as im:
        assert im.info["sizes"] == {(16, 16), (32, 32)}, im.info["sizes"]

    touch = PUBLIC / "apple-touch-icon.png"
    opaque = Image.new("RGB", (MARK_PX, MARK_PX), PAPER)
    opaque.paste(mark, mask=mark)
    opaque.resize((180, 180), Image.LANCZOS).save(touch, optimize=True)
    with Image.open(touch) as im:
        assert im.size == (180, 180) and im.mode == "RGB", (im.size, im.mode)

    og = PUBLIC / "og.png"
    shoot((HERE / "og-card.html").as_uri(), og, 1200, 630)
    with Image.open(og) as im:
        im.convert("RGB").save(og, optimize=True)
    with Image.open(og) as im:
        assert im.size == (1200, 630), im.size

    for name in ("favicon.svg", "favicon.ico", "apple-touch-icon.png", "og.png"):
        print(f"public/{name}", (PUBLIC / name).stat().st_size, "bytes")


if __name__ == "__main__":
    main()
