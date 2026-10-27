// SQL-shape tests for event-based cohort criteria.

import { describe, expect, test } from 'bun:test';
import type {
  EventBasedCohortDefinition,
  EventCriteria,
} from '../cohort.constants';
import {
  buildEventBasedCohortQuery,
  buildEventCriteriaQuery,
} from '../cohort.service';

const PROJECT_ID = 'test-cohort-timeframe';

function criteria(timeframe: EventCriteria['timeframe']): EventCriteria {
  return { name: 'screen_view', filters: [], timeframe };
}

function render(fragment: ReturnType<typeof buildEventCriteriaQuery>) {
  return fragment.toStatement();
}

// Values that would break out of a naive `toDate('${value}')` interpolation.
const HOSTILE = [
  "2024-01-01') OR 1=1 --",
  "2024-01-01'",
  "2024-01-01') UNION ALL SELECT id FROM profiles --",
];

describe('buildEventCriteriaQuery timeframe binding', () => {
  test.each(HOSTILE)('binds a hostile start (%s)', (start) => {
    const { query, query_params } = render(
      buildEventCriteriaQuery(PROJECT_ID, criteria({ type: 'absolute', start }))
    );

    expect(query).toContain('event_date >= toDate({p3:String})');
    expect(query).not.toContain(start);
    expect(query).not.toMatch(/OR 1=1|UNION ALL/);
    expect(query_params.p3).toBe(start);
  });

  test.each(HOSTILE)('binds a hostile end (%s)', (end) => {
    const { query, query_params } = render(
      buildEventCriteriaQuery(
        PROJECT_ID,
        criteria({ type: 'absolute', start: '2024-01-01', end })
      )
    );

    expect(query).toContain(
      'event_date BETWEEN toDate({p3:String}) AND toDate({p4:String})'
    );
    expect(query).not.toContain(end);
    expect(query_params.p3).toBe('2024-01-01');
    expect(query_params.p4).toBe(end);
  });

  test('binds the project id too', () => {
    const hostile = "p9' OR 1=1 --";
    const { query, query_params } = render(
      buildEventCriteriaQuery(
        hostile,
        criteria({ type: 'absolute', start: '2024-01-01' })
      )
    );

    expect(query).toContain('project_id = {p1:String}');
    expect(query).not.toContain(hostile);
    expect(query_params.p1).toBe(hostile);
  });

  test('still builds relative timeframes', () => {
    const { query, query_params } = render(
      buildEventCriteriaQuery(
        PROJECT_ID,
        criteria({ type: 'relative', value: '30d' })
      )
    );

    expect(query).toContain(
      'event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY)'
    );
    expect(query_params.p3).toBe(30);
  });
});

const LAST_30_DAYS = {
  type: 'relative',
  value: '30d',
} satisfies EventCriteria['timeframe'];

function frequencyCriteria(
  frequency: EventCriteria['frequency'],
  filters: EventCriteria['filters'] = []
): EventCriteria {
  return {
    name: 'subscription_started',
    filters,
    timeframe: LAST_30_DAYS,
    frequency,
  };
}

// Everything the outer profile scan sees, i.e. the query with the NOT IN
// subquery cut out.
function outsideExclusion(query: string): string {
  const open = query.indexOf('NOT IN (');
  if (open === -1) {
    return query;
  }
  return query.slice(0, open) + query.slice(query.lastIndexOf(')') + 1);
}

