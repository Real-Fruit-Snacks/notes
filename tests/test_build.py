"""End-to-end test for the full pipeline (stages 4 + 5 included)."""
from __future__ import annotations

import json

from obsidian_site.builder import build_site


def test_full_build_creates_pages(config):
    warnings = build_site(config)
    out = config.out

    # Core pages exist (folders preserved).
    assert (out / "index.html").exists()
    assert (out / "welcome.html").exists()
    assert (out / "notes" / "ideas.html").exists()
    assert (out / "graph.html").exists()
    assert (out / ".nojekyll").exists()

    # Unpublished note never emitted.
    assert not (out / "secret-note.html").exists()


def test_assets_copied(config):
    build_site(config)
    out = config.out
    assert (out / "assets" / "site.css").exists()
    assert (out / "assets" / "pygments.css").exists()
    assert (out / "assets" / "search.js").exists()
    assert (out / "assets" / "vendor" / "minisearch.min.js").exists()
    assert (out / "assets" / "vendor" / "d3.min.js").exists()
    # Embedded image copied from vault.
    assert (out / "assets" / "diagram.png").exists()


def test_search_and_graph_json(config):
    build_site(config)
    out = config.out
    search = json.loads((out / "search.json").read_text())
    assert any(d["title"] == "Welcome" for d in search)
    assert all("/myrepo/" in d["url"] for d in search)

    graph = json.loads((out / "graph.json").read_text())
    assert {n["id"] for n in graph["nodes"]} == {"welcome", "notes/ideas", "snippet"}


def test_note_page_content(config):
    build_site(config)
    html = (config.out / "welcome.html").read_text()
    assert "callout callout-warning" in html
    assert 'class="internal-link"' in html
    assert "Linked mentions" in html  # backlinks section (ideas links to welcome)
    assert "/myrepo/assets/site.css" in html  # base_url applied to asset links


def test_tag_pages(config):
    build_site(config)
    assert (config.out / "tags" / "demo.html").exists()
    assert (config.out / "tags" / "intro.html").exists()


def test_broken_link_warning(config):
    warnings = build_site(config)
    assert any("secret note" in w for w in warnings)
