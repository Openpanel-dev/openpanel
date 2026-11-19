// The one prom-client registry for the whole process.

import client from 'prom-client';

export const registry = new client.Registry();

// `collectDefaultMetrics` registers a fixed set of series names; prom-client
// throws on a duplicate, so a second call would take the process down at boot.
let defaultMetricsRegistered = false;

/**
 * prom-client's Node-derived process/GC collectors, on the one registry.
 * Called once per process, in every role.
 */
export function registerDefaultMetrics(): void {
  if (defaultMetricsRegistered) {
    return;
  }
  defaultMetricsRegistered = true;
  client.collectDefaultMetrics({ register: registry });
}
