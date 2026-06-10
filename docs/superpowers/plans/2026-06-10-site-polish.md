# Site Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a light/dark theme toggle, professional polish (favicon, manifest, robots.txt, canonical, print CSS), Obsidian syntax completeness (footnotes, math, Mermaid), and freshness/sharing (git dates, recently-updated list, og:image cards) to the Obsidian static-site generator.

**Architecture:** The generator is a 5-stage pipeline (`discover → parse → graph → render → emit`) in `obsidian_site/`, with Jinja2 templates in `templates/` and static assets in `assets/` (copied verbatim by `emit.py`). All new features slot into existing stages; two new modules are added (`dates.py`, `cards.py`). Client-side features (theme, math, mermaid) are plain JS in `assets/`, vendored libs in `assets/vendor/` (no CDN). CI installs Python deps offline from `wheels/`.

**Tech Stack:** Python 3.10+, markdown-it-py + mdit-py-plugins, Pygments, Jinja2, pytest. New: KaTeX (vendored JS), Mermaid (vendored JS), Pillow (optional Python dep).

**Spec:** `docs/superpowers/specs/2026-06-10-site-polish-design.md`

**Conventions for every task:** activate the venv first (`source .venv/bin/activate`). Run tests with `python -m pytest`. Commit after each green task. The fixture vault for tests is `tests/fixtures/vault`; the `config` fixture (in `tests/conftest.py`) builds it with `base_url="/myrepo/"` and no `site_url`.

---

### Task 1: Theme CSS variables + no-flash inline script + toggle button

**Files:**
- Modify: `assets/site.css` (the `:root` block at lines 17–56, plus small additions)
- Modify: `templates/base.html`
- Modify: `assets/chrome.js`
- Test: `tests/test_polish.py` (new file)

- [ ] **Step 1: Write the failing tests**

Create `tests/test_polish.py`:

```python
"""Tests for the professional-polish pass: theming, favicon, robots, print."""
from __future__ import annotations

import pytest

from obsidian_site.builder import build_site
from obsidian_site.models import SiteConfig


# --- theme toggle ------------------------------------------------------------

def test_theme_inline_script_and_toggle(config):
    build_site(config)
    html = (config.out / "welcome.html").read_text()
    assert "localStorage.getItem(\"theme\")" in html       # no-flash boot script
    assert 'id="theme-toggle"' in html                      # toggle button
    assert 'name="theme-color"' in html                     # theme-color meta


def test_css_has_light_theme_block(config):
    build_site(config)
    css = (config.out / "assets" / "site.css").read_text()
    assert 'html[data-theme="light"]' in css
    assert "#eff1f5" in css        # Latte base
    assert "color-scheme: light" in css
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_polish.py -v`
Expected: 2 FAILED (assertions on missing markup/CSS).

- [ ] **Step 3: Edit `assets/site.css`**

Replace the comment on line 17 (`/* ---- Theme tokens (Catppuccin Mocha, dark only) ... */`) and add `color-scheme` to `:root`, then insert the Latte block right after the `:root` block (after line 56):

```css
/* ---- Theme tokens: Catppuccin Mocha (dark, default) + Latte (light) -- */
:root {
  color-scheme: dark;
  /* ... keep the existing palette/semantic/layout variables unchanged ... */
}

/* Light theme: Catppuccin Latte. Semantic vars derive from --ctp-*, so
   overriding the palette re-skins the whole site. */
html[data-theme="light"] {
  color-scheme: light;
  --ctp-base:     #eff1f5;
  --ctp-mantle:   #e6e9ef;
  --ctp-crust:    #dce0e8;
  --ctp-surface0: #ccd0da;
  --ctp-surface1: #bcc0cc;
  --ctp-text:     #4c4f69;
  --ctp-subtext0: #6c6f85;
  --ctp-overlay1: #8c8fa1;
  --ctp-blue:     #1e66f5;
  --ctp-sapphire: #209fb5;
  --ctp-lavender: #7287fd;
  --ctp-green:    #40a02b;
  --ctp-teal:     #179299;
  --ctp-yellow:   #df8e1d;
  --ctp-peach:    #fe640b;
  --ctp-pink:     #ea76cb;
  --ctp-red:      #d20f39;
  --ctp-mauve:    #8839ef;

  --accent-soft: rgba(30, 102, 245, 0.10);
  --code-bg: var(--ctp-mantle);
}
html[data-theme="light"] ::selection { background: rgba(136, 57, 239, 0.18); }
```

Note: `--code-bg` defaults to `var(--ctp-crust)` in `:root`; in Latte, crust is *lighter* than base, so we point it at mantle instead. Everything else cascades through the existing semantic vars.

Also add a toggle-button style next to `.nav-toggle` (around line 363):

```css
.theme-toggle {
  background: none; border: 1px solid var(--border); border-radius: var(--radius);
  color: var(--text); cursor: pointer; font-size: 1rem; line-height: 1; padding: .3rem .55rem;
}
.theme-toggle:hover { background: var(--accent-soft); }
```

- [ ] **Step 4: Edit `templates/base.html`**

Replace line 6 (`<meta name="color-scheme" content="dark">`) with the theme-color meta + boot script (CSS `color-scheme` now handles form controls):

```html
  <meta name="theme-color" content="#1e1e2e" id="meta-theme-color">
  <script>
    // Set the theme before first paint so there is no flash of wrong theme.
    (function () {
      var t = null;
      try { t = localStorage.getItem("theme"); } catch (e) {}
      if (t !== "light" && t !== "dark") {
        t = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light" : "dark";
      }
      document.documentElement.setAttribute("data-theme", t);
      if (t === "light") {
        var m = document.getElementById("meta-theme-color");
        if (m) m.setAttribute("content", "#eff1f5");
      }
    })();
  </script>
```

