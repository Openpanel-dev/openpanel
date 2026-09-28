import { describe, expect, it } from 'bun:test';
import { sql } from './sql';

/**
 * The ADR-013 P2 round-trip: every param type the codebase uses, bound through
 * `chQuery` (so the `query_params` path is exercised through `withRetry` /
 * round-robin, R1) and read back off a real local ClickHouse.
 *
 * Payloads are hostile on purpose — single quote, double quote, backslash,
 * newline, tab, and a literal `{p1:String}` — because the escaping lives in the
 * driver and the parsing lives in the server, and neither is ours.
 *
 * This suite runs against its own `openpanel_test` database, which it creates.
 * It must never touch the local `openpanel` prod-copy: those tables hold
 * hundreds of millions of rows, and a `FINAL` / `ARRAY JOIN` scan over them
 * times the HTTP client out while the rest of the suite runs in parallel
 * against the same node.
 */

const CLICKHOUSE_TEST_DATABASE = 'openpanel_test';
const DEFAULT_CLICKHOUSE_BASE_URL = 'http://localhost:23123';

/**
 * Well above the app default (30s): this suite shares one local node with
 * every other test file in the run, and a queued request should wait rather
 * than fail.
 */
const CLICKHOUSE_TEST_REQUEST_TIMEOUT_MS = 120_000;

function testDatabaseUrl(): { base: string; withDatabase: string } {
  const configured = (process.env.CLICKHOUSE_URL ?? '').split(',')[0]?.trim();
  const url = new URL(configured || DEFAULT_CLICKHOUSE_BASE_URL);
  url.pathname = '/';
  const base = url.toString();
  url.pathname = `/${CLICKHOUSE_TEST_DATABASE}`;
  return { base, withDatabase: url.toString() };
}

const { base: CLICKHOUSE_BASE_URL, withDatabase: CLICKHOUSE_TEST_URL } =
  testDatabaseUrl();

async function execute(statement: string): Promise<void> {
  const response = await fetch(CLICKHOUSE_BASE_URL, {
    method: 'POST',
    body: statement,
  });
  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
}

/**
 * Minimal stand-ins for the three tables this suite names — same engine and
 * sort key as production, only the columns the assertions touch. They stay
 * empty; every query here asserts on shape, not on data.
 */
const FIXTURE_TABLES = [
  `CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_TEST_DATABASE}.events (
     id UUID DEFAULT generateUUIDv4(),
     project_id String,
     profile_id String,
     groups Array(String) DEFAULT [],
     created_at DateTime64(3)
   ) ENGINE = MergeTree
   PARTITION BY toYYYYMM(created_at)
   ORDER BY (project_id, toDate(created_at), created_at)`,
  `CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_TEST_DATABASE}.profiles (
     id String,
     project_id String,
     first_name String,
     last_name String,
     last_seen_at DateTime64(3)
   ) ENGINE = ReplacingMergeTree(last_seen_at)
   ORDER BY (project_id, id)`,
  `CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_TEST_DATABASE}.sessions (
     id String,
     project_id String,
     created_at DateTime64(3),
     sign Int8,
     version UInt64
   ) ENGINE = VersionedCollapsingMergeTree(sign, version)
   PARTITION BY toYYYYMM(created_at)
   ORDER BY (project_id, toDate(created_at), created_at)`,
];

async function bootstrapTestDatabase(): Promise<boolean> {
  try {
    await execute(`CREATE DATABASE IF NOT EXISTS ${CLICKHOUSE_TEST_DATABASE}`);
    for (const table of FIXTURE_TABLES) {
      await execute(table);
    }
    return true;
  } catch {
    return false;
  }
}

const clickhouseReachable = await bootstrapTestDatabase();

// ./client reads both of these once, at module evaluation, so they have to be
// set before it is imported — hence the dynamic import.
process.env.CLICKHOUSE_URL = CLICKHOUSE_TEST_URL;
process.env.CLICKHOUSE_REQUEST_TIMEOUT_MS = String(
  CLICKHOUSE_TEST_REQUEST_TIMEOUT_MS
);

const { chQuery } = await import('./client');

const HOSTILE = `it's a "quoted" \\ backslash {p1:String} }brace{ \n newline \t tab`;
const BIG_UINT64 = 1_234_567_890_123;

const describeAgainstClickhouse = describe.skipIf(!clickhouseReachable);

