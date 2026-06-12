/**
 * Session correctness E2E.
 *
 * Drives the REAL stack over HTTP and asserts the resulting state in BOTH
 * ClickHouse and Redis through the full lifecycle — open, extend, close (via
 * reaper AND via boundary), replay, identify — including Redis cleanup.
 *
 * Run (shrink the idle window; start the stack with the SAME value):
 *   SESSION_TIMEOUT_MS=4000 pnpm dev
 *   SESSION_TIMEOUT_MS=4000 pnpm --filter @openpanel/api e2e:sessions
 *
 * For a high-volume drain test see session-stress.ts (`e2e:sessions:stress`).
 */

import {
  chQuery,
  check,
  countByName,
  ensureFixtures,
  getBlob,
  IDLE_WAIT_MS,
  PROJECT_ID,
  pollUntil,
  preflight,
  redis,
  runId,
  scenario,
  screenView,
  SESSION_TIMEOUT_MS,
  shutdown,
  sleep,
  summarize,
  track,
  triggerReaper,
  wallclockKey,
  claimKey,
  sessionKey,
  profileKey,
  WORKER_URL,
  API_URL,
} from './lib';

async function scenarioSingleSession() {
  scenario('single session → reaper close → cleanup');
  const ip = `10.${(runId >> 16) & 255}.1.${runId & 255 || 1}`;

  const first = await screenView(ip, '/a');
  await screenView(ip, '/b');
  await screenView(ip, '/c');
  const { deviceId, sessionId } = first;
  check('track returned a sessionId', !!sessionId, `got '${sessionId}'`);

  const blob = await pollUntil(async () => {
    const b = await getBlob(deviceId);
    return b?.id === sessionId ? b : null;
  });
  check('redis: session blob exists with matching id', !!blob);
  check(
    'redis: device in wallclock index',
    (await redis.zscore(wallclockKey, deviceId)) !== null
  );
  check(
    'redis: project in active set',
    (await redis.sismember('session:projects', PROJECT_ID)) === 1
  );

  const starts = await pollUntil(async () => {
    const c = await countByName([sessionId], 'session_start');
    return c > 0 ? c : null;
  });
  check('clickhouse: exactly one session_start', starts === 1, `got ${starts}`);
  const views = await pollUntil(async () => {
    const c = await countByName([sessionId], 'screen_view');
    return c >= 3 ? c : null;
  });
  check('clickhouse: 3 screen_views ingested', !!views, `got ${views}`);

  console.log(`   …waiting ${IDLE_WAIT_MS}ms for idle window, then reaping`);
  await sleep(IDLE_WAIT_MS);
  await triggerReaper();

  const ends = await pollUntil(async () => {
    const c = await countByName([sessionId], 'session_end');
    return c > 0 ? c : null;
  });
  check('clickhouse: exactly one session_end', ends === 1, `got ${ends}`);

  const sessionRow = await pollUntil(async () => {
    const rows = await chQuery<{ is_bounce: boolean }>(
      `SELECT is_bounce FROM sessions FINAL WHERE project_id = '${PROJECT_ID}' AND id = '${sessionId}' LIMIT 1`
    );
    return rows[0] ?? null;
  });
  check('clickhouse: sessions row present (collapsed)', !!sessionRow);
  check(
    'clickhouse: session not a bounce (3 screen_views)',
    sessionRow?.is_bounce === false || Number(sessionRow?.is_bounce) === 0,
    `is_bounce=${sessionRow?.is_bounce}`
  );

  const cleaned = await pollUntil(async () =>
    (await redis.get(sessionKey(deviceId))) === null ? true : null
  );
  check('redis: session blob removed after close', !!cleaned);
  check(
    'redis: wallclock entry removed after close',
    (await redis.zscore(wallclockKey, deviceId)) === null
  );
  check(
    'redis: session_end idempotency claim recorded',
    (await redis.get(claimKey(deviceId, sessionId))) !== null
  );
}

async function scenarioBoundary() {
  scenario('boundary split → first session closes, second opens');
  const ip = `10.${(runId >> 16) & 255}.2.${runId & 255 || 1}`;

  const a = await screenView(ip, '/x');
  console.log(`   …waiting ${IDLE_WAIT_MS}ms so the next event crosses the boundary`);
  await sleep(IDLE_WAIT_MS);
  const b = await screenView(ip, '/y');

  check(
    'second event opened a NEW session id',
    a.sessionId !== b.sessionId && !!b.sessionId,
    `${a.sessionId} vs ${b.sessionId}`
  );

  const startsA = await pollUntil(async () =>
    (await countByName([a.sessionId], 'session_start')) > 0 ? true : null
  );
  check('clickhouse: session_start for first session', !!startsA);
  const startsB = await pollUntil(async () =>
    (await countByName([b.sessionId], 'session_start')) > 0 ? true : null
  );
  check('clickhouse: session_start for second session', !!startsB);
  const endsA = await pollUntil(async () =>
    (await countByName([a.sessionId], 'session_end')) > 0 ? true : null
  );
  check('clickhouse: first session got a session_end', !!endsA);
}

