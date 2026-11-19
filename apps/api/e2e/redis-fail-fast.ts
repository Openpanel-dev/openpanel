/**
 * How long does `/track` take when the Redis CACHE is unreachable?
 *
 * This harness reproduces that in-repo so a fix can be justified with a
 * before/after on the same box, and re-run by anyone.
 *
 * It never touches the shared Redis server: the API under test is pointed at a
 * local TCP proxy which is then stopped (`refuse`, docker-stop shaped) or
 * frozen (`blackhole`, docker-pause shaped). The operator's stack keeps its own
 * connection to:6379 throughout.
 *
 * Dotenv -e../../.env -- bun e2e/redis-fail-fast.ts
 */

import { spawn } from 'node:child_process';
import net from 'node:net';

const UPSTREAM_HOST = '127.0.0.1';
const UPSTREAM_PORT = 6379;
const PROXY_PORT = Number(process.env.M18_PROXY_PORT ?? 6399);
/** Private Redis database + Kafka topic: this harness must not perturb :6379/0. */
const PROXY_REDIS_DB = 3;
const API_PORT = Number(process.env.M18_API_PORT ?? 3399);
const BOOT_API_PORT = API_PORT + 1;
const KAFKA_TOPIC = 'events-m18003-failfast';

const SECRET_CLIENT_ID = 'e2e1e2e1-0000-4000-8000-000000000002';
const CLIENT_SECRET = 'e2e-saturation-secret';
const CORS_ORIGIN = 'https://e2e.test';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

/** How long the client waits before recording "no response". */
const CLIENT_TIMEOUT_MS = Number(process.env.M18_CLIENT_TIMEOUT_MS ?? 30_000);
const BOOT_TIMEOUT_MS = 60_000;
const WARMUP_REQUESTS = 6;
const BASELINE_REQUESTS = Number(process.env.M18_BASELINE_REQUESTS ?? 20);
const OUTAGE_PROBE_REQUESTS = Number(process.env.M18_OUTAGE_PROBES ?? 10);
const BLIP_DURATION_MS = 1000;
const BLIP_CONCURRENCY = 5;
const BLIP_TOTAL_MS = 6000;
/** One device for the whole blip, so a session split shows up as a second id. */
const BLIP_CLIENT_IP = '10.18.3.200';
const BLACKHOLE_PROBES = 5;
const SUSTAINED_OUTAGE_MS = Number(process.env.M18_OUTAGE_MS ?? 20_000);
/**
 * Phases A-C only. The recovery window (C) is the one number that has to be
 * compared across several runs to be worth anything, and re-running the blip,
 * the blackhole and the second boot to get it costs minutes per sample.
 */
const QUICK_RUN = process.env.M18_QUICK === '1';

type ProxyMode = 'pass' | 'refuse' | 'blackhole';

// ── The proxy ───────────────────────────────────────────────────────────────

class RedisFaultProxy {
  private mode: ProxyMode = 'pass';
  private server: net.Server | null = null;
  private readonly sockets = new Set<net.Socket>();

  async start(): Promise<void> {
    await this.listen();
  }

  private listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((client) => this.onConnection(client));
      server.on('error', reject);
      server.listen(PROXY_PORT, UPSTREAM_HOST, () => {
        this.server = server;
        resolve();
      });
    });
  }

  private onConnection(client: net.Socket) {
    this.sockets.add(client);
    client.on('error', () => client.destroy());
    client.on('close', () => this.sockets.delete(client));

    // Frozen dependency: the handshake completes, nothing ever answers.
    if (this.mode === 'blackhole') {
      client.resume();
      return;
    }

    const upstream = net.connect(UPSTREAM_PORT, UPSTREAM_HOST);
    this.sockets.add(upstream);
    upstream.on('error', () => {
      upstream.destroy();
      client.destroy();
    });
    upstream.on('close', () => {
      this.sockets.delete(upstream);
      client.destroy();
    });
    client.on('data', (chunk) => {
      if (this.mode === 'pass') {
        upstream.write(chunk);
      }
    });
    upstream.on('data', (chunk) => {
      if (this.mode === 'pass') {
        client.write(chunk);
      }
    });
    client.on('close', () => upstream.destroy());
  }

  /** docker stop: the port stops answering and open sockets die. */
  async refuse(): Promise<void> {
    this.mode = 'refuse';
    // Sockets first: `server.close()` does not call back until every open
    // connection has gone, so closing before destroying deadlocks.
    this.destroyAll();
    await this.closeServer();
  }

  /** docker pause: sockets stay open, bytes stop moving. */
  async blackhole(): Promise<void> {
    if (!this.server) {
      await this.listen();
    }
    this.mode = 'blackhole';
  }

  async pass(): Promise<void> {
    if (!this.server) {
      await this.listen();
    }
    // Sockets opened while frozen have no upstream; drop them so ioredis
    // rebuilds a real one.
    if (this.mode === 'blackhole') {
      this.destroyAll();
    }
    this.mode = 'pass';
  }

  private destroyAll() {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();
  }

  private closeServer(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) {
      return Promise.resolve();
    }
    return new Promise((resolve) => server.close(() => resolve()));
  }

  async stop(): Promise<void> {
    this.destroyAll();
    await this.closeServer();
  }
}

