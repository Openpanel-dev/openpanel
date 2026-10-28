/**
 * Ingest throughput harness: N devices × M events through `POST /track`
 * (API → Kafka → worker → Redis buffers → ClickHouse), timed from the first
 * request until every business event is in ClickHouse and every buffer is
 * empty. The run that produced the "100,000 events in 27 s" figure in #560
 * is `--devices 5000 --per-device 20 --concurrency 100`.
 *
 * Besides the wall-clock marks it reports what the run cost Redis: the delta
 * of `INFO commandstats` and `INFO cpu` over the run, so Redis CPU can be
 * attributed to commands and compared across machines as CPU-seconds per
 * event rather than as a percentage of a core.
 *
 * Refuses to start unless the pipeline is idle (no Kafka lag, every partition
 * committed, all three buffers empty), so the marks measure this run alone.
 *
 * Usage (from apps/api, against a running api + worker):
 *   dotenv -e ../../.env -- bun e2e/ingest-load.ts [options]
 *   --devices 5000 --per-device 20 --concurrency 100
 *   --properties 2        custom properties per event (one of them an array)
 *   --identified          send a profileId per device (identified traffic)
 *   --project acme-shop   project id, for the ClickHouse counts
 *   --client / --secret   write client; defaults to the seeded project's
 *   --label run           prefix for the output files in --out
 *   --out <dir>           default: a fresh private directory under $TMPDIR
 * Env: API_URL (or E2E_API_URL), REDIS_URL, CLICKHOUSE_URL, and the Kafka
 * topic and group from the api's own config loader.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createKafkaAdmin, sampleConsumerGroupLag } from '@openpanel/core';
import { getRedisCache } from '@openpanel/redis';
import { loadConfig } from '../src/config/env';

const SAMPLE_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_S = 1800;
const ARRAY_PROPERTY_LENGTH = 3;
const OCTET_RANGE = 256;
const TOP_COMMANDS = 14;
/** A reset keep-alive socket is retried like an SDK would; a 4xx/5xx is not. */
const SEND_ATTEMPTS = 3;
const BUFFER_KEYS = {
  event: 'event_buffer:queue',
  session: 'session-buffer',
  profile: 'profile-buffer',
} as const;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36';

const { values } = parseArgs({
  options: {
    devices: { type: 'string', default: '5000' },
    'per-device': { type: 'string', default: '20' },
    concurrency: { type: 'string', default: '100' },
    properties: { type: 'string', default: '2' },
    identified: { type: 'boolean', default: false },
    project: { type: 'string', default: 'acme-shop' },
    client: { type: 'string' },
    secret: { type: 'string' },
    label: { type: 'string', default: 'run' },
    out: { type: 'string' },
    timeout: { type: 'string', default: String(DEFAULT_TIMEOUT_S) },
  },
});

function integerOption(name: string, raw: string, min: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`--${name} must be an integer >= ${min}, got "${raw}"`);
  }
  return value;
}

const devices = integerOption('devices', values.devices, 1);
const perDevice = integerOption('per-device', values['per-device'], 1);
const concurrency = integerOption('concurrency', values.concurrency, 1);
const propertyCount = integerOption('properties', values.properties, 0);
const timeoutS = integerOption('timeout', values.timeout, 1);
const total = devices * perDevice;
const projectId = values.project;
const runId = `${values.label}_${Date.now().toString(36)}`;
// A fixed name under /tmp could be pre-created by another local user, who would
// then decide where the samples are appended.
const outDir =
  values.out ?? mkdtempSync(join(tmpdir(), 'openpanel-ingest-load-'));
mkdirSync(outDir, { recursive: true });
const outPrefix = resolve(outDir, runId);
console.log(`Writing ${outPrefix}.samples and ${outPrefix}.json`);

const apiUrl = process.env.E2E_API_URL ?? process.env.API_URL;
if (!apiUrl) {
  throw new Error('Set API_URL (or E2E_API_URL) to the api you are loading.');
}
const clickhouseUrl = process.env.CLICKHOUSE_URL;
if (!clickhouseUrl) {
  throw new Error('Set CLICKHOUSE_URL.');
}

interface SeedManifest {
  projects: { id: string; clientId: string; clientSecret: string }[];
}

