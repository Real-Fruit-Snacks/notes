"""Tests for tag-based publishing: a note ships iff it carries the publish tag."""
from __future__ import annotations

import pytest

from obsidian_site.builder import build_site
from obsidian_site.models import SiteConfig


@pytest.fixture
def vault(tmp_path):
    v = tmp_path / "vault"
    v.mkdir()
    return v


def write(vault, name, text):
    path = vault / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def build(vault, tmp_path):
    config = SiteConfig(vault=vault, out=tmp_path / "out")
    build_site(config)
    return config.out


def test_frontmatter_tag_publishes(vault, tmp_path):
    write(vault, "a.md", "---\ntags: [publish, ideas]\n---\nhello")
    out = build(vault, tmp_path)
    assert (out / "a.html").exists()


def test_inline_tag_publishes(vault, tmp_path):
    write(vault, "a.md", "Some thoughts. #publish\n")
    out = build(vault, tmp_path)
    assert (out / "a.html").exists()


def test_inline_tag_case_insensitive(vault, tmp_path):
    write(vault, "a.md", "Some thoughts. #Publish\n")
    out = build(vault, tmp_path)
    assert (out / "a.html").exists()


def test_unmarked_note_stays_private(vault, tmp_path):
    write(vault, "a.md", "---\ntags: [ideas]\n---\nprivate stuff")
    write(vault, "b.md", "no frontmatter at all")
    out = build(vault, tmp_path)
    assert not (out / "a.html").exists()
    assert not (out / "b.html").exists()


def test_legacy_publish_true_still_works(vault, tmp_path):
    write(vault, "a.md", "---\npublish: true\n---\nhello")
    out = build(vault, tmp_path)
    assert (out / "a.html").exists()


def test_publishing_is_not_the_publish_tag(vault, tmp_path):
    write(vault, "a.md", "Notes about #publishing strategies.\n")
    out = build(vault, tmp_path)
    assert not (out / "a.html").exists()


def test_publish_inside_code_does_not_publish(vault, tmp_path):
    write(vault, "a.md", "Docs:\n\n```\nadd #publish to a note\n```\n")
    write(vault, "b.md", "Use `#publish` to mark notes.\n")
    out = build(vault, tmp_path)
    assert not (out / "a.html").exists()
    assert not (out / "b.html").exists()


def test_publish_tag_is_invisible_in_output(vault, tmp_path):
    write(vault, "a.md", "---\ntags: [publish, ideas]\n---\nBody text. #publish #cooking\n")
    out = build(vault, tmp_path)
    html = (out / "a.html").read_text()
    # No chip, no tag page, but other tags untouched.
    assert "#publish" not in html
    assert "tags/publish.html" not in html
    assert not (out / "tags" / "publish.html").exists()
    assert "#cooking" in html
    assert (out / "tags" / "ideas.html").exists()
    assert (out / "tags" / "cooking.html").exists()