**Important:** the script reads `#meta-theme-color`, so the meta tag must come *before* the script (as shown).

Add the toggle button inside `<nav class="topnav">` (line 24–26), after the Graph link:

```html
    <nav class="topnav">
      <a href="{{ base_url }}graph.html">Graph</a>
      <button id="theme-toggle" class="theme-toggle" type="button" aria-label="Switch theme">☀</button>
    </nav>
```

- [ ] **Step 5: Edit `assets/chrome.js`**

Append inside the IIFE (before the closing `})();`):

```js
  // Theme toggle: persists to localStorage; the head boot script applied the
  // initial value. Dispatches "themechange" so canvases (graph) can recolour.
  var themeBtn = document.getElementById("theme-toggle");
  var themeMeta = document.getElementById("meta-theme-color");
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    if (themeMeta) themeMeta.setAttribute("content", t === "light" ? "#eff1f5" : "#1e1e2e");
    if (themeBtn) {
      themeBtn.textContent = t === "light" ? "☾" : "☀";
      themeBtn.setAttribute(
        "aria-label", t === "light" ? "Switch to dark theme" : "Switch to light theme"
      );
    }
    document.dispatchEvent(new CustomEvent("themechange", { detail: { theme: t } }));
  }
  if (themeBtn) {
    applyTheme(document.documentElement.getAttribute("data-theme") || "dark");
    themeBtn.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      try { localStorage.setItem("theme", next); } catch (e) {}
      applyTheme(next);
    });
  }
```

- [ ] **Step 6: Run tests**

Run: `python -m pytest tests/test_polish.py -v`
Expected: 2 PASSED. Also run the full suite: `python -m pytest` — all green.

- [ ] **Step 7: Visual check**

Run: `python build.py --vault vault --out dist --serve` and open http://localhost:8000. Toggle the theme; verify no flash on reload, readable text/links/code/tables/callouts in light mode. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add assets/site.css templates/base.html assets/chrome.js tests/test_polish.py
git commit -m "Add light/dark theme toggle with Catppuccin Latte light palette"
```

---

### Task 2: Catppuccin Latte Pygments style, theme-scoped highlight CSS

**Files:**
- Modify: `obsidian_site/pygments_catppuccin.py` (rewrite: palette dicts + style factory)
- Modify: `obsidian_site/parse.py:166-181` (`pygments_css()`)
- Test: `tests/test_polish.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_polish.py`:

```python
def test_pygments_css_covers_both_themes(config):
    build_site(config)
    css = (config.out / "assets" / "pygments.css").read_text()
    assert '[data-theme="light"] .highlight' in css
    assert "#8839ef" in css.lower()   # Latte mauve (keywords)
    assert "#cba6f7" in css.lower()   # Mocha mauve still present
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_polish.py::test_pygments_css_covers_both_themes -v`
Expected: FAIL.

- [ ] **Step 3: Rewrite `obsidian_site/pygments_catppuccin.py`**

Replace the whole module with a palette-driven version that defines both styles:

```python
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
```

- [ ] **Step 4: Update `pygments_css()` in `obsidian_site/parse.py`**

Replace the existing function (lines 166–181) with:

```python
def pygments_css() -> str:
    """Return the Pygments stylesheet for both themes.

    Mocha rules are emitted unscoped (dark is the default theme); Latte rules
    are scoped under ``[data-theme="light"]``. The container-background rule of
    each is dropped so our theme variable (``--code-bg``) controls the block
    background.
    """
    import re

    from .pygments_catppuccin import CatppuccinLatte, CatppuccinMocha

    def defs(style, scope: str) -> str:
        css = HtmlFormatter(style=style, cssclass="highlight").get_style_defs(scope)
        # Remove the standalone container rule (incl. background) for `scope`.
        return re.sub(re.escape(scope) + r"\s*\{[^}]*\}", "", css, count=1).strip()

    mocha = defs(CatppuccinMocha, ".highlight")
    latte = defs(CatppuccinLatte, '[data-theme="light"] .highlight')
    return mocha + "\n\n/* Light theme (Catppuccin Latte) */\n" + latte
```

- [ ] **Step 5: Run tests**

Run: `python -m pytest -v`
Expected: all PASS (existing `pygments` tests still green — Mocha rules are unchanged and still unscoped).

- [ ] **Step 6: Commit**

```bash
git add obsidian_site/pygments_catppuccin.py obsidian_site/parse.py tests/test_polish.py
git commit -m "Add Catppuccin Latte Pygments style, scope highlight CSS per theme"
```

---

### Task 3: Theme-aware graph colours

**Files:**
- Modify: `assets/graph.js` (PALETTE at lines 14–16, colour assignment, legend swatches)

No Python output changes, so this task is verified manually (the JS is not unit-tested in this repo).

- [ ] **Step 1: Replace the hard-coded palette**

In `assets/graph.js`, replace lines 14–16:

```js
  // Catppuccin accents, read from CSS variables so they follow the theme.
  var PALETTE_VARS = ["--ctp-blue", "--ctp-green", "--ctp-peach", "--ctp-red",
                      "--ctp-mauve", "--ctp-teal", "--ctp-yellow", "--ctp-pink",
                      "--ctp-sapphire", "--ctp-lavender"];
  function palette() {
    var cs = getComputedStyle(document.documentElement);
    return PALETTE_VARS.map(function (v) { return cs.getPropertyValue(v).trim(); });
  }
```

- [ ] **Step 2: Make the colour map rebuildable**

Inside `draw(data)`, replace the colour-map block (lines 32–33):

```js
    var colour = {};
    function recolour() {
      var p = palette();
      folders.forEach(function (f, i) { colour[f] = p[i % p.length]; });
    }
    recolour();
