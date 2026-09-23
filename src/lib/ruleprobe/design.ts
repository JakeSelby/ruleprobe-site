import fs from 'node:fs';
import path from 'node:path';
import { VENDOR } from './paths.ts';
import { headingText, headingsIn } from './readme.ts';

/** Where ruleprobe keeps its public planning corpus. Absent from releases before it existed. */
export const PLANNING = '_bmad-output/planning-artifacts';

/**
 * The planning documents the site publishes, by their path under `PLANNING`. Anything else there
 * stays on GitHub: dotfiles (`.memlog.md`, `.staleness-claims.json`), `digests/`, `imports/`,
 * `reviews/` and validation reports are working material, and each design page links to its
 * folder on GitHub instead. A `*` stands for one dated directory and never crosses a `/`.
 */
export const DESIGN_ALLOWLIST = [
  'research/*/research.md',
  'briefs/*/brief.md',
  'briefs/*/addendum.md',
  'prds/*/prd.md',
  'prds/*/addendum.md',
  'architecture-spines/*/ARCHITECTURE-SPINE.md',
  'epics.md',
  'implementation-readiness-*.md',
] as const;

/** Each kind's order in the navigation, and what the sidebar calls it. */
const KINDS: { dir: string; label: string }[] = [
  { dir: 'research', label: 'Research' },
  { dir: 'briefs', label: 'Brief' },
  { dir: 'prds', label: 'PRD' },
  { dir: 'architecture-spines', label: 'Architecture' },
  { dir: 'epics', label: 'Epics' },
  { dir: 'implementation-readiness', label: 'Readiness' },
];

export interface DesignDoc {
  /** Path under `PLANNING`, e.g. `prds/prd-ruleprobe-2026-09-23/prd.md`. */
  rel: string;
  /** Repo-relative path, for source links. */
  sourcePath: string;
  /** Collection id and route slug under `/design/`. */
  id: string;
  route: string;
  /** The document's kind, from its directory. */
  kind: string;
  kindLabel: string;
  /** The route of the document this one is an addendum to, when it is one. */
  parent: string | null;
  /** The folder on GitHub holding this document's reviews, digests and reports. */
  folder: string;
}

const matcher = (glob: string) =>
  new RegExp(`^${glob.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]+')}$`);
const ALLOW = DESIGN_ALLOWLIST.map(matcher);

/** True when `rel` (a path under `PLANNING`) is published. Dotfiles never are. */
export function isPublished(rel: string): boolean {
  if (rel.split('/').some((part) => part.startsWith('.'))) return false;
  return ALLOW.some((re) => re.test(rel));
}

/**
 * The route slug for a published document: a directory's main document takes the directory's
 * route, an addendum sits under it, and a top-level file takes its own name.
 * `prds/prd-x/prd.md` → `prds/prd-x`, `prds/prd-x/addendum.md` → `prds/prd-x/addendum`,
 * `epics.md` → `epics`.
 */
export function designId(rel: string): string {
  const parts = rel.replace(/\.md$/, '').split('/');
  if (parts.length === 1) return parts[0].toLowerCase();
  const [kind, dir, file] = parts;
  return file === 'addendum' ? `${kind}/${dir}/addendum` : `${kind}/${dir}`;
}

function kindOf(rel: string): { dir: string; label: string } {
  const head = rel.split('/')[0].replace(/\.md$/, '');
  return KINDS.find((k) => head === k.dir || head.startsWith(`${k.dir}-`)) ?? { dir: head, label: head };
}

function walk(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const rel = prefix ? `${prefix}/${name}` : name;
    const abs = path.join(dir, name);
    if (fs.statSync(abs).isDirectory()) out.push(...walk(abs, rel));
    else out.push(rel);
  }
  return out;
}

/**
 * Every published planning document at the pin, in navigation order: by kind, then by path, an
 * addendum straight after its document. A pin without the planning directory has none, and the
 * site then builds no `/design/` route at all.
 */
export function designDocs(root = VENDOR): DesignDoc[] {
  const base = path.join(root, PLANNING);
  if (!fs.existsSync(base)) return [];
  const docs = walk(base)
    .filter(isPublished)
    .map((rel): DesignDoc => {
      const id = designId(rel);
      const kind = kindOf(rel);
      const addendum = /\/addendum\.md$/.test(rel);
      return {
        rel,
        sourcePath: `${PLANNING}/${rel}`,
        id,
        route: `/design/${id}/`,
        kind: kind.dir,
        kindLabel: kind.label,
        parent: addendum ? `/design/${id.replace(/\/addendum$/, '')}/` : null,
        folder: `${PLANNING}/${rel.includes('/') ? path.posix.dirname(rel) : ''}`.replace(/\/$/, ''),
      };
    });
  const rank = (d: DesignDoc) => {
    const i = KINDS.findIndex((k) => k.dir === d.kind);
    return i === -1 ? KINDS.length : i;
  };
  return docs.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}

/** The body without its front matter, and the one scalar the site reads from it: `title`. */
export function splitFrontmatter(text: string): { title: string | null; body: string } {
  const normalized = text.replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(normalized);
  if (!m) return { title: null, body: normalized };
  const title = /^title:[ \t]*(?:"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)'|(.+?))[ \t]*$/m.exec(m[1]);
  const value = title ? (title[1]?.replace(/\\(.)/g, '$1') ?? title[2]?.replace(/''/g, "'") ?? title[3]) : null;
  return { title: value?.trim() || null, body: normalized.slice(m[0].length) };
}

/** The first H1 of a body, outside fenced code, as plain text. */
export function firstH1(body: string): string | null {
  const h1 = headingsIn(body).find((h) => h.depth === 1);
  return h1 ? headingText(h1.text) : null;
}

export interface DesignText {
  /**
   * The first H1, which is the title the document shows and the one its page renders; else the
   * front matter `title`; else the route slug. The manifest and the index use the same one.
   */
  title: string;
  /** Markdown without its front matter. */
  body: string;
}

export function readDesignDoc(doc: DesignDoc, root = VENDOR): DesignText {
  const { title, body } = splitFrontmatter(fs.readFileSync(path.join(root, doc.sourcePath), 'utf8'));
  return { title: firstH1(body) ?? title ?? doc.id, body };
}

/**
 * The sidebar label for a document: its kind, and its date as well when two documents of one kind
 * are published, which is what a second PRD or brief would look like.
 */
export function designLabels(docs: DesignDoc[]): Map<string, string> {
  const main = docs.filter((d) => !d.parent);
  const counts = new Map<string, number>();
  for (const d of main) counts.set(d.kindLabel, (counts.get(d.kindLabel) ?? 0) + 1);
  const labels = new Map<string, string>();
  for (const d of docs) {
    if (d.parent) {
      labels.set(d.route, 'Addendum');
      continue;
    }
    const date = /\d{4}-\d{2}-\d{2}/.exec(d.id)?.[0];
    labels.set(d.route, (counts.get(d.kindLabel) ?? 0) > 1 && date ? `${d.kindLabel} ${date}` : d.kindLabel);
  }
  return labels;
}
