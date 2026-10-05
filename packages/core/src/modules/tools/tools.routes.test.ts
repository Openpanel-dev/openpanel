// `defineRoutes` has no prefix mechanism, so each route spells out `/tools/...`;
// apps/public calls `${API_URL}/tools/ip-lookup`, which 404s if the segment is dropped.

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(
  new URL('./tools.routes.ts', import.meta.url),
  'utf8'
);

describe('tools routes keep their public paths', () => {
  test('both routes are registered under /tools', () => {
    expect(SOURCE).toContain("'/tools/site-checker'");
    expect(SOURCE).toContain("'/tools/ip-lookup'");
  });

  test('neither is registered at the root', () => {
    expect(SOURCE).not.toContain("      '/site-checker',");
    expect(SOURCE).not.toContain("      '/ip-lookup',");
  });
});
