// The root chain, as named Elysia plugins.
//
// V1's order is cors -> requestId -> timestamp -> ip, and it precedes every
// route-level hook including the rate limiters (apps/api/src/app.ts:130-133;
// ADR-002 "behaviour that must be preserved explicitly" 2). Here it is `.use()`
// order: `requestContext` composes these three in that order and `app.ts`
// mounts `@elysiajs/cors` ahead of it. The cors position is structural rather
// than conventional — it runs at `onRequest`, a strictly earlier lifecycle
// phase than `derive`, so it cannot be reordered by accident.
//
// The request-logging hook lives with `requestContext` in ./context.ts: it
// reads the request logger off `ctx` and would otherwise import this file's
// consumer.

import { getClientIpFromHeaders } from '@openpanel/common/server/get-client-ip';
import { Elysia } from 'elysia';
import { REQUEST_ID_HEADER, REQUEST_ID_LENGTH } from '../logger';
import { generateId } from '../shared/id';

// ADR-018 R2: an inbound request-id is honoured but never trusted verbatim —
// it reaches log storage and a log search.
const DISALLOWED_REQUEST_ID_CHARS = /[^A-Za-z0-9_-]/g;
const REQUEST_ID_MAX_LENGTH = 64;

export function sanitizeRequestId(candidate: string | null): string | null {
  if (!candidate) {
    return null;
  }
  const cleaned = candidate
    .replace(DISALLOWED_REQUEST_ID_CHARS, '')
    .slice(0, REQUEST_ID_MAX_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * First of the three. `requestIdFromCaller` is not decoration: ADR-018 R6
 * keeps a caller-supplied id out of per-event log sampling, so the support
 * case that supplied one still resolves.
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

/** V1's timestampHook. `/track` ages an event against arrival with it. */
export function timestampHook() {
  return new Elysia({ name: 'core/http/timestamp' }).derive(
    { as: 'global' },
    () => ({ timestamp: Date.now() })
  );
}

/**
 * V1's ipHook, including the empty-string fallback.
 *
 * This is the *attribution* ip: it prefers client-forwarded headers, which is
 * right for analytics and fatal for a rate-limit bucket. The limiter keys on
 * `openpanel-client-id` and then `getTrustedIpFromHeaders`, and must never
 * read this (ADR-002 "behaviour that must be preserved explicitly" 2).
 */
export function clientIpHook() {
  return new Elysia({ name: 'core/http/client-ip' }).derive(
    { as: 'global' },
    ({ request }) => {
      const { ip, header } = getClientIpFromHeaders(request.headers);
      return { clientIp: ip, clientIpHeader: header };
    }
  );
}
