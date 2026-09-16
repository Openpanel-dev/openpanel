# Midnight fixture flake — proof (M35-001)

## The flake

Around 00:00–00:25 UTC, three tests failed because `test/fixtures.ts` seeds at
`Date.now() - N days - M minutes` while the assertions bucket by calendar day:

- `get_profile_metrics > returns exact metrics for charlie` (`uniqueDaysActive` 1 vs 2)
- `getChartBucketProfiles > returns the profiles behind one data point, honoring breakdowns`
- `getChartBucketProfiles > selects only whitelisted profile columns for profile.* references`

## The fix

- `test/fixture-clock.ts`: `pinFixtureClock()` freezes `Date` (bun's
  `setSystemTime`) at the latest 12:00 UTC not after now. `releaseFixtureClock()`
  unfreezes it. Every seeded offset then lands inside one calendar day.
- `chart.service.test.ts` and `mcp/src/integration/tools.test.ts` pin the clock
  before `setupFixtures` and release it in `afterAll`. The two
  `getChartBucketProfiles` cases compute "two days ago" from `fixtureNow`, not
  `Date.now()`.
- `test/fixture-clock.test.ts` unit-tests the anchor. Its last case shows that
  charlie's seeded span covers two calendar days at 00:10 under the raw clock
  and one day under the anchor.
- `test/midnight-window.test.ts` re-runs both suites in child processes with the
  wall clock frozen at 00:01, 00:10 and 00:19 UTC, via
  `test/wall-clock-preload.ts`. It runs in every `bun run test`, so this proof
  is repeated on every run, not just recorded once.

The anchor is a time of day, not a fixed calendar date. Some services compare
against ClickHouse's own `now()` (the 3-month project card, `inactiveDays`,
last-seen buckets), and bun cannot fake that clock. The anchor is never in the
future and never more than 24 h old, so every `now`-relative window still
contains the fixtures.

**Limitation:** the in-window runs below fake only the JS clock. ClickHouse
`now()` was the real time (≈11:11 UTC on 2026-09-16), so the JS-to-ClickHouse
clock gap in these runs is ≈23 h. In a real 00:10 run the gap is ≈12 h. Both
gaps are inside the 24 h bound above.

All runs below were executed on 2026-09-16 on this box, from
`packages/core`. `test/preload.ts` (bunfig `[test] preload`, also imported by
`wall-clock-preload.ts`) pins the infra URLs to the isolated
`openpanel_test` Postgres/ClickHouse databases. Output is filtered with
`grep -E "wall clock pinned|\(fail\)|^ *[0-9]+ (pass|fail)|expect\(\) calls|^Ran "`.

## 1. Clock faked INTO the 00:00–00:25 UTC window — passing

Command (run 2026-09-16T11:11:01Z–11:11:30Z):

```bash
cd packages/core
for t in 2026-09-16T00:01:00.000Z 2026-09-16T00:10:00.000Z 2026-09-16T00:19:00.000Z; do
  FIXTURE_WALL_CLOCK_ISO=$t \
  BUN_OPTIONS="--preload=$PWD/test/wall-clock-preload.ts" \
  bun test --isolate src/modules/chart/chart.service.test.ts \
    src/modules/mcp/src/integration/tools.test.ts
done
```

Output:

```text
=== FIXTURE_WALL_CLOCK_ISO=2026-09-16T00:01:00.000Z
wall clock pinned at 2026-09-16T00:01:00.000Z
wall clock pinned at 2026-09-16T00:01:00.000Z
 54 pass
 0 fail
 160 expect() calls
Ran 54 tests across 2 files. [10.26s]
exit=0
=== FIXTURE_WALL_CLOCK_ISO=2026-09-16T00:10:00.000Z
wall clock pinned at 2026-09-16T00:10:00.000Z
wall clock pinned at 2026-09-16T00:10:00.000Z
 54 pass
 0 fail
 160 expect() calls
Ran 54 tests across 2 files. [10.05s]
exit=0
=== FIXTURE_WALL_CLOCK_ISO=2026-09-16T00:19:00.000Z
wall clock pinned at 2026-09-16T00:19:00.000Z
wall clock pinned at 2026-09-16T00:19:00.000Z
 54 pass
 0 fail
 160 expect() calls
Ran 54 tests across 2 files. [9.14s]
exit=0
```

