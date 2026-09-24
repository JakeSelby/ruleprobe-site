import fs from 'node:fs';
import { VENDOR, vendorFile } from './paths.ts';

/** The pages the README is split across. The design pages and the changelog are not README. */
export type PageKey = 'home' | 'install' | 'detectors' | 'validity';

export interface PageDef {
  key: PageKey;
  route: string;
  /** The label in the navigation, the breadcrumb and the pager. */
  label: string;
  description: string;
  /** A page with one README section takes that section's heading as its own title. */
  liftTitle: boolean;
}

export const PAGES: Record<PageKey, PageDef> = {
  home: {
    key: 'home',
    route: '/',
    label: 'Overview',
    description: '',
    liftTitle: false,
  },
  install: {
    key: 'install',
    route: '/install/',
    label: 'Install',
    description: 'Run ruleprobe with uvx, install it with pipx or pip, or work on it from a clone.',
    liftTitle: false,
  },
  detectors: {
    key: 'detectors',
    route: '/detectors/',
    label: 'Detectors',
    description: 'Measure a rule of your own: write a detector as data or as Python, and see how the package is put together.',
    liftTitle: false,
  },
  validity: {
    key: 'validity',
    route: '/validity/',
    label: 'Validity',
    description: 'How each shipped detector scores against the hand-labelled corpus in the package, and what that number does not claim.',
    liftTitle: true,
  },
};

/**
 * Every H2 of the README, assigned to the page that renders it or to `skip`. An H2 missing
 * here fails the build and `readme.test.ts`, so a README change can never drop content from
 * the site silently: map the new heading here, then repin. Entries for headings the pin does
 * not carry are allowed, so the map can be ready before the release that adds them.
 */
export const SECTION_MAP: Readonly<Record<string, PageKey | 'skip'>> = {
  'Sixty seconds': 'home',
  'Sixty seconds on a rule of your own': 'detectors',
  'Writing a detector': 'detectors',
  'What it actually covers': 'home',
  'Why did that fire?': 'home',
  'How good are the detectors?': 'validity',
  'How it is put together': 'detectors',
  'The public API': 'detectors',
  Versioning: 'detectors',
  Development: 'install',
  'Origins and neighbours': 'home',
  // The maintainer's own process; the footer links it on GitHub.
  'Contributing and releases': 'skip',
};

export interface Heading {
  depth: number;
  text: string;
}

export interface Section {
  heading: string;
  /** The section's markdown after its `## ` line, headings below H2 included. */
  body: string;
  /** Headings inside the body, fences excluded, in order. */
  subheadings: Heading[];
}

export interface Readme {
  /** The H1: the package name. */
  name: string;
  /** The first paragraph under the H1: the one-line pitch. */
  headline: string;
  /** The rest of the text above the first H2, as markdown. */
  lead: string;
  sections: Section[];
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const ATX = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
/** Lines that start a block of their own, so an underline below them is not a setext heading. */
const NOT_PARAGRAPH = /^( {0,3}([-*+]|\d+[.)])([ \t]|$)| {0,3}>| {0,3}<| {4}|\t)/;

interface LineInfo {
  fenced: boolean;
  /** Set on the first line of a heading. */
  heading: Heading | null;
  /** A setext underline, or a later line of a multi-line setext heading: neither is body text. */
  consumed: boolean;
}

/**
 * Walk markdown lines once and say, for each, whether it sits in a fenced code block and whether
 * it is a heading: ATX (`## Text`) or setext (text underlined with `===` or `---`). A fence closes
 * on a line of the same character, at least as long, with nothing after it. A setext heading is the
 * paragraph directly above its underline, which is how CommonMark reads it.
 */
function scan(lines: string[]): LineInfo[] {
  const info: LineInfo[] = [];
  let fence: string | null = null;
  lines.forEach((line) => {
    if (fence !== null) {
      info.push({ fenced: true, heading: null, consumed: false });
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      return;
    }
    const open = FENCE_OPEN.exec(line);
    if (open) {
      fence = open[1];
      info.push({ fenced: true, heading: null, consumed: false });
      return;
    }
    const atx = ATX.exec(line);
    info.push({ fenced: false, heading: atx ? { depth: atx[1].length, text: atx[2] } : null, consumed: false });
  });
  lines.forEach((line, i) => {
    const under = SETEXT.exec(line);
    if (!under || info[i].fenced || info[i].heading || i === 0) return;
    let top = i;
    while (
      top > 0 &&
      lines[top - 1].trim() !== '' &&
      !info[top - 1].fenced &&
      !info[top - 1].heading &&
      !info[top - 1].consumed &&
      !SETEXT.test(lines[top - 1]) &&
      !NOT_PARAGRAPH.test(lines[top - 1])
    ) {
      top--;
    }
    if (top === i) return;
    const text = lines.slice(top, i).map((l) => l.trim()).join(' ');
    info[top].heading = { depth: under[1][0] === '=' ? 1 : 2, text };
    for (let j = top + 1; j <= i; j++) info[j].consumed = true;
  });
  return info;
}

