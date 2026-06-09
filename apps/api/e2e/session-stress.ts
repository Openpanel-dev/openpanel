/**
 * Session stress + drain-to-completion.
 *
 * Ramps out many short sessions (default 500, not all at once), then drives the
 * reaper + buffer flushes until EVERYTHING has fully drained — every session_end
 * emitted, Redis cleaned, the session buffer empty — and reconciles the
 * ClickHouse counts. Exits 0 only when nothing is left open.
 *
 * Run (shrink the idle window; start the stack with the SAME value):
 *   SESSION_TIMEOUT_MS=4000 pnpm dev
 *   SESSION_TIMEOUT_MS=4000 pnpm --filter @openpanel/api e2e:sessions:stress
 *
 * Tunables (env): E2E_SESSIONS (500), E2E_CONCURRENCY (25),
 *   E2E_EVENTS_PER_SESSION (3), E2E_DRAIN_TIMEOUT_MS (120000).
 */

import {
  API_URL,
  check,
  chQuery,
  countByName,
  ensureFixtures,
  getBlob,
  IDLE_WAIT_MS,
  pollUntil,
  preflight,
  PROJECT_ID,
  redis,
  runId,
  runPool,
  scenario,
  screenView,
  SESSION_BUFFER_LIST,
  SESSION_TIMEOUT_MS,
  shutdown,
  sleep,
  summarize,
  track,
  triggerCron,
  triggerReaper,
  wallclockKey,
  WORKER_URL,
} from './lib';

const SESSIONS = Number.parseInt(process.env.E2E_SESSIONS || '500', 10);
const CONCURRENCY = Number.parseInt(process.env.E2E_CONCURRENCY || '25', 10);
const EVENTS_PER_SESSION = Number.parseInt(
  process.env.E2E_EVENTS_PER_SESSION || '3',
  10
);
const DRAIN_TIMEOUT_MS = Number.parseInt(
  process.env.E2E_DRAIN_TIMEOUT_MS || '120000',
  10
);

type Session = { sessionId: string; deviceId: string };

// Unique IP per session → unique device → unique session. Namespaced by runId
// so reruns and the correctness harness (10.x) never collide.
const ipForSession = (i: number) =>
  `100.${(runId >> 8) & 255}.${(i >> 8) & 255}.${i & 255}`;

// A realistic-ish mix: events are NOT all screen_views.
const CUSTOM_EVENTS = [
  'sign_up',
  'login',
  'add_to_cart',
  'purchase',
  'search',
  'button_click',
  'video_play',
  'share',
];
const WORDS = ['alpha', 'beta', 'gamma', 'sverige', 'katt', 'planet'];
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

function randomProps(ip: string): Record<string, unknown> {
  const props: Record<string, unknown> = { __ip: ip };
  const n = Math.floor(Math.random() * 4); // 0–3 extra properties
  for (let k = 0; k < n; k++) {
    props[`prop_${pick(WORDS)}`] =
      Math.random() < 0.5 ? pick(WORDS) : Math.floor(Math.random() * 1000);
  }
  return props;
}

// One event in a session: the entry is always a screen_view; the rest are a
// 50/50 mix of more screen_views and random custom events.
function sendSessionEvent(ip: string, i: number, e: number) {
  if (e === 0 || Math.random() < 0.5) {
    return screenView(ip, `/p${i}/${e}`, randomProps(ip));
  }
  return track(
    { type: 'track', payload: { name: pick(CUSTOM_EVENTS), properties: randomProps(ip) } },
    ip
  );
}

