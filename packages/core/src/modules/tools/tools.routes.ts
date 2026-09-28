// Ported from apps/api/src/routes/tools.router.ts +
// apps/api/src/controllers/tools.controller.ts, calling the same
// src/site-checker.ts + src/ip-lookup.ts functions this file does. Mounted into
// publicApiRoutes since M9-004; both routes stay unauthenticated (V1's shape)
// and hidden from the OpenAPI document, matching V1's `schema: { hide: true }`.
//
// The `/tools` prefix is spelled out here. V1 got it from
// `instance.register(toolsRouter, { prefix: '/tools' })` (app.ts:386) over a
// router whose own urls were bare, and `defineRoutes` has no prefix mechanism —
// so the port dropped the segment and both routes answered at the root.
// apps/public's own pages call `${API_URL}/tools/ip-lookup` and
// `/tools/site-checker`, so they were 404ing.

import { z } from 'zod';
import { defineRoutes } from '../../http/define';
import { runIpLookup } from './src/ip-lookup';
import { runSiteCheck } from './src/site-checker';

const TAGS = ['Tools'];

export const toolsRoutes = defineRoutes((app) =>
  app
    .get(
      '/tools/site-checker',
      async ({ query, ctx, status }) => {
        const outcome = await runSiteCheck(
          ctx.config,
          query.url,
          ctx.headers,
          ctx.logger
        );
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
      '/tools/ip-lookup',
      async ({ query, ctx, status }) => {
        const outcome = await runIpLookup(
          ctx.config,
          query.ip,
          ctx.headers,
          ctx.logger
        );
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
