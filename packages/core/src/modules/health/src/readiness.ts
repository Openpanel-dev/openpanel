// V1's `/healthz/ready` decision, lifted out of the express handler
// (apps/worker/src/index.ts) so it can be asserted without a server.
//
// Shallow + shutdown-aware, and — only where this process runs the events
// consumer — heartbeat-aware. V1 skipped the heartbeat check on instances
// with no events worker; V2 keeps that by leaving `enabled` false unless the
// role actually started the consumer.

import { getEventsHeartbeat } from '../../ingest/src/heartbeat';
import { isShuttingDown } from './shutdown';

/** V1's threshold (apps/worker/src/index.ts `EVENTS_HEARTBEAT_STALE_MS`). */
export const EVENTS_HEARTBEAT_STALE_MS = 60_000;

export type ReadinessResult =
  | { ready: true }
  | { ready: false; reason: string; idleMs?: number; thresholdMs?: number };

export interface ReadinessInputs {
  shuttingDown: boolean;
  heartbeat: { enabled: boolean; lastActivityAt: number };
  now: number;
}

/** Pure: every branch is a value, so the probe's rules are unit-testable. */
export function evaluateReadiness({
  shuttingDown,
  heartbeat,
  now,
}: ReadinessInputs): ReadinessResult {
  if (shuttingDown) {
    return { ready: false, reason: 'shutting down' };
  }

  if (!heartbeat.enabled) {
    return { ready: true };
  }

  const idleMs = now - heartbeat.lastActivityAt;
  if (idleMs > EVENTS_HEARTBEAT_STALE_MS) {
    return {
      ready: false,
      reason: 'events consumer heartbeat stale',
      idleMs,
      thresholdMs: EVENTS_HEARTBEAT_STALE_MS,
    };
  }

  return { ready: true };
}

export function currentReadiness(): ReadinessResult {
  return evaluateReadiness({
    shuttingDown: isShuttingDown(),
    heartbeat: getEventsHeartbeat(),
    now: Date.now(),
  });
}