function resolveClient(): { id: string; secret: string } {
  if (values.client && values.secret) {
    return { id: values.client, secret: values.secret };
  }
  const manifestPath = resolve(import.meta.dir, '../../../.seed.json');
  if (!existsSync(manifestPath)) {
    throw new Error(
      'No --client/--secret and no .seed.json: run `bun run seed` or pass a write client.'
    );
  }
  const manifest = JSON.parse(
    readFileSync(manifestPath, 'utf8')
  ) as SeedManifest;
  const project = manifest.projects.find((p) => p.id === projectId);
  if (!project) {
    throw new Error(`Project ${projectId} is not in .seed.json.`);
  }
  return { id: project.clientId, secret: project.clientSecret };
}

const client = resolveClient();
const kafkaConfig = loadConfig().core;
const admin = createKafkaAdmin(kafkaConfig);
const redis = getRedisCache();

const log = (line: string) => {
  console.log(line);
  appendFileSync(`${outPrefix}.samples`, `${line}\n`);
};

async function clickhouse(query: string): Promise<string> {
  const url = new URL(clickhouseUrl as string);
  const database = url.pathname.slice(1);
  url.pathname = '/';
  if (database) {
    url.searchParams.set('database', database);
  }
  const response = await fetch(url, { method: 'POST', body: query });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text);
  }
  return text.trim();
}

const runFilter = `project_id = '${projectId}' AND properties['run'] = '${runId}'`;
const businessFilter = `${runFilter} AND name NOT IN ('session_start', 'session_end')`;

const countBusinessEvents = async () =>
  Number(
    await clickhouse(`SELECT count() FROM events WHERE ${businessFilter}`)
  );

async function kafkaState() {
  const [lag, groups] = await Promise.all([
    sampleConsumerGroupLag(
      admin,
      kafkaConfig.kafka.eventsTopic,
      kafkaConfig.kafka.consumerGroup
    ),
    admin.describeGroups([kafkaConfig.kafka.consumerGroup]),
  ]);
  const group = groups.groups[0];
  return {
    lag: lag.totalLag,
    state: group?.state ?? 'Unknown',
    members: group?.members.length ?? 0,
  };
}

async function bufferSizes() {
  const [event, session, profile] = await Promise.all([
    redis.llen(BUFFER_KEYS.event),
    redis.llen(BUFFER_KEYS.session),
    redis.llen(BUFFER_KEYS.profile),
  ]);
  return { event, session, profile };
}

type CommandStats = Map<string, { calls: number; usec: number }>;

async function redisCommandStats(): Promise<CommandStats> {
  const stats: CommandStats = new Map();
  const info = await redis.info('commandstats');
  for (const line of info.split('\n')) {
    const match = line.match(/^cmdstat_([^:]+):calls=(\d+),usec=(\d+)/);
    if (match) {
      stats.set(match[1] as string, {
        calls: Number(match[2]),
        usec: Number(match[3]),
      });
    }
  }
  return stats;
}

/** Main thread and the snapshot fork separately: RDB saves are the fork. */
async function redisCpuSeconds(): Promise<{ main: number; children: number }> {
  const info = await redis.info('cpu');
  const read = (key: string) =>
    Number(info.match(new RegExp(`${key}:([\\d.]+)`))?.[1] ?? 0);
  return {
    main: read('used_cpu_sys') + read('used_cpu_user'),
    children: read('used_cpu_sys_children') + read('used_cpu_user_children'),
  };
}

function reportRedisCost(before: CommandStats, after: CommandStats) {
  const rows: { command: string; calls: number; usec: number }[] = [];
  for (const [command, stat] of after) {
    const previous = before.get(command) ?? { calls: 0, usec: 0 };
    const calls = stat.calls - previous.calls;
    const usec = stat.usec - previous.usec;
    if (calls > 0) {
      rows.push({ command, calls, usec });
    }
  }
  rows.sort((a, b) => b.usec - a.usec);
  const totalUsec = rows.reduce((sum, row) => sum + row.usec, 0);
  log('Redis commands over the run (server-wide), by time spent:');
  log(
    '  command            calls   calls/event   usec/call   share of Redis time'
  );
  for (const row of rows.slice(0, TOP_COMMANDS)) {
    log(
      `  ${row.command.padEnd(16)} ${String(row.calls).padStart(8)} ${(row.calls / total).toFixed(2).padStart(13)} ${(row.usec / row.calls).toFixed(1).padStart(11)} ${((100 * row.usec) / totalUsec).toFixed(1).padStart(10)}%`
    );
  }
  log(
    `  total command time ${(totalUsec / 1e6).toFixed(1)} s = ${((1000 * totalUsec) / 1e6 / total).toFixed(3)} ms per business event`
  );
}

