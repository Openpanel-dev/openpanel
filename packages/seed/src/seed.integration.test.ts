// Seeds two days into the suite's isolated databases and checks what the
// dashboard's queries rely on. Pins the env before any database import, the
// same way test/bun-preload.ts does for @openpanel/db.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  TEST_CLICKHOUSE_URL,
  TEST_DATABASE_URL,
  TEST_REDIS_URL,
} from '../../../test/databases';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.CLICKHOUSE_URL = TEST_CLICKHOUSE_URL;
process.env.REDIS_URL = TEST_REDIS_URL;
process.env.SELF_HOSTED = 'true';

const { bootstrapTestDatabases } = await import(
  '../../../test/bootstrap-databases'
);
const { ch, db } = await import('@openpanel/db');
const { ARCHETYPES } = await import('./archetypes');
const { generate } = await import('./generator');
const { projectIdFor } = await import('./ids');
const { seedPostgres } = await import('./postgres');
const { resetProjects } = await import('./reset');
const { Rng } = await import('./rng');
const { SEED_ORGANIZATION, SEED_USER } = await import('./seed.constants');
const { ClickhouseSink } = await import('./sink');

const ignoreProgress = () => undefined;
const SEED = 3;
const DAYS = 2;
const SESSIONS_PER_DAY = 120;
const PROJECT_IDS = ARCHETYPES.map(projectIdFor);

async function count(query: string): Promise<number> {
  const result = await ch.query({ query, format: 'JSONEachRow' });
  const rows = (await result.json()) as { value: string | number }[];
  return Number(rows[0]?.value ?? 0);
}

function inList(): string {
  return PROJECT_IDS.map((id) => `'${id}'`).join(', ');
}

describe('seed against real databases', () => {
  beforeAll(async () => {
    await bootstrapTestDatabases();
    await seedPostgres(new Rng(`${SEED}/postgres`), ARCHETYPES);
    await resetProjects(PROJECT_IDS);
    const sink = new ClickhouseSink();
    await generate(
      {
        seed: SEED,
        sessionsPerDay: SESSIONS_PER_DAY,
        days: DAYS,
        now: new Date(),
        variance: 1,
        projects: ARCHETYPES.map((archetype) => ({
          archetype,
          projectId: projectIdFor(archetype),
        })),
      },
      sink,
      ignoreProgress
    );
  });

  afterAll(async () => {
    await resetProjects(PROJECT_IDS);
    await db.organization
      .delete({ where: { id: SEED_ORGANIZATION.id } })
      .catch(() => null);
    await db.user.delete({ where: { id: SEED_USER.id } }).catch(() => null);
    await db.$disconnect();
  });

  test('postgres has the login, organization, projects and clients', async () => {
    const user = await db.user.findUnique({
      where: { email: SEED_USER.email },
      include: { accounts: true, membership: true },
    });
    expect(
      user?.accounts.some(
        (account) =>
          account.provider === 'email' &&
          account.password?.startsWith('$argon2')
      )
    ).toBe(true);
    expect(
      user?.membership.some(
        (member) => member.organizationId === SEED_ORGANIZATION.id
      )
    ).toBe(true);
    const projects = await db.project.findMany({
      where: { organizationId: SEED_ORGANIZATION.id },
      include: { clients: true },
    });
    expect(projects.map((project) => project.id).sort()).toEqual(
      [...PROJECT_IDS].sort()
    );
    for (const project of projects) {
      expect(project.clients).toHaveLength(1);
      // scrypt `salt.hex`, what ingest's verifyPassword expects — never argon2.
      expect(project.clients[0]?.secret).toMatch(/^[0-9a-f]+\.[0-9a-f]+$/);
    }
  });

  test('sessions collapse to one row per session and match the events', async () => {
    const sessions = await count(
      `SELECT count() AS value FROM sessions FINAL WHERE project_id IN (${inList()})`
    );
    const distinct = await count(
      `SELECT uniqExact(session_id) AS value FROM events WHERE project_id IN (${inList()})`
    );
    const starts = await count(
      `SELECT count() AS value FROM events WHERE name = 'session_start' AND project_id IN (${inList()})`
    );
    expect(sessions).toBeGreaterThan(DAYS * SESSIONS_PER_DAY * 0.3);
    expect(distinct).toBe(sessions);
    expect(starts).toBe(sessions);
  });

  test('bounce rate and durations are in a realistic range', async () => {
    const bounced = await count(
      `SELECT countIf(is_bounce) AS value FROM sessions FINAL WHERE project_id IN (${inList()})`
    );
    const total = await count(
      `SELECT count() AS value FROM sessions FINAL WHERE project_id IN (${inList()})`
    );
    const rate = bounced / total;
    expect(rate).toBeGreaterThan(0.1);
    expect(rate).toBeLessThan(0.8);
    const averageSeconds = await count(
      `SELECT avg(duration) / 1000 AS value FROM sessions FINAL WHERE project_id IN (${inList()}) AND NOT is_bounce`
    );
    expect(averageSeconds).toBeGreaterThan(10);
  });

  test('the materialized views the overview reads are populated', async () => {
    expect(
      await count(
        `SELECT uniqMerge(profile_id) AS value FROM dau_mv WHERE project_id IN (${inList()})`
      )
    ).toBeGreaterThan(0);
    expect(
      await count(
        `SELECT count() AS value FROM distinct_event_names_mv WHERE project_id IN (${inList()})`
      )
    ).toBeGreaterThan(0);
    expect(
      await count(
        `SELECT count() AS value FROM profiles FINAL WHERE project_id IN (${inList()}) AND is_external`
      )
    ).toBeGreaterThan(0);
  });
});
