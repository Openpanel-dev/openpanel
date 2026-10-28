// Operator memory diagnostics, on every role (workers serve no other HTTP).
// Behind ADMIN_USERNAME / ADMIN_PASSWORD alone, so curl and a scrape-side
// script can reach a worker replica that has no dashboard session to offer.
//
// A request lands on one replica. `POST /admin/memory/gc?all=1` fans out over
// Redis pubsub instead, and each process logs its own result.

import { publishEvent, subscribeToPublishedEvent } from '@openpanel/redis';
import { Elysia } from 'elysia';
import { z } from 'zod';
import type { AppDeps } from '../context';
import type { BasicAuthCredentials } from '../shared/basic-auth';
import { basicAuthChallenge, matchesBasicAuth } from '../shared/basic-auth';
import {
  collectGarbage,
  generateHeapSnapshot,
  readMemorySnapshot,
} from '../shared/memory';

export const MEMORY_ROUTES_BASE_PATH = '/admin/memory';

const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
// What a browser sends for a request another site's page started. curl sends
// no `sec-fetch-site`, and opening the URL directly sends `none`.
const CROSS_ORIGIN_FETCH_SITES = new Set(['cross-site', 'same-site']);
const MEMORY_REALM = 'OpenPanel ops';
const HIDDEN = { hide: true } as const;
const MAX_TOP_OBJECT_TYPES = 200;

const snapshotQuery = z.object({
  top: z.coerce.number().int().min(1).max(MAX_TOP_OBJECT_TYPES).optional(),
});
const gcQuery = z.object({ all: z.enum(['1', 'true']).optional() });

export function memoryRoutes(deps: AppDeps, adminAuth: BasicAuthCredentials) {
  const { logger } = deps;
  let stopListening: (() => void) | undefined;

  return new Elysia({
    name: 'core/http/memory',
    prefix: MEMORY_ROUTES_BASE_PATH,
  })
    .onStart(() => {
      stopListening = subscribeToPublishedEvent(
        'ops',
        'garbage_collect',
        ({ requestedAt }) => {
          logger.info(
            { requestedAt, ...collectGarbage() },
            'Garbage collection requested by broadcast'
          );
        }
      );
    })
    .onStop(() => {
      stopListening?.();
    })
    .onBeforeHandle(({ request, set, status }) => {
      // A browser attaches cached Basic credentials to another page's request,
      // so without this any site could trigger a gc (CSRF).
      const fetchSite = request.headers.get('sec-fetch-site');
      if (fetchSite && CROSS_ORIGIN_FETCH_SITES.has(fetchSite)) {
        return status(FORBIDDEN);
      }
      if (matchesBasicAuth(request.headers.get('authorization'), adminAuth)) {
        return;
      }
      set.headers = { ...set.headers, ...basicAuthChallenge(MEMORY_REALM) };
      return status(UNAUTHORIZED);
    })
    .get('/', async ({ query }) => await readMemorySnapshot(query.top), {
      query: snapshotQuery,
      detail: HIDDEN,
    })
    .post(
      '/gc',
      async ({ query }) => {
        if (query.all) {
          const receivers = await publishEvent('ops', 'garbage_collect', {
            requestedAt: new Date().toISOString(),
          });
          return {
            broadcast: true,
            receivers,
            message:
              'Each process logs "Garbage collection requested by broadcast" with its own before/after.',
          };
        }
        const result = collectGarbage();
        logger.info({ ...result }, 'Garbage collection requested over HTTP');
        return result;
      },
      { query: gcQuery, detail: HIDDEN }
    )
    .get(
      '/heap-snapshot',
      ({ set }) => {
        const snapshot = generateHeapSnapshot();
        set.headers['content-type'] = 'application/json';
        set.headers['content-disposition'] =
          `attachment; filename="heap-${Date.now()}.heapsnapshot"`;
        return snapshot;
      },
      { detail: HIDDEN }
    );
}
