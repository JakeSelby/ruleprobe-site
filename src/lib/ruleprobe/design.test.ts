import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PLANNING, designDocs, designId, designLabels, firstH1, isPublished, readDesignDoc, splitFrontmatter } from './design.ts';

// A planning directory shaped like ruleprobe's on main after 0.1.0, with the working material the
// site must never publish beside each document.
const TREE: Record<string, string> = {
  '.memlog.md': '# memlog\n',
  'research/competitive-x-2026-09-23/research.md': "---\ntitle: 'competitive research: x'\n---\n\n# Research: x\n\nBody.\n",
  'research/competitive-x-2026-09-23/.memlog.md': 'log\n',
  'research/competitive-x-2026-09-23/.staleness-claims.json': '{}\n',
  'research/competitive-x-2026-09-23/digests/agnix.md': '# digest\n',
  'research/competitive-x-2026-09-23/imports/SOURCES.md': '# sources\n',
  'briefs/brief-ruleprobe-2026-09-23/brief.md': '---\ntitle: "Product Brief: ruleprobe"\ninputs:\n  - README.md\n---\n\n# Product Brief: ruleprobe\n',
  'briefs/brief-ruleprobe-2026-09-23/addendum.md': '---\ntitle: "Product Brief addendum: ruleprobe"\n---\n\n# Addendum\n',
  'briefs/brief-ruleprobe-2026-09-23/review.md': '# review\n',
  'prds/prd-ruleprobe-2026-09-23/prd.md': '---\ntitle: "PRD: ruleprobe"\n---\n\n# PRD: ruleprobe\n',
  'prds/prd-ruleprobe-2026-09-23/addendum.md': '# Addendum: ruleprobe PRD\n',
  'prds/prd-ruleprobe-2026-09-23/validation-report.md': '# validation\n',
  'architecture-spines/architecture-ruleprobe-2026-09-23/ARCHITECTURE-SPINE.md': "---\nname: 'ruleprobe'\n---\n\n# Architecture spine: ruleprobe\n",
  'architecture-spines/architecture-ruleprobe-2026-09-23/reviews/review-adversarial.md': '# review\n',
  'architecture-spines/architecture-ruleprobe-2026-09-23/validation-report.md': '# validation\n',
  'epics.md': '---\ntitle: "Epics and stories: ruleprobe 0.2.0"\n---\n\n# Epics\n',
  'implementation-readiness-2026-09-23.md': "---\ntitle: 'Implementation readiness: ruleprobe 0.2.0'\n---\n\n# Readiness\n",
};

const roots: string[] = [];
function fixture(tree: Record<string, string> | null): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ruleprobe-design-'));
  roots.push(root);
  for (const [rel, text] of Object.entries(tree ?? {})) {
    const abs = path.join(root, PLANNING, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  }
  return root;
}
afterAll(() => roots.forEach((r) => fs.rmSync(r, { recursive: true, force: true })));

describe('the design allowlist', () => {
  it('publishes the main documents and their addenda', () => {
    for (const rel of [
      'research/x-2026/research.md',
      'briefs/b/brief.md',
      'briefs/b/addendum.md',
      'prds/p/prd.md',
      'prds/p/addendum.md',
      'architecture-spines/a/ARCHITECTURE-SPINE.md',
      'epics.md',
      'implementation-readiness-2026-09-23.md',
    ]) {
      expect(isPublished(rel), rel).toBe(true);
    }
  });

  it('never publishes a dotfile, a digest, an import, a review or a validation report', () => {
    for (const rel of [
      '.memlog.md',
      'prds/p/.memlog.md',
      'research/x/.staleness-claims.json',
      'research/x/digests/agnix.md',
      'research/x/imports/SOURCES.md',
      'architecture-spines/a/reviews/review-adversarial.md',
      'architecture-spines/a/validation-report.md',
      'prds/p/validation-report.md',
      'briefs/b/review.md',
      'prds/p/deeper/prd.md',
      'research/research.md',
      'prds/.hidden/prd.md',
    ]) {
      expect(isPublished(rel), rel).toBe(false);
    }
  });

  it('routes a main document at its directory and an addendum under it', () => {
    expect(designId('prds/prd-ruleprobe-2026-09-23/prd.md')).toBe('prds/prd-ruleprobe-2026-09-23');
    expect(designId('prds/prd-ruleprobe-2026-09-23/addendum.md')).toBe('prds/prd-ruleprobe-2026-09-23/addendum');
    expect(designId('architecture-spines/a/ARCHITECTURE-SPINE.md')).toBe('architecture-spines/a');
    expect(designId('epics.md')).toBe('epics');
    expect(designId('implementation-readiness-2026-09-23.md')).toBe('implementation-readiness-2026-09-23');
  });
});

