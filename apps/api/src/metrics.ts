import client from 'prom-client';

/**
 * Metrics owned by the API process.
 *
 * `fastify-metrics` serves prom-client's global registry at `/metrics`
 * (fastify-metrics `exposeMetrics()` reads `client.register`), and prom-client
 * metrics register themselves there on construction — so declaring a metric in
 * this module is all that is needed to expose it. It resolves to the same
 * physical `prom-client` package fastify-metrics loads, which is what makes
 * one shared registry possible.
 */

const LEGACY_EVENT_CLIENT_ID_LABEL = 'client_id';

/**
 * ADR-015 entry 1 was reversed: `POST /event` is kept as a legacy compat route
 * rather than deleted, because production still has projects posting to it.
 * This counter is the evidence the deferred removal decision needs — when it
 * reads zero for every client, `/event` and the `mixan-*` header fallback can
 * both go (ADR-015 entry 5 is pending the same measurement).
 */
export const legacyEventRequestsTotal = new client.Counter({
  name: 'openpanel_legacy_event_requests_total',
  help: 'Requests to the legacy POST /event ingestion route, by client id',
  labelNames: [LEGACY_EVENT_CLIENT_ID_LABEL],
});

export function recordLegacyEventRequest(clientId: string) {
  legacyEventRequestsTotal.inc({ [LEGACY_EVENT_CLIENT_ID_LABEL]: clientId });
}
