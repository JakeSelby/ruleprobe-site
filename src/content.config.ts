import fs from 'node:fs';
import { defineCollection, z } from 'astro:content';
import { designDocs, readDesignDoc } from './lib/ruleprobe/design.ts';
import { vendorLoader } from './lib/ruleprobe/loader.ts';
import { vendorFile } from './lib/ruleprobe/paths.ts';
import { composePages, readReadme } from './lib/ruleprobe/readme.ts';

// Every collection reads the ruleprobe submodule directly, so nothing about ruleprobe is
// written by hand here. `readme` is README.md split across pages by SECTION_MAP in
// src/lib/ruleprobe/readme.ts, plus the lead under the H1, which the overview's hero renders.
const loose = z.object({}).passthrough();

export const collections = {
  readme: defineCollection({
    loader: vendorLoader('readme', () => {
      const readme = readReadme();
      const pages = composePages(readme);
      return [
        { id: 'lead', sourcePath: 'README.md', body: readme.lead, data: { title: readme.headline } },
        ...Object.values(pages).map((page) => ({
          id: page.def.key,
          sourcePath: 'README.md',
          body: page.markdown,
          data: { title: page.title },
        })),
      ];
    }),
    schema: z.object({ title: z.string() }).passthrough(),
  }),
  changelog: defineCollection({
    loader: vendorLoader('changelog', () =>
      fs.existsSync(vendorFile('CHANGELOG.md'))
        ? [{ id: 'changelog', sourcePath: 'CHANGELOG.md', body: fs.readFileSync(vendorFile('CHANGELOG.md'), 'utf8'), data: {} }]
        : [],
    ),
    schema: loose,
  }),
  design: defineCollection({
    loader: vendorLoader('design', () =>
      designDocs().map((doc) => {
        const { title, body } = readDesignDoc(doc);
        return { id: doc.id, sourcePath: doc.sourcePath, body, data: { title } };
      }),
    ),
    schema: z.object({ title: z.string() }).passthrough(),
  }),
};