```

- [ ] **Step 3: Re-apply colours on theme change**

The legend swatches need to be reachable later; in the legend block (lines 139–157), collect them:

```js
    var legend = document.getElementById("graph-legend");
    var swatches = {};
    if (legend) {
      folders.forEach(function (f) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "legend-item";
        var swatch = document.createElement("span");
        swatch.className = "legend-swatch";
        swatch.style.background = colour[f];
        swatches[f] = swatch;
        btn.appendChild(swatch);
        btn.appendChild(document.createTextNode(f || "root"));
        btn.addEventListener("click", function () {
          hiddenFolders[f] = !hiddenFolders[f];
          btn.classList.toggle("off", !!hiddenFolders[f]);
          apply();
        });
        legend.appendChild(btn);
      });
    }

    document.addEventListener("themechange", function () {
      recolour();
      node.select("circle").attr("fill", function (d) { return colour[folderOf(d.id)]; });
      folders.forEach(function (f) {
        if (swatches[f]) swatches[f].style.background = colour[f];
      });
    });
```

(The `themechange` listener goes at the end of `draw()`, after the toolbar blocks.)

- [ ] **Step 4: Verify manually**

Run: `python build.py --vault vault --out dist --serve`, open `/graph.html`, toggle the theme. Node colours and legend swatches must switch to Latte accents and back. Run `python -m pytest` (should stay green — no Python changes). Stop the server.

- [ ] **Step 5: Commit**

```bash
git add assets/graph.js
git commit -m "Recolour graph nodes and legend from CSS variables on theme change"
```

---

### Task 4: Favicon + web manifest

**Files:**
- Create: `assets/favicon.svg`
- Modify: `templates/base.html` (head)
- Modify: `obsidian_site/render.py` (`render_site`, after the `pages["404.html"]` line)
- Test: `tests/test_polish.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_polish.py`:

```python
# --- favicon + manifest --------------------------------------------------------

def test_favicon_and_manifest(config):
    build_site(config)
    assert (config.out / "assets" / "favicon.svg").exists()
    manifest = (config.out / "site.webmanifest").read_text()
    assert "My Notes" in manifest
    html = (config.out / "welcome.html").read_text()
    assert 'rel="icon"' in html
    assert 'rel="manifest"' in html
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_polish.py::test_favicon_and_manifest -v`
Expected: FAIL.

- [ ] **Step 3: Create `assets/favicon.svg`**

A small "linked notes" mark in site colours:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#1e1e2e"/>
  <path d="M26 27.5 38 36" stroke="#a6adc8" stroke-width="3.5" stroke-linecap="round"/>
  <circle cx="21" cy="24" r="8" fill="#cba6f7"/>
  <circle cx="43" cy="40" r="8" fill="#89b4fa"/>
</svg>
```

- [ ] **Step 4: Link it from `templates/base.html`**

In the `<head>`, after the stylesheet links:

```html
  <link rel="icon" type="image/svg+xml" href="{{ base_url }}assets/favicon.svg">
  <link rel="manifest" href="{{ base_url }}site.webmanifest">
```

- [ ] **Step 5: Emit the manifest from `obsidian_site/render.py`**

In `render_site`, after `pages["404.html"] = ...` add:

```python
        pages["site.webmanifest"] = json.dumps({
            "name": self.config.site_title,
            "short_name": self.config.site_title,
            "start_url": self.config.base_url,
            "display": "minimal-ui",
            "background_color": "#1e1e2e",
            "theme_color": "#1e1e2e",
            "icons": [
                {"src": self._url("assets/favicon.svg"), "sizes": "any", "type": "image/svg+xml"}
            ],
        })
```

- [ ] **Step 6: Run tests, then commit**

Run: `python -m pytest` → all PASS.

```bash
git add assets/favicon.svg templates/base.html obsidian_site/render.py tests/test_polish.py
git commit -m "Add SVG favicon and web manifest"
```

---

### Task 5: robots.txt + canonical URLs on all pages

**Files:**
- Modify: `obsidian_site/render.py` (`render_site`)
- Modify: `templates/base.html`, `templates/index.html`, `templates/graph.html`, `templates/tag.html`, `templates/note.html`
- Test: `tests/test_polish.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_polish.py`:

```python
# --- robots.txt + canonical ----------------------------------------------------

def test_robots_txt_with_site_url(tmp_path, vault_path):
    cfg = SiteConfig(vault=vault_path, out=tmp_path / "dist", base_url="/myrepo/",
                     site_url="https://example.com")
    build_site(cfg)
    robots = (cfg.out / "robots.txt").read_text()
    assert "Sitemap: https://example.com/myrepo/sitemap.xml" in robots


def test_no_robots_txt_without_site_url(config):
    build_site(config)
    assert not (config.out / "robots.txt").exists()


def test_canonical_on_index_and_tag_pages(tmp_path, vault_path):
    cfg = SiteConfig(vault=vault_path, out=tmp_path / "dist", base_url="/myrepo/",
                     site_url="https://example.com")
    build_site(cfg)
    index = (cfg.out / "index.html").read_text()
    assert '<link rel="canonical" href="https://example.com/myrepo/index.html">' in index
    note = (cfg.out / "welcome.html").read_text()
    assert '<link rel="canonical" href="https://example.com/myrepo/welcome.html">' in note
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_polish.py -v -k "robots or canonical"`
Expected: `test_robots_txt_with_site_url` and `test_canonical_on_index_and_tag_pages` FAIL; the "without" test passes already (fine).

- [ ] **Step 3: Emit robots.txt in `render_site`**

After the `site.webmanifest` block from Task 4:

