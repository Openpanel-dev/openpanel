import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockChQuery = vi.hoisted(() => vi.fn().mockResolvedValue([]));

// Mock the ClickHouse client WITHOUT importOriginal — using importOriginal
// causes the real module to be bound into profile.service.ts before the mock
// factory result is visible, bypassing the chQuery replacement.
vi.mock('../../../../db/src/clickhouse/client', () => {
  return {
    chQuery: mockChQuery,
    chQueryWithMeta: vi.fn().mockResolvedValue({ data: [], rows: 0 }),
    ch: {},
    originalCh: {},
    createClient: () => ({}),
    withRetry: vi.fn().mockImplementation((fn: () => unknown) => fn()),
    isClickhouseClustered: () => false,
    getReplicatedTableName: (name: string) => name,
    CLICKHOUSE_OPTIONS: {},
    TABLE_NAMES: {
      events: 'events',
      profiles: 'profiles',
      alias: 'profile_aliases',
      self_hosting: 'self_hosting',
      events_bots: 'events_bots',
      dau_mv: 'dau_mv',
      event_names_mv: 'distinct_event_names_mv',
      event_property_values_mv: 'event_property_values_mv',
      cohort_events_mv: 'cohort_events_mv',
      sessions: 'sessions',
      events_imports: 'events_imports',
      session_replay_chunks: 'session_replay_chunks',
      gsc_daily: 'gsc_daily',
      gsc_pages_daily: 'gsc_pages_daily',
      gsc_queries_daily: 'gsc_queries_daily',
      groups: 'groups',
    },
    formatClickhouseDate: (date: Date | string, skipTime = false) => {
      if (skipTime) return new Date(date).toISOString().split('T')[0];
      return new Date(date).toISOString().replace('T', ' ').replace(/(\.\d{3})?Z+$/, '');
    },
    toDate: (str: string) => str,
    convertClickhouseDateToJs: (date: string) => new Date(`${date.replace(' ', 'T')}Z`),
    isClickhouseDefaultMinDate: (date: string) => date.startsWith('1970-01-01') || date.startsWith('1969-12-31'),
    toNullIfDefaultMinDate: () => null,
  };
});

import { findProfilesCore } from '../../../../db/src/services/profile.service';

function capturedSql(): string {
  return mockChQuery.mock.calls[0]?.[0] as string;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('findProfilesCore — SQL conditions', () => {
  it('always includes project_id condition', async () => {
    await findProfilesCore({ projectId: 'proj-1' });
    expect(capturedSql()).toContain("project_id = 'proj-1'");
  });

  it('adds email LIKE condition when email is provided', async () => {
    await findProfilesCore({ projectId: 'proj-1', email: 'carl@' });
    expect(capturedSql()).toContain("email LIKE '%carl@%'");
  });

  it('searches both first_name and last_name for name filter', async () => {
    await findProfilesCore({ projectId: 'proj-1', name: 'Carl' });
    const sql = capturedSql();
    expect(sql).toContain('first_name LIKE');
    expect(sql).toContain('last_name LIKE');
    expect(sql).toContain('%Carl%');
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
    expect(result).toEqual(fakeProfiles);
  });

  it('returns empty array when no profiles found', async () => {
    mockChQuery.mockResolvedValueOnce([]);
    const result = await findProfilesCore({ projectId: 'proj-1' });
    expect(result).toEqual([]);
  });
});
