// Subject moved to @openpanel/shared (M15-010, ADR-022 R21); the suite did
// not follow it. Nothing runs a `test` script in packages/shared yet — the
// root `test` script names its four workspaces explicitly and root
// package.json was outside M15-010's scope — so moving this file would take
// it out of every gate. Move it when that line can gain the filter.
import { describe, expect, it } from 'bun:test';
import { slug } from '@openpanel/shared';

describe('slug', () => {
  it('should remove pipes from string', () => {
    expect(slug('Hello || World, | Test å å ä ä')).toBe(
      'hello-world-test-a-a-a-a'
    );
  });
});
