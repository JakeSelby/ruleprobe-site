#!/usr/bin/env node
// Decides whether vendor/ruleprobe should be repinned, given the tag the
// submodule is on now and the latest ruleprobe release tag. The answer is
// `update` only for a strict `v<semver>` final release that is genuinely newer;
// a branch name, a bare commit, a prerelease or a move backwards is never one.
// .github/workflows/repin.yml reads the answer off GITHUB_OUTPUT and does the
// checkout, so the version comparison stays here where a test can reach it.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

// The semver.org reference grammar, with the `v` prefix ruleprobe tags carry.
const RELEASE_TAG =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function parseTag(tag) {
  const m = RELEASE_TAG.exec(String(tag ?? '').trim());
  if (!m) return null;
  return {
    tag: String(tag).trim(),
    version: String(tag).trim().slice(1),
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split('.') : [],
  };
}

const numeric = (id) => /^(0|[1-9]\d*)$/.test(id);

// Semver precedence: build metadata is ignored, a prerelease sorts below its
// release, numeric identifiers compare numerically and below alphanumeric ones.
export function compare(a, b) {
  for (const part of ['major', 'minor', 'patch']) {
    if (a[part] !== b[part]) return a[part] < b[part] ? -1 : 1;
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    if (a.prerelease.length === b.prerelease.length) return 0;
    return a.prerelease.length === 0 ? 1 : -1;
  }
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
    const x = a.prerelease[i];
    const y = b.prerelease[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    if (numeric(x) && numeric(y)) return Number(x) < Number(y) ? -1 : 1;
    if (numeric(x)) return -1;
    if (numeric(y)) return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

// `error` fails the run, `noop` ends it green, `update` carries the tag to pin.
export function decide(currentTag, latestTag) {
  const current = parseTag(currentTag);
  if (!current) {
    return { action: 'error', reason: `the submodule is not on a release tag (${currentTag || 'no tag'})` };
  }
  const latest = parseTag(latestTag);
  if (!latest) {
    return { action: 'error', reason: `latest release ${latestTag || '(none)'} is not a v<semver> tag` };
  }
  if (latest.prerelease.length) {
    return { action: 'noop', reason: `latest release ${latest.tag} is a prerelease; the pin follows final releases only` };
  }
  const order = compare(latest, current);
  if (order === 0) return { action: 'noop', reason: `already pinned to ${current.tag}` };
  if (order < 0) {
    return { action: 'noop', warn: true, reason: `latest release ${latest.tag} is older than the pinned ${current.tag}; the pin does not move backwards` };
  }
  return { action: 'update', tag: latest.tag, version: latest.version, reason: `${latest.tag} is newer than the pinned ${current.tag}` };
}

export function main(argv, env = process.env) {
  const result = decide(argv[0], argv[1]);
  if (result.action === 'error') {
    console.error(`✗ ${result.reason}`);
    return 1;
  }
  if (result.warn) console.log(`::warning::${result.reason}`);
  console.log(`${result.action}: ${result.reason}`);
  if (env.GITHUB_OUTPUT) {
    const lines = [`action=${result.action}`, `tag=${result.tag ?? ''}`, `version=${result.version ?? ''}`];
    fs.appendFileSync(env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