export function headingsIn(markdown: string): Heading[] {
  return scan(markdown.split('\n')).flatMap((l) => (l.heading ? [l.heading] : []));
}

const trimBlank = (text: string) => text.replace(/^\s*\n/, '').replace(/\s+$/, '');

/** Split README markdown at its H2s, outside fenced code, which a `# heading` in an example is. */
export function splitReadme(markdown: string): Readme {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const info = scan(lines);
  let name = '';
  const preamble: string[] = [];
  const sections: { heading: string; lines: string[] }[] = [];
  // A setext underline, or a continuation line of its heading, goes wherever its heading went:
  // dropped when the heading became the name or a section, kept when it stays in a body.
  let taken = false;
  const body = () => (sections.length ? sections[sections.length - 1].lines : preamble);
  lines.forEach((line, i) => {
    const { heading: h, consumed } = info[i];
    if (consumed) {
      if (!taken) body().push(line);
      return;
    }
    taken = false;
    if (h && h.depth === 2) {
      sections.push({ heading: h.text, lines: [] });
      taken = true;
    } else if (!sections.length && h && h.depth === 1 && !name) {
      name = h.text;
      taken = true;
    } else {
      body().push(line);
    }
  });
  if (!name) throw new Error('README.md has no H1');
  const paragraphs = trimBlank(preamble.join('\n')).split(/\n\s*\n/);
  const headline = (paragraphs.shift() ?? '').replace(/\s*\n\s*/g, ' ').trim();
  if (!headline) throw new Error('README.md has no line under its H1');
  return {
    name,
    headline,
    lead: paragraphs.join('\n\n').trim(),
    sections: sections.map((s) => {
      const body = trimBlank(s.lines.join('\n'));
      return { heading: s.heading, body, subheadings: headingsIn(body) };
    }),
  };
}

/** Headings in the README whose H2 has no entry in `SECTION_MAP`, in README order. */
export function unmappedHeadings(readme: Readme, map = SECTION_MAP): string[] {
  return readme.sections.map((s) => s.heading).filter((h) => !(h in map));
}

/**
 * A heading's text as a reader sees it: link targets, code ticks, emphasis and strikethrough
 * markers, inline HTML, backslash escapes and the common entities gone. The slug is taken from
 * this, as Astro and GitHub both take it from the rendered text.
 */
