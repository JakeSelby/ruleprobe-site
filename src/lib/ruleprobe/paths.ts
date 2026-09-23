import fs from 'node:fs';
import path from 'node:path';
import { VENDOR, tag } from './version.ts';

export { VENDOR };

export const REPO_URL = 'https://github.com/JakeSelby/ruleprobe';
export const SITE_URL = 'https://ruleprobe.jakeselby.com';
export const PYPI_URL = 'https://pypi.org/project/ruleprobe/';

/** Repo-relative path → its file on disk. */
export function vendorFile(rel: string, root = VENDOR): string {
  return path.join(root, rel);
}

export function existsInVendor(rel: string, root = VENDOR): boolean {
  return fs.existsSync(vendorFile(rel, root));
}

/** A repo-relative path on GitHub at the pinned tag: `blob/` for a file, `tree/` for a directory. */
export function sourceUrl(rel: string, root = VENDOR): string {
  const p = rel.replace(/\/+$/, '');
  const abs = vendorFile(p, root);
  const kind = fs.existsSync(abs) && fs.statSync(abs).isDirectory() ? 'tree' : 'blob';
  return `${REPO_URL}/${kind}/${tag(root)}/${p}`;
}

export interface PackageFacts {
  /** The `requires-python` specifier, verbatim. */
  requiresPython: string;
  /** The same specifier as a reader says it: `>=3.9` is `3.9+`. */
  python: string;
  /** Runtime dependencies from `[project]`; empty means standard library only. */
  dependencies: string[];
}

function projectTable(toml: string): string {
  const start = toml.search(/^\[project\]\s*$/m);
  if (start === -1) throw new Error('pyproject.toml has no [project] table');
  const rest = toml.slice(start).split('\n').slice(1).join('\n');
  const next = rest.search(/^\[/m);
  return next === -1 ? rest : rest.slice(0, next);
}

/**
 * Read the Python floor and the runtime dependencies from pyproject.toml, so the install page
 * states what the release declares rather than what its prose says. Only the two keys this site
 * needs are read, which keeps the site free of a TOML parser.
 */
export function parsePackageFacts(toml: string): PackageFacts {
  const table = projectTable(toml.replace(/\r\n/g, '\n'));
  const python = /^requires-python\s*=\s*"([^"]+)"\s*$/m.exec(table);
  if (!python) throw new Error('pyproject.toml [project] has no requires-python');
  const deps = /^dependencies\s*=\s*\[([^\]]*)\]/m.exec(table);
  if (!deps) throw new Error('pyproject.toml [project] has no dependencies list');
  const dependencies = [...deps[1].matchAll(/"([^"]+)"|'([^']+)'/g)].map((m) => m[1] ?? m[2]);
  const floor = /^>=\s*(\d+(?:\.\d+)*)$/.exec(python[1].trim());
  return {
    requiresPython: python[1],
    python: floor ? `${floor[1]}+` : python[1],
    dependencies,
  };
}

export function packageFacts(root = VENDOR): PackageFacts {
  return parsePackageFacts(fs.readFileSync(vendorFile('pyproject.toml', root), 'utf8'));
}
