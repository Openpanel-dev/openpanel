import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { ServiceDeps } from '../../../../../services';

// `findProfilesCore` takes `ServiceDeps` and reaches ClickHouse as `deps.ch`
// (through ch-query.ts), so the client is HANDED IN rather than mocked onto
// `@openpanel/db/src/clickhouse/client` process-wide. Same assertions, one less
// shared-registry hazard.
const chQuery = mock(
  async (_params: {
    query: string;
    query_params?: Record<string, unknown>;
  }) => ({
    json: async () => ({ data: [] as unknown[], meta: [], rows: 0 }),
  })
);

const noop = () => undefined;
const deps = {
  ch: { query: chQuery },
  logger: {
    fatal: noop,
    error: noop,
    warn: noop,
    info: noop,
    debug: noop,
    trace: noop,
    child: () => deps.logger,
  },
} as unknown as ServiceDeps;

let findProfilesCore: typeof import('../../../../profile/profile.service').findProfilesCore;

beforeAll(async () => {
  ({ findProfilesCore } = await import('../../../../profile/profile.service'));
});

// The service hands ClickHouse a `sql` fragment: the text carries `{pN:Type}`
// placeholders and every value travels in params.
function captured(): { query: string; params: Record<string, unknown> } {
  const call = chQuery.mock.calls[0]?.[0];
  return {
    query: (call?.query ?? '').replace(/\s+/g, ' '),
    params: call?.query_params ?? {},
  };
}

function boundValues(): unknown[] {
  return Object.values(captured().params);
}

beforeEach(() => {
  chQuery.mockClear();
});

describe('findProfilesCore — SQL conditions', () => {
  it('always includes project_id condition', async () => {
    await findProfilesCore(deps, { projectId: 'proj-1' });
    expect(captured().query).toContain('project_id = {p1:String}');
    expect(captured().params.p1).toBe('proj-1');
  });

  it('adds email ILIKE condition when email is provided', async () => {
    await findProfilesCore(deps, { projectId: 'proj-1', email: 'carl@' });
    expect(captured().query).toContain('email ILIKE {p2:String}');
    expect(captured().params.p2).toBe('%carl@%');
  });

  it('searches across first/last/full name for name filter', async () => {
    await findProfilesCore(deps, { projectId: 'proj-1', name: 'Carl' });
    const { query } = captured();
    expect(query).toContain('first_name ILIKE');
    expect(query).toContain('last_name ILIKE');
    expect(query).toContain("concat(first_name, ' ', last_name) ILIKE");
    expect(boundValues()).toContain('%Carl%');
  });

  it('matches multi-token name queries by ANDing each token', async () => {
    await findProfilesCore(deps, { projectId: 'proj-1', name: 'John Smith' });
    const { query } = captured();
    expect(boundValues()).toContain('%John%');
    expect(boundValues()).toContain('%Smith%');
    // Each token wrapped in its own OR-of-fields group, joined by AND.
    expect(query).toContain(') AND (');
  });

  it('adds country property condition', async () => {
    await findProfilesCore(deps, { projectId: 'proj-1', country: 'SE' });
    expect(captured().query).toContain('properties[{p2:String}] = {p3:String}');
    expect(captured().params).toMatchObject({ p2: 'country', p3: 'SE' });
  });

  it('adds inactiveDays NOT IN subquery', async () => {
    await findProfilesCore(deps, { projectId: 'proj-1', inactiveDays: 14 });
    const { query, params } = captured();
    expect(query).toContain('NOT IN');
    expect(query).toContain('INTERVAL {p3:UInt64} DAY');
    expect(params.p3).toBe(14);
  });

  it('floors inactiveDays to integer (prevents SQL injection via floats)', async () => {
    await findProfilesCore(deps, { projectId: 'proj-1', inactiveDays: 14.9 });
    expect(captured().params.p3).toBe(14);
    expect(boundValues()).not.toContain(14.9);
  });

  it('adds minSessions HAVING subquery', async () => {
    await findProfilesCore(deps, { projectId: 'proj-1', minSessions: 5 });
    const { query, params } = captured();
    expect(query).toContain('HAVING count() >= {p3:UInt64}');
    expect(params.p3).toBe(5);
  });

  it('adds performedEvent IN subquery', async () => {
    await findProfilesCore(deps, {
      projectId: 'proj-1',
      performedEvent: 'purchase',
    });
    expect(captured().query).toContain('AND name = {p3:String}');
    expect(captured().params.p3).toBe('purchase');
  });

  it('defaults to ORDER BY created_at DESC', async () => {
    await findProfilesCore(deps, { projectId: 'proj-1' });
    expect(captured().query).toContain('ORDER BY created_at DESC');
  });

  it('respects sortOrder: asc', async () => {
    await findProfilesCore(deps, { projectId: 'proj-1', sortOrder: 'asc' });
    expect(captured().query).toContain('ORDER BY created_at ASC');
  });

  it('defaults limit to 20', async () => {
    await findProfilesCore(deps, { projectId: 'proj-1' });
    expect(captured().query).toContain('LIMIT {p2:UInt64}');
    expect(captured().params.p2).toBe(20);
  });

  it('caps limit at 100 regardless of input', async () => {
    await findProfilesCore(deps, { projectId: 'proj-1', limit: 9999 });
    expect(captured().params.p2).toBe(100);
    expect(boundValues()).not.toContain(9999);
  });
});

describe('findProfilesCore — SQL injection protection', () => {
  it('binds the projectId instead of interpolating it', async () => {
    const hostile = "proj'; DROP TABLE profiles;--";
    await findProfilesCore(deps, { projectId: hostile });
    expect(captured().query).not.toContain(hostile);
    expect(captured().params.p1).toBe(hostile);
  });

  it('binds an apostrophe in the name search', async () => {
    await findProfilesCore(deps, { projectId: 'proj-1', name: "O'Brien" });
    const { query } = captured();
    expect(query).not.toContain("O'Brien");
    expect(boundValues()).toContain("%O'Brien%");
  });

  it('binds a backslash in the email', async () => {
    await findProfilesCore(deps, {
      projectId: 'proj-1',
      email: 'test\\@x.com',
    });
    expect(captured().query).not.toContain('test\\@x.com');
    expect(captured().params.p2).toBe('%test\\@x.com%');
  });
});

describe('findProfilesCore — return value', () => {
  it('returns whatever the ClickHouse response carries', async () => {
    const fakeProfiles = [{ id: 'p1', first_name: 'Alice' }];
    chQuery.mockResolvedValueOnce({
      json: async () => ({ data: fakeProfiles, meta: [], rows: 1 }),
    });
    const result = await findProfilesCore(deps, { projectId: 'proj-1' });
    // findProfilesCore is an opaque passthrough of the returned rows — the
    // fake row is deliberately partial, so it needs a cast against the real
    // (fuller) IClickhouseProfile return type.
    expect(result).toEqual(fakeProfiles as unknown as typeof result);
  });

  it('returns empty array when no profiles found', async () => {
    const result = await findProfilesCore(deps, { projectId: 'proj-1' });
    expect(result).toEqual([]);
  });
});
