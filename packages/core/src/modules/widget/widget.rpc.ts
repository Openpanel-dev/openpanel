// Ported from packages/trpc/src/routers/widget.ts (M7-006, ADR-008's module
// map: widget is R only — its zod schemas (zWidgetType/zWidgetOptions) are
// chart/report vocabulary owned by ./report/report.constants.ts, so this
// module carries no `widget.constants.ts` of its own).
//
// V1's `protectedProcedure`/`publicProcedure` split lands in core with auth
// (rpc/base.ts), so `get`/`toggle`/`updateOptions` do their own "is anyone
// logged in" check and `counter`/`badge`/`realtimeData` stay open, matching
// V1's split exactly. There is no `widget.service.ts` (same shape as
// email.rpc.ts's "R + C only" module): V1's own router keeps its own
// ClickHouse/Postgres calls rather than delegating to a shared service —
// the one genuinely shared piece is the report module's widget zod schemas.
//
// M10-009: Postgres and ClickHouse come from `ctx` (`ctx.db` / `ctx.ch`), so
// the requestId minted at the edge reaches the query (ADR-018); the `loadDb`/
// `loadChClient` lazy loaders are gone. Redis's `getCache` stays lazy: this
// router lands in the eager rpc.router.ts barrel chain nearly every core test
// file reaches and reaching @openpanel/redis at import time breaks a test that
// partially mocks that package — see subscription.service.ts's header.
//
// M12-008: the five ClickHouse statements moved off clix onto the ADR-013
// `sql` tag. The conversion changes how values reach the server and nothing
// else — each statement renders byte-identically to the clix output it
// replaces, with `projectId` bound as a `{pN:String}` param and the two
// `LIMIT`s as `{pN:UInt64}`. The `now() - INTERVAL ...` windows were
// `clix.exp()` raw expressions and stay raw SQL text, parentheses included
// (clix wrapped an Expression comparand in `(...)`, query-builder.ts:134).
// clix sent its constructor timezone as `clickhouse_settings.session_timezone`
// (`:562`); every statement here was built with the project's timezone, so
// `chQuery` is given the same value. The V1-vs-V2 result-set proof is
// `widget.sql.proof.md` beside this file.
//
// `sql` is a value import and stays one: it is a compile-time template tag
// holding no client and no request scope (see ch-query.ts).

import { sql } from '@openpanel/db/src/clickhouse/sql';
import ShortUniqueId from 'short-unique-id';
import { z } from 'zod';
import { chQuery } from '../../ch-query';
import type { Ctx } from '../../context';
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '../../rpc/base';
import { TRPCNotFoundError } from '../../rpc/errors';
import { TABLE_NAMES } from '../../shared/ch-tables';
import { getSettingsForProject } from '../organization/organization.service';
import { zWidgetOptions, zWidgetType } from '../report/report.constants';

const uid = new ShortUniqueId({ length: 6 });
const BADGE_CACHE_TTL_SECONDS = 5 * 60; // queries 30 days of data
const REALTIME_TOP_LIST_LIMIT = 10;

const EVENTS_TABLE = sql.id(TABLE_NAMES.events);
/** `clix.exp('now() - INTERVAL 30 MINUTE')`, parenthesised as clix rendered it. */
const REALTIME_WINDOW = sql`created_at >= (now() - INTERVAL 30 MINUTE)`;

function loadCache() {
  return import('@openpanel/redis').then((m) => m.getCache);
}

// Helper to find widget by projectId and type
async function findWidgetByType(
  db: Ctx['db'],
  projectId: string,
  type: string
) {
  const widgets = await db.shareWidget.findMany({
    where: { projectId },
  });
  return widgets.find(
    (w) => (w.options as z.infer<typeof zWidgetOptions>)?.type === type
  );
}

