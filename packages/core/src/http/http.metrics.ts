// `fastify-metrics`'s two route series, re-created on Elysia so the metric
// names, help text and labels are reproduced exactly. The plugin itself dies
// with Fastify, so these are ours now.
//
// What "reproduced exactly" pins, from fastify-metrics 12.1.0's own source
// (dist/fastify-metrics.js:181-210, 258-290):
//
// * names `http_request_duration_seconds` (histogram) and
// `http_request_summary_seconds` (summary) * help "request duration in seconds"
// / "... summary" * labels `method`, `route`, `status_code`, in that order *
// unit SECONDS. prom-client's `startTimer` observes seconds; a milliseconds
// observation on the same series silently multiplies every existing percentile
// by 1000. * scope HEAD and OPTIONS are excluded (fastify-metrics' default
// `methodBlacklist`), and only a MATCHED route is observed
// (`registeredRoutesOnly` defaults true) — so a 404 produces no series, exactly
// as today.
//
// The `route` label VALUE moves, because it is the framework's own route
// pattern and the framework changed. That is the one thing a dashboard owner
// has to act on; the old->new mapping is
// `packages/core/docs/OPS_GRAFANA_MIGRATION.md`.

import { Elysia } from 'elysia';
import client from 'prom-client';
import { registry } from '../metrics';

const DURATION_HELP = 'request duration in seconds';
const SUMMARY_HELP = 'request duration in seconds summary';
const LABEL_NAMES = ['method', 'route', 'status_code'] as const;
// fastify-metrics' `methodBlacklist` default (dist/fastify-metrics.js:63-66).
const UNMEASURED_METHODS = new Set(['HEAD', 'OPTIONS']);
// Elysia's `route` for a request that matched no route. Observing it would
// create the unbounded-cardinality series `registeredRoutesOnly` avoids.
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

// A bad sample must never take the process down, but it must not vanish
// either: prom-client's `.observe()` throws on a non-finite value, and in an
// async hook that throw becomes an unhandled rejection and exits the process.
export const httpRequestSamplesDropped = new client.Counter({
  name: 'http_request_metrics_dropped_total',
  help: DROPPED_HELP,
  registers: [registry],
});

/** The one shape prom-client will accept: finite, and not a negative elapsed. */
function isMeasuredDuration(durationMs: unknown): durationMs is number {
  return (
    typeof durationMs === 'number' &&
    Number.isFinite(durationMs) &&
    durationMs >= 0
  );
}

/**
 * Observes a single request. Exported so a test can assert the labels and the
 * unit without standing up a server.
 *
 * Drops, rather than throws on, a sample it cannot observe — see
 * `httpRequestSamplesDropped`.
 */
export function observeHttpRequest(sample: {
  method: string;
  // Elysia types this `string`, but hands the hook `undefined` when the
  // request matched no route.
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
 * The one hook. `onAfterResponse` rather than `onAfterHandle` because
 * fastify-metrics observed in `onResponse`: an error mapped to a 4xx/5xx by
 * the error handler never reaches `onAfterHandle`, and dropping those samples
 * would quietly remove every error-status bucket the existing panels group by.
 *
 * The start time rides on a `derive`, not on `store` — `store` is app-level
 * state shared by every in-flight request, so a second concurrent request
 * would overwrite the first one's clock.
 *
 * A `derive` runs per MATCHED route; this hook is global and also runs for a
 * request that matched nothing, where `metricsStartedAt` and `route` are both
 * `undefined`. Such a request has no clock and no route pattern to label, and
 * `registeredRoutesOnly` says not to observe it anyway — so the hook skips,
 * ahead of computing an elapsed against `undefined`.
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
