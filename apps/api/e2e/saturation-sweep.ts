/**
 * Saturation sweep — the ramp driver on top of `session-stress.ts`.
 *
 * GOAL: find the MAX SUSTAINABLE INGEST THROUGHPUT, defined as the highest
 * offered load at which the pipeline still drains. It runs `session-stress.ts`
 * at increasing concurrency, one rung per CHILD PROCESS (so no Redis/Kafka
 * connection, cached pid or latency sink leaks between rungs), parses each
 * rung's machine-readable result line, and applies the knee definition below.
 *
 * THE KNEE, exactly as implemented in `classifyRung`. A rung DID NOT DRAIN if
 * any of these is true: 1. `lag.secondsToZeroAfterEmitEnd` is null — the Kafka
 * consumer group was still behind when sampling stopped. 2. That figure grew
 * rung-over-rung rather than staying flat: more than SWEEP_DRAIN_GROWTH_FACTOR
 * x the best drain time seen so far, AND more than SWEEP_DRAIN_GROWTH_MIN_S
 * seconds worse in absolute terms (the absolute floor keeps 0.4s → 0.9s from
 * reading as a knee). 3. A queue depth or a buffer pending count failed to
 * return to zero. The first such rung is the knee. The last rung BEFORE it is
 * the max sustainable throughput, reported in events/second with that rung's
 * api and worker CPU and RSS.
 *
 * A rung that fails to drain is a DATA POINT, not a harness error: it is
 * recorded, the ladder stops climbing, and the sweep still exits 0. The sweep
 * exits non-zero only when it could not measure at all (no rung produced a
 * result).
 *
 * AUTH: defaults to E2E_AUTH_MODE=secret — the pessimistic, server-side-SDK
 * path through the cached scrypt verify. The two other paths are reachable with
 * SWEEP_AUTH_MODE=cors (browser traffic) and SWEEP_AUTH_MODE=bypass (diagnostic
 * baseline, no real traffic takes it).
 *
 * Full knob list and how to read the output: docs/BENCHMARK_HARNESS.md.
 */

import { spawn } from 'node:child_process';
import {
  AUTH_PATH_DESCRIPTION,
  type AuthCostProbe,
  type AuthMode,
  authVerifyCacheKey,
  probeAuthCost,
  redis,
  sleep,
} from './lib';
import type { RunResult } from './session-stress';

const RESULT_MARKER = 'E2E_STRESS_RESULT ';
const STRESS_SCRIPT = 'e2e/session-stress.ts';

const SWEEP_RUNGS = Number.parseInt(process.env.SWEEP_RUNGS || '5', 10);
const SWEEP_START_CONCURRENCY = Number.parseInt(
  process.env.SWEEP_START_CONCURRENCY || '25',
  10
);
const SWEEP_CONCURRENCY_FACTOR = Number.parseFloat(
  process.env.SWEEP_CONCURRENCY_FACTOR || '2'
);
/** Explicit ladder, e.g. `SWEEP_LADDER=25,50,100,200`. Wins over start/factor. */
const SWEEP_LADDER = process.env.SWEEP_LADDER;
const SWEEP_AUTH_MODE = (process.env.SWEEP_AUTH_MODE || 'secret') as AuthMode;
const SWEEP_WARM_REQUESTS = process.env.SWEEP_WARM_REQUESTS || '3';
/** Idle gap between rungs so the previous rung's flushes land before the next starts. */
const SWEEP_RUNG_COOLDOWN_MS = Number.parseInt(
  process.env.SWEEP_RUNG_COOLDOWN_MS || '5000',
  10
);
const SWEEP_RUNG_TIMEOUT_MS = Number.parseInt(
  process.env.SWEEP_RUNG_TIMEOUT_MS || '600000',
  10
);
const SWEEP_DRAIN_GROWTH_FACTOR = Number.parseFloat(
  process.env.SWEEP_DRAIN_GROWTH_FACTOR || '1.5'
);
const SWEEP_DRAIN_GROWTH_MIN_S = Number.parseFloat(
  process.env.SWEEP_DRAIN_GROWTH_MIN_S || '2'
);

