"""A Pygments style implementing the Catppuccin Mocha palette.

Pygments ships no Catppuccin style, so we define one here rather than pulling in
an extra dependency. Token -> colour choices follow Catppuccin's syntax-highlight
style guide (https://github.com/catppuccin/catppuccin).
"""
from __future__ import annotations

from pygments.style import Style
from pygments.token import (
    Comment, Error, Generic, Keyword, Name, Number, Operator, Punctuation,
    String, Text, Whitespace,
)

# -- Catppuccin Mocha palette ------------------------------------------------
PINK = "#f5c2e7"
MAUVE = "#cba6f7"
RED = "#f38ba8"
MAROON = "#eba0ac"
PEACH = "#fab387"
YELLOW = "#f9e2af"
GREEN = "#a6e3a1"
TEAL = "#94e2d5"
SKY = "#89dceb"
SAPPHIRE = "#74c7ec"
BLUE = "#89b4fa"
LAVENDER = "#b4befe"
TEXT = "#cdd6f4"
OVERLAY2 = "#9399b2"
OVERLAY0 = "#6c7086"
SURFACE2 = "#585b70"
BASE = "#1e1e2e"


class CatppuccinMocha(Style):
    name = "catppuccin-mocha"
    background_color = BASE
    highlight_color = SURFACE2
    line_number_color = OVERLAY0

    styles = {
        Text: TEXT,
        Whitespace: TEXT,
        Error: RED,

        Comment: f"italic {OVERLAY2}",
        Comment.Preproc: MAUVE,
        Comment.Special: f"italic {OVERLAY2}",

        Keyword: MAUVE,
        Keyword.Constant: PEACH,
        Keyword.Declaration: MAUVE,
        Keyword.Namespace: MAUVE,
        Keyword.Pseudo: MAUVE,
        Keyword.Reserved: MAUVE,
        Keyword.Type: YELLOW,

        Operator: SKY,
        Operator.Word: MAUVE,
        Punctuation: OVERLAY2,

        Name: TEXT,
        Name.Attribute: YELLOW,
        Name.Builtin: RED,
        Name.Builtin.Pseudo: RED,
        Name.Class: YELLOW,
        Name.Constant: PEACH,
        Name.Decorator: BLUE,
        Name.Entity: PEACH,
        Name.Exception: YELLOW,
        Name.Function: BLUE,
        Name.Function.Magic: BLUE,
        Name.Label: SAPPHIRE,
        Name.Namespace: YELLOW,
        Name.Tag: MAUVE,
        Name.Variable: TEXT,
        Name.Variable.Instance: MAROON,
        Name.Variable.Magic: MAROON,

        Number: PEACH,

        String: GREEN,
        String.Doc: GREEN,
        String.Escape: PINK,
        String.Interpol: PINK,
        String.Regex: PINK,
        String.Symbol: PEACH,

        Generic.Deleted: RED,
        Generic.Inserted: GREEN,
        Generic.Heading: f"bold {BLUE}",
        Generic.Subheading: f"bold {MAUVE}",
        Generic.Emph: "italic",
        Generic.Strong: "bold",
        Generic.Error: RED,
        Generic.Traceback: RED,
    }
