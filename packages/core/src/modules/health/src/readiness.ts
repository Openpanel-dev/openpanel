// The `/healthz/ready` decision, kept pure so it can be asserted without a
// server.
//
// Shallow + shutdown-aware, and — only where this process runs the events
// consumer — heartbeat-aware. `enabled` stays false unless the role actually
// started the consumer, so an instance with no events worker never fails
// readiness on a heartbeat that was never real.

import { getEventsHeartbeat } from '../../ingest/src/heartbeat';
import { isBooting, isShuttingDown } from './shutdown';

export const EVENTS_HEARTBEAT_STALE_MS = 60_000;

export type ReadinessResult =
  | { ready: true }
  | { ready: false; reason: string; idleMs?: number; thresholdMs?: number };

export interface ReadinessInputs {
  booting: boolean;
  shuttingDown: boolean;
  heartbeat: { enabled: boolean; lastActivityAt: number };
  now: number;
}

/** Pure: every branch is a value, so the probe's rules are unit-testable. */
export function evaluateReadiness({
  booting,
  shuttingDown,
  heartbeat,
  now,
}: ReadinessInputs): ReadinessResult {
  if (shuttingDown) {
    return { ready: false, reason: 'shutting down' };
  }

  if (booting) {
    return { ready: false, reason: 'booting' };
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
    booting: isBooting(),
    shuttingDown: isShuttingDown(),
    heartbeat: getEventsHeartbeat(),
    now: Date.now(),
  });
}
