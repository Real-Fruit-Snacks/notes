# Site Polish: Theme Toggle, Quick Polish, Obsidian Syntax, Freshness & Sharing

**Date:** 2026-06-10
**Status:** Approved

## Goal

Move the generated notes site from "good" to "polished/professional" with four
feature groups: a light/dark theme toggle, small professional touches (favicon,
manifest, robots.txt, canonical URLs, print styles), Obsidian syntax
completeness (footnotes, math, Mermaid), and freshness/sharing features
(git-derived dates, recently-updated list, og:image social cards).

All features follow the project's existing constraints: static output, no CDN
(assets self-hosted in `assets/vendor/`), offline-reproducible CI (Python deps
vendored as wheels in `wheels/`), pytest coverage per feature.

## 1. Theme toggle (light/dark)

- Refactor `assets/site.css` so all colors come from CSS custom properties.
  Catppuccin **Mocha** values live under `html[data-theme="dark"]` (and as the
  no-attribute default); Catppuccin **Latte** values under
  `html[data-theme="light"]`.
- A small inline script in `<head>` of `templates/base.html` runs before first
  paint: reads `localStorage.theme`; if unset, falls back to
  `prefers-color-scheme`. Sets `data-theme` on `<html>` — no flash of wrong
  theme.
- A sun/moon toggle button in the top bar switches the attribute and persists
  the choice to `localStorage`.
- Syntax highlighting: add a Catppuccin Latte Pygments style next to the
  existing Mocha style in `obsidian_site/pygments_catppuccin.py`. Emit both
  rule sets scoped by theme (e.g. `[data-theme="light"] .highlight ...`).
- Graph view (`assets/graph.js`, `assets/localgraph.js`): read node/link/text
  colors from CSS custom properties (via `getComputedStyle`) instead of
  hard-coded hex values, and re-render (or update styles) on theme change.
- `<meta name="theme-color">` updates when the theme changes.

## 2. Quick polish bundle

- **Favicon:** an SVG favicon plus PNG fallback and `apple-touch-icon`,
  generated/stored under `assets/`; linked from `base.html`.
- **Web manifest:** `site.webmanifest` with site title, colors, icons.
- **robots.txt:** emitted when `--site-url` is set; references `sitemap.xml`.
- **Canonical URLs:** `<link rel="canonical">` on every page when `--site-url`
  is set (same gating as Open Graph / sitemap today).
- **Print stylesheet:** `@media print` rules — hide topbar, sidebar, TOC,
  local graph, back-to-top; light colors; sensible page margins.

## 3. Obsidian syntax completeness

- **Footnotes:** enable `footnote_plugin` from `mdit-py-plugins` in
  `obsidian_site/parse.py`; style the footnote list and back-references in
  `site.css`.
- **Math:** enable the `dollarmath` plugin (`$inline$`, `$$block$$`). Rendered
  client-side with **KaTeX**, self-hosted under `assets/vendor/katex/`.
- **Mermaid:** fenced ` ```mermaid ` blocks become `<pre class="mermaid">`
  containers rendered by **mermaid.js**, self-hosted under
  `assets/vendor/mermaid/`. Diagram theme follows the site theme and
  re-renders on toggle.
- **Lazy loading:** during build, each note records whether it contains math
  or Mermaid. KaTeX/mermaid JS+CSS are only included on pages that need them —
  zero weight elsewhere. (Same pattern as the existing lazy d3 local graph.)

## 4. Freshness & sharing

- **Last updated:** per-note timestamp from `git log -1 --format=%cI -- <file>`
  with fallback to file mtime (e.g. vault outside a repo, shallow clone
  without history). Shown in the note byline next to reading time, and emitted
  as `<meta property="article:modified_time">`.
- **Recently updated:** homepage section listing the 8 most recently updated
  notes with dates.
- **Social cards:** at build time, render a 1200×630 PNG per note (note title
  + site title on a Catppuccin background, Inter font) using **Pillow**.
  Cards are written to `dist/og/<slug>.png` and referenced via
  `og:image`/`twitter:card` when `--site-url` is set. Pillow is an optional
  dependency: if not importable, the build logs a notice and skips cards
  (falls back to current behavior). Pillow wheel vendored in `wheels/` for CI.

## Non-goals

- No light-theme-only or multi-palette support beyond Mocha/Latte.
- No server-side rendering of math (client-side KaTeX only).
- No per-note custom card artwork — one generated template for all notes.

## Testing

Each feature gets pytest coverage in the existing style:

- Theme: base template contains the inline script, toggle button, and both
  theme rule sets; Pygments emits both scoped styles.
- Polish: favicon/manifest/robots/canonical present in output (and robots/
  canonical absent without `--site-url`); print CSS present.
- Syntax: footnote/dollarmath/mermaid markdown renders expected HTML; pages
  with math/mermaid include the vendored assets, pages without them don't.
- Freshness: git-dated note shows a date and meta tag; mtime fallback works;
  homepage lists recent notes; og:image meta + PNG emitted when Pillow and
  `--site-url` are available, skipped cleanly otherwise.

## Risks

- The CSS variable refactor touches most of `site.css` — mechanical but broad;
  verify visually in both themes.
- KaTeX + mermaid vendored assets add roughly 1–2 MB to the repo.
- `git log` per note adds build time on large vaults; batch via a single
  `git log --name-only` pass if it becomes noticeable.
