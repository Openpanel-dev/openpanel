/**
 * Session stress + drain-to-completion.
 *
 * Ramps out many short sessions (default 500, not all at once), then drives the
 * reaper + buffer flushes until EVERYTHING has fully drained — every
 * session_end emitted, Redis cleaned, the session buffer empty — and reconciles
 * the ClickHouse counts. Exits 0 only when nothing is left open.
 *
 * Also instruments the run: per-request /track latency
 * (P50/P95/P99, emit phase only), RSS/CPU of the api + worker processes (>=1Hz,
 * peak + steady-state), Kafka consumer-group lag on the events topic (>=1Hz;
 * peak, lag at emit-end, seconds-to-zero after emit stops), and every BullMQ
 * queue depth + buffer pending count scraped off /metrics (>=1Hz; peak, depth
 * at emit-end, whether it returned to zero). None of it changes what
 * the run asserts — see `check` calls below.
 *
 * `saturation-sweep.ts` drives this script across a ladder of offered loads;
 * see docs/BENCHMARK_HARNESS.md.
 *
 * Run (shrink the idle window; start the stack with the SAME value):
 * SESSION_TIMEOUT_MS=4000 pnpm dev SESSION_TIMEOUT_MS=4000 pnpm --filter
 * @openpanel/api e2e:sessions:stress
 *
 * Tunables (env): E2E_SESSIONS (500), E2E_CONCURRENCY (25),
 * E2E_EVENTS_PER_SESSION (3), E2E_DRAIN_TIMEOUT_MS (120000),
 * E2E_RECONCILE_TIMEOUT_MS (30000), E2E_RUNS (1) — run the whole harness
 * E2E_RUNS times (as separate processes, so no state leaks between them) and
 * print a median summary across runs at the end. E2E_NO_SAMPLING (0) — skip
 * starting the process/lag monitors entirely (per-request latency still
 * records; it's inherent to what's measured, not background polling). Control
 * lever for isolating whether the >=1Hz sampling itself is dragging on
 * throughput, e.g. `E2E_RUNS=3 E2E_NO_SAMPLING=1`. E2E_AUTH_MODE (bypass) —
 * which ingest auth path every request takes: `bypass` | `cors` | `secret`; see
 * AUTH_PATH_DESCRIPTION in lib.ts. The default keeps this script on the path
 * the pre-existing suites were written against; `saturation-sweep.ts` defaults
 * to `secret`. E2E_AUTH_WARM_REQUESTS (3) — authenticated requests sent and
 * discarded before recording starts, so the scrypt verify behind
 * VERIFY_CACHE_SECONDS is paid outside the measured window.
 */

import { spawn } from 'node:child_process';
import { formatLagSummary, LagMonitor, type LagSummary } from './lag-monitor';
import {
  API_URL,
  AUTH_MODE,
  AUTH_PATH_DESCRIPTION,
  AUTH_WARM_REQUESTS,
  type AuthWarmResult,
  beginLatencyRecording,
  check,
  checkCount,
  chQuery,
  countByName,
  endLatencyRecording,
  ensureFixtures,
  formatLatencyStats,
  getBlob,
  IDLE_WAIT_MS,
  type LatencyStats,
  PROJECT_ID,
  pollUntil,
  preflight,
  redis,
  runId,
  runPool,
  SESSION_BUFFER_LIST,
  SESSION_TIMEOUT_MS,
  scenario,
  screenView,
  shutdown,
  sleep,
  summarize,
  summarizeLatencies,
  track,
  triggerCron,
  triggerReaper,
  WORKER_URL,
  wallclockKey,
  warmAuthCache,
} from './lib';
import {
  formatMetricsSummary,
  MetricsMonitor,
  type MetricsSummary,
} from './metrics-monitor';
import {
  formatProcessSummary,
  ProcessMonitor,
  type ProcessSummary,
} from './process-monitor';

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

// drain() exits on session_end + a clean Redis, which says nothing about the
// run's trailing regular events — those can still sit in the event buffer.
const RECONCILE_TIMEOUT_MS = Number.parseInt(
  process.env.E2E_RECONCILE_TIMEOUT_MS || '30000',
  10
);
const RECONCILE_INTERVAL_MS = 1500;
// Consecutive samples with no new rows before we call the buffer drained and
// let the assertion report whatever is actually there.
const RECONCILE_STABLE_SAMPLES = 3;
// The reconcile window opens this far before the run starts: a session_start
// is backdated 100ms from the event that opened it, and the first requests
// leave within milliseconds of the captured start.
const RECONCILE_WINDOW_LEAD_MS = 2000;