describe('buildEventCriteriaQuery zero frequency', () => {
  test.each([
    'eq',
    'lte',
  ] as const)('excludes anyone who did the event when the count is 0 (%s)', (operator) => {
    const { query, query_params } = render(
      buildEventCriteriaQuery(
        PROJECT_ID,
        frequencyCriteria({ operator, count: 0 })
      )
    );

    // The summary MV has no row for zero occurrences, so a HAVING can never
    // match here — the query has to be inverted.
    expect(query).not.toContain('HAVING');
    expect(query).toContain('SELECT DISTINCT id AS profile_id');
    expect(query).toContain('FROM profiles');
    expect(query).toContain('NOT IN (');
    expect(query).toContain('FROM event_profile_summary_mv');
    expect(query).toContain('name = {p3:String}');
    expect(query_params.p3).toBe('subscription_started');
  });

  test('gives eq 0 and lte 0 the same query', () => {
    expect(
      render(
        buildEventCriteriaQuery(
          PROJECT_ID,
          frequencyCriteria({ operator: 'eq', count: 0 })
        )
      )
    ).toEqual(
      render(
        buildEventCriteriaQuery(
          PROJECT_ID,
          frequencyCriteria({ operator: 'lte', count: 0 })
        )
      )
    );
  });

  test('keeps the timeframe inside the exclusion, not on the profile scan', () => {
    const { query, query_params } = render(
      buildEventCriteriaQuery(
        PROJECT_ID,
        frequencyCriteria({ operator: 'eq', count: 0 })
      )
    );

    // "Never did X in the last 30 days" still includes someone who did X 60
    // days ago — which only holds while the date bound sits in the subquery.
    expect(query).toContain(
      'event_date >= toDate(now() - INTERVAL {p4:UInt64} DAY)'
    );
    expect(query_params.p4).toBe(30);
    expect(outsideExclusion(query)).not.toContain('event_date');
    expect(outsideExclusion(query)).toContain('project_id = {p1:String}');
    expect(query_params.p1).toBe(PROJECT_ID);
  });

  test('excludes on the matching events when the criterion has filters', () => {
    const { query, query_params } = render(
      buildEventCriteriaQuery(
        PROJECT_ID,
        frequencyCriteria({ operator: 'eq', count: 0 }, [
          {
            id: 'plan',
            name: 'properties.plan',
            operator: 'is',
            value: ['pro'],
          },
        ])
      )
    );

    // Read as "has no matching event": someone who did the event with
    // plan = free is a member.
    expect(query).not.toContain('HAVING');
    expect(query).toContain('NOT IN (SELECT DISTINCT profile_id');
    expect(query).toContain('FROM events');
    expect(query).toContain('properties[{p5:String}] = {p6:String}');
    expect(query_params.p5).toBe('plan');
    expect(query_params.p6).toBe('pro');
    expect(outsideExclusion(query)).not.toContain('properties[');
  });

  test('leaves gte 0 on the ordinary path (zFrequency rejects it upstream)', () => {
    const { query, query_params } = render(
      buildEventCriteriaQuery(
        PROJECT_ID,
        frequencyCriteria({ operator: 'gte', count: 0 })
      )
    );

    expect(query).toContain('HAVING countMerge(event_count) >= {p4:UInt64}');
    expect(query_params.p4).toBe(0);
    expect(query).not.toContain('NOT IN');
  });

  test.each([
    ['gte', 1, '>='],
    ['eq', 2, '='],
    ['lte', 3, '<='],
  ] as const)('still groups and filters for positive counts (%s %i)', (operator, count, comparison) => {
    const { query, query_params } = render(
      buildEventCriteriaQuery(
        PROJECT_ID,
        frequencyCriteria({ operator, count })
      )
    );

    expect(query).toContain('GROUP BY profile_id');
    expect(query).toContain(
      `HAVING countMerge(event_count) ${comparison} {p4:UInt64}`
    );
    expect(query_params.p4).toBe(count);
    expect(query).not.toContain('FROM profiles');
  });
});

describe('buildEventBasedCohortQuery with a zero-count criterion', () => {
  const definition = {
    type: 'event',
    criteria: {
      operator: 'and',
      events: [
        {
          name: 'signup',
          filters: [],
          timeframe: LAST_30_DAYS,
          frequency: { operator: 'gte', count: 1 },
        },
        frequencyCriteria({ operator: 'eq', count: 0 }),
      ],
    },
  } satisfies EventBasedCohortDefinition;

  test('intersects two sets of profile_id', () => {
    const { query } = render(
      buildEventBasedCohortQuery(PROJECT_ID, definition)
    );
    const [signedUp, neverSubscribed] = query.split(' INTERSECT ');

    expect(neverSubscribed).toBeDefined();
    // Both operands have to be a bare set of profile_id for the INTERSECT to
    // mean anything: same column name, one row per profile, no LIMIT or
    // ORDER BY of their own.
    expect(signedUp).toContain('SELECT profile_id');
    expect(neverSubscribed).toContain('SELECT DISTINCT id AS profile_id');
    expect(query).not.toContain('ORDER BY');
    expect(query).not.toContain('LIMIT');
  });

  test('unions them under "or"', () => {
    const { query } = render(
      buildEventBasedCohortQuery(PROJECT_ID, {
        ...definition,
        criteria: { ...definition.criteria, operator: 'or' },
      })
    );

    expect(query).toContain(' UNION DISTINCT ');
    expect(query).not.toContain(' INTERSECT ');
  });
});

