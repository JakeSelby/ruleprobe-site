import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { VENDOR } from './paths.ts';
import { plainText, readReadme } from './readme.ts';

// The Open Graph card is a rendered PNG, so nothing rebuilds it when the pinned README changes.
// These tests tie its words to the README at the pin: a release that moves the headline fails the
// gate here, and the fix is to edit brand/og-card.html and the alt text, then run brand/render.py.
const ROOT = path.dirname(path.dirname(VENDOR));
const card = fs.readFileSync(path.join(ROOT, 'brand', 'og-card.html'), 'utf8');
const layout = fs.readFileSync(path.join(ROOT, 'src', 'layouts', 'Layout.astro'), 'utf8');
const readme = readReadme();
const headline = plainText(readme.headline);

const text = (html: string) => html.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const one = (source: string, re: RegExp) => {
  const m = re.exec(source);
  expect(m, `${re} matches nothing`).not.toBeNull();
  return m![1];
};

const tagline = text(one(card, /<div class="tag">([\s\S]*?)<\/div>/));
const cardName = text(one(card, /<h1>([\s\S]*?)<\/h1>/));
const chips = [...card.matchAll(/<div class="chip">([^<]+)<\/div>/g)].map((m) => m[1]);
const alt = one(layout, /<meta property="og:image:alt" content="([^"]+)"/);
const list = (items: string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

describe('the Open Graph card', () => {
  it('carries the README headline at the pin as its tagline', () => {
    expect(headline.length).toBeGreaterThan(0);
    expect(tagline).toBe(headline);
  });

  it('names the package the README names', () => {
    expect(cardName).toBe(readme.name);
  });

  it('names the readers the alt text names', () => {
    expect(chips).toEqual(['Claude Code', 'Codex', 'Gemini CLI']);
    expect(alt.endsWith(`Reads the transcripts of ${list(chips)}.`)).toBe(true);
  });
});

describe('the og:image:alt text', () => {
  it('reads as the card does: the name, the README headline, then the readers', () => {
    expect(alt.startsWith(`${readme.name}. ${headline} `)).toBe(true);
  });

  it('would fail on a headline the README no longer carries', () => {
    const stale = `${readme.name}. Find out which rules fire. Reads the transcripts of Claude Code and Codex.`;
    expect(stale.startsWith(`${readme.name}. ${headline} `)).toBe(false);
  });

  it('carries no em dash', () => {
    expect(alt).not.toContain('\u2014');
  });
});
