# Obsidian → Static Notes Site

A small Python generator that turns an [Obsidian](https://obsidian.md) vault into a
polished, browsable static website and publishes it to **GitHub Pages**.

Only notes with `publish: true` in their frontmatter are included — everything else
in your vault stays private.

## Features

- **Docs-style layout** — top bar with search, left folder-nav tree (with a mobile
  hamburger drawer), centered reading column, a per-note **table of contents**, and
  inline "linked mentions" (backlinks). Dark-only **Catppuccin Mocha** theme.
- **Obsidian syntax:** wikilinks `[[note]]` / `[[note|alias]]` / `[[note#heading]]`
  (heading links jump to real anchors), image embeds `![[img.png]]`, note transclusions
  `![[note]]`, inline `#tags` + frontmatter tags, and callouts (`> [!note]`, `> [!warning]`, …).
- **Syntax-highlighted code** via Pygments — each block shows its **language** and a **copy button**.
- **Backlinks** on every note, an interactive **graph view** at `/graph`, and a
  collapsible **local graph** on each note (lazy-loads d3 only when opened).
- **Hover previews** — hovering an internal link shows a card with the target's excerpt.
- **Client-side full-text search** (MiniSearch, press `/` to focus) — no server needed.
- **Polished reading UI:** self-hosted **Inter + JetBrains Mono** (variable woff2, no CDN),
  styled tables/blockquotes, **reading time**, **prev/next** navigation, heading hover-anchors,
  back-to-top, focus-visible rings, a skip link, and `prefers-reduced-motion` support.
- **Sharing & SEO:** per-note `<meta description>` + Open Graph tags, `sitemap.xml`,
  an RSS `feed.xml`, and a `404.html`.
- **Broken links** to unpublished/missing notes are styled and reported as build warnings.

## Quick start

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Build the sample vault and preview locally
python build.py --vault vault --out dist --serve
# open http://localhost:8000
```

Point `--vault` at your real Obsidian vault to publish your own notes. Add
`publish: true` to the frontmatter of any note you want on the site:

```markdown
---
title: My Note
publish: true
tags: [ideas]
---
```

## CLI

```
python build.py --vault PATH --out DIR [options]

  --vault PATH      Path to the Obsidian vault (required)
  --out DIR         Output directory (default: dist)
  --base-url URL    Base path, e.g. /my-repo/ for GitHub Pages (default: /)
  --site-url URL    Absolute origin, e.g. https://user.github.io
                    (enables Open Graph tags, sitemap.xml, and absolute RSS links)
  --title TEXT      Site title (default: "My Notes")
  --serve           Serve the output locally after building
  --port N          Port for --serve (default: 8000)
```

> For local preview use the default `--base-url /`. The GitHub Action sets the
> correct `/repo-name/` base path automatically when deploying.

## Deploy to GitHub Pages

1. Push this repo to GitHub with your notes in `vault/`.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`. The included workflow (`.github/workflows/deploy.yml`) builds the
   site and deploys it. Your site appears at `https://<user>.github.io/<repo>/`.

## Development

```bash
pip install -r requirements-dev.txt
pytest
```

## How it works

The build is a small pipeline, one module per stage in `obsidian_site/`:

| Stage | Module | Job |
|-------|--------|-----|
| 1 | `discover.py` | Walk the vault, parse frontmatter, keep `publish: true` notes, assign slugs. |
| 2 | `parse.py` (+ `rules/`) | Render Markdown → HTML with wikilinks, embeds, callouts, code highlighting. |
| 3 | `graph.py` | Build backlinks and the graph dataset from resolved links. |
| 4 | `render.py` | Wrap notes in the docs layout (Jinja2); emit tag pages, graph page, search index. |
| 5 | `emit.py` | Write HTML to `dist/` and copy assets. |

`builder.py` wires the stages together; `build.py` is the CLI.
