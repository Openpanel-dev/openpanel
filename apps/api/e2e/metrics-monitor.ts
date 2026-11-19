/**
 * Queue + buffer sampling from the Prometheus scrape endpoint.
 *
 * Everything needed is already on `/metrics`: the BullMQ per-queue gauges and
 * the buffer gauges and histograms. Scraping is deliberate rather than
 * reaching into Redis or into the buffer objects directly.
 *
 * Sampling costs the measured process a scrape per tick. `session-stress.ts`
 * ties this to the same `E2E_NO_SAMPLING` lever as the process/lag monitors
 * so that cost can be ruled in or out.
 */

const QUEUE_GAUGE =
  /^([A-Za-z][A-Za-z_]*)_(waiting|active|delayed|failed)_count$/;
const BUFFER_GAUGE = /^buffer_([a-z_]+)_count$/;
const LABELLED_SUM = /^([a-z_]+)_(sum|count)$/;

/** `buffer_profile_backfill_count` and `buffer="profile-backfill"` are the same buffer. */
const gaugeNameToBufferLabel = (name: string) => name.replace(/_/g, '-');

type QueueDepths = Record<'waiting' | 'active' | 'delayed' | 'failed', number>;

interface Scrape {
  t: number;
  queues: Map<string, QueueDepths>;
  buffers: Map<string, number>;
  /** `buffer_flush_rows_total{buffer=...}` — a counter, so only deltas mean anything. */
  flushRows: Map<string, number>;
  flushDurationSumMs: Map<string, number>;
  flushDurationCount: Map<string, number>;
  chInsertSumMs: Map<string, number>;
  chInsertCount: Map<string, number>;
}

const emptyDepths = (): QueueDepths => ({
  waiting: 0,
  active: 0,
  delayed: 0,
  failed: 0,
});

function parseLabels(labelText: string): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const part of labelText.matchAll(
    /([A-Za-z_][A-Za-z0-9_]*)="([^"]*)"/g
  )) {
    labels[part[1] as string] = part[2] as string;
  }
  return labels;
}

const addTo = (map: Map<string, number>, key: string, value: number) =>
  map.set(key, (map.get(key) ?? 0) + value);

export function parseScrape(body: string, t: number): Scrape {
  const scrape: Scrape = {
    t,
    queues: new Map(),
    buffers: new Map(),
    flushRows: new Map(),
    flushDurationSumMs: new Map(),
    flushDurationCount: new Map(),
    chInsertSumMs: new Map(),
    chInsertCount: new Map(),
  };

  for (const line of body.split('\n')) {
    if (line.startsWith('#') || line.length === 0) {
      continue;
    }
    const braceAt = line.indexOf('{');
    const spaceAt = line.lastIndexOf(' ');
    if (spaceAt < 0) {
      continue;
    }
    const value = Number(line.slice(spaceAt + 1));
    if (!Number.isFinite(value)) {
      continue;
    }
    const head = line.slice(0, spaceAt);
    const name = braceAt >= 0 ? head.slice(0, braceAt) : head;
    const labels = braceAt >= 0 ? parseLabels(head.slice(braceAt)) : {};

    const queueMatch = braceAt < 0 ? QUEUE_GAUGE.exec(name) : null;
    if (queueMatch) {
      const queue = queueMatch[1] as string;
      const field = queueMatch[2] as keyof QueueDepths;
      const depths = scrape.queues.get(queue) ?? emptyDepths();
      depths[field] = value;
      scrape.queues.set(queue, depths);
      continue;
    }

    const bufferMatch = braceAt < 0 ? BUFFER_GAUGE.exec(name) : null;
    if (bufferMatch) {
      scrape.buffers.set(
        gaugeNameToBufferLabel(bufferMatch[1] as string),
        value
      );
      continue;
    }

    const buffer = labels.buffer;
    if (!buffer) {
      continue;
    }
    if (name === 'buffer_flush_rows_total') {
      addTo(scrape.flushRows, buffer, value);
      continue;
    }
    const labelled = LABELLED_SUM.exec(name);
    if (!labelled) {
      continue;
    }
    const [, base, kind] = labelled as unknown as [string, string, string];
    if (base === 'buffer_flush_duration_ms') {
      addTo(
        kind === 'sum' ? scrape.flushDurationSumMs : scrape.flushDurationCount,
        buffer,
        value
      );
    } else if (base === 'buffer_ch_insert_duration_ms') {
      addTo(
        kind === 'sum' ? scrape.chInsertSumMs : scrape.chInsertCount,
        buffer,
        value
      );
    }
  }
  return scrape;
}

