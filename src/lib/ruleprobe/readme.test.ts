import { describe, expect, it } from 'vitest';
import {
  PAGES,
  SECTION_MAP,
  Slugger,
  anchorRoutes,
  composePages,
  headingText,
  plainText,
  readReadme,
  sectionAnchors,
  skippedSections,
  splitReadme,
  unmappedHeadings,
} from './readme.ts';

// The shape of ruleprobe's README, small: an H1, a headline, a lead, and H2 sections, one of
// which quotes a rule file whose own `# heading` sits inside a fence.
const README = [
  '# ruleprobe',
  '',
  'Find out which of your agent rules actually fire.',
  '',
  'You have written rules for your coding agent. A `CLAUDE.md`, an `AGENTS.md`.',
  'ruleprobe reads the transcripts.',
  '',
  '## Sixty seconds',
  '',
  '```sh',
  'uvx ruleprobe report',
  '```',
  '',
  '## Sixty seconds on a rule of your own',
  '',
  '```markdown',
  '---',
  'rule: house-style',
  '---',
  '',
  '# House style',
  '',
  '## Not a section either',
  '```',
  '',
  'Point `--rules` at your rules.',
  '',
  '## Writing a detector',
  '',
  '### A tool use',
  '',
  'An entry is `id`, `rule`, `event`.',
  '',
  '## What it actually covers',
  '',
  'See [How good are the detectors?](#how-good-are-the-detectors) below, and [writing one](#writing-a-detector).',
  '',
  '## How good are the detectors?',
  '',
  'A labelled corpus ships inside the package.',
  '',
  '## How it is put together',
  '',
  '- `ruleprobe/events.py`',
  '',
  '## Development',
  '',
  '```sh',
  'python3 -m unittest discover -s tests',
  '```',
  '',
  '## Contributing and releases',
  '',
  'Open an issue first.',
  '',
  '## Origins and neighbours',
  '',
  'MIT licensed.',
  '',
].join('\n');

describe('splitting the README', () => {
  const readme = splitReadme(README);

  it('takes the name, the headline and the lead from above the first H2', () => {
    expect(readme.name).toBe('ruleprobe');
    expect(readme.headline).toBe('Find out which of your agent rules actually fire.');
    expect(readme.lead).toBe('You have written rules for your coding agent. A `CLAUDE.md`, an `AGENTS.md`.\nruleprobe reads the transcripts.');
  });

  it('splits at H2s outside fences only', () => {
    expect(readme.sections.map((s) => s.heading)).toEqual([
      'Sixty seconds',
      'Sixty seconds on a rule of your own',
      'Writing a detector',
      'What it actually covers',
      'How good are the detectors?',
      'How it is put together',
      'Development',
      'Contributing and releases',
      'Origins and neighbours',
    ]);
    const rule = readme.sections[1];
    expect(rule.body).toContain('# House style');
    expect(rule.body).toContain('## Not a section either');
    expect(rule.subheadings).toEqual([]);
    expect(readme.sections[2].subheadings).toEqual([{ depth: 3, text: 'A tool use' }]);
  });

  it('refuses a README without an H1 or without a line under it', () => {
    expect(() => splitReadme('## Only a section\n')).toThrow(/no H1/);
    expect(() => splitReadme('# ruleprobe\n\n## Sixty seconds\n')).toThrow(/no line under its H1/);
  });

  it('closes a fence only on the same character, at least as long', () => {
    const md = '# x\n\nline\n\n## A\n\n````md\n```\n## Inside\n```\n````\n\n## B\n\nb\n';
    expect(splitReadme(md).sections.map((s) => s.heading)).toEqual(['A', 'B']);
  });
});

describe('the section map', () => {
  it('maps every H2 of the README at the pin', () => {
    const readme = readReadme();
    expect(readme.sections.length).toBeGreaterThan(3);
    expect(unmappedHeadings(readme)).toEqual([]);
  });

  it('gives every page at the pin a non-empty body and a title', () => {
    const pages = composePages(readReadme());
    for (const page of Object.values(pages)) {
      expect(page.markdown.trim().length, page.def.key).toBeGreaterThan(100);
      expect(page.title.length, page.def.key).toBeGreaterThan(0);
    }
  });

  it('fails on an H2 the map does not know, naming it', () => {
    const readme = splitReadme(README.replace('## Development', '## Hacking on it'));
    expect(unmappedHeadings(readme)).toEqual(['Hacking on it']);
    expect(() => composePages(readme)).toThrow(/"Hacking on it".*SECTION_MAP/);
  });

  it('fails when a page loses every section', () => {
    const readme = splitReadme(README.replace('## Development', '## Contributing'));
    expect(() => composePages(readme, { ...SECTION_MAP, Contributing: 'skip' })).toThrow(/Install page/);
  });

  it('composes pages in README order, lifting a lone section heading into the title', () => {
    const pages = composePages(splitReadme(README));
    expect(pages.home.markdown).toMatch(/^## Sixty seconds\n[\s\S]*## What it actually covers[\s\S]*## Origins and neighbours/);
    expect(pages.home.markdown).not.toContain('Contributing');
    expect(pages.detectors.sections.map((s) => s.heading)).toEqual([
      'Sixty seconds on a rule of your own',
      'Writing a detector',
      'How it is put together',
    ]);
    expect(pages.validity.title).toBe('How good are the detectors?');
    expect(pages.validity.markdown).toBe('A labelled corpus ships inside the package.');
    expect(pages.install.title).toBe(PAGES.install.label);
  });
});

describe('anchors', () => {
  const readme = splitReadme(README);
  const routes = anchorRoutes(readme, composePages(readme));

  it('sends a README anchor to the page that holds the section', () => {
    expect(routes.get('how-good-are-the-detectors')).toBe('/validity/');
    expect(routes.get('writing-a-detector')).toBe('/detectors/#writing-a-detector');
    expect(routes.get('a-tool-use')).toBe('/detectors/#a-tool-use');
    expect(routes.get('sixty-seconds')).toBe('/#sixty-seconds');
    expect(routes.get('development')).toBe('/install/#development');
  });

  it('has no route for a skipped section, which the footer links on GitHub instead', () => {
    expect(routes.has('contributing-and-releases')).toBe(false);
    expect(skippedSections(readme)).toEqual([{ heading: 'Contributing and releases', anchor: 'contributing-and-releases' }]);
    expect(sectionAnchors(readme).get('How good are the detectors?')).toBe('how-good-are-the-detectors');
  });

  it('slugs as github-slugger does, repeats included', () => {
    const s = new Slugger();
    expect(s.slug('How good are the detectors?')).toBe('how-good-are-the-detectors');
    expect(s.slug('The `--rules` flag')).toBe('the---rules-flag');
    expect(s.slug('Origins & neighbours')).toBe('origins--neighbours');
    expect(s.slug('Example')).toBe('example');
    expect(s.slug('Example')).toBe('example-1');
    expect(s.slug('Example')).toBe('example-2');
    expect(s.slug('0.1.0 (2026-09-22)')).toBe('010-2026-09-22');
  });

  it('reads heading text the way a reader sees it', () => {
    expect(headingText('The [`report`](x.md) **command**')).toBe('The report command');
    expect(plainText('A `CLAUDE.md`,\nan [AGENTS.md](a.md).')).toBe('A CLAUDE.md, an AGENTS.md.');
  });
});
