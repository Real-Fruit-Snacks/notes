"""Tests for the polish/feature pass: anchors, inline tags, embeds, SEO."""
from __future__ import annotations

import json

import pytest

from obsidian_site.builder import build_site
from obsidian_site.discover import discover
from obsidian_site.models import SiteConfig
from obsidian_site.parse import Parser


@pytest.fixture
def parsed(config):
    notes, resolution = discover(config)
    resolution.setdefault("graph", "graph")
    by_slug = {n.slug: n for n in notes}
    parser = Parser(resolution, by_slug, base_url=config.base_url)
    out = {}
    for n in notes:
        res = parser.render(n)
        out[n.title] = res
    return out


# --- heading anchors ---------------------------------------------------------

def test_headings_get_ids(parsed):
    ideas = parsed["Ideas"]
    assert 'id="subsection"' in ideas.html  # [[ideas#Subsection]] now has a target
    assert any(h["id"] == "subsection" for h in ideas.headings)


def test_heading_link_matches_anchor(config):
    # The href produced for [[ideas#Subsection]] must match a real element id.
    build_site(config)
    welcome = (config.out / "welcome.html").read_text()
    ideas = (config.out / "notes" / "ideas.html").read_text()
    assert 'href="/myrepo/notes/ideas.html#subsection"' in welcome
    assert 'id="subsection"' in ideas


# --- inline tags -------------------------------------------------------------

def test_inline_tag_becomes_link(parsed):
    welcome = parsed["Welcome"]
    assert '<a class="tag-inline" href="/myrepo/tags/demo.html">#demo</a>' in welcome.html


def test_inline_tag_collected(config):
    build_site(config)
    # #demo is only inline-tagged in Welcome's body; its tag page must exist.
    assert (config.out / "tags" / "demo.html").exists()


def test_tag_inside_code_is_not_linked(tmp_path):
    vault = tmp_path / "v"
    vault.mkdir()
    (vault / "n.md").write_text(
        "---\ntitle: N\npublish: true\n---\n\nText #real but `#fake` and:\n\n```\n#alsofake\n```\n",
        encoding="utf-8",
    )
    cfg = SiteConfig(vault=vault, out=tmp_path / "o", base_url="/")
    build_site(cfg)
    html = (cfg.out / "n.html").read_text()
    assert 'tag-inline" href="/tags/real.html"' in html
    assert "tags/fake.html" not in html
    assert "tags/alsofake.html" not in html


# --- transclusion unwrap -----------------------------------------------------

def test_transclusion_not_wrapped_in_p(config):
    build_site(config)
    html = (config.out / "welcome.html").read_text()
    assert '<p><div class="transclusion"' not in html
    assert '<div class="transclusion"' in html


# --- SEO / sharing -----------------------------------------------------------

def test_excerpts_json(config):
    build_site(config)
    data = json.loads((config.out / "excerpts.json").read_text())
    assert "welcome" in data
    assert data["welcome"]["excerpt"]
    assert data["welcome"]["url"] == "/myrepo/welcome.html"


def test_sitemap_and_feed_and_404(config):
    build_site(config)
    assert (config.out / "404.html").exists()
    assert (config.out / "sitemap.xml").exists()
    feed = (config.out / "feed.xml").read_text()
    assert "<rss" in feed and "<item>" in feed


def test_strikethrough_and_tasklists(tmp_path):
    vault = tmp_path / "v"
    vault.mkdir()
    (vault / "n.md").write_text(
        "---\ntitle: N\npublish: true\n---\n\n~~gone~~\n\n- [ ] todo\n- [x] done\n",
        encoding="utf-8",
    )
    cfg = SiteConfig(vault=vault, out=tmp_path / "o", base_url="/")
    build_site(cfg)
    html = (cfg.out / "n.html").read_text()
    assert "<s>gone</s>" in html
    assert "task-list-item" in html
    assert 'checked="checked"' in html


def test_local_graph_box_and_lazy_d3(config):
    build_site(config)
    note = (config.out / "welcome.html").read_text()
    # The note has the local-graph container wired to its slug...
    assert '<div id="local-graph" data-slug="welcome">' in note
    assert (config.out / "assets" / "localgraph.js").exists()
    # ...but does NOT eagerly load d3 (that's lazy-loaded on expand).
    assert "vendor/d3.min.js" not in note
    # The global graph page still loads d3 up front.
    assert "vendor/d3.min.js" in (config.out / "graph.html").read_text()


def test_absolute_urls_when_site_url_set(tmp_path, vault_path):
    cfg = SiteConfig(
        vault=vault_path, out=tmp_path / "o", base_url="/myrepo/",
        site_url="https://example.com",
    )
    build_site(cfg)
    sm = (cfg.out / "sitemap.xml").read_text()
    assert "https://example.com/myrepo/welcome.html" in sm
    og = (cfg.out / "welcome.html").read_text()
    assert 'property="og:url" content="https://example.com/myrepo/welcome.html"' in og
