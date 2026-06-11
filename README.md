# Obsidian → Static Notes Site

A small Python generator that turns an [Obsidian](https://obsidian.md) vault into a
polished, browsable static website and publishes it to **GitHub Pages**.

Only notes carrying the **`publish` tag** (in frontmatter `tags:` or as an inline
`#publish`) are included — everything else in your vault stays private.

## Features

- **Docs-style layout** — top bar with search, left folder-nav tree (with a mobile
  hamburger drawer), centered reading column, a per-note **table of contents**, and
  inline "linked mentions" (backlinks). **Light/dark theme toggle** (Catppuccin Mocha/Latte), following the visitor's OS preference.
- **Obsidian syntax:** wikilinks `[[note]]` / `[[note|alias]]` / `[[note#heading]]`
  (heading links jump to real anchors), image embeds `![[img.png]]`, note transclusions
  `![[note]]`, inline `#tags` + frontmatter tags, callouts (`> [!note]`, `> [!warning]`, …),
  footnotes (`[^1]`), TeX math (`$…$` / `$$…$$`, KaTeX), and ` ```mermaid ` diagrams —
  all self-hosted and lazy-loaded only on pages that use them. Raw HTML in note bodies
  is emitted as-is for Obsidian parity — only publish content you trust, since pasted
  HTML/scripts go live on the site.
- **Syntax-highlighted code** via Pygments — each block shows its **language** and a **copy button**.
- **Backlinks** on every note, an interactive **graph view** at `/graph`, and a
  collapsible **local graph** on each note (lazy-loads d3 only when opened).
- **Hover previews** — hovering an internal link shows a card with the target's excerpt.
- **Client-side full-text search** (MiniSearch, press `/` to focus) — no server needed.
- **Polished reading UI:** self-hosted **Inter + JetBrains Mono** (variable woff2, no CDN),
  styled tables/blockquotes, **reading time**, per-note **last updated** dates (from git
  history, file-mtime fallback), **prev/next** navigation, heading hover-anchors,
  back-to-top, focus-visible rings, a skip link, and `prefers-reduced-motion` support.
- **Sharing & SEO:** per-note `<meta description>` + Open Graph tags, auto-generated
  **og:image** social cards (optional Pillow), `robots.txt` + canonical URLs, favicon +
  web manifest, a print stylesheet, `sitemap.xml`, an RSS `feed.xml`, a `404.html`, and
  a **Recently updated** section on the homepage.
- **Broken links** to unpublished/missing notes are styled and reported as build warnings.

## Quick start

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Build the sample vault and preview locally
python build.py --vault vault --out dist --serve
# open http://localhost:8000
```

Point `--vault` at your real Obsidian vault to publish your own notes. Tag any
note you want on the site with `publish` — in frontmatter or inline:

```markdown
---
title: My Note
tags: [publish, ideas]
---
```

…or just type `#publish` anywhere in the note body. The `publish` tag is a
control marker: it never shows up as a tag chip or tag page on the site.
(Legacy `publish: true` frontmatter also still works.)

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

## Deploy to GitLab Pages

A ready-to-use `.gitlab-ci.yml` is included — push the repo to GitLab and Pages
deploys automatically, no settings to flip. See **[GITLAB.md](GITLAB.md)** for
the full walkthrough (including pushing to GitHub and GitLab simultaneously).

## Development

```bash
pip install -r requirements-dev.txt
pytest
```

## How it works

The build is a small pipeline, one module per stage in `obsidian_site/`:

| Stage | Module | Job |
|-------|--------|-----|
| 1 | `discover.py` | Walk the vault, parse frontmatter, keep `publish`-tagged notes, assign slugs. |
| 2 | `parse.py` (+ `rules/`) | Render Markdown → HTML with wikilinks, embeds, callouts, code highlighting. |
| 3 | `graph.py` | Build backlinks and the graph dataset from resolved links. |
| 4 | `render.py` | Wrap notes in the docs layout (Jinja2); emit tag pages, graph page, search index. |
| 5 | `emit.py` | Write HTML to `dist/` and copy assets. |

`builder.py` wires the stages together; `build.py` is the CLI.
