import { PLANNING, designDocs, designLabels, readDesignDoc, type DesignDoc } from './design.ts';
import { REPO_URL, VENDOR, existsInVendor } from './paths.ts';
import { PAGES, composePages, readReadme, type PageKey } from './readme.ts';
import { commit, tag, version } from './version.ts';

export interface NavItem {
  route: string;
  label: string;
  mono?: boolean;
  tag?: string;
  tagTone?: 'amber';
  children?: NavItem[];
}

export interface NavGroup {
  label: string;
  /** The group's index page, linked first in the group; null when it has none. */
  route: string | null;
  /** The label of that first link. */
  allLabel?: string;
  count?: number;
  items: NavItem[];
}

/** A page in reading order, as the pager shows it. */
export interface PageLink {
  route: string;
  label: string;
  kind: string;
}

export interface MetaField {
  label: string;
  value?: string;
  values?: string[];
  mono?: boolean;
  tone?: 'amber';
}

export interface ManifestRoute {
  route: string;
  kind: 'page' | 'index' | 'design';
  id: string;
  title: string;
  source: string;
}

const README_ORDER: PageKey[] = ['home', 'install', 'detectors', 'validity'];

export const hasChangelog = (root = VENDOR) => existsInVendor('CHANGELOG.md', root);

export function getTree(root = VENDOR): NavGroup[] {
  const reference: NavGroup = {
    label: 'Reference',
    route: null,
    items: [
      ...README_ORDER.map((key) => ({ route: PAGES[key].route, label: PAGES[key].label })),
      ...(hasChangelog(root) ? [{ route: '/changelog/', label: 'Changelog' }] : []),
    ],
  };
  const docs = designDocs(root);
  if (!docs.length) return [reference];
  const labels = designLabels(docs);
  const items: NavItem[] = docs
    .filter((d) => !d.parent)
    .map((d) => {
      const children = docs.filter((c) => c.parent === d.route).map((c) => ({ route: c.route, label: labels.get(c.route)! }));
      return { route: d.route, label: labels.get(d.route)!, ...(children.length ? { children } : {}) };
    });
  return [reference, { label: 'Design', route: '/design/', allLabel: 'All documents', count: docs.length, items }];
}

/** Every page in the order a reader would take them, for the pager. */
export function readingOrder(root = VENDOR): PageLink[] {
  const docs = designDocs(root);
  const labels = designLabels(docs);
  const parentLabel = (d: DesignDoc) => (d.parent ? `${labels.get(d.parent)} addendum` : labels.get(d.route)!);
  return [
    ...README_ORDER.map((key) => ({ route: PAGES[key].route, label: PAGES[key].label, kind: 'Reference' })),
    ...(hasChangelog(root) ? [{ route: '/changelog/', label: 'Changelog', kind: 'Reference' }] : []),
    ...(docs.length ? [{ route: '/design/', label: 'Design documents', kind: 'Design' }] : []),
    ...docs.map((d) => ({ route: d.route, label: parentLabel(d), kind: 'Design' })),
  ];
}

export function neighbours(route: string, root = VENDOR): { prev: PageLink | null; next: PageLink | null } {
  const order = readingOrder(root);
  const i = order.findIndex((p) => p.route === route);
  if (i === -1) return { prev: null, next: null };
  return { prev: order[i - 1] ?? null, next: order[i + 1] ?? null };
}

/**
 * The machine-readable index of the site: every route with its kind, title and source path in
 * ruleprobe, plus the release rendered. The smoke test reads it after a build, and drift.mjs
 * reads the live one; `release` keeps the harness site's shape so both scripts work unchanged.
 */
export function manifest(root = VENDOR) {
  const pages = composePages(readReadme(root));
  const docs = designDocs(root);
  const routes: ManifestRoute[] = [
    ...README_ORDER.map((key) => ({
      route: PAGES[key].route,
      kind: 'page' as const,
      id: key === 'home' ? 'overview' : key,
      title: pages[key].title,
      source: 'README.md',
    })),
    ...(hasChangelog(root)
      ? [{ route: '/changelog/', kind: 'page' as const, id: 'changelog', title: 'Changelog', source: 'CHANGELOG.md' }]
      : []),
    ...(docs.length
      ? [{ route: '/design/', kind: 'index' as const, id: 'design', title: 'Design documents', source: PLANNING }]
      : []),
    ...docs.map((d) => ({
      route: d.route,
      kind: 'design' as const,
      id: d.id,
      title: readDesignDoc(d, root).title,
      source: d.sourcePath,
    })),
  ];
  return {
    name: 'ruleprobe',
    version: version(root),
    repo: REPO_URL,
    routes,
    release: { tag: tag(root), commit: commit(root) },
  };
}
