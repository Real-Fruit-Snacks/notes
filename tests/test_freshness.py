"""Tests for freshness & sharing: updated dates, recent list, social cards."""
from __future__ import annotations

import pytest

from obsidian_site.builder import build_site
from obsidian_site.models import SiteConfig


def test_updated_date_from_mtime_fallback(tmp_path):
    vault = tmp_path / "v"
    vault.mkdir()
    (vault / "n.md").write_text("---\ntitle: N\npublish: true\n---\n\nHi\n", encoding="utf-8")
    cfg = SiteConfig(vault=vault, out=tmp_path / "o")
    build_site(cfg)
    html = (cfg.out / "n.html").read_text()
    assert 'property="article:modified_time"' in html
    assert "Updated " in html


def test_updated_date_from_git(config):
    # The fixture vault is committed in this repo, so git history applies.
    build_site(config)
    html = (config.out / "welcome.html").read_text()
    assert 'property="article:modified_time"' in html


def test_homepage_lists_recently_updated(config):
    build_site(config)
    index = (config.out / "index.html").read_text()
    assert "Recently updated" in index
