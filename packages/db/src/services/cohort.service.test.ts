import type {
  EventBasedCohortDefinition,
  EventCriteria,
} from '@openpanel/validation';
import { describe, expect, it } from 'vitest';
import { TABLE_NAMES } from '../clickhouse/client';
import {
  buildEventBasedCohortQuery,
  buildEventCriteriaQuery,
} from './cohort.service';

const PROJECT_ID = 'test-cohort-timeframe';

function criteria(timeframe: EventCriteria['timeframe']): EventCriteria {
  return {
    name: 'screen_view',
    filters: [],
    timeframe,
  } as EventCriteria;
}

/**
 * Remove every quoted string literal from the SQL, leaving the skeleton the
 * ClickHouse parser would act on. Anything a caller smuggled in stays inside a
 * literal if it was escaped properly, so it disappears here; if it broke out,
 * it shows up in the skeleton.
 */
function skeleton(sql: string): string {
  return sql.replace(/'(?:\\.|[^'\\])*'/g, "''");
}

// Values that break out of a naive `toDate('${value}')` interpolation.
const HOSTILE = [
  "2024-01-01') OR 1=1 --",
  "2024-01-01'",
  "2024-01-01') UNION ALL SELECT id FROM profiles --",
];

describe('buildEventCriteriaQuery timeframe escaping', () => {
  it.each(HOSTILE)('escapes a hostile start (%s)', (start) => {
    const sql = buildEventCriteriaQuery(
      PROJECT_ID,
      criteria({ type: 'absolute', start })
    );

    // The value survives as exactly one quoted literal inside toDate(...).
    expect(sql).toContain(
      `event_date >= toDate('${start.replace(/'/g, "\\'")}')`
    );
    // The parser sees the same shape as a well-formed date: no extra clause,
    // no early close of the toDate() call, no trailing comment.
    expect(skeleton(sql)).toContain("event_date >= toDate('')");
    expect(skeleton(sql)).not.toMatch(/OR|UNION|--/);
  });

  it.each(HOSTILE)('escapes a hostile end (%s)', (end) => {
    const sql = buildEventCriteriaQuery(
      PROJECT_ID,
      criteria({ type: 'absolute', start: '2024-01-01', end })
    );

    expect(sql).toContain(
      `event_date BETWEEN toDate('2024-01-01') AND toDate('${end.replace(/'/g, "\\'")}')`
    );
    expect(skeleton(sql)).toContain(
      "event_date BETWEEN toDate('') AND toDate('')"
    );
    expect(skeleton(sql)).not.toMatch(/OR|UNION|--/);
  });

  it('leaves well-formed dates readable', () => {
    expect(
      buildEventCriteriaQuery(
        PROJECT_ID,
        criteria({ type: 'absolute', start: '2024-01-01' })
      )
    ).toContain("event_date >= toDate('2024-01-01')");

    expect(
      buildEventCriteriaQuery(
        PROJECT_ID,
        criteria({ type: 'absolute', start: '2024-01-01', end: '2024-02-01' })
      )
    ).toContain(
      "event_date BETWEEN toDate('2024-01-01') AND toDate('2024-02-01')"
    );
  });

  it('still builds relative timeframes', () => {
    expect(
      buildEventCriteriaQuery(
        PROJECT_ID,
        criteria({ type: 'relative', value: '30d' })
      )
    ).toContain('event_date >= toDate(now() - INTERVAL 30 DAY)');
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
function outsideExclusion(sql: string): string {
  const open = sql.indexOf('NOT IN (');
  if (open === -1) {
    return sql;
  }
  return sql.slice(0, open) + sql.slice(sql.lastIndexOf(')') + 1);
}

describe('buildEventCriteriaQuery zero frequency', () => {
  it.each(['eq', 'lte'] as const)(
    'excludes anyone who did the event when the count is 0 (%s)',
    (operator) => {
      const sql = buildEventCriteriaQuery(
        PROJECT_ID,
        frequencyCriteria({ operator, count: 0 })
      );

      // The summary MV has no row for zero occurrences, so a HAVING can never
      // match here — the query has to be inverted.
      expect(sql).not.toContain('HAVING');
      expect(sql).toContain('SELECT DISTINCT id AS profile_id');
      expect(sql).toContain(`FROM ${TABLE_NAMES.profiles}`);
      expect(sql).toContain('NOT IN (');
      expect(sql).toContain(`FROM ${TABLE_NAMES.event_profile_summary_mv}`);
      expect(sql).toContain("name = 'subscription_started'");
    }
  );

  it('gives eq 0 and lte 0 the same query', () => {
    expect(
      buildEventCriteriaQuery(
        PROJECT_ID,
        frequencyCriteria({ operator: 'eq', count: 0 })
      )
    ).toBe(
      buildEventCriteriaQuery(
        PROJECT_ID,
        frequencyCriteria({ operator: 'lte', count: 0 })
      )
    );
  });

  it('keeps the timeframe inside the exclusion, not on the profile scan', () => {
    const sql = buildEventCriteriaQuery(
      PROJECT_ID,
      frequencyCriteria({ operator: 'eq', count: 0 })
    );

    // "Never did X in the last 30 days" still includes someone who did X 60
    // days ago — which only holds while the date bound sits in the subquery.
    expect(sql).toContain('event_date >= toDate(now() - INTERVAL 30 DAY)');
    expect(outsideExclusion(sql)).not.toContain('event_date');
    expect(outsideExclusion(sql)).toContain(
      `project_id = '${PROJECT_ID}'`
    );
  });

  it('excludes on the matching property row when the criterion has property filters', () => {
    const sql = buildEventCriteriaQuery(
      PROJECT_ID,
      frequencyCriteria({ operator: 'eq', count: 0 }, [
        { name: 'properties.plan', operator: 'is', value: ['pro'] },
      ])
    );

    // Read as "has no matching (event, property) row": someone who did the
    // event with plan = free is a member.
    expect(sql).not.toContain('HAVING');
    expect(sql).toContain(
      `FROM ${TABLE_NAMES.event_property_profile_summary_mv}`
    );
    expect(sql).toContain("property_key = 'plan'");
    expect(outsideExclusion(sql)).not.toContain('property_key');
  });

  it('leaves gte 0 on the ordinary path (zFrequency rejects it upstream)', () => {
    const sql = buildEventCriteriaQuery(
      PROJECT_ID,
      frequencyCriteria({ operator: 'gte', count: 0 })
    );

    expect(sql).toContain('HAVING countMerge(event_count) >= 0');
    expect(sql).not.toContain('NOT IN');
  });

  it.each([
    ['gte', 1, '>= 1'],
    ['eq', 2, '= 2'],
    ['lte', 3, '<= 3'],
  ] as const)(
    'still groups and filters for positive counts (%s %i)',
    (operator, count, expected) => {
      const sql = buildEventCriteriaQuery(
        PROJECT_ID,
        frequencyCriteria({ operator, count })
      );

      expect(sql).toContain('GROUP BY profile_id');
      expect(sql).toContain(`HAVING countMerge(event_count) ${expected}`);
      expect(sql).not.toContain(`FROM ${TABLE_NAMES.profiles}`);
    }
  );
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

  it('intersects two sets of profile_id', () => {
    const sql = buildEventBasedCohortQuery(PROJECT_ID, definition);
    const [signedUp, neverSubscribed] = sql.split(' INTERSECT ');

    expect(neverSubscribed).toBeDefined();
    // Both operands have to be a bare set of profile_id for the INTERSECT to
    // mean anything: same column name, one row per profile, no LIMIT or
    // ORDER BY of their own.
    expect(signedUp).toContain('SELECT profile_id');
    expect(neverSubscribed).toContain('SELECT DISTINCT id AS profile_id');
    expect(sql).not.toContain('ORDER BY');
    expect(sql).not.toContain('LIMIT');
  });

  it('unions them under "or"', () => {
    const sql = buildEventBasedCohortQuery(PROJECT_ID, {
      ...definition,
      criteria: { ...definition.criteria, operator: 'or' },
    });

    expect(sql).toContain(' UNION DISTINCT ');
    expect(sql).not.toContain(' INTERSECT ');
  });
});
