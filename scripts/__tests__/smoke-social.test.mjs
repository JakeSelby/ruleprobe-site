import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

// The brand half of scripts/smoke.mjs, exercised against a synthetic dist. The submodule and
// route checks are satisfied by a throwaway git repo tagged at the version its
// ruleprobe/__init__.py declares, so only the social-image failures show.
const VERSION = '9.9.9';

const head = (overrides = {}) => {
  const tags = {
    'og:image': 'https://ruleprobe.jakeselby.com/og.png',
    'twitter:image': 'https://ruleprobe.jakeselby.com/og.png',
    'og:image:alt': 'ruleprobe. Find out which of your agent rules actually fire.',
    'twitter:card': 'summary_large_image',
    ...overrides,
  };
  return Object.entries(tags)
    .filter(([, content]) => content !== null)
    .map(([key, content]) => {
      const attr = key.startsWith('og:') ? 'property' : 'name';
      return `<meta ${attr}="${key}" content="${content}">`;
    })
    .join('\n');
};

const page = (overrides) => `<!doctype html><html><head>${head(overrides)}</head><body></body></html>`;

function smoke({ overrides = {}, assets = ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'og.png'] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'site-smoke-test-'));
  try {
    mkdirSync(join(root, 'scripts'));
    copyFileSync(new URL('../smoke.mjs', import.meta.url), join(root, 'scripts/smoke.mjs'));
    copyFileSync(new URL('../version.mjs', import.meta.url), join(root, 'scripts/version.mjs'));

    const vendor = join(root, 'vendor/ruleprobe');
    mkdirSync(join(vendor, 'ruleprobe'), { recursive: true });
    writeFileSync(join(vendor, 'ruleprobe/__init__.py'), `__version__ = "${VERSION}"\n`);
    const git = (args) => spawnSync('git', args, { cwd: vendor, encoding: 'utf8' });
    git(['init', '--quiet']);
    git(['-c', 'user.name=t', '-c', 'user.email=tester', 'commit', '--quiet', '--allow-empty', '-m', 'v']);
    git(['tag', `v${VERSION}`]);
    const commit = git(['rev-parse', 'HEAD']).stdout.trim();

    const dist = join(root, 'dist');
    mkdirSync(join(dist, 'install'), { recursive: true });
    mkdirSync(join(dist, 'pagefind'), { recursive: true });
    for (const asset of assets) writeFileSync(join(dist, asset), 'x');
    for (const must of ['404.html', 'pagefind/pagefind.js', 'sitemap-index.xml']) {
      writeFileSync(join(dist, must), 'x');
    }
    writeFileSync(join(dist, 'index.html'), page(overrides));
    writeFileSync(join(dist, 'install/index.html'), page());
    writeFileSync(
      join(dist, 'manifest.json'),
      JSON.stringify({
        version: VERSION,
        release: { commit, tag: `v${VERSION}` },
        routes: [
          { route: '/', kind: 'page', id: 'home' },
          { route: '/install/', kind: 'page', id: 'install' },
        ],
      }),
    );

    const result = spawnSync(process.execPath, [join(root, 'scripts/smoke.mjs')], { cwd: root, encoding: 'utf8' });
    return { status: result.status, out: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('a dist with the card, the icons and same-origin image tags passes', () => {
  const { status, out } = smoke();
  assert.equal(status, 0, out);
});

test('a missing og.png fails', () => {
  const { status, out } = smoke({ assets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png'] });
  assert.equal(status, 1);
  assert.match(out, /dist\/og\.png missing/);
  assert.match(out, /social image https:\/\/ruleprobe\.jakeselby\.com\/og\.png has no file/);
});

test('a missing icon fails', () => {
  const { status, out } = smoke({ assets: ['favicon.svg', 'apple-touch-icon.png', 'og.png'] });
  assert.equal(status, 1);
  assert.match(out, /dist\/favicon\.ico missing/);
});

test('an off-origin social image fails', () => {
  const { status, out } = smoke({ overrides: { 'og:image': 'https://example.com/og.png' } });
  assert.equal(status, 1);
  assert.match(out, /is not on https:\/\/ruleprobe\.jakeselby\.com\//);
});

test('a relative social image fails', () => {
  const { status, out } = smoke({ overrides: { 'twitter:image': '/og.png' } });
  assert.equal(status, 1);
  assert.match(out, /social image \/og\.png is not on/);
});

test('a page with no social image tags fails', () => {
  const { status, out } = smoke({ overrides: { 'og:image': null, 'twitter:image': null } });
  assert.equal(status, 1);
  assert.match(out, /carries 0 social image tag\(s\)/);
});

test('the small twitter card fails', () => {
  const { status, out } = smoke({ overrides: { 'twitter:card': 'summary' } });
  assert.equal(status, 1);
  assert.match(out, /twitter:card is not summary_large_image/);
});

test('an em dash in og:image:alt fails', () => {
  const { status, out } = smoke({ overrides: { 'og:image:alt': `ruleprobe ${String.fromCharCode(0x2014)} the reference` } });
  assert.equal(status, 1);
  assert.match(out, /carries an em dash/);
});
