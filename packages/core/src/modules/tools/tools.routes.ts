// Ported from apps/api/src/routes/tools.router.ts +
// apps/api/src/controllers/tools.controller.ts (M7-008). V1's Fastify router
// stays the LIVE route (DELEGATE PATTERN) and calls the same
// src/site-checker.ts + src/ip-lookup.ts functions this file does. Both
// routes are hidden from the OpenAPI document, matching V1's
// `schema: { hide: true }`.
//
// NAMED GAP, same as every other module here: not yet reachable — main.ts
// does not mount `publicApiRoutes` until a real `AppDeps` exists (P3/P4/P8).

import { z } from 'zod';
import { defineRoutes } from '../../http/define';
import { runIpLookup } from './src/ip-lookup';
import { runSiteCheck } from './src/site-checker';

const TAGS = ['Tools'];

export const toolsRoutes = defineRoutes((app) =>
  app
    .get(
      '/site-checker',
      async ({ query, ctx, status }) => {
        const outcome = await runSiteCheck(query.url, ctx.headers, ctx.logger);
        if (outcome.status !== 200) {
          return status(outcome.status, { error: outcome.error });
        }
        return outcome.result;
      },
      {
        query: z.object({ url: z.string().optional() }),
        detail: { tags: TAGS, hide: true },
      }
    )
    .get(
      '/ip-lookup',
      async ({ query, ctx, status }) => {
        const outcome = await runIpLookup(query.ip, ctx.headers, ctx.logger);
        if (outcome.status !== 200) {
          return status(outcome.status, { error: outcome.error });
        }
        return outcome.result;
      },
      {
        query: z.object({ ip: z.string().optional() }),
        detail: { tags: TAGS, hide: true },
      }
    )
);
