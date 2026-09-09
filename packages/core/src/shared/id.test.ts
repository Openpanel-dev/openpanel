// Subject moved to @openpanel/shared (M15-010, ADR-022 R21); the suite did
// not follow it. Nothing runs a `test` script in packages/shared yet — the
// root `test` script names its four workspaces explicitly and root
// package.json was outside M15-010's scope — so moving this file would take
// it out of every gate. Move it when that line can gain the filter.
import { describe, expect, test } from 'bun:test';
import { generateId, shortId } from '@openpanel/shared';

describe('shortId', () => {
  test('is 4 characters', () => {
    expect(shortId()).toHaveLength(4);
  });

  test('is not the same twice in a row', () => {
    expect(shortId()).not.toBe(shortId());
  });
});

describe('generateId', () => {
  test('defaults to an 8-character id with no prefix', () => {
    expect(generateId()).toHaveLength(8);
  });

  test('prefixes with an underscore', () => {
    expect(generateId('evt')).toMatch(/^evt_.{8}$/);
  });

  test('honours a custom length, prefixed or not', () => {
    expect(generateId(undefined, 21)).toHaveLength(21);
    expect(generateId('req', 21)).toMatch(/^req_.{21}$/);
  });
});
