"""Core rule turning Obsidian callouts into styled ``<div>`` blocks.

An Obsidian callout is a blockquote whose first line is ``[!type] Optional Title``::

    > [!warning] Heads up
    > body text

becomes::

    <div class="callout callout-warning">
      <div class="callout-title">Heads up</div>
      <div class="callout-body"><p>body text</p></div>
    </div>

We operate on the block-token stream after block parsing so we never touch
fenced code or inline code.
"""
from __future__ import annotations

import re

from markdown_it.token import Token

CALLOUT_RE = re.compile(r"^\[!(?P<type>[\w-]+)\][+-]?\s*(?P<title>.*)$")


def _matching_close(tokens, open_idx: int) -> int:
    """Index of the ``blockquote_close`` matching the open at ``open_idx``."""
    depth = 0
    for j in range(open_idx, len(tokens)):
        if tokens[j].type == "blockquote_open":
            depth += 1
        elif tokens[j].type == "blockquote_close":
            depth -= 1
            if depth == 0:
                return j
    return len(tokens) - 1


def callout_core(state) -> None:
    tokens = state.tokens
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if (
            tok.type == "blockquote_open"
            and i + 2 < len(tokens)
            and tokens[i + 1].type == "paragraph_open"
            and tokens[i + 2].type == "inline"
        ):
            inline = tokens[i + 2]
            first, _, rest = inline.content.partition("\n")
            m = CALLOUT_RE.match(first.strip())
            if m:
                ctype = m.group("type").lower()
                title = m.group("title").strip() or ctype.capitalize()

                close_idx = _matching_close(tokens, i)

                # Re-tag the wrapper blockquote as a div.callout.
                tok.tag = "div"
                tok.attrSet("class", f"callout callout-{ctype}")
                tokens[close_idx].tag = "div"

                # Strip the marker line from the body paragraph. A title-only
                # callout leaves an empty paragraph behind — hide it.
                inline.content = rest
                inline.children = state.md.parseInline(rest, state.env)[0].children
                if not rest.strip() and tokens[i + 3].type == "paragraph_close":
                    tokens[i + 1].hidden = True
                    tokens[i + 3].hidden = True

                # Inject a title element right after blockquote_open.
                title_open = Token("html_block", "", 0)
                title_open.content = f'<div class="callout-title">{_escape(title)}</div>'
                tokens.insert(i + 1, title_open)
        i += 1


def _escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def callout_plugin(md) -> None:
    md.core.ruler.push("callout", callout_core)