// Sampling runs at >=1Hz; 1000ms is the floor, not a target.
const SAMPLE_INTERVAL_MS = 1000;

const E2E_RUNS = Number.parseInt(process.env.E2E_RUNS || '1', 10);
// Repeat mode re-execs this same script as a child process per run, so no
// module-level state (redis/kafka connections, cached pids, latency sink)
// leaks between runs. This env var marks "I am one of those children" —
// print a machine-parseable result line instead of the human summary.
const IS_REPEAT_CHILD = process.env.E2E_STRESS_CHILD === '1';
const RESULT_MARKER = 'E2E_STRESS_RESULT ';

// Control lever: a run with this set skips the process/lag monitors so
// their >=1Hz polling can be ruled in or out as the cause of a throughput
// delta. Latency recording stays on regardless — it wraps the request the
// run is already making, not an added background poller.
const SAMPLING_ENABLED = process.env.E2E_NO_SAMPLING !== '1';

type Session = { sessionId: string; deviceId: string };

export interface RunResult {
  ok: boolean;
  failedChecks: number;
  totalChecks: number;
  /** The offered load this run was configured with, so a sweep can label its rungs. */
  sessions: number;
  eventsPerSession: number;
  concurrency: number;
  /** Which of the three ingest auth paths every measured request took. */
  authMode: string;
  authWarm: AuthWarmResult | null;
  emitSeconds: number;
  eventsPerSecond: number;
  latency: LatencyStats;
  api: ProcessSummary;
  worker: ProcessSummary;
  lag: LagSummary;
  metrics: MetricsSummary;
  samplingEnabled: boolean;
}

// Unique IP per session → unique device → unique session. Namespaced by runId
// so reruns and the correctness harness never collide.
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
  const n = Math.floor(Math.random() * 4);
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
    {
      type: 'track',
      payload: { name: pick(CUSTOM_EVENTS), properties: randomProps(ip) },
    },
    ip
  );
}

async function emit(): Promise<{
  sessions: Session[];
  latency: LatencyStats;
  emitSeconds: number;
}> {
  scenario(
    `emit ${SESSIONS} sessions × ${EVENTS_PER_SESSION} events (concurrency ${CONCURRENCY})`
  );
  const sessions: Session[] = [];
  let done = 0;
  let errors = 0;
  const started = Date.now();

  const latencySamples = beginLatencyRecording();
  await runPool(
    Array.from({ length: SESSIONS }, (_, i) => i),
    CONCURRENCY,
    async (i) => {
      const ip = ipForSession(i);
      try {
        const first = await sendSessionEvent(ip, i, 0);
        for (let e = 1; e < EVENTS_PER_SESSION; e++) {
          await sendSessionEvent(ip, i, e);
        }
        sessions.push({ sessionId: first.sessionId, deviceId: first.deviceId });
      } catch (error) {
        errors++;
        if (errors <= 3) {
          console.warn(`   session ${i} failed: ${(error as Error).message}`);
        }
      }
      done++;
      if (done % 100 === 0 || done === SESSIONS) {
        console.log(`   …emitted ${done}/${SESSIONS}`);
      }
    }
  );
  endLatencyRecording();

  const uniq = new Set(sessions.map((s) => s.sessionId)).size;
  check(
    'all sessions sent without HTTP errors',
    errors === 0,
    `${errors} errors`
  );
  check(
    'each session got a distinct session id',
    uniq === SESSIONS,
    `${uniq} unique / ${sessions.length} ok / ${SESSIONS} sent`
  );
  const emitSeconds = (Date.now() - started) / 1000;
  const latency = summarizeLatencies(latencySamples);
  console.log(`   emit took ${emitSeconds.toFixed(1)}s`);
  console.log(`   ${formatLatencyStats(latency)}`);
  return { sessions, latency, emitSeconds };
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
  check(
    'clickhouse: one session_start per session',
    starts === ids.length,
    `got ${starts}`
  );
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
    console.log(
      `   …session_end ${ends}/${target}, wallclock remaining ${remaining}`
    );
    if (ends >= target && remaining === 0) {
      break;
    }
    await sleep(1500);
  }

  check(
    'clickhouse: one session_end per session',
    ends === target,
    `got ${ends}`
  );
  check(
    'redis: wallclock index fully drained',
    remaining === 0,
    `${remaining} left`
  );

  const bufLen = await redis.llen(SESSION_BUFFER_LIST);
  check(
    'redis: session buffer drained to ClickHouse',
    bufLen === 0,
    `${bufLen} rows pending`
  );

  // Spot-check a sample of devices: no session blob should linger after close.
  const sample = sessions.filter(
    (_, k) => k % Math.ceil(sessions.length / 20) === 0
  );
  let leaked = 0;
  for (const s of sample) {
    if (await getBlob(s.deviceId)) {
      leaked++;
    }
  }
  check(
    'redis: no session blobs leaked (sampled)',
    leaked === 0,
    `${leaked}/${sample.length} leaked`
  );
}

