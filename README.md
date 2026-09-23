# ruleprobe-site

The reference site for [ruleprobe](https://github.com/JakeSelby/ruleprobe), at
**https://ruleprobe.jakeselby.com**. The overview, install, detectors and validity pages are
ruleprobe's README split across pages. The changelog and, from the release that carries them,
the planning documents are rendered as well, with search and a link from every page to its
source at the tagged release.

Nothing here is written by hand about ruleprobe. The checkout is a git submodule under
`vendor/ruleprobe`, pinned to a release tag. Astro content collections read its README, its
changelog and its planning documents, so the site cannot drift from the release it describes.

## Commands

```bash
npm ci               # after cloning: git submodule update --init first
npm test             # the scripts, then the README split, links, design allowlist and manifest
npm run dev          # localhost:4321 (search works after one build)
npm run build        # astro build, then Pagefind indexes dist/
npm run smoke        # every route, link and anchor, search index, 404, submodule at the tag
npm run check        # astro check
npm run infra:diff   # cdk diff for the RuleprobeSite stack
```

## Updating to a new ruleprobe release

`.github/workflows/repin.yml` does this within the hour of a release. By hand, to a tag only:

```bash
git -C vendor/ruleprobe fetch --tags
git -C vendor/ruleprobe checkout v0.2.0
git add vendor/ruleprobe
npm test && npm run build && npm run smoke
git commit -m "chore(vendor): pin ruleprobe v0.2.0"
```

The smoke test refuses a submodule commit that is not the tag named by `__version__` in
`ruleprobe/__init__.py`. A README heading the site does not map fails the tests: add it to
`SECTION_MAP` in `src/lib/ruleprobe/readme.ts`.

## Deploying

CI (`.github/workflows/deploy.yml`) syncs the site on every push to `main` through an OIDC
role that can only write the bucket and invalidate the distribution. Infrastructure changes
and the first deploy are `./scripts/deploy.sh` from a Mac with an AWS credential profile.

Copy `.env.infra.example` to `.env.infra` and set the existing account, hosted zone,
bucket, routing function, and deploy-role values. The file is ignored; never commit it.
Use `AWS_PROFILE` or the normal AWS credential chain for authentication, not keys in source.
The CDK app also accepts these settings from the environment. Deployment rejects an
unexpected credential account or stack outputs before syncing files.

Run `npm --prefix infra ci`, `npm --prefix infra test`, and `npm --prefix infra run build`
to validate infrastructure changes without deploying. Synthesis requires deployment config;
tests use synthetic identifiers.

## Licence

MIT. ruleprobe is MIT too; its text is rendered here under that licence.
