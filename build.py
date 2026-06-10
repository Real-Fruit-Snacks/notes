#!/usr/bin/env python3
"""CLI entry point: build an Obsidian vault into a static site.

Examples
--------
    python build.py --vault ./vault --out ./dist
    python build.py --vault ./vault --out ./dist --base-url /my-repo/ --serve
"""
from __future__ import annotations

import argparse
import errno
import functools
import http.server
import socketserver
import sys
from pathlib import Path

from obsidian_site.builder import build_site
from obsidian_site.models import SiteConfig


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Build an Obsidian vault into a static site.")
    p.add_argument("--vault", required=True, type=Path, help="Path to the Obsidian vault.")
    p.add_argument("--out", default=Path("dist"), type=Path, help="Output directory (default: dist).")
    p.add_argument("--base-url", default="/", help="Base URL path, e.g. /my-repo/ for GitHub Pages.")
    p.add_argument("--site-url", default="", help="Absolute origin, e.g. https://user.github.io (enables OG tags, sitemap, RSS).")
    p.add_argument("--title", default="My Notes", help="Site title.")
    p.add_argument("--serve", action="store_true", help="Serve the output locally after building.")
    p.add_argument("--port", type=int, default=8000, help="Port for --serve (default: 8000).")
    return p.parse_args(argv)


class _ReusableServer(socketserver.TCPServer):
    # Allow rebinding a port left in TIME_WAIT by a just-stopped server.
    allow_reuse_address = True


def serve(directory: Path, port: int, tries: int = 20) -> int:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory))
    for candidate in range(port, port + tries):
        try:
            httpd = _ReusableServer(("", candidate), handler)
        except OSError as exc:
            if exc.errno == errno.EADDRINUSE:
                continue  # genuinely occupied — try the next port
            raise
        if candidate != port:
            print(f"Port {port} is in use; serving on {candidate} instead.")
        with httpd:
            print(f"Serving {directory} at http://localhost:{candidate}  (Ctrl-C to stop)")
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("\nStopped.")
        return 0
    print(
        f"error: no free port in {port}..{port + tries - 1}. "
        f"Pass --port N to choose one.",
        file=sys.stderr,
    )
    return 1


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not args.vault.is_dir():
        print(f"error: vault not found: {args.vault}", file=sys.stderr)
        return 2

    config = SiteConfig(
        vault=args.vault, out=args.out, base_url=args.base_url,
        site_title=args.title, site_url=args.site_url,
    )
    warnings = build_site(config)

    n_pages = sum(1 for _ in config.out.rglob("*.html"))
    print(f"Built {n_pages} pages -> {config.out}")
    if warnings:
        print(f"\n{len(warnings)} warning(s):")
        for w in warnings:
            print(f"  - {w}")

    if args.serve:
        return serve(config.out, args.port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
