# ruleprobe-site

Public reference site for the ruleprobe package, at **https://ruleprobe.jakeselby.com**. Astro 6,
static, no client framework, hand-written CSS carrying the jakeselby.com paper palette. It is a
sibling of agent-harness-site and keeps that site's layout and type.

Nothing about ruleprobe is authored here. `vendor/ruleprobe` is a git submodule pinned to a
release tag. `src/content.config.ts` splits its README across pages and renders its changelog and
its planning documents; `src/lib/ruleprobe/` reads its version and its `pyproject.toml`. A page
cannot drift from the file it describes.

## For other repositories

- The landing copy is ruleprobe's README at the pinned release tag. Change it in ruleprobe and release; the site
  repins itself, and an open `release-drift` issue means it is behind.
- Changes land through a pull request with a green build. A merge to `main` deploys, so it waits for the
  maintainer's go.

Before changing anything here from a session started in another folder, read
`.claude/rules/working-here.md`. Claude Code loads it by itself only in sessions started in this
repository, on their first file read; every other session and tool must read it.

## Gate

```sh
npm --prefix infra ci
npm --prefix infra test
npm --prefix infra run build
npm ci
npm test
npm run build
node scripts/smoke.mjs
npm run check
git status --porcelain
```

`.github/workflows/build.yml` runs the same list on every pull request. Expected clean-tree result
at v0.1.0: `# pass 3` from the infra tests; `# pass 36` and `Tests 64 passed` from `npm test`;
`✓ v0.1.0: 5 routes, 6 pages, 122 internal links resolve, search index and 404 present` from the
smoke test; `0 errors` and `0 warnings` from `astro check`, whose 9 hints about `z` are expected;
and empty porcelain. Generated output and local config are ignored.

- **`AGENTS.md` is a symlink to this file.** Edit `CLAUDE.md`.
