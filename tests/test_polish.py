"""Tests for the professional-polish pass: theming, favicon, robots, print."""
from __future__ import annotations

import pytest

from obsidian_site.builder import build_site
from obsidian_site.models import SiteConfig


# --- theme toggle ------------------------------------------------------------

def test_theme_inline_script_and_toggle(config):
    build_site(config)
    html = (config.out / "welcome.html").read_text()
    assert "localStorage.getItem(\"theme\")" in html       # no-flash boot script
    assert 'id="theme-toggle"' in html                      # toggle button
    assert 'name="theme-color"' in html                     # theme-color meta


def test_css_has_light_theme_block(config):
    build_site(config)
    css = (config.out / "assets" / "site.css").read_text()
    assert 'html[data-theme="light"]' in css
    assert "#eff1f5" in css        # Latte base
    assert "color-scheme: light" in css


def test_pygments_css_covers_both_themes(config):
    build_site(config)
    css = (config.out / "assets" / "pygments.css").read_text()
    assert '[data-theme="light"] .highlight' in css
    assert "#8839ef" in css.lower()   # Latte mauve (keywords)
    assert "#cba6f7" in css.lower()   # Mocha mauve still present
