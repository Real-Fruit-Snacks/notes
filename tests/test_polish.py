"""Tests for the professional-polish pass: theming, favicon, robots, print."""
from __future__ import annotations

import json

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
    # The container background rules must be stripped (theme var controls it).
    assert ".highlight { background" not in css
    assert css.count("line-height: 125%") == 1   # boilerplate emitted once


# --- favicon + manifest --------------------------------------------------------

def test_favicon_and_manifest(config):
    build_site(config)
    assert (config.out / "assets" / "favicon.svg").exists()
    data = json.loads((config.out / "site.webmanifest").read_text())
    assert data["name"] == "My Notes"
    html = (config.out / "welcome.html").read_text()
    assert 'rel="icon"' in html
    assert 'type="image/svg+xml"' in html
    assert 'rel="manifest"' in html


# --- robots.txt + canonical ----------------------------------------------------

def test_robots_txt_with_site_url(tmp_path, vault_path):
    cfg = SiteConfig(vault=vault_path, out=tmp_path / "dist", base_url="/myrepo/",
                     site_url="https://example.com")
    build_site(cfg)
    robots = (cfg.out / "robots.txt").read_text()
    assert "Sitemap: https://example.com/myrepo/sitemap.xml" in robots


def test_no_robots_txt_without_site_url(config):
    build_site(config)
    assert not (config.out / "robots.txt").exists()


def test_canonical_on_index_and_tag_pages(tmp_path, vault_path):
    cfg = SiteConfig(vault=vault_path, out=tmp_path / "dist", base_url="/myrepo/",
                     site_url="https://example.com")
    build_site(cfg)
    index = (cfg.out / "index.html").read_text()
    assert '<link rel="canonical" href="https://example.com/myrepo/index.html">' in index
    note = (cfg.out / "welcome.html").read_text()
    assert '<link rel="canonical" href="https://example.com/myrepo/welcome.html">' in note
