"""Core rule that unwraps a standalone note embed from its paragraph.

``![[note]]`` on its own line otherwise renders as
``<p><div class="transclusion">…</div></p>`` — a block ``<div>`` illegally nested
in a ``<p>``. When a paragraph's only meaningful content is note embeds, we hide
the wrapping paragraph tokens so the ``<div>`` sits at block level.
"""
from __future__ import annotations


def _only_note_embeds(inline) -> bool:
    seen_embed = False
    for child in inline.children or []:
        if child.type == "wikilink" and child.meta.get("kind") == "note_embed":
            seen_embed = True
        elif child.type == "softbreak":
            continue
        elif child.type == "text" and not child.content.strip():
            continue
        else:
            return False
    return seen_embed


def unwrap_embeds_core(state) -> None:
    tokens = state.tokens
    for i, tok in enumerate(tokens):
        if (
            tok.type == "paragraph_open"
            and i + 2 < len(tokens)
            and tokens[i + 1].type == "inline"
            and tokens[i + 2].type == "paragraph_close"
            and _only_note_embeds(tokens[i + 1])
        ):
            tok.hidden = True
            tokens[i + 2].hidden = True


def unwrap_embeds_plugin(md) -> None:
    md.core.ruler.push("unwrap_embeds", unwrap_embeds_core)