// ── Probes ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Shape = 'warm-secret' | 'cold-unknown' | 'browser-origin';

let deviceCounter = 0;
let payloadCounter = 0;

function headersFor(shape: Shape): Record<string, string> {
  const base: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': UA,
    'x-client-ip': `10.18.3.${(deviceCounter++ % 250) + 1}`,
  };
  if (shape === 'warm-secret') {
    return {
      ...base,
      'openpanel-client-id': SECRET_CLIENT_ID,
      'openpanel-client-secret': CLIENT_SECRET,
    };
  }
  if (shape === 'browser-origin') {
    return {
      ...base,
      'openpanel-client-id': SECRET_CLIENT_ID,
      origin: CORS_ORIGIN,
    };
  }
  return {
    ...base,
    'openpanel-client-id': crypto.randomUUID(),
    'openpanel-client-secret': CLIENT_SECRET,
  };
}

interface Probe {
  status: number | null;
  ms: number;
  error?: string;
  /** ms since the process started, so a phase can locate its failure window. */
  sentAt: number;
  /** `/track`'s answer, when it gave one — the blip's real cost is a session split. */
  sessionId?: string;
}

/**
 * A client that gives up after `CLIENT_TIMEOUT_MS`. An explicit controller
 * rather than `AbortSignal.timeout`, which does not interrupt an in-flight
 * Bun fetch here.
 */
async function timedFetch(url: string, init: RequestInit = {}): Promise<Probe> {
  const controller = new AbortController();
  const giveUp = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  const startedAt = performance.now();
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      // No keep-alive: a socket left behind by an abandoned request must not
      // put the next probe behind it and inflate its latency.
      headers: {
        ...(init.headers as Record<string, string>),
        connection: 'close',
      },
    });
    const text = await res.text();
    let sessionId: string | undefined;
    try {
      sessionId = (JSON.parse(text) as { sessionId?: string }).sessionId;
    } catch {
      sessionId = undefined;
    }
    return {
      status: res.status,
      ms: performance.now() - startedAt,
      sentAt: startedAt,
      sessionId,
    };
  } catch (error) {
    return {
      status: null,
      ms: performance.now() - startedAt,
      sentAt: startedAt,
      error: (error as Error).name,
    };
  } finally {
    clearTimeout(giveUp);
  }
}

function trackOnce(
  shape: Shape,
  port = API_PORT,
  fixedIp?: string
): Promise<Probe> {
  const headers = headersFor(shape);
  if (fixedIp) {
    headers['x-client-ip'] = fixedIp;
  }
  return timedFetch(`http://127.0.0.1:${port}/track`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'track',
      payload: {
        name: 'm18003_failfast',
        // Unique per request: an identical payload from the same ip+origin is
        // collapsed by the dedupe lock into `200 "Duplicate event"`, which
        // would make the browser-shaped phases measure the lock and nothing
        // past it.
        properties: {
          __path: 'https://e2e.test/m18003',
          seq: payloadCounter++,
        },
      },
    }),
  });
}

function probeUrl(path: string, port = API_PORT): Promise<Probe> {
  return timedFetch(`http://127.0.0.1:${port}${path}`);
}

function summarize(label: string, probes: Probe[]): string {
  const statuses = new Map<string, number>();
  for (const p of probes) {
    const key = p.status === null ? `no-answer(${p.error})` : String(p.status);
    statuses.set(key, (statuses.get(key) ?? 0) + 1);
  }
  const sorted = probes.map((p) => p.ms).sort((a, b) => a - b);
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return `${label.padEnd(34)} n=${probes.length} ${[...statuses]
    .map(([k, v]) => `${k}×${v}`)
    .join(' ')
    .padEnd(
      22
    )} p50=${at(0.5).toFixed(1)}ms p95=${at(0.95).toFixed(1)}ms max=${(sorted.at(-1) ?? 0).toFixed(1)}ms`;
}

// ── The API under test ──────────────────────────────────────────────────────

