import { describe, expect, it, mock } from 'bun:test';
import type { ServiceDeps } from '../../services';
import {
  GRID_COLUMNS,
  type IChartEventFilter,
  type IChartEventItem,
} from './report.constants';
import { transformFilter, updateReportLayouts } from './report.service';
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
      0
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
      0
    );
    expect(result.cohortIds).toEqual(['c1', 'c2']);
    expect(result.cohortId).toBe('c0');
  });

  it('leaves the optional fields off legacy filters', () => {
    const result = transformFilter(
      { name: 'path', operator: 'is', value: '/pricing' as never },
      1
    );
    expect(result).toEqual({
      id: 'B',
      name: 'path',
      operator: 'is',
      value: ['/pricing'],
    });
  });
});

describe('updateReportLayouts', () => {
  const layout = { x: 0, y: 0, w: 6, h: 4 };

  function stubDeps(reportIdsOnDashboard: string[]) {
    const upsert = mock((args: unknown) => args);
    const transaction = mock(async (writes: unknown[]) => writes);
    const findMany = mock(async () =>
      reportIdsOnDashboard.map((id) => ({ id }))
    );
    const deps = {
      db: {
        report: { findMany },
        reportLayout: { upsert },
        $transaction: transaction,
      },
    } as unknown as ServiceDeps;
    return { deps, upsert, transaction, findMany };
  }

  it('writes every tile in one transaction', async () => {
    const { deps, upsert, transaction } = stubDeps(['r1', 'r2']);
    await updateReportLayouts(deps, {
      dashboardId: 'd1',
      items: [
        { reportId: 'r1', layout },
        { reportId: 'r2', layout: { ...layout, x: 6 } },
      ],
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledWith({
      where: { reportId: 'r2' },
      create: { reportId: 'r2', ...layout, x: 6, gridColumns: GRID_COLUMNS },
      update: { ...layout, x: 6, gridColumns: GRID_COLUMNS },
    });
  });

  it('refuses the whole batch when a report is on another dashboard', async () => {
    const { deps, upsert, transaction, findMany } = stubDeps(['r1']);
    await expect(
      updateReportLayouts(deps, {
        dashboardId: 'd1',
        items: [
          { reportId: 'r1', layout },
          { reportId: 'r_other', layout },
        ],
      })
    ).rejects.toThrow('r_other');
    expect(findMany).toHaveBeenCalledWith({
      where: { id: { in: ['r1', 'r_other'] }, dashboardId: 'd1' },
      select: { id: true },
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});
