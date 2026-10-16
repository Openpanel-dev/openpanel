import { describe, expect, it } from 'bun:test';
import { checkRateLimit } from './rate-limit';

describe('checkRateLimit', () => {
  it('allows requests under the limit and blocks the next one', () => {
    const key = `test:${crypto.randomUUID()}`;
    expect(checkRateLimit(key, 60_000, 2)).toBe(true);
    expect(checkRateLimit(key, 60_000, 2)).toBe(true);
    expect(checkRateLimit(key, 60_000, 2)).toBe(false);
  });

  it('tracks independent keys separately', () => {
    const a = `test:${crypto.randomUUID()}`;
    const b = `test:${crypto.randomUUID()}`;
    expect(checkRateLimit(a, 60_000, 1)).toBe(true);
    expect(checkRateLimit(a, 60_000, 1)).toBe(false);
    expect(checkRateLimit(b, 60_000, 1)).toBe(true);
  });
});