function spawnApi(port: number) {
  const child = spawn('bun', ['src/main.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      ROLE: 'api',
      API_PORT: String(port),
      REDIS_URL: `redis://${UPSTREAM_HOST}:${PROXY_PORT}/${PROXY_REDIS_DB}`,
      KAFKA_EVENTS_TOPIC: KAFKA_TOPIC,
      LOG_LEVEL: process.env.M18_LOG_LEVEL ?? 'warn',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lines: string[] = [];
  child.stdout?.on('data', (d) => lines.push(String(d)));
  child.stderr?.on('data', (d) => lines.push(String(d)));
  return { child, lines };
}

async function waitForLive(port: number, timeoutMs = BOOT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`http://127.0.0.1:${port}/healthz/live`).catch(
      () => null
    );
    if (res?.ok) {
      return true;
    }
    await sleep(200);
  }
  return false;
}

async function main() {
  const proxy = new RedisFaultProxy();
  await proxy.start();
  console.log(
    `proxy 127.0.0.1:${PROXY_PORT} → ${UPSTREAM_HOST}:${UPSTREAM_PORT} (db ${PROXY_REDIS_DB}), api :${API_PORT}, topic ${KAFKA_TOPIC}`
  );

  const { child, lines } = spawnApi(API_PORT);
  const cleanup = async () => {
    child.kill('SIGKILL');
    await proxy.stop();
  };

  try {
    if (!(await waitForLive(API_PORT))) {
      console.log(lines.join(''));
      throw new Error('api did not become live');
    }

    // ── warm-up: the L1 caches the criterion turns on ──────────────────────
    for (let i = 0; i < WARMUP_REQUESTS; i++) {
      await trackOnce('warm-secret');
      await trackOnce('browser-origin');
    }

    console.log('\n── A. healthy baseline ──');
    const baseline: Probe[] = [];
    for (let i = 0; i < BASELINE_REQUESTS; i++) {
      baseline.push(await trackOnce('warm-secret'));
    }
    console.log(summarize('warm-secret /track', baseline));
    const baselineBrowser: Probe[] = [];
    for (let i = 0; i < BASELINE_REQUESTS; i++) {
      baselineBrowser.push(await trackOnce('browser-origin'));
    }
    console.log(summarize('browser-origin /track', baselineBrowser));

    // ── B. sustained outage ───────────────────────────────────────────────
    console.log(
      `\n── B. sustained outage (${SUSTAINED_OUTAGE_MS / 1000}s, refuse) ──`
    );
    const outageStart = Date.now();
    await proxy.refuse();
    await sleep(500);

    const warmDuringOutage: Probe[] = [];
    for (let i = 0; i < OUTAGE_PROBE_REQUESTS; i++) {
      warmDuringOutage.push(await trackOnce('warm-secret'));
    }
    console.log(summarize('warm-secret /track', warmDuringOutage));

    const coldDuringOutage: Probe[] = [];
    for (let i = 0; i < OUTAGE_PROBE_REQUESTS; i++) {
      coldDuringOutage.push(await trackOnce('cold-unknown'));
    }
    console.log(summarize('cold-unknown /track', coldDuringOutage));

    const browserDuringOutage: Probe[] = [];
    for (let i = 0; i < OUTAGE_PROBE_REQUESTS; i++) {
      browserDuringOutage.push(await trackOnce('browser-origin'));
    }
    console.log(summarize('browser-origin /track', browserDuringOutage));

    for (const path of ['/healthz/live', '/healthz/ready', '/healthcheck']) {
      const p = await probeUrl(path);
      console.log(
        `${path.padEnd(34)} status=${p.status ?? `no-answer(${p.error})`} ${p.ms.toFixed(1)}ms`
      );
    }

    const remaining = SUSTAINED_OUTAGE_MS - (Date.now() - outageStart);
    if (remaining > 0) {
      await sleep(remaining);
    }

    // ── C. recovery ───────────────────────────────────────────────────────
    console.log('\n── C. recovery ──');
    await proxy.pass();
    const recoveredAt = Date.now();
    // Browser-shaped on purpose: it is the shape that NEEDS Redis (the dedupe
    // lock), so it measures when the client is actually usable again. The
    // warm-secret shape answers 200 by degrading and would report 0 ms.
    let recovery: Probe = { status: null, ms: 0, sentAt: 0 };
    while (Date.now() - recoveredAt < 15_000) {
      recovery = await trackOnce('browser-origin');
      if (recovery.status === 200) {
        break;
      }
    }
    console.log(
      `first browser-origin 200 after restore: ${Date.now() - recoveredAt}ms (status ${recovery.status})`
    );
    const afterRestore: Probe[] = [];
    for (let i = 0; i < BASELINE_REQUESTS; i++) {
      afterRestore.push(await trackOnce('browser-origin'));
    }
    console.log(summarize('browser-origin /track', afterRestore));

    if (QUICK_RUN) {
      return;
    }

    // ── D. the blip ───────────────────────────────────────────────────────
    // The cost side of fail-fast: a reconnect blip the offline queue used to
    // absorb. Both shapes, because they degrade differently — the warm-secret
    // one only loses its session lookup, the browser one loses its dedupe lock.
    console.log(`\n── D. ${BLIP_DURATION_MS}ms blip under load ──`);
    for (const shape of ['warm-secret', 'browser-origin'] as const) {
      // A control pass first: the same load, same duration, no fault. Without
      // it a session id that changed for some unrelated reason would be read
      // as a cost of the blip.
      for (const withFault of [false, true]) {
        const probes: Probe[] = [];
        const runEnd = Date.now() + BLIP_TOTAL_MS;
        const workers = Array.from({ length: BLIP_CONCURRENCY }, async () => {
          while (Date.now() < runEnd) {
            probes.push(await trackOnce(shape, API_PORT, BLIP_CLIENT_IP));
          }
        });
        await sleep(2000);
        if (withFault) {
          await proxy.refuse();
          await sleep(BLIP_DURATION_MS);
          await proxy.pass();
        }
        await Promise.all(workers);

        const label = withFault ? 'blip' : 'control';
        console.log(summarize(`${shape}, ${label}`, probes));
        const failures = probes.filter((p) => p.status !== 200);
        const failureWindowMs =
          failures.length === 0
            ? 0
            : (failures.at(-1)?.sentAt ?? 0) +
              (failures.at(-1)?.ms ?? 0) -
              (failures[0]?.sentAt ?? 0);
        const sessionIds = new Set(
          probes.filter((p) => p.sessionId).map((p) => p.sessionId)
        );
        console.log(
          `${''.padEnd(34)} failures=${failures.length} over ${failureWindowMs.toFixed(0)}ms of wall clock, distinct sessionIds=${sessionIds.size}`
        );
        await sleep(1000);
      }
    }

    // ── E. blackhole ──────────────────────────────────────────────────────
    console.log('\n── E. blackhole (frozen dependency) ──');
    await sleep(1500);
    await proxy.blackhole();
    await sleep(300);
    const frozen: Probe[] = [];
    for (let i = 0; i < BLACKHOLE_PROBES; i++) {
      frozen.push(await trackOnce('warm-secret'));
    }
    console.log(summarize('warm-secret /track', frozen));
    const frozenBrowser: Probe[] = [];
    for (let i = 0; i < BLACKHOLE_PROBES; i++) {
      frozenBrowser.push(await trackOnce('browser-origin'));
    }
    console.log(summarize('browser-origin /track', frozenBrowser));
    await proxy.pass();
    await sleep(1500);

    // ── F. boot with Redis already down ───────────────────────────────────
    console.log('\n── F. boot with Redis down ──');
    await proxy.refuse();
    const boot = spawnApi(BOOT_API_PORT);
    const bootedAt = Date.now();
    const live = await waitForLive(BOOT_API_PORT, 30_000);
    console.log(
      `booted with redis unreachable: ${live} (${Date.now() - bootedAt}ms)`
    );
    if (live) {
      for (const path of ['/healthz/live', '/healthz/ready', '/healthcheck']) {
        const p = await probeUrl(path, BOOT_API_PORT);
        console.log(
          `  ${path.padEnd(32)} status=${p.status ?? `no-answer(${p.error})`} ${p.ms.toFixed(1)}ms`
        );
      }
      console.log(
        `  ${summarize('cold /track (never had redis)', [await trackOnce('warm-secret', BOOT_API_PORT)])}`
      );
      await proxy.pass();
      await sleep(2000);
      const after = await trackOnce('warm-secret', BOOT_API_PORT);
      console.log(
        `  /track once redis returns: status=${after.status} ${after.ms.toFixed(1)}ms`
      );
      for (const path of ['/healthz/ready', '/healthcheck']) {
        const p = await probeUrl(path, BOOT_API_PORT);
        console.log(
          `  ${path.padEnd(32)} status=${p.status ?? `no-answer(${p.error})`} ${p.ms.toFixed(1)}ms`
        );
      }
    } else {
      console.log(boot.lines.join('').slice(-4000));
    }
    boot.child.kill('SIGKILL');
  } finally {
    await cleanup();
  }
}

await main();
process.exit(0);