function buildLadder(): number[] {
  if (SWEEP_LADDER) {
    const rungs = SWEEP_LADDER.split(',')
      .map((raw) => Number.parseInt(raw.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (rungs.length === 0) {
      throw new Error(
        `SWEEP_LADDER="${SWEEP_LADDER}" has no positive integers`
      );
    }
    return rungs.slice(0, SWEEP_RUNGS);
  }
  return Array.from({ length: SWEEP_RUNGS }, (_, i) =>
    Math.round(SWEEP_START_CONCURRENCY * SWEEP_CONCURRENCY_FACTOR ** i)
  );
}

type RungVerdict = 'drained' | 'did-not-drain' | 'no-result';

interface Rung {
  index: number;
  concurrency: number;
  verdict: RungVerdict;
  /** Why it did not drain, in the words of the knee definition. */
  reasons: string[];
  result: RunResult | null;
  error: string | null;
}

/** Run one rung as its own process; never throws — a dead rung is a data point. */
function runRung(
  index: number,
  total: number,
  concurrency: number
): Promise<{ result: RunResult | null; error: string | null }> {
  console.log(
    `\n${'='.repeat(70)}\nRung ${index + 1}/${total} — concurrency ${concurrency}\n${'='.repeat(70)}`
  );
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [STRESS_SCRIPT], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        E2E_CONCURRENCY: String(concurrency),
        E2E_AUTH_MODE: SWEEP_AUTH_MODE,
        E2E_AUTH_WARM_REQUESTS: SWEEP_WARM_REQUESTS,
        E2E_RUNS: '1',
        // Makes the child print the parseable result line.
        E2E_STRESS_CHILD: '1',
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    });

    let buffered = '';
    let settled = false;
    const finish = (result: RunResult | null, error: string | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(killer);
      resolve({ result, error });
    };

    const killer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(
        null,
        `rung exceeded SWEEP_RUNG_TIMEOUT_MS=${SWEEP_RUNG_TIMEOUT_MS}`
      );
    }, SWEEP_RUNG_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(text);
      buffered += text;
    });
    child.on('error', (error) => finish(null, error.message));
    child.on('close', (code) => {
      const line = buffered
        .split('\n')
        .find((l) => l.startsWith(RESULT_MARKER));
      if (!line) {
        finish(null, `no result line (exit ${code})`);
        return;
      }
      try {
        finish(JSON.parse(line.slice(RESULT_MARKER.length)) as RunResult, null);
      } catch (error) {
        finish(null, `unparseable result line: ${(error as Error).message}`);
      }
    });
  });
}

/**
 * The knee definition, implemented. `bestDrainSeconds` is the flattest drain
 * time seen on a rung that did drain — the baseline clause 2 compares against.
 */
function classifyRung(
  result: RunResult,
  bestDrainSeconds: number | null
): { verdict: RungVerdict; reasons: string[] } {
  const reasons: string[] = [];
  const drainSeconds = result.lag.secondsToZeroAfterEmitEnd;

  if (result.lag.sampleCount === 0) {
    reasons.push(
      'kafka lag was never sampled — the drain clause cannot be evaluated for this rung'
    );
  } else if (drainSeconds === null) {
    reasons.push(
      'consumer lag never returned to 0 after emit ended (still draining when sampling stopped)'
    );
  } else if (
    bestDrainSeconds !== null &&
    drainSeconds > bestDrainSeconds * SWEEP_DRAIN_GROWTH_FACTOR &&
    drainSeconds > bestDrainSeconds + SWEEP_DRAIN_GROWTH_MIN_S
  ) {
    reasons.push(
      `drain time grew rung-over-rung: ${drainSeconds.toFixed(1)}s vs ${bestDrainSeconds.toFixed(1)}s best ` +
        `(>${SWEEP_DRAIN_GROWTH_FACTOR}x and >${SWEEP_DRAIN_GROWTH_MIN_S}s worse)`
    );
  }

  for (const queue of result.metrics.queuesNotDrained) {
    reasons.push(`queue "${queue}" did not return to zero`);
  }
  for (const buffer of result.metrics.buffersNotDrained) {
    reasons.push(`buffer "${buffer}" did not return to zero`);
  }

  return {
    verdict: reasons.length === 0 ? 'drained' : 'did-not-drain',
    reasons,
  };
}

const n1 = (v: number | null | undefined, unit = '') =>
  v === null || v === undefined ? 'n/a' : `${v.toFixed(1)}${unit}`;
const mb = (kb: number | null | undefined) =>
  kb === null || kb === undefined ? 'n/a' : `${(kb / 1024).toFixed(0)}MB`;
const pad = (text: string, width: number) => text.padEnd(width);