async function scenarioNonScreenViewFirst() {
  scenario('session opened by a non-screen_view event');
  const ip = `10.${(runId >> 16) & 255}.5.${runId & 255 || 1}`;

  // First (and only) event is a custom event with no __path.
  const { deviceId, sessionId } = await track(
    { type: 'track', payload: { name: 'purchase', properties: { __ip: ip } } },
    ip
  );
  check('track returned a sessionId for a non-screen_view first event', !!sessionId);

  const starts = await pollUntil(async () =>
    (await countByName([sessionId], 'session_start')) > 0 ? true : null
  );
  check('clickhouse: session_start emitted for a custom-event session', !!starts);

  console.log(`   …waiting ${IDLE_WAIT_MS}ms for idle window, then reaping`);
  await sleep(IDLE_WAIT_MS);
  await triggerReaper();

  const ends = await pollUntil(async () =>
    (await countByName([sessionId], 'session_end')) > 0 ? true : null
  );
  check('clickhouse: session_end emitted (closes normally)', !!ends);

  const row = await pollUntil(async () => {
    const rows = await chQuery<{
      screen_view_count: number;
      event_count: number;
      is_bounce: boolean;
    }>(
      `SELECT screen_view_count, event_count, is_bounce FROM sessions FINAL WHERE project_id = '${PROJECT_ID}' AND id = '${sessionId}' LIMIT 1`
    );
    return rows[0] ?? null;
  });
  check('clickhouse: screen_view_count is 0', Number(row?.screen_view_count) === 0, `${row?.screen_view_count}`);
  check('clickhouse: event_count is 1', Number(row?.event_count) === 1, `${row?.event_count}`);
  check(
    'clickhouse: is_bounce is true (no pageviews)',
    row?.is_bounce === true || Number(row?.is_bounce) === 1,
    `is_bounce=${row?.is_bounce}`
  );

  const cleaned = await pollUntil(async () =>
    (await redis.get(sessionKey(deviceId))) === null ? true : null
  );
  check('redis: session cleaned up after close', !!cleaned);
}

async function scenarioReplay() {
  scenario('replay chunk files under the echoed session id');
  const ip = `10.${(runId >> 16) & 255}.3.${runId & 255 || 1}`;

  const { sessionId } = await screenView(ip, '/replay');
  await track(
    {
      type: 'replay',
      payload: {
        sessionId,
        chunk_index: 0,
        events_count: 1,
        is_full_snapshot: true,
        started_at: new Date(runId).toISOString(),
        ended_at: new Date(runId + 1000).toISOString(),
        payload: '[]',
      },
    },
    ip
  );

  const found = await pollUntil(async () => {
    const rows = await chQuery<{ c: string }>(
      `SELECT count() AS c FROM session_replay_chunks WHERE project_id = '${PROJECT_ID}' AND session_id = '${sessionId}'`
    );
    return Number(rows[0]?.c ?? 0) > 0 ? true : null;
  });
  check('clickhouse: replay chunk stored under the session id', !!found);
}

async function scenarioIdentify() {
  scenario('identified visit → profile index + profile_id on events');
  const ip = `10.${(runId >> 16) & 255}.4.${runId & 255 || 1}`;
  const profileId = `e2e-user-${runId}`;

  const { deviceId, sessionId } = await screenView(ip, '/account');
  await track(
    {
      type: 'track',
      payload: { name: 'signed_in', profileId, properties: { __ip: ip } },
    },
    ip
  );

  const ptr = await pollUntil(async () =>
    (await redis.get(profileKey(profileId))) === deviceId ? true : null
  );
  check('redis: profile→device pointer written', !!ptr);

  const profiled = await pollUntil(async () => {
    const rows = await chQuery<{ c: string }>(
      `SELECT count() AS c FROM events WHERE project_id = '${PROJECT_ID}' AND session_id = '${sessionId}' AND profile_id = '${profileId}'`
    );
    return Number(rows[0]?.c ?? 0) > 0 ? true : null;
  });
  check('clickhouse: event carries the identified profile_id', !!profiled);
}

async function main() {
  console.log(
    `Session E2E — api=${API_URL} worker=${WORKER_URL} timeout=${SESSION_TIMEOUT_MS}ms project=${PROJECT_ID}`
  );
  await preflight();
  await ensureFixtures();
  await scenarioSingleSession();
  await scenarioBoundary();
  await scenarioNonScreenViewFirst();
  await scenarioReplay();
  await scenarioIdentify();
  await shutdown(summarize());
}

main().catch(async (error) => {
  console.error('\nFATAL:', error);
  await shutdown(1);
});
