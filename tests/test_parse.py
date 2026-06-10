"""Tests for stage 2: markdown rendering with Obsidian semantics."""
from __future__ import annotations

import pytest

from obsidian_site.discover import discover
from obsidian_site.parse import Parser


@pytest.fixture
def parser(config):
    notes, resolution = discover(config)
    by_slug = {n.slug: n for n in notes}
    return Parser(resolution, by_slug, base_url=config.base_url), {n.slug: n for n in notes}


def render_note(parser_pair, title):
    parser, by_slug = parser_pair
    note = next(n for n in by_slug.values() if n.title == title)
    res = parser.render(note)
    note.html = res.html
    note.out_links = res.links
    return res


def test_wikilink_resolves(parser):
    res = render_note(parser, "Welcome")
    assert '<a class="internal-link" data-slug="notes/ideas" href="/myrepo/notes/ideas.html">ideas</a>' in res.html


def test_wikilink_alias(parser):
    res = render_note(parser, "Welcome")
    assert ">some great ideas</a>" in res.html


def test_wikilink_heading(parser):
    res = render_note(parser, "Welcome")
    assert 'href="/myrepo/notes/ideas.html#subsection"' in res.html


def test_broken_link(parser):
    res = render_note(parser, "Welcome")
    assert '<span class="broken-link"' in res.html
    # The unpublished target must never become an anchor.
    assert "secret-note.html" not in res.html


def test_image_embed(parser):
    res = render_note(parser, "Welcome")
    assert '<img class="embed-image" src="/myrepo/assets/diagram.png"' in res.html
    assert "diagram.png" in res.assets


def test_note_transclusion(parser):
    res = render_note(parser, "Welcome")
    assert 'class="transclusion"' in res.html
    assert "reusable snippet that gets transcluded" in res.html


def test_callout(parser):
    res = render_note(parser, "Welcome")
    assert 'class="callout callout-warning"' in res.html
    assert 'class="callout-title">Heads up</div>' in res.html


def test_code_highlight(parser):
    res = render_note(parser, "Welcome")
    # Fenced python block carries a language label and a single clean <pre>.
    assert '<pre class="highlight" data-lang="python"><code>' in res.html
    assert 'class="k"' in res.html  # pygments token span
    # No double-wrapped <pre><code><div class="highlight"><pre> nesting.
    assert "<div class=\"highlight\"><pre>" not in res.html


def test_links_recorded(parser):
    res = render_note(parser, "Welcome")
    targets = {l.target for l in res.links}
    assert "ideas" in targets
    # broken link is still recorded (as broken)
    assert any(l.is_broken for l in res.links)
