// The clock that seeds and queries the shared test/fixtures.ts dataset. The
// seeder places events at `now - N days - M minutes` and tests bucket by
// calendar day, so a `now` near UTC midnight would split one seeded day across
// two buckets; pinning the time of day avoids that. The anchor is a time of day,
// not a date, because some services compare against ClickHouse's own `now()`
// (the 3-month project card, `inactiveDays`, last-seen buckets), which this
// cannot fake.
import { setSystemTime } from 'bun:test';

const FIXTURE_ANCHOR_HOUR_UTC = 12;

/** The latest 12:00 UTC not after `now`, so no fixture lands in ClickHouse's future. */
export function fixtureAnchor(now: Date = new Date()): Date {
  const anchor = new Date(now);
  anchor.setUTCHours(FIXTURE_ANCHOR_HOUR_UTC, 0, 0, 0);
  if (anchor > now) {
    anchor.setUTCDate(anchor.getUTCDate() - 1);
  }
  return anchor;
}

/** Freezes `Date` at the fixture anchor; call before seeding. */
export function pinFixtureClock(): Date {
  const anchor = fixtureAnchor();
  setSystemTime(anchor);
  return anchor;
}

export function releaseFixtureClock(): void {
  setSystemTime();
}