export interface QueueSummary {
  queue: string;
  peakWaiting: number;
  peakActive: number;
  peakDelayed: number;
  depthAtEmitEnd: number | null;
  finalDepth: number;
  /** Did waiting+active hit zero in ANY scrape at or after emit-end. */
  returnedToZero: boolean;
  /** `*_failed_count` growth over the run; a non-zero value is a real signal. */
  failedDelta: number;
}

export interface BufferSummary {
  buffer: string;
  peakPending: number;
  pendingAtEmitEnd: number | null;
  finalPending: number;
  /** Did the pending count hit zero in ANY scrape at or after emit-end. */
  returnedToZero: boolean;
  rowsFlushed: number;
  flushes: number;
  meanFlushMs: number | null;
  chInserts: number;
  meanChInsertMs: number | null;
}

export interface MetricsSummary {
  scrapeUrl: string;
  sampleCount: number;
  queues: QueueSummary[];
  buffers: BufferSummary[];
  /** Queues whose waiting+active+delayed depth never came back to zero. */
  queuesNotDrained: string[];
  /** Buffers whose pending count never came back to zero. */
  buffersNotDrained: string[];
}

const EMPTY_SUMMARY = (scrapeUrl: string): MetricsSummary => ({
  scrapeUrl,
  sampleCount: 0,
  queues: [],
  buffers: [],
  queuesNotDrained: [],
  buffersNotDrained: [],
});

const depthOf = (d: QueueDepths) => d.waiting + d.active + d.delayed;

