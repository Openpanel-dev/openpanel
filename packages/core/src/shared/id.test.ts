// Tests @openpanel/shared's id helpers from here because the root `test` script
// does not run packages/shared.
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
