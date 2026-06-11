"""Pipeline orchestration: vault -> dist/ in one call."""
from __future__ import annotations

from . import cards
from .dates import annotate_updated
from .discover import build_resolution, discover_with_warnings
from .emit import emit
from .graph import build_links
from .models import SiteConfig
from .parse import Parser
from .render import Renderer
from .text import excerpt_of

# Built-in pages addressable via wikilinks (lower-cased name -> slug).
RESERVED_PAGES = {"graph": "graph"}


def build_site(config: SiteConfig) -> list[str]:
    """Run the full pipeline. Returns a list of human-readable warnings."""
    warnings: list[str] = []

    # 1. discover
    notes, warns = discover_with_warnings(config)
    warnings += warns
    resolution = build_resolution(notes, warnings)
    # Built-in pages are linkable by name, e.g. [[Graph]] -> the graph view.
    for name, slug in RESERVED_PAGES.items():
        resolution.setdefault(name, slug)
    by_slug = {n.slug: n for n in notes}
    annotate_updated(config.vault, notes)

    # 2. parse every note (records links + referenced image assets)
    parser = Parser(resolution, by_slug, base_url=config.base_url)
    image_assets: set[str] = set()
    for note in notes:
        res = parser.render(note)
        note.html = res.html
        note.out_links = res.links
        note.headings = res.headings
        note.excerpt = excerpt_of(res.html)
        # Inside fenced code these markers are HTML-escaped, so plain string
        # search only matches real math/mermaid containers.
        note.has_math = 'class="math math-' in res.html
        note.has_mermaid = '<pre class="mermaid">' in res.html
        # Merge inline #tags with frontmatter tags (order-stable, de-duped).
        for tag in sorted(res.tags):
            if tag not in note.tags:
                note.tags.append(tag)
        image_assets |= res.assets
        for link in res.links:
            if link.is_broken:
                warnings.append(f"broken link in '{note.title}': [[{link.target}]]")

    # 3. backlinks + graph
    graph_data = build_links(notes)

    # 4. render pages
    cards_enabled = bool(config.site_url) and cards.available()
    pages = Renderer(config, cards_enabled=cards_enabled).render_site(notes, graph_data)

    # 5. emit to disk (+ social cards, written after emit clears the out dir)
    warnings += emit(
        config, pages, image_assets,
        include_katex=any(n.has_math for n in notes),
        include_mermaid=any(n.has_mermaid for n in notes),
    )
    if config.site_url:
        warnings += cards.generate_cards(config, notes)
    return warnings
