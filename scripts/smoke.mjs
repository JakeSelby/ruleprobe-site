#!/usr/bin/env node
// Post-build smoke test. Reads the manifest the site publishes and refuses a
// build that is missing a page, a search index, a 404 or a brand asset, whose
// social image tags point anywhere but this origin, that links to a page or
// an anchor it does not have, or that renders a submodule commit which is not the
// tagged release `__version__` in ruleprobe/__init__.py claims.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { VENDOR, readVersion } from './version.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'dist');
const vendor = VENDOR;
let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`✗ ${msg}`);
};

const manifestFile = path.join(dist, 'manifest.json');
if (!fs.existsSync(manifestFile)) {
  fail('dist/manifest.json missing; did the build run?');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));

// Every route in the manifest is a page on disk.
const fileFor = (route) => {
  const clean = route.replace(/[#?].*$/, '');
  if (clean === '/') return path.join(dist, 'index.html');
  if (clean.endsWith('/')) return path.join(dist, clean.slice(1), 'index.html');
  if (path.extname(clean)) return path.join(dist, clean.slice(1));
  return path.join(dist, clean.slice(1), 'index.html');
};
for (const r of manifest.routes) {
  if (!fs.existsSync(fileFor(r.route))) fail(`route ${r.route} (${r.kind} ${r.id}) has no index.html`);
}

for (const must of ['404.html', 'pagefind/pagefind.js', 'sitemap-index.xml', 'manifest.json']) {
  if (!fs.existsSync(path.join(dist, must))) fail(`dist/${must} missing`);
}

// The brand assets the head points at are built and served. brand/render.py writes them.
const ORIGIN = 'https://ruleprobe.jakeselby.com/';
for (const asset of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'og.png']) {
  if (!fs.existsSync(path.join(dist, asset))) fail(`dist/${asset} missing`);
}

// Every social image URL is absolute, on this origin, and resolves to a file in dist.
const metaContents = (html, key, attr) => {
  const re = new RegExp(`<meta[^>]*${attr}="${key}"[^>]*content="([^"]*)"[^>]*>`, 'g');
  return [...html.matchAll(re)].map((m) => m[1]);
};
const socialPages = [...new Set(['/', ...manifest.routes.map((r) => r.route)])];
for (const route of socialPages) {
  const file = fileFor(route);
  if (!file.endsWith('.html') || !fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  const images = [...metaContents(html, 'og:image', 'property'), ...metaContents(html, 'twitter:image', 'name')];
  if (images.length < 2) fail(`${route} carries ${images.length} social image tag(s), expected og:image and twitter:image`);
  for (const url of images) {
    if (!url.startsWith(ORIGIN)) {
      fail(`${route} social image ${url} is not on ${ORIGIN}`);
      continue;
    }
    const asset = path.join(dist, url.slice(ORIGIN.length));
    if (!fs.existsSync(asset)) fail(`${route} social image ${url} has no file at dist/${path.relative(dist, asset)}`);
  }
  if (metaContents(html, 'twitter:card', 'name')[0] !== 'summary_large_image') {
    fail(`${route} twitter:card is not summary_large_image`);
  }
  // No em dash (U+2014) in the image tags, their alt text or the icon links.
  const owned = [
    ...images,
    ...metaContents(html, 'og:image:alt', 'property'),
    ...[...html.matchAll(/<link[^>]*rel="(?:icon|apple-touch-icon)"[^>]*>/g)].map((m) => m[0]),
  ];
  for (const text of owned) {
    if (text.includes('\u2014')) fail(`${route} carries an em dash in ${text}`);
  }
}

// The submodule is at the tagged release the site claims to render.
let version = null;
try {
  version = readVersion(vendor);
} catch (error) {
  fail(error.message);
}
if (version !== null) {
  if (manifest.version !== version) fail(`manifest version ${manifest.version} ≠ __version__ ${version}`);
  // A CI checkout of the submodule is shallow and carries no tags, so fetch the one
  // tag __version__ names before asking whether HEAD is it.
  const git = (args) => execSync(`git ${args}`, { cwd: vendor, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  try {
    git(`fetch --quiet --depth=1 origin tag v${version}`);
  } catch {
    /* offline or already present: describe below decides */
  }
  if (manifest.release?.commit !== git('rev-parse HEAD')) fail('manifest source commit differs from the pinned submodule');
  if (manifest.release?.tag !== `v${version}`) fail('manifest tag differs from __version__');

  try {
    const tag = git('describe --tags --exact-match');
    if (tag !== `v${version}`) fail(`submodule is at ${tag}, __version__ says v${version}`);
  } catch {
    fail(`submodule commit is not the v${version} tag that __version__ names (checkout vendor/ruleprobe at that tag)`);
  }
}

// Every internal link resolves to a file in dist, and every anchor, on another page or this
// one, to an element with that id. The rewriter sends a README anchor it cannot place to `/#…`
// rather than to `/`, so a heading that moved or a slug it got wrong fails here. A link or an
// image left relative is one the rewriter did not handle, and fails too. Script bodies are
// skipped: the search palette builds hrefs from a template there.
const htmlFiles = [];
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.html')) htmlFiles.push(p);
  }
};
walk(dist);
const ids = new Map();
const idsIn = (file) => {
  if (!ids.has(file)) {
    const html = fs.readFileSync(file, 'utf8');
    ids.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  return ids.get(file);
};
let links = 0;
const seen = new Set();
const ABSOLUTE = /^([a-z][a-z0-9+.-]*:|\/\/)/i;
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8').replace(/<script\b[\s\S]*?<\/script>/gi, '');
  for (const m of html.matchAll(/\ssrc="([^"]+)"/g)) {
    if (!ABSOLUTE.test(m[1]) && !m[1].startsWith('/')) fail(`${path.relative(dist, file)} loads ${m[1]}, a relative path the rewriter left`);
  }
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const href = m[1].replace(/&amp;/g, '&');
    const local = href.startsWith('#');
    if (ABSOLUTE.test(href)) continue;
    if (!local && !href.startsWith('/')) {
      fail(`${path.relative(dist, file)} links to ${href}, a relative path the rewriter left`);
      continue;
    }
    links++;
    const target = local ? file : fileFor(href);
    const anchor = href.includes('#') ? decodeURIComponent(href.slice(href.indexOf('#') + 1)) : '';
    const key = `${target}#${anchor}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!fs.existsSync(target)) {
      fail(`${path.relative(dist, file)} links to ${href}, which is not in dist`);
      continue;
    }
    if (anchor && target.endsWith('.html') && !idsIn(target).has(anchor)) {
      fail(`${path.relative(dist, file)} links to ${href}, and ${path.relative(dist, target)} has no id "${anchor}"`);
    }
  }
}

const pages = htmlFiles.length;
if (pages < manifest.routes.length) fail(`only ${pages} html files for ${manifest.routes.length} routes`);

if (failures) {
  console.error(`\n${failures} smoke failure(s)`);
  process.exit(1);
}
console.log(`✓ v${version}: ${manifest.routes.length} routes, ${pages} pages, ${links} internal links resolve, search index and 404 present`);