```python
        if self.config.site_url:
            pages["robots.txt"] = (
                "User-agent: *\nAllow: /\n\n"
                f"Sitemap: {self.config.abs_url('sitemap.xml')}\n"
            )
```

- [ ] **Step 4: Centralise canonical in `templates/base.html`**

In `<head>`, just before `{% block head %}`:

```html
  {% if site_url and canonical_path is defined and canonical_path %}<link rel="canonical" href="{{ abs_url(canonical_path) }}">{% endif %}
```

Then set `canonical_path` per template (top of each file, next to any existing `{% set %}`):

- `templates/index.html` (after the `{% extends %}` line): `{% set canonical_path = "index.html" %}`
- `templates/graph.html`: `{% set canonical_path = "graph.html" %}`
- `templates/tag.html`: `{% set canonical_path = "tags/" + (tag | slugify) + ".html" %}`
- `templates/note.html`: add `{% set canonical_path = note.url %}` after line 2 and **delete** the now-duplicate `<link rel="canonical" ...>` from its head block (line 10), keeping the `og:url` meta:

```html
  {% if site_url %}<meta property="og:url" content="{{ abs_url(note.url) }}">{% endif %}
```

- [ ] **Step 5: Run tests, then commit**

Run: `python -m pytest` → all PASS (check no test asserted the old note canonical position).

```bash
git add obsidian_site/render.py templates/ tests/test_polish.py
git commit -m "Emit robots.txt and canonical links on every page when site-url is set"
```

---

### Task 6: Print stylesheet

**Files:**
- Modify: `assets/site.css` (append at end)
- Test: `tests/test_polish.py`

- [ ] **Step 1: Write the failing test**

```python
# --- print stylesheet ----------------------------------------------------------

def test_print_styles_present(config):
    build_site(config)
    css = (config.out / "assets" / "site.css").read_text()
    assert "@media print" in css
```

- [ ] **Step 2: Run it (FAIL), then append to `assets/site.css`:**

```css
/* ---- Print ------------------------------------------------------------ */
@media print {
  html[data-theme="dark"], html[data-theme="light"], :root {
    color-scheme: light;
    --bg: #ffffff; --bg-alt: #ffffff; --text: #111111; --muted: #555555;
    --border: #cccccc; --accent: #1e66f5; --code-bg: #f6f6f6;
  }
  html { font-size: 11pt; }
  .topbar, .sidebar, .scrim, .to-top, .nav-toggle, .search, .toc,
  .local-graph, .prev-next, .site-footer, .copy-btn, .heading-anchor,
  .skip-link, #link-preview { display: none !important; }
  .layout { display: block; }
  .content { padding: 0; }
  .note { max-width: none; }
  body { background: #ffffff; }
  a { color: inherit; text-decoration: underline; }
  .note-body pre, .highlight { white-space: pre-wrap; border: 1px solid #cccccc; }
}
```

- [ ] **Step 3: Run tests, verify in browser print preview (Ctrl+P on a note), commit**

```bash
git add assets/site.css tests/test_polish.py
git commit -m "Add print stylesheet"
```

---

### Task 7: Footnotes

**Files:**
- Modify: `obsidian_site/parse.py` (plugin chain, line 62–71)
- Modify: `assets/site.css` (append)
- Test: `tests/test_syntax_extras.py` (new file)

- [ ] **Step 1: Write the failing test**

Create `tests/test_syntax_extras.py`:

```python
"""Tests for Obsidian-syntax completeness: footnotes, math, Mermaid."""
from __future__ import annotations

from obsidian_site.builder import build_site
from obsidian_site.models import SiteConfig


def _build_one(tmp_path, body: str) -> str:
    vault = tmp_path / "v"
    vault.mkdir()
    (vault / "n.md").write_text(
        f"---\ntitle: N\npublish: true\n---\n\n{body}\n", encoding="utf-8"
    )
    cfg = SiteConfig(vault=vault, out=tmp_path / "o")
    build_site(cfg)
    return (cfg.out / "n.html").read_text()


# --- footnotes -----------------------------------------------------------------

def test_footnotes_render(tmp_path):
    html = _build_one(tmp_path, "Body text[^1].\n\n[^1]: The footnote.")
    assert 'class="footnote-ref"' in html
    assert 'class="footnotes"' in html
    assert "The footnote." in html
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python -m pytest tests/test_syntax_extras.py -v`
Expected: FAIL (footnote syntax renders as literal text).

- [ ] **Step 3: Enable the plugin in `obsidian_site/parse.py`**

Add the import next to the tasklists import (line 15):

```python
from mdit_py_plugins.footnote import footnote_plugin
```

Add `.use(footnote_plugin)` to the chain in `__init__` (after `.use(tasklists_plugin)`).

- [ ] **Step 4: Style footnotes — append to `assets/site.css`:**

```css
/* ---- Footnotes -------------------------------------------------------- */
.footnote-ref a { font-size: .78em; }
hr.footnotes-sep { border: 0; height: 1px; background: var(--border); margin: 2.5rem 0 1rem; }
.footnotes { font-size: .9rem; color: var(--muted); }
.footnotes-list { padding-left: 1.4rem; }
.footnotes-list p { display: inline; margin: 0; }
.footnote-backref { margin-left: .3rem; text-decoration: none; }
```

- [ ] **Step 5: Run tests (`python -m pytest`), then commit**

```bash
git add obsidian_site/parse.py assets/site.css tests/test_syntax_extras.py
git commit -m "Render Obsidian footnotes"
```

---

### Task 8: Math via dollarmath + vendored KaTeX (lazy-loaded)

