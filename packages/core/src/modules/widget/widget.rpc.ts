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
// `clix` is a value import and stays one: it is a pure query BUILDER that
// takes the client as its first argument (`clix(ctx.ch, timezone)`), not a
// connection — same standing as ADR-013's `sql` tag (see shared/ch-query.ts).

import { clix } from '@openpanel/db/src/clickhouse/query-builder';
import ShortUniqueId from 'short-unique-id';
import { z } from 'zod';
import type { Ctx } from '../../context';
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '../../rpc/base';
import { TRPCAccessError, TRPCNotFoundError } from '../../rpc/errors';
import { TABLE_NAMES } from '../../shared/ch-tables';
import { getSettingsForProject } from '../organization/organization.service';
import { zWidgetOptions, zWidgetType } from '../report/report.constants';

const uid = new ShortUniqueId({ length: 6 });
const BADGE_CACHE_TTL_SECONDS = 5 * 60; // queries 30 days of data

function loadCache() {
  return import('@openpanel/redis').then((m) => m.getCache);
}

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
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
      requireLogin(ctx.session.userId);
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
      requireLogin(ctx.session.userId);
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
      requireLogin(ctx.session.userId);
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
      const ch = ctx.ch;
      const getCache = await loadCache();

      // Cache for 5 minutes since this queries 30 days of data
      const cacheKey = `widget:badge:${projectId}`;
      const visitors = await getCache(
        cacheKey,
        BADGE_CACHE_TTL_SECONDS,
        async () => {
          const uniqueVisitorsQuery = clix(ch, timezone)
            .select<{ count: number }>(['uniq(profile_id) as count'])
            .from(TABLE_NAMES.events)
            .where('project_id', '=', projectId)
            .where('created_at', '>=', clix.exp('now() - INTERVAL 30 DAY'));

          const result = await uniqueVisitorsQuery.execute();
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
      const ch = ctx.ch;

      // Always fetch live count and histogram
      const totalSessionsQuery = clix(ch, timezone)
        .select<{ total_sessions: number }>([
          'uniq(session_id) as total_sessions',
        ])
        .from(TABLE_NAMES.events)
        .where('project_id', '=', projectId)
        .where('created_at', '>=', clix.exp('now() - INTERVAL 30 MINUTE'));

      const minuteCountsQuery = clix(ch, timezone)
        .select<{
          minute: string;
          session_count: number;
          visitor_count: number;
        }>([
          `${clix.toStartOf('created_at', 'minute')} as minute`,
          'uniq(session_id) as session_count',
          'uniq(profile_id) as visitor_count',
        ])
        .from(TABLE_NAMES.events)
        .where('project_id', '=', projectId)
        .where('created_at', '>=', clix.exp('now() - INTERVAL 30 MINUTE'))
        .groupBy(['minute'])
        .orderBy('minute', 'ASC')
        .fill(
          clix.exp('toStartOfMinute(now() - INTERVAL 30 MINUTE)'),
          clix.exp('toStartOfMinute(now())'),
          clix.exp('INTERVAL 1 MINUTE')
        );

      // Conditionally fetch countries
      const countriesQueryPromise = options.countries
        ? clix(ch, timezone)
            .select<{
              country: string;
              count: number;
            }>(['country', 'uniq(session_id) as count'])
            .from(TABLE_NAMES.events)
            .where('project_id', '=', projectId)
            .where('created_at', '>=', clix.exp('now() - INTERVAL 30 MINUTE'))
            .where('country', '!=', '')
            .where('country', 'IS NOT NULL')
            .groupBy(['country'])
            .orderBy('count', 'DESC')
            .limit(10)
            .execute()
        : Promise.resolve<Array<{ country: string; count: number }>>([]);

      // Conditionally fetch referrers
      const referrersQueryPromise = options.referrers
        ? clix(ch, timezone)
            .select<{ referrer: string; count: number }>([
              'referrer_name as referrer',
              'uniq(session_id) as count',
            ])
            .from(TABLE_NAMES.events)
            .where('project_id', '=', projectId)
            .where('created_at', '>=', clix.exp('now() - INTERVAL 30 MINUTE'))
            .where('referrer_name', '!=', '')
            .where('referrer_name', 'IS NOT NULL')
            .groupBy(['referrer_name'])
            .orderBy('count', 'DESC')
            .limit(10)
            .execute()
        : Promise.resolve<Array<{ referrer: string; count: number }>>([]);

      // Conditionally fetch paths
      const pathsQueryPromise = options.paths
        ? clix(ch, timezone)
            .select<{ path: string; count: number }>([
              'path',
              'uniq(session_id) as count',
            ])
            .from(TABLE_NAMES.events)
            .where('project_id', '=', projectId)
            .where('created_at', '>=', clix.exp('now() - INTERVAL 30 MINUTE'))
            .where('path', '!=', '')
            .where('path', 'IS NOT NULL')
            .groupBy(['path'])
            .orderBy('count', 'DESC')
            .limit(10)
            .execute()
        : Promise.resolve<Array<{ path: string; count: number }>>([]);

      const [totalSessions, minuteCounts, countries, referrers, paths] =
        await Promise.all([
          totalSessionsQuery.execute(),
          minuteCountsQuery.execute(),
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
