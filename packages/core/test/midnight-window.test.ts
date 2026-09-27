// Proof that the midnight fixture flake is gone: runs the two suites it hit
// (see test/fixture-clock.ts) in child processes whose wall clock is frozen
// inside the 00:00-00:25 UTC window where they used to fail.
//
// The children share the suites' fixture project ids, so they run one at a
// time; bun runs test files sequentially, so no sibling file overlaps them.
import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'bun';
import { join } from 'node:path';
import { WALL_CLOCK_PINNED_MARKER } from './wall-clock.constants';

const CORE_DIR = join(import.meta.dir, '..');
const WALL_CLOCK_PRELOAD = join(import.meta.dir, 'wall-clock-preload.ts');
const MIDNIGHT_FLAKE_SUITES = [
  'src/modules/chart/chart.service.test.ts',
  'src/modules/mcp/src/integration/tools.test.ts',
];
// A floor, not an exact count: this asserted `54 pass` and went red the moment
// someone added a test to either child suite, which says nothing about the
// midnight window. The floor still proves both suites actually ran.
const MIDNIGHT_FLAKE_SUITE_MIN_TESTS = 54;
const PASS_COUNT = /(\d+) pass/;
// 00:01 is inside the chart pair's window, 00:10 and 00:19 inside charlie's.
// Only the TIME of day is the subject here; the date must track the calendar.
// `inactiveDays` and the last-seen buckets compare against ClickHouse's own
// `now()`, which `setSystemTime` cannot fake (test/fixture-clock.ts says so),
// so a hardcoded date drifts further from it every day until the suites fail.
// Measured on the current fixtures: 26 h of drift still passes, 30 h does not.
const IN_WINDOW_UTC_TIMES = ['00:01', '00:10', '00:19'] as const;

/**
 * The most recent occurrence of `HH:MM` UTC that is not in the future, so the
 * child's clock trails ClickHouse by at most 24 h whatever day this runs.
 */
function mostRecentUtcTime(hourMinute: string, now: Date = new Date()): string {
  const [hours, minutes] = hourMinute.split(':').map(Number);
  const pinned = new Date(now);
  pinned.setUTCHours(hours ?? 0, minutes ?? 0, 0, 0);
  if (pinned > now) {
    pinned.setUTCDate(pinned.getUTCDate() - 1);
  }
  return pinned.toISOString();
}

const CHILD_RUN_TIMEOUT_MS = 120_000;

function runSuitesAt(wallClockIso: string) {
  const child = spawnSync(
    ['bun', 'test', '--isolate', ...MIDNIGHT_FLAKE_SUITES],
    {
      cwd: CORE_DIR,
      env: {
        ...process.env,
        BUN_OPTIONS: `--preload=${WALL_CLOCK_PRELOAD}`,
        FIXTURE_WALL_CLOCK_ISO: wallClockIso,
      },
    }
  );
  return {
    exitCode: child.exitCode,
    output: `${child.stdout.toString()}${child.stderr.toString()}`,
  };
}

describe('mcp/chart fixture suites inside the midnight window', () => {
  for (const hourMinute of IN_WINDOW_UTC_TIMES) {
    const wallClockIso = mostRecentUtcTime(hourMinute);
    it(
      `pass with the wall clock at ${hourMinute} UTC (${wallClockIso})`,
      () => {
        const { exitCode, output } = runSuitesAt(wallClockIso);
        expect(output).toContain(`${WALL_CLOCK_PINNED_MARKER} ${wallClockIso}`);
        expect(
          Number(PASS_COUNT.exec(output)?.[1] ?? 0)
        ).toBeGreaterThanOrEqual(MIDNIGHT_FLAKE_SUITE_MIN_TESTS);
        expect(output).toContain(' 0 fail');
        expect(exitCode).toBe(0);
      },
      CHILD_RUN_TIMEOUT_MS
    );
  }
});

// The rot this replaced was a hardcoded date, so the derivation itself is
// asserted rather than left to the calendar to disprove a year from now.
const HOURS_IN_A_DAY = 24;
const MS_PER_HOUR = 3_600_000;

describe('mostRecentUtcTime', () => {
  it('keeps the time of day and never returns a future instant', () => {
    for (const now of [
      new Date('2027-03-01T00:00:30.000Z'), // before 00:01 — must step back a day
      new Date('2027-03-01T12:00:00.000Z'),
      new Date('2027-12-31T23:59:59.000Z'),
    ]) {
      for (const hourMinute of IN_WINDOW_UTC_TIMES) {
        const pinned = new Date(mostRecentUtcTime(hourMinute, now));
        expect(pinned.toISOString()).toContain(`T${hourMinute}:00.000Z`);
        expect(pinned.getTime()).toBeLessThanOrEqual(now.getTime());
        expect(now.getTime() - pinned.getTime()).toBeLessThan(
          HOURS_IN_A_DAY * MS_PER_HOUR
        );
      }
    }
  });
});
