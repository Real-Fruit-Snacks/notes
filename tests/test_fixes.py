"""Regression tests for hardening fixes found during QA review."""
from __future__ import annotations

import pytest

from obsidian_site.builder import build_site
from obsidian_site.models import SiteConfig
from obsidian_site.render import _rfc822_date


def write_note(vault, name, body, fm="publish: true"):
    path = vault / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"---\n{fm}\n---\n{body}", encoding="utf-8")


@pytest.fixture
def vault(tmp_path):
    v = tmp_path / "vault"
    v.mkdir()
    return v


def build(vault, tmp_path, **kw):
    config = SiteConfig(vault=vault, out=tmp_path / "out", **kw)
    return config, build_site(config)


def test_image_embed_filename_is_escaped(vault, tmp_path):
    write_note(vault, "a.md", '![[foo" onerror="alert(1).png]]')
    config, _ = build(vault, tmp_path)
    html = (config.out / "a.html").read_text()
    # The quote must not break out of the src attribute.
    assert '" onerror="' not in html
    assert "foo&quot; onerror=&quot;alert(1).png" in html


def test_repeated_transclusion_heading_ids_unique(vault, tmp_path):
    write_note(vault, "inner.md", "## Section\ntext")
    write_note(vault, "host.md", "![[inner]]\n\n![[inner]]")
    config, _ = build(vault, tmp_path)
    html = (config.out / "host.html").read_text()
    assert html.count('id="inner-section"') == 1
    assert 'id="inner-section-2"' in html


def test_malformed_frontmatter_skipped_with_warning(vault, tmp_path):
    write_note(vault, "good.md", "hello")
    (vault / "bad.md").write_text("---\ntags: [unclosed\n---\nbody\n", encoding="utf-8")
    config, warnings = build(vault, tmp_path)
    assert (config.out / "good.html").exists()
    assert any("bad.md" in w for w in warnings)


def test_refuses_to_overwrite_foreign_directory(vault, tmp_path):
    write_note(vault, "a.md", "hi")
    out = tmp_path / "out"
    out.mkdir()
    (out / "precious.txt").write_text("do not delete", encoding="utf-8")
    config = SiteConfig(vault=vault, out=out)
    with pytest.raises(SystemExit):
        build_site(config)
    assert (out / "precious.txt").exists()


def test_overwrites_previous_build_output(vault, tmp_path):
    write_note(vault, "a.md", "hi")
    config = SiteConfig(vault=vault, out=tmp_path / "out")
    build_site(config)
    build_site(config)  # a second run replaces the first without complaint
    assert (config.out / "a.html").exists()


def test_rss_pubdate_is_rfc822(vault, tmp_path):
    write_note(vault, "a.md", "hi", fm="publish: true\ndate: 2024-01-18")
    config, _ = build(vault, tmp_path)
    feed = (config.out / "feed.xml").read_text()
    assert "<pubDate>Thu, 18 Jan 2024 00:00:00 +0000</pubDate>" in feed


def test_unparseable_date_omits_pubdate():
    assert _rfc822_date("sometime soon") == ""


def test_ambiguous_link_target_warns(vault, tmp_path):
    write_note(vault, "a/topic.md", "one")
    write_note(vault, "b/topic.md", "two")
    _, warnings = build(vault, tmp_path)
    assert any("ambiguous link target" in w for w in warnings)


def test_duplicate_image_name_warns(vault, tmp_path):
    (vault / "x" / "pic.png").parent.mkdir(parents=True)
    (vault / "y" / "pic.png").parent.mkdir(parents=True)
    (vault / "x" / "pic.png").write_bytes(b"a")
    (vault / "y" / "pic.png").write_bytes(b"b")
    write_note(vault, "a.md", "![[pic.png]]")
    _, warnings = build(vault, tmp_path)
    assert any("ambiguous embedded asset" in w for w in warnings)


def test_base_url_via_data_attribute_not_inline_script(vault, tmp_path):
    # Strict CSP (script-src 'self') blocks inline scripts, so the base URL
    # must travel on a DOM attribute instead.
    write_note(vault, "a.md", "hi")
    config, _ = build(vault, tmp_path, base_url="/myrepo/")
    html = (config.out / "a.html").read_text()
    assert '<body data-base-url="/myrepo/">' in html
    assert "window.BASE_URL" not in html


def test_title_only_callout_has_no_empty_paragraph(vault, tmp_path):
    write_note(vault, "a.md", "> [!note] Just a title\n")
    config, _ = build(vault, tmp_path)
    html = (config.out / "a.html").read_text()
    assert 'callout-title">Just a title</div>' in html
    assert "<p></p>" not in html
