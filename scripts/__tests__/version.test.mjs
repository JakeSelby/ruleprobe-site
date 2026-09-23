import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { VENDOR, parseVersion, readVersion } from '../version.mjs';

const INIT = [
  '"""ruleprobe: find out which of your agent rules actually fire."""',
  'from ruleprobe.registry import DEFAULT',
  '',
  '__version__ = "0.2.0"',
  '',
].join('\n');

test('the version is read from the __version__ line', () => {
  assert.equal(parseVersion(INIT), '0.2.0');
  assert.equal(parseVersion(INIT.replace(/\n/g, '\r\n')), '0.2.0');
});

test('a file without the line, or with it in another shape, is refused by name', () => {
  assert.throws(() => parseVersion('VERSION = "0.2.0"\n'), /__version__ = "X\.Y\.Z"/);
  assert.throws(() => parseVersion("__version__ = '0.2.0'\n"), /__version__/);
  assert.throws(() => parseVersion('    __version__ = "0.2.0"\n'), /__version__/);
});

test('a checkout without the package says to initialise the submodule', () => {
  const root = mkdtempSync(join(tmpdir(), 'ruleprobe-version-'));
  try {
    assert.throws(() => readVersion(root), /git submodule update --init/);
    mkdirSync(join(root, 'ruleprobe'));
    writeFileSync(join(root, 'ruleprobe/__init__.py'), INIT);
    assert.equal(readVersion(root), '0.2.0');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the default root is the submodule, and the CLI prints the pinned version', () => {
  assert.match(VENDOR, /[/\\]vendor[/\\]ruleprobe$/);
  const pinned = readVersion();
  assert.match(pinned, /^\d+\.\d+\.\d+/);
  const script = fileURLToPath(new URL('../version.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [script], { encoding: 'utf8', cwd: tmpdir() });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), pinned);
});
