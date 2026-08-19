import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveMaxLookbackDays } from './lookback';

describe('resolveMaxLookbackDays', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the caller default when unset', () => {
    vi.stubEnv('EVENT_LIST_MAX_LOOKBACK_DAYS', '');
    expect(resolveMaxLookbackDays('EVENT_LIST_MAX_LOOKBACK_DAYS', 365 * 5)).toBe(
      365 * 5,
    );
    expect(resolveMaxLookbackDays('SESSION_LIST_MAX_LOOKBACK_DAYS', 365)).toBe(
      365,
    );
  });

  it('replaces the ceiling when set to a positive integer', () => {
    vi.stubEnv('EVENT_LIST_MAX_LOOKBACK_DAYS', '7');
    expect(resolveMaxLookbackDays('EVENT_LIST_MAX_LOOKBACK_DAYS', 365 * 5)).toBe(
      7,
    );
    // Raising past the default is allowed too — it's a ceiling, not a min.
    vi.stubEnv('SESSION_LIST_MAX_LOOKBACK_DAYS', '3650');
    expect(resolveMaxLookbackDays('SESSION_LIST_MAX_LOOKBACK_DAYS', 365)).toBe(
      3650,
    );
  });

  it('reads each list its own variable — no cross-talk', () => {
    vi.stubEnv('EVENT_LIST_MAX_LOOKBACK_DAYS', '7');
    expect(resolveMaxLookbackDays('SESSION_LIST_MAX_LOOKBACK_DAYS', 365)).toBe(
      365,
    );
  });

  it('falls back to the default for malformed values', () => {
    for (const bad of ['0', '-1', '7.5', '7days', 'junk']) {
      vi.stubEnv('EVENT_LIST_MAX_LOOKBACK_DAYS', bad);
      expect(
        resolveMaxLookbackDays('EVENT_LIST_MAX_LOOKBACK_DAYS', 365),
      ).toBe(365);
    }
  });
});
