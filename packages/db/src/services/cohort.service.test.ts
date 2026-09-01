import type { EventCriteria } from '@openpanel/validation';
import { describe, expect, it } from 'vitest';
import { buildEventCriteriaQuery } from './cohort.service';

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
