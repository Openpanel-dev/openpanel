import { describe, expect, it } from 'vitest';
import { FunnelService } from './funnel.service';

// toSeries is pure — it only reshapes rows — so the client is never touched.
const service = new FunnelService({} as any);

const BREAKDOWNS = [{ name: 'path' }];

/**
 * The funnel query is ordered by `level DESC`, so every level-5 row arrives
 * before any level-4 row, and so on. Rows are shaped as the query returns them.
 */
const rowsOrderedByLevelDesc = (
  paths: string[],
  perLevel: Record<number, number>,
) =>
  [5, 4, 3, 2, 1].flatMap((level) =>
    paths.map((path) => ({
      level,
      count: perLevel[level]!,
      b_0: path,
    })),
  );

describe('FunnelService.toSeries', () => {
  it('keeps every level of a series once the limit is reached', () => {
    // 3 paths but a limit of 2: the third is dropped, the first two must still
    // carry all five of their levels.
    const rows = rowsOrderedByLevelDesc(
      ['/a', '/b', '/c'],
      { 5: 128, 4: 22, 3: 1, 2: 105, 1: 67 },
    );

    const series = service.toSeries(rows, BREAKDOWNS, 2);

    expect(series).toHaveLength(2);
    for (const s of series) {
      expect(s.map((row) => row.level).sort()).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it('caps the number of series at the limit', () => {
    const rows = rowsOrderedByLevelDesc(
      ['/a', '/b', '/c', '/d'],
      { 5: 1, 4: 1, 3: 1, 2: 1, 1: 1 },
    );

    expect(service.toSeries(rows, BREAKDOWNS, 2)).toHaveLength(2);
    expect(service.toSeries(rows, BREAKDOWNS, 4)).toHaveLength(4);
    expect(service.toSeries(rows, BREAKDOWNS, undefined)).toHaveLength(4);
  });

  it('does not flatten a funnel into an all-100% series when limited', () => {
    // Regression: dropping the lower-level rows left each series holding only
    // its deepest level, which fillFunnel then accumulated into every step —
    // rendering an identical count at 100% for all steps.
    const rows = rowsOrderedByLevelDesc(
      ['/a', '/b'],
      { 5: 128, 4: 22, 3: 1, 2: 105, 1: 67 },
    );

    const [first] = service.toSeries(rows, BREAKDOWNS, 1);

    expect(first).toBeDefined();
    const counts = first!
      .sort((a, b) => a.level - b.level)
      .map((row) => row.count);
    // 67, 105, 1, 22, 128 — distinct per level, not five copies of 128.
    expect(counts).toEqual([67, 105, 1, 22, 128]);
    expect(new Set(counts).size).toBeGreaterThan(1);
  });

  it('returns a single series when there are no breakdowns', () => {
    const rows = [
      { level: 2, count: 5 },
      { level: 1, count: 9 },
    ];

    const series = service.toSeries(rows, [], 1);

    expect(series).toHaveLength(1);
    expect(series[0]).toHaveLength(2);
  });
});
