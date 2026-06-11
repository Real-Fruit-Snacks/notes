"""Tools section: unicode name data, character inspector page, topbar dropdown."""
from __future__ import annotations

import json

from obsidian_site.builder import build_site
from obsidian_site.models import SiteConfig
from obsidian_site.unicode_names import name_table


def test_name_table_official_names():
    names = name_table()
    assert names["0048"] == "LATIN CAPITAL LETTER H"
    assert names["1F4A9"] == "PILE OF POO"
    assert names["200B"] == "ZERO WIDTH SPACE"


def test_name_table_control_aliases():
    names = name_table()
    assert "TAB" in names["0009"]          # CHARACTER TABULATION (TAB)
    assert names["000A"].startswith("LINE FEED")
    assert "ESC" in names["001B"]
    assert names["0085"] == "NEXT LINE"    # C1 control alias
    assert "DEL" in names["007F"]


def test_name_table_skips_surrogates_and_unassigned():
    names = name_table()
    assert "D800" not in names
    assert "0378" not in names             # unassigned in the BMP


def test_unicode_names_json_emitted(config):
    build_site(config)
    data = json.loads((config.out / "unicode-names.json").read_text(encoding="utf-8"))
    assert data["0041"] == "LATIN CAPITAL LETTER A"
    assert data["1F4A9"] == "PILE OF POO"
    assert len(data) > 100000  # full table, not a truncation


def test_characters_page_emitted(config):
    build_site(config)
    html = (config.out / "tools" / "characters.html").read_text(encoding="utf-8")
    assert 'id="char-input"' in html
    assert 'id="char-grid"' in html
    assert "/myrepo/assets/tools/characters.js" in html


def test_characters_wikilink_resolves(tmp_path):
    vault = tmp_path / "vault"
    vault.mkdir()
    (vault / "home.md").write_text(
        "---\ntitle: Home\npublish: true\n---\n\n"
        "Try [[Characters]] or the [[Character Inspector]].\n",
        encoding="utf-8",
    )
    config = SiteConfig(vault=vault, out=tmp_path / "out", base_url="/")
    warnings = build_site(config)

    html = (config.out / "home.html").read_text(encoding="utf-8")
    assert html.count('href="/tools/characters.html"') == 2
    assert '<span class="broken-link"' not in html
    assert not any("Characters" in w for w in warnings)


def test_characters_page_in_sitemap(tmp_path, vault_path):
    config = SiteConfig(
        vault=vault_path, out=tmp_path / "out",
        base_url="/myrepo/", site_url="https://example.com",
    )
    build_site(config)
    sitemap = (config.out / "sitemap.xml").read_text(encoding="utf-8")
    assert "https://example.com/myrepo/tools/characters.html" in sitemap
