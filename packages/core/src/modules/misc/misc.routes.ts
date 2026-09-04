// Ported from apps/api/src/routes/misc.router.ts +
// apps/api/src/controllers/misc.controller.ts (M7-008). V1's Fastify router
// stays the LIVE route (DELEGATE PATTERN) and calls the same misc.service.ts
// functions this file does.
//
// `GET /misc/og/clear` and `GET /misc/favicon/clear` are dropped, not ported
// (ADR-015 entry #6: RULED + DEAD — `docs/ANSWERS.md` §1.4 confirms nothing
// depends on them).
//
// NAMED GAP, same as every other module here: not yet reachable — main.ts
// does not mount `dashboardRoutes` until a real `AppDeps` exists (P3/P4/P8).

import { z } from 'zod';
import { defineRoutes } from '../../http/define';
import {
  getFavicon,
  getGeoReport,
  getOgImage,
  getStats,
  insertPingRecord,
} from './misc.service';

const TAGS = ['Misc'];

const zPingBody = z.object({
  domain: z.string(),
  count: z.number(),
});

const zImageQuery = z.object({ url: z.string().optional() });

export const miscRoutes = defineRoutes((app) =>
  app
    .post(
      '/misc/ping',
      async ({ body, ctx, status }) => {
        try {
          await insertPingRecord(body);
          return { message: 'Success', count: body.count, domain: body.domain };
        } catch (error) {
          ctx.logger.error({ err: error }, 'Failed to insert ping');
          return status(500, { error: 'Failed to insert ping' });
        }
      },
      { body: zPingBody, detail: { tags: TAGS } }
    )
    .get('/misc/stats', () => getStats(), { detail: { tags: TAGS } })
    .get(
      '/misc/favicon',
      async ({ query, ctx, set }) => {
        const result = await getFavicon(query.url, ctx.logger);
        set.status = result.status;
        for (const [name, value] of Object.entries(result.headers)) {
          set.headers[name] = value;
        }
        return result.status === 200 ? result.buffer : result.body;
      },
      { query: zImageQuery, detail: { tags: TAGS } }
    )
    .get(
      '/misc/og',
      async ({ query, ctx, set }) => {
        const result = await getOgImage(query.url, ctx.logger);
        set.status = result.status;
        for (const [name, value] of Object.entries(result.headers)) {
          set.headers[name] = value;
        }
        return result.status === 200 ? result.buffer : result.body;
      },
      { query: zImageQuery, detail: { tags: TAGS } }
    )
    .get(
      '/misc/geo',
      async ({ ctx, status }) => {
        const report = await getGeoReport(ctx.headers);
        if (!report.ok) {
          return status(400, 'Bad Request');
        }
        return { selected: report.selected, ...report.others };
      },
      { detail: { tags: TAGS } }
    )
);
