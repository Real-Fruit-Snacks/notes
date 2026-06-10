"""Pygments styles implementing the Catppuccin Mocha and Latte palettes.

Pygments ships no Catppuccin style, so we define them here rather than pulling
in an extra dependency. Token -> colour choices follow Catppuccin's
syntax-highlight style guide (https://github.com/catppuccin/catppuccin).
"""
from __future__ import annotations

from pygments.style import Style
from pygments.token import (
    Comment, Error, Generic, Keyword, Name, Number, Operator, Punctuation,
    String, Text, Whitespace,
)

MOCHA = {
    "pink": "#f5c2e7", "mauve": "#cba6f7", "red": "#f38ba8", "maroon": "#eba0ac",
    "peach": "#fab387", "yellow": "#f9e2af", "green": "#a6e3a1", "teal": "#94e2d5",
    "sky": "#89dceb", "sapphire": "#74c7ec", "blue": "#89b4fa", "lavender": "#b4befe",
    "text": "#cdd6f4", "overlay2": "#9399b2", "overlay0": "#6c7086",
    "surface2": "#585b70", "base": "#1e1e2e",
}

LATTE = {
    "pink": "#ea76cb", "mauve": "#8839ef", "red": "#d20f39", "maroon": "#e64553",
    "peach": "#fe640b", "yellow": "#df8e1d", "green": "#40a02b", "teal": "#179299",
    "sky": "#04a5e5", "sapphire": "#209fb5", "blue": "#1e66f5", "lavender": "#7287fd",
    "text": "#4c4f69", "overlay2": "#7c7f93", "overlay0": "#9ca0b0",
    "surface2": "#acb0be", "base": "#eff1f5",
}


def _styles(c: dict[str, str]) -> dict:
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


class CatppuccinLatte(Style):
    name = "catppuccin-latte"
    background_color = LATTE["base"]
    highlight_color = LATTE["surface2"]
    line_number_color = LATTE["overlay0"]
    styles = _styles(LATTE)
