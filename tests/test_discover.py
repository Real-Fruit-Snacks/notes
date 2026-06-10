"""Tests for stage 1: discovery + publish filtering."""
from __future__ import annotations

from obsidian_site.discover import discover, slugify


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
