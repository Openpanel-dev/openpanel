/**
 * Kafka consumer-group lag sampling for the stress harness — the backpressure
 * story a throughput number alone hides. Wraps the admin-API primitives in
 * `@openpanel/core`'s ingest module; a fast API can outrun its consumer for a
 * while without a single failed request, and this is the only place that would
 * show it.
 */

import {
  type Admin,
  type ConsumerGroupLag,
  createKafkaAdmin,
  KAFKA_CONSUMER_GROUP,
  KAFKA_EVENTS_TOPIC,
  sampleConsumerGroupLag,
} from '@openpanel/core';

export interface LagSummary {
  sampleCount: number;
  peakLag: number | null;
  lagAtEmitEnd: number | null;
  /** null = still draining when sampling stopped. */
  secondsToZeroAfterEmitEnd: number | null;
}

/** Samples total consumer-group lag on the events topic at >=1Hz. */
export class LagMonitor {
  private admin: Admin | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly samples: ConsumerGroupLag[] = [];
  private connected = false;

  constructor(
    private readonly topic: string = KAFKA_EVENTS_TOPIC,
    private readonly groupId: string = KAFKA_CONSUMER_GROUP
  ) {}

  async start(intervalMs = 1000): Promise<void> {
    try {
      this.admin = createKafkaAdmin();
      await this.admin.connect();
      this.connected = true;
    } catch (error) {
      console.warn(
        `   ⚠ lag-monitor: admin connect failed — lag will be unavailable (${(error as Error).message})`
      );
      return;
    }
    await this.sampleOnce();
    this.timer = setInterval(() => {
      this.sampleOnce().catch(() => {
        // sampleOnce() already swallows its own errors; this is belt-and-braces.
      });
    }, intervalMs);
  }

  private async sampleOnce(): Promise<void> {
    if (!this.admin) {
      return;
    }
    try {
      const sample = await sampleConsumerGroupLag(
        this.admin,
        this.topic,
        this.groupId
      );
      this.samples.push(sample);
    } catch {
      // A transient admin-API hiccup shouldn't stop the run; just skip the tick.
    }
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = null;
    if (this.connected && this.admin) {
      await this.admin.disconnect().catch(() => {
        // Best-effort teardown; a stress harness exiting shouldn't hang on it.
      });
    }
    this.connected = false;
  }

  /** `emitEndedAt` is a Date.now()-comparable timestamp. */
  summarize(emitEndedAt: number): LagSummary {
    if (this.samples.length === 0) {
      return {
        sampleCount: 0,
        peakLag: null,
        lagAtEmitEnd: null,
        secondsToZeroAfterEmitEnd: null,
      };
    }
    const peakLag = Math.max(...this.samples.map((s) => s.totalLag));

    const closestToEmitEnd = this.samples.reduce((closest, s) =>
      Math.abs(s.sampledAt - emitEndedAt) <
      Math.abs(closest.sampledAt - emitEndedAt)
        ? s
        : closest
    );

    const firstZeroAfterEmitEnd = this.samples.find(
      (s) => s.sampledAt >= emitEndedAt && s.totalLag === 0
    );

    return {
      sampleCount: this.samples.length,
      peakLag,
      lagAtEmitEnd: closestToEmitEnd.totalLag,
      secondsToZeroAfterEmitEnd: firstZeroAfterEmitEnd
        ? (firstZeroAfterEmitEnd.sampledAt - emitEndedAt) / 1000
        : null,
    };
  }
}

export function formatLagSummary(s: LagSummary): string {
  const zero =
    s.secondsToZeroAfterEmitEnd === null
      ? 'never reached 0 during the run'
      : `${s.secondsToZeroAfterEmitEnd.toFixed(1)}s`;
  return (
    `lag (${s.sampleCount} samples): peak=${s.peakLag ?? 'n/a'}, ` +
    `at emit-end=${s.lagAtEmitEnd ?? 'n/a'}, seconds-to-zero after emit=${zero}`
  );
}
