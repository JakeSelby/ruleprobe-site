import assert from 'node:assert/strict';
import test from 'node:test';

import { GRACE_HOURS, MANIFEST_URL, decide, issue, plan } from '../drift.mjs';

const HOUR = 3_600_000;
const publishedAt = '2026-09-22T20:04:58Z';
const at = (hours) => Date.parse(publishedAt) + hours * HOUR;
const iso = (hours) => new Date(at(hours)).toISOString();
const run = (hours, conclusion, url = `https://example.test/runs/${hours}`) => ({
  status: conclusion ? 'completed' : 'in_progress',
  conclusion: conclusion ?? '',
  createdAt: iso(hours),
  url,
});

const latest = { tag: 'v0.12.0', commit: 'd4cf311aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', publishedAt };
const stale = { tag: 'v0.11.1', commit: '6fb7afbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' };

test('the site is current once the live manifest names the release and its commit', () => {
  const decision = decide({ latest, live: { tag: latest.tag, commit: latest.commit }, now: at(1) });
  assert.equal(decision.status, 'current');
  assert.match(decision.reason, /serves v0\.12\.0 \(d4cf311\)/);
});

test('the release tag at another commit is not current', () => {
  const decision = decide({ latest, live: { tag: latest.tag, commit: stale.commit }, now: at(GRACE_HOURS + 1) });
  assert.equal(decision.status, 'behind');
});

test('a failed repin run for the release is drift at once, inside the grace window', () => {
  const decision = decide({ latest, live: stale, runs: [run(2, 'failure')], now: at(3) });
  assert.equal(decision.status, 'behind');
  assert.equal(decision.run, 'https://example.test/runs/2');
  assert.match(decision.reason, /repin has failed for v0\.12\.0/);
  assert.equal(decision.serving, 'v0.11.1 (6fb7afb)');
});

test('a failure from before the release was published does not count', () => {
  assert.equal(decide({ latest, live: stale, runs: [run(-1, 'failure')], now: at(1) }).status, 'pending');
});

test('a later successful run supersedes an earlier failure, and a run in progress is skipped', () => {
  const runs = [run(2, 'failure'), run(4, 'success'), run(5)];
  assert.equal(decide({ latest, live: stale, runs, now: at(5) }).status, 'pending');
});

test('silence is pending inside the grace window and drift after it', () => {
  assert.equal(decide({ latest, live: stale, runs: [run(1, 'success')], now: at(GRACE_HOURS - 1) }).status, 'pending');
  const decision = decide({ latest, live: stale, runs: [run(1, 'success')], now: at(GRACE_HOURS + 1) });
  assert.equal(decision.status, 'behind');
  assert.match(decision.reason, /published 7h ago and has not reached the site/);
  assert.equal(decision.run, 'https://example.test/runs/1');
});

test('an unreadable manifest is drift, never current', () => {
  const decision = decide({ latest, live: null, now: at(GRACE_HOURS + 1) });
  assert.equal(decision.status, 'behind');
  assert.equal(decision.serving, 'no readable manifest');
});

test('the issue names the release, what the site serves, why, the run and how it closes', () => {
  const decision = decide({ latest, live: stale, runs: [run(2, 'failure')], now: at(3) });
  const { title, body } = issue({ latest, decision });
  assert.equal(title, 'Reference site is behind ruleprobe v0.12.0');
  assert.match(body, /serves v0\.11\.1 \(6fb7afb\); the latest ruleprobe release is v0\.12\.0 \(d4cf311\)/);
  assert.match(body, /\*\*Why:\*\* repin has failed for v0\.12\.0\./);
  assert.match(body, /\*\*Run:\*\* https:\/\/example\.test\/runs\/2/);
  assert.ok(body.includes(MANIFEST_URL));
});

test('behind opens one issue, or edits the one already open', () => {
  const text = { title: 't', body: 'b' };
  const behind = { status: 'behind' };
  assert.deepEqual(plan(behind, [], text), [{ op: 'create', title: 't', body: 'b' }]);
  assert.deepEqual(plan(behind, [{ number: 7 }, { number: 9 }], text), [{ op: 'edit', number: 7, title: 't', body: 'b' }]);
});

test('current closes every open drift issue, and pending touches none', () => {
  const current = { status: 'current', reason: 'the live site serves v0.12.0 (d4cf311)' };
  assert.deepEqual(plan(current, [{ number: 7 }], {}), [
    { op: 'close', number: 7, comment: 'Closed: the live site serves v0.12.0 (d4cf311).' },
  ]);
  assert.deepEqual(plan(current, [], {}), []);
  assert.deepEqual(plan({ status: 'pending' }, [{ number: 7 }], {}), []);
});
