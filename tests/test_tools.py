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
    assert html.count('href="/tools/characters.html"') == 3  # 2 wikilinks + 1 topnav dropdown
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
    assert "https://example.com/myrepo/graph.html" in sitemap
    assert "https://example.com/myrepo/tools/subnet.html" in sitemap
    assert "https://example.com/myrepo/tools/certs.html" in sitemap
    assert "https://example.com/myrepo/tools/cron.html" in sitemap
    assert "https://example.com/myrepo/tools/chmod.html" in sitemap
    assert "https://example.com/myrepo/tools/cidr.html" in sitemap
    assert "https://example.com/myrepo/tools/timestamp.html" in sitemap


def test_subnet_page_emitted(config):
    build_site(config)
    html = (config.out / "tools" / "subnet.html").read_text(encoding="utf-8")
    assert 'id="subnet-input"' in html
    assert 'id="subnet-prefix"' in html
    assert 'id="subnet-facts"' in html
    assert "/myrepo/assets/tools/subnet.js" in html


def test_subnet_wikilink_resolves(tmp_path):
    vault = tmp_path / "vault"
    vault.mkdir()
    (vault / "home.md").write_text(
        "---\ntitle: Home\npublish: true\n---\n\nUse the [[Subnet Calculator]].\n",
        encoding="utf-8",
    )
    config = SiteConfig(vault=vault, out=tmp_path / "out", base_url="/")
    warnings = build_site(config)

    html = (config.out / "home.html").read_text(encoding="utf-8")
    assert 'href="/tools/subnet.html"' in html
    assert '<span class="broken-link"' not in html
    assert not any("Subnet" in w for w in warnings)


def test_topbar_has_tools_dropdown(config):
    build_site(config)
    html = (config.out / "index.html").read_text(encoding="utf-8")
    assert '<details class="tools-menu"' in html
    assert 'href="/myrepo/tools/characters.html"' in html
    assert ">Character Inspector</a>" in html
    assert 'href="/myrepo/tools/subnet.html"' in html
    assert ">Subnet Calculator</a>" in html
    assert 'href="/myrepo/tools/certs.html"' in html
    assert ">Certificate Checker</a>" in html
    assert 'href="/myrepo/tools/cron.html"' in html
    assert ">Cron Parser</a>" in html
    assert 'href="/myrepo/tools/chmod.html"' in html
    assert ">chmod Calculator</a>" in html
    assert 'href="/myrepo/tools/cidr.html"' in html
    assert ">CIDR Aggregator</a>" in html
    assert 'href="/myrepo/tools/timestamp.html"' in html
    assert ">Timestamp Converter</a>" in html
    # Entries are alphabetical (case-insensitive) and each carries an icon.
    names = [
        "Certificate Checker", "Character Inspector", "chmod Calculator",
        "CIDR Aggregator", "Cron Parser", "Subnet Calculator",
        "Timestamp Converter",
    ]
    positions = [html.index(">" + n + "</a>") for n in names]
    assert positions == sorted(positions)
    assert html.count('class="tools-menu-icon"') == len(names)


def test_subnet_wiki_present(config):
    build_site(config)
    html = (config.out / "tools" / "subnet.html").read_text(encoding="utf-8")
    assert 'id="subnet-wiki"' in html
    assert html.count('class="wiki-entry"') == 9
    assert '<span data-wiki="broadcast">192.168.1.255</span>' in html
    assert '<span data-wiki="netmask">255.255.255.0</span>' in html


def test_characters_repr_and_wiki_present(config):
    build_site(config)
    html = (config.out / "tools" / "characters.html").read_text(encoding="utf-8")
    assert 'id="char-repr"' in html
    assert 'id="repr-table"' in html
    assert 'id="char-wiki"' in html
    assert html.count('class="wiki-entry"') == 10


def test_characters_md5_present(config):
    build_site(config)
    html = (config.out / "tools" / "characters.html").read_text(encoding="utf-8")
    assert 'id="char-hashes"' in html
    assert 'id="md5-grid"' in html
    assert 'id="md5-placeholder"' in html
    assert "MD5 &amp; the newline gotcha" in html
    assert html.index('id="char-hashes"') < html.index('id="char-repr"')


def test_certs_page_emitted(config):
    build_site(config)
    html = (config.out / "tools" / "certs.html").read_text(encoding="utf-8")
    assert 'id="cert-input"' in html
    assert 'id="cert-results"' in html
    assert 'id="cert-wiki"' in html
    assert "/myrepo/assets/tools/certs.js" in html
    assert html.count('class="wiki-entry"') == 6


def test_certs_wikilink_resolves(tmp_path):
    vault = tmp_path / "vault"
    vault.mkdir()
    (vault / "home.md").write_text(
        "---\ntitle: Home\npublish: true\n---\n\n"
        "Use the [[Certificate Checker]].\n",
        encoding="utf-8",
    )
    config = SiteConfig(vault=vault, out=tmp_path / "out", base_url="/")
    warnings = build_site(config)

    html = (config.out / "home.html").read_text(encoding="utf-8")
    assert 'href="/tools/certs.html"' in html
    assert '<span class="broken-link"' not in html
    assert not any("Certificate" in w for w in warnings)


