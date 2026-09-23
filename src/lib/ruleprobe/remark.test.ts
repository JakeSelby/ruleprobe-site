import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { designDocs, readDesignDoc } from './design.ts';
import { VENDOR } from './paths.ts';
import { composePages, readReadme } from './readme.ts';
import { remarkEscapeAngle, remarkLiftTitle, remarkRuleprobeLinks } from './remark.ts';

async function render(md: string, repoPath: string) {
  const file = { path: path.join(VENDOR, repoPath), value: md, data: {} as Record<string, unknown> };
  const out = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkEscapeAngle)
    .use(remarkLiftTitle)
    .use(remarkRuleprobeLinks)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(file as never);
  const frontmatter = ((file.data as { astro?: { frontmatter?: Record<string, unknown> } }).astro?.frontmatter) ?? {};
  return { html: String(out), frontmatter };
}

const decode = (html: string) => html.replace(/&#x3C;|&lt;/g, '<').replace(/&#x3E;|&gt;/g, '>');

describe('the markdown pipeline', () => {
  it('lifts the H1 into frontmatter and drops it from the body', async () => {
    const { html, frontmatter } = await render('# Changelog\n\nBody text.\n\n## 0.1.0\n', 'CHANGELOG.md');
    expect(frontmatter.title).toBe('Changelog');
    expect(html).not.toContain('<h1');
    expect(html).toContain('<h2>0.1.0</h2>');
  });

  it('keeps bare placeholders like <reason> as visible text', async () => {
    const { html } = await render('Its front matter carries `opt_out: <reason>`, and <dir> is yours.\n', 'README.md');
    expect(decode(html)).toContain('<dir>');
    expect(html).not.toContain('<dir>');
  });
});

// What the site renders from the pin: each README page, the changelog and every design document.
const bodies: [string, string, string][] = [
  ...Object.values(composePages(readReadme())).map((p): [string, string, string] => [`README.md (${p.def.key})`, 'README.md', p.markdown]),
  ...(fs.existsSync(path.join(VENDOR, 'CHANGELOG.md'))
    ? [['CHANGELOG.md', 'CHANGELOG.md', fs.readFileSync(path.join(VENDOR, 'CHANGELOG.md'), 'utf8')] as [string, string, string]]
    : []),
  ...designDocs().map((d): [string, string, string] => [d.sourcePath, d.sourcePath, readDesignDoc(d).body]),
];

describe('everything the site renders from the pin', () => {
  it('is a non-trivial list', () => {
    expect(bodies.length).toBeGreaterThanOrEqual(5);
  });

  it.each(bodies)('%s renders without dropping placeholders or leaving .md links', async (_label, repoPath, md) => {
    const { html } = await render(md, repoPath);
    expect(html.length).toBeGreaterThan(0);
    // No link may still point at a markdown file inside the repository.
    for (const m of html.matchAll(/href="([^"]+)"/g)) {
      const href = m[1];
      if (/^https?:/.test(href) || href.startsWith('#')) continue;
      expect(href, `${repoPath} links to ${href}`).not.toMatch(/\.md(#|$)/);
    }
    // Every bare <word> written in prose survives as visible text. An HTML comment is
    // not prose: it renders to nothing by design, placeholders and all.
    const prose = md.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '').replace(/<!--[\s\S]*?-->/g, '');
    const decoded = decode(html);
    for (const m of prose.matchAll(/<([a-z][\w-]*)>/g)) {
      expect(decoded, `${repoPath} dropped <${m[1]}>`).toContain(`<${m[1]}>`);
    }
  });
});
