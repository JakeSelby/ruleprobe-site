import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { isExternalHref, resolveRelative, routeForRepoPath, vendorLinkContext, type LinkContext } from './links.ts';
import { remarkRuleprobeLinks } from './remark.ts';

const FILES = new Set([
  'README.md',
  'CHANGELOG.md',
  'docs/releasing.md',
  'ruleprobe/matchers.py',
  'docs/rules/house-style.md',
  '_bmad-output/planning-artifacts/prds/p/prd.md',
  '_bmad-output/planning-artifacts/prds/p/addendum.md',
  '_bmad-output/planning-artifacts/prds/p/validation-report.md',
]);
const DIRS = new Set(['docs', 'docs/rules', 'ruleprobe', '_bmad-output/planning-artifacts/prds/p']);

const ctx: LinkContext = {
  tag: 'v0.2.0',
  exists: (rel) => FILES.has(rel) || DIRS.has(rel),
  isDir: (rel) => DIRS.has(rel),
  readmeAnchors: new Map([
    ['how-good-are-the-detectors', '/validity/'],
    ['writing-a-detector', '/detectors/#writing-a-detector'],
  ]),
  designRoutes: new Map([
    ['_bmad-output/planning-artifacts/prds/p/prd.md', '/design/prds/p/'],
    ['_bmad-output/planning-artifacts/prds/p/addendum.md', '/design/prds/p/addendum/'],
  ]),
};

async function render(md: string, repoPath: string): Promise<string> {
  const out = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRuleprobeLinks, { context: () => ctx, repoPath })
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(md);
  return String(out);
}

describe('resolving a link', () => {
  it('resolves against the file that carries it and refuses to leave the repository', () => {
    expect(resolveRelative('_bmad-output/planning-artifacts/briefs/b/addendum.md', '../../prds/p/prd.md#goals')).toEqual({
      rel: '_bmad-output/planning-artifacts/prds/p/prd.md',
      suffix: '#goals',
    });
    expect(resolveRelative('README.md', 'docs/rules/')).toEqual({ rel: 'docs/rules', suffix: '' });
    expect(resolveRelative('README.md', '../elsewhere.md')).toBeNull();
    expect(resolveRelative('README.md', '#anchor')).toBeNull();
  });

  it('leaves absolute URLs, anchors and site paths to the caller', () => {
    for (const href of ['https://example.test/', 'mailto:a@b.test', '#x', '/install/']) expect(isExternalHref(href)).toBe(true);
    expect(isExternalHref('docs/rules/')).toBe(false);
  });
});

describe('mapping a repo path', () => {
  it('sends the README and the changelog to their pages', () => {
    expect(routeForRepoPath('README.md', '', ctx)).toBe('/');
    expect(routeForRepoPath('README.md', '#how-good-are-the-detectors', ctx)).toBe('/validity/');
    expect(routeForRepoPath('README.md', '#no-such-heading', ctx)).toBe('/#no-such-heading');
    expect(routeForRepoPath('CHANGELOG.md', '#020', ctx)).toBe('/changelog/#020');
  });

  it('sends a published design document to its page, and working material to GitHub at the tag', () => {
    expect(routeForRepoPath('_bmad-output/planning-artifacts/prds/p/prd.md', '#goals', ctx)).toBe('/design/prds/p/#goals');
    expect(routeForRepoPath('_bmad-output/planning-artifacts/prds/p/validation-report.md', '', ctx)).toBe(
      'https://github.com/JakeSelby/ruleprobe/blob/v0.2.0/_bmad-output/planning-artifacts/prds/p/validation-report.md',
    );
  });

  it('links any other file as a blob and a directory as a tree, and a missing path nowhere', () => {
    expect(routeForRepoPath('ruleprobe/matchers.py', '', ctx)).toBe('https://github.com/JakeSelby/ruleprobe/blob/v0.2.0/ruleprobe/matchers.py');
    expect(routeForRepoPath('docs/rules', '', ctx)).toBe('https://github.com/JakeSelby/ruleprobe/tree/v0.2.0/docs/rules');
    expect(routeForRepoPath('docs/missing.md', '', ctx)).toBeNull();
    expect(routeForRepoPath('', '', ctx)).toBeNull();
  });
});

describe('the link rewriter in the markdown pipeline', () => {
  it('sends a README anchor to the page that now holds the section', async () => {
    const html = await render('See [How good](#how-good-are-the-detectors) and [writing](#writing-a-detector).', 'README.md');
    expect(html).toContain('href="/validity/"');
    expect(html).toContain('href="/detectors/#writing-a-detector"');
  });

  it('leaves an anchor alone outside the README, where it points into the same document', async () => {
    const html = await render('[Goals](#goals)', '_bmad-output/planning-artifacts/prds/p/prd.md');
    expect(html).toContain('href="#goals"');
  });

  it('rewrites relative links, reference definitions included', async () => {
    const html = await render(
      '[prd](../../prds/p/prd.md), [releasing](../../../../docs/releasing.md) and [addendum][a].\n\n[a]: ../../prds/p/addendum.md\n',
      '_bmad-output/planning-artifacts/briefs/b/brief.md',
    );
    expect(html).toContain('href="/design/prds/p/"');
    expect(html).toContain('href="https://github.com/JakeSelby/ruleprobe/blob/v0.2.0/docs/releasing.md"');
    expect(html).toContain('href="/design/prds/p/addendum/"');
  });

  it('keeps an unplaceable README anchor as a fragment on the overview, where smoke fails it', async () => {
    const html = await render('[gone](#renamed-heading)', 'README.md');
    expect(html).toContain('href="/#renamed-heading"');
  });

  it('renders a link that leaves the repository as its text', async () => {
    const html = await render('See [a sibling](../other/README.md).', 'README.md');
    expect(html).toContain('See a sibling.');
    expect(html).not.toContain('href');
  });

  it('serves a relative image from GitHub at the tag, and leaves an absolute one alone', async () => {
    const html = await render('![rules](docs/rules/house-style.md) ![x](https://example.test/x.png)', 'README.md');
    expect(html).toContain('src="https://raw.githubusercontent.com/JakeSelby/ruleprobe/v0.2.0/docs/rules/house-style.md"');
    expect(html).toContain('src="https://example.test/x.png"');
  });

  it('renders a link to a file the tag does not carry as its text', async () => {
    const html = await render('Read [the old notes](docs/old.md) first.', 'README.md');
    expect(html).toContain('Read the old notes first.');
    expect(html).not.toContain('href');
  });

  it('leaves absolute links alone', async () => {
    const html = await render('[agent-harness](https://github.com/JakeSelby/agent-harness)', 'README.md');
    expect(html).toContain('href="https://github.com/JakeSelby/agent-harness"');
  });
});

describe('the context for the pin', () => {
  it('knows the pinned tag and where the README sections went', () => {
    const pinned = vendorLinkContext();
    expect(pinned.tag).toMatch(/^v\d+\.\d+\.\d+/);
    expect(pinned.readmeAnchors.get('how-good-are-the-detectors')).toBe('/validity/');
    expect(pinned.exists('README.md')).toBe(true);
  });
});
