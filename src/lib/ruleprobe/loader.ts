import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Loader } from 'astro/loaders';
import { VENDOR } from './paths.ts';

export interface VendorEntry {
  id: string;
  /** Repo-relative path of the file the body came from. Links in the body resolve against it. */
  sourcePath: string;
  /** Markdown, front matter already removed. */
  body: string;
  data: Record<string, unknown>;
}

/**
 * Why not Astro's `glob()` loader: a README page is a slice of README.md rather than a file, and
 * the planning documents carry YAML front matter this site never reads beyond `title`. Parsing
 * it would let one malformed field upstream fail a repin. This loader takes bodies prepared in
 * src/lib/ruleprobe and hands each to Astro's own markdown pipeline, with the source file's URL,
 * so `render(entry)` works as usual and the remark plugins know which file they are in.
 */
export function vendorLoader(name: string, entries: () => VendorEntry[], root = VENDOR): Loader {
  return {
    name: `ruleprobe-${name}`,
    async load({ store, parseData, renderMarkdown, generateDigest, config }) {
      store.clear();
      const projectRoot = fileURLToPath(config.root);
      for (const entry of entries()) {
        const abs = path.join(root, entry.sourcePath);
        const data = await parseData({ id: entry.id, data: entry.data, filePath: abs });
        const rendered = await renderMarkdown(entry.body, { fileURL: pathToFileURL(abs) });
        store.set({
          id: entry.id,
          data,
          body: entry.body,
          filePath: path.relative(projectRoot, abs),
          digest: generateDigest(entry.body),
          rendered,
        });
      }
    },
  };
}
