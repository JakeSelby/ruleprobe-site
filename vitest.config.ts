import { defineConfig } from 'vitest/config';

// The modules under src/lib/ruleprobe are plain Node: they read the submodule with
// node:fs and never import astro:*, so they test without the Astro toolchain.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/lib/**/*.test.ts'],
  },
});
