// The root chain, as named Elysia plugins.
//
// The order is cors -> requestId -> timestamp -> ip, and it precedes every
// route-level hook including the rate limiters. `requestContext` composes
// these three in that order, and `main.ts` mounts `@elysiajs/cors` ahead of
// it. The cors position is structural rather than conventional — it runs at
// `onRequest`, a strictly earlier lifecycle phase than `derive`, so it cannot
// be reordered by accident.
//
// The request-logging hook lives with `requestContext` in ./context.ts: it
// reads the request logger off `ctx` and would otherwise import this file's
// consumer.

import { generateId } from '@openpanel/shared';
import { Elysia } from 'elysia';
import type { IpHeaderConfig } from '../config';
import { REQUEST_ID_HEADER, REQUEST_ID_LENGTH } from '../logger';
import { getClientIpFromHeaders } from '../shared/get-client-ip';
import { sanitizeRequestId } from '../shared/request-id';

/**
 * First of the three. `requestIdFromCaller` is not decoration: it keeps a
 * caller-supplied id out of per-event log sampling, so the support case that
 * supplied one still resolves.
 */
export function requestIdHook() {
  return new Elysia({ name: 'core/http/request-id' }).derive(
    { as: 'global' },
    ({ request }) => {
      const supplied = sanitizeRequestId(
        request.headers.get(REQUEST_ID_HEADER)
      );
      return {
        requestId: supplied ?? generateId(undefined, REQUEST_ID_LENGTH),
        requestIdFromCaller: supplied !== null,
      };
    }
  );
}

/** `/track` ages an event against arrival with this timestamp. */
export function timestampHook() {
  return new Elysia({ name: 'core/http/timestamp' }).derive(
    { as: 'global' },
    () => ({ timestamp: Date.now() })
  );
}

/**
 * Resolves the *attribution* ip, including the empty-string fallback: it
 * prefers client-forwarded headers, which is right for analytics and fatal
 * for a rate-limit bucket. The limiter keys on `openpanel-client-id` and then
 * `getTrustedIpFromHeaders`, and must never read this.
 */
export function clientIpHook(ipHeaders: IpHeaderConfig) {
  return new Elysia({ name: 'core/http/client-ip' }).derive(
    { as: 'global' },
    ({ request }) => {
      const { ip, header } = getClientIpFromHeaders(ipHeaders, request.headers);
      return { clientIp: ip, clientIpHeader: header };
    }
  );
}