/** ClickHouse type names carry `(` and `)`; they are matched literally. */
const escapeRegExp = (literal: string) =>
  literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Returns `unknown` rather than a generic `T` on purpose. bun:test's `expect`
 * has an `(actual?: never)` overload, which makes the argument position a
 * contextual inference site: a generic helper called bare there resolves its
 * parameter to `never`, and every `toBe(...)` below then fails to compile
 * against `Matchers<undefined>`. vitest's `expect(actual: any)` applied no
 * such pressure. Each assertion states the expected value itself, so nothing
 * is lost by widening here.
 */
const value = async (
  query: Parameters<typeof chQuery>[0],
  settings?: Parameters<typeof chQuery>[1]
): Promise<unknown> => {
  const rows = await chQuery<{ value: unknown }>(query, settings);
  return rows[0]?.value;
};

describeAgainstClickhouse('param round-trip against local ClickHouse', () => {
  it('String survives quotes, backslashes, braces and whitespace', async () => {
    expect(await value(sql`SELECT ${sql.string(HOSTILE)} AS value`)).toBe(
      HOSTILE
    );
  });

  it('UInt64', async () => {
    // chQueryWithMeta parseFloats anything whose meta type contains 'Int',
    // so this asserts the value that reaches a caller, not the wire form.
    expect(await value(sql`SELECT ${sql.uint64(BIG_UINT64)} AS value`)).toBe(
      BIG_UINT64
    );
    expect(await value(sql`SELECT ${sql.uint64(42n)} AS value`)).toBe(42);
  });

  it('Float64', async () => {
    expect(await value(sql`SELECT ${sql.float64(-1.5)} AS value`)).toBe(-1.5);
  });

  it('DateTime64(3) keeps millisecond precision', async () => {
    const date = new Date('2026-04-29T13:45:07.123Z');
    expect(
      await value(
        sql`SELECT toUnixTimestamp64Milli(${sql.dateTime64(date)}) AS value`
      )
    ).toBe(date.getTime());
    expect(
      await value(
        sql`SELECT toString(${sql.dateTime64('2026-04-29 13:45:07.123')}) AS value`
      )
    ).toBe('2026-04-29 13:45:07.123');
  });

  it('Date takes the calendar-day text form, not a timestamp', async () => {
    expect(
      await value(
        sql`SELECT toString(${sql.date(new Date('2026-04-29T13:45:00.000Z'))}) AS value`
      )
    ).toBe('2026-04-29');

    // Why sql.date() formats: the driver serializes a JS Date as a unix
    // timestamp, and ClickHouse refuses that for the Date type.
    await expect(
      chQuery(sql`SELECT ${sql.param('Date', new Date())} AS value`)
    ).rejects.toThrow(/cannot be parsed as Date/);
  });

  it('Array(String) with hostile items', async () => {
    const items = [HOSTILE, "', 'injected", '{p1:String}'];
    expect(
      await value(sql`SELECT ${sql.array('String', items)} AS value`)
    ).toEqual(items);
  });

  it('Map(String,String) with hostile keys and values', async () => {
    const map = { [HOSTILE]: HOSTILE, "key'": '}value{' };
    expect(
      await value(sql`SELECT ${sql.map('String', 'String', map)} AS value`)
    ).toEqual(map);
  });

  it('Nullable(String) carries null and a hostile value', async () => {
    expect(
      await value(sql`SELECT isNull(${sql.nullable('String', null)}) AS value`)
    ).toBe(1);
    expect(
      await value(sql`SELECT ${sql.nullable('String', HOSTILE)} AS value`)
    ).toBe(HOSTILE);
  });

  it('UUID', async () => {
    const id = '11111111-2222-3333-4444-555555555555';
    expect(await value(sql`SELECT toString(${sql.uuid(id)}) AS value`)).toBe(
      id
    );
  });

  it('Bool', async () => {
    expect(await value(sql`SELECT ${sql.bool(true)} AS value`)).toBe(true);
    expect(await value(sql`SELECT ${sql.bool(false)} AS value`)).toBe(false);
  });

  it('a payload that looks like SQL stays data', async () => {
    // Interpolated, this returns 1 row. Bound, it returns 0.
    const payload = "nope' OR '1'='1";
    expect(
      await value(
        sql`SELECT count() AS value FROM (SELECT 'safe' AS path) WHERE path = ${sql.string(payload)}`
      )
    ).toBe(0);
  });

  it('rejects a hostile payload on a non-text type instead of inlining it', async () => {
    // The types above cannot carry quotes or braces, so the round-trip for
    // them is the negative one: the server refuses the value as data. The
    // payload never becomes SQL text, which is the property under test.
    const hostileOn: [string, ReturnType<typeof sql.param>][] = [
      ['UInt64', sql.param('UInt64', HOSTILE)],
      ['Float64', sql.param('Float64', HOSTILE)],
      ['DateTime64(3)', sql.dateTime64(HOSTILE)],
      ['Date', sql.date(HOSTILE)],
      ['Bool', sql.param('Bool', HOSTILE)],
    ];

    for (const [type, hostileParam] of hostileOn) {
      await expect(
        chQuery(sql`SELECT ${hostileParam} AS value`),
        type
      ).rejects.toThrow(
        new RegExp(`cannot be parsed as ${escapeRegExp(type)}`)
      );
    }
  });
});

