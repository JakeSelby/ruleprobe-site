# ruleprobe-site

Public reference site for the ruleprobe package, at **https://ruleprobe.jakeselby.com**. Astro 6,
static, no client framework, hand-written CSS carrying the jakeselby.com paper palette. It is a
sibling of agent-harness-site and keeps that site's layout and type.

Nothing about ruleprobe is authored here. `vendor/ruleprobe` is a git submodule pinned to a
release tag. `src/content.config.ts` splits its README across pages and renders its changelog and
its planning documents; `src/lib/ruleprobe/` reads its version and its `pyproject.toml`. A page
cannot drift from the file it describes.

## Commands

```bash
git submodule update --init   # once, after cloning
npm ci
npm test            # node --test over scripts/, then vitest over src/lib/ruleprobe
npm run dev         # localhost:4321; search needs one prior build
npm run build       # astro build + Pagefind
npm run smoke       # every manifest route, every internal link and anchor, 404, search, the tag
npm run check       # astro check
node scripts/version.mjs     # the pinned ruleprobe version
```

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
at v0.1.0: `# pass 3` from the infra tests; `# pass 28` and `Tests 58 passed` from `npm test`;
`✓ v0.1.0: 5 routes, 6 pages, 104 internal links resolve, search index and 404 present` from the
smoke test; `0 errors` and `0 warnings` from `astro check`, whose 9 hints about `z` are expected;
and empty porcelain. Generated output and local config are ignored.

## Rules

- Conventional Commits for every commit.
- Work in a worktree branched off `origin/main`, and land through a pull request with `build`
  green. `main` has no ruleset only so that repin's bot can push its gitlink bump.
- Once `AWS_DEPLOY_ROLE_ARN` is set, every push to `main` deploys, so every merge waits for the
  maintainer's go.
- Run the gate on `HEAD` in the exact checkout before pushing.
- Every colour comes from the tokens at the top of `src/styles/global.css`; no hex elsewhere.
- No em dash anywhere under `src/`; `site.test.ts` fails on one.
- **`AGENTS.md` is a symlink to this file.** Edit `CLAUDE.md`.

## Keeping the page current

- **The landing copy is ruleprobe's README at the pinned tag.** The line under its H1 is the
  headline, and the paragraph after that is the lede. Change it upstream in ruleprobe, then
  release; an edit here would be dropped by the next repin.
- **`SECTION_MAP` in `src/lib/ruleprobe/readme.ts` assigns every README H2** to the overview,
  install, detectors or validity page, or to `skip`. An H2 it lacks fails the tests and the
  build, so a README change can never drop content silently: add the heading to the map. A
  skipped section is linked from the footer on GitHub.
- **`.github/workflows/repin.yml` owns the submodule bump.** Hourly and on demand it compares the
  latest ruleprobe release with the pinned tag, checks out anything newer, runs the gate against
  it, and only then commits `chore(vendor): pin ruleprobe vX.Y.Z` to `main`. A red gate pushes
  nothing and fails the run. `scripts/repin.mjs` decides, so the version compare has tests.
- **`.github/workflows/drift.yml` watches the outcome.** Every two hours `scripts/drift.mjs`
  compares the live `/manifest.json` with the latest ruleprobe release and keeps one
  `release-drift` issue, titled `Reference site is behind ruleprobe <tag>`, open while they
  differ: at once when a repin run for the release has failed, otherwise after six hours. It
  closes the issue once the site is current. A red repin gate usually means a new README heading
  or a new planning document: fix the site against that tag, then dispatch `repin`.
- **Nothing scheduled runs before the site is live.** repin.yml, drift.yml and deploy.yml all
  skip their job until the `AWS_DEPLOY_ROLE_ARN` repository variable exists.
- **A hand repin is allowed only to a release tag**, never a branch or a bare commit. The smoke
  test refuses any other commit, and so does the workflow.