The `wall clock pinned at` line is printed once per test file (`--isolate`).
It shows that each suite ran with the faked time.

## 2. The same suites at a normal hour — passing

Command (real clock, run 2026-09-16T11:11:35Z–11:11:45Z):

```bash
cd packages/core
bun test --isolate src/modules/chart/chart.service.test.ts \
  src/modules/mcp/src/integration/tools.test.ts
```

Output:

```text
 54 pass
 0 fail
 160 expect() calls
Ran 54 tests across 2 files. [9.87s]
exit=0
```

## 3. Negative control — the same in-window runs WITHOUT the fix

The two suite files were temporarily replaced with their `HEAD` versions
(`git show HEAD:<file> > <file>`) and restored afterwards. The rest of the
command matches section 1 (run 2026-09-16T11:11:51Z–11:12:24Z). Each run fails
on exactly the documented flake tests and nothing else:

```text
=== FIXTURE_WALL_CLOCK_ISO=2026-09-16T00:01:00.000Z (fix reverted)
(fail) getChartBucketProfiles > returns the profiles behind one data point, honoring breakdowns [11.33ms]
(fail) getChartBucketProfiles > selects only whitelisted profile columns for profile.* references [9.43ms]
(fail) get_profile_metrics > returns exact metrics for charlie [17.57ms]
 51 pass
 3 fail
Ran 54 tests across 2 files. [11.09s]
exit=1
=== FIXTURE_WALL_CLOCK_ISO=2026-09-16T00:10:00.000Z (fix reverted)
(fail) get_profile_metrics > returns exact metrics for charlie [26.26ms]
 53 pass
 1 fail
Ran 54 tests across 2 files. [10.98s]
exit=1
=== FIXTURE_WALL_CLOCK_ISO=2026-09-16T00:19:00.000Z (fix reverted)
(fail) get_profile_metrics > returns exact metrics for charlie [15.67ms]
 53 pass
 1 fail
Ran 54 tests across 2 files. [10.79s]
exit=1
```

So the fake clock does reproduce the flake, and the passes in section 1 come
from the fix.

## 4. The committed guard tests

Command (run 2026-09-16T11:12:32Z–11:13:04Z):

```bash
cd packages/core
bun test --isolate test/fixture-clock.test.ts test/midnight-window.test.ts
```

Output:

```text
 6 pass
 0 fail
 18 expect() calls
Ran 6 tests across 2 files. [32.45s]
exit=0
```

## 5. Full gate on this tree

`verification/full.sh` was run from the controller, 2026-09-16T11:13:41Z to
11:19:12Z, with exit 0. Excerpt:

```text
OK: bun run test
GOLDEN: the only differing case(s) are known non-deterministic holes: insights-event-property-values
GOLDEN: every other case matched byte-exact. Passing.
OK: golden/compare
OK: golden/openapi v2-diff.sh
FULL: green
```

`openpanel.events` on the prod copy read 321,191,947 before this run and
321,191,957 after. The e2e ingestion added rows, and none were lost.

## What this does not cover

- The fix covers only the two suites that seed `test/fixtures.ts` from
  packages/core: `chart.service.test.ts` and `mcp/src/integration/tools.test.ts`.
  `test/fixtures.ts` is unchanged, and no other consumer of it (V1's root
  suites, apps/api) was touched.
- `verification/midnight-flake` (the M34-001 guard) is unchanged. It is still
  the safety net.
- The children in `midnight-window.test.ts` use the same fixture project ids
  as the suites they re-run. This is safe only because bun runs test files one
  at a time.
