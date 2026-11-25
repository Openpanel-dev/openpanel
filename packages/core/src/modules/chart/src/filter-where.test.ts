// Shape tests for the operators of the shared event filter compiler whose
// meaning is easy to get backwards.

import { describe, expect, test } from 'bun:test';
import type { IChartEventFilter } from '../../report/report.constants';
import { getEventFiltersWhereClause, joinFilterClauses } from './filter-where';

const PROJECT_ID = 'filter-where-test';

function render(filters: IChartEventFilter[], eventsAlias?: string) {
  const clause = joinFilterClauses(
    getEventFiltersWhereClause(filters, PROJECT_ID, eventsAlias)
  );
  if (!clause) {
    throw new Error('expected a clause');
  }
  return clause.toStatement();
}

const filter = (
  name: string,
  operator: IChartEventFilter['operator'],
  value: string[]
): IChartEventFilter => ({ id: 'f', name, operator, value });

// Session-grouped funnels SELECT `argMax(profile_id, created_at) AS profile_id`
// and put step filters in the same WHERE. An unqualified has_profile predicate
// resolves to that aggregate alias (ClickHouse Code 184). The events alias the
// funnel already passes must therefore qualify both columns.
describe('has_profile with events alias', () => {
  test('qualifies both columns when alias is given (true)', () => {
    const { query } = render([filter('has_profile', 'is', ['true'])], 'events');

    expect(query).toBe('events.profile_id != events.device_id');
  });

  test('qualifies both columns when alias is given (false)', () => {
    const { query } = render(
      [filter('has_profile', 'is', ['false'])],
      'events'
    );

    expect(query).toBe('events.profile_id = events.device_id');
  });

  test('keeps unqualified columns when no alias is given', () => {
    const { query } = render([filter('has_profile', 'is', ['true'])]);

    expect(query).toBe('profile_id != device_id');
  });
});

// "Does not contain a or b" means "contains neither". The negation of an
// any-of (`contains`) is a none-of, so the NOT LIKEs must AND: OR-ed, a path
// that contains only one of the values would match.
describe('doesNotContain with several values', () => {
  test('ANDs the NOT LIKEs on a bare column', () => {
    const { query, query_params } = render([
      filter('path', 'doesNotContain', ['/admin', '/debug']),
    ]);

    expect(query).toBe(
      '(path NOT LIKE {p1:String} AND path NOT LIKE {p2:String})'
    );
    expect(query_params).toEqual({ p1: '%/admin%', p2: '%/debug%' });
  });

  test('ANDs the NOT LIKEs on an event property', () => {
    const { query } = render([
      filter('properties.plan', 'doesNotContain', ['free', 'trial']),
    ]);

    expect(query).toContain(
      'NOT LIKE {p2:String} AND properties[{p3:String}] NOT LIKE {p4:String}'
    );
    expect(query).not.toContain(' OR ');
  });

  test('ANDs the NOT LIKEs on a group property', () => {
    const { query } = render([
      filter('group.company.tier', 'doesNotContain', ['free', 'trial']),
    ]);

    expect(query).toContain(' AND ');
    expect(query).not.toContain(' OR ');
  });

  test('leaves a single value as one NOT LIKE', () => {
    const { query } = render([filter('path', 'doesNotContain', ['/admin'])]);

    expect(query).toBe('(path NOT LIKE {p1:String})');
  });

  test('contains stays any-of', () => {
    const { query } = render([filter('path', 'contains', ['/a', '/b'])]);

    expect(query).toBe('(path LIKE {p1:String} OR path LIKE {p2:String})');
  });
});
