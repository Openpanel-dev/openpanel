/**
 * Shared building blocks for the session E2E + stress harnesses:
 * config, an HTTP track client, the reaper trigger, Redis/ClickHouse helpers,
 * fixtures, polling, and a tiny check/report framework.
 */

import { ClientType, chQuery, db, getClientByIdCached } from '@openpanel/db';
import { getRedisCache } from '@openpanel/redis';

// ── Config ──────────────────────────────────────────────────────────────────
export const API_URL = process.env.E2E_API_URL || 'http://localhost:3333';
export const WORKER_URL = process.env.E2E_WORKER_URL || 'http://localhost:9999';
export const ORG_ID = 'openpanel-dev';
export const PROJECT_ID = 'e2e-sessions';
export const CLIENT_ID = 'e2e1e2e1-0000-4000-8000-000000000001';
export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

export const SESSION_TIMEOUT_MS = Number.parseInt(
  process.env.SESSION_TIMEOUT_MS || String(1000 * 60 * 30),
  10
);
/** How long to wait for a session to fall outside its idle window before closing. */
export const IDLE_WAIT_MS = SESSION_TIMEOUT_MS + 2000;

export const redis = getRedisCache();
export const runId = Date.now();

export { chQuery };

// ── Redis key helpers ───────────────────────────────────────────────────────
export const sessionKey = (deviceId: string) => `session:${PROJECT_ID}:${deviceId}`;
export const wallclockKey = `session:wallclock:${PROJECT_ID}`;
export const profileKey = (profileId: string) =>
  `session:profile:${PROJECT_ID}:${profileId}`;
export const claimKey = (deviceId: string, sessionId: string) =>
  `session:end:emitted:${PROJECT_ID}:${deviceId}:${sessionId}`;
/** The session-buffer's Redis list (ground-truth pending CH rows). */
export const SESSION_BUFFER_LIST = 'session-buffer';

export async function getBlob(deviceId: string) {
  const raw = await redis.get(sessionKey(deviceId));
  return raw ? JSON.parse(raw) : null;
}

// ── Timing ──────────────────────────────────────────────────────────────────
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll `fn` until it returns a truthy value or the timeout elapses. */
export async function pollUntil<T>(
  fn: () => Promise<T>,
  { timeoutMs = 30_000, intervalMs = 750 } = {}
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  // biome-ignore lint/nursery/noConstantCondition: poll loop
  while (true) {
    const value = await fn();
    if (value) return value;
    if (Date.now() >= deadline) return null;
    await sleep(intervalMs);
  }
}

// ── Report framework ──────────────────────────────────────────────────────
type Result = { scenario: string; name: string; ok: boolean; detail?: string };
const results: Result[] = [];
let currentScenario = 'setup';

export function scenario(name: string) {
  currentScenario = name;
  console.log(`\n▶ ${name}`);
}
export function check(name: string, ok: boolean, detail?: string) {
  results.push({ scenario: currentScenario, name, ok, detail });
  console.log(`   ${ok ? '✓' : '✗'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
}
/** Print the summary and return the number of failed checks. */
export function summarize(): number {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) {
      console.log(`  ✗ [${f.scenario}] ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
    }
  }
  return failed.length;
}

// ── HTTP ────────────────────────────────────────────────────────────────────
export type TrackResponse = { deviceId: string; sessionId: string };

export async function track(body: unknown, ip: string): Promise<TrackResponse> {
  const res = await fetch(`${API_URL}/track`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'openpanel-client-id': CLIENT_ID,
      'user-agent': UA,
      'x-client-ip': ip,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST /track ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as TrackResponse;
}

export const screenView = (
  ip: string,
  path: string,
  extra: Record<string, unknown> = {}
) =>
  track(
    {
      type: 'track',
      payload: {
        name: 'screen_view',
        properties: { __path: `https://e2e.test${path}`, __ip: ip, ...extra },
      },
    },
    ip
  );

/** Run a worker cron on demand via the local /debug/cron endpoint. */
export async function triggerCron(type: string) {
  const res = await fetch(`${WORKER_URL}/debug/cron/${type}`, {
    method: 'POST',
    headers: { accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`trigger cron ${type} ${res.status}: ${await res.text()}`);
  }
}

export const triggerReaper = () => triggerCron('sessionReaper');

// ── ClickHouse counting (scoped to a set of session ids for run isolation) ──
const quoteList = (ids: string[]) =>
  ids.map((id) => `'${id.replace(/'/g, "")}'`).join(',');

export async function countByName(
  sessionIds: string[],
  name: string
): Promise<number> {
  if (sessionIds.length === 0) return 0;
  const rows = await chQuery<{ c: string }>(
    `SELECT count() AS c FROM events WHERE project_id = '${PROJECT_ID}' AND name = '${name}' AND session_id IN (${quoteList(sessionIds)})`
  );
  return Number(rows[0]?.c ?? 0);
}

// ── Fixtures ────────────────────────────────────────────────────────────────
export async function ensureFixtures() {
  scenario('setup: project + client');
  try {
    await db.organization.upsert({
      where: { id: ORG_ID },
      create: { id: ORG_ID, name: 'OpenPanel Dev' },
      update: {},
    });
    await db.project.upsert({
      where: { id: PROJECT_ID },
      create: { id: PROJECT_ID, name: 'E2E Sessions', organizationId: ORG_ID },
      update: {},
    });
    await db.client.upsert({
      where: { id: CLIENT_ID },
      create: {
        id: CLIENT_ID,
        name: 'e2e',
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        type: ClientType.write,
        ignoreCorsAndSecret: true,
        secret: null,
      },
      update: { ignoreCorsAndSecret: true, projectId: PROJECT_ID },
    });
    await getClientByIdCached.clear(CLIENT_ID);
    check('fixtures ready', true);
  } catch (error) {
    check('fixtures ready', false, (error as Error).message);
    throw error;
  }
}

export async function preflight() {
  scenario('preflight');
  const api = await fetch(`${API_URL}/`)
    .then((r) => r.ok || r.status === 404)
    .catch(() => false);
  check(`api reachable at ${API_URL}`, !!api);
  const worker = await fetch(`${WORKER_URL}/debug/cron`)
    .then((r) => r.ok)
    .catch(() => false);
  check(`worker debug reachable at ${WORKER_URL}`, !!worker);
  if (!api || !worker) {
    throw new Error('Stack not reachable — start it with `pnpm dev` first.');
  }
  if (SESSION_TIMEOUT_MS > 60_000) {
    console.warn(
      `\n⚠ SESSION_TIMEOUT_MS=${SESSION_TIMEOUT_MS}ms — this run will be slow.\n` +
        '  Re-run the stack AND the harness with e.g. SESSION_TIMEOUT_MS=4000.'
    );
  }
}

/** Run `fn` over `items` with at most `concurrency` in flight. */
export async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
}

export async function shutdown(failed: number): Promise<never> {
  await redis.quit().catch(() => {});
  process.exit(failed ? 1 : 0);
}
