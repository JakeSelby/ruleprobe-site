import path from 'node:path';
import { isExternalHref, readmeAnchorRoute, resolveRelative, routeForRepoPath, vendorLinkContext, type LinkContext } from './links.ts';
import { VENDOR } from './paths.ts';

// Minimal mdast typing so these plugins carry no dependency of their own. The
// plugins take `unknown` and cast, which keeps them assignable to Astro's
// RemarkPlugin type without importing mdast.
export interface MdNode { type: string; value?: string; url?: string; depth?: number; children?: MdNode[] }
interface VFileLike { path?: string; data: { astro?: { frontmatter?: Record<string, unknown> } } }

type Transformer = (tree: unknown, file: unknown) => void;

/** Depth-first walk; a visitor may replace `parent.children[index]` in place or return 'skip'. */
function walk(node: MdNode, fn: (node: MdNode, parent: MdNode | null, index: number) => void | 'skip', parent: MdNode | null = null, index = 0): void {
  if (fn(node, parent, index) === 'skip' || !node.children) return;
  [...node.children].forEach((child, i) => walk(child, fn, node, i));
}

export function toText(node: MdNode): string {
  if (typeof node.value === 'string') return node.value;
  return (node.children ?? []).map(toText).join('');
}

const HTML_ALLOW = new Set(['a', 'abbr', 'b', 'br', 'code', 'details', 'div', 'em', 'hr', 'i', 'img', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 's', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul']);

/**
 * Prose can carry placeholders like `<reason>` and `<dir>` in running text. Markdown parses
 * them as raw HTML, and a browser drops unknown tags, so the word vanishes. Turn any lone
 * `<word>` that is not a real HTML element back into text.
 */
export function remarkEscapeAngle(): Transformer {
  return (tree) => {
    walk(tree as MdNode, (node) => {
      if (node.type !== 'html' || typeof node.value !== 'string') return;
      const m = node.value.trim().match(/^<\/?([A-Za-z][\w-]*)\s*\/?>$/);
      if (!m || HTML_ALLOW.has(m[1].toLowerCase())) return;
      node.type = 'text';
    });
  };
}

/**
 * Lift the document's first H1 into frontmatter.title and drop it from the body,
 * so a page renders its title once, in its own header.
 */
export function remarkLiftTitle(): Transformer {
  return (tree, file) => {
    const root = tree as MdNode;
    const f = file as VFileLike;
    const children = root.children ?? [];
    const i = children.findIndex((n) => n.type === 'heading' && n.depth === 1);
    if (i === -1) return;
    const title = toText(children[i]).trim();
    children.splice(i, 1);
    f.data.astro ??= {};
    f.data.astro.frontmatter ??= {};
    f.data.astro.frontmatter.title ??= title;
  };
}

function repoPathOf(file: VFileLike, root: string): string | null {
  if (!file.path) return null;
  const rel = path.relative(root, file.path);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

export interface LinkOptions {
  /** The pin's facts; defaults to the submodule. Tests pass their own. */
  context?: () => LinkContext;
  /** The repo path of the file being rendered; defaults to its path under the submodule. */
  repoPath?: string;
  root?: string;
}

/**
 * Rewrite the links ruleprobe writes for GitHub so they work on this site. An anchor in the
 * README goes to the page that now holds that section; a relative link goes to this site's page
 * for the file, else to the file on GitHub at the pinned tag. A link to a file the tag does not
 * carry has nowhere to go, so it renders as its text.
 */
export function remarkRuleprobeLinks(options: LinkOptions = {}): Transformer {
  const context = options.context ?? (() => vendorLinkContext());
  return (tree, file) => {
    const from = options.repoPath ?? repoPathOf(file as VFileLike, options.root ?? VENDOR);
    if (!from) return;
    const ctx = context();
    walk(tree as MdNode, (node) => {
      if ((node.type !== 'link' && node.type !== 'definition') || typeof node.url !== 'string') return;
      const url = node.url;
      if (url.startsWith('#')) {
        if (from === 'README.md') node.url = readmeAnchorRoute(url, ctx);
        return;
      }
      if (isExternalHref(url)) return;
      const resolved = resolveRelative(from, url);
      if (!resolved) return;
      const route = routeForRepoPath(resolved.rel, resolved.suffix, ctx);
      if (route) {
        node.url = route;
        return;
      }
      if (node.type === 'definition') return;
      node.value = toText(node);
      node.type = 'text';
      delete node.url;
      delete node.children;
    });
  };
}
