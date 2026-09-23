import { execFileSync } from 'node:child_process';
import { VENDOR, readVersion } from '../../../scripts/version.mjs';

export { VENDOR };

/** The pinned ruleprobe's version, from `__version__` in ruleprobe/__init__.py. */
export function version(root: string = VENDOR): string {
  return readVersion(root);
}

/** The release tag the site renders. The smoke test proves the submodule sits on it. */
export function tag(root: string = VENDOR): string {
  return `v${version(root)}`;
}

/** The commit the submodule is checked out at. */
export function commit(root: string = VENDOR): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
}
