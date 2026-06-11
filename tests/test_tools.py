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
    assert "TAB" in data["0009"]