**Files:**
- Modify: `obsidian_site/parse.py` (plugin + render rules)
- Modify: `obsidian_site/models.py` (`Note` flags)
- Modify: `obsidian_site/builder.py` (set flags after parse)
- Modify: `templates/note.html` (conditional includes)
- Create: `assets/math.js`
- Create (vendored): `assets/vendor/katex/` (katex.min.css, katex.min.js, fonts/)
- Modify: `assets/site.css` (append)
- Test: `tests/test_syntax_extras.py`

- [ ] **Step 1: Vendor KaTeX**

```bash
cd /mnt/c/Users/Matt/Documents/website
curl -L -o /tmp/katex.tgz https://registry.npmjs.org/katex/-/katex-0.16.21.tgz
mkdir -p assets/vendor/katex
tar -xzf /tmp/katex.tgz -C /tmp
cp /tmp/package/dist/katex.min.css /tmp/package/dist/katex.min.js assets/vendor/katex/
cp -r /tmp/package/dist/fonts assets/vendor/katex/fonts
rm -rf /tmp/package /tmp/katex.tgz
```

(If a newer 0.16.x exists on npm, use it — the dist layout is the same.)

- [ ] **Step 2: Write the failing tests**

Append to `tests/test_syntax_extras.py`:

```python
# --- math ----------------------------------------------------------------------

def test_inline_and_block_math_render(tmp_path):
    html = _build_one(tmp_path, "Euler: $e^{i\\pi}+1=0$\n\n$$\\int_0^1 x\\,dx$$")
    assert '<span class="math math-inline">' in html
    assert '<div class="math math-block">' in html
    assert "vendor/katex/katex.min.js" in html       # lazy include present


def test_no_katex_on_pages_without_math(config):
    build_site(config)
    html = (config.out / "welcome.html").read_text()
    assert "katex" not in html
```

- [ ] **Step 3: Run to verify failure**

Run: `python -m pytest tests/test_syntax_extras.py -v -k math`
Expected: `test_inline_and_block_math_render` FAILS; the "no katex" test passes already.

- [ ] **Step 4: Enable dollarmath in `obsidian_site/parse.py`**

Import:

```python
from mdit_py_plugins.dollarmath import dollarmath_plugin
```

Chain (after `footnote_plugin`): `.use(dollarmath_plugin, allow_labels=False)`.

Register render rules next to the wikilink/hashtag rules in `__init__`:

```python
        self.md.renderer.rules["math_inline"] = self._render_math_inline
        self.md.renderer.rules["math_block"] = self._render_math_block
```

And the methods (next to `_render_hashtag`):

```python
    def _render_math_inline(self, tokens, idx, options, env) -> str:
        # Raw TeX, escaped; KaTeX renders it client-side (assets/math.js).
        return f'<span class="math math-inline">{html.escape(tokens[idx].content)}</span>'

    def _render_math_block(self, tokens, idx, options, env) -> str:
        return f'<div class="math math-block">{html.escape(tokens[idx].content)}</div>\n'
```

- [ ] **Step 5: Add per-note flags**

`obsidian_site/models.py` — add two fields to `Note` (under the "Filled in by later pipeline stages" group):

```python
    has_math: bool = False     # page contains $...$ / $$...$$ (loads KaTeX)
    has_mermaid: bool = False  # page contains a mermaid fence (loads mermaid)
```

`obsidian_site/builder.py` — in the parse loop, after `note.excerpt = excerpt_of(res.html)`:

```python
        # Inside fenced code these markers are HTML-escaped, so plain string
        # search only matches real math/mermaid containers.
        note.has_math = 'class="math math-' in res.html
        note.has_mermaid = '<pre class="mermaid">' in res.html
```

(`has_mermaid` stays False until Task 9 — harmless.)

- [ ] **Step 6: Lazy includes in `templates/note.html`**

In `{% block head %}`:

```html
  {% if note.has_math %}<link rel="stylesheet" href="{{ base_url }}assets/vendor/katex/katex.min.css">{% endif %}
```

Add a scripts block at the end of the file:

```html
{% block scripts %}
  {% if note.has_math %}
  <script src="{{ base_url }}assets/vendor/katex/katex.min.js"></script>
  <script src="{{ base_url }}assets/math.js"></script>
  {% endif %}
{% endblock %}
```

- [ ] **Step 7: Create `assets/math.js`**

```js
// Render $...$ / $$...$$ spans produced at build time with KaTeX.
(function () {
  if (typeof katex === "undefined") return;
  document.querySelectorAll(".math").forEach(function (el) {
    var tex = el.textContent;
    try {
      katex.render(tex, el, {
        displayMode: el.classList.contains("math-block"),
        throwOnError: false,
      });
    } catch (e) { /* leave the raw TeX visible */ }
  });
})();
```

Append to `assets/site.css`:

```css
/* ---- Math (KaTeX) ----------------------------------------------------- */
.math-block { margin: 1.2rem 0; overflow-x: auto; }
```

- [ ] **Step 8: Run tests, verify a math note in the browser, commit**

Run: `python -m pytest` → all PASS. Add `$E=mc^2$` to a sample vault note, build with `--serve`, confirm KaTeX renders in both themes; revert the sample edit.

```bash
git add obsidian_site/ templates/note.html assets/math.js assets/site.css assets/vendor/katex tests/test_syntax_extras.py
git commit -m "Render TeX math with vendored KaTeX, lazy-loaded per page"
```

---

### Task 9: Mermaid diagrams (vendored, lazy-loaded, theme-aware)

**Files:**
- Modify: `obsidian_site/parse.py:30-45` (`_highlight`)
- Modify: `templates/note.html` (scripts block)
- Create: `assets/mermaid-init.js`
- Create (vendored): `assets/vendor/mermaid/mermaid.min.js`
- Modify: `assets/site.css` (append)
- Test: `tests/test_syntax_extras.py`

