import { describe, expect, it } from 'bun:test';
import { type SqlFragment, SqlIdentifierError, sql, toStatement } from './sql';

describe('sql tag — slot typing (R1)', () => {
  it('is a compile-time error to interpolate a bare value', () => {
    // The whole safety property of ADR-013: a raw string or number can never
    // reach the SQL text. If either of these ever stops erroring, injection
    // has become writable again and `pnpm run typecheck` is the alarm.
    const path = "/blog' OR '1'='1";
    // @ts-expect-error — a bare string is not a SqlFragment | SqlParam
    const withString = sql`SELECT * FROM events WHERE path = ${path}`;
    // @ts-expect-error — a bare number is not a SqlFragment | SqlParam
    const withNumber = sql`SELECT * FROM events LIMIT ${10}`;

    expect(withString).toBeDefined();
    expect(withNumber).toBeDefined();
  });

  it('accepts params and fragments', () => {
    const { query, query_params } = sql`
      SELECT * FROM events WHERE project_id = ${sql.string('p1')}
    `.toStatement();

    expect(query).toContain('{p1:String}');
    expect(query_params).toEqual({ p1: 'p1' });
  });
});

describe('auto-named params (R2)', () => {
  it('numbers params in source order', () => {
    const { query, query_params } = sql`
      SELECT ${sql.string('a')}, ${sql.uint64(2)}, ${sql.float64(3.5)}
    `.toStatement();

    expect(query).toContain('{p1:String}, {p2:UInt64}, {p3:Float64}');
    expect(query_params).toEqual({ p1: 'a', p2: 2, p3: 3.5 });
  });

  it('stays collision-free through three levels of nesting', () => {
    const innermost = sql`name = ${sql.string('inner')}`;
    const middle = sql`(${innermost} AND country = ${sql.string('middle')})`;
    const outer = sql`(${middle} AND project_id = ${sql.string('outer')})`;

    const { query, query_params } = sql`
      SELECT * FROM events WHERE ${outer} AND created_at > ${sql.dateTime64('2026-01-01 00:00:00.000')}
    `.toStatement();

    expect(query).toContain(
      '((name = {p1:String} AND country = {p2:String}) AND project_id = {p3:String})'
    );
    expect(query_params).toEqual({
      p1: 'inner',
      p2: 'middle',
      p3: 'outer',
      p4: '2026-01-01 00:00:00.000',
    });
  });

  it('gives each use of a reused fragment its own param name', () => {
    // Two independently-built fragments — and the same fragment twice — must
    // not share a placeholder, or one value silently binds to both slots.
    const shared = sql`name = ${sql.string('screen_view')}`;
    const { query, query_params } =
      sql`SELECT countIf(${shared}), countIf(${shared})`.toStatement();

    expect(query).toBe(
      'SELECT countIf(name = {p1:String}), countIf(name = {p2:String})'
    );
    expect(query_params).toEqual({ p1: 'screen_view', p2: 'screen_view' });
  });

  it('composes lists with join without any raw text', () => {
    const names = ['a', 'b', 'c'];
    const clauses = sql.join(
      names.map((name) => sql`name = ${sql.string(name)}`),
      ' OR '
    );
    const { query, query_params } =
      sql`SELECT * FROM events WHERE ${clauses}`.toStatement();

    expect(query).toBe(
      'SELECT * FROM events WHERE name = {p1:String} OR name = {p2:String} OR name = {p3:String}'
    );
    expect(query_params).toEqual({ p1: 'a', p2: 'b', p3: 'c' });
  });

  it('renders empty fragments and empty joins as nothing', () => {
    const { query, query_params } =
      sql`SELECT 1 ${sql.empty}${sql.join([])}`.toStatement();

    expect(query).toBe('SELECT 1 ');
    expect(query_params).toEqual({});
  });

  it('leaves a plain string query untouched, with no params', () => {
    expect(toStatement('SELECT 1')).toEqual({
      query: 'SELECT 1',
      query_params: {},
    });
  });
});