def test_tool_example_buttons(config):
    build_site(config)
    for page in ("characters", "subnet", "certs", "cron", "chmod", "cidr", "timestamp"):
        html = (config.out / "tools" / (page + ".html")).read_text(encoding="utf-8")
        assert html.count('class="tool-examples"') == 1, page
        assert html.count('class="example-btn"') == 3, page
        assert 'data-example="' in html, page


def test_cron_page_emitted(config):
    build_site(config)
    html = (config.out / "tools" / "cron.html").read_text(encoding="utf-8")
    assert 'id="cron-input"' in html
    assert 'id="cron-desc"' in html
    assert 'id="cron-fields"' in html
    assert 'id="cron-runs"' in html
    assert 'id="cron-wiki"' in html
    assert "/myrepo/assets/tools/cron.js" in html
    assert html.count('class="wiki-entry"') == 9


def test_cron_wikilink_resolves(tmp_path):
    vault = tmp_path / "vault"
    vault.mkdir()
    (vault / "home.md").write_text(
        "---\ntitle: Home\npublish: true\n---\n\n"
        "Use the [[Cron Parser]].\n",
        encoding="utf-8",
    )
    config = SiteConfig(vault=vault, out=tmp_path / "out", base_url="/")
    warnings = build_site(config)

    html = (config.out / "home.html").read_text(encoding="utf-8")
    assert 'href="/tools/cron.html"' in html
    assert '<span class="broken-link"' not in html
    assert not any("Cron" in w for w in warnings)


def test_chmod_page_emitted(config):
    build_site(config)
    html = (config.out / "tools" / "chmod.html").read_text(encoding="utf-8")
    assert 'id="chmod-grid"' in html
    assert 'id="chmod-octal"' in html
    assert 'id="chmod-symbolic"' in html
    assert 'id="chmod-desc"' in html
    assert 'id="chmod-umask"' in html
    assert 'id="chmod-wiki"' in html
    assert "/myrepo/assets/tools/chmod.js" in html
    assert html.count('class="wiki-entry"') == 10


def test_chmod_wikilink_resolves(tmp_path):
    vault = tmp_path / "vault"
    vault.mkdir()
    (vault / "home.md").write_text(
        "---\ntitle: Home\npublish: true\n---\n\n"
        "Use the [[Chmod Calculator]].\n",
        encoding="utf-8",
    )
    config = SiteConfig(vault=vault, out=tmp_path / "out", base_url="/")
    warnings = build_site(config)

    html = (config.out / "home.html").read_text(encoding="utf-8")
    assert 'href="/tools/chmod.html"' in html
    assert '<span class="broken-link"' not in html
    assert not any("hmod" in w for w in warnings)


def test_cidr_page_emitted(config):
    build_site(config)
    html = (config.out / "tools" / "cidr.html").read_text(encoding="utf-8")
    assert 'id="cidr-input"' in html
    assert 'id="cidr-desc"' in html
    assert 'id="cidr-results"' in html
    assert 'id="split-net"' in html
    assert 'id="split-results"' in html
    assert 'id="cidr-wiki"' in html
    assert "/myrepo/assets/tools/cidr.js" in html
    assert html.count('class="wiki-entry"') == 8


def test_cidr_wikilink_resolves(tmp_path):
    vault = tmp_path / "vault"
    vault.mkdir()
    (vault / "home.md").write_text(
        "---\ntitle: Home\npublish: true\n---\n\n"
        "Use the [[CIDR Aggregator]].\n",
        encoding="utf-8",
    )
    config = SiteConfig(vault=vault, out=tmp_path / "out", base_url="/")
    warnings = build_site(config)

    html = (config.out / "home.html").read_text(encoding="utf-8")
    assert 'href="/tools/cidr.html"' in html
    assert '<span class="broken-link"' not in html
    assert not any("CIDR" in w for w in warnings)


def test_timestamp_page_emitted(config):
    build_site(config)
    html = (config.out / "tools" / "timestamp.html").read_text(encoding="utf-8")
    assert 'id="ts-input"' in html
    assert 'id="ts-now"' in html
    assert 'id="ts-desc"' in html
    assert 'id="ts-table"' in html
    assert 'id="ts-wiki"' in html
    assert "/myrepo/assets/tools/timestamp.js" in html
    assert html.count('class="wiki-entry"') == 9


def test_timestamp_wikilink_resolves(tmp_path):
    vault = tmp_path / "vault"
    vault.mkdir()
    (vault / "home.md").write_text(
        "---\ntitle: Home\npublish: true\n---\n\n"
        "Use the [[Timestamp Converter]].\n",
        encoding="utf-8",
    )
    config = SiteConfig(vault=vault, out=tmp_path / "out", base_url="/")
    warnings = build_site(config)

    html = (config.out / "home.html").read_text(encoding="utf-8")
    assert 'href="/tools/timestamp.html"' in html
    assert '<span class="broken-link"' not in html
    assert not any("Timestamp" in w for w in warnings)