/** A distinct public-looking IP per device, so each gets its own device id. */
function ipFor(device: number) {
  const octets = [
    Math.floor(device / OCTET_RANGE ** 2) % OCTET_RANGE,
    Math.floor(device / OCTET_RANGE) % OCTET_RANGE,
    device % OCTET_RANGE,
  ];
  return `81.${octets.join('.')}`;
}

function customProperties(device: number, step: number) {
  const properties: Record<string, unknown> = {};
  for (let i = 1; i <= propertyCount; i++) {
    properties[`prop_${i}`] =
      i === propertyCount
        ? Array.from(
            { length: ARRAY_PROPERTY_LENGTH },
            (_, j) => `tag_${(step + j) % 7}`
          )
        : `v${(device * 31 + step * i) % 1000}`;
  }
  return properties;
}

async function assertIdle() {
  const [kafka, buffers] = await Promise.all([kafkaState(), bufferSizes()]);
  log(
    `preflight run=${runId} kafka=${JSON.stringify(kafka)} buffers=${JSON.stringify(buffers)}`
  );
  const idle =
    kafka.state === 'Stable' &&
    kafka.members > 0 &&
    kafka.lag === 0 &&
    buffers.event === 0 &&
    buffers.session === 0 &&
    buffers.profile === 0;
  if (!idle) {
    log('PREFLIGHT FAILED: pipeline is not idle, or no worker is consuming');
    process.exit(2);
  }
}

await assertIdle();

// Round-robin: event k of every device, then event k+1, so every session is
// open for the whole run and the worker sees the realistic interleaving.
const jobs: { device: number; step: number }[] = [];
for (let step = 0; step < perDevice; step++) {
  for (let device = 0; device < devices; device++) {
    jobs.push({ device, step });
  }
}

let accepted = 0;
let failed = 0;
let retried = 0;
let nextJob = 0;