describe('sql.id (R3)', () => {
  const PROFILE_COLUMNS = ['id', 'first_name', 'last_name'] as const;

  it('inlines a bare identifier', () => {
    expect(sql.id('first_name').toStatement().query).toBe('first_name');
  });

  it('inlines a once-qualified identifier', () => {
    expect(sql.id('profiles.first_name').toStatement().query).toBe(
      'profiles.first_name'
    );
  });

  it('throws — never falls back to interpolation — for unsafe input', () => {
    const hostile = [
      "name'; DROP TABLE events; --",
      'name` OR 1=1',
      'name OR 1=1',
      'properties["x"]',
      'a.b.c',
      '',
      '1name',
      'näme',
      'a'.repeat(65),
    ];

    for (const identifier of hostile) {
      expect(() => sql.id(identifier)).toThrow(SqlIdentifierError);
    }
  });

  it('throws for an identifier outside the caller whitelist', () => {
    expect(() => sql.id('first_name', PROFILE_COLUMNS)).not.toThrow();
    expect(() => sql.id('password', PROFILE_COLUMNS)).toThrow(
      SqlIdentifierError
    );
  });
});

describe('raw ClickHouse constructs pass through (R4)', () => {
  it('does not obstruct GLOBAL IN/JOIN, PREWHERE, FINAL, LIMIT BY, WITH FILL, ARRAY JOIN or SETTINGS', () => {
    const projectId = sql.string('proj_1');
    const { query } = sql`
      SELECT s.session_id, arrayJoin(s.paths) AS path
      FROM sessions AS s FINAL
      ARRAY JOIN s.paths
      PREWHERE s.project_id = ${projectId}
      WHERE s.profile_id GLOBAL IN (SELECT id FROM profiles WHERE project_id = ${projectId})
      GLOBAL JOIN (SELECT id FROM profiles WHERE project_id = ${projectId}) AS p ON s.profile_id = p.id
      ORDER BY s.created_at
      LIMIT 1 BY s.session_id
      WITH FILL FROM toDateTime(${sql.dateTime64('2026-01-01 00:00:00.000')}) STEP 1
      SETTINGS session_timezone = ${sql.string('Europe/Stockholm')}
    `.toStatement();

    for (const construct of [
      'FINAL',
      'ARRAY JOIN',
      'PREWHERE',
      'GLOBAL IN',
      'GLOBAL JOIN',
      'LIMIT 1 BY',
      'WITH FILL',
      'SETTINGS session_timezone',
    ]) {
      expect(query).toContain(construct);
    }
  });
});

describe('local function-scoped builder fallback (R5)', () => {
  const PROFILE_COLUMNS = ['first_name', 'country'] as const;

  /**
   * The shape R5 sanctions: assembly is imperative and local, but the return
   * type is a fragment, so every value still leaves as a bound `{pN:Type}`
   * and every identifier still goes through `sql.id`'s whitelist.
   */
  const buildProfileFilter = (
    filters: readonly { column: string; value: string }[]
  ): SqlFragment => {
    const conditions: SqlFragment[] = [];
    for (const { column, value } of filters) {
      conditions.push(
        sql`${sql.id(column, PROFILE_COLUMNS)} = ${sql.string(value)}`
      );
    }
    return conditions.length === 0
      ? sql.empty
      : sql`WHERE ${sql.join(conditions, ' AND ')}`;
  };

  it('emits bound params from an imperatively assembled query', () => {
    const { query, query_params } =
      sql`SELECT id FROM profiles ${buildProfileFilter([
        { column: 'first_name', value: "O'Brien" },
        { column: 'country', value: 'SE' },
      ])}`.toStatement();

    expect(query).toBe(
      'SELECT id FROM profiles WHERE first_name = {p1:String} AND country = {p2:String}'
    );
    expect(query_params).toEqual({ p1: "O'Brien", p2: 'SE' });
  });

  it('still refuses an identifier the builder did not whitelist', () => {
    expect(() =>
      buildProfileFilter([{ column: 'email', value: 'a@b.c' }])
    ).toThrow(SqlIdentifierError);
  });

  it('degrades to no clause, and no params, when there is nothing to filter', () => {
    expect(
      sql`SELECT id FROM profiles ${buildProfileFilter([])}`.toStatement()
    ).toEqual({ query: 'SELECT id FROM profiles ', query_params: {} });
  });
});

