"""Optional build step: Open Graph card PNGs and apple-touch-icon (Pillow).

Pillow is an optional dependency: when it (or the card font) is missing the
build simply skips cards and the templates omit og:image tags.
"""
from __future__ import annotations

import textwrap
from pathlib import Path

from .models import Note, SiteConfig

FONT_PATH = Path(__file__).resolve().parent.parent / "fonts" / "inter-variable.ttf"

# Catppuccin Mocha — cards are dark regardless of the viewer's theme.
BG = "#1e1e2e"
ACCENT = "#cba6f7"
TEXT = "#cdd6f4"
MUTED = "#a6adc8"


def available() -> bool:
    try:
        import PIL  # noqa: F401
    except ImportError:
        return False
    return FONT_PATH.exists()


def _font(size: int, bold: bool):
    from PIL import ImageFont

    font = ImageFont.truetype(str(FONT_PATH), size)
    try:
        font.set_variation_by_name("Bold" if bold else "Regular")
    except OSError:
        pass  # static font or no named variations — default weight is fine
    return font


def generate_cards(config: SiteConfig, notes: list[Note]) -> list[str]:
    """Write og/<slug>.png per note plus apple-touch-icon.png. Returns warnings."""
    if not available():
        return ["Pillow or fonts/inter-variable.ttf missing: skipped social cards"]
    from PIL import Image, ImageDraw

    title_font = _font(72, bold=True)
    site_font = _font(36, bold=False)
    for note in notes:
        img = Image.new("RGB", (1200, 630), BG)
        draw = ImageDraw.Draw(img)
        draw.rectangle((0, 0, 16, 630), fill=ACCENT)
        y = 170
        for line in textwrap.wrap(note.title, width=26)[:4]:
            draw.text((80, y), line, font=title_font, fill=TEXT)
            y += 94
        draw.text((80, 520), config.site_title, font=site_font, fill=MUTED)
        dest = config.out / "og" / f"{note.slug}.png"   # slugs may contain '/'
        dest.parent.mkdir(parents=True, exist_ok=True)
        img.save(dest)

    icon = Image.new("RGB", (180, 180), BG)
    draw = ImageDraw.Draw(icon)
    draw.ellipse((28, 38, 86, 96), fill=ACCENT)
    draw.ellipse((96, 86, 154, 144), fill="#89b4fa")
    draw.line((76, 86, 106, 106), fill=MUTED, width=9)
    icon.save(config.out / "apple-touch-icon.png")
    return []