/**
 * Count this run's rows by event name, scoped to the run's DEVICES rather than
 * to the session ids `/track` echoed back.
 *
 * Why the device: until the worker has persisted the session blob, the API
 * answers from a session id that is deterministic per SESSION_TIMEOUT_MS-wide
 * time bucket. At the harness's compressed 4s window a bucket boundary falls
 * inside the emit ramp, so an in-flight
 * session's next event is told a different id — the row still lands, under a
 * session id the harness was never given. The device is the stable identity
 * for "what this run sent"; `since` keeps earlier runs' rows out, because a
 * device id repeats across runs whenever the ip/ua/salt triple does.
 */
async function countEventsByName(deviceIds: string[], since: Date) {
  const inList = deviceIds.map((id) => `'${id}'`).join(',');
  const from = new Date(since.getTime() - RECONCILE_WINDOW_LEAD_MS)
    .toISOString()
    .replace('T', ' ')
    .replace('Z', '');
  const rows = await chQuery<{ name: string; c: string }>(
    `SELECT name, count() AS c FROM events WHERE project_id = '${PROJECT_ID}' AND device_id IN (${inList}) AND created_at >= toDateTime64('${from}', 3) GROUP BY name ORDER BY c DESC`
  );
  const byName = new Map(rows.map((r) => [r.name, Number(r.c)]));
  const total = [...byName.values()].reduce((a, b) => a + b, 0);
  return { rows, byName, total };
}

async function reconcile(sessions: Session[], since: Date) {
  scenario('reconcile: ClickHouse event counts');
  const devices = sessions.map((s) => s.deviceId);
  const n = sessions.length;
  const expectedTotal = n * (EVENTS_PER_SESSION + 2);

  let counts = await countEventsByName(devices, since);
  const deadline = Date.now() + RECONCILE_TIMEOUT_MS;
  let stableSamples = 0;
  while (
    counts.total < expectedTotal &&
    stableSamples < RECONCILE_STABLE_SAMPLES &&
    Date.now() < deadline
  ) {
    console.log(`   …events ${counts.total}/${expectedTotal}, flushing`);
    await triggerCron('flushEvents');
    await sleep(RECONCILE_INTERVAL_MS);
    const next = await countEventsByName(devices, since);
    stableSamples = next.total > counts.total ? 0 : stableSamples + 1;
    counts = next;
  }

  const { rows, byName, total } = counts;
  console.log(
    `   event breakdown: ${rows.map((r) => `${r.name}=${r.c}`).join(' ')}`
  );

  const starts = byName.get('session_start') ?? 0;
  const ends = byName.get('session_end') ?? 0;
  // Each session = N events we sent + the synthetic session_start + session_end.
  check('session_start == sessions', starts === n, `${starts} vs ${n}`);
  check('session_end == sessions', ends === n, `${ends} vs ${n}`);
  check(
    'total events == sessions × (events + start + end)',
    total === expectedTotal,
    `${total} vs ${expectedTotal}`
  );
}

const portFromUrl = (url: string) => Number(new URL(url).port);

/**
 * Pay the auth cost BEFORE recording starts, so the scrypt behind
 * `VERIFY_CACHE_SECONDS` can never land inside the measured window and be read
 * as a knee. Discarded on purpose: the warm requests are not in the latency
 * series, not in the reconcile counts (they use their own ip), and the
 * sessions they open are reaped by the same drain loop as the rest.
 */
async function warmAuth(): Promise<AuthWarmResult | null> {
  if (AUTH_WARM_REQUESTS <= 0) {
    return null;
  }
  const warm = await warmAuthCache(AUTH_MODE, AUTH_WARM_REQUESTS);
  console.log(
    `   auth cache warmed: ${warm.requests} discarded requests, ` +
      `${warm.latenciesMs.map((ms) => ms.toFixed(1)).join('/')}ms (max ${warm.maxMs?.toFixed(1)}ms)`
  );
  return warm;
}