describe('injection (ported from query-builder.test.ts)', () => {
  const bind = (value: string) =>
    sql`SELECT * FROM events WHERE e.path = ${sql.string(value)}`.toStatement();

  it('cannot break out of a string with a date-substring payload', () => {
    const payload = "/blog/2024-01-01' OR '1'='1";
    const { query, query_params } = bind(payload);

    expect(query).toBe('SELECT * FROM events WHERE e.path = {p1:String}');
    expect(query).not.toContain(payload);
    expect(query).not.toContain("'");
    // The value travels beside the query, verbatim — the server escapes it.
    expect(query_params.p1).toBe(payload);
  });

  it('leaves a path containing a date substring intact (the escapeDate bug)', () => {
    const payload = '/blog/2024-03-17-supabase-activity-scheduler';
    const { query_params } = bind(payload);

    // clix re-quoted any date-shaped substring in place; binding cannot.
    expect(query_params.p1).toBe(payload);
  });

  it('does not re-interpret a payload that looks like a placeholder', () => {
    const { query, query_params } = bind('{p1:String}');

    expect(query).toBe('SELECT * FROM events WHERE e.path = {p1:String}');
    expect(query_params.p1).toBe('{p1:String}');
  });

  // M12-009 completed the port: the four cases below were still only asserted
  // against clix when query-builder.test.ts was deleted. Each keeps that
  // test's payload; what changes is the mechanism the payload proves —
  // clix asserted on the escaped literal it produced, the tag asserts the
  // value never reaches the text at all.

  it('binds a plain ISO date string instead of quoting it', () => {
    const { query, query_params } =
      sql`SELECT * FROM events WHERE e.created_at = ${sql.string('2026-04-29 00:00:00')}`.toStatement();

    expect(query).toBe('SELECT * FROM events WHERE e.created_at = {p1:String}');
    expect(query_params.p1).toBe('2026-04-29 00:00:00');
  });

  it('binds a Date as a datetime value, not a literal in the text', () => {
    const { query, query_params } =
      sql`SELECT * FROM events WHERE e.created_at = ${sql.dateTime64('2026-04-29 00:00:00.000')}`.toStatement();

    expect(query).toBe(
      'SELECT * FROM events WHERE e.created_at = {p1:DateTime64(3)}'
    );
    expect(query_params.p1).toBe('2026-04-29 00:00:00.000');
  });

  it('keeps a toDateTime() wrapper as SQL text with the value bound', () => {
    // clix.datetime(date, 'toDateTime') produced the call AND the quoted
    // literal in one string. The wrapper is structure and stays raw; the
    // value is a value and binds.
    const { query, query_params } =
      sql`SELECT * FROM events WHERE e.created_at = toDateTime(${sql.string('2026-04-29 00:00:00')})`.toStatement();

    expect(query).toBe(
      'SELECT * FROM events WHERE e.created_at = toDateTime({p1:String})'
    );
    expect(query_params.p1).toBe('2026-04-29 00:00:00');
  });

  it('handles BETWEEN with two wrapped datetime values', () => {
    const { query, query_params } =
      sql`SELECT * FROM events WHERE e.created_at BETWEEN toDateTime(${sql.string('2026-04-29 00:00:00')}) AND toDateTime(${sql.string('2026-05-07 00:00:00')})`.toStatement();

    expect(query).toBe(
      'SELECT * FROM events WHERE e.created_at BETWEEN toDateTime({p1:String}) AND toDateTime({p2:String})'
    );
    expect(query_params.p1).toBe('2026-04-29 00:00:00');
    expect(query_params.p2).toBe('2026-05-07 00:00:00');
  });

  it('does not promote an arbitrary string with an embedded date to SQL', () => {
    const { query, query_params } = bind('event-2026-04-15-launch');

    expect(query).toBe('SELECT * FROM events WHERE e.path = {p1:String}');
    expect(query).not.toContain('2026-04-15');
    expect(query_params.p1).toBe('event-2026-04-15-launch');
  });
});

describe('param constructors', () => {
  it('formats a Date value as a calendar day for the Date type', () => {
    // ClickHouse rejects a unix timestamp for `Date`; the driver would send
    // one for a JS Date. See sql.clickhouse.test.ts.
    expect(sql.date(new Date('2026-04-29T13:45:00.000Z')).value).toBe(
      '2026-04-29'
    );
    expect(sql.date('2026-04-29').value).toBe('2026-04-29');
  });

  it('declares composite types', () => {
    expect(sql.array('String', ['a']).type).toBe('Array(String)');
    expect(sql.map('String', 'String', { a: 'b' }).type).toBe(
      'Map(String,String)'
    );
    expect(sql.nullable('String', null).type).toBe('Nullable(String)');
    expect(sql.dateTime64('2026-01-01 00:00:00.000').type).toBe(
      'DateTime64(3)'
    );
    expect(sql.identifier('created_at').type).toBe('Identifier');
  });
});
