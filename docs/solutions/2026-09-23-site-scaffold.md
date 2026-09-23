# Site scaffold: traps and commands that worked

- 2026-09-23: Pre-flight a coming ruleprobe release by building against its `main`: `git -C vendor/ruleprobe fetch origin main && git -C vendor/ruleprobe checkout FETCH_HEAD`, then `npm test && npm run build && node scripts/smoke.mjs`, where only the "not the tag" check may fail; restore with `git -C vendor/ruleprobe checkout v<pinned>`. Fetch first: smoke's own tag fetch leaves `FETCH_HEAD` on the pinned tag.
- 2026-09-23: `git submodule add` stages the default branch's head. After `git -C vendor/ruleprobe checkout <tag>`, run `git add vendor/ruleprobe`, or the commit pins `main`; `git submodule status` shows a leading `+` until you do.
- 2026-09-23: git removes a worktree that ever held a submodule only with `git worktree remove --force`, even after `git submodule deinit --all`, so `harness worktree remove` refuses every merged ruleprobe-site worktree. Leave it for the maintainer rather than force it.
