import fs from 'node:fs';
import path from 'node:path';
import { designDocs } from './design.ts';
import { REPO_URL, VENDOR, sourceUrl, vendorFile } from './paths.ts';
import { anchorRoutes, composePages, readReadme } from './readme.ts';
import { tag } from './version.ts';

/** Everything the rewriter needs to know about the pin, gathered once per build. */
export interface LinkContext {
  tag: string;
  exists: (rel: string) => boolean;
  isDir: (rel: string) => boolean;
  /** GitHub's slug for a README heading → the route that now holds it. */
  readmeAnchors: Map<string, string>;
  /** Repo path of a published planning document → its route. */
  designRoutes: Map<string, string>;
  repoUrl?: string;
}

/** True for hrefs the rewriter must leave alone: absolute URLs, anchors, site-absolute paths. */
export function isExternalHref(href: string): boolean {
  return /^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href);
}

/** Resolve a relative href against the repo path of the file it sits in. */
export function resolveRelative(fromRepoPath: string, href: string): { rel: string; suffix: string } | null {
  const hashAt = href.search(/[#?]/);
  const target = hashAt === -1 ? href : href.slice(0, hashAt);
  const suffix = hashAt === -1 ? '' : href.slice(hashAt);
  if (target === '') return null;
  const dir = path.posix.dirname(fromRepoPath.replace(/\\/g, '/'));
  const joined = path.posix.normalize(path.posix.join(dir, target));
  if (joined.startsWith('..')) return null;
  return { rel: joined === '.' ? '' : joined.replace(/\/+$/, ''), suffix };
}

/**
 * Where a README anchor lands: the page holding its section. An anchor no heading carries keeps
 * its fragment on the overview, where the smoke test fails on it rather than let it pass quietly.
 */
export function readmeAnchorRoute(anchor: string, ctx: LinkContext): string {
  const slug = anchor.replace(/^#/, '');
  return ctx.readmeAnchors.get(slug) ?? `/#${slug}`;
}

/**
 * Map a repo-relative path (plus any `#anchor` or `?query`) to this site's page for it, or to
 * the file on GitHub at the pinned tag when the site has none. Returns null when the path does
 * not exist at the tag, so a link to it can render as its text rather than as a dead link.
 */
export function routeForRepoPath(rel: string, suffix: string, ctx: LinkContext): string | null {
  if (rel === '' || rel.startsWith('..')) return null;
  if (rel === 'README.md') return suffix.startsWith('#') ? readmeAnchorRoute(suffix, ctx) : '/';
  if (rel === 'CHANGELOG.md' && ctx.exists(rel)) return `/changelog/${suffix}`;
  const design = ctx.designRoutes.get(rel);
  if (design) return design + suffix;
  if (!ctx.exists(rel)) return null;
  const kind = ctx.isDir(rel) ? 'tree' : 'blob';
  return `${ctx.repoUrl ?? REPO_URL}/${kind}/${ctx.tag}/${rel}${suffix}`;
}

let cached: LinkContext | null = null;

/** The context for the pinned checkout. A README the site cannot split fails here, and the build with it. */
export function vendorLinkContext(root = VENDOR): LinkContext {
  if (cached && root === VENDOR) return cached;
  const readme = readReadme(root);
  const ctx: LinkContext = {
    tag: tag(root),
    exists: (rel) => fs.existsSync(vendorFile(rel, root)),
    isDir: (rel) => fs.statSync(vendorFile(rel, root)).isDirectory(),
    readmeAnchors: anchorRoutes(readme, composePages(readme), sourceUrl('README.md', root)),
    designRoutes: new Map(designDocs(root).map((d) => [d.sourcePath, d.route])),
  };
  if (root === VENDOR) cached = ctx;
  return ctx;
}