- [ ] **Step 1: Vendor mermaid**

```bash
curl -L -o /tmp/mermaid.tgz https://registry.npmjs.org/mermaid/-/mermaid-11.6.0.tgz
mkdir -p assets/vendor/mermaid
tar -xzf /tmp/mermaid.tgz -C /tmp
cp /tmp/package/dist/mermaid.min.js assets/vendor/mermaid/
rm -rf /tmp/package /tmp/mermaid.tgz
```

(Use the latest 11.x if newer; we need the UMD `dist/mermaid.min.js`.)

- [ ] **Step 2: Write the failing test**

```python
# --- mermaid -------------------------------------------------------------------

def test_mermaid_fence_becomes_container(tmp_path):
    html = _build_one(tmp_path, "```mermaid\ngraph TD; A-->B;\n```")
    assert '<pre class="mermaid">' in html
    assert "vendor/mermaid/mermaid.min.js" in html


def test_no_mermaid_js_on_other_pages(config):
    build_site(config)
    html = (config.out / "welcome.html").read_text()
    assert "mermaid" not in html
```

- [ ] **Step 3: Run to verify failure**

Run: `python -m pytest tests/test_syntax_extras.py -v -k mermaid`
Expected: first test FAILS (fence is Pygments-highlighted as unknown language).

- [ ] **Step 4: Special-case mermaid in `_highlight` (`obsidian_site/parse.py`)**

At the top of `_highlight`, before the lexer lookup:

```python
    if lang == "mermaid":
        # A <pre> return is used verbatim by markdown-it; mermaid-init.js
        # renders the diagram client-side from the escaped source text.
        return f'<pre class="mermaid">{html.escape(code)}</pre>\n'
```

- [ ] **Step 5: Includes in `templates/note.html`** (extend the scripts block from Task 8):

```html
  {% if note.has_mermaid %}
  <script src="{{ base_url }}assets/vendor/mermaid/mermaid.min.js"></script>
  <script src="{{ base_url }}assets/mermaid-init.js"></script>
  {% endif %}
```

- [ ] **Step 6: Create `assets/mermaid-init.js`**

```js
// Render mermaid fences; re-render with the matching theme on toggle.
(function () {
  if (typeof mermaid === "undefined") return;
  var blocks = Array.prototype.slice.call(document.querySelectorAll("pre.mermaid"));
  if (!blocks.length) return;
  blocks.forEach(function (el) { el.setAttribute("data-src", el.textContent); });

  function render() {
    blocks.forEach(function (el) {
      el.removeAttribute("data-processed");
      el.textContent = el.getAttribute("data-src");
    });
    var light = document.documentElement.getAttribute("data-theme") === "light";
    mermaid.initialize({ startOnLoad: false, theme: light ? "default" : "dark" });
    mermaid.run({ nodes: blocks });
  }
  render();
  document.addEventListener("themechange", render);
})();
```

Append to `assets/site.css`:

```css
/* ---- Mermaid diagrams ------------------------------------------------- */
pre.mermaid {
  background: var(--bg-alt); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 1rem; text-align: center;
}
pre.mermaid:not([data-processed]) {
  color: var(--muted); font-family: var(--font-mono); font-size: .85rem; text-align: left;
}
```

- [ ] **Step 7: Run tests, verify a diagram in the browser in both themes, commit**

```bash
git add obsidian_site/parse.py templates/note.html assets/mermaid-init.js assets/site.css assets/vendor/mermaid tests/test_syntax_extras.py
git commit -m "Render mermaid fences with vendored mermaid.js, theme-aware"
```

---

### Task 10: Last-updated dates (git, mtime fallback)

**Files:**
- Create: `obsidian_site/dates.py`
- Modify: `obsidian_site/models.py` (`Note.updated`)
- Modify: `obsidian_site/builder.py` (call after discover)
- Modify: `templates/note.html` (byline + meta)
- Modify: `assets/site.css` (byline separator)
- Test: `tests/test_freshness.py` (new file)

- [ ] **Step 1: Write the failing tests**

Create `tests/test_freshness.py`:

```python
"""Tests for freshness & sharing: updated dates, recent list, social cards."""
from __future__ import annotations

import pytest

from obsidian_site.builder import build_site
from obsidian_site.models import SiteConfig


def test_updated_date_from_mtime_fallback(tmp_path):
    vault = tmp_path / "v"
    vault.mkdir()
    (vault / "n.md").write_text("---\ntitle: N\npublish: true\n---\n\nHi\n", encoding="utf-8")
    cfg = SiteConfig(vault=vault, out=tmp_path / "o")
    build_site(cfg)
    html = (cfg.out / "n.html").read_text()
    assert 'property="article:modified_time"' in html
    assert "Updated " in html


def test_updated_date_from_git(config):
    # The fixture vault is committed in this repo, so git history applies.
    build_site(config)
    html = (config.out / "welcome.html").read_text()
    assert 'property="article:modified_time"' in html
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_freshness.py -v`
Expected: 2 FAILED.

- [ ] **Step 3: Create `obsidian_site/dates.py`**

```python
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
```

- [ ] **Step 4: Wire it up**

`obsidian_site/models.py` — add to `Note` (pipeline-filled group):

```python
    updated: str = ""      # ISO timestamp of last modification (git or mtime)
```

`obsidian_site/builder.py` — import and call right after `by_slug = ...` (before parsing):

```python
from .dates import annotate_updated
```

```python
    annotate_updated(config.vault, notes)
```

- [ ] **Step 5: Show it in `templates/note.html`**

Head block, next to the other metas:

