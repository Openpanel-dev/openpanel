// Consumer-loop heartbeat, scoped to the events queue.
//
// Enabled only on instances that run events workers. Refreshed on each events
// worker's `completed` (job processed) or `drained` (poll returned empty), so
// a healthy consumer loop refreshes the timestamp every ~blockingTimeoutSec
// regardless of traffic. If enabled and the timestamp goes stale past the
// readiness threshold, the events consumer is wedged.

let enabled = false;
let lastActivityAt = Date.now();

export function enableEventsHeartbeat() {
  enabled = true;
  lastActivityAt = Date.now();
}

export function markEventsActivity() {
  lastActivityAt = Date.now();
}

export function getEventsHeartbeat() {
  return { enabled, lastActivityAt };
}
