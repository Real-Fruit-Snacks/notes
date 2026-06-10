"""Stage 4: turn parsed notes into a set of output pages via Jinja2.

:meth:`Renderer.render_site` returns a mapping of *output relative path* -> text
content (HTML and JSON). The emit stage writes these to disk and copies assets.
"""
from __future__ import annotations

import json
import posixpath
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .discover import slugify
from .models import Note, SiteConfig
from .text import plain_text

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"


def _rfc822_date(date_str: str) -> str:
    """ISO frontmatter date -> RFC 822 for RSS ``<pubDate>`` (empty if unparseable)."""
    from datetime import datetime, timezone
    from email.utils import format_datetime

    try:
        dt = datetime.fromisoformat(date_str)
    except ValueError:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return format_datetime(dt)


def build_nav_tree(notes: list[Note]) -> list[dict]:
    """Build a nested folder/note tree for the sidebar, folders before notes."""
    root: dict = {"folders": {}, "notes": []}
    for note in sorted(notes, key=lambda n: (n.folder_parts, n.title.lower())):
        cursor = root
        for part in note.folder_parts:
            cursor = cursor["folders"].setdefault(part, {"folders": {}, "notes": []})
        cursor["notes"].append(note)

    def to_list(node: dict) -> list[dict]:
        out: list[dict] = []
        for name in sorted(node["folders"], key=str.lower):
            out.append({"type": "folder", "name": name, "children": to_list(node["folders"][name])})
        for n in node["notes"]:
            out.append({"type": "note", "name": n.title, "slug": n.slug, "url": n.url})
        return out

    return to_list(root)


def _flatten_nav_slugs(nav: list[dict]) -> list[str]:
    """Depth-first list of note slugs in sidebar order (for prev/next)."""
    out: list[str] = []
    for item in nav:
        if item["type"] == "folder":
            out.extend(_flatten_nav_slugs(item["children"]))
        else:
            out.append(item["slug"])
    return out


def collect_tags(notes: list[Note]) -> dict[str, list[Note]]:
    tags: dict[str, list[Note]] = {}
    for note in notes:
        for tag in note.tags:
            tags.setdefault(tag, []).append(note)
    return {t: sorted(ns, key=lambda n: n.title.lower()) for t, ns in sorted(tags.items())}


