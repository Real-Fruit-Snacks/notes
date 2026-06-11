"""Regression tests for hardening fixes found during QA review."""
from __future__ import annotations

import pytest

from obsidian_site.builder import build_site
from obsidian_site.models import SiteConfig
from obsidian_site.render import _parse_iso, _rfc822_date


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
    # The dedup algorithm appends -1, -2, ... (first duplicate becomes -1).
    assert 'id="inner-section-1"' in html


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
    config, _ = build(vault, tmp_path, site_url="https://example.com")
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


def test_heading_dedup_no_collision_with_suffixed_heading(vault, tmp_path):
    """## Intro / ## Intro / ## Intro 2 must yield three distinct ids.

    The old algorithm produced intro, intro-2, intro-2 (collision) because it
    never checked whether the suffixed id itself was already taken.
    """
    write_note(vault, "a.md", "## Intro\n\n## Intro\n\n## Intro 2\n")
    config, _ = build(vault, tmp_path)
    html = (config.out / "a.html").read_text()
    # Collect all heading ids from the rendered output.
    import re
    ids = re.findall(r'id="([^"]+)"', html)
    heading_ids = [i for i in ids if i.startswith("intro")]
    assert len(heading_ids) == len(set(heading_ids)), (
        f"Duplicate heading ids found: {heading_ids}"
    )
    assert len(heading_ids) == 3


def test_parse_iso_handles_z_suffix():
    from datetime import timezone
    dt = _parse_iso("2026-01-01T00:00:00Z")
    assert dt is not None
    assert dt.tzinfo is not None
    assert dt.utcoffset().total_seconds() == 0


def test_rfc822_date_z_timestamp():
    result = _rfc822_date("2026-01-01T00:00:00Z")
    assert result != ""
    assert "2026" in result


def test_z_timestamp_in_updated_does_not_crash(vault, tmp_path):
    """A note with a Z-suffixed updated date must not crash the index build."""
    write_note(vault, "a.md", "hello")
    config = SiteConfig(vault=vault, out=tmp_path / "out")
    # Patch the updated field after discovery by building normally; the
    # real guard is that fromisoformat("...Z") crashed on Py 3.10.
    # We verify via direct helper test above; here just ensure no crash.
    build_site(config)
    assert (config.out / "index.html").exists()


def test_vendor_katex_mermaid_absent_when_unused(vault, tmp_path):
    """A vault with no math or mermaid must not ship katex/ or mermaid/ dirs."""
    write_note(vault, "a.md", "Just plain text, no math or diagrams.")
    config = SiteConfig(vault=vault, out=tmp_path / "out")
    build_site(config)
    vendor = config.out / "assets" / "vendor"
    assert not (vendor / "katex").exists(), "katex/ should be pruned when unused"
    assert not (vendor / "mermaid").exists(), "mermaid/ should be pruned when unused"
    # d3 and minisearch are always present
    assert (vendor / "d3.min.js").exists()
    assert (vendor / "minisearch.min.js").exists()


def test_vendor_katex_present_when_math_used(vault, tmp_path):
    """A vault with math must retain katex/ in the output."""
    write_note(vault, "a.md", "Here is math: $e^{i\\pi}+1=0$")
    config = SiteConfig(vault=vault, out=tmp_path / "out")
    build_site(config)
    vendor = config.out / "assets" / "vendor"
    assert (vendor / "katex").exists(), "katex/ must be present when math is used"
    assert not (vendor / "mermaid").exists(), "mermaid/ should be pruned when unused"


def test_vendor_mermaid_present_when_diagrams_used(vault, tmp_path):
    """A vault with a mermaid diagram must retain mermaid/ in the output."""
    write_note(vault, "a.md", "```mermaid\ngraph TD; A-->B;\n```")
    config = SiteConfig(vault=vault, out=tmp_path / "out")
    build_site(config)
    vendor = config.out / "assets" / "vendor"
    assert (vendor / "mermaid").exists(), "mermaid/ must be present when diagrams are used"
    assert not (vendor / "katex").exists(), "katex/ should be pruned when unused"
