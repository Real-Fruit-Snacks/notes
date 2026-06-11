"""Stage 5: write rendered pages and copy assets to the output directory."""
from __future__ import annotations

import shutil
from pathlib import Path

from .models import SiteConfig
from .parse import pygments_css
from .rules.wikilink import IMAGE_EXTS

STATIC_DIR = Path(__file__).resolve().parent.parent / "assets"


def _is_safe_to_replace(out: Path) -> bool:
    """True if ``out`` is empty or was produced by a previous build.

    Guards the ``rmtree`` below: a previous build always contains a
    ``.nojekyll`` marker, so anything else (a vault, a home directory, ...)
    is refused rather than deleted.
    """
    if not out.is_dir():
        return False
    entries = list(out.iterdir())
    return not entries or (out / ".nojekyll").exists()


def emit(
    config: SiteConfig,
    pages: dict[str, str],
    image_assets: set[str],
    *,
    include_katex: bool = True,
    include_mermaid: bool = True,
) -> list[str]:
    """Write ``pages`` to ``config.out`` and copy CSS/JS + referenced images.

    ``include_katex`` / ``include_mermaid`` control whether the corresponding
    vendor bundles (~1.5 MB and ~2.7 MB respectively) are kept in the output.
    Pass ``False`` when no note in the build uses that feature to avoid shipping
    unused assets.  d3 and minisearch are always included (graph + search are
    present on every site).

    Returns a list of warnings (e.g. missing image embeds).
    """
    warnings: list[str] = []
    out = config.out
    if out.exists():
        if not _is_safe_to_replace(out):
            raise SystemExit(
                f"error: refusing to overwrite {out}: not a previous build output "
                "(no .nojekyll marker). Delete it manually or pick another --out."
            )
        shutil.rmtree(out)
    out.mkdir(parents=True)

    # 1. Rendered HTML / JSON pages (paths may contain folders).
    for rel, content in pages.items():
        dest = out / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(content, encoding="utf-8")

    # 2. Static site assets (CSS, JS, vendored libs).
    assets_out = out / "assets"
    shutil.copytree(STATIC_DIR, assets_out, dirs_exist_ok=True)
    (assets_out / "pygments.css").write_text(pygments_css(), encoding="utf-8")

    # Remove unused vendor bundles from the OUTPUT (never touches the source tree).
    vendor_out = assets_out / "vendor"
    if not include_katex:
        katex_dir = vendor_out / "katex"
        if katex_dir.exists():
            shutil.rmtree(katex_dir)
    if not include_mermaid:
        mermaid_dir = vendor_out / "mermaid"
        if mermaid_dir.exists():
            shutil.rmtree(mermaid_dir)

    # 3. Referenced images, looked up by filename anywhere in the vault.
    if image_assets:
        index: dict[str, Path] = {}
        dupes: set[str] = set()
        for img in config.vault.rglob("*"):
            if not img.is_file() or img.suffix.lower() not in IMAGE_EXTS:
                continue
            if img.name in index:
                dupes.add(img.name)
            else:
                index[img.name] = img
        for name in sorted(image_assets):
            src = index.get(name)
            if src is None:
                warnings.append(f"missing embedded asset: {name}")
                continue
            if name in dupes:
                warnings.append(
                    f"ambiguous embedded asset '{name}': several files share this "
                    f"name; using {src.relative_to(config.vault)}"
                )
            shutil.copy2(src, assets_out / name)

    # 4. .nojekyll so GitHub Pages serves files/folders starting with underscores.
    (out / ".nojekyll").write_text("", encoding="utf-8")
    return warnings