class Renderer:
    def __init__(self, config: SiteConfig):
        self.config = config
        self.env = Environment(
            loader=FileSystemLoader(str(TEMPLATE_DIR)),
            autoescape=select_autoescape(["html"]),
        )
        self.env.globals["base_url"] = config.base_url
        self.env.globals["site_title"] = config.site_title
        self.env.globals["site_url"] = config.site_url
        self.env.globals["abs_url"] = config.abs_url
        self.env.filters["slugify"] = slugify

    def _url(self, path: str) -> str:
        return posixpath.join(self.config.base_url, path)

    def render_site(self, notes: list[Note], graph_data: dict) -> dict[str, str]:
        nav = build_nav_tree(notes)
        tags = collect_tags(notes)
        by_slug = {n.slug: n for n in notes}
        pages: dict[str, str] = {}

        # Prev/next follow the sidebar (nav) order so they feel structured.
        ordered = [by_slug[s] for s in _flatten_nav_slugs(nav) if s in by_slug]

        note_tpl = self.env.get_template("note.html")
        for i, note in enumerate(ordered):
            backlink_notes = [by_slug[s] for s in note.backlinks if s in by_slug]
            pages[note.url] = note_tpl.render(
                note=note,
                nav=nav,
                backlinks=backlink_notes,
                breadcrumbs=note.folder_parts,
                prev_note=ordered[i - 1] if i > 0 else None,
                next_note=ordered[i + 1] if i + 1 < len(ordered) else None,
            )

        tag_tpl = self.env.get_template("tag.html")
        for tag, tagged in tags.items():
            pages[f"tags/{slugify(tag)}.html"] = tag_tpl.render(
                tag=tag, notes=tagged, nav=nav, all_tags=sorted(tags),
            )

        index_tpl = self.env.get_template("index.html")
        pages["index.html"] = index_tpl.render(
            notes=sorted(notes, key=lambda n: n.title.lower()), nav=nav, all_tags=sorted(tags),
        )

        graph_tpl = self.env.get_template("graph.html")
        pages["graph.html"] = graph_tpl.render(nav=nav)

        pages["404.html"] = self.env.get_template("404.html").render(nav=nav)

        pages["site.webmanifest"] = json.dumps({
            "name": self.config.site_title,
            "short_name": self.config.site_title,
            "start_url": self.config.base_url,
            "display": "minimal-ui",
            "background_color": "#1e1e2e",
            "theme_color": "#1e1e2e",
            "icons": [
                {"src": self._url("assets/favicon.svg"), "sizes": "any", "type": "image/svg+xml"}
            ],
        }, ensure_ascii=False)

        if self.config.site_url:
            pages["robots.txt"] = (
                "User-agent: *\nAllow: /\n\n"
                f"Sitemap: {self.config.abs_url('sitemap.xml')}\n"
            )

        pages["graph.json"] = json.dumps(graph_data)
        pages["search.json"] = json.dumps(self._search_index(notes))
        pages["excerpts.json"] = json.dumps(self._excerpts(notes))
        pages["sitemap.xml"] = self._sitemap(notes, sorted(tags))
        pages["feed.xml"] = self._rss(notes)
        return pages

    def _search_index(self, notes: list[Note]) -> list[dict]:
        return [
            {
                "id": n.slug,
                "title": n.title,
                "tags": n.tags,
                "url": self._url(n.url),
                "text": plain_text(n.html)[:2000],
            }
            for n in notes
        ]

    def _excerpts(self, notes: list[Note]) -> dict:
        """Slug -> {title, url, excerpt} map consumed by hover previews."""
        return {
            n.slug: {"title": n.title, "url": self._url(n.url), "excerpt": n.excerpt}
            for n in notes
        }

    def _sitemap(self, notes: list[Note], tags: list[str]) -> str:
        from xml.sax.saxutils import escape

        urls = [self.config.abs_url(n.url) for n in notes]
        urls += [self.config.abs_url("index.html"), self.config.abs_url("graph.html")]
        urls += [self.config.abs_url(f"tags/{slugify(t)}.html") for t in tags]
        urls = [u for u in urls if u]  # only when site_url is configured
        entries = "\n".join(f"  <url><loc>{escape(u)}</loc></url>" for u in urls)
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f"{entries}\n</urlset>\n"
        )

    def _rss(self, notes: list[Note]) -> str:
        from xml.sax.saxutils import escape

        # Most recent first when a frontmatter date is present.
        ordered = sorted(notes, key=lambda n: (n.date or "", n.title), reverse=True)
        items = []
        for n in ordered[:50]:
            link = self.config.abs_url(n.url) or n.url
            pub = _rfc822_date(n.date) if n.date else ""
            items.append(
                "    <item>\n"
                f"      <title>{escape(n.title)}</title>\n"
                f"      <link>{escape(link)}</link>\n"
                f"      <guid isPermaLink=\"false\">{escape(n.slug)}</guid>\n"
                + (f"      <pubDate>{escape(pub)}</pubDate>\n" if pub else "")
                + f"      <description>{escape(n.description)}</description>\n"
                "    </item>"
            )
        home = self.config.abs_url("index.html") or self.config.base_url
        body = "\n".join(items)
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<rss version="2.0"><channel>\n'
            f"  <title>{escape(self.config.site_title)}</title>\n"
            f"  <link>{escape(home)}</link>\n"
            f"  <description>{escape(self.config.site_title)} — published notes</description>\n"
            f"{body}\n"
            "</channel></rss>\n"
        )
