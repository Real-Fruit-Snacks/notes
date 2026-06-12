"""Stage 2: render note markdown to HTML with Obsidian semantics.

The :class:`Parser` owns a configured ``MarkdownIt`` instance and renders each
note's body, resolving wikilinks/embeds against the publish set and recording
the outgoing links it discovers (used later for backlinks and the graph).
"""
from __future__ import annotations

import html
import posixpath
import re
from dataclasses import dataclass, field
from pathlib import Path

from markdown_it import MarkdownIt
from mdit_py_plugins.dollarmath import dollarmath_plugin
from mdit_py_plugins.footnote import footnote_plugin
from mdit_py_plugins.tasklists import tasklists_plugin
from pygments import highlight as pygments_highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name, guess_lexer
from pygments.util import ClassNotFound

from .discover import slugify
from .models import Link, Note
from .rules.callout import callout_plugin
from .rules.hashtag import hashtag_plugin
from .rules.heading import heading_plugin
from .rules.transclusion import unwrap_embeds_plugin
from .rules.wikilink import IMAGE_EXTS, wikilink_plugin


def _highlight(code: str, lang: str, _attrs) -> str:
    """Pygments highlighter for fenced code blocks.

    Returns a string starting with ``<pre`` so markdown-it uses it verbatim
    rather than wrapping it again in its own ``<pre><code>``.
    """
    if lang == "mermaid":
        # A <pre> return is used verbatim by markdown-it; mermaid-init.js
        # renders the diagram client-side from the escaped source text.
        return f'<pre class="mermaid">{html.escape(code)}</pre>\n'
    lang_attr = f' data-lang="{html.escape(lang)}"' if lang else ""
    try:
        lexer = get_lexer_by_name(lang) if lang else guess_lexer(code)
    except (ClassNotFound, ValueError):
        return f'<pre class="highlight"{lang_attr}><code>{html.escape(code)}</code></pre>\n'
    # nowrap=True -> just the highlighted spans; we supply the <pre><code> shell
    # so the `.highlight` class lands where the Pygments CSS expects it.
    formatter = HtmlFormatter(nowrap=True)
    inner = pygments_highlight(code, lexer, formatter)
    return f'<pre class="highlight"{lang_attr}><code>{inner}</code></pre>\n'


@dataclass
class RenderResult:
    html: str
    links: list[Link] = field(default_factory=list)
    assets: set[str] = field(default_factory=set)  # asset filenames referenced
    tags: set[str] = field(default_factory=set)     # inline #tags found in the body
    headings: list[dict] = field(default_factory=list)  # {level, text, id} for the ToC