function printRungTable(rungs: Rung[]) {
  const header = [
    pad('rung', 5),
    pad('conc', 6),
    pad('ev/s', 9),
    pad('P50', 8),
    pad('P95', 8),
    pad('P99', 9),
    pad('api cpu%', 9),
    pad('api rss', 8),
    pad('wrk cpu%', 9),
    pad('wrk rss', 8),
    pad('peak lag', 9),
    pad('drain', 8),
    'verdict',
  ].join(' ');
  console.log(header);
  console.log('─'.repeat(header.length));
  for (const rung of rungs) {
    const r = rung.result;
    console.log(
      [
        pad(String(rung.index + 1), 5),
        pad(String(rung.concurrency), 6),
        pad(n1(r?.eventsPerSecond), 9),
        pad(n1(r?.latency.p50, 'ms'), 8),
        pad(n1(r?.latency.p95, 'ms'), 8),
        pad(n1(r?.latency.p99, 'ms'), 9),
        pad(n1(r?.api.peakCpuPct), 9),
        pad(mb(r?.api.peakRssKb), 8),
        pad(n1(r?.worker.peakCpuPct), 9),
        pad(mb(r?.worker.peakRssKb), 8),
        pad(String(r?.lag.peakLag ?? 'n/a'), 9),
        pad(n1(r?.lag.secondsToZeroAfterEmitEnd, 's'), 8),
        rung.verdict,
      ].join(' ')
    );
    for (const reason of rung.reasons) {
      console.log(`      ↳ ${reason}`);
    }
    if (rung.error) {
      console.log(`      ↳ ${rung.error}`);
    }
  }
}

function printQueueDetail(rungs: Rung[]) {
  console.log('\nQueue and buffer depths per rung');
  for (const rung of rungs) {
    if (!rung.result) {
      continue;
    }
    const { metrics } = rung.result;
    console.log(
      `  rung ${rung.index + 1} (concurrency ${rung.concurrency}, ${metrics.sampleCount} scrapes):`
    );
    const busy = metrics.queues.filter(
      (q) => q.peakWaiting > 0 || q.peakActive > 0 || q.failedDelta !== 0
    );
    for (const q of busy) {
      console.log(
        `    queue ${pad(q.queue, 16)} peak waiting=${q.peakWaiting} active=${q.peakActive} ` +
          `delayed=${q.peakDelayed}, at emit-end=${q.depthAtEmitEnd ?? 'n/a'}, ` +
          `final=${q.finalDepth}, zero=${q.returnedToZero ? 'yes' : 'NO'}, failed+${q.failedDelta}`
      );
    }
    for (const b of metrics.buffers.filter(
      (x) => x.peakPending > 0 || x.rowsFlushed > 0
    )) {
      console.log(
        `    buffer ${pad(b.buffer, 15)} peak pending=${b.peakPending}, at emit-end=${b.pendingAtEmitEnd ?? 'n/a'}, ` +
          `final=${b.finalPending}, zero=${b.returnedToZero ? 'yes' : 'NO'}, rows=${b.rowsFlushed}, ` +
          `flush mean=${n1(b.meanFlushMs, 'ms')}, ch insert mean=${n1(b.meanChInsertMs, 'ms')}`
      );
    }
    if (busy.length === 0) {
      console.log('    (no queue registered a waiting or active job at 1Hz)');
    }
  }
}

function printVerdict(rungs: Rung[], probe: AuthCostProbe | null) {
  const drained = rungs.filter((r) => r.verdict === 'drained');
  const knee = rungs.find((r) => r.verdict === 'did-not-drain');
  const best = drained.at(-1);

  console.log(`\n${'═'.repeat(70)}\nVERDICT\n${'═'.repeat(70)}`);
  console.log(`  auth path:  ${AUTH_PATH_DESCRIPTION[SWEEP_AUTH_MODE]}`);
  if (probe) {
    console.log(
      `  scrypt cost: ${probe.scryptMs.toFixed(1)}ms (cold ${probe.coldMs.toFixed(1)}ms / warmed ${probe.warmMs.toFixed(1)}ms) — ` +
        'paid once per rung during warm-up, outside every measured window'
    );
  }
  if (best) {
    const r = best.result as RunResult;
    console.log(
      `  MAX SUSTAINABLE THROUGHPUT: ${r.eventsPerSecond.toFixed(1)} events/s ` +
        `(rung ${best.index + 1}, concurrency ${best.concurrency}, ` +
        `${r.sessions} sessions x ${r.eventsPerSession} events)`
    );
    console.log(
      `    api:    CPU peak=${n1(r.api.peakCpuPct, '%')} steady=${n1(r.api.steadyCpuPct, '%')}, ` +
        `RSS peak=${mb(r.api.peakRssKb)} steady=${mb(r.api.steadyRssKb)}`
    );
    console.log(
      `    worker: CPU peak=${n1(r.worker.peakCpuPct, '%')} steady=${n1(r.worker.steadyCpuPct, '%')}, ` +
        `RSS peak=${mb(r.worker.peakRssKb)} steady=${mb(r.worker.steadyRssKb)}`
    );
    console.log(
      `    /track: P50=${n1(r.latency.p50, 'ms')} P95=${n1(r.latency.p95, 'ms')} P99=${n1(r.latency.p99, 'ms')}`
    );
  } else {
    console.log(
      '  MAX SUSTAINABLE THROUGHPUT: not established — no rung drained.'
    );
  }
  if (knee) {
    console.log(
      `  KNEE: rung ${knee.index + 1} at concurrency ${knee.concurrency} did not drain —`
    );
    for (const reason of knee.reasons) {
      console.log(`    - ${reason}`);
    }
  } else if (rungs.every((r) => r.verdict === 'drained')) {
    console.log(
      '  KNEE: NOT REACHED — every rung drained. The ceiling is above the top ' +
        'rung; extend the ladder (SWEEP_RUNGS / SWEEP_LADDER) to find it.'
    );
  }
  const unmeasured = rungs.filter((r) => r.verdict === 'no-result');
  if (unmeasured.length > 0) {
    console.log(
      `  UNMEASURED: ${unmeasured.map((r) => `rung ${r.index + 1}`).join(', ')} produced no result`
    );
  }
  console.log(
    '\n  Single-node box, single api+worker process. Not a cloud capacity claim;\n' +
      '  see docs/BENCHMARK_HARNESS.md for what these numbers do NOT cover.'
  );
}

