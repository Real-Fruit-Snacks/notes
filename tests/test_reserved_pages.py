"""Built-in pages (like the graph view) should be linkable via wikilinks."""
from __future__ import annotations

from obsidian_site.builder import build_site
from obsidian_site.models import SiteConfig


def _make_vault(tmp_path):
    vault = tmp_path / "vault"
    vault.mkdir()
    (vault / "home.md").write_text(
        "---\ntitle: Home\npublish: true\n---\n\nSee the [[Graph]] view.\n",
        encoding="utf-8",
    )
    return vault


def test_graph_wikilink_resolves(tmp_path):
    config = SiteConfig(vault=_make_vault(tmp_path), out=tmp_path / "out", base_url="/")
    warnings = build_site(config)

    html = (config.out / "home.html").read_text()
    assert 'href="/graph.html"' in html
    assert '<span class="broken-link"' not in html
    assert not any("Graph" in w for w in warnings)
