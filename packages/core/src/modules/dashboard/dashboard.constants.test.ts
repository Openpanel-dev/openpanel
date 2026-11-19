import { describe, expect, test } from 'bun:test';
import type { IChartEventFilter } from '../report/report.constants';
import {
  isSameDashboardFilters,
  mergeDashboardFilters,
  parseDashboardFilters,
} from './dashboard.constants';

const country = (value: string[]): IChartEventFilter => ({
  id: 'country',
  name: 'country',
  operator: 'is',
  value,
});

const browserNotChrome: IChartEventFilter = {
  id: 'browser',
  name: 'browser',
  operator: 'isNot',
  value: ['Chrome'],
};

describe('mergeDashboardFilters', () => {
  test('returns the report filters untouched without dashboard filters', () => {
    const reportFilters = [browserNotChrome];
    expect(mergeDashboardFilters(reportFilters, [])).toBe(reportFilters);
    expect(mergeDashboardFilters(reportFilters, undefined)).toBe(reportFilters);
    expect(mergeDashboardFilters(undefined, undefined)).toEqual([]);
  });

  test('appends dashboard filters after the report filters', () => {
    expect(
      mergeDashboardFilters([browserNotChrome], [country(['SE'])])
    ).toEqual([browserNotChrome, country(['SE'])]);
  });

  test('keeps a report filter on the same property, so the two AND', () => {
    expect(
      mergeDashboardFilters([country(['SE', 'DE'])], [country(['SE'])])
    ).toEqual([country(['SE', 'DE']), country(['SE'])]);
  });

  test('skips dashboard filters that are still being edited', () => {
    const noValue = country([]);
    const noCohort: IChartEventFilter = {
      id: 'cohort',
      name: 'cohort',
      operator: 'inCohort',
      value: [],
      cohortIds: [],
    };
    const reportFilters = [browserNotChrome];
    expect(mergeDashboardFilters(reportFilters, [noValue, noCohort])).toBe(
      reportFilters
    );
  });

  test('keeps valueless operators and picked cohorts', () => {
    const isSet: IChartEventFilter = {
      id: 'referrer',
      name: 'referrer',
      operator: 'isNotNull',
      value: [],
    };
    const inCohort: IChartEventFilter = {
      id: 'cohort',
      name: 'cohort',
      operator: 'inCohort',
      value: [],
      cohortIds: ['buyers'],
    };
    expect(mergeDashboardFilters([], [isSet, inCohort])).toEqual([
      isSet,
      inCohort,
    ]);
  });
});

describe('parseDashboardFilters', () => {
  test('returns an empty list for anything but an array', () => {
    expect(parseDashboardFilters(null)).toEqual([]);
    expect(parseDashboardFilters({})).toEqual([]);
    expect(parseDashboardFilters('country')).toEqual([]);
  });

  test('keeps valid filters and drops invalid ones', () => {
    expect(
      parseDashboardFilters([
        country(['SE']),
        { name: 'country', operator: 'matchesEverything', value: ['SE'] },
        { operator: 'is', value: ['SE'] },
        'country',
      ])
    ).toEqual([country(['SE'])]);
  });
});

describe('isSameDashboardFilters', () => {
  test('ignores ids', () => {
    expect(
      isSameDashboardFilters(
        [country(['SE'])],
        [{ ...country(['SE']), id: 'random' }]
      )
    ).toBe(true);
  });

  test('treats a value and its string form as the same', () => {
    const numeric: IChartEventFilter = {
      name: 'properties.value',
      operator: 'is',
      value: [99],
    };
    expect(
      isSameDashboardFilters([numeric], [{ ...numeric, value: ['99'] }])
    ).toBe(true);
  });

  test('detects a changed value, operator, cohort or extra filter', () => {
    const saved = [country(['SE'])];
    expect(isSameDashboardFilters(saved, [country(['DE'])])).toBe(false);
    expect(
      isSameDashboardFilters(saved, [{ ...country(['SE']), operator: 'isNot' }])
    ).toBe(false);
    expect(
      isSameDashboardFilters(saved, [country(['SE']), browserNotChrome])
    ).toBe(false);
    expect(
      isSameDashboardFilters(
        [{ name: 'cohort', operator: 'inCohort', value: [], cohortIds: ['a'] }],
        [{ name: 'cohort', operator: 'inCohort', value: [], cohortIds: ['b'] }]
      )
    ).toBe(false);
  });
});
