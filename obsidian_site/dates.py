"""Last-updated timestamps for notes: git history with an mtime fallback."""
from __future__ import annotations

import subprocess
from datetime import datetime, timezone
from pathlib import Path

from .models import Note


def _git_dates(vault: Path) -> dict[Path, str]:
    """Absolute file path -> ISO timestamp of the most recent commit touching it.

    Returns {} when the vault is not inside a git repository (or git is
    missing); callers then fall back to filesystem mtimes per note.
    """
    try:
        top = subprocess.run(
            ["git", "-C", str(vault), "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        log = subprocess.run(
            ["git", "-C", str(vault), "log", "--pretty=format:\x01%cI", "--name-only"],
            capture_output=True, text=True, check=True,
        ).stdout
    except (OSError, subprocess.CalledProcessError):
        return {}
    dates: dict[Path, str] = {}
    stamp = ""
    for line in log.splitlines():
        if line.startswith("\x01"):
            stamp = line[1:]
        elif line.strip():
            # git prints paths relative to the repo root; log is newest-first,
            # so only the first sighting of each path wins.
            dates.setdefault((Path(top) / line).resolve(), stamp)
    return dates


def annotate_updated(vault: Path, notes: list[Note]) -> None:
    """Fill ``note.updated`` (ISO 8601) for every note."""
    dates = _git_dates(vault)
    for note in notes:
        iso = dates.get(note.source.resolve())
        if not iso:
            mtime = note.source.stat().st_mtime
            iso = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
        note.updated = iso