class Parser:
    def __init__(self, resolution: dict[str, str], notes_by_slug: dict[str, Note], base_url: str = "/"):
        self.resolution = resolution
        self.notes_by_slug = notes_by_slug
        self.base_url = base_url
        self.md = (
            MarkdownIt("commonmark", {"highlight": _highlight, "html": True})
            .enable(["table", "strikethrough"])
            .use(tasklists_plugin)
            .use(footnote_plugin)
            .use(dollarmath_plugin, allow_labels=False, allow_digits=False)
            .use(wikilink_plugin)
            .use(hashtag_plugin)
            .use(heading_plugin)
            .use(callout_plugin)
            .use(unwrap_embeds_plugin)
        )
        # Assign bound methods directly rather than via add_render_rule(),
        # which re-binds the callable to the renderer with __get__ — on
        # Python >= 3.11 that rebinds `self` away from this Parser.
        self.md.renderer.rules["wikilink"] = self._render_wikilink
        self.md.renderer.rules["hashtag"] = self._render_hashtag
        self.md.renderer.rules["math_inline"] = self._render_math_inline
        self.md.renderer.rules["math_block"] = self._render_math_block

    # -- public API -------------------------------------------------------
    def render(self, note: Note) -> RenderResult:
        result = RenderResult(html="")
        env = {
            "ctx": self, "result": result, "stack": [note.slug],
            "_heading_ids": {}, "note_title": note.title,
        }
        result.html = self.md.render(note.body, env)
        return result

    # -- internals --------------------------------------------------------
    def _resolve(self, target: str) -> str | None:
        return self.resolution.get(target.lower())

    def _url(self, slug: str, heading: str | None = None) -> str:
        url = posixpath.join(self.base_url, f"{slug}.html")
        if heading:
            url += "#" + slugify(heading)
        return url

    def _render_wikilink(self, tokens, idx, options, env) -> str:
        meta = tokens[idx].meta
        kind = meta["kind"]
        if kind == "image_embed":
            return self._render_image(meta, env)
        if kind == "note_embed":
            return self._render_transclusion(meta, env)
        return self._render_link(meta, env)

    def _render_link(self, meta, env) -> str:
        target, heading, alias = meta["target"], meta["heading"], meta["alias"]
        slug = self._resolve(target)
        # Build the visible label. A bare heading link reads as
        # "Note › Heading" with the heading part styled, not "Note#Heading".
        if alias:
            label = html.escape(alias)
        elif heading:
            label = (
                f'{html.escape(target)}'
                f'<span class="link-heading"> › {html.escape(heading)}</span>'
            )
        else:
            label = html.escape(target)
        link = Link(target=target, alias=alias, heading=heading, resolved_slug=slug)
        env["result"].links.append(link)
        if slug is None:
            return f'<span class="broken-link" title="unresolved link">{label}</span>'
        href = self._url(slug, heading)
        return f'<a class="internal-link" data-slug="{slug}" href="{href}">{label}</a>'

    def _render_hashtag(self, tokens, idx, options, env) -> str:
        tag = tokens[idx].meta["tag"]
        href = posixpath.join(self.base_url, "tags", f"{slugify(tag)}.html")
        return f'<a class="tag-inline" href="{href}">#{html.escape(tag)}</a>'

    def _render_math_inline(self, tokens, idx, options, env) -> str:
        # Raw TeX, escaped; KaTeX renders it client-side (assets/math.js).
        return f'<span class="math math-inline">{html.escape(tokens[idx].content)}</span>'

    def _render_math_block(self, tokens, idx, options, env) -> str:
        return f'<div class="math math-block">{html.escape(tokens[idx].content)}</div>\n'

    def _render_image(self, meta, env) -> str:
        target = meta["target"]
        name = Path(target).name
        env["result"].assets.add(name)
        src = posixpath.join(self.base_url, "assets", name)
        alt = meta["alias"] or Path(target).stem
        return f'<img class="embed-image" src="{html.escape(src)}" alt="{html.escape(alt)}">'

    def _render_transclusion(self, meta, env) -> str:
        target = meta["target"]
        slug = self._resolve(target)
        if slug is None or slug not in self.notes_by_slug:
            text = meta["alias"] or target
            return f'<span class="broken-link" title="unresolved embed">{html.escape(text)}</span>'
        if slug in env["stack"]:
            return '<div class="transclusion-cycle">(recursive embed omitted)</div>'
        note = self.notes_by_slug[slug]
        child_env = {
            "ctx": self,
            "result": env["result"],          # share links/assets with parent
            "stack": env["stack"] + [slug],
            # Share the page-wide id registry so embedding the same note twice
            # still yields unique heading ids.
            "_heading_ids": env.setdefault("_heading_ids", {}),
        }
        inner = self.md.render(note.body, child_env)
        return (
            f'<div class="transclusion" data-note="{slug}">'
            f'<div class="transclusion-title">{html.escape(note.title)}</div>'
            f"{inner}</div>"
        )


def pygments_css() -> str:
    """Return the Pygments stylesheet for both themes.

    Mocha rules are emitted unscoped (it is the default theme); Tokyo Night
    rules are scoped under ``[data-theme="light"]`` (the legacy slot name for
    the alternate theme — both are dark). The container-background rule of
    each is dropped so our theme variable (``--code-bg``) controls the block
    background, and the unscoped pre/linenos boilerplate (which Pygments does
    not prefix with the scope) is kept only once, from the Mocha pass.
    """
    from .pygments_styles import CatppuccinMocha, TokyoNight

    boilerplate = re.compile(
        r"^(?:pre|td\.linenos[^{]*|span\.linenos[^{]*)\s*\{[^}]*\}\n?", re.MULTILINE
    )

    def defs(style, scope: str, strip_boilerplate: bool = False) -> str:
        css = HtmlFormatter(style=style, cssclass="highlight").get_style_defs(scope)
        # Remove the standalone container rule (incl. background) for `scope`.
        css = re.sub(re.escape(scope) + r"\s*\{[^}]*\}", "", css, count=1)
        if strip_boilerplate:
            css = boilerplate.sub("", css)
        return css.strip()

    mocha = defs(CatppuccinMocha, ".highlight")
    tokyo = defs(TokyoNight, '[data-theme="light"] .highlight', strip_boilerplate=True)
    return mocha + "\n\n/* Alternate theme (Tokyo Night) */\n" + tokyo
