# brand

The sources of ruleprobe's mark and Open Graph card. This directory is not served; it exists so
the files in `public/` can be re-rendered rather than re-drawn.

- `mark.svg` is the probe mark: a rule, and a probe about to touch it. The site header draws the
  same shapes inline, coloured from the tokens in `src/styles/global.css`.
- `og-card.html` is the card served at `/og.png`, 1200x630. Its tagline is the headline of
  ruleprobe's README at the pinned tag, and its chips name the transcripts ruleprobe reads.
- `render.py` writes `public/favicon.svg`, `public/favicon.ico` (16 and 32),
  `public/apple-touch-icon.png` (180) and `public/og.png` (1200x630), and asserts each size.

The card loads IBM Plex Mono, IBM Plex Sans and Bricolage Grotesque from Google Fonts at render
time, as the site's own layout does, so no font software is bundled or redistributed here. Only
the rendered files ship.

Regenerate with `python3 brand/render.py`, which needs network access, Pillow, and Google Chrome
at the path it names. Re-render and commit `public/` whenever the README headline or the list of
readers changes; `src/lib/ruleprobe/brand.test.ts` fails on a stale headline.
