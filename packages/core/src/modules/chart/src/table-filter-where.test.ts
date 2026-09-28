/**
 * Unit tests for `buildFilterWhere`.
 *
 * No ClickHouse needed. The compiler returns bound `SqlFragment`s, so each
 * clause is rendered through `toStatement` and its params substituted back
 * in: what the assertions say is unchanged, a value that used to appear as
 * an escaped literal now appears in `query_params`. The
 * interesting part is the `profile.*` branch: the field name arrives from the
 * caller (saved report, URL state, raw API call) and used to be concatenated
 * into the SQL text as-is, so a name that was not a column produced whatever
 * SQL the caller wrote. It now resolves against the known profiles columns and
 * the filter is dropped when it does not, which is what the `group.*` and
 * `session.*` branches already did.
 */

import { describe, expect, it } from 'bun:test';
import { TABLE_NAMES } from '@openpanel/db/src/clickhouse/client';
import type { SqlParamValue } from '@openpanel/db/src/clickhouse/sql';
import type { IChartEventFilter } from '../../report/report.constants';
import {
  buildFilterWhere,
  type FilterTableContext,
} from './table-filter-where';

const PROJECT_ID = 'p';

const CONTEXTS: Record<string, FilterTableContext> = {
  events: {
    selfTable: 'events',
    profileIdExpr: 'profile_id',
    groupsExpr: 'groups',
  },
  sessions: {
    selfTable: 'sessions',
    profileIdExpr: 'profile_id',
    groupsExpr: 'groups',
  },
  profiles: {
    selfTable: 'profiles',
    profileIdExpr: 'id',
    groupsExpr: 'groups',
  },
};

const TABLES = Object.keys(CONTEXTS) as Array<keyof typeof CONTEXTS>;

const filter = (
  overrides: Partial<IChartEventFilter> & { name: string }
): IChartEventFilter =>
  ({
    id: overrides.name,
    operator: 'is',
    value: ['x'],
    ...overrides,
  }) as IChartEventFilter;

const compile = (table: keyof typeof CONTEXTS, filters: IChartEventFilter[]) =>
  buildFilterWhere(filters, PROJECT_ID, CONTEXTS[table]!);

/**
 * Render every compiled clause with its params substituted back in, so the
 * expectations below stay the SQL a reader can paste into ClickHouse.
 */
const build = (
  table: keyof typeof CONTEXTS,
  filters: IChartEventFilter[]
): Record<string, string> => {
  const rendered: Record<string, string> = {};
  for (const [key, fragment] of Object.entries(compile(table, filters))) {
    rendered[key] = substitute(fragment.toStatement());
  }
  return rendered;
};

const paramsOf = (
  table: keyof typeof CONTEXTS,
  filters: IChartEventFilter[]
): Record<string, SqlParamValue>[] =>
  Object.values(compile(table, filters)).map(
    (fragment) => fragment.toStatement().query_params
  );

const PLACEHOLDER = /\{(p\d+):[^}]+\}/g;

function substitute({
  query,
  query_params,
}: {
  query: string;
  query_params: Record<string, SqlParamValue>;
}): string {
  return query.replace(PLACEHOLDER, (_match, name: string) =>
    literal(query_params[name])
  );
}

function literal(value: SqlParamValue | undefined): string {
  if (Array.isArray(value)) {
    return `(${value.map((item) => literal(item as SqlParamValue)).join(', ')})`;
  }
  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "\\'")}'`;
  }
  return String(value);
}

/** What `buildProfileClause` wraps `inner` in for a given table. */
const profileWrap = (table: keyof typeof CONTEXTS, inner: string): string =>
  table === 'profiles'
    ? `(${inner})`
    : `(profile_id IN (SELECT id FROM ${TABLE_NAMES.profiles} FINAL WHERE project_id = 'p' AND ${inner}))`;

const ALLOWED_STRING_COLUMNS = [
  'id',
  'first_name',
  'last_name',
  'email',
  'avatar',
];

/**
 * Names that are not profiles columns. Each exercises a different shape of the
 * problem: a space, an operator, parentheses, a quote, a nested SELECT.
 */
const REJECTED_NAMES = [
  'profile.not a column',
  'profile.id = id',
  'profile.count(id)',
  "profile.id' OR '1'='1",
  'profile.id IN (SELECT id FROM profiles)',
];