```html
  {% if note.updated %}<meta property="article:modified_time" content="{{ note.updated }}">{% endif %}
```

Byline — inside `<div class="note-meta">`, after the reading-time span:

```html
    {% if note.updated %}<span class="note-updated">Updated {{ note.updated[:10] }}</span>{% endif %}
```

`assets/site.css` — next to the existing `.note-date + .reading-time::before` rule (line 407):

```css
.note-updated { color: var(--muted); font-size: .85rem; }
.reading-time + .note-updated::before { content: "·"; margin-right: .55rem; color: var(--ctp-overlay1); }
```

- [ ] **Step 6: Run tests (`python -m pytest`), then commit**

```bash
git add obsidian_site/dates.py obsidian_site/models.py obsidian_site/builder.py templates/note.html assets/site.css tests/test_freshness.py
git commit -m "Show per-note last-updated dates from git history (mtime fallback)"
```

---

### Task 11: "Recently updated" homepage section

**Files:**
- Modify: `obsidian_site/render.py` (index render call, line 117–120)
- Modify: `templates/index.html`
- Modify: `assets/site.css` (append)
- Test: `tests/test_freshness.py`

- [ ] **Step 1: Write the failing test**

```python
def test_homepage_lists_recently_updated(config):
    build_site(config)
    index = (config.out / "index.html").read_text()
    assert "Recently updated" in index
```

- [ ] **Step 2: Run (FAIL), then pass `recent` from `render_site`:**

```python
        index_tpl = self.env.get_template("index.html")
        pages["index.html"] = index_tpl.render(
            notes=sorted(notes, key=lambda n: n.title.lower()), nav=nav, all_tags=sorted(tags),
            recent=sorted(notes, key=lambda n: n.updated, reverse=True)[:8],
        )
```

- [ ] **Step 3: Render it in `templates/index.html`** — replace the `<ul class="note-list">` block:

```html
  {% if recent %}
  <h2 class="index-heading">Recently updated</h2>
  <ul class="note-list recent-list">
    {% for n in recent %}
    <li>
      <a href="{{ base_url }}{{ n.url }}">{{ n.title }}</a>
      <span class="note-date">{{ n.updated[:10] }}</span>
    </li>
    {% endfor %}
  </ul>
  {% endif %}

  <h2 class="index-heading">All notes</h2>
  <ul class="note-list">
    {% for n in notes %}
    <li><a href="{{ base_url }}{{ n.url }}">{{ n.title }}</a></li>
    {% endfor %}
  </ul>
```

Append to `assets/site.css`:

```css
/* ---- Homepage sections ------------------------------------------------ */
.index-heading { font-size: 1.15rem; color: var(--ctp-sapphire); margin: 1.6rem 0 .4rem; }
.recent-list li { display: flex; justify-content: space-between; gap: 1rem; }
.recent-list .note-date { flex: none; }
```

- [ ] **Step 4: Run tests (`python -m pytest`), then commit**

```bash
git add obsidian_site/render.py templates/index.html assets/site.css tests/test_freshness.py
git commit -m "Add 'Recently updated' section to the homepage"
```

---

### Task 12: Social cards (og:image) + apple-touch-icon via optional Pillow

**Files:**
- Create: `obsidian_site/cards.py`
- Create: `fonts/inter-variable.ttf` (downloaded; repo root, NOT under `assets/` — `emit.py` copies all of `assets/` to the site and this build-time font must not ship)
- Modify: `obsidian_site/builder.py`, `obsidian_site/render.py` (`Renderer.__init__`)
- Modify: `templates/note.html`, `templates/base.html`
- Modify: `requirements.txt`, `wheels/`
- Test: `tests/test_freshness.py`

- [ ] **Step 1: Download the card font and Pillow**

```bash
mkdir -p fonts
curl -L -o fonts/inter-variable.ttf \
  "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf"
pip install Pillow
```

Add `Pillow>=11` to `requirements.txt`. Then check which Python the CI uses (`grep python-version .github/workflows/deploy.yml .gitlab-ci.yml`) and vendor matching wheels, e.g.:

```bash
pip download Pillow --dest wheels --only-binary=:all: \
  --python-version 311 --platform manylinux2014_x86_64
pip download Pillow --dest wheels --only-binary=:all: \
  --python-version 310 --platform manylinux2014_x86_64
```

(Match the pattern of the existing cp310/cp311 markupsafe wheels. If CI pins a different version, vendor that one instead.)

- [ ] **Step 2: Write the failing tests**

```python
# --- social cards ----------------------------------------------------------------

def test_social_cards_generated(tmp_path, vault_path):
    pytest.importorskip("PIL")
    cfg = SiteConfig(vault=vault_path, out=tmp_path / "dist", base_url="/myrepo/",
                     site_url="https://example.com")
    build_site(cfg)
    assert (cfg.out / "og" / "welcome.png").exists()
    assert (cfg.out / "apple-touch-icon.png").exists()
    html = (cfg.out / "welcome.html").read_text()
    assert 'property="og:image" content="https://example.com/myrepo/og/welcome.png"' in html
    assert 'name="twitter:card"' in html


def test_no_cards_without_site_url(config):
    build_site(config)
    assert not (config.out / "og").exists()
    html = (config.out / "welcome.html").read_text()
    assert "og:image" not in html
```

- [ ] **Step 3: Run to verify failure**

Run: `python -m pytest tests/test_freshness.py -v -k cards`
Expected: `test_social_cards_generated` FAILS; the no-site-url test passes.

- [ ] **Step 4: Create `obsidian_site/cards.py`**

