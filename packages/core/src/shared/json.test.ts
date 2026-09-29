// Subject moved to @openpanel/shared; the suite did not follow it, since
// nothing runs a `test` script in packages/shared yet and the root `test`
// script names its four workspaces explicitly. Move this file once that
// script can include packages/shared.
import { describe, expect, test } from 'bun:test';
import { getSafeJson, getSuperJson, setSuperJson } from '@openpanel/shared';

describe('getSafeJson', () => {
  test('parses valid JSON', () => {
    expect(getSafeJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  test('returns null instead of throwing on invalid JSON', () => {
    expect(getSafeJson('not json')).toBeNull();
  });
});

describe('setSuperJson / getSuperJson', () => {
  test('round-trips a Date through the superjson envelope', () => {
    const original = { at: new Date('2026-01-01T00:00:00.000Z') };
    const serialized = setSuperJson(original);
    const restored = getSuperJson<typeof original>(serialized);
    expect(restored?.at).toBeInstanceOf(Date);
    expect(restored?.at.toISOString()).toBe(original.at.toISOString());
  });

  test('falls back to plain JSON.parse for a non-superjson payload', () => {
    expect(getSuperJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  test('returns null for invalid input', () => {
    expect(getSuperJson('not json')).toBeNull();
  });
});
