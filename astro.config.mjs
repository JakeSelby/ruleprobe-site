// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';
import { remarkEscapeAngle, remarkLiftTitle, remarkRuleprobeLinks } from './src/lib/ruleprobe/remark.ts';

// The ruleprobe checkout is a submodule under vendor/; the collections in
// src/content.config.ts read it directly, so this site never copies a line of
// ruleprobe's prose by hand. See CLAUDE.md for how the pin moves.
export default defineConfig({
  site: 'https://ruleprobe.jakeselby.com',
  output: 'static',
  trailingSlash: 'always',
  integrations: [sitemap(), pagefind()],
  markdown: {
    // Order matters: bare <placeholder> tokens must become text before anything
    // else looks at the tree, and the H1 is lifted into frontmatter so pages
    // render their own title once.
    processor: unified({
      remarkPlugins: [remarkEscapeAngle, remarkLiftTitle, remarkRuleprobeLinks],
    }),
    shikiConfig: { theme: 'github-dark-default' },
  },
});