async function main() {
  const ladder = buildLadder();
  console.log(
    `Saturation sweep — ${ladder.length} rungs at concurrency ${ladder.join(', ')}\n` +
      `  auth mode:   ${SWEEP_AUTH_MODE} — ${AUTH_PATH_DESCRIPTION[SWEEP_AUTH_MODE]}\n` +
      `  per rung:    E2E_SESSIONS=${process.env.E2E_SESSIONS || '500'} ` +
      `E2E_EVENTS_PER_SESSION=${process.env.E2E_EVENTS_PER_SESSION || '3'}\n` +
      `  knee:        secondsToZero null, or >${SWEEP_DRAIN_GROWTH_FACTOR}x and >${SWEEP_DRAIN_GROWTH_MIN_S}s worse than best, ` +
      'or a queue/buffer that never returned to zero'
  );

  // Evict the L2 copy of the scrypt verdict so the sweep's first rung starts
  // from the same cache state as a cold production process would. The API also
  // holds an L1 LRU this harness cannot reach — which is exactly why the
  // per-rung warm-up, not this delete, is what guarantees the measured window
  // is scrypt-free.
  await redis.del(authVerifyCacheKey()).catch(() => 0);

  let probe: AuthCostProbe | null = null;
  if (SWEEP_AUTH_MODE === 'secret') {
    probe = await probeAuthCost().catch(() => null);
    if (probe) {
      console.log(
        `  scrypt probe: cold=${probe.coldMs.toFixed(1)}ms (status ${probe.coldStatus}) ` +
          `warmed=${probe.warmMs.toFixed(1)}ms (status ${probe.warmStatus}) → scrypt ≈ ${probe.scryptMs.toFixed(1)}ms`
      );
    }
  }

  const rungs: Rung[] = [];
  let bestDrainSeconds: number | null = null;

  for (const [index, concurrency] of ladder.entries()) {
    if (index > 0) {
      await sleep(SWEEP_RUNG_COOLDOWN_MS);
    }
    const { result, error } = await runRung(index, ladder.length, concurrency);
    if (!result) {
      rungs.push({
        index,
        concurrency,
        verdict: 'no-result',
        reasons: [],
        result: null,
        error,
      });
      console.log(`\n  rung ${index + 1} produced no result: ${error}`);
      break;
    }

    const { verdict, reasons } = classifyRung(result, bestDrainSeconds);
    rungs.push({ index, concurrency, verdict, reasons, result, error: null });

    if (verdict === 'did-not-drain') {
      console.log(
        `\n  rung ${index + 1} did not drain — recording it and stopping the climb.`
      );
      break;
    }
    const drainSeconds = result.lag.secondsToZeroAfterEmitEnd;
    if (
      drainSeconds !== null &&
      (bestDrainSeconds === null || drainSeconds < bestDrainSeconds)
    ) {
      bestDrainSeconds = drainSeconds;
    }
  }

  console.log(`\n${'═'.repeat(70)}\nRUNG TABLE\n${'═'.repeat(70)}`);
  printRungTable(rungs);
  printQueueDetail(rungs);
  printVerdict(rungs, probe);

  await redis.quit().catch(() => {
    // Teardown is best-effort; the verdict is already printed.
  });
  // A rung that did not drain is the answer, not a failure. Only a sweep that
  // measured nothing at all is an error.
  process.exit(rungs.some((r) => r.result !== null) ? 0 : 1);
}

main().catch(async (error) => {
  console.error('\nFATAL:', error);
  await redis.quit().catch(() => {
    // Already failing; a stuck redis connection must not mask the cause.
  });
  process.exit(1);
});
