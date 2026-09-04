/**
 * Property keys reach the SQL builders as free text: a filter name, a
 * breakdown name or a math-metric property from a saved report or an API
 * call. They end up inside a ClickHouse Map access, so a key carrying a
 * quote must stay one string literal — otherwise it closes the literal and
 * the rest of the key is parsed as SQL, next to the `project_id` predicate
 * that scopes the query to one project.
 *
 * String assertions only; no ClickHouse needed.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const { capturedSql } = vi.hoisted(() => ({ capturedSql: [] as string[] }));

vi.mock('../clickhouse/client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../clickhouse/client')>();
  return {
    ...actual,
    chQuery: (sql: string) => {
      capturedSql.push(sql);
      return Promise.resolve([]);
    },
  };
});

import { createSqlBuilder } from '../sql-builder';
import {
  collectProfilePropertyKeys,
  getAggregateChartSql as _getAggregateChartSql,
  getChartSql as _getChartSql,
  getSelectPropertyKey,
  profilePropertiesCteSelect,
  rewriteProfilePropertyRefs,
} from './chart.service';
import { getEventList, getEventsCount } from './event.service';

const getChartSql: (input: any) => Promise<string> = _getChartSql as any;
const getAggregateChartSql: (input: any) => Promise<string> =
  _getAggregateChartSql as any;

const PROJECT_ID = 'test-sql-validation';
const START = '2026-04-14 00:00:00';
const END = '2026-05-15 00:00:00';

beforeAll(() => {
  // The chart service logs every query it builds; mute it.
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

// A key that closes the literal, appends its own predicate, and reopens a
// literal so the tail of the original render still parses.
const BREAKOUT_KEY = "x'] = '' OR 1 = 1 OR properties['y";
const BREAKOUT_PROPERTY = `properties.${BREAKOUT_KEY}`;

/**
 * The query must keep exactly one project_id predicate, and the key must not
 * have contributed a boolean operator of its own outside a string literal.
 */
function expectNoInjectedPredicate(sql: string) {
  expect(sql.match(/project_id =/g) ?? []).toHaveLength(1);
  // The payload only ever appears with its quotes escaped, i.e. still inside
  // the Map key literal.
  expect(sql).not.toContain("'] = '' OR 1 = 1");
  expect(sql).toContain("\\'] = \\'\\' OR 1 = 1 OR properties[\\'y'");
}

describe('getSelectPropertyKey / key escaping', () => {
  it('renders a key with a quote as a single escaped literal', () => {
    expect(getSelectPropertyKey(BREAKOUT_PROPERTY, undefined, undefined, undefined, 'e')).toBe(
      "e.properties['x\\'] = \\'\\' OR 1 = 1 OR properties[\\'y']",
    );
  });

  it('escapes backslashes and leaves ] alone', () => {
    expect(getSelectPropertyKey('properties.a\\b]c')).toBe(
      "properties['a\\\\b]c']",
    );
  });

  it('escapes profile property keys the same way', () => {
    expect(getSelectPropertyKey("profile.properties.pl'an")).toBe(
      "profile.properties['pl\\'an']",
    );
  });

  it('renders ordinary keys unchanged', () => {
    expect(getSelectPropertyKey('properties.foo')).toBe("properties['foo']");
    expect(getSelectPropertyKey('properties.foo', undefined, undefined, undefined, 'e')).toBe(
      "e.properties['foo']",
    );
    expect(getSelectPropertyKey('profile.properties.plan')).toBe(
      "profile.properties['plan']",
    );
    expect(getSelectPropertyKey('properties.a.*')).toBe(
      "arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, 'a.*')))",
    );
    expect(getSelectPropertyKey('country')).toBe('country');
  });
});

describe('sql-builder / getWhere', () => {
  it('parenthesises each clause so an OR cannot re-group its neighbours', () => {
    const { sb, getWhere } = createSqlBuilder();
    sb.where.project = "project_id = 'p'";
    sb.where.f0 = "name = 'a' OR 1 = 1";
    expect(getWhere()).toBe("WHERE (project_id = 'p') AND (name = 'a' OR 1 = 1)");
  });

  it('is empty when there are no clauses', () => {
    const { getWhere } = createSqlBuilder();
    expect(getWhere()).toBe('');
  });
});

