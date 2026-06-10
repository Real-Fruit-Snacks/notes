"""Core data structures shared across the build pipeline."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class SiteConfig:
    """Configuration for one site build."""

    vault: Path
    out: Path
    base_url: str = "/"
    site_title: str = "My Notes"
    site_url: str = ""  # absolute origin, e.g. https://user.github.io (for OG/RSS/sitemap)

    def __post_init__(self) -> None:
        self.vault = Path(self.vault)
        self.out = Path(self.out)
        # Normalise base_url to start and end with a single slash, e.g. "/repo/".
        bu = "/" + self.base_url.strip("/") + "/"
        self.base_url = "/" if bu == "//" else bu
        self.site_url = self.site_url.rstrip("/")

    def abs_url(self, path: str) -> str:
        """Absolute URL for a site-relative ``path`` (empty if no site_url set)."""
        if not self.site_url:
            return ""
        return self.site_url + self.base_url + path.lstrip("/")


@dataclass
class Link:
    """A wikilink discovered inside a note body.

    `target` is the raw link target as written (note name, possibly with a
    `#heading`). `resolved_slug` is filled in once we know the publish set;
    it is None for broken links (target not published).
    """

    target: str
    alias: str | None = None
    heading: str | None = None
    resolved_slug: str | None = None

    @property
    def is_broken(self) -> bool:
        return self.resolved_slug is None


@dataclass
class Note:
    """A single published note and everything derived from it."""

    source: Path           # absolute path to the .md file
    rel_path: Path         # path relative to the vault root
    title: str
    slug: str              # unique, url-safe identifier
    frontmatter: dict = field(default_factory=dict)
    body: str = ""         # markdown body (frontmatter stripped)
    tags: list[str] = field(default_factory=list)

    # Filled in by later pipeline stages.
    html: str = ""
    out_links: list[Link] = field(default_factory=list)   # resolved outgoing links
    backlinks: list[str] = field(default_factory=list)     # slugs linking *to* this note
    headings: list[dict] = field(default_factory=list)     # {level, text, id} for the ToC
    excerpt: str = ""                                       # plain-text summary
    has_math: bool = False     # page contains $...$ / $$...$$ (loads KaTeX)
    has_mermaid: bool = False  # page contains a mermaid fence (loads mermaid)

    @property
    def description(self) -> str:
        """Frontmatter description if set, else the auto excerpt."""
        return str(self.frontmatter.get("description") or self.excerpt)

    @property
    def date(self) -> str:
        """Frontmatter date as a string, or empty."""
        return str(self.frontmatter.get("date") or "")

    @property
    def url(self) -> str:
        """Site-root-relative URL path (without base_url prefix)."""
        return f"{self.slug}.html"

    @property
    def folder_parts(self) -> list[str]:
        """Folder segments (relative to vault) used to build the nav tree."""
        return list(self.rel_path.parent.parts)

    @property
    def reading_minutes(self) -> int:
        """Estimated reading time in minutes (~200 wpm), at least 1."""
        from .text import plain_text

        words = len(plain_text(self.html).split())
        return max(1, round(words / 200))
