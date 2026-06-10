"""Tests for stage 3: backlinks + graph dataset."""
from __future__ import annotations

from obsidian_site.discover import discover
from obsidian_site.graph import build_links
from obsidian_site.parse import Parser


def _parsed_notes(config):
    notes, resolution = discover(config)
    by_slug = {n.slug: n for n in notes}
    parser = Parser(resolution, by_slug, base_url=config.base_url)
    for note in notes:
        res = parser.render(note)
        note.html = res.html
        note.out_links = res.links
    return notes, by_slug


def test_backlinks(config):
    notes, by_slug = _parsed_notes(config)
    build_links(notes)
    # welcome links to ideas -> ideas has welcome as a backlink
    assert "welcome" in by_slug["notes/ideas"].backlinks
    # ideas links back to welcome
    assert "notes/ideas" in by_slug["welcome"].backlinks


def test_graph_dataset(config):
    notes, _ = _parsed_notes(config)
    graph = build_links(notes)
    ids = {n["id"] for n in graph["nodes"]}
    assert ids == {"welcome", "notes/ideas", "snippet"}
    edges = {(l["source"], l["target"]) for l in graph["links"]}
    assert ("welcome", "notes/ideas") in edges
    assert ("notes/ideas", "welcome") in edges
    # no self-links, no edges to unpublished notes
    assert all(l["source"] != l["target"] for l in graph["links"])


def test_node_val_scales_with_backlinks(config):
    notes, by_slug = _parsed_notes(config)
    graph = build_links(notes)
    val = {n["id"]: n["val"] for n in graph["nodes"]}
    assert val["welcome"] >= 2  # 1 + at least one backlink