export const widgetRouter = createTRPCRouter({
  // Get widget by projectId and type (returns null if not found or not public)
  get: protectedProcedure
    .input(z.object({ projectId: z.string(), type: zWidgetType }))
    .query(async ({ input, ctx }) => {
      const widget = await findWidgetByType(
        ctx.db,
        input.projectId,
        input.type
      );

      if (!widget) {
        return null;
      }

      return widget;
    }),

  // Toggle widget public status (creates if doesn't exist)
  toggle: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        organizationId: z.string(),
        type: zWidgetType,
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      const existing = await findWidgetByType(
        ctx.db,
        input.projectId,
        input.type
      );

      if (existing) {
        return db.shareWidget.update({
          where: { id: existing.id },
          data: { public: input.enabled },
        });
      }

      // Create new widget with default options
      const defaultOptions =
        input.type === 'realtime'
          ? {
              type: 'realtime' as const,
              referrers: true,
              countries: true,
              paths: false,
            }
          : { type: 'counter' as const };

      return db.shareWidget.create({
        data: {
          id: uid.rnd(),
          projectId: input.projectId,
          organizationId: input.organizationId,
          public: input.enabled,
          options: defaultOptions,
        },
      });
    }),

  // Update widget options (for realtime widget)
  updateOptions: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        organizationId: z.string(),
        options: zWidgetOptions,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      const existing = await findWidgetByType(
        ctx.db,
        input.projectId,
        input.options.type
      );

      if (existing) {
        return db.shareWidget.update({
          where: { id: existing.id },
          data: { options: input.options },
        });
      }

      // Create new widget if it doesn't exist
      return db.shareWidget.create({
        data: {
          id: uid.rnd(),
          projectId: input.projectId,
          organizationId: input.organizationId,
          public: false,
          options: input.options,
        },
      });
    }),

  counter: publicProcedure
    .input(z.object({ shareId: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db;
      const widget = await db.shareWidget.findUnique({
        where: {
          id: input.shareId,
        },
      });

      if (!widget?.public) {
        throw new TRPCNotFoundError('Widget not found');
      }

      if (widget.options.type !== 'counter') {
        throw new TRPCNotFoundError('Invalid widget type');
      }

      const eventBuffer = ctx.buffers.event;

      return {
        projectId: widget.projectId,
        counter: await eventBuffer.getActiveVisitorCount(widget.projectId),
      };
    }),

  badge: publicProcedure
    .input(z.object({ shareId: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db;
      const widget = await db.shareWidget.findUnique({
        where: {
          id: input.shareId,
        },
      });

      if (!widget?.public) {
        throw new TRPCNotFoundError('Widget not found');
      }

      if (widget.options.type !== 'counter') {
        throw new TRPCNotFoundError('Invalid widget type');
      }

      const { projectId } = widget;
      const { timezone } = await getSettingsForProject(ctx, projectId);
      const getCache = await loadCache();

      // Cache for 5 minutes since this queries 30 days of data
      const cacheKey = `widget:badge:${projectId}`;
      const visitors = await getCache(
        cacheKey,
        BADGE_CACHE_TTL_SECONDS,
        async () => {
          const result = await chQuery<{ count: number }>(
            ctx,
            sql`SELECT uniq(profile_id) as count FROM ${EVENTS_TABLE} WHERE project_id = ${sql.string(projectId)} AND created_at >= (now() - INTERVAL 30 DAY)`,
            { session_timezone: timezone }
          );
          return result[0]?.count || 0;
        }
      );

      return {
        projectId,
        visitors,
      };
    }),

  realtimeData: publicProcedure
    .input(z.object({ shareId: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db;
      // Validate ShareWidget exists and is public
      const widget = await db.shareWidget.findUnique({
        where: {
          id: input.shareId,
        },
        include: {
          project: {
            select: {
              domain: true,
              name: true,
            },
          },
        },
      });

      if (!widget?.public) {
        throw new TRPCNotFoundError('Widget not found');
      }

      const { projectId, options } = widget;

      if (options.type !== 'realtime') {
        throw new TRPCNotFoundError('Invalid widget type');
      }

      const { timezone } = await getSettingsForProject(ctx, projectId);

      // Always fetch live count and histogram
      const settings = { session_timezone: timezone };
      const totalSessionsStatement = sql`SELECT uniq(session_id) as total_sessions FROM ${EVENTS_TABLE} WHERE project_id = ${sql.string(projectId)} AND ${REALTIME_WINDOW}`;

      const minuteCountsStatement = sql`SELECT toStartOfMinute(created_at) as minute, uniq(session_id) as session_count, uniq(profile_id) as visitor_count FROM ${EVENTS_TABLE} WHERE project_id = ${sql.string(projectId)} AND ${REALTIME_WINDOW} GROUP BY minute ORDER BY minute ASC WITH FILL FROM toStartOfMinute(now() - INTERVAL 30 MINUTE) TO toStartOfMinute(now()) STEP INTERVAL 1 MINUTE`;

      // Conditionally fetch countries
      const countriesQueryPromise = options.countries
        ? chQuery<{ country: string; count: number }>(
            ctx,
            sql`SELECT country, uniq(session_id) as count FROM ${EVENTS_TABLE} WHERE project_id = ${sql.string(projectId)} AND ${REALTIME_WINDOW} AND country != '' AND country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT ${sql.uint64(REALTIME_TOP_LIST_LIMIT)}`,
            settings
          )
        : Promise.resolve<Array<{ country: string; count: number }>>([]);

      // Conditionally fetch referrers
      const referrersQueryPromise = options.referrers
        ? chQuery<{ referrer: string; count: number }>(
            ctx,
            sql`SELECT referrer_name as referrer, uniq(session_id) as count FROM ${EVENTS_TABLE} WHERE project_id = ${sql.string(projectId)} AND ${REALTIME_WINDOW} AND referrer_name != '' AND referrer_name IS NOT NULL GROUP BY referrer_name ORDER BY count DESC LIMIT ${sql.uint64(REALTIME_TOP_LIST_LIMIT)}`,
            settings
          )
        : Promise.resolve<Array<{ referrer: string; count: number }>>([]);

      // Conditionally fetch paths
      const pathsQueryPromise = options.paths
        ? chQuery<{ path: string; count: number }>(
            ctx,
            sql`SELECT path, uniq(session_id) as count FROM ${EVENTS_TABLE} WHERE project_id = ${sql.string(projectId)} AND ${REALTIME_WINDOW} AND path != '' AND path IS NOT NULL GROUP BY path ORDER BY count DESC LIMIT ${sql.uint64(REALTIME_TOP_LIST_LIMIT)}`,
            settings
          )
        : Promise.resolve<Array<{ path: string; count: number }>>([]);

      const [totalSessions, minuteCounts, countries, referrers, paths] =
        await Promise.all([
          chQuery<{ total_sessions: number }>(
            ctx,
            totalSessionsStatement,
            settings
          ),
          chQuery<{
            minute: string;
            session_count: number;
            visitor_count: number;
          }>(ctx, minuteCountsStatement, settings),
          countriesQueryPromise,
          referrersQueryPromise,
          pathsQueryPromise,
        ]);

      return {
        projectId,
        liveCount: totalSessions[0]?.total_sessions || 0,
        project: widget.project,
        histogram: minuteCounts.map((item) => ({
          minute: item.minute,
          sessionCount: item.session_count,
          visitorCount: item.visitor_count,
          timestamp: new Date(item.minute).getTime(),
          time: new Date(item.minute).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
        })),
        countries: countries.map((item) => ({
          country: item.country,
          count: item.count,
        })),
        referrers: referrers.map((item) => ({
          referrer: item.referrer,
          count: item.count,
        })),
        paths: paths.map((item) => ({
          path: item.path,
          count: item.count,
        })),
      };
    }),
});
