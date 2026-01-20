import ShortUniqueId from 'short-unique-id';
import { z } from 'zod';

import {
  TABLE_NAMES,
  ch,
  clix,
  db,
  eventBuffer,
  getSettingsForProject,
} from '@openpanel/db';
import {
  zCounterWidgetOptions,
  zRealtimeWidgetOptions,
  zWidgetOptions,
  zWidgetType,
} from '@openpanel/validation';

import { TRPCNotFoundError } from '../errors';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';

const uid = new ShortUniqueId({ length: 6 });

// Helper to find widget by projectId and type
async function findWidgetByType(projectId: string, type: string) {
  const widgets = await db.$primary().shareWidget.findMany({
    where: { projectId },
  });
  return widgets.find(
    (w) => (w.options as z.infer<typeof zWidgetOptions>)?.type === type,
  );
}

export const widgetRouter = createTRPCRouter({
  // Get widget by projectId and type (returns null if not found or not public)
  get: protectedProcedure
    .input(z.object({ projectId: z.string(), type: zWidgetType }))
    .query(async ({ input }) => {
      const widget = await findWidgetByType(input.projectId, input.type);

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
      }),
    )
    .mutation(async ({ input }) => {
      const existing = await findWidgetByType(input.projectId, input.type);

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
      }),
    )
    .mutation(async ({ input }) => {
      const existing = await findWidgetByType(
        input.projectId,
        input.options.type,
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
    .query(async ({ input }) => {
      const widget = await db.shareWidget.findUnique({
        where: {
          id: input.shareId,
        },
      });

      if (!widget || !widget.public) {
        throw TRPCNotFoundError('Widget not found');
      }

      if (widget.options.type !== 'counter') {
        throw TRPCNotFoundError('Invalid widget type');
      }

      return {
        projectId: widget.projectId,
        counter: await eventBuffer.getActiveVisitorCount(widget.projectId),
      };
    }),

  realtimeData: publicProcedure
    .input(z.object({ shareId: z.string() }))
    .query(async ({ input }) => {
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

      if (!widget || !widget.public) {
        throw TRPCNotFoundError('Widget not found');
      }

      const { projectId, options } = widget;

      if (options.type !== 'realtime') {
        throw TRPCNotFoundError('Invalid widget type');
      }

      const { timezone } = await getSettingsForProject(projectId);

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
          clix.exp('INTERVAL 1 MINUTE'),
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
