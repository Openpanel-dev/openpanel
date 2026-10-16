import { describe, expect, it } from 'bun:test';
import { fixtureAnchor } from './fixture-clock';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
// test/fixtures.ts seeds charlie's events at `now - 5d - {20..0} min`.
const CHARLIE_DAYS_AGO = 5;
const CHARLIE_SPREAD_MINUTES = 20;

function utcDay(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

function charlieSeedDays(now: Date): Set<string> {
  const newest = now.getTime() - CHARLIE_DAYS_AGO * DAY_MS;
  return new Set([
    utcDay(newest - CHARLIE_SPREAD_MINUTES * MINUTE_MS),
    utcDay(newest),
  ]);
}

describe('fixtureAnchor', () => {
  it('is today 12:00 UTC from noon onward', () => {
    expect(fixtureAnchor(new Date('2026-09-16T12:00:00Z')).toISOString()).toBe(
      '2026-09-16T12:00:00.000Z'
    );
    expect(fixtureAnchor(new Date('2026-09-16T23:59:59Z')).toISOString()).toBe(
      '2026-09-16T12:00:00.000Z'
    );
  });

  it('is yesterday 12:00 UTC before noon, so it never lies in the future', () => {
    expect(fixtureAnchor(new Date('2026-09-16T00:10:00Z')).toISOString()).toBe(
      '2026-09-15T12:00:00.000Z'
    );
    expect(fixtureAnchor(new Date('2026-09-16T11:59:59Z')).toISOString()).toBe(
      '2026-09-15T12:00:00.000Z'
    );
  });

  it('keeps a seeded day in one calendar day where the raw clock splits it', () => {
    const insideMidnightWindow = new Date('2026-09-16T00:10:00Z');
    expect(charlieSeedDays(insideMidnightWindow).size).toBe(2);
    expect(charlieSeedDays(fixtureAnchor(insideMidnightWindow)).size).toBe(1);
  });
});
