// The root chain: cors -> requestId -> timestamp -> ip, before every route-level
// hook including the rate limiters. cors runs at `onRequest`, an earlier phase
// than `derive`, so its position cannot be reordered by accident. The
// request-logging hook lives in ./context.ts because it reads the request
// logger off `ctx`.

import { generateId } from '@openpanel/shared';
import { Elysia } from 'elysia';
import type { IpHeaderConfig } from '../config';
import { REQUEST_ID_HEADER, REQUEST_ID_LENGTH } from '../logger';
import { getClientIpFromHeaders } from '../shared/get-client-ip';
import { sanitizeRequestId } from '../shared/request-id';

/**
 * `requestIdFromCaller` keeps a caller-supplied id out of per-event log
 * sampling, so the support case that supplied one still resolves.
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
 * Resolves the *attribution* ip, which prefers client-forwarded headers: right
 * for analytics, fatal for a rate-limit bucket. Limiters must never read this.
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
