#!/usr/bin/env node
// Prints the version of the pinned ruleprobe. ruleprobe has no VERSION file: the package
// declares `__version__` in ruleprobe/__init__.py and pyproject.toml reads it from there, so
// this reads the same line. The smoke test, repin.yml and src/lib/ruleprobe/version.ts all
// use this one reader, so they can never disagree about which release the site renders.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Found by walking up rather than from a fixed `../`: Astro bundles this module into
// dist/.prerender/chunks/ for the build, and a fixed relative path would resolve from there.
function projectRoot(from) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'vendor', 'ruleprobe'))) return dir;
    if (path.dirname(dir) === dir) return null;
  }
}
const here = path.dirname(fileURLToPath(import.meta.url));
export const VENDOR = path.join(projectRoot(here) ?? path.resolve(here, '..'), 'vendor', 'ruleprobe');
export const VERSION_FILE = 'ruleprobe/__init__.py';

const VERSION_LINE = /^__version__ = "([^"]+)"$/m;

export function parseVersion(source) {
  const m = VERSION_LINE.exec(String(source).replace(/\r\n/g, '\n'));
  if (!m) throw new Error(`${VERSION_FILE} has no line of the form __version__ = "X.Y.Z"`);
  return m[1];
}

export function readVersion(root = VENDOR) {
  const file = path.join(root, VERSION_FILE);
  if (!fs.existsSync(file)) {
    throw new Error(`${file} is missing; run git submodule update --init`);
  }
  return parseVersion(fs.readFileSync(file, 'utf8'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(readVersion());
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }
}
