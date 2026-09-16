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
const MIDNIGHT_FLAKE_SUITE_TEST_COUNT = 54;
// 00:01 is inside the chart pair's window, 00:10 and 00:19 inside charlie's.
const IN_WINDOW_WALL_CLOCKS = [
  '2026-09-16T00:01:00.000Z',
  '2026-09-16T00:10:00.000Z',
  '2026-09-16T00:19:00.000Z',
];
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
  for (const wallClockIso of IN_WINDOW_WALL_CLOCKS) {
    it(
      `pass with the wall clock at ${wallClockIso}`,
      () => {
        const { exitCode, output } = runSuitesAt(wallClockIso);
        expect(output).toContain(`${WALL_CLOCK_PINNED_MARKER} ${wallClockIso}`);
        expect(output).toContain(` ${MIDNIGHT_FLAKE_SUITE_TEST_COUNT} pass`);
        expect(output).toContain(' 0 fail');
        expect(exitCode).toBe(0);
      },
      CHILD_RUN_TIMEOUT_MS
    );
  }
});
