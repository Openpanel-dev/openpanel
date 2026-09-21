/**
 * Property keys reach the SQL builders as free text: a filter name, a
 * breakdown name or a math-metric property from a saved report or an API
 * call. They end up inside a ClickHouse Map access, so a key carrying a
 * quote must stay one value — otherwise it closes the literal and the rest
 * of the key is parsed as SQL, next to the `project_id` predicate that scopes
 * the query to one project (V1 #483).
 *
 * Here every key binds as a `{pN:String}` param, so the assertions are that
 * the rendered statement never carries the key's text, that the key comes
 * back whole in the params, and that ClickHouse still plans the statement
 * with the hostile key bound (EXPLAIN, same harness as sql.test.ts).
 */

import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import type { SqlFragment } from '@openpanel/db/src/clickhouse/sql';
import type { EventListQuery } from '../../event/src/sql';
import type {
  IChartBreakdown,
  IChartEvent,
  IChartEventFilter,
} from '../../report/report.constants';
import type { AggregateChartSqlInput, ChartSqlInput } from './statement';

const cohortFindMany = mock(async () => []);
const actualPrismaClient = await import('@openpanel/db/src/prisma-client');
const realPrismaClient = { ...actualPrismaClient };
mock.module('@openpanel/db/src/prisma-client', () => ({
  ...realPrismaClient,
  db: { cohort: { findMany: cohortFindMany } },
}));

afterAll(async () => {
  mock.module('@openpanel/db/src/prisma-client', () => realPrismaClient);
});

let ch: typeof import('@openpanel/db/src/clickhouse/client').ch;
let deps: import('../../../services').ServiceDeps;
let buildChartSql: typeof import('./statement').getChartSql;
let buildAggregateChartSql: typeof import('./statement').getAggregateChartSql;
let fieldResolution: typeof import('./field-resolution');
let compiled: typeof import('./compiled');
let filterWhere: typeof import('./filter-where');
let eventSql: typeof import('../../event/src/sql');

const PROJECT_ID = 'test-sql-validation';
const START = '2026-04-14 00:00:00';
const END = '2026-05-15 00:00:00';

// A key that would close the literal, append its own predicate, and reopen a
// literal so the tail of the original render still parses.
const BREAKOUT_KEY = "x'] = '' OR 1 = 1 OR properties['y";
const BREAKOUT_PROPERTY = `properties.${BREAKOUT_KEY}`;
const INJECTED_PREDICATE = "'] = '' OR 1 = 1";

type LooseChartInput = Partial<ChartSqlInput> &
  Pick<ChartSqlInput, 'event' | 'projectId' | 'timezone'>;
type LooseAggregateInput = Partial<AggregateChartSqlInput> &
  Pick<AggregateChartSqlInput, 'event' | 'projectId' | 'timezone'>;

const event = (overrides: Partial<IChartEvent> = {}): IChartEvent => ({
  id: 'A',
  name: 'screen_view',
  segment: 'event',
  filters: [],
  ...overrides,
});

const breakdown = (name: string): IChartBreakdown => ({ id: name, name });

const hostileFilter: IChartEventFilter = {
  id: 'f1',
  name: BREAKOUT_PROPERTY,
  operator: 'is',
  value: ['pro'],
};

const base = {
  interval: 'day' as const,
  startDate: START,
  endDate: END,
  projectId: PROJECT_ID,
  timezone: 'UTC',
};

function statement(fragment: SqlFragment) {
  return fragment.toStatement();
}

/**
 * The key never reaches the SQL text: it travels whole as a String param,
 * and the injected predicate appears nowhere in the statement.
 */
function keyBinding(fragment: SqlFragment) {
  const { query, query_params } = statement(fragment);
  return {
    textCarriesInjectedPredicate: query.includes(INJECTED_PREDICATE),
    textCarriesKey: query.includes(BREAKOUT_KEY),
    paramsCarryKey: Object.values(query_params).includes(BREAKOUT_KEY),
  };
}

const KEY_BOUND = {
  textCarriesInjectedPredicate: false,
  textCarriesKey: false,
  paramsCarryKey: true,
};

async function getChartSql(input: LooseChartInput): Promise<SqlFragment> {
  return buildChartSql(deps, input as ChartSqlInput);
}

async function getAggregateChartSql(
  input: LooseAggregateInput
): Promise<SqlFragment> {
  return buildAggregateChartSql(deps, input as AggregateChartSqlInput);
}

async function explain(fragment: SqlFragment): Promise<void> {
  const { query, query_params } = statement(fragment);
  await ch.command({ query: `EXPLAIN ${query}`, query_params });
}

beforeAll(async () => {
  ({ ch } = await import('@openpanel/db/src/clickhouse/client'));
  const { testServiceDeps } = await import('../../../../test/service-deps');
  deps = await testServiceDeps();
  ({
    getChartSql: buildChartSql,
    getAggregateChartSql: buildAggregateChartSql,
  } = await import('./statement'));
  fieldResolution = await import('./field-resolution');
  compiled = await import('./compiled');
  filterWhere = await import('./filter-where');
  eventSql = await import('../../event/src/sql');
  const { bootstrapTestDatabases } = await import(
    '../../../../../../test/bootstrap-databases'
  );
  await bootstrapTestDatabases();
}, 30_000);

