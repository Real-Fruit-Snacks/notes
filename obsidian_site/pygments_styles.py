"""Pygments styles for the site's two (both dark) themes.

Catppuccin Mocha is the default theme; Tokyo Night (the classic dark "night"
variant) is the alternate, served under the legacy ``data-theme="light"``
scope. Pygments ships neither style, so we define them here rather than
pulling in an extra dependency. Token -> colour-role choices follow
Catppuccin's syntax-highlight style guide
(https://github.com/catppuccin/catppuccin); the Tokyo Night palette is
slot-translated onto the same roles, which lands close to Tokyo Night's own
conventions (keywords magenta, functions blue, strings green, numbers orange,
comments grey-blue italic, operators sky blue).
"""
from __future__ import annotations

from pygments.style import Style
from pygments.token import (
    Comment, Error, Generic, Keyword, Name, Number, Operator, Punctuation,
    String, Text, Whitespace,
)

# Palettes carry the full accent set; "teal" and "lavender" are currently
# unused by _styles() but kept so palettes stay complete for future tokens.
MOCHA = {
    "pink": "#f5c2e7", "mauve": "#cba6f7", "red": "#f38ba8", "maroon": "#eba0ac",
    "peach": "#fab387", "yellow": "#f9e2af", "green": "#a6e3a1", "teal": "#94e2d5",
    "sky": "#89dceb", "sapphire": "#74c7ec", "blue": "#89b4fa", "lavender": "#b4befe",
    "text": "#cdd6f4", "overlay2": "#9399b2", "overlay0": "#6c7086",
    "surface2": "#585b70", "base": "#1e1e2e",
}

# Tokyo Night "night" palette in Catppuccin slot names. Slot picks:
# maroon->red1, peach->orange, sky->blue5 (operators), sapphire->cyan,
# lavender->blue6, pink->magenta2, overlay2->comment, overlay0->fg_gutter,
# surface2->bg_highlight.
TOKYONIGHT = {
    "pink": "#ff007c", "mauve": "#bb9af7", "red": "#f7768e", "maroon": "#db4b4b",
    "peach": "#ff9e64", "yellow": "#e0af68", "green": "#9ece6a", "teal": "#73daca",
    "sky": "#89ddff", "sapphire": "#7dcfff", "blue": "#7aa2f7", "lavender": "#b4f9f8",
    "text": "#c0caf5", "overlay2": "#565f89", "overlay0": "#3b4261",
    "surface2": "#292e42", "base": "#1a1b26",
}


def _styles(c: dict[str, str]) -> dict:
    """Build the Pygments token-style dict from a slot-named palette mapping.

    *c* must provide the keys present in :data:`MOCHA` / :data:`TOKYONIGHT`.
    """
    return {
        Text: c["text"],
        Whitespace: c["text"],
        Error: c["red"],

        Comment: f"italic {c['overlay2']}",
        Comment.Preproc: c["mauve"],
        Comment.Special: f"italic {c['overlay2']}",

        Keyword: c["mauve"],
        Keyword.Constant: c["peach"],
        Keyword.Declaration: c["mauve"],
        Keyword.Namespace: c["mauve"],
        Keyword.Pseudo: c["mauve"],
        Keyword.Reserved: c["mauve"],
        Keyword.Type: c["yellow"],

        Operator: c["sky"],
        Operator.Word: c["mauve"],
        Punctuation: c["overlay2"],

        Name: c["text"],
        Name.Attribute: c["yellow"],
        Name.Builtin: c["red"],
        Name.Builtin.Pseudo: c["red"],
        Name.Class: c["yellow"],
        Name.Constant: c["peach"],
        Name.Decorator: c["blue"],
        Name.Entity: c["peach"],
        Name.Exception: c["yellow"],
        Name.Function: c["blue"],
        Name.Function.Magic: c["blue"],
        Name.Label: c["sapphire"],
        Name.Namespace: c["yellow"],
        Name.Tag: c["mauve"],
        Name.Variable: c["text"],
        Name.Variable.Instance: c["maroon"],
        Name.Variable.Magic: c["maroon"],

        Number: c["peach"],

        String: c["green"],
        String.Doc: c["green"],
        String.Escape: c["pink"],
        String.Interpol: c["pink"],
        String.Regex: c["pink"],
        String.Symbol: c["peach"],

        Generic.Deleted: c["red"],
        Generic.Inserted: c["green"],
        Generic.Heading: f"bold {c['blue']}",
        Generic.Subheading: f"bold {c['mauve']}",
        Generic.Emph: "italic",
        Generic.Strong: "bold",
        Generic.Error: c["red"],
        Generic.Traceback: c["red"],
    }


class CatppuccinMocha(Style):
    name = "catppuccin-mocha"
    background_color = MOCHA["base"]
    highlight_color = MOCHA["surface2"]
    line_number_color = MOCHA["overlay0"]
    styles = _styles(MOCHA)


class TokyoNight(Style):
    name = "tokyo-night"
    background_color = TOKYONIGHT["base"]
    highlight_color = TOKYONIGHT["surface2"]
    line_number_color = TOKYONIGHT["overlay0"]
    styles = _styles(TOKYONIGHT)
