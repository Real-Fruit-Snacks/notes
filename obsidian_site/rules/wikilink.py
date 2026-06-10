"""Inline rule for Obsidian wikilinks and embeds.

Handles three forms, all delimited by ``[[ ]]``:

* ``[[target]]`` / ``[[target|alias]]`` / ``[[target#heading]]`` -> internal link
* ``![[image.png]]``                                            -> image embed
* ``![[note]]``                                                 -> note transclusion

Because this runs as an inline rule (before ``image``/``link``), it never fires
inside code spans or fenced code blocks -- markdown-it does not run inline rules
on code content.
"""
from __future__ import annotations

IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".avif")


def _parse_inner(inner: str) -> tuple[str, str | None, str | None]:
    """Split ``target#heading|alias`` into (target, heading, alias)."""
    alias = None
    if "|" in inner:
        inner, alias = inner.split("|", 1)
        alias = alias.strip()
    heading = None
    if "#" in inner:
        inner, heading = inner.split("#", 1)
        heading = heading.strip()
    return inner.strip(), heading, alias


def wikilink_inline(state, silent) -> bool:
    src = state.src
    pos = state.pos

    is_embed = False
    if src[pos] == "!":
        if src[pos + 1 : pos + 3] != "[[":
            return False
        is_embed = True
        content_start = pos + 3
    elif src[pos : pos + 2] == "[[":
        content_start = pos + 2
    else:
        return False

    end = src.find("]]", content_start)
    if end == -1:
        return False
    inner = src[content_start:end]
    if not inner.strip():
        return False

    target, heading, alias = _parse_inner(inner)

    if not silent:
        if is_embed and target.lower().endswith(IMAGE_EXTS):
            kind = "image_embed"
        elif is_embed:
            kind = "note_embed"
        else:
            kind = "wikilink"
        token = state.push("wikilink", "", 0)
        token.meta = {
            "kind": kind,
            "target": target,
            "heading": heading,
            "alias": alias,
        }

    state.pos = end + 2
    return True


def wikilink_plugin(md) -> None:
    """Register the inline rule before the built-in image/link rules."""
    md.inline.ruler.before("image", "wikilink", wikilink_inline)