describe('chart SQL with a hostile property key', () => {
  const base = {
    interval: 'day',
    startDate: START,
    endDate: END,
    projectId: PROJECT_ID,
    timezone: 'UTC',
  };
  const event = (overrides: Record<string, unknown> = {}) => ({
    id: 'A',
    name: 'screen_view',
    segment: 'event',
    filters: [],
    ...overrides,
  });

  it('keeps the project scope for a filter name', async () => {
    const sql = await getChartSql({
      event: event({
        filters: [
          {
            id: 'f1',
            name: BREAKOUT_PROPERTY,
            operator: 'is',
            value: ['pro'],
          },
        ],
      }),
      breakdowns: [],
      ...base,
    });
    expectNoInjectedPredicate(sql);
  });

  it('keeps the project scope for a breakdown name', async () => {
    const sql = await getChartSql({
      event: event(),
      breakdowns: [{ id: 'b', name: BREAKOUT_PROPERTY }],
      ...base,
    });
    expectNoInjectedPredicate(sql);
  });

  it('keeps the project scope for a math-metric property', async () => {
    const sql = await getChartSql({
      event: event({
        segment: 'property_average',
        property: BREAKOUT_PROPERTY,
      }),
      breakdowns: [],
      ...base,
    });
    expectNoInjectedPredicate(sql);
  });

  it('keeps the project scope in aggregate chart SQL', async () => {
    const sql = await getAggregateChartSql({
      event: event({
        segment: 'property_sum',
        property: BREAKOUT_PROPERTY,
      }),
      breakdowns: [{ id: 'b', name: BREAKOUT_PROPERTY }],
      ...base,
    });
    expectNoInjectedPredicate(sql);
  });
});

describe('event SQL with a hostile property key', () => {
  const filters = [
    {
      id: 'f1',
      name: BREAKOUT_PROPERTY,
      operator: 'is' as const,
      value: ['pro'],
    },
  ];

  it('keeps the project scope in the event list query', async () => {
    capturedSql.length = 0;
    await getEventList({
      projectId: PROJECT_ID,
      take: 10,
      cursor: 0,
      filters,
      startDate: new Date(START),
      endDate: new Date(END),
    } as any);
    expect(capturedSql).toHaveLength(1);
    expectNoInjectedPredicate(capturedSql[0]!);
  });

  it('keeps the project scope in the event count query', async () => {
    capturedSql.length = 0;
    await getEventsCount({
      projectId: PROJECT_ID,
      filters,
      startDate: new Date(START),
      endDate: new Date(END),
    } as any);
    expect(capturedSql).toHaveLength(1);
    expectNoInjectedPredicate(capturedSql[0]!);
  });
});

describe('profile-property narrowing with a quoted key', () => {
  const key = "pl'an";
  const name = `profile.properties.${key}`;

  it('narrows the key and rewrites its reference to the CTE column', () => {
    const { keys, needsFullMap } = collectProfilePropertyKeys([{ name }]);
    expect(keys).toEqual([key]);
    expect(needsFullMap).toBe(false);

    const cteSelect = profilePropertiesCteSelect(keys, needsFullMap);
    expect(cteSelect).toBe(
      "properties['pl\\'an'] as `profile.properties.pl'an`",
    );

    const ref = getSelectPropertyKey(name);
    const rewritten = rewriteProfilePropertyRefs(`SELECT ${ref}`, keys);
    expect(rewritten).toBe('SELECT `profile.properties.pl\'an`');
  });

  it('falls back to the full Map for keys it cannot alias', () => {
    const { keys, needsFullMap } = collectProfilePropertyKeys([
      { name: 'profile.properties.a\\b' },
    ]);
    expect(keys).toEqual([]);
    expect(needsFullMap).toBe(true);
    expect(profilePropertiesCteSelect(keys, needsFullMap)).toBe(
      'properties as "profile.properties"',
    );
  });

  it('leaves ordinary keys narrowing exactly as before', () => {
    const { keys, needsFullMap } = collectProfilePropertyKeys([
      { name: 'profile.properties.plan' },
    ]);
    expect(keys).toEqual(['plan']);
    expect(needsFullMap).toBe(false);
    expect(profilePropertiesCteSelect(keys, needsFullMap)).toBe(
      "properties['plan'] as `profile.properties.plan`",
    );
    expect(
      rewriteProfilePropertyRefs(
        `SELECT ${getSelectPropertyKey('profile.properties.plan')}`,
        keys,
      ),
    ).toBe('SELECT `profile.properties.plan`');
  });
});
