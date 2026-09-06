// Ported from packages/core/src/shared/id.test.ts's `describe('shortId')`
// block — the only id.test.ts coverage relevant here, since generateId
// isn't one of the seven utilities copied into this file.
import { describe, expect, test } from 'vitest';
import { shortId } from './math';

describe('shortId', () => {
  test('is 4 characters', () => {
    expect(shortId()).toHaveLength(4);
  });

  test('is not the same twice in a row', () => {
    expect(shortId()).not.toBe(shortId());
  });
});