async function send(job: { device: number; step: number }): Promise<Response> {
  const body = {
    type: 'track',
    payload: {
      name: job.step % 2 === 0 ? 'screen_view' : `load_${values.label}`,
      properties: {
        __path: `https://shop.example/p/${job.step}`,
        run: runId,
        ...customProperties(job.device, job.step),
      },
      ...(values.identified ? { profileId: `user_${job.device}` } : {}),
    },
  };
  let lastError: unknown;
  for (let attempt = 1; attempt <= SEND_ATTEMPTS; attempt++) {
    try {
      return await fetch(`${apiUrl}/track`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'openpanel-client-id': client.id,
          'openpanel-client-secret': client.secret,
          // The run id makes every run's device ids its own, so two runs never
          // extend the same session.
          'user-agent': `${USER_AGENT} run/${runId}`,
          'x-client-ip': ipFor(job.device + 1),
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      lastError = error;
      retried++;
      if (retried <= 5) {
        log(`retrying after ${(error as Error).message}`);
      }
    }
  }
  throw lastError;
}

async function sender() {
  while (nextJob < jobs.length) {
    const job = jobs[nextJob++] as { device: number; step: number };
    const response = await send(job);
    await response.arrayBuffer();
    if (response.ok) {
      accepted++;
    } else {
      failed++;
      if (failed <= 5) {
        log(`HTTP ${response.status}`);
      }
    }
  }
}

const statsBefore = await redisCommandStats();
const cpuBefore = await redisCpuSeconds();
const startedAt = performance.now();
const elapsed = () => (performance.now() - startedAt) / 1000;
const marks = {
  sendDone: 0,
  kafkaDrained: 0,
  eventsInClickhouse: 0,
  buffersDrained: 0,
};
const peaks = {
  kafkaLag: 0,
  eventBuffer: 0,
  sessionBuffer: 0,
  profileBuffer: 0,
};

/** Resolves true once everything landed, false on timeout. */
const monitor = (async (): Promise<boolean> => {
  while (true) {
    const [buffers, kafka, inClickhouse] = await Promise.all([
      bufferSizes(),
      kafkaState(),
      countBusinessEvents(),
    ]);
    const t = elapsed();
    peaks.kafkaLag = Math.max(peaks.kafkaLag, kafka.lag);
    peaks.eventBuffer = Math.max(peaks.eventBuffer, buffers.event);
    peaks.sessionBuffer = Math.max(peaks.sessionBuffer, buffers.session);
    peaks.profileBuffer = Math.max(peaks.profileBuffer, buffers.profile);
    log(
      `${t.toFixed(1)}s sent=${accepted} kafkaLag=${kafka.lag} evBuf=${buffers.event} sessBuf=${buffers.session} profBuf=${buffers.profile} chEvents=${inClickhouse}`
    );
    if (marks.sendDone) {
      if (!marks.kafkaDrained && kafka.lag === 0) {
        marks.kafkaDrained = t;
      }
      // A rejected request wrote no event, so the target is what was accepted.
      if (!marks.eventsInClickhouse && inClickhouse >= accepted) {
        marks.eventsInClickhouse = t;
      }
      const drained =
        buffers.event === 0 && buffers.session === 0 && buffers.profile === 0;
      if (marks.eventsInClickhouse && marks.kafkaDrained && drained) {
        marks.buffersDrained = t;
        return true;
      }
    }
    if (t > timeoutS) {
      log('TIMEOUT');
      return false;
    }
    await Bun.sleep(SAMPLE_INTERVAL_MS);
  }
})();

await Promise.all(Array.from({ length: concurrency }, sender));
marks.sendDone = elapsed();
log(
  `send done at ${marks.sendDone.toFixed(1)}s (${(accepted / marks.sendDone).toFixed(0)} accepted requests/s)`
);
const completed = await monitor;
// On a timeout the rates are over the time the run was given.
const runSeconds = completed ? marks.buffersDrained : elapsed();

const cpuAfter = await redisCpuSeconds();
reportRedisCost(statsBefore, await redisCommandStats());
const redisCpu = cpuAfter.main - cpuBefore.main;
const redisForkCpu = cpuAfter.children - cpuBefore.children;
log(
  `Redis CPU over the run: ${redisCpu.toFixed(1)} s = ${((1000 * redisCpu) / total).toFixed(3)} ms per business event (${((100 * redisCpu) / runSeconds).toFixed(0)}% of one core on average), plus ${redisForkCpu.toFixed(1)} s in snapshot forks`
);

const [eventCounts, sessionStarts, sessionCounts] = await Promise.all([
  clickhouse(
    `SELECT count(), uniqExact(id) FROM events WHERE ${businessFilter} FORMAT TSV`
  ),
  clickhouse(
    `SELECT count() FROM events WHERE ${runFilter} AND name = 'session_start' FORMAT TSV`
  ),
  clickhouse(
    `SELECT count(), countIf(net != 1) FROM (
       SELECT id, sum(sign) AS net FROM sessions
       WHERE project_id = '${projectId}'
         AND id IN (SELECT DISTINCT session_id FROM events WHERE ${businessFilter})
       GROUP BY id) FORMAT TSV`
  ),
]);

const summary = {
  run: runId,
  completed,
  shape: {
    devices,
    perDevice,
    concurrency,
    properties: propertyCount,
    identified: values.identified,
  },
  total,
  accepted,
  failed,
  retried,
  seconds: Object.fromEntries(
    Object.entries(marks).map(([key, value]) => [key, Number(value.toFixed(1))])
  ),
  businessEventsPerSecond: Number((accepted / runSeconds).toFixed(0)),
  peaks,
  redisCpuSeconds: Number(redisCpu.toFixed(2)),
  redisForkCpuSeconds: Number(redisForkCpu.toFixed(2)),
  verify: {
    eventsAndUniqueIds: eventCounts,
    sessionStarts,
    sessionsAndUncollapsed: sessionCounts,
    expected: `${total} ${total} / ${devices} / ${devices} 0`,
  },
};
log(JSON.stringify(summary));
await Bun.write(`${outPrefix}.json`, JSON.stringify(summary, null, 2));
await admin.disconnect();
redis.disconnect();
if (!completed || failed > 0) {
  process.exit(1);
}