describe('getSelectPropertyKey / key binding', () => {
  it('binds a key with a quote as one String param', () => {
    const { query, query_params } = statement(
      fieldResolution.getSelectPropertyKey(
        BREAKOUT_PROPERTY,
        undefined,
        undefined,
        undefined,
        'e'
      )
    );
    expect(query).toBe('e.properties[{p1:String}]');
    expect(query_params).toEqual({ p1: BREAKOUT_KEY });
  });

  it('binds backslashes and ] untouched', () => {
    const { query, query_params } = statement(
      fieldResolution.getSelectPropertyKey('properties.a\\b]c')
    );
    expect(query).toBe('properties[{p1:String}]');
    expect(query_params).toEqual({ p1: 'a\\b]c' });
  });

  it('binds profile property keys the same way', () => {
    const { query, query_params } = statement(
      fieldResolution.getSelectPropertyKey("profile.properties.pl'an")
    );
    expect(query).toBe('profile.properties[{p1:String}]');
    expect(query_params).toEqual({ p1: "pl'an" });
  });

  it('renders ordinary keys as before', () => {
    expect(
      statement(fieldResolution.getSelectPropertyKey('properties.foo'))
    ).toEqual({
      query: 'properties[{p1:String}]',
      query_params: { p1: 'foo' },
    });
    expect(
      statement(fieldResolution.getSelectPropertyKey('properties.a.*')).query
    ).toBe(
      'arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, {p1:String})))'
    );
    expect(
      statement(fieldResolution.getSelectPropertyKey('country')).query
    ).toBe('country');
  });
});

describe('chart SQL with a hostile property key', () => {
  it('keeps the project scope for a filter name', async () => {
    const fragment = await getChartSql({
      event: event({ filters: [hostileFilter] }),
      breakdowns: [],
      ...base,
    });
    expect(keyBinding(fragment)).toEqual(KEY_BOUND);
    await explain(fragment);
  });

  it('keeps the project scope for a breakdown name', async () => {
    const fragment = await getChartSql({
      event: event(),
      breakdowns: [breakdown(BREAKOUT_PROPERTY)],
      ...base,
    });
    expect(keyBinding(fragment)).toEqual(KEY_BOUND);
    await explain(fragment);
  });

  it('keeps the project scope for a math-metric property', async () => {
    const fragment = await getChartSql({
      event: event({
        segment: 'property_average',
        property: BREAKOUT_PROPERTY,
      }),
      breakdowns: [],
      ...base,
    });
    expect(keyBinding(fragment)).toEqual(KEY_BOUND);
    await explain(fragment);
  });

  it('keeps the project scope in aggregate chart SQL', async () => {
    const fragment = await getAggregateChartSql({
      event: event({ segment: 'property_sum', property: BREAKOUT_PROPERTY }),
      breakdowns: [breakdown(BREAKOUT_PROPERTY)],
      ...base,
    });
    expect(keyBinding(fragment)).toEqual(KEY_BOUND);
    await explain(fragment);
  });
});

describe('event SQL with a hostile property key', () => {
  const listQuery = (): EventListQuery => ({
    projectId: PROJECT_ID,
    columns: ['created_at', 'id', 'name'],
    take: 10,
    filterClauses: filterWhere.getEventFiltersWhereClause(
      [hostileFilter],
      PROJECT_ID,
      'e'
    ),
    joins: eventSql.NO_FILTER_JOINS,
    startDate: new Date(START),
    endDate: new Date(END),
  });

  it('keeps the project scope in the event list query', async () => {
    const fragment = eventSql.eventListQuery(listQuery());
    expect(keyBinding(fragment)).toEqual(KEY_BOUND);
    await explain(fragment);
  });

  it('keeps the project scope in the event count query', async () => {
    const { columns: _columns, take: _take, ...query } = listQuery();
    const fragment = eventSql.eventsCountQuery(query);
    expect(keyBinding(fragment)).toEqual(KEY_BOUND);
    await explain(fragment);
  });
});

describe('profile-property narrowing with a quoted key', () => {
  const key = "pl'an";
  const name = `profile.properties.${key}`;

  it('narrows the key and rewrites its reference to the CTE column', () => {
    const { keys, needsFullMap } = fieldResolution.collectProfilePropertyKeys([
      { name },
    ]);
    expect(keys).toEqual([key]);
    expect(needsFullMap).toBe(false);

    const cteSelect = statement(
      fieldResolution.profilePropertiesCteSelect(keys, needsFullMap)
    );
    expect(cteSelect.query).toBe(
      "properties[{p1:String}] as `profile.properties.pl'an`"
    );
    expect(cteSelect.query_params).toEqual({ p1: key });

    // The ref is a bound param, so the rewrite collapses the param itself
    // into the alias instead of searching the text for an escaped literal.
    const rewritten = statement(
      compiled.fragmentWithProfileRefs(
        fieldResolution.getSelectPropertyKey(name),
        keys
      )
    );
    expect(rewritten.query).toBe("`profile.properties.pl'an`");
    expect(rewritten.query_params).toEqual({});
  });

  it('falls back to the full Map for keys it cannot alias', () => {
    const { keys, needsFullMap } = fieldResolution.collectProfilePropertyKeys([
      { name: 'profile.properties.a\\b' },
    ]);
    expect(keys).toEqual([]);
    expect(needsFullMap).toBe(true);
    expect(
      statement(fieldResolution.profilePropertiesCteSelect(keys, needsFullMap))
        .query
    ).toBe('properties as "profile.properties"');
  });

  it('leaves ordinary keys narrowing exactly as before', () => {
    const { keys, needsFullMap } = fieldResolution.collectProfilePropertyKeys([
      { name: 'profile.properties.plan' },
    ]);
    expect(keys).toEqual(['plan']);
    expect(needsFullMap).toBe(false);
    expect(
      statement(fieldResolution.profilePropertiesCteSelect(keys, needsFullMap))
        .query
    ).toBe('properties[{p1:String}] as `profile.properties.plan`');
    expect(
      statement(
        compiled.fragmentWithProfileRefs(
          fieldResolution.getSelectPropertyKey('profile.properties.plan'),
          keys
        )
      ).query
    ).toBe('`profile.properties.plan`');
  });
});
