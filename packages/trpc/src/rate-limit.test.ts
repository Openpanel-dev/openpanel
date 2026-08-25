import { describe, expect, it } from 'vitest';
import { __testing } from './rate-limit';

const { getBlockDurationMs, BLOCK_BASE_MS, BLOCK_MAX_MS, MAX_STRIKES } =
  __testing;

describe('rate limit escalation', () => {
  it('doubles the lockout on every strike', () => {
    expect(getBlockDurationMs(1)).toBe(BLOCK_BASE_MS);
    expect(getBlockDurationMs(2)).toBe(BLOCK_BASE_MS * 2);
    expect(getBlockDurationMs(3)).toBe(BLOCK_BASE_MS * 4);
    expect(getBlockDurationMs(4)).toBe(BLOCK_BASE_MS * 8);
  });

  it('caps the lockout instead of overflowing into absurd durations', () => {
    expect(getBlockDurationMs(MAX_STRIKES)).toBe(BLOCK_MAX_MS);
    expect(getBlockDurationMs(1000)).toBe(BLOCK_MAX_MS);
  });

  it('reaches the cap at MAX_STRIKES and not before', () => {
    expect(getBlockDurationMs(MAX_STRIKES - 1)).toBeLessThan(BLOCK_MAX_MS);
  });

  it('formats the wait as something a human can act on', () => {
    expect(__testing.formatDuration(30_000)).toBe('30 seconds');
    expect(__testing.formatDuration(5 * 60_000)).toBe('5 minutes');
    expect(__testing.formatDuration(24 * 60 * 60_000)).toBe('24 hours');
  });
});
