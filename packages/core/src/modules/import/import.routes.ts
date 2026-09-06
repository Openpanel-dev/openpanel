// Ported from apps/api/src/routes/import.router.ts +
// apps/api/src/controllers/import.controller.ts's business logic (M5-004).
// V1's Fastify controller stays the LIVE route (DELEGATE PATTERN) and
// delegates its ClickHouse insert to import.service.ts's
// `insertRawEventsBatch` — the same function this route calls.
//
// NAMED GAP, same as gsc.routes.ts: this route is not yet reachable.
// `authenticateClient` (http/client-auth.ts) is a P8 stub that always
// returns null, so `clientAuth` 401s every request until it is filled in;
// main.ts also does not mount `publicApiRoutes` until a real `AppDeps`
// exists. `allow: ['read', 'root']` mirrors V1's rule (utils/auth.ts's
// `validateImportRequest`: a `write`-type client may not import).
//
// V1 has no request-body schema for this route (ADR-003: "/profile,
// /import, /event and /tools have no request schemas today, and adding them
// would be a behaviour change"), so the body is typed but not shape-validated.
//
// `client.projectId` is `null` for a root client (M6-002 widened
// AuthenticatedClient to match IServiceClientWithProject); V1's controller
// guards on exactly this (apps/api/src/controllers/import.controller.ts:17-18),
// ported verbatim.

import { z } from 'zod';
import { defineRoutes } from '../../http/define';
import type { IClickhouseEvent } from '../event/event.service';
import { insertRawEventsBatch } from './import.service';

export const importRoutes = defineRoutes((app) =>
  app.post(
    '/import/events',
    async ({ body, client, ctx, status }) => {
      if (!client.projectId) {
        return status(400, 'Missing project id');
      }

      try {
        const { writtenRows } = await insertRawEventsBatch(
          ctx,
          client.projectId,
          body as IClickhouseEvent[]
        );
        ctx.logger.info({ writtenRows }, 'events imported');
        return 'OK';
      } catch (error) {
        ctx.logger.error({ err: error }, 'Failed to import events');
        return status(500, 'Error');
      }
    },
    {
      clientAuth: { allow: ['read', 'root'], label: 'Import' },
      body: z.array(z.unknown()),
      detail: {
        tags: ['Import'],
        description: 'Bulk import historical events.',
      },
    }
  )
);