/**
 * Identifier positional matrix — measured against ClickHouse 26.1.3.52 on
 * 2026-09-02. This is the split ADR-013 risk 3 says is unknown until P2 runs:
 * where `{x:Identifier}` works, and where a call site must use `sql.id()`
 * (validated inline text) instead.
 *
 * | Position                                   | `{x:Identifier}` |
 * |--------------------------------------------|------------------|
 * | SELECT column                              | works            |
 * | SELECT alias (`1 AS {c:Identifier}`)       | works            |
 * | Aggregate/function argument                | works            |
 * | WHERE column                               | works            |
 * | GROUP BY column                            | works            |
 * | ORDER BY column                            | works            |
 * | FROM table                                 | works            |
 * | JOIN table                                 | works            |
 * | FROM table inside a CTE                    | works            |
 * | database.table as two separate params      | works            |
 * | `'db.table'` in ONE param                  | FAILS — quoted whole |
 * | `'alias.column'` in ONE param              | FAILS — quoted whole |
 * | SETTINGS value (`session_timezone = {…}`)  | FAILS — syntax error, any type |
 *
 * Consequences for the P5-P8 conversions:
 *  - qualified names are two params, or one `sql.id('profiles.name')`;
 *  - a per-query `session_timezone` goes through `chQuery`'s
 *    `clickhouse_settings` argument, not through the SQL text.
 */
describeAgainstClickhouse('Identifier positional matrix', () => {
  const table = sql.identifier('events');

  it('works in SELECT, alias, function, WHERE, GROUP BY and ORDER BY', async () => {
    const column = sql.identifier('a');
    expect(
      await value(sql`SELECT ${column} AS value FROM (SELECT 1 AS a)`)
    ).toBe(1);
    expect(
      await value(sql`SELECT sum(${column}) AS value FROM (SELECT 1 AS a)`)
    ).toBe(1);
    expect(
      await value(
        sql`SELECT a AS value FROM (SELECT 1 AS a) WHERE ${column} = 1`
      )
    ).toBe(1);
    expect(
      await value(
        sql`SELECT count() AS value FROM (SELECT 1 AS a) GROUP BY ${column} ORDER BY ${column}`
      )
    ).toBe(1);

    const aliased = await chQuery<Record<string, number>>(
      sql`SELECT 1 AS ${sql.identifier('value')}`
    );
    expect(aliased[0]?.value).toBe(1);
  });

  it('works for a table name in FROM, JOIN and a CTE', async () => {
    expect(
      await value(sql`SELECT count() AS value FROM ${table} WHERE 0`)
    ).toBe(0);
    expect(
      await value(
        sql`SELECT count() AS value FROM (SELECT 1 AS a) AS x JOIN ${table} AS y ON 0 WHERE 0`
      )
    ).toBe(0);
    expect(
      await value(
        sql`WITH c AS (SELECT count() AS value FROM ${table} WHERE 0) SELECT value FROM c`
      )
    ).toBe(0);
  });

  it('works for database.table as two params', async () => {
    expect(
      await value(
        sql`SELECT count() AS value FROM ${sql.identifier(CLICKHOUSE_TEST_DATABASE)}.${table} WHERE 0`
      )
    ).toBe(0);
  });

  it('fails for a dotted name in a single param — use sql.id or two params', async () => {
    await expect(
      chQuery(
        sql`SELECT count() AS value FROM ${sql.identifier(`${CLICKHOUSE_TEST_DATABASE}.events`)} WHERE 0`
      )
    ).rejects.toThrow(/Unknown table expression identifier/);
    await expect(
      chQuery(
        sql`SELECT ${sql.identifier('t.a')} AS value FROM (SELECT 1 AS a) AS t`
      )
    ).rejects.toThrow(/Unknown expression identifier/);

    // sql.id() is the supported form for a qualified reference.
    expect(
      await value(
        sql`SELECT ${sql.id('t.a')} AS value FROM (SELECT 1 AS a) AS t`
      )
    ).toBe(1);
  });

  it('fails inside a SETTINGS clause, for any param type', async () => {
    await expect(
      chQuery(sql`SELECT 1 SETTINGS session_timezone = ${sql.string('UTC')}`)
    ).rejects.toThrow(/Syntax error/);
    await expect(
      chQuery(
        sql`SELECT 1 SETTINGS session_timezone = ${sql.identifier('UTC')}`
      )
    ).rejects.toThrow(/Syntax error/);

    // The supported route: settings travel beside the query.
    expect(
      await value(
        sql`SELECT toString(toTimeZone(toDateTime(0), timezone())) AS value`,
        { session_timezone: 'Europe/Stockholm' }
      )
    ).toBe('1970-01-01 01:00:00');
  });

  it('neutralises an injection payload in an Identifier param', async () => {
    await expect(
      chQuery(
        sql`SELECT ${sql.identifier('a) UNION ALL (SELECT 2')} AS value FROM (SELECT 1 AS a)`
      )
    ).rejects.toThrow(/Unknown expression identifier/);
  });
});

