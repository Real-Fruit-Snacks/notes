"""Stage 3: derive backlinks and the graph dataset from resolved links.

Call :func:`build_links` after every note has had its ``out_links`` populated by
the parser. It mutates each note's ``backlinks`` in place and returns the
``graph.json`` payload consumed by the graph page.
"""
from __future__ import annotations

from .models import Note


def build_links(notes: list[Note]) -> dict:
    """Populate ``note.backlinks`` and return the graph-view dataset."""
    by_slug = {n.slug: n for n in notes}

    # Reset, then accumulate reverse edges (deduped, no self-links).
    for n in notes:
        n.backlinks = []
    backlink_sets: dict[str, set[str]] = {n.slug: set() for n in notes}
    edges: set[tuple[str, str]] = set()

    for note in notes:
        for link in note.out_links:
            target = link.resolved_slug
            if target is None or target not in by_slug or target == note.slug:
                continue
            backlink_sets[target].add(note.slug)
            edges.add((note.slug, target))

    for slug, sources in backlink_sets.items():
        by_slug[slug].backlinks = sorted(sources)

    nodes = [
        {
            "id": n.slug,
            "title": n.title,
            "url": n.url,
            "val": 1 + len(n.backlinks),  # node size ~ popularity
        }
        for n in notes
    ]
    links = [{"source": s, "target": t} for s, t in sorted(edges)]
    return {"nodes": nodes, "links": links}