export function headingText(markdown: string): string {
  // An escaped character is literal text, so it is set aside before any marker is stripped.
  const escaped: string[] = [];
  return markdown
    .replace(/\\([!-/:-@[-`{-~])/g, (_, c: string) => `\uE000${escaped.push(c) - 1}\uE001`)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`+([^`]*)`+/g, '$1')
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .replace(/(\*{1,3})(\S(?:.*?\S)?)\1/g, '$2')
    .replace(/(^|[^\p{L}\p{N}_])(_{1,3})(\S(?:.*?\S)?)\2(?=[^\p{L}\p{N}_]|$)/gu, '$1$3')
    .replace(/~~(\S(?:.*?\S)?)~~/g, '$1')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' })[e]!)
    .replace(/\uE000(\d+)\uE001/g, (_, i: string) => escaped[Number(i)])
    .trim();
}

/**
 * The github-slugger algorithm, which is what Astro and GitHub both use for heading ids:
 * lower-case, drop everything that is not a letter, mark, number, connector, space or hyphen,
 * then turn each space into a hyphen. A repeat gains `-1`, `-2`, … within one document.
 */
export class Slugger {
  #seen = new Map<string, number>();

  slug(text: string): string {
    const base = headingText(text).toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-');
    let slug = base;
    let n = this.#seen.get(base) ?? 0;
    while (this.#seen.has(slug)) slug = `${base}-${++n}`;
    this.#seen.set(base, n);
    this.#seen.set(slug, 0);
    return slug;
  }
}

export interface Page {
  def: PageDef;
  /** The title the page renders: the lifted section heading, or the page's own label. */
  title: string;
  /** The markdown the page renders from the README, in README order. */
  markdown: string;
  sections: Section[];
}

/**
 * Compose each page's markdown from its sections. Throws on an unmapped H2, which is what fails
 * a repin to a README the site has not been taught yet.
 */
export function composePages(readme: Readme, map = SECTION_MAP): Record<PageKey, Page> {
  const unmapped = unmappedHeadings(readme, map);
  if (unmapped.length) {
    throw new Error(
      `README.md has H2s the site does not map: ${unmapped.map((h) => JSON.stringify(h)).join(', ')}. ` +
        'Add each to SECTION_MAP in src/lib/ruleprobe/readme.ts.',
    );
  }
  const pages = {} as Record<PageKey, Page>;
  for (const def of Object.values(PAGES)) {
    const sections = readme.sections.filter((s) => map[s.heading] === def.key);
    if (!sections.length) throw new Error(`No README section maps to the ${def.label} page`);
    if (def.liftTitle && sections.length !== 1) {
      throw new Error(`The ${def.label} page takes its title from one section, and ${sections.length} map to it`);
    }
    const lifted = def.liftTitle ? sections[0] : null;
    const markdown = lifted
      ? lifted.body
      : sections.map((s) => `## ${s.heading}\n\n${s.body}`).join('\n\n');
    pages[def.key] = { def, title: lifted ? headingText(lifted.heading) : def.label, markdown, sections };
  }
  return pages;
}

/**
 * Where each README anchor lands on the site. The key is the slug GitHub gives the heading in
 * README.md; the value is the page holding it, with the page's own slug for it, or the page alone
 * when the heading became that page's title. A section the site skips goes to `offsite`, the
 * README on GitHub, when one is given. GitHub numbers repeats across the whole file, the lead's
 * headings included, so every heading is slugged in order even where it maps nowhere.
 */
export function anchorRoutes(readme: Readme, pages: Record<PageKey, Page>, offsite: string | null = null): Map<string, string> {
  const onGitHub = new Slugger();
  const routes = new Map<string, string>();
  onGitHub.slug(readme.name);
  for (const h of headingsIn(readme.lead)) onGitHub.slug(h.text);
  const onPage = new Map<PageKey, Slugger>();
  for (const section of readme.sections) {
    const key = SECTION_MAP[section.heading];
    const github = onGitHub.slug(section.heading);
    const deeper = section.subheadings.map((h) => onGitHub.slug(h.text));
    if (key === 'skip' || !key) {
      if (offsite) [github, ...deeper].forEach((slug) => routes.set(slug, `${offsite}#${slug}`));
      continue;
    }
    const page = pages[key];
    const slugger = onPage.get(key) ?? new Slugger();
    onPage.set(key, slugger);
    if (page.def.liftTitle) {
      routes.set(github, page.def.route);
    } else {
      routes.set(github, `${page.def.route}#${slugger.slug(section.heading)}`);
    }
    section.subheadings.forEach((h, i) => routes.set(deeper[i], `${page.def.route}#${slugger.slug(h.text)}`));
  }
  return routes;
}

/** GitHub's anchor for each H2 of the README, keyed by heading. */
export function sectionAnchors(readme: Readme): Map<string, string> {
  const slugger = new Slugger();
  slugger.slug(readme.name);
  for (const h of headingsIn(readme.lead)) slugger.slug(h.text);
  const out = new Map<string, string>();
  for (const section of readme.sections) {
    out.set(section.heading, slugger.slug(section.heading));
    for (const h of section.subheadings) slugger.slug(h.text);
  }
  return out;
}

/** The README's sections the site does not render, which the footer links on GitHub instead. */
export function skippedSections(readme: Readme, map = SECTION_MAP): { heading: string; anchor: string }[] {
  const anchors = sectionAnchors(readme);
  return readme.sections
    .filter((s) => map[s.heading] === 'skip')
    .map((s) => ({ heading: headingText(s.heading), anchor: anchors.get(s.heading)! }));
}

/** Markdown to the plain text a meta description or a card carries. */
export function plainText(markdown: string): string {
  return headingText(markdown.replace(/\s*\n\s*/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function readReadme(root = VENDOR): Readme {
  return splitReadme(fs.readFileSync(vendorFile('README.md', root), 'utf8'));
}
