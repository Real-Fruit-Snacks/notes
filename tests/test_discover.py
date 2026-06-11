"""Tests for stage 1: discovery + publish filtering."""
from __future__ import annotations

import pytest

from obsidian_site.discover import discover, discover_with_warnings, slugify
from obsidian_site.models import SiteConfig


def test_slugify_basic():
    assert slugify("Hello World") == "hello-world"
    assert slugify("notes/My Idea") == "notes/my-idea"
    assert slugify("  Trailing--Dashes  ") == "trailing-dashes"
    assert slugify("Weird!@#Chars") == "weirdchars"
    assert slugify("") == "untitled"


def test_only_published_notes_included(config):
    notes, _ = discover(config)
    titles = {n.title for n in notes}
    assert "Welcome" in titles
    assert "Ideas" in titles
    assert "Snippet" in titles
    # publish: false must be excluded.
    assert "Secret Note" not in titles


def test_note_count(config):
    notes, _ = discover(config)
    assert len(notes) == 3


def test_slug_preserves_folders(config):
    notes, _ = discover(config)
    by_title = {n.title: n for n in notes}
    assert by_title["Ideas"].slug == "notes/ideas"
    assert by_title["Ideas"].url == "notes/ideas.html"
    assert by_title["Welcome"].slug == "welcome"


def test_tags_parsed(config):
    notes, _ = discover(config)
    welcome = next(n for n in notes if n.title == "Welcome")
    assert "intro" in welcome.tags
    assert "demo" in welcome.tags


def test_resolution_map_keys(config):
    _, resolution = discover(config)
    # by stem
    assert resolution["welcome"] == "welcome"
    assert resolution["ideas"] == "notes/ideas"
    # by relative path
    assert resolution["notes/ideas"] == "notes/ideas"
    # by title (lower-cased)
    assert resolution["snippet"] == "snippet"
    # unpublished note absent
    assert "secret note" not in resolution


# --- Fix 4: slugify improvements ---


def test_slugify_accented_latin(tmp_path):
    """NFKD normalisation: accented characters fold to ASCII equivalents."""
    assert slugify("Café") == "cafe"
    assert slugify("naïve") == "naive"
    assert slugify("résumé") == "resume"


def test_slugify_underscore_becomes_dash():
    """Underscores must be converted to dashes, not silently dropped."""
    assert slugify("Same_Note") == "same-note"
    assert slugify("my_file_name") == "my-file-name"


@pytest.fixture
def vault_nonlatin(tmp_path):
    v = tmp_path / "vault"
    v.mkdir()
    return v


def _write(vault, name, text):
    path = vault / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _build_notes(vault, tmp_path):
    config = SiteConfig(vault=vault, out=tmp_path / "out")
    notes, _ = discover_with_warnings(config)
    return notes


def test_nonlatin_filenames_get_distinct_deterministic_slugs(vault_nonlatin, tmp_path):
    """Fully non-Latin filenames must yield distinct, deterministic slugs (not 'untitled')."""
    _write(vault_nonlatin, "日本語.md", "---\npublish: true\n---\nhello")
    _write(vault_nonlatin, "한국어.md", "---\npublish: true\n---\nhello")
    notes1 = _build_notes(vault_nonlatin, tmp_path)
    # Build again (fresh config, same vault) for determinism check.
    notes2 = _build_notes(vault_nonlatin, tmp_path)

    slugs1 = {n.slug for n in notes1}
    slugs2 = {n.slug for n in notes2}

    assert len(slugs1) == 2, f"Expected 2 distinct slugs, got: {slugs1}"
    assert "untitled" not in slugs1
    assert slugs1 == slugs2, "Slugs are not stable across builds"


def test_untitled_note_gets_slug_untitled(vault_nonlatin, tmp_path):
    """A note literally named 'Untitled.md' must slug to 'untitled', not a hash."""
    _write(vault_nonlatin, "Untitled.md", "---\npublish: true\n---\nhello")
    notes = _build_notes(vault_nonlatin, tmp_path)
    assert len(notes) == 1
    assert notes[0].slug == "untitled"
    assert notes[0].url == "untitled.html"


def test_cjk_file_still_gets_hash_slug(vault_nonlatin, tmp_path):
    """CJK filenames that strip to empty must still receive a stable n-<hash> slug."""
    _write(vault_nonlatin, "日本語.md", "---\npublish: true\n---\nhello")
    notes = _build_notes(vault_nonlatin, tmp_path)
    assert len(notes) == 1
    slug = notes[0].slug
    assert slug.startswith("n-"), f"Expected hash slug, got: {slug}"
    assert slug == "n-c12140a0"


def test_slugify_nonlatin_returns_untitled():
    """Public slugify() still returns 'untitled' for fully non-Latin text (heading/tag callers)."""
    assert slugify("日本語") == "untitled"