async function runOnce(): Promise<RunResult> {
  console.log(
    `Session STRESS — api=${API_URL} worker=${WORKER_URL} timeout=${SESSION_TIMEOUT_MS}ms ` +
      `sessions=${SESSIONS} events=${EVENTS_PER_SESSION} concurrency=${CONCURRENCY}` +
      (SAMPLING_ENABLED ? '' : ' [sampling disabled — control run]')
  );
  console.log(`   auth path: ${AUTH_PATH_DESCRIPTION[AUTH_MODE]}`);
  await preflight();
  await ensureFixtures();
  const authWarm = await warmAuth();

  const apiMonitor = new ProcessMonitor('api', portFromUrl(API_URL));
  const workerMonitor = new ProcessMonitor('worker', portFromUrl(WORKER_URL));
  const lagMonitor = new LagMonitor();
  const metricsMonitor = new MetricsMonitor(API_URL);
  if (SAMPLING_ENABLED) {
    await Promise.all([
      apiMonitor.start(SAMPLE_INTERVAL_MS),
      workerMonitor.start(SAMPLE_INTERVAL_MS),
      lagMonitor.start(SAMPLE_INTERVAL_MS),
      metricsMonitor.start(SAMPLE_INTERVAL_MS),
    ]);
  }

  try {
    // Captured before the first event so the reconcile window covers every row
    // of this run, including session_start (backdated 100ms).
    const runStartedAt = new Date();
    const { sessions, latency, emitSeconds } = await emit();
    const emitEndedAt = Date.now();
    await settle(sessions);
    await drain(sessions);
    await reconcile(sessions, runStartedAt);

    apiMonitor.stop();
    workerMonitor.stop();
    metricsMonitor.stop();
    await lagMonitor.stop();

    const api = apiMonitor.summary();
    const worker = workerMonitor.summary();
    const lag = lagMonitor.summarize(emitEndedAt);
    const metrics = metricsMonitor.summarize(emitEndedAt);

    scenario('instrumentation summary');
    console.log(`   auth path: ${AUTH_PATH_DESCRIPTION[AUTH_MODE]}`);
    console.log(`   ${formatProcessSummary(api)}`);
    console.log(`   ${formatProcessSummary(worker)}`);
    console.log(`   ${formatLagSummary(lag)}`);
    for (const line of formatMetricsSummary(metrics)) {
      console.log(`   ${line}`);
    }

    const failedChecks = summarize();
    return {
      ok: failedChecks === 0,
      failedChecks,
      totalChecks: checkCount(),
      sessions: SESSIONS,
      eventsPerSession: EVENTS_PER_SESSION,
      concurrency: CONCURRENCY,
      authMode: AUTH_MODE,
      authWarm,
      emitSeconds,
      eventsPerSecond: (SESSIONS * EVENTS_PER_SESSION) / emitSeconds,
      latency,
      api,
      worker,
      lag,
      metrics,
      samplingEnabled: SAMPLING_ENABLED,
    };
  } finally {
    apiMonitor.stop();
    workerMonitor.stop();
    metricsMonitor.stop();
    await lagMonitor.stop();
  }
}

const median = (values: number[]): number | null => {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) {
    return null;
  }
  const sorted = [...finite].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
};

const fmt = (n: number | null, unit = ''): string =>
  n === null ? 'n/a' : `${n.toFixed(1)}${unit}`;
const kbToMb = (kb: number | null): number | null =>
  kb === null ? null : kb / 1024;

