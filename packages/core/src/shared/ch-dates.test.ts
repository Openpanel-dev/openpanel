// The range boundaries the query builders bind. Two shapes arrive: the
// dashboard's `YYYY-MM-DD HH:mm:ss` (already widened to the day's edges by
// report/src/chart-dates.ts) and the MCP tools' bare `YYYY-MM-DD`.

import { describe, expect, test } from 'bun:test';
import { toRangeBoundaryDate, toRangeBoundaryLiteral } from './ch-dates';

describe('toRangeBoundaryLiteral', () => {
  test('a bare date names the whole day', () => {
    expect(toRangeBoundaryLiteral('2026-08-01', 'start')).toBe(
      '2026-08-01 00:00:00'
    );
    // Midnight here is what dropped the last day of every MCP range.
    expect(toRangeBoundaryLiteral('2026-08-31', 'end')).toBe(
      '2026-08-31 23:59:59'
    );
  });

  test('a single-day range covers that day rather than an empty instant', () => {
    const start = toRangeBoundaryLiteral('2026-08-15', 'start');
    const end = toRangeBoundaryLiteral('2026-08-15', 'end');
    expect(start).not.toBe(end);
    expect(start < end).toBe(true);
  });

  test('a ClickHouse literal passes through untouched in either direction', () => {
    // `new Date('2026-08-31 23:59:59')` reads local time, so the old
    // round-trip shifted this by the server's offset and silently truncated
    // the range on any non-UTC deployment.
    for (const boundary of ['start', 'end'] as const) {
      expect(toRangeBoundaryLiteral('2026-08-31 23:59:59', boundary)).toBe(
        '2026-08-31 23:59:59'
      );
      expect(toRangeBoundaryLiteral('2026-08-01 00:00:00', boundary)).toBe(
        '2026-08-01 00:00:00'
      );
    }
  });

  test('an ISO instant becomes its UTC ClickHouse literal', () => {
    expect(toRangeBoundaryLiteral('2026-08-31T12:34:56.000Z', 'end')).toBe(
      '2026-08-31 12:34:56'
    );
  });
});

describe('toRangeBoundaryDate', () => {
  test('narrows to the calendar day without moving it', () => {
    expect(toRangeBoundaryDate('2026-08-31', 'end')).toBe('2026-08-31');
    expect(toRangeBoundaryDate('2026-08-31 23:59:59', 'end')).toBe(
      '2026-08-31'
    );
    expect(toRangeBoundaryDate('2026-08-01', 'start')).toBe('2026-08-01');
  });
});
