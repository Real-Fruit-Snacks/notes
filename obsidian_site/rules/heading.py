"""Core rule that gives every heading a stable, slugified ``id``.

This is what makes ``[[note#heading]]`` links actually jump: the anchor target
(``#heading-slug``) now matches a real element id. Top-level headings are also
recorded on the render result so the renderer can build a table of contents.

Headings inside a transclusion get their id namespaced by the embedded note's
slug, so they never collide with the host page's own headings.
"""
from __future__ import annotations

import re

from ..discover import slugify

_MD_NOISE = re.compile(r"[*_`~]")


def clean_text(text: str) -> str:
    """Strip the most common inline markdown so headings read cleanly."""
    return _MD_NOISE.sub("", text).strip()


def heading_anchors(state) -> None:
    env = state.env
    stack = env.get("stack", [])
    top = len(stack) <= 1
    prefix = "" if top else slugify(stack[-1]) + "-"
    seen: dict[str, int] = env.setdefault("_heading_ids", {})

    tokens = state.tokens

    # Drop a leading body "# Title" H1 that just repeats the note title — the
    # template already renders the title, so this avoids a duplicate heading.
    title = env.get("note_title")
    if (
        top and title
        and len(tokens) >= 3
        and tokens[0].type == "heading_open" and tokens[0].tag == "h1"
        and clean_text(tokens[1].content).lower() == str(title).strip().lower()
    ):
        del tokens[0:3]
    for i, tok in enumerate(tokens):
        if tok.type != "heading_open" or i + 1 >= len(tokens):
            continue
        text = clean_text(tokens[i + 1].content)
        base = prefix + (slugify(text) or "section")
        hid = base
        n = seen.get(base, 0)
        while hid in seen:
            n += 1
            hid = f"{base}-{n}"
        seen[base] = n
        seen[hid] = 0
        tok.attrSet("id", hid)
        if top:
            env["result"].headings.append(
                {"level": int(tok.tag[1]), "text": text, "id": hid}
            )


def heading_plugin(md) -> None:
    md.core.ruler.push("heading_anchors", heading_anchors)
