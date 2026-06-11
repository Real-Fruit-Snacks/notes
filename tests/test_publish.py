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


def test_publish_false_frontmatter_vetoes_inline_tag(vault, tmp_path):
    """publish: false in frontmatter must override an inline #publish in body."""
    write(vault, "a.md", "---\npublish: false\n---\nWe will set #publish later.")
    out = build(vault, tmp_path)
    assert not (out / "a.html").exists()


def test_publish_false_frontmatter_vetoes_tags(vault, tmp_path):
    """publish: false in frontmatter must override a publish tag in frontmatter tags."""
    write(vault, "a.md", "---\npublish: false\ntags: [publish]\n---\nhello")
    out = build(vault, tmp_path)
    assert not (out / "a.html").exists()


def test_publish_false_string_does_not_veto(vault, tmp_path):
    """publish: 'false' (string, not bool) keeps current behavior — tag wins."""
    write(vault, "a.md", "---\npublish: 'false'\ntags: [publish]\n---\nhello")
    out = build(vault, tmp_path)
    assert (out / "a.html").exists()


def test_indented_code_block_does_not_publish(vault, tmp_path):
    """#publish inside a 4-space indented code block must NOT trigger publication."""
    write(vault, "a.md", "Some note\n\n    #publish in an indented code block\n")
    out = build(vault, tmp_path)
    assert not (out / "a.html").exists()


def test_tab_indented_code_block_does_not_publish(vault, tmp_path):
    """#publish inside a tab-indented code block must NOT trigger publication."""
    write(vault, "a.md", "Some note\n\n\t#publish in a tab-indented code block\n")
    out = build(vault, tmp_path)
    assert not (out / "a.html").exists()


def test_inline_publish_in_prose_still_publishes(vault, tmp_path):
    """Regression guard: real inline #publish in prose must still trigger publication."""
    write(vault, "a.md", "Some note with a real #publish marker in prose.\n")
    out = build(vault, tmp_path)
    assert (out / "a.html").exists()