- **After any repin, confirm the live `/manifest.json` names the new version and commit:**
  `node scripts/drift.mjs --dry-run` reports the decision without touching issues.

## Things that will bite you

- **The submodule is the content.** A fresh clone without `git submodule update --init` has no
  README to split; `deploy.sh` and the smoke test both refuse that. Bump it only to a tag, and
  stage the gitlink after a checkout: `git submodule status` shows a leading `+` until you do.
- **ruleprobe has no `VERSION` file.** `scripts/version.mjs` reads `__version__` from
  `ruleprobe/__init__.py`, which is where `pyproject.toml` reads it too. The smoke test,
  repin.yml and every page use that one reader.
- **Module paths find `vendor/ruleprobe` by walking up.** Astro bundles `src/lib` into
  `dist/.prerender/chunks/` for the build, so a fixed `../` from a module resolves inside
  `dist/` there.
- **The changelog and design pages are conditional.** A pin without `CHANGELOG.md` builds no
  `/changelog/`. The planning corpus arrived after 0.1.0, so a pin without
  `_bmad-output/planning-artifacts` builds no `/design/` route, and the sidebar and the manifest
  leave it out too. `DESIGN_ALLOWLIST` in `src/lib/ruleprobe/design.ts` names what is
  published. Dotfiles, `digests/`, `imports/`, `reviews/` and validation reports never are; each
  design page links its folder on GitHub instead.
- **Front matter is never parsed beyond `title`.** The loader strips it, so a field YAML would
  reject cannot fail a repin. A document's title is its first H1, else that `title`.
- **README anchors move with their sections.** `remarkRuleprobeLinks` sends `#how-good-…` to
  `/validity/`, and an anchor into a skipped section to the README on GitHub. An anchor no heading
  carries becomes `/#anchor`, so the smoke test, which checks that every anchor resolves to an
  element id, fails on it instead of letting it pass. Slugs follow github-slugger over the
  rendered heading text; `headingText` in `readme.ts` is where that text is worked out.
- **Links and images.** A relative link goes to this site's page for the file, else to GitHub at
  the tag; a link to a file the tag lacks, or outside the repository, renders as its text. A
  relative image is served from GitHub at the tag. The smoke test fails on any `href` or `src`
  left relative, outside script bodies.
- **The README is written as one page.** Its "above" and "below" can point across pages here;
  the detectors page lede bridges the one that matters.
- **Bare `<placeholder>` tokens in prose.** Markdown parses `<reason>` as HTML and a browser drops
  it. `remarkEscapeAngle` runs first in `astro.config.mjs` and turns them back into text;
  `remark.test.ts` renders every body the site publishes and checks for lost placeholders.
- **The H1 is lifted out of every body** into `remarkPluginFrontmatter.title`; pages render their
  title themselves. Do not add a second H1 in a template.
- **Search is a build artifact.** `astro-pagefind` indexes `dist/` after the build and serves
  that index in dev. No build, no results.
- **Astro is pinned to 6.4.5.** 6.4.8 resolves Vite 8; keep `overrides.vite` at 7.3.5, the same
  pin as agent-harness-site and jakeselby-com.
- **The routing CloudFront Function rewrites clean URLs to `index.html`.** `trailingSlash` is
  `always`, so every internal link ends in `/`; the smoke test checks each one resolves.

## Deploying

1. Configure `.env.infra` as `README.md` describes. From a Mac: `./scripts/deploy.sh`, which
   checks the tree, the branch, the submodule and the AWS account, runs the tests, the build and
   the smoke test, then `cdk deploy RuleprobeSite` and the sync. ACM validation takes a few
   minutes. Copy the `DeployRoleArn` output into the repository variable `AWS_DEPLOY_ROLE_ARN`;
   that turns on deploy, repin and drift.
2. Every push to `main` after that: `.github/workflows/deploy.yml` builds, smoke-tests and syncs.
3. Infrastructure changes and manual syncs: `./scripts/deploy.sh`.