/** Samples every queue gauge and every buffer gauge on /metrics at >=1Hz. */
export class MetricsMonitor {
  private readonly samples: Scrape[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly url: string;

  constructor(apiUrl: string) {
    this.url = `${apiUrl.replace(/\/$/, '')}/metrics`;
  }

  async start(intervalMs = 1000): Promise<void> {
    const ok = await this.sampleOnce();
    if (!ok) {
      console.warn(
        `   ⚠ metrics-monitor: ${this.url} unreachable — queue/buffer depths will be unavailable`
      );
      return;
    }
    this.timer = setInterval(() => {
      this.sampleOnce().catch(() => {
        // One missed scrape is one fewer sample, never a failed run.
      });
    }, intervalMs);
  }

  private async sampleOnce(): Promise<boolean> {
    const res = await fetch(this.url).catch(() => null);
    if (!res?.ok) {
      return false;
    }
    this.samples.push(parseScrape(await res.text(), Date.now()));
    return true;
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = null;
  }

  private closestTo(t: number): Scrape | null {
    if (this.samples.length === 0) {
      return null;
    }
    return this.samples.reduce((closest, s) =>
      Math.abs(s.t - t) < Math.abs(closest.t - t) ? s : closest
    );
  }

  /** `emitEndedAt` is a `Date.now()`-comparable timestamp. */
  summarize(emitEndedAt: number): MetricsSummary {
    const first = this.samples[0];
    const last = this.samples.at(-1);
    if (!(first && last)) {
      return EMPTY_SUMMARY(this.url);
    }
    const atEmitEnd = this.closestTo(emitEndedAt);
    // "Returned to zero" is asked of the whole post-emit window, not of the
    // last scrape: the cron queue picks up a scheduled job every minute
    // regardless of load, and a final scrape that happens to land on one is
    // not a backlog. Falls back to the last scrape when emit-end is past the
    // final sample, which only happens if sampling stopped early.
    const afterEmitEnd = this.samples.filter((s) => s.t >= emitEndedAt);
    const settled = afterEmitEnd.length > 0 ? afterEmitEnd : [last];

    const queueNames = new Set<string>();
    const bufferNames = new Set<string>();
    for (const s of this.samples) {
      for (const name of s.queues.keys()) {
        queueNames.add(name);
      }
      for (const name of s.buffers.keys()) {
        bufferNames.add(name);
      }
    }

    const queues: QueueSummary[] = [...queueNames].sort().map((queue) => {
      const seen = this.samples
        .map((s) => s.queues.get(queue))
        .filter((d): d is QueueDepths => d !== undefined);
      const finalDepth = depthOf(last.queues.get(queue) ?? emptyDepths());
      return {
        queue,
        peakWaiting: Math.max(...seen.map((d) => d.waiting), 0),
        peakActive: Math.max(...seen.map((d) => d.active), 0),
        peakDelayed: Math.max(...seen.map((d) => d.delayed), 0),
        depthAtEmitEnd: atEmitEnd
          ? depthOf(atEmitEnd.queues.get(queue) ?? emptyDepths())
          : null,
        finalDepth,
        // `delayed` is excluded: the cron queue permanently parks its next
        // scheduled run there, so a delayed job is steady state, not a backlog.
        returnedToZero: settled.some(
          (s) =>
            (s.queues.get(queue)?.waiting ?? 0) === 0 &&
            (s.queues.get(queue)?.active ?? 0) === 0
        ),
        failedDelta:
          (last.queues.get(queue)?.failed ?? 0) -
          (first.queues.get(queue)?.failed ?? 0),
      };
    });

    const buffers: BufferSummary[] = [...bufferNames].sort().map((buffer) => {
      const seen = this.samples
        .map((s) => s.buffers.get(buffer))
        .filter((v): v is number => v !== undefined);
      const finalPending = last.buffers.get(buffer) ?? 0;
      const delta = (m: (s: Scrape) => Map<string, number>) =>
        (m(last).get(buffer) ?? 0) - (m(first).get(buffer) ?? 0);
      const flushes = delta((s) => s.flushDurationCount);
      const flushMs = delta((s) => s.flushDurationSumMs);
      const chInserts = delta((s) => s.chInsertCount);
      const chInsertMs = delta((s) => s.chInsertSumMs);
      return {
        buffer,
        peakPending: Math.max(...seen, 0),
        pendingAtEmitEnd: atEmitEnd
          ? (atEmitEnd.buffers.get(buffer) ?? null)
          : null,
        finalPending,
        returnedToZero: settled.some((s) => (s.buffers.get(buffer) ?? 0) === 0),
        rowsFlushed: delta((s) => s.flushRows),
        flushes,
        meanFlushMs: flushes > 0 ? flushMs / flushes : null,
        chInserts,
        meanChInsertMs: chInserts > 0 ? chInsertMs / chInserts : null,
      };
    });

    return {
      scrapeUrl: this.url,
      sampleCount: this.samples.length,
      queues,
      buffers,
      queuesNotDrained: queues
        .filter((q) => !q.returnedToZero)
        .map((q) => q.queue),
      buffersNotDrained: buffers
        .filter((b) => !b.returnedToZero)
        .map((b) => b.buffer),
    };
  }
}

const num = (v: number | null, unit = '') =>
  v === null ? 'n/a' : `${v.toFixed(1)}${unit}`;

/** One line per queue/buffer that did anything, plus the not-drained verdict. */
export function formatMetricsSummary(s: MetricsSummary): string[] {
  if (s.sampleCount === 0) {
    return [`queues/buffers: no samples (${s.scrapeUrl} unreachable)`];
  }
  const lines = [
    `queues/buffers (${s.sampleCount} scrapes of ${s.scrapeUrl}):`,
  ];
  for (const q of s.queues) {
    const busy = q.peakWaiting > 0 || q.peakActive > 0 || q.failedDelta !== 0;
    if (!busy) {
      continue;
    }
    lines.push(
      `     queue ${q.queue}: peak waiting=${q.peakWaiting} active=${q.peakActive} delayed=${q.peakDelayed}, ` +
        `depth at emit-end=${q.depthAtEmitEnd ?? 'n/a'}, final=${q.finalDepth}, ` +
        `back to zero=${q.returnedToZero ? 'yes' : 'NO'}, failed+${q.failedDelta}`
    );
  }
  for (const b of s.buffers) {
    if (b.peakPending === 0 && b.rowsFlushed === 0) {
      continue;
    }
    lines.push(
      `     buffer ${b.buffer}: peak pending=${b.peakPending}, at emit-end=${b.pendingAtEmitEnd ?? 'n/a'}, ` +
        `final=${b.finalPending}, back to zero=${b.returnedToZero ? 'yes' : 'NO'}, ` +
        `rows=${b.rowsFlushed}, flushes=${b.flushes} (mean ${num(b.meanFlushMs, 'ms')}), ` +
        `ch inserts=${b.chInserts} (mean ${num(b.meanChInsertMs, 'ms')})`
    );
  }
  const stuck = [
    ...s.queuesNotDrained.map((q) => `queue:${q}`),
    ...s.buffersNotDrained.map((b) => `buffer:${b}`),
  ];
  lines.push(
    `     did not return to zero: ${stuck.length === 0 ? 'none' : stuck.join(', ')}`
  );
  return lines;
}