// A filtered criterion has to read the events table: the summary MVs hold no
// columns (path, country, has_profile) and one row per property key, so they
// can neither apply a column filter nor AND two property filters. Before this
// split, a `path` filter was silently dropped and the cohort matched everyone
// who did the event at all.
describe('buildEventCriteriaQuery with filters', () => {
  const pathFilter = {
    id: 'path',
    name: 'path',
    operator: 'startsWith',
    value: ['/db'],
  } satisfies EventCriteria['filters'][number];

  const hasProfileFilter = {
    id: 'has_profile',
    name: 'has_profile',
    operator: 'is',
    value: ['true'],
  } satisfies EventCriteria['filters'][number];

  test('applies a bare column filter on the events table', () => {
    const { query, query_params } = render(
      buildEventCriteriaQuery(
        PROJECT_ID,
        frequencyCriteria({ operator: 'gte', count: 1 }, [pathFilter])
      )
    );

    expect(query).toContain('FROM events');
    expect(query).not.toContain('_summary_mv');
    expect(query).toContain('name = {p2:String}');
    expect(query).toContain(
      'toDate(created_at) >= toDate(now() - INTERVAL {p3:UInt64} DAY)'
    );
    expect(query).toContain('path LIKE {p4:String}');
    expect(query_params.p4).toBe('/db%');
    expect(query).toContain('GROUP BY profile_id');
    expect(query).toContain('HAVING count() >= {p5:UInt64}');
    expect(query_params.p5).toBe(1);
  });

  test('keeps membership identified-only, like the summary MVs', () => {
    const { query } = render(
      buildEventCriteriaQuery(
        PROJECT_ID,
        frequencyCriteria({ operator: 'gte', count: 1 }, [pathFilter])
      )
    );

    expect(query).toContain('profile_id != device_id');
  });

  test('ANDs several filters on the same event', () => {
    const { query, query_params } = render(
      buildEventCriteriaQuery(
        PROJECT_ID,
        frequencyCriteria({ operator: 'gte', count: 1 }, [
          {
            id: 'plan',
            name: 'properties.plan',
            operator: 'is',
            value: ['pro'],
          },
          { id: 'country', name: 'country', operator: 'is', value: ['SE'] },
        ])
      )
    );

    expect(query).toContain(
      'properties[{p4:String}] = {p5:String} AND country = {p6:String}'
    );
    expect(query_params.p4).toBe('plan');
    expect(query_params.p5).toBe('pro');
    expect(query_params.p6).toBe('SE');
  });

  test('gives a property filter every operator a report has', () => {
    const { query, query_params } = render(
      buildEventCriteriaQuery(
        PROJECT_ID,
        frequencyCriteria(undefined, [
          {
            id: 'plan',
            name: 'properties.plan',
            operator: 'startsWith',
            value: ['pr'],
          },
        ])
      )
    );

    expect(query).toContain('SELECT DISTINCT profile_id');
    expect(query).toContain('properties[{p4:String}] LIKE {p5:String}');
    expect(query_params.p5).toBe('pr%');
    expect(query).not.toContain('HAVING');
  });

  test('a has_profile filter compiles rather than being dropped', () => {
    const { query } = render(
      buildEventCriteriaQuery(
        PROJECT_ID,
        frequencyCriteria({ operator: 'gte', count: 1 }, [
          pathFilter,
          hasProfileFilter,
        ])
      )
    );

    expect(query).toContain('FROM events');
    // The compiled has_profile clause sits after the path clause; the
    // unconditional identified-only predicate alone would not prove it.
    expect(query).toContain(
      '(path LIKE {p4:String}) AND profile_id != device_id'
    );
  });

  test('a filter the compiler drops leaves the criterion on the summary MV', () => {
    const { query } = render(
      buildEventCriteriaQuery(
        PROJECT_ID,
        frequencyCriteria({ operator: 'gte', count: 1 }, [
          { id: 'empty', name: 'path', operator: 'is', value: [] },
        ])
      )
    );

    expect(query).toContain('FROM event_profile_summary_mv');
    expect(query).not.toContain('FROM events');
  });

  test('an unfiltered criterion still reads the summary MV', () => {
    const { query } = render(
      buildEventCriteriaQuery(
        PROJECT_ID,
        frequencyCriteria({ operator: 'gte', count: 1 })
      )
    );

    expect(query).toContain('FROM event_profile_summary_mv');
    expect(query).toContain('HAVING countMerge(event_count) >= {p4:UInt64}');
  });
});