```python
"""Optional build step: Open Graph card PNGs and apple-touch-icon (Pillow).

Pillow is an optional dependency: when it (or the card font) is missing the
build simply skips cards and the templates omit og:image tags.
"""
from __future__ import annotations

import textwrap
from pathlib import Path

from .models import Note, SiteConfig

FONT_PATH = Path(__file__).resolve().parent.parent / "fonts" / "inter-variable.ttf"

# Catppuccin Mocha — cards are dark regardless of the viewer's theme.
BG = "#1e1e2e"
ACCENT = "#cba6f7"
TEXT = "#cdd6f4"
MUTED = "#a6adc8"


def available() -> bool:
    try:
        import PIL  # noqa: F401
    except ImportError:
        return False
    return FONT_PATH.exists()


def _font(size: int, bold: bool):
    from PIL import ImageFont

    font = ImageFont.truetype(str(FONT_PATH), size)
    try:
        font.set_variation_by_name("Bold" if bold else "Regular")
    except OSError:
        pass  # static font or no variation support — default weight is fine
    return font


def generate_cards(config: SiteConfig, notes: list[Note]) -> list[str]:
    """Write og/<slug>.png per note plus apple-touch-icon.png. Returns warnings."""
    if not available():
        return ["Pillow or fonts/inter-variable.ttf missing: skipped social cards"]
    from PIL import Image, ImageDraw

    title_font = _font(72, bold=True)
    site_font = _font(36, bold=False)
    for note in notes:
        img = Image.new("RGB", (1200, 630), BG)
        draw = ImageDraw.Draw(img)
        draw.rectangle((0, 0, 16, 630), fill=ACCENT)
        y = 170
        for line in textwrap.wrap(note.title, width=26)[:4]:
            draw.text((80, y), line, font=title_font, fill=TEXT)
            y += 94
        draw.text((80, 520), config.site_title, font=site_font, fill=MUTED)
        dest = config.out / "og" / f"{note.slug}.png"   # slugs may contain '/'
        dest.parent.mkdir(parents=True, exist_ok=True)
        img.save(dest)

    icon = Image.new("RGB", (180, 180), BG)
    draw = ImageDraw.Draw(icon)
    draw.ellipse((28, 38, 86, 96), fill=ACCENT)
    draw.ellipse((96, 86, 154, 144), fill="#89b4fa")
    draw.line((76, 86, 106, 106), fill=MUTED, width=9)
    icon.save(config.out / "apple-touch-icon.png")
    return []
```

- [ ] **Step 5: Wire into builder and renderer**

`obsidian_site/render.py` — accept a flag and expose it to templates:

```python
    def __init__(self, config: SiteConfig, cards_enabled: bool = False):
```

and inside `__init__`:

```python
        self.env.globals["cards_enabled"] = cards_enabled
```

`obsidian_site/builder.py`:

```python
from . import cards
```

Replace step 4/5 in `build_site`:

```python
    # 4. render pages
    cards_enabled = bool(config.site_url) and cards.available()
    pages = Renderer(config, cards_enabled=cards_enabled).render_site(notes, graph_data)

    # 5. emit to disk (+ social cards, written after emit clears the out dir)
    warnings += emit(config, pages, image_assets)
    if config.site_url:
        warnings += cards.generate_cards(config, notes)
    return warnings
```

- [ ] **Step 6: Template tags**

`templates/note.html` head block, after the og:description meta:

```html
  {% if site_url and cards_enabled %}<meta property="og:image" content="{{ abs_url('og/' + note.slug + '.png') }}">
  <meta name="twitter:card" content="summary_large_image">{% endif %}
```

`templates/base.html` head, after the favicon link:

```html
  {% if cards_enabled %}<link rel="apple-touch-icon" href="{{ base_url }}apple-touch-icon.png">{% endif %}
```

- [ ] **Step 7: Run the full suite, eyeball one card, commit**

Run: `python -m pytest` → all PASS. Build the sample vault with `--site-url https://example.com` and open `dist/og/welcome.png` to check layout.

```bash
git add obsidian_site/ templates/ requirements.txt wheels/ fonts/inter-variable.ttf tests/test_freshness.py
git commit -m "Generate og:image social cards and apple-touch-icon with optional Pillow"
```

---

### Task 13: README + final verification

**Files:**
- Modify: `README.md` (Features section)

- [ ] **Step 1: Update the Features list in `README.md`**

Amend the existing bullets (don't rewrite the file):
- Change "Dark-only **Catppuccin Mocha** theme." to "**Light/dark theme toggle** (Catppuccin Mocha/Latte), following the visitor's OS preference."
- In the Obsidian-syntax bullet, add: "footnotes (`[^1]`), TeX math (`$…$`, `$$…$$`, KaTeX), and ` ```mermaid ` diagrams — all self-hosted and lazy-loaded only on pages that use them."
- In the reading-UI bullet, add "per-note **last updated** dates (from git history)".
- In the Sharing & SEO bullet, add: "auto-generated **og:image** social cards, `robots.txt`, canonical URLs, favicon + web manifest, and a print stylesheet. The homepage lists **recently updated** notes."

- [ ] **Step 2: Full verification**

```bash
python -m pytest
python build.py --vault vault --out dist --site-url https://example.com --title "My Notes"
```

Expected: all tests pass; build prints no new warnings (besides any pre-existing ones). Spot-check `dist/`: `robots.txt`, `site.webmanifest`, `og/`, `apple-touch-icon.png`, favicon link in HTML, light/dark toggle works via `--serve`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document theme toggle, syntax extras, freshness and sharing features"
```

---

## Known limitations (accepted in the spec)

- Footnote anchor ids can collide when a note transcludes another note that also uses footnotes (both emit `#fn1`). Cosmetic; out of scope.
- Social cards use one fixed dark template; no per-note artwork.
- Math is rendered client-side only (no-JS readers see raw TeX).
