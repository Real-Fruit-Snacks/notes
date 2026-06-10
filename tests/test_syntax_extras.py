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
