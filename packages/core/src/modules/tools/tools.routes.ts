// Both routes stay unauthenticated and hidden from the OpenAPI document,
// deliberately.

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
