import type { FastifyRequest } from 'fastify';
import { recordLegacyEventRequest } from '@/metrics';

/**
 * Counts traffic on the legacy `POST /event` route per client so the deferred
 * removal decision has data (ADR-015 entry 1, reversed).
 *
 * Registered after `clientHook` and before the hooks that can short-circuit
 * the request (`isBotHook`, `subscriptionHook`), for two reasons: the label
 * can then only ever be a client id that exists in the database — an
 * unauthenticated caller must not be able to mint prometheus label values —
 * and a client whose events are dropped as bot/wind-down traffic is still a
 * client that would break if `/event` disappeared.
 */
export async function legacyEventUsageHook(request: FastifyRequest) {
  const clientId = request.client?.id;

  if (clientId) {
    recordLegacyEventRequest(clientId);
  }
}
