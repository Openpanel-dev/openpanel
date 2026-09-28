// The whole of the P9 cutover. There is no dual-write window, no drain and no
// queue rename: a job enqueued by V1 is read back by V2 through these hooks. A
// wrong one is silent job loss, which is why the tests next to this file were
// written before it.

import type { CompatHook } from './define';
import { isEnvelope, type JobMeta } from './envelope';

export interface ResolvedJob {
  /** The V2 job name — a key in the queue definition's `jobs`. */
  job: string;
  payload: unknown;
  meta: JobMeta;
}

const NO_META: JobMeta = {};

/**
 * Envelope or legacy, one answer. Throws on anything neither path recognises:
 * V1's cron `switch` had no `default` and completed an unknown type having done
 * nothing, which is the failure mode this replaces (ADR-005 risk 2).
 */
export function resolveJob(
  definition: { name: string; compat?: CompatHook },
  job: { name: string; data: unknown }
): ResolvedJob {
  if (isEnvelope(job.data)) {
    return { job: job.name, payload: job.data.payload, meta: job.data.meta };
  }

  const resolved = definition.compat?.(job.data);
  if (!resolved) {
    throw new Error(
      `Queue '${definition.name}' cannot resolve job '${job.name}': not an envelope, and no compat hook matched its data`
    );
  }

  return { ...resolved, meta: NO_META };
}

function asRecord(data: unknown): Record<string, unknown> | undefined {
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : undefined;
}

/** The four queues whose legacy data is `{type, payload}` and whose wire job name IS the type. */
function discriminatedByType(types: readonly string[]): CompatHook {
  return (data) => {
    const record = asRecord(data);
    const type = record?.type;
    if (typeof type !== 'string' || !types.includes(type)) {
      return undefined;
    }
    return { job: type, payload: record?.payload };
  };
}

/**
 * One hook per queue, keyed by registry key. Each is deletable on its own — but
 * not until no legacy-shaped job can still be replayed, and four queues have no
 * `removeOnFail` at all, so their failed sets never lapse (ADR-005 risk 1).
 */
export const legacyCompat = {
  // Job name `'session'`, payload type `'createSessionEnd'` — the one queue
  // where the two genuinely differ. `snapshot` sat beside `payload` on the
  // wire; it moves inside, unchanged.
  sessions: ((data) => {
    const record = asRecord(data);
    if (record?.type !== 'createSessionEnd') {
      return undefined;
    }
    return {
      job: 'session',
      payload: { event: record.payload, snapshot: record.snapshot },
    };
  }) satisfies CompatHook,

  // The scheduler id, the payload type and the BullMQ job name are all the
  // same string. `payload` was always undefined and JSON dropped it.
  cron: ((data) => {
    const type = asRecord(data)?.type;
    return typeof type === 'string' ? { job: type, payload: null } : undefined;
  }) satisfies CompatHook,

  notification: discriminatedByType(['sendNotification']),
  import: discriminatedByType(['import']),
  insights: discriminatedByType(['insightsProject']),
  gsc: discriminatedByType(['gscProjectSync', 'gscProjectBackfill']),

  // The only V1 payload with no discriminant at all.
  cohortCompute: ((data) => {
    const record = asRecord(data);
    return typeof record?.cohortId === 'string'
      ? { job: 'cohortCompute', payload: record }
      : undefined;
  }) satisfies CompatHook,
} as const;
