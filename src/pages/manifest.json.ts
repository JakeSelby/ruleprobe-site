import type { APIRoute } from 'astro';
import { manifest } from '../lib/ruleprobe/site.ts';

// The machine-readable index of the site: every route with its kind, title and
// source path in ruleprobe, plus the release rendered. The smoke test reads it
// after a build, and scripts/drift.mjs reads the live one.
export const GET: APIRoute = () =>
  new Response(JSON.stringify(manifest(), null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