describeAgainstClickhouse('local builder fallback executes (R5)', () => {
  const PROFILE_COLUMNS = ['first_name', 'last_name'] as const;

  it('binds every value the imperative assembly produced', async () => {
    // R5 permits local assembly; it does not permit unbound text. Hostile
    // values go in as data and the server matches nothing.
    const filters = [
      { column: 'first_name', value: HOSTILE },
      { column: 'last_name', value: "' OR 1=1 --" },
    ];
    const conditions = filters.map(
      ({ column, value }) =>
        sql`${sql.id(column, PROFILE_COLUMNS)} = ${sql.string(value)}`
    );

    expect(
      await value(
        sql`SELECT count() AS value FROM profiles WHERE ${sql.join(conditions, ' AND ')}`
      )
    ).toBe(0);
  });
});

describeAgainstClickhouse('cluster constructs execute unchanged (R4)', () => {
  it('accepts GLOBAL IN, PREWHERE, ARRAY JOIN, LIMIT BY and a bound LIMIT', async () => {
    const projectId = sql.string('__no_such_project__');
    const rows = await chQuery(sql`
      SELECT e.id AS id, g AS grp
      FROM events AS e
      ARRAY JOIN e.groups AS g
      PREWHERE e.project_id = ${projectId}
      WHERE e.profile_id GLOBAL IN (
        SELECT id FROM profiles WHERE project_id = ${projectId}
      )
      ORDER BY e.created_at
      LIMIT 1 BY e.id
      LIMIT ${sql.param('UInt32', 10)}
    `);
    expect(rows).toEqual([]);
  });

  it('accepts GLOBAL JOIN alongside a trailing literal SETTINGS clause', async () => {
    // The SETTINGS *value* cannot be a param (see the matrix above), but a
    // literal SETTINGS tail must still survive the tag untouched.
    const projectId = sql.string('__no_such_project__');
    expect(
      await value(sql`
        SELECT count() AS value
        FROM events AS e
        GLOBAL JOIN (
          SELECT id FROM profiles WHERE project_id = ${projectId}
        ) AS p ON e.profile_id = p.id
        WHERE e.project_id = ${projectId}
        SETTINGS max_execution_time = 30
      `)
    ).toBe(0);
  });

  it('accepts FINAL and WITH FILL with bound bounds', async () => {
    const from = sql.dateTime64('2026-01-01 00:00:00.000');
    const to = sql.dateTime64('2026-01-04 00:00:00.000');
    const rows = await chQuery<{ d: string; c: number }>(sql`
      SELECT toStartOfDay(created_at) AS d, count() AS c
      FROM sessions FINAL
      WHERE project_id = ${sql.string('__no_such_project__')}
        AND created_at >= ${from} AND created_at < ${to}
      GROUP BY d
      ORDER BY d WITH FILL FROM toStartOfDay(${from}) TO toStartOfDay(${to}) STEP toIntervalDay(1)
    `);
    expect(rows.map((row) => row.c)).toEqual([0, 0, 0]);
  });
});
