/**
 * Unit tests for mergeGlobalFilters — the helper that combines report-level
 * global filters with each event series' own filters (AND semantics). Pure
 * function, no ClickHouse/Postgres needed. Ported from
 * packages/db/src/services/reports.service.test.ts (M7-006), vitest -> bun:test.
 * M10-003 moved the helper to ./src/series.ts — see that file for why.
 */
import { describe, expect, it } from 'bun:test';
import type { IChartEventFilter, IChartEventItem } from './report.constants';
import { mergeGlobalFilters } from './src/series';

const globalFilter: IChartEventFilter = {
  id: 'g1',
  name: 'country',
  operator: 'is',
  value: ['US'],
  type: 'string',
};

const eventFilter: IChartEventFilter = {
  id: 'e1',
  name: 'path',
  operator: 'is',
  value: ['/pricing'],
  type: 'string',
};

const eventSeries: IChartEventItem = {
  type: 'event',
  id: 'A',
  name: 'screen_view',
  segment: 'event',
  filters: [eventFilter],
};

const formulaSeries: IChartEventItem = {
  type: 'formula',
  id: 'B',
  formula: 'A/A',
};

describe('mergeGlobalFilters', () => {
  it('prepends global filters to each event series (AND combine)', () => {
    const [merged] = mergeGlobalFilters([eventSeries], [globalFilter]) as [
      IChartEventItem & { type: 'event' },
    ];
    expect(merged.filters).toEqual([globalFilter, eventFilter]);
  });

  it('leaves formula series untouched', () => {
    const [, formula] = mergeGlobalFilters(
      [eventSeries, formulaSeries],
      [globalFilter]
    );
    expect(formula).toBe(formulaSeries);
  });

  it('returns the original series when there are no global filters', () => {
    const series = [eventSeries];
    expect(mergeGlobalFilters(series, [])).toBe(series);
    expect(mergeGlobalFilters(series, undefined)).toBe(series);
  });

  it('does not mutate the input series filters', () => {
    mergeGlobalFilters([eventSeries], [globalFilter]);
    expect(eventSeries.filters).toEqual([eventFilter]);
  });
});