function printMedianSummary(results: RunResult[], attempted: number) {
  const suffix = SAMPLING_ENABLED ? '' : ' [sampling disabled — control run]';
  console.log(`\n${'═'.repeat(60)}`);
  console.log(
    `Median summary across ${results.length}/${attempted} completed runs${suffix}`
  );
  console.log('═'.repeat(60));
  if (results.length === 0) {
    console.log('  no run produced a result');
    return;
  }
  // Median of a per-run metric across all completed runs.
  const m = (f: (r: RunResult) => number | null) =>
    median(results.map(f).filter((v): v is number => v !== null));

  console.log(
    `  emit:            ${fmt(
      m((r) => r.emitSeconds),
      's'
    )} (${fmt(
      m((r) => r.eventsPerSecond),
      ' ev/s'
    )})`
  );
  console.log(
    `  /track latency:  P50=${fmt(
      m((r) => r.latency.p50),
      'ms'
    )} P95=${fmt(
      m((r) => r.latency.p95),
      'ms'
    )} P99=${fmt(
      m((r) => r.latency.p99),
      'ms'
    )}`
  );
  console.log(
    `  api RSS/CPU:     peak=${fmt(kbToMb(m((r) => r.api.peakRssKb)), 'MB')} steady=${fmt(kbToMb(m((r) => r.api.steadyRssKb)), 'MB')} / ` +
      `peak=${fmt(
        m((r) => r.api.peakCpuPct),
        '%'
      )} steady=${fmt(
        m((r) => r.api.steadyCpuPct),
        '%'
      )}`
  );
  console.log(
    `  worker RSS/CPU:  peak=${fmt(kbToMb(m((r) => r.worker.peakRssKb)), 'MB')} steady=${fmt(kbToMb(m((r) => r.worker.steadyRssKb)), 'MB')} / ` +
      `peak=${fmt(
        m((r) => r.worker.peakCpuPct),
        '%'
      )} steady=${fmt(
        m((r) => r.worker.steadyCpuPct),
        '%'
      )}`
  );
  console.log(
    `  kafka lag:       peak=${fmt(m((r) => r.lag.peakLag))} at-emit-end=${fmt(m((r) => r.lag.lagAtEmitEnd))} ` +
      `seconds-to-zero=${fmt(
        m((r) => r.lag.secondsToZeroAfterEmitEnd),
        's'
      )}`
  );
  const greenRuns = results.filter((r) => r.ok).length;
  console.log(`  green runs:      ${greenRuns}/${attempted}`);
}

function runChild(index: number, total: number): Promise<RunResult> {
  console.log(
    `\n${'='.repeat(60)}\nRun ${index + 1}/${total}\n${'='.repeat(60)}`
  );
  return new Promise<RunResult>((resolve, reject) => {
    // Re-run the same package.json script rather than replaying argv: argv[1]
    // here is a bare.ts path that only resolves because the *current* process
    // already has jiti's loader hook registered in-process — a fresh node/bun
    // invocation needs the same wrapper the user ran ("pnpm run <script>") to
    // get that hook again. This also means the repeat mode keeps working
    // unchanged once the toolchain moves to Bun: whatever `e2e:sessions:stress`
    // runs then is what gets re-exec'd.
    const child = spawn('pnpm', ['run', 'e2e:sessions:stress'], {
      cwd: process.cwd(),
      env: { ...process.env, E2E_RUNS: '1', E2E_STRESS_CHILD: '1' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let buffered = '';
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(text);
      buffered += text;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const line = buffered
        .split('\n')
        .find((l) => l.startsWith(RESULT_MARKER));
      if (!line) {
        reject(
          new Error(
            `run ${index + 1} produced no parseable result (exit ${code})`
          )
        );
        return;
      }
      resolve(JSON.parse(line.slice(RESULT_MARKER.length)) as RunResult);
    });
  });
}

async function runRepeated(n: number) {
  const results: RunResult[] = [];
  for (let i = 0; i < n; i++) {
    try {
      results.push(await runChild(i, n));
    } catch (error) {
      console.error(
        `\nRun ${i + 1}/${n} did not complete: ${(error as Error).message}`
      );
    }
  }
  printMedianSummary(results, n);
  const allGreen = results.length === n && results.every((r) => r.ok);
  await shutdown(allGreen ? 0 : 1);
}

// process.exit() right after a plain console.log can truncate a piped
// stdout (Node flushes it async) — wait for the write's own callback so the
// parent always sees the full marker line before we exit.
function writeResultMarker(result: RunResult): Promise<void> {
  return new Promise((resolve) => {
    process.stdout.write(`${RESULT_MARKER}${JSON.stringify(result)}\n`, () =>
      resolve()
    );
  });
}

async function main() {
  if (E2E_RUNS > 1 && !IS_REPEAT_CHILD) {
    await runRepeated(E2E_RUNS);
    return;
  }
  const result = await runOnce();
  if (IS_REPEAT_CHILD) {
    await writeResultMarker(result);
  }
  await shutdown(result.failedChecks);
}

main().catch(async (error) => {
  console.error('\nFATAL:', error);
  await shutdown(1);
});
