import { afterEach, describe, expect, it } from 'bun:test';
import { resolveMaxLookbackDays } from './lookback';

function withEnv(name: string, value: string | undefined, fn: () => void) {
  const previous = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
  try {
    fn();
  } finally {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  }
}

describe('resolveMaxLookbackDays', () => {
  afterEach(() => {
    delete process.env.EVENT_LIST_MAX_LOOKBACK_DAYS;
    delete process.env.SESSION_LIST_MAX_LOOKBACK_DAYS;
  });

  it('returns the caller default when unset', () => {
    withEnv('EVENT_LIST_MAX_LOOKBACK_DAYS', '', () => {
      expect(
        resolveMaxLookbackDays('EVENT_LIST_MAX_LOOKBACK_DAYS', 365 * 5)
      ).toBe(365 * 5);
      expect(
        resolveMaxLookbackDays('SESSION_LIST_MAX_LOOKBACK_DAYS', 365)
      ).toBe(365);
    });
  });

  it('replaces the ceiling when set to a positive integer', () => {
    withEnv('EVENT_LIST_MAX_LOOKBACK_DAYS', '7', () => {
      expect(
        resolveMaxLookbackDays('EVENT_LIST_MAX_LOOKBACK_DAYS', 365 * 5)
      ).toBe(7);
    });
    // Raising past the default is allowed too — it's a ceiling, not a min.
    withEnv('SESSION_LIST_MAX_LOOKBACK_DAYS', '3650', () => {
      expect(
        resolveMaxLookbackDays('SESSION_LIST_MAX_LOOKBACK_DAYS', 365)
      ).toBe(3650);
    });
  });

  it('reads each list its own variable — no cross-talk', () => {
    withEnv('EVENT_LIST_MAX_LOOKBACK_DAYS', '7', () => {
      expect(
        resolveMaxLookbackDays('SESSION_LIST_MAX_LOOKBACK_DAYS', 365)
      ).toBe(365);
    });
  });

  it('falls back to the default for malformed values', () => {
    for (const bad of ['0', '-1', '7.5', '7days', 'junk']) {
      withEnv('EVENT_LIST_MAX_LOOKBACK_DAYS', bad, () => {
        expect(
          resolveMaxLookbackDays('EVENT_LIST_MAX_LOOKBACK_DAYS', 365)
        ).toBe(365);
      });
    }
  });
});
