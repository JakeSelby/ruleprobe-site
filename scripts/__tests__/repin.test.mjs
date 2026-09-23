import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { compare, decide, parseTag } from '../repin.mjs';

const cli = (args, env = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'site-repin-test-'));
  const output = join(root, 'github_output');
  try {
    const result = spawnSync(process.execPath, [new URL('../repin.mjs', import.meta.url).pathname, ...args], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: output, ...env },
    });
    let written = '';
    try {
      written = readFileSync(output, 'utf8');
    } catch {
      /* a failing decision writes no outputs */
    }
    return { ...result, written };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test('parseTag accepts a release tag and rejects anything else', () => {
  assert.deepEqual(parseTag('v1.2.3'), {
    tag: 'v1.2.3',
    version: '1.2.3',
    major: 1,
    minor: 2,
    patch: 3,
    prerelease: [],
  });
  assert.deepEqual(parseTag('v0.11.1-rc.2').prerelease, ['rc', '2']);
  for (const bad of ['main', '0.11.1', 'v0.11', 'v01.2.3', 'release-v1.2.3', 'fcf53de', '', undefined]) {
    assert.equal(parseTag(bad), null, `${bad} should not parse`);
  }
});

test('compare follows semver precedence', () => {
  const cmp = (a, b) => compare(parseTag(a), parseTag(b));
  assert.equal(cmp('v0.11.1', 'v0.11.0'), 1);
  assert.equal(cmp('v0.9.0', 'v0.10.0'), -1, 'versions compare numerically, not lexically');
  assert.equal(cmp('v1.0.0', 'v0.99.99'), 1);
  assert.equal(cmp('v1.2.3', 'v1.2.3'), 0);
  assert.equal(cmp('v1.0.0-rc.1', 'v1.0.0'), -1);
  assert.equal(cmp('v1.0.0-rc.2', 'v1.0.0-rc.1'), 1);
  assert.equal(cmp('v1.0.0-rc.1', 'v1.0.0-rc.1.1'), -1);
  assert.equal(cmp('v1.0.0-alpha', 'v1.0.0-1'), 1, 'alphanumeric outranks numeric');
  assert.equal(cmp('v1.2.3+build.9', 'v1.2.3'), 0, 'build metadata is ignored');
});

test('an unchanged release is a no-op', () => {
  assert.deepEqual(decide('v0.11.0', 'v0.11.0'), { action: 'noop', reason: 'already pinned to v0.11.0' });
});

test('a newer release is pinned', () => {
  assert.deepEqual(decide('v0.11.0', 'v0.11.1'), {
    action: 'update',
    tag: 'v0.11.1',
    version: '0.11.1',
    reason: 'v0.11.1 is newer than the pinned v0.11.0',
  });
  assert.equal(decide('v0.9.0', 'v0.10.0').action, 'update');
});

test('the pin never moves backwards and never leaves a release tag', () => {
  const back = decide('v0.11.0', 'v0.10.0');
  assert.equal(back.action, 'noop');
  assert.equal(back.warn, true);
  assert.equal(decide('v0.11.0', 'v0.12.0-rc.1').action, 'noop');
  for (const bad of ['main', 'fcf53dec5aa1f49716fe68b2573f3a2aa459029c', '0.12.0', '']) {
    assert.equal(decide('v0.11.0', bad).action, 'error', `${bad} should not be pinned`);
  }
  assert.equal(decide('fcf53de', 'v0.12.0').action, 'error', 'an untagged submodule is a failure');
});

test('the CLI writes the step outputs an update needs', () => {
  const run = cli(['v0.11.0', 'v0.11.1']);
  assert.equal(run.status, 0);
  assert.match(run.written, /^action=update$/m);
  assert.match(run.written, /^tag=v0\.11\.1$/m);
  assert.match(run.written, /^version=0\.11\.1$/m);
});

test('the CLI reports a no-op green and a bad tag red', () => {
  const noop = cli(['v0.11.0', 'v0.11.0']);
  assert.equal(noop.status, 0);
  assert.match(noop.written, /^action=noop$/m);
  assert.match(noop.written, /^tag=$/m);

  const bad = cli(['v0.11.0', 'main']);
  assert.equal(bad.status, 1);
  assert.equal(bad.written, '');
  assert.match(bad.stderr, /not a v<semver> tag/);
});

test('the workflow fetches the pinned tag before it describes the submodule', () => {
  // actions/checkout leaves the submodule shallow and tagless, where a bare
  // `git describe --tags --exact-match` fails with "No names found".
  const workflow = readFileSync(new URL('../../.github/workflows/repin.yml', import.meta.url), 'utf8');
  const fetch = workflow.indexOf('fetch --quiet --depth=1 origin tag "$pinned"');
  const describe = workflow.indexOf('describe --tags --exact-match');
  assert.ok(fetch > 0, 'the compare step fetches the pinned tag');
  assert.ok(describe > fetch, 'and only then asks git to describe HEAD');
  assert.match(workflow, /pinned="v\$\(node scripts\/version\.mjs\)"/);
});
