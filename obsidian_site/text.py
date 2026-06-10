"""Small text helpers shared across stages."""
from __future__ import annotations

import html
import re

_TAGS = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")


def plain_text(rendered_html: str) -> str:
    """Strip HTML tags and collapse whitespace to a single line."""
    text = _TAGS.sub(" ", rendered_html)
    text = html.unescape(text)
    return _WS.sub(" ", text).strip()


def excerpt_of(rendered_html: str, words: int = 40) -> str:
    """A short plain-text summary of a note, for previews and meta tags."""
    text = plain_text(rendered_html)
    parts = text.split(" ")
    if len(parts) <= words:
        return text
    return " ".join(parts[:words]).rstrip(".,;:") + "…"
