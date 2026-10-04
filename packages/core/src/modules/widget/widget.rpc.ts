// Widgets are read-only chart embeds. Their zod schemas (`zWidgetType` /
// `zWidgetOptions`) are chart/report vocabulary and live in
// ./report/report.constants.ts, so this module carries no constants file of
// its own, and there is no widget.service.ts — the queries are small enough to
// stay in the procedures.
//
// `get`/`toggle`/`updateOptions` require a login; `counter`/`badge`/
// `realtimeData` are deliberately open, because a widget is embedded on a
// public page.
//
// Every statement is built with the project's timezone, so `chQuery` is given
// the same value as `clickhouse_settings.session_timezone`.

import { sql } from '@openpanel/db/src/clickhouse/sql';
import { getCache } from '@openpanel/redis';
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
import {
  zCounterWidgetOptions,
  zRealtimeWidgetOptions,
  zWidgetOptions,
  zWidgetType,
} from '../report/report.constants';

const uid = new ShortUniqueId({ length: 6 });
const BADGE_CACHE_TTL_SECONDS = 5 * 60; // queries 30 days of data
const REALTIME_TOP_LIST_LIMIT = 10;

const EVENTS_TABLE = sql.id(TABLE_NAMES.events);
const REALTIME_WINDOW = sql`created_at >= (now() - INTERVAL 30 MINUTE)`;

async function findWidgetByType(
  db: Ctx['db'],
  projectId: string,
  type: string
) {
  const widgets = await db.shareWidget.findMany({
    where: { projectId },
  });
  return widgets.find((w) => w.options.type === type);
}

// Shared by toggle/updateOptions: same find-then-update-or-create shape,
// differing only in which field is written and the create-time default.
async function upsertWidgetByType(
  db: Ctx['db'],
  params: {
    projectId: string;
    organizationId: string;
    type: z.infer<typeof zWidgetType>;
    update: { public: boolean } | { options: z.infer<typeof zWidgetOptions> };
    create: { public: boolean; options: z.infer<typeof zWidgetOptions> };
  }
) {
  const existing = await findWidgetByType(db, params.projectId, params.type);

  if (existing) {
    return db.shareWidget.update({
      where: { id: existing.id },
      data: params.update,
    });
  }

  return db.shareWidget.create({
    data: {
      id: uid.rnd(),
      projectId: params.projectId,
      organizationId: params.organizationId,
      public: params.create.public,
      options: params.create.options,
    },
  });
}

// Shared by counter/badge: both require the widget to exist, be public and
// be a counter widget before doing anything else.
async function findPublicCounterWidgetOrThrow(db: Ctx['db'], shareId: string) {
  const widget = await db.shareWidget.findUnique({
    where: { id: shareId },
  });

  if (!widget?.public) {
    throw new TRPCNotFoundError('Widget not found');
  }

  if (widget.options.type !== 'counter') {
    throw new TRPCNotFoundError('Invalid widget type');
  }

  return widget;
}

export const widgetRouter = createTRPCRouter({
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
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });

      const defaultOptions =
        input.type === 'realtime'
          ? zRealtimeWidgetOptions.parse({ type: 'realtime' })
          : zCounterWidgetOptions.parse({ type: 'counter' });

      return upsertWidgetByType(ctx.db, {
        projectId: input.projectId,
        organizationId: input.organizationId,
        type: input.type,
        update: { public: input.enabled },
        create: { public: input.enabled, options: defaultOptions },
      });
    }),

  updateOptions: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        organizationId: z.string(),
        options: zWidgetOptions,
      })
    )
    .mutation(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });

      return upsertWidgetByType(ctx.db, {
        projectId: input.projectId,
        organizationId: input.organizationId,
        type: input.options.type,
        update: { options: input.options },
        create: { public: false, options: input.options },
      });
    }),

  counter: publicProcedure
    .input(z.object({ shareId: z.string() }))
    .query(async ({ input, ctx }) => {
      const widget = await findPublicCounterWidgetOrThrow(
        ctx.db,
        input.shareId
      );
      const eventBuffer = ctx.buffers.event;

      return {
        projectId: widget.projectId,
        counter: await eventBuffer.getActiveVisitorCount(widget.projectId),
      };
    }),

  badge: publicProcedure
    .input(z.object({ shareId: z.string() }))
    .query(async ({ input, ctx }) => {
      const widget = await findPublicCounterWidgetOrThrow(
        ctx.db,
        input.shareId
      );
      const { projectId } = widget;
      const { timezone } = await getSettingsForProject(ctx, projectId);

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

      const settings = { session_timezone: timezone };
      const totalSessionsStatement = sql`SELECT uniq(session_id) as total_sessions FROM ${EVENTS_TABLE} WHERE project_id = ${sql.string(projectId)} AND ${REALTIME_WINDOW}`;

      const minuteCountsStatement = sql`SELECT toStartOfMinute(created_at) as minute, uniq(session_id) as session_count, uniq(profile_id) as visitor_count FROM ${EVENTS_TABLE} WHERE project_id = ${sql.string(projectId)} AND ${REALTIME_WINDOW} GROUP BY minute ORDER BY minute ASC WITH FILL FROM toStartOfMinute(now() - INTERVAL 30 MINUTE) TO toStartOfMinute(now()) STEP INTERVAL 1 MINUTE`;

      const countriesQueryPromise = options.countries
        ? chQuery<{ country: string; count: number }>(
            ctx,
            sql`SELECT country, uniq(session_id) as count FROM ${EVENTS_TABLE} WHERE project_id = ${sql.string(projectId)} AND ${REALTIME_WINDOW} AND country != '' AND country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT ${sql.uint64(REALTIME_TOP_LIST_LIMIT)}`,
            settings
          )
        : Promise.resolve<Array<{ country: string; count: number }>>([]);

      const referrersQueryPromise = options.referrers
        ? chQuery<{ referrer: string; count: number }>(
            ctx,
            sql`SELECT referrer_name as referrer, uniq(session_id) as count FROM ${EVENTS_TABLE} WHERE project_id = ${sql.string(projectId)} AND ${REALTIME_WINDOW} AND referrer_name != '' AND referrer_name IS NOT NULL GROUP BY referrer_name ORDER BY count DESC LIMIT ${sql.uint64(REALTIME_TOP_LIST_LIMIT)}`,
            settings
          )
        : Promise.resolve<Array<{ referrer: string; count: number }>>([]);

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