describe.each(TABLES)('buildFilterWhere on %s', (table) => {
  it('keeps every allowed profile.<column> predicate', () => {
    for (const column of ALLOWED_STRING_COLUMNS) {
      const where = build(table, [
        filter({ name: `profile.${column}`, value: ['a'] }),
      ]);
      expect(where.f0).toBe(profileWrap(table, `${column} = 'a'`));
    }
  });

  it('keeps the numeric handling for created_at and last_seen_at', () => {
    for (const column of ['created_at', 'last_seen_at']) {
      const where = build(table, [
        filter({ name: `profile.${column}`, operator: 'gt', value: ['123'] }),
      ]);
      expect(where.f0).toBe(
        profileWrap(table, `(toFloat64(${column}) > toFloat64('123'))`)
      );
    }
  });

  it('keeps the escaped map lookup for profile.properties.<key>', () => {
    const where = build(table, [
      filter({ name: 'profile.properties.plan', value: ['pro'] }),
    ]);
    expect(where.f0).toBe(profileWrap(table, "properties['plan'] = 'pro'"));
  });

  it('escapes a quote in a properties key', () => {
    const filters = [
      filter({ name: "profile.properties.pl'an", value: ['pro'] }),
    ];
    const where = build(table, filters);
    expect(where.f0).toBe(profileWrap(table, "properties['pl\\'an'] = 'pro'"));
    // The key is a bound param now, so the quote never reaches the SQL text.
    expect(Object.values(paramsOf(table, filters)[0]!)).toContain("pl'an");
  });

  it.each(REJECTED_NAMES)('drops the unknown profile field %j', (name) => {
    const where = build(table, [filter({ name, value: ['a'] })]);
    expect(where).toEqual({});
    expect(where.f0).toBeUndefined();
    // The supplied name must not survive anywhere in the generated SQL.
    const sql = Object.values(where).join(' AND ');
    expect(sql).not.toContain(name.replace(/^profile\./, ''));
  });

  it('keeps the allowed filter and drops the rejected one', () => {
    const where = build(table, [
      filter({ name: 'profile.email', value: ['a@b.com'] }),
      filter({ name: 'profile.not a column', value: ['a'] }),
    ]);
    expect(Object.keys(where)).toEqual(['f0']);
    expect(where.f0).toBe(profileWrap(table, "email = 'a@b.com'"));
  });

  it('keys surviving filters by their original index', () => {
    const where = build(table, [
      filter({ name: 'profile.not a column', value: ['a'] }),
      filter({ name: 'profile.email', value: ['a@b.com'] }),
    ]);
    expect(Object.keys(where)).toEqual(['f1']);
  });

  it('parenthesizes every fragment it returns', () => {
    const where = build(table, [
      filter({
        name: 'profile.email',
        operator: 'contains',
        value: ['a', 'b'],
      }),
      filter({ name: 'profile.id', value: ['1', '2'] }),
      filter({ name: 'profile.created_at', operator: 'gt', value: ['1'] }),
    ]);
    const fragments = Object.values(where);
    expect(fragments).toHaveLength(3);
    for (const fragment of fragments) {
      expect(fragment.startsWith('(')).toBe(true);
      expect(fragment.endsWith(')')).toBe(true);
    }
  });

  it('leaves no OR outside parentheses when a caller joins with AND', () => {
    const where = build(table, [
      filter({
        name: 'profile.email',
        operator: 'contains',
        value: ['a', 'b'],
      }),
      filter({ name: 'profile.created_at', operator: 'gt', value: ['1', '2'] }),
    ]);
    const sql = [`project_id = 'p'`, ...Object.values(where)].join(' AND ');
    expect(topLevel(sql)).not.toContain(' OR ');
    expect(topLevel(sql)).toContain(' AND ');
  });
});

describe('buildFilterWhere project scoping', () => {
  it('still scopes the profiles subselect by project_id on non-profiles tables', () => {
    for (const table of ['events', 'sessions'] as const) {
      const where = build(table, [
        filter({ name: 'profile.email', value: ['a@b.com'] }),
      ]);
      expect(where.f0).toContain(`project_id = 'p'`);
      expect(where.f0).toContain(` AND email = 'a@b.com'`);
    }
  });

  it('has no subselect on the profiles table', () => {
    const where = build('profiles', [
      filter({ name: 'profile.email', value: ['a@b.com'] }),
    ]);
    expect(where.f0).toBe("(email = 'a@b.com')");
  });
});

describe('buildFilterWhere sibling branches', () => {
  it('still falls back to id for a group field outside its set', () => {
    const where = build('events', [
      filter({ name: 'group.not a column', value: ['a'] }),
    ]);
    expect(where.f0).toContain("id = 'a'");
    expect(where.f0).not.toContain('not a column');
  });

  it('still resolves the known group fields', () => {
    const where = build('events', [
      filter({ name: 'group.name', value: ['acme'] }),
    ]);
    expect(where.f0).toContain("name = 'acme'");
  });

  it('still drops a session field outside its set', () => {
    expect(
      build('sessions', [
        filter({ name: 'session.not a column', value: ['a'] }),
      ])
    ).toEqual({});
  });

  it('still resolves the known session fields', () => {
    const where = build('sessions', [
      filter({ name: 'session.duration', operator: 'gt', value: ['10'] }),
    ]);
    expect(where.f0).toBe("((toFloat64(duration) > toFloat64('10')))");
  });
});

/** Blank out everything inside parentheses so only top-level text is left. */
function topLevel(sql: string): string {
  let depth = 0;
  let out = '';
  for (const char of sql) {
    if (char === '(') {
      depth += 1;
      continue;
    }
    if (char === ')') {
      depth -= 1;
      continue;
    }
    if (depth === 0) {
      out += char;
    }
  }
  return out;
}
