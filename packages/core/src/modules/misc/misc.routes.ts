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
          await insertPingRecord(ctx, body);
          return { message: 'Success', count: body.count, domain: body.domain };
        } catch (error) {
          ctx.logger.error({ err: error }, 'Failed to insert ping');
          return status(500, { error: 'Failed to insert ping' });
        }
      },
      { body: zPingBody, detail: { tags: TAGS } }
    )
    .get('/misc/stats', ({ ctx }) => getStats(ctx), { detail: { tags: TAGS } })
    .get(
      '/misc/favicon',
      async ({ query, ctx, set }) => {
        const result = await getFavicon(ctx.config, query.url, ctx.logger);
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
        const result = await getOgImage(ctx.config, query.url, ctx.logger);
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
        const report = await getGeoReport(ctx.config, ctx.headers);
        if (!report.ok) {
          return status(400, 'Bad Request');
        }
        return { selected: report.selected, ...report.others };
      },
      { detail: { tags: TAGS } }
    )
);
