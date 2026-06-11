"""Stage 1: walk the vault, parse frontmatter, keep only published notes.

Produces the list of `Note` objects and a *resolution map* used later to turn
wikilink targets into slugs. The resolution map keys notes by several aliases
that an Obsidian `[[link]]` might use: the file stem, the vault-relative path
(without extension), and the note title -- all lower-cased.
"""
from __future__ import annotations

import re
from pathlib import Path

import frontmatter

from .models import Note, SiteConfig

_SLUG_STRIP = re.compile(r"[^a-z0-9/\- ]+")
_SLUG_SPACES = re.compile(r"[\s_]+")
_SLUG_DASHES = re.compile(r"-{2,}")

# The tag that marks a note as published. It is a control marker, not content:
# it never renders as a chip and gets no tag page.
PUBLISH_TAG = "publish"
# Inline `#publish` with the same word boundaries the hashtag rule uses.
_PUBLISH_INLINE = re.compile(r"(?<![\w/#])#publish(?![\w/-])", re.IGNORECASE)
# Fenced blocks and inline code, stripped before the inline scan so a note
# *documenting* the #publish marker is not itself published.
_CODE = re.compile(r"```.*?```|`[^`\n]*`", re.DOTALL)
# 4-space or tab indented code blocks (CommonMark indented code).
# Note: lines that are part of a list item and happen to be indented 4+ spaces
# could be false negatives here, but for a publish *gate* under-publishing is
# safer than over-publishing, so we accept that trade-off.
_INDENTED_CODE = re.compile(r"^(?: {4}|\t).*$", re.MULTILINE)


def slugify(text: str) -> str:
    """Turn arbitrary text into a url-safe slug, preserving ``/`` separators."""
    text = text.strip().lower()
    text = _SLUG_STRIP.sub("", text)
    text = _SLUG_SPACES.sub("-", text)
    text = _SLUG_DASHES.sub("-", text)
    text = re.sub(r"/-+", "/", text)
    text = re.sub(r"-+/", "/", text)
    return text.strip("-/") or "untitled"


def _normalise_tags(value) -> list[str]:
    """Frontmatter ``tags`` may be a list or a space/comma separated string."""
    if value is None:
        return []
    if isinstance(value, str):
        parts = re.split(r"[,\s]+", value)
    elif isinstance(value, (list, tuple)):
        parts = []
        for item in value:
            parts.extend(re.split(r"[,\s]+", str(item)))
    else:
        parts = [str(value)]
    return [p.lstrip("#").strip() for p in parts if p.strip()]


def is_published(post: frontmatter.Post) -> bool:
    """A note is published iff it carries the ``publish`` tag.

    The tag counts in frontmatter ``tags:`` or as an inline ``#publish`` in
    the body (outside code). Legacy ``publish: true`` frontmatter still works.

    The boolean frontmatter flag is authoritative when present:
    ``publish: false`` (real bool) vetoes all tag/inline checks so a note
    in-progress that already has a #publish marker is never accidentally
    published.  String values like ``publish: 'false'`` are not booleans and
    keep the existing tag-based behaviour.
    """
    flag = post.get("publish")
    if flag is False:
        return False
    if flag is True:
        return True
    if any(t.lower() == PUBLISH_TAG for t in _normalise_tags(post.get("tags"))):
        return True
    body = _INDENTED_CODE.sub("", _CODE.sub("", post.content))
    return bool(_PUBLISH_INLINE.search(body))


def discover(config: SiteConfig) -> tuple[list[Note], dict[str, str]]:
    """Return ``(notes, resolution_map)`` for all published notes in the vault.

    Convenience wrapper around :func:`discover_with_warnings` and
    :func:`build_resolution` that discards build warnings.
    """
    notes, _warnings = discover_with_warnings(config)
    return notes, build_resolution(notes)


def build_resolution(notes: list[Note], warnings: list[str] | None = None) -> dict[str, str]:
    """Map lower-cased wikilink aliases -> note slug (first note wins).

    When two notes share an alias (same stem or title), the first keeps it and
    a warning is appended to ``warnings`` (if given) naming the loser.
    """
    resolution: dict[str, str] = {}
    owner: dict[str, Path] = {}
    for note in notes:
        for key in dict.fromkeys(_resolution_keys(note)):  # de-dupe, keep order
            if key not in resolution:
                resolution[key] = note.slug
                owner[key] = note.rel_path
            elif warnings is not None and resolution[key] != note.slug:
                warnings.append(
                    f"ambiguous link target '[[{key}]]': resolves to {owner[key]}, not {note.rel_path}"
                )
    return resolution


def discover_with_warnings(config: SiteConfig) -> tuple[list[Note], list[str]]:
    """Like :func:`discover` but also returns human-readable build warnings.

    Slugs are made unique by appending ``-2``, ``-3`` ... on collision.
    """
    warnings: list[str] = []
    used_slugs: set[str] = set()
    notes: list[Note] = []

    for md_path in sorted(config.vault.rglob("*.md")):
        try:
            post = frontmatter.load(md_path)
        except Exception as exc:  # malformed YAML, bad encoding, ...
            detail = " ".join(str(exc).split()) or exc.__class__.__name__
            warnings.append(f"skipping {md_path.relative_to(config.vault)}: {detail}")
            continue
        if not is_published(post):
            continue

        rel = md_path.relative_to(config.vault)
        title = str(post.get("title") or md_path.stem)
        base_slug = slugify(str(rel.with_suffix("")))
        slug = base_slug
        n = 2
        while slug in used_slugs:
            slug = f"{base_slug}-{n}"
            n += 1
        if slug != base_slug:
            warnings.append(f"slug collision: {rel} -> {slug}")
        used_slugs.add(slug)

        notes.append(
            Note(
                source=md_path,
                rel_path=rel,
                title=title,
                slug=slug,
                frontmatter=dict(post.metadata),
                body=post.content,
                tags=[t for t in _normalise_tags(post.get("tags")) if t.lower() != PUBLISH_TAG],
            )
        )

    return notes, warnings


def _resolution_keys(note: Note) -> list[str]:
    """All lower-cased aliases by which a wikilink might address ``note``."""
    rel_no_ext = str(note.rel_path.with_suffix("")).replace("\\", "/")
    return [
        note.source.stem.lower(),
        rel_no_ext.lower(),
        note.title.lower(),
    ]