describe('collecting design documents', () => {
  it('finds nothing, and so builds no route, when the pin has no planning directory', () => {
    expect(designDocs(fixture(null))).toEqual([]);
  });

  it('collects the allowlist in navigation order, an addendum after its document', () => {
    const docs = designDocs(fixture(TREE));
    expect(docs.map((d) => d.route)).toEqual([
      '/design/research/competitive-x-2026-09-23/',
      '/design/briefs/brief-ruleprobe-2026-09-23/',
      '/design/briefs/brief-ruleprobe-2026-09-23/addendum/',
      '/design/prds/prd-ruleprobe-2026-09-23/',
      '/design/prds/prd-ruleprobe-2026-09-23/addendum/',
      '/design/architecture-spines/architecture-ruleprobe-2026-09-23/',
      '/design/epics/',
      '/design/implementation-readiness-2026-09-23/',
    ]);
    const addendum = docs.find((d) => d.id === 'prds/prd-ruleprobe-2026-09-23/addendum')!;
    expect(addendum.parent).toBe('/design/prds/prd-ruleprobe-2026-09-23/');
    expect(addendum.folder).toBe(`${PLANNING}/prds/prd-ruleprobe-2026-09-23`);
    expect(docs.find((d) => d.id === 'epics')!.folder).toBe(PLANNING);
    expect(docs.every((d) => !d.sourcePath.split('/').some((p) => p.startsWith('.')))).toBe(true);
  });

  it('titles a document from its H1, which its page renders, else its front matter', () => {
    const root = fixture({ ...TREE, 'epics.md': '---\ntitle: "Epics and stories: ruleprobe 0.2.0"\n---\n\nNo heading.\n' });
    const byId = new Map(designDocs(root).map((d) => [d.id, readDesignDoc(d, root)]));
    expect(byId.get('research/competitive-x-2026-09-23')!.title).toBe('Research: x');
    expect(byId.get('architecture-spines/architecture-ruleprobe-2026-09-23')!.title).toBe('Architecture spine: ruleprobe');
    expect(byId.get('prds/prd-ruleprobe-2026-09-23/addendum')!.title).toBe('Addendum: ruleprobe PRD');
    expect(byId.get('epics')!.title).toBe('Epics and stories: ruleprobe 0.2.0');
    expect(byId.get('briefs/brief-ruleprobe-2026-09-23')!.body).not.toContain('inputs:');
  });

  it('labels by kind, and adds the date when a kind has two documents', () => {
    const one = designLabels(designDocs(fixture(TREE)));
    expect(one.get('/design/prds/prd-ruleprobe-2026-09-23/')).toBe('PRD');
    expect(one.get('/design/prds/prd-ruleprobe-2026-09-23/addendum/')).toBe('Addendum');
    expect(one.get('/design/implementation-readiness-2026-09-23/')).toBe('Readiness');
    const two = designLabels(designDocs(fixture({ ...TREE, 'prds/prd-ruleprobe-2027-01-10/prd.md': '# PRD two\n' })));
    expect(two.get('/design/prds/prd-ruleprobe-2026-09-23/')).toBe('PRD 2026-09-23');
    expect(two.get('/design/prds/prd-ruleprobe-2027-01-10/')).toBe('PRD 2027-01-10');
  });
});

describe('front matter', () => {
  it('reads a quoted or bare title and nothing else', () => {
    expect(splitFrontmatter('---\ntitle: "PRD: ruleprobe"\n---\n\nBody\n')).toEqual({ title: 'PRD: ruleprobe', body: '\nBody\n' });
    expect(splitFrontmatter("---\ntitle: 'It''s here'\n---\nB").title).toBe("It's here");
    expect(splitFrontmatter('---\ntitle: bare words\n---\nB').title).toBe('bare words');
    expect(splitFrontmatter('---\nname: x\n---\nB')).toEqual({ title: null, body: 'B' });
    expect(splitFrontmatter('# No front matter\n')).toEqual({ title: null, body: '# No front matter\n' });
  });

  it('never parses the rest, so a field YAML would reject cannot fail the build', () => {
    const text = '---\ntitle: "T"\nsource: process: one: two\n  - [unbalanced\n---\n# T\n';
    expect(splitFrontmatter(text)).toEqual({ title: 'T', body: '# T\n' });
  });

  it('finds the first H1 outside fences', () => {
    expect(firstH1('```md\n# In a fence\n```\n\n# The `real` one\n')).toBe('The real one');
    expect(firstH1('## Only an H2\n')).toBeNull();
  });
});
