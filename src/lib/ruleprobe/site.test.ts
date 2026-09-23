import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PLANNING, designDocs } from './design.ts';
import { VENDOR, parsePackageFacts, sourceUrl } from './paths.ts';
import { getTree, manifest, neighbours, readingOrder } from './site.ts';
import { version } from './version.ts';

describe('the manifest', () => {
  const m = manifest();

  it('has the shape drift.mjs and the smoke test read', () => {
    expect(Object.keys(m)).toEqual(['name', 'version', 'repo', 'routes', 'release']);
    expect(m.name).toBe('ruleprobe');
    expect(m.version).toBe(version());
    expect(m.repo).toBe('https://github.com/JakeSelby/ruleprobe');
    expect(m.release.tag).toBe(`v${m.version}`);
    expect(m.release.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('lists every page once, each with a kind, an id, a title and a source', () => {
    const routes = m.routes.map((r) => r.route);
    expect(new Set(routes).size).toBe(routes.length);
    expect(routes.slice(0, 4)).toEqual(['/', '/install/', '/detectors/', '/validity/']);
    for (const r of m.routes) {
      expect(['page', 'index', 'design']).toContain(r.kind);
      expect(r.route).toMatch(/^\/([\w.-]+\/)*$/);
      expect(r.id.length).toBeGreaterThan(0);
      expect(r.title.length).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(VENDOR, r.source)), r.source).toBe(true);
    }
  });

  it('lists design routes exactly when the pin publishes a design document', () => {
    const published = designDocs().length > 0;
    expect(m.routes.some((r) => r.route.startsWith('/design/'))).toBe(published);
    expect(getTree().some((g) => g.route === '/design/')).toBe(published);
  });
});

describe('the manifest of a release with design documents', () => {
  const roots: string[] = [];
  afterAll(() => roots.forEach((r) => fs.rmSync(r, { recursive: true, force: true })));

  it('lists the index and each document with the title its page shows', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ruleprobe-release-'));
    roots.push(root);
    const files: Record<string, string> = {
      'README.md': fs.readFileSync(path.join(VENDOR, 'README.md'), 'utf8'),
      'ruleprobe/__init__.py': '__version__ = "0.2.0"\n',
      [`${PLANNING}/prds/prd-x-2026-09-23/prd.md`]: '---\ntitle: "PRD: x"\n---\n\n# PRD: ruleprobe\n',
      [`${PLANNING}/prds/prd-x-2026-09-23/.memlog.md`]: 'never published\n',
      [`${PLANNING}/epics.md`]: '---\ntitle: "Epics and stories"\n---\n\nNo heading.\n',
    };
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    }
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], { cwd: root, stdio: 'pipe' });
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'fixture');
    const m = manifest(root);
    expect(m.version).toBe('0.2.0');
    expect(m.release.tag).toBe('v0.2.0');
    expect(m.routes.map((r) => r.route)).toEqual([
      '/', '/install/', '/detectors/', '/validity/', '/design/', '/design/prds/prd-x-2026-09-23/', '/design/epics/',
    ]);
    expect(m.routes.find((r) => r.id === 'prds/prd-x-2026-09-23')).toMatchObject({ kind: 'design', title: 'PRD: ruleprobe' });
    expect(m.routes.find((r) => r.id === 'epics')!.title).toBe('Epics and stories');
    expect(JSON.stringify(m)).not.toContain('memlog');
  });
});

describe('navigation', () => {
  const roots: string[] = [];
  afterAll(() => roots.forEach((r) => fs.rmSync(r, { recursive: true, force: true })));

  function pin(withDesign: boolean): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ruleprobe-site-'));
    roots.push(root);
    fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n');
    if (withDesign) {
      for (const rel of ['prds/prd-x-2026-09-23/prd.md', 'prds/prd-x-2026-09-23/addendum.md', 'epics.md']) {
        fs.mkdirSync(path.dirname(path.join(root, PLANNING, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, PLANNING, rel), '# T\n');
      }
    }
    return root;
  }

  it('shows the reference pages, and a design group only when there are design documents', () => {
    const bare = getTree(pin(false));
    expect(bare.map((g) => g.label)).toEqual(['Reference']);
    expect(bare[0].items.map((i) => i.route)).toEqual(['/', '/install/', '/detectors/', '/validity/', '/changelog/']);
    const design = getTree(pin(true))[1];
    expect(design).toMatchObject({ label: 'Design', route: '/design/', allLabel: 'All documents', count: 3 });
    expect(design.items).toEqual([
      { route: '/design/prds/prd-x-2026-09-23/', label: 'PRD', children: [{ route: '/design/prds/prd-x-2026-09-23/addendum/', label: 'Addendum' }] },
      { route: '/design/epics/', label: 'Epics' },
    ]);
  });

  it('pages through the reference, then the design documents in order', () => {
    const root = pin(true);
    expect(readingOrder(root).map((p) => p.route)).toEqual([
      '/', '/install/', '/detectors/', '/validity/', '/changelog/',
      '/design/', '/design/prds/prd-x-2026-09-23/', '/design/prds/prd-x-2026-09-23/addendum/', '/design/epics/',
    ]);
    expect(neighbours('/', root).prev).toBeNull();
    expect(neighbours('/design/prds/prd-x-2026-09-23/addendum/', root)).toMatchObject({
      prev: { label: 'PRD' },
      next: { label: 'Epics', kind: 'Design' },
    });
    expect(neighbours('/404/', root)).toEqual({ prev: null, next: null });
  });
});

describe('package facts', () => {
  const PYPROJECT = [
    '[build-system]',
    'requires = ["setuptools>=61"]',
    '',
    '[project]',
    'name = "ruleprobe"',
    'requires-python = ">=3.9"',
    'dependencies = []',
    '',
    '[project.urls]',
    'Homepage = "https://github.com/JakeSelby/ruleprobe"',
  ].join('\n');

  it('reads the Python floor and the dependency list from [project]', () => {
    expect(parsePackageFacts(PYPROJECT)).toEqual({ requiresPython: '>=3.9', python: '3.9+', dependencies: [] });
    const deps = PYPROJECT.replace('dependencies = []', 'dependencies = [\n  "tomli>=2; python_version < \'3.11\'",\n  \'rich\',\n]');
    expect(parsePackageFacts(deps).dependencies).toEqual(["tomli>=2; python_version < '3.11'", 'rich']);
    expect(parsePackageFacts(PYPROJECT.replace('>=3.9', '>=3.9,<4')).python).toBe('>=3.9,<4');
  });

  it('refuses a pyproject without the keys, rather than guessing', () => {
    expect(() => parsePackageFacts('[tool.x]\n')).toThrow(/\[project\]/);
    expect(() => parsePackageFacts(PYPROJECT.replace('requires-python = ">=3.9"\n', ''))).toThrow(/requires-python/);
  });

  it('links a file as a blob and a directory as a tree at the pinned tag', () => {
    const tag = `v${version()}`;
    expect(sourceUrl('README.md')).toBe(`https://github.com/JakeSelby/ruleprobe/blob/${tag}/README.md`);
    expect(sourceUrl('ruleprobe/')).toBe(`https://github.com/JakeSelby/ruleprobe/tree/${tag}/ruleprobe`);
  });
});

describe('the site copy', () => {
  it('carries no em dash', () => {
    const src = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (!p.endsWith('.test.ts')) files.push(p);
      }
    };
    walk(src);
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((f) => fs.readFileSync(f, 'utf8').includes('—'));
    expect(offenders.map((f) => path.relative(src, f))).toEqual([]);
  });
});
