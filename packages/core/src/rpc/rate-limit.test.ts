import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { __testing } from './rate-limit';

const { getBlockDurationMs, BLOCK_BASE_MS, BLOCK_MAX_MS, MAX_STRIKES } =
  __testing;

describe('rate limit escalation', () => {
  test('doubles the lockout on every strike', () => {
    expect([1, 2, 3, 4].map(getBlockDurationMs)).toEqual([
      BLOCK_BASE_MS,
      BLOCK_BASE_MS * 2,
      BLOCK_BASE_MS * 4,
      BLOCK_BASE_MS * 8,
    ]);
  });

  test('caps the lockout instead of overflowing into absurd durations', () => {
    expect(getBlockDurationMs(MAX_STRIKES)).toBe(BLOCK_MAX_MS);
    expect(getBlockDurationMs(1000)).toBe(BLOCK_MAX_MS);
  });

  test('reaches the cap at MAX_STRIKES and not before', () => {
    expect(getBlockDurationMs(MAX_STRIKES - 1)).toBeLessThan(BLOCK_MAX_MS);
  });

  test('formats the wait as something a human can act on', () => {
    expect(__testing.formatDuration(30_000)).toBe('30 seconds');
    expect(__testing.formatDuration(5 * 60_000)).toBe('5 minutes');
    expect(__testing.formatDuration(24 * 60 * 60_000)).toBe('24 hours');
  });
});

// V1's limits, procedure for procedure (packages/trpc/src/routers/auth.ts).
const V1_AUTH_LIMITS: Record<string, { max: number; windowMs: number }> = {
  signUpEmail: { max: 5, windowMs: 60_000 },
  signInEmail: { max: 3, windowMs: 30_000 },
  signInTotp: { max: 5, windowMs: 60_000 },
  totpEnable: { max: 5, windowMs: 60_000 },
  totpDisable: { max: 5, windowMs: 60_000 },
  totpRegenerateRecoveryCodes: { max: 3, windowMs: 60_000 },
  resetPassword: { max: 3, windowMs: 60_000 },
  requestResetPassword: { max: 3, windowMs: 60_000 },
  signInShare: { max: 3, windowMs: 30_000 },
};

describe("the auth router mounts V1's limits", () => {
  const source = readFileSync(
    new URL('../modules/auth/auth.rpc.ts', import.meta.url),
    'utf8'
  );

  test("every throttled procedure still declares V1's numbers", () => {
    for (const [name, limit] of Object.entries(V1_AUTH_LIMITS)) {
      const declaration = new RegExp(
        `${name}: (?:public|protected)Procedure\\s*\\n\\s*\\.use\\(\\s*rateLimit\\(\\{ max: (\\d+), windowMs: ([\\d_]+) \\}\\)\\s*\\)`
      ).exec(source);

      expect([name, declaration?.[1], declaration?.[2]]).toEqual([
        name,
        String(limit.max),
        String(limit.windowMs).replace(/\B(?=(\d{3})+(?!\d))/g, '_'),
      ]);
    }
  });
});
