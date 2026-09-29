// The `/tools` prefix came from a wrapper that mounted the router under
// `/tools`, over a router whose own urls were bare. `defineRoutes` has no
// prefix mechanism, so the port dropped the segment and both routes answered
// at the root — apps/public's own pages call `${API_URL}/tools/ip-lookup`
// and were 404ing. Nothing covered the path, which is why it slipped.

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
