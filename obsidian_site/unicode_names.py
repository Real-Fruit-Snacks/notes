"""Build-time Unicode name table for the Character Inspector tool.

Maps hex code point (uppercase, no "U+") -> official Unicode name for every
assigned code point. C0/C1 control characters have no name in the UCD
(``unicodedata.name`` raises), so their well-known alias names are merged in,
with short forms appended for the famous ones (TAB, LF, ESC, ...). The table
is emitted as ``unicode-names.json`` and fetched lazily by the tool page.
"""
from __future__ import annotations

import sys
import unicodedata
from functools import lru_cache

# C0 controls U+0000-U+001F, in code point order.
_C0 = (
    "NULL (NUL)", "START OF HEADING", "START OF TEXT", "END OF TEXT",
    "END OF TRANSMISSION", "ENQUIRY", "ACKNOWLEDGE", "BELL", "BACKSPACE",
    "CHARACTER TABULATION (TAB)", "LINE FEED (LF)", "LINE TABULATION",
    "FORM FEED", "CARRIAGE RETURN (CR)", "SHIFT OUT", "SHIFT IN",
    "DATA LINK ESCAPE", "DEVICE CONTROL ONE", "DEVICE CONTROL TWO",
    "DEVICE CONTROL THREE", "DEVICE CONTROL FOUR", "NEGATIVE ACKNOWLEDGE",
    "SYNCHRONOUS IDLE", "END OF TRANSMISSION BLOCK", "CANCEL", "END OF MEDIUM",
    "SUBSTITUTE", "ESCAPE (ESC)", "INFORMATION SEPARATOR FOUR",
    "INFORMATION SEPARATOR THREE", "INFORMATION SEPARATOR TWO",
    "INFORMATION SEPARATOR ONE",
)

# C1 controls U+0080-U+009F, in code point order.
_C1 = (
    "PADDING CHARACTER", "HIGH OCTET PRESET", "BREAK PERMITTED HERE",
    "NO BREAK HERE", "INDEX", "NEXT LINE", "START OF SELECTED AREA",
    "END OF SELECTED AREA", "CHARACTER TABULATION SET",
    "CHARACTER TABULATION WITH JUSTIFICATION", "LINE TABULATION SET",
    "PARTIAL LINE FORWARD", "PARTIAL LINE BACKWARD", "REVERSE LINE FEED",
    "SINGLE SHIFT TWO", "SINGLE SHIFT THREE", "DEVICE CONTROL STRING",
    "PRIVATE USE ONE", "PRIVATE USE TWO", "SET TRANSMIT STATE",
    "CANCEL CHARACTER", "MESSAGE WAITING", "START OF GUARDED AREA",
    "END OF GUARDED AREA", "START OF STRING",
    "SINGLE GRAPHIC CHARACTER INTRODUCER", "SINGLE CHARACTER INTRODUCER",
    "CONTROL SEQUENCE INTRODUCER", "STRING TERMINATOR",
    "OPERATING SYSTEM COMMAND", "PRIVACY MESSAGE",
    "APPLICATION PROGRAM COMMAND",
)


def _aliases() -> dict[int, str]:
    out = dict(enumerate(_C0))
    out[0x7F] = "DELETE (DEL)"
    out.update({0x80 + i: name for i, name in enumerate(_C1)})
    return out


@lru_cache(maxsize=1)
def name_table() -> dict[str, str]:
    """Hex code point (e.g. ``"1F4A9"``) -> name, for all assigned code points."""
    table = {f"{cp:04X}": alias for cp, alias in _aliases().items()}
    for cp in range(sys.maxunicode + 1):
        if 0xD800 <= cp <= 0xDFFF:  # surrogates are not characters
            continue
        name = unicodedata.name(chr(cp), None)
        if name is not None:
            table.setdefault(f"{cp:04X}", name)
    return table
