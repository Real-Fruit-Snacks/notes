# Pocket-Bird (vendored)

A pixel-art bird that lives on the site. https://github.com/IdreesInc/Pocket-Bird

- `birb.embed.js` — the web embed build, from commit
  `1ba0d76cff932d29d0ba60c87f1a533c1080551f` (main, 2026-05-25) at
  `dist/web/birb.embed.js`. License: MPL-2.0 (see `LICENSE`).
  **Local modification** (MPL-2.0 §3.2; this modified file remains under
  MPL-2.0): the `MONOCRAFT_URL` constant is patched from the upstream
  jsDelivr URL to the same-origin vendored copy below, using the site's
  `<body data-base-url>` prefix — this site loads nothing from CDNs.
- `Monocraft.otf` — the Monocraft font the bird's UI uses, from
  https://github.com/IdreesInc/Monocraft at commit
  `99b32ab40612ff2533a69d8f14bd8b3d9e604456` (the exact ref upstream
  Pocket-Bird points at). License: SIL OFL 1.1 (see `MONOCRAFT-LICENSE`).

The script stores its save data in `localStorage` under `birbSaveData` and
makes no network requests beyond the font above. The remaining external URLs
inside it are `<a href>` Wikipedia links on collected bird species — user
navigation, not resource loads.

Loading is gated on `prefers-reduced-motion: no-preference` in
`templates/base.html`. To update: re-download `dist/web/birb.embed.js` at a
pinned commit, re-apply the `MONOCRAFT_URL` patch (the
`test_pocket_bird_vendored` test fails if it's forgotten), and refresh the
commit hashes here.
