/**
 * SQL-shape tests for the profile list and its count.
 *
 * Same strategy as profile-metrics-sql.test.ts: string assertions always run;
 * `EXPLAIN` validation runs against a locally reachable ClickHouse
 * (`pnpm dock:up`) and skips otherwise.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ch } from '../clickhouse/client';
import { buildProfileListCountSql, buildProfileListSql } from './profile.service';

const PROJECT_ID = 'test-sql-validation';

let chReachable = false;

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await ch.command({ query: 'SELECT 1' });
    chReachable = true;
  } catch {
    chReachable = false;
  }
});

afterAll(() => {
  vi.restoreAllMocks();
});

const itCH = (name: string, fn: () => Promise<void>) =>
  it(name, async (ctx) => {
    if (!chReachable) {
      ctx.skip('ClickHouse not reachable at CLICKHOUSE_URL');
    }
    await fn();
  });

describe('buildProfileListCountSql', () => {
  // One profile is several rows until a merge collapses them, so counting rows
  // reports a total the FINAL list can never fill.
  it('counts profiles, not undeduplicated rows', () => {
    const sql = buildProfileListCountSql({ projectId: PROJECT_ID });
    expect(sql).toContain('uniqExact(id) as count');
    expect(sql).not.toContain('count(id)');
  });

  it('applies the same filters as the list', () => {
    const options = {
      projectId: PROJECT_ID,
      search: 'john',
      isExternal: true,
    };
    const list = buildProfileListSql({ ...options, take: 50 });
    const count = buildProfileListCountSql(options);
    for (const clause of [
      `project_id = '${PROJECT_ID}'`,
      'is_external = true',
      "email ILIKE '%john%'",
    ]) {
      expect(list).toContain(clause);
      expect(count).toContain(clause);
    }
  });

  it('escapes the project id', () => {
    const sql = buildProfileListCountSql({ projectId: "x'--" });
    expect(sql).toContain("'x\\'--'");
  });

  itCH('parses and resolves against ClickHouse', async () => {
    await ch.command({
      query: `EXPLAIN ${buildProfileListCountSql({ projectId: PROJECT_ID })}`,
    });
  });
});

describe('buildProfileListSql', () => {
  it('pages with offset = cursor * take', () => {
    expect(buildProfileListSql({ projectId: PROJECT_ID, take: 50 })).not.toContain(
      'OFFSET',
    );
    expect(
      buildProfileListSql({ projectId: PROJECT_ID, take: 50, cursor: 2 }),
    ).toContain('OFFSET 100');
  });

  it('reads the deduplicated view of the table', () => {
    expect(buildProfileListSql({ projectId: PROJECT_ID, take: 50 })).toContain(
      'FROM profiles FINAL',
    );
  });

  itCH('parses and resolves against ClickHouse', async () => {
    await ch.command({
      query: `EXPLAIN ${buildProfileListSql({ projectId: PROJECT_ID, take: 50 })}`,
    });
  });
});
