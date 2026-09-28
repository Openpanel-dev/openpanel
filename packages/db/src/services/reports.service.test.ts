/**
 * Unit tests for mergeGlobalFilters — the helper that combines report-level
 * global filters with each event series' own filters (AND semantics). Pure
 * function, no ClickHouse/Postgres needed.
 */
import type { IChartEventFilter, IChartEventItem } from '@openpanel/validation';
import { describe, expect, it } from 'vitest';
import { mergeGlobalFilters, transformFilter } from './reports.service';

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
      [globalFilter],
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

describe('transformFilter', () => {
  it('keeps the cast type so a saved date filter stays a date filter', () => {
    const result = transformFilter(
      {
        id: 'f1',
        name: 'profile.properties.subscription_expire',
        operator: 'gte',
        value: ['2026-09-27'],
        type: 'date',
      },
      0,
    );
    expect(result.type).toBe('date');
  });

  it('keeps cohort ids', () => {
    const result = transformFilter(
      {
        id: 'f1',
        name: 'cohort',
        operator: 'inCohort',
        value: [],
        cohortIds: ['c1', 'c2'],
        cohortId: 'c0',
      },
      0,
    );
    expect(result.cohortIds).toEqual(['c1', 'c2']);
    expect(result.cohortId).toBe('c0');
  });

  it('leaves the optional fields off legacy filters', () => {
    const result = transformFilter(
      { name: 'path', operator: 'is', value: '/pricing' as never },
      1,
    );
    expect(result).toEqual({
      id: 'B',
      name: 'path',
      operator: 'is',
      value: ['/pricing'],
    });
  });
});
