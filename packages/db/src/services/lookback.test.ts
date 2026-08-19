import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveMaxLookbackDays } from './lookback';

describe('resolveMaxLookbackDays', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the caller default when unset', () => {
    vi.stubEnv('MAX_LOOKBACK_DAYS', '');
    expect(resolveMaxLookbackDays(365)).toBe(365);
    expect(resolveMaxLookbackDays(365 * 5)).toBe(365 * 5);
  });

  it('replaces the ceiling when set to a positive integer', () => {
    vi.stubEnv('MAX_LOOKBACK_DAYS', '7');
    expect(resolveMaxLookbackDays(365 * 5)).toBe(7);
    // Raising past the default is allowed too — it's a ceiling, not a min.
    vi.stubEnv('MAX_LOOKBACK_DAYS', '3650');
    expect(resolveMaxLookbackDays(365)).toBe(3650);
  });

  it('falls back to the default for malformed values', () => {
    for (const bad of ['0', '-1', '7.5', '7days', 'junk']) {
      vi.stubEnv('MAX_LOOKBACK_DAYS', bad);
      expect(resolveMaxLookbackDays(365)).toBe(365);
    }
  });
});
