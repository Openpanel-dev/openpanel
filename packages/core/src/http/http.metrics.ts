// Route duration histogram and summary with names, help text, labels and unit
// that existing dashboards depend on. The `route` label value is Elysia's route
// pattern. HEAD and OPTIONS are excluded and only a matched route is observed,
// so a 404 produces no series.

import { Elysia } from 'elysia';
import client from 'prom-client';
import { registry } from '../metrics';

const DURATION_HELP = 'request duration in seconds';
const SUMMARY_HELP = 'request duration in seconds summary';
const LABEL_NAMES = ['method', 'route', 'status_code'] as const;
const UNMEASURED_METHODS = new Set(['HEAD', 'OPTIONS']);
// Elysia's `route` for a request that matched no route; observing it would
// create unbounded label cardinality.
const UNMATCHED_ROUTES = new Set(['', '/*']);
const MS_PER_SECOND = 1000;
// Elysia leaves `set.status` unset on a plain successful return.
const DEFAULT_STATUS = 200;
const DROPPED_HELP =
  'http request samples dropped before observation because the measured duration was not a finite number of milliseconds >= 0';

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: DURATION_HELP,
  labelNames: LABEL_NAMES,
  registers: [registry],
});

export const httpRequestSummary = new client.Summary({
  name: 'http_request_summary_seconds',
  help: SUMMARY_HELP,
  labelNames: LABEL_NAMES,
  registers: [registry],
});

// prom-client's `.observe()` throws on a non-finite value, and in an async hook
// that becomes an unhandled rejection that exits the process; count instead.
export const httpRequestSamplesDropped = new client.Counter({
  name: 'http_request_metrics_dropped_total',
  help: DROPPED_HELP,
  registers: [registry],
});

function isMeasuredDuration(durationMs: unknown): durationMs is number {
  return (
    typeof durationMs === 'number' &&
    Number.isFinite(durationMs) &&
    durationMs >= 0
  );
}

/** Observes one request; drops (and counts) a sample it cannot observe. */
export function observeHttpRequest(sample: {
  method: string;
  // Elysia types this `string` but passes `undefined` for an unmatched route.
  route: string | undefined;
  statusCode: number;
  durationMs: number;
}): void {
  if (UNMEASURED_METHODS.has(sample.method)) {
    return;
  }
  if (!sample.route || UNMATCHED_ROUTES.has(sample.route)) {
    return;
  }
  if (!isMeasuredDuration(sample.durationMs)) {
    httpRequestSamplesDropped.inc();
    return;
  }

  const labels = {
    method: sample.method,
    route: sample.route,
    status_code: sample.statusCode,
  };
  const seconds = sample.durationMs / MS_PER_SECOND;

  httpRequestDuration.observe(labels, seconds);
  httpRequestSummary.observe(labels, seconds);
}

/**
 * `onAfterResponse` rather than `onAfterHandle`: an error mapped to 4xx/5xx by
 * the error handler never reaches `onAfterHandle`, which would drop every
 * error-status bucket.
 *
 * The start time rides on a `derive`, not `store`, which is shared by all
 * in-flight requests. A request that matched no route has no `derive`d clock,
 * so the global hook skips it.
 */
export function httpMetrics() {
  return new Elysia({ name: 'core/http/metrics' })
    .derive({ as: 'global' }, () => ({ metricsStartedAt: performance.now() }))
    .onAfterResponse(
      { as: 'global' },
      ({ request, route, set, metricsStartedAt }) => {
        if (!isMeasuredDuration(metricsStartedAt)) {
          return;
        }
        observeHttpRequest({
          method: request.method,
          route,
          statusCode:
            typeof set.status === 'number' ? set.status : DEFAULT_STATUS,
          durationMs: performance.now() - metricsStartedAt,
        });
      }
    );
}
