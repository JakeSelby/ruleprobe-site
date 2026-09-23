#!/usr/bin/env node
// Answers whether the live site serves the latest ruleprobe release, and keeps one
// `release-drift` issue open for as long as it does not. repin.yml fails quietly when its gate
// is red — it pushes nothing — so this compares the outcome, the live /manifest.json, with the
// latest release, whatever the cause: a failed repin, a failed deploy or a repin that never ran.
// .github/workflows/drift.yml runs it; the decision and the issue text live here for the tests.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const PRODUCT_REPO = 'JakeSelby/ruleprobe';
export const MANIFEST_URL = 'https://ruleprobe.jakeselby.com/manifest.json';
export const LABEL = 'release-drift';
// Scheduled runs start late under load, so a release gets this long to reach the site before
// silence counts as drift. A failed repin run for the release counts at once.
export const GRACE_HOURS = 6;

const HOUR = 3_600_000;
const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);
const short = (sha) => String(sha ?? '').slice(0, 7);

// `current` once the live manifest names the release and its commit; `behind` when the newest
// finished repin run since the release failed, or when the grace window has passed; `pending`
// otherwise. `latest` is { tag, commit, publishedAt }, `live` the manifest's release block or
// null when it could not be read, `runs` repin.yml's runs as `gh run list` reports them.
export function decide({ latest, live, runs = [], now, graceHours = GRACE_HOURS }) {
  if (live?.tag === latest.tag && live?.commit === latest.commit) {
    return { status: 'current', reason: `the live site serves ${latest.tag} (${short(latest.commit)})` };
  }
  const serving = live?.tag ? `${live.tag} (${short(live.commit)})` : 'no readable manifest';
  const published = Date.parse(latest.publishedAt);
  const since = runs
    .filter((run) => Date.parse(run.createdAt) >= published)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const finished = since.find((run) => run.status === 'completed');
  if (finished && FAILED.has(finished.conclusion)) {
    return { status: 'behind', serving, reason: `repin has failed for ${latest.tag}`, run: finished.url };
  }
  const hours = (now - published) / HOUR;
  if (hours < graceHours) {
    return { status: 'pending', serving, reason: `${latest.tag} was published ${hours.toFixed(1)}h ago` };
  }
  return {
    status: 'behind',
    serving,
    reason: `${latest.tag} was published ${Math.floor(hours)}h ago and has not reached the site`,
    run: since[0]?.url,
  };
}

export function issue({ latest, decision }) {
  const lines = [
    `The live site serves ${decision.serving}; the latest ruleprobe release is ${latest.tag} ` +
      `(${short(latest.commit)}), published ${latest.publishedAt}.`,
    '',
    `**Why:** ${decision.reason}.`,
  ];
  if (decision.run) lines.push(`**Run:** ${decision.run}`);
  lines.push(
    '',
    `\`.github/workflows/drift.yml\` keeps this issue current and closes it once ${MANIFEST_URL} ` +
      `names ${latest.tag} and its commit.`,
  );
  return { title: `Reference site is behind ruleprobe ${latest.tag}`, body: lines.join('\n') };
}

// One open issue while the site is behind, none once it is current; a pending release leaves
// whatever is open alone.
export function plan(decision, open, text) {
  if (decision.status === 'behind') {
    return open.length ? [{ op: 'edit', number: open[0].number, ...text }] : [{ op: 'create', ...text }];
  }
  if (decision.status === 'current') {
    return open.map(({ number }) => ({ op: 'close', number, comment: `Closed: ${decision.reason}.` }));
  }
  return [];
}

const gh = (args, input) =>
  execFileSync('gh', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'inherit'] });
const ghJson = (args) => JSON.parse(gh(args));

async function observe(site) {
  const release = ghJson(['api', `repos/${PRODUCT_REPO}/releases/latest`]);
  const commit = ghJson(['api', `repos/${PRODUCT_REPO}/commits/${release.tag_name}`]).sha;
  let live = null;
  try {
    const response = await fetch(MANIFEST_URL, { headers: { 'cache-control': 'no-cache' } });
    if (response.ok) {
      const { release: served } = await response.json();
      live = { tag: served?.tag, commit: served?.commit };
    }
  } catch {
    // An unreachable or malformed manifest is drift, which `decide` reports; not a crash.
  }
  const runs = ghJson(['run', 'list', '-R', site, '--workflow', 'repin.yml', '--limit', '30',
    '--json', 'status,conclusion,createdAt,url']);
  const open = ghJson(['issue', 'list', '-R', site, '--label', LABEL, '--state', 'open', '--json', 'number']);
  return { latest: { tag: release.tag_name, commit, publishedAt: release.published_at }, live, runs, open };
}

function apply(site, actions) {
  for (const action of actions) {
    if (action.op === 'create') {
      gh(['label', 'create', LABEL, '-R', site, '--force', '--color', 'B60205',
        '--description', 'A live surface lags the latest release it shows']);
      gh(['issue', 'create', '-R', site, '--title', action.title, '--label', LABEL, '--body-file', '-'], action.body);
    } else if (action.op === 'edit') {
      gh(['issue', 'edit', String(action.number), '-R', site, '--title', action.title, '--body-file', '-'], action.body);
    } else if (action.op === 'close') {
      gh(['issue', 'close', String(action.number), '-R', site, '--comment', action.comment]);
    }
  }
}

// Drift ends the run green with a warning: the issue is the signal, and a red run every two
// hours would only bury it in mail. A run that cannot observe the site fails.
export async function main(argv, env = process.env) {
  const dryRun = argv.includes('--dry-run');
  const site = env.GH_REPO || 'JakeSelby/ruleprobe-site';
  const state = await observe(site);
  const decision = decide({ ...state, now: Date.now() });
  const actions = plan(decision, state.open, issue({ latest: state.latest, decision }));
  const summary = `${decision.status}: ${decision.reason}` +
    (decision.serving ? `; the live site serves ${decision.serving}` : '');
  console.log(decision.status === 'behind' ? `::warning::${summary}` : summary);
  for (const action of actions) {
    console.log(`${dryRun ? 'would ' : ''}${action.op}${action.number ? ` #${action.number}` : ''}` +
      (action.title ? `: ${action.title}` : ''));
  }
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  if (!dryRun) apply(site, actions);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`✗ ${error.message}`);
      process.exit(1);
    },
  );
}
