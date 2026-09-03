import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from 'bun:test';

const mockChQuery = mock((..._args: unknown[]) =>
  Promise.resolve([] as unknown[])
);

// Mock the ClickHouse client at the specifier profile.service.ts imports —
// mock.module applies at call time (unlike vitest's hoisted vi.mock), so the
// mock must be registered before profile.service's first (dynamic) import.
//
// Spread the real module rather than hand-listing every export: `mock.module`
// replaces this specifier process-wide (bun runs every test file in one
// shared module registry without `--isolate` — see AGENTS.md). A hand-rolled
// factory here previously left `ch`/`originalCh` empty objects and `TABLE_NAMES`
// a hand-copied subset — invisible to `findProfilesCore` (it only reaches
// `chQuery`/`TABLE_NAMES.events`, both covered), but not to every *other*
// consumer of this same live-bound specifier sharing this process (e.g. the
// mcp integration suite's real, unmocked service calls) — restored in
// afterAll below so the leak doesn't outlive this file.
const actualClickhouseClient = await import(
  '@openpanel/db/src/clickhouse/client'
);
mock.module('@openpanel/db/src/clickhouse/client', () => ({
  ...actualClickhouseClient,
  chQuery: mockChQuery,
}));

afterAll(() => {
  mock.module('@openpanel/db/src/clickhouse/client', () => ({
    ...actualClickhouseClient,
  }));
});

let findProfilesCore: typeof import('@openpanel/db/src/services/profile.service').findProfilesCore;

beforeAll(async () => {
  ({ findProfilesCore } = await import(
    '@openpanel/db/src/services/profile.service'
  ));
});

function capturedSql(): string {
  return mockChQuery.mock.calls[0]?.[0] as string;
}

beforeEach(() => {
  mockChQuery.mockClear();
  mockChQuery.mockResolvedValue([]);
});

describe('findProfilesCore — SQL conditions', () => {
  it('always includes project_id condition', async () => {
    await findProfilesCore({ projectId: 'proj-1' });
    expect(capturedSql()).toContain("project_id = 'proj-1'");
  });

  it('adds email ILIKE condition when email is provided', async () => {
    await findProfilesCore({ projectId: 'proj-1', email: 'carl@' });
    expect(capturedSql()).toContain("email ILIKE '%carl@%'");
  });

  it('searches across first/last/full name for name filter', async () => {
    await findProfilesCore({ projectId: 'proj-1', name: 'Carl' });
    const sql = capturedSql();
    expect(sql).toContain('first_name ILIKE');
    expect(sql).toContain('last_name ILIKE');
    expect(sql).toContain("concat(first_name, ' ', last_name) ILIKE");
    expect(sql).toContain('%Carl%');
  });

  it('matches multi-token name queries by ANDing each token', async () => {
    await findProfilesCore({ projectId: 'proj-1', name: 'John Smith' });
    const sql = capturedSql();
    expect(sql).toContain('%John%');
    expect(sql).toContain('%Smith%');
    // Each token wrapped in its own OR-of-fields group, joined by AND.
    expect(sql).toContain(') AND (');
  });

  it('adds country property condition', async () => {
    await findProfilesCore({ projectId: 'proj-1', country: 'SE' });
    expect(capturedSql()).toContain("properties['country'] = 'SE'");
  });

  it('adds inactiveDays NOT IN subquery', async () => {
    await findProfilesCore({ projectId: 'proj-1', inactiveDays: 14 });
    const sql = capturedSql();
    expect(sql).toContain('NOT IN');
    expect(sql).toContain('INTERVAL 14 DAY');
  });

  it('floors inactiveDays to integer (prevents SQL injection via floats)', async () => {
    await findProfilesCore({ projectId: 'proj-1', inactiveDays: 14.9 });
    expect(capturedSql()).toContain('INTERVAL 14 DAY');
    expect(capturedSql()).not.toContain('14.9');
  });

  it('adds minSessions HAVING subquery', async () => {
    await findProfilesCore({ projectId: 'proj-1', minSessions: 5 });
    const sql = capturedSql();
    expect(sql).toContain('HAVING count() >= 5');
  });

  it('adds performedEvent IN subquery', async () => {
    await findProfilesCore({ projectId: 'proj-1', performedEvent: 'purchase' });
    expect(capturedSql()).toContain("name = 'purchase'");
  });

  it('defaults to ORDER BY created_at DESC', async () => {
    await findProfilesCore({ projectId: 'proj-1' });
    expect(capturedSql()).toContain('ORDER BY created_at DESC');
  });

  it('respects sortOrder: asc', async () => {
    await findProfilesCore({ projectId: 'proj-1', sortOrder: 'asc' });
    expect(capturedSql()).toContain('ORDER BY created_at ASC');
  });

  it('defaults limit to 20', async () => {
    await findProfilesCore({ projectId: 'proj-1' });
    expect(capturedSql()).toContain('LIMIT 20');
  });

  it('caps limit at 100 regardless of input', async () => {
    await findProfilesCore({ projectId: 'proj-1', limit: 9999 });
    expect(capturedSql()).toContain('LIMIT 100');
    expect(capturedSql()).not.toContain('LIMIT 9999');
  });
});

describe('findProfilesCore — SQL injection protection', () => {
  it('escapes single quotes in string values', async () => {
    await findProfilesCore({ projectId: "proj'; DROP TABLE profiles;--" });
    // The projectId must be escaped — raw SQL injection string must not appear
    expect(capturedSql()).not.toContain("proj'; DROP TABLE profiles;--");
  });

  it('escapes single quotes in name search', async () => {
    await findProfilesCore({ projectId: 'proj-1', name: "O'Brien" });
    // Unescaped apostrophe in the SQL would break the query
    const sql = capturedSql();
    expect(sql).not.toMatch(/LIKE '%O'Brien%'/);
  });

  it('escapes backslashes in email', async () => {
    await findProfilesCore({ projectId: 'proj-1', email: 'test\\@x.com' });
    // Raw backslash in ClickHouse SQL needs escaping
    expect(capturedSql()).not.toContain("'%test\\@x.com%'");
  });
});

describe('findProfilesCore — return value', () => {
  it('returns whatever chQuery resolves with', async () => {
    const fakeProfiles = [{ id: 'p1', first_name: 'Alice' }];
    mockChQuery.mockResolvedValueOnce(fakeProfiles);
    const result = await findProfilesCore({ projectId: 'proj-1' });
    // findProfilesCore is an opaque passthrough of whatever chQuery resolves
    // with — the fake row is deliberately partial, so it needs a cast against
    // the real (fuller) IClickhouseProfile return type.
    expect(result).toEqual(fakeProfiles as unknown as typeof result);
  });

  it('returns empty array when no profiles found', async () => {
    mockChQuery.mockResolvedValueOnce([]);
    const result = await findProfilesCore({ projectId: 'proj-1' });
    expect(result).toEqual([]);
  });
});