async function emit(): Promise<Session[]> {
  scenario(`emit ${SESSIONS} sessions × ${EVENTS_PER_SESSION} events (concurrency ${CONCURRENCY})`);
  const sessions: Session[] = [];
  let done = 0;
  let errors = 0;
  const started = Date.now();

  await runPool(
    Array.from({ length: SESSIONS }, (_, i) => i),
    CONCURRENCY,
    async (i) => {
      const ip = ipForSession(i);
      try {
        const first = await sendSessionEvent(ip, i, 0); // entry is a screen_view
        for (let e = 1; e < EVENTS_PER_SESSION; e++) {
          await sendSessionEvent(ip, i, e);
        }
        sessions.push({ sessionId: first.sessionId, deviceId: first.deviceId });
      } catch (error) {
        errors++;
        if (errors <= 3) console.warn(`   session ${i} failed: ${(error as Error).message}`);
      }
      done++;
      if (done % 100 === 0 || done === SESSIONS) {
        console.log(`   …emitted ${done}/${SESSIONS}`);
      }
    }
  );

  const uniq = new Set(sessions.map((s) => s.sessionId)).size;
  check('all sessions sent without HTTP errors', errors === 0, `${errors} errors`);
  check(
    'each session got a distinct session id',
    uniq === SESSIONS,
    `${uniq} unique / ${sessions.length} ok / ${SESSIONS} sent`
  );
  console.log(`   emit took ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return sessions;
}

async function settle(sessions: Session[]) {
  scenario('settle: all sessions opened in ClickHouse');
  const ids = sessions.map((s) => s.sessionId);
  const starts = await pollUntil(
    async () => {
      const c = await countByName(ids, 'session_start');
      console.log(`   …session_start ${c}/${ids.length}`);
      return c >= ids.length ? c : null;
    },
    { timeoutMs: 60_000, intervalMs: 2000 }
  );
  check('clickhouse: one session_start per session', starts === ids.length, `got ${starts}`);
}

async function drain(sessions: Session[]) {
  scenario('drain: reap + flush until nothing remains');
  console.log(`   …waiting ${IDLE_WAIT_MS}ms for all sessions to idle out`);
  await sleep(IDLE_WAIT_MS);

  const ids = sessions.map((s) => s.sessionId);
  const target = ids.length;
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  let ends = 0;
  let remaining = Number.POSITIVE_INFINITY;

  while (Date.now() < deadline) {
    await triggerReaper(); // enqueue session_end for idle sessions
    await sleep(1000); // let the worker process the close jobs
    await triggerCron('flushEvents'); // push session_start/end + events → CH
    await triggerCron('flushSessions'); // push sessions table rows → CH

    ends = await countByName(ids, 'session_end');
    remaining = await redis.zcard(wallclockKey);
    console.log(`   …session_end ${ends}/${target}, wallclock remaining ${remaining}`);
    if (ends >= target && remaining === 0) break;
    await sleep(1500);
  }

  check('clickhouse: one session_end per session', ends === target, `got ${ends}`);
  check('redis: wallclock index fully drained', remaining === 0, `${remaining} left`);

  const bufLen = await redis.llen(SESSION_BUFFER_LIST);
  check('redis: session buffer drained to ClickHouse', bufLen === 0, `${bufLen} rows pending`);

  // Spot-check a sample of devices: no session blob should linger after close.
  const sample = sessions.filter((_, k) => k % Math.ceil(sessions.length / 20) === 0);
  let leaked = 0;
  for (const s of sample) {
    if (await getBlob(s.deviceId)) leaked++;
  }
  check('redis: no session blobs leaked (sampled)', leaked === 0, `${leaked}/${sample.length} leaked`);
}

async function reconcile(sessions: Session[]) {
  scenario('reconcile: ClickHouse event counts');
  const ids = sessions.map((s) => s.sessionId);
  const n = ids.length;
  const inList = ids.map((id) => `'${id}'`).join(',');
  const rows = await chQuery<{ name: string; c: string }>(
    `SELECT name, count() AS c FROM events WHERE project_id = '${PROJECT_ID}' AND session_id IN (${inList}) GROUP BY name ORDER BY c DESC`
  );
  const byName = new Map(rows.map((r) => [r.name, Number(r.c)]));
  const total = [...byName.values()].reduce((a, b) => a + b, 0);
  console.log(`   event breakdown: ${rows.map((r) => `${r.name}=${r.c}`).join(' ')}`);

  const starts = byName.get('session_start') ?? 0;
  const ends = byName.get('session_end') ?? 0;
  // Each session = N events we sent + the synthetic session_start + session_end.
  check('session_start == sessions', starts === n, `${starts} vs ${n}`);
  check('session_end == sessions', ends === n, `${ends} vs ${n}`);
  check(
    'total events == sessions × (events + start + end)',
    total === n * (EVENTS_PER_SESSION + 2),
    `${total} vs ${n * (EVENTS_PER_SESSION + 2)}`
  );
}

async function main() {
  console.log(
    `Session STRESS — api=${API_URL} worker=${WORKER_URL} timeout=${SESSION_TIMEOUT_MS}ms ` +
      `sessions=${SESSIONS} events=${EVENTS_PER_SESSION} concurrency=${CONCURRENCY}`
  );
  await preflight();
  await ensureFixtures();

  const sessions = await emit();
  await settle(sessions);
  await drain(sessions);
  await reconcile(sessions);

  await shutdown(summarize());
}

main().catch(async (error) => {
  console.error('\nFATAL:', error);
  await shutdown(1);
});
