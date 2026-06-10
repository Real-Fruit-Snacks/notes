"""Core rule turning inline ``#tags`` in note bodies into clickable chips.

Implemented as a token-stream pass over ``text`` children (the standard approach
for hashtag/mention plugins). Because ``code_inline`` and fenced code are separate
token types, tags inside code are left untouched.

Tags must start with a letter (so ``#1`` issue refs and ``#fff`` hex-ish numbers
are skipped) and must sit on a word boundary (so ``C#`` is not a tag).
"""
from __future__ import annotations

import re

from markdown_it.token import Token

TAG_RE = re.compile(r"#([A-Za-z][\w/-]*)")


def _text(content: str) -> Token:
    t = Token("text", "", 0)
    t.content = content
    return t


def _split(text_token: Token, env: dict, record: bool) -> list[Token]:
    content = text_token.content
    out: list[Token] = []
    last = 0
    for m in TAG_RE.finditer(content):
        start = m.start()
        prev = content[start - 1] if start > 0 else ""
        if prev.isalnum() or prev in "_/#":  # not a word boundary -> not a tag
            continue
        if start > last:
            out.append(_text(content[last:start]))
        tag = m.group(1)
        tok = Token("hashtag", "", 0)
        tok.content = tag
        tok.meta = {"tag": tag}
        out.append(tok)
        if record:
            env["result"].tags.add(tag)
        last = m.end()
    if not out:
        return [text_token]
    if last < len(content):
        out.append(_text(content[last:]))
    return out


def hashtags_core(state) -> None:
    record = len(state.env.get("stack", [])) <= 1
    for blk in state.tokens:
        if blk.type != "inline" or not blk.children:
            continue
        new_children: list[Token] = []
        for child in blk.children:
            if child.type == "text" and "#" in child.content:
                new_children.extend(_split(child, state.env, record))
            else:
                new_children.append(child)
        blk.children = new_children


def hashtag_plugin(md) -> None:
    md.core.ruler.push("hashtags", hashtags_core)
