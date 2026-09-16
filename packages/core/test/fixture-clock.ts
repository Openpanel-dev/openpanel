// The clock that seeds and queries the shared test/fixtures.ts dataset.
//
// The seeder places events at `now - N days - M minutes` and several tests
// bucket by calendar day, so a `now` within minutes of UTC midnight splits one
// seeded day across two buckets. Pinning `now` to a fixed time of day keeps
// every seeded offset inside its own day, whatever time the suite runs.
//
// The anchor is a time of day rather than a fixed calendar date because some
// services under test compare against ClickHouse's own `now()` (the 3-month
// project card, `inactiveDays`, last-seen buckets), which this cannot fake.
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
