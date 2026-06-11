"""Tests for Obsidian-syntax completeness: footnotes, math, Mermaid."""
from __future__ import annotations

from obsidian_site.builder import build_site
from obsidian_site.models import SiteConfig


def _build_one(tmp_path, body: str) -> str:
    vault = tmp_path / "v"
    vault.mkdir()
    (vault / "n.md").write_text(
        f"---\ntitle: N\npublish: true\n---\n\n{body}\n", encoding="utf-8"
    )
    cfg = SiteConfig(vault=vault, out=tmp_path / "o")
    build_site(cfg)
    return (cfg.out / "n.html").read_text()


# --- footnotes -----------------------------------------------------------------

def test_footnotes_render(tmp_path):
    html = _build_one(tmp_path, "Body text[^1].\n\n[^1]: The footnote.")
    assert 'class="footnote-ref"' in html
    assert 'class="footnotes"' in html
    assert "The footnote." in html


# --- math ----------------------------------------------------------------------

def test_inline_and_block_math_render(tmp_path):
    html = _build_one(tmp_path, "Euler: $e^{i\\pi}+1=0$\n\n$$\\int_0^1 x\\,dx$$")
    assert '<span class="math math-inline">' in html
    assert '<div class="math math-block">' in html
    assert "vendor/katex/katex.min.js" in html       # lazy include present


def test_dollar_amounts_are_not_math(tmp_path):
    html = _build_one(tmp_path, "I paid $5 and $10 for items.")
    assert 'class="math' not in html


def test_no_katex_on_pages_without_math(config):
    build_site(config)
    html = (config.out / "welcome.html").read_text()
    assert "katex" not in html


# --- mermaid -------------------------------------------------------------------

def test_mermaid_fence_becomes_container(tmp_path):
    html = _build_one(tmp_path, "```mermaid\ngraph TD; A-->B;\n```")
    assert '<pre class="mermaid">' in html
    assert "vendor/mermaid/mermaid.min.js" in html


def test_no_mermaid_js_on_other_pages(config):
    build_site(config)
    html = (config.out / "welcome.html").read_text()
    assert "mermaid" not in html
