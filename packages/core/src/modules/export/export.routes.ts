// Ported from apps/api/src/routes/export.router.ts + insights.router.ts and
// their controllers (M7-007). V1's Fastify routes stay the LIVE surface
// (DELEGATE PATTERN) and already call these same `@openpanel/db`-re-exported
// `*Core` functions (M7-001..006 moved the implementations; the V1
// controllers were updated to delegate as each module landed). This file is
// the same surface rebuilt on Elysia, so the target port has somewhere to
// land at P8 without redesigning the API it replaces — no new query logic,
// every call below is the same function V1's controller calls.
//
// NAMED GAP, same as the rest of `publicApiRoutes`: not yet reachable.
// `authenticateClient` (http/client-auth.ts) is a P8 stub that always
// returns null, so `clientAuth` 401s every request until it is filled in,
// and main.ts does not mount `publicApiRoutes` until a real `AppDeps`
// exists. `allow: ['read', 'root']` mirrors V1's rule (utils/auth.ts's
// `validateExportRequest`, shared by both `/export` and `/insights`: a
// `write`-type client may not read analytics back out).
//
// Also not ported here (ADR-003, "behaviour that must be re-implemented
// deliberately"): the `parseQueryString` pre-pass V1 runs as a Fastify
// `preValidation` hook, coercing JSON-encoded array/object querystring values
// before zod sees them. It is an Elysia lifecycle-hook task of its own, not
// specific to this module, and every zod schema below is written to be the
// one V1 validates AFTER that hook runs.
//
// `listDashboards`/`listReports` (insights.controller.ts) are mounted under
// `/manage/projects/:projectId/dashboards[...]` in V1 (manage.router.ts) —
// that surface belongs to the project module, not here.
//
// The 18 `overviewColumns` routes are written out rather than looped: a
// mutable reassignment of the Elysia chain inside a `for` loop widens past
// what `defineRoutes`'s `const T` inference can carry, same reason every
// other module here writes its routes as one static `.get()`/`.post()` chain.

import { DateTime } from '@openpanel/common';
import { getDefaultIntervalByDates } from '@openpanel/constants';
import type {
  GetEventListOptions,
  IGetTopGenericInput,
  TrafficColumn,
} from '@openpanel/db';
import {
  zChartEvent,
  zChartEventFilter,
  zRange,
  zReport,
} from '@openpanel/validation';
import { z } from 'zod';
import type { ClientType } from '../../http/client-auth';
import { defineRoutes } from '../../http/define';
import {
  loadDb,
  resolveExportProjectId,
  resolveInsightsDateRange,
  resolveInsightsProjectId,
} from './export.service';

const EXPORT_TAGS = ['Export'];
const INSIGHTS_TAGS = ['Insights'];
const CLIENT_ALLOW: { allow: ClientType[] } = { allow: ['read', 'root'] };

// REST querystrings can't carry arrays of objects natively. Callers pass
// `filters` as a URL-encoded JSON string; decoded here (ported verbatim from
// insights.controller.ts's `zFiltersParam`).
const zFiltersParam = z
  .preprocess((value) => {
    if (value == null || value === '') {
      return undefined;
    }
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return undefined;
      }
    }
    return value;
  }, z.array(zChartEventFilter))
  .optional();

const projectIdParam = z.object({ projectId: z.string() });
const profileParam = z.object({ projectId: z.string(), profileId: z.string() });
const groupParam = z.object({ projectId: z.string(), groupId: z.string() });
const reportParam = z.object({ projectId: z.string(), reportId: z.string() });

const zDateRange = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  range: zRange.optional(),
});

// ---------------------------------------------------------------------------
// /export
// ---------------------------------------------------------------------------

const zExportEvents = z.object({
  project_id: z.string().optional(),
  projectId: z.string().optional(),
  profileId: z.string().optional(),
  event: z.union([z.string(), z.array(z.string())]).optional(),
  start: z.coerce.string().optional(),
  end: z.coerce.string().optional(),
  page: z.coerce.number().optional().default(1),
  limit: z.coerce.number().optional().default(50),
  filters: zFiltersParam,
  includes: z
    .preprocess((arg) => {
      if (arg == null) {
        return undefined;
      }
      if (Array.isArray(arg)) {
        return arg;
      }
      if (typeof arg === 'string') {
        return arg
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return arg;
    }, z.array(z.string()))
    .optional(),
});

const zExportCharts = zReport
  .pick({
    breakdowns: true,
    interval: true,
    range: true,
    previous: true,
    startDate: true,
    endDate: true,
  })
  .extend({
    project_id: z.string().optional(),
    projectId: z.string().optional(),
    series: z
      .array(
        z.object({
          name: z.string(),
          filters: zChartEvent.shape.filters.optional(),
          segment: zChartEvent.shape.segment.optional(),
          property: zChartEvent.shape.property.optional(),
        })
      )
      .optional(),
    // Backward compatibility - events will be migrated to series via preprocessing
    events: z
      .array(
        z.object({
          name: z.string(),
          filters: zChartEvent.shape.filters.optional(),
          segment: zChartEvent.shape.segment.optional(),
          property: zChartEvent.shape.property.optional(),
        })
      )
      .optional(),
  });

export const exportRoutes = defineRoutes((app) =>
  app
    .get(
      '/export/events',
      async ({ query, client, status }) => {
        const resolved = await resolveExportProjectId(client, query);
        if (!resolved.ok) {
          return status(resolved.status, {
            error: 'Error',
            message: resolved.message,
          });
        }
        const { getEventList, getEventsCount } = await loadDb();
        const {
          limit,
          page: rawPage,
          event,
          start,
          end,
          profileId,
          includes,
          filters,
        } = query;
        const take = Math.max(Math.min(limit, 1000), 1);
        const cursor = Math.max(rawPage, 1) - 1;
        const options: GetEventListOptions = {
          projectId: resolved.projectId,
          events: (Array.isArray(event) ? event : [event]).filter(
            (s): s is string => typeof s === 'string'
          ),
          startDate: start ? new Date(start) : undefined,
          endDate: end ? new Date(end) : undefined,
          cursor,
          take,
          profileId,
          filters,
          select: {
            profile: false,
            meta: false,
            ...includes?.reduce((acc, key) => ({ ...acc, [key]: true }), {}),
          },
        };

        const [data, totalCount] = await Promise.all([
          getEventList(options),
          getEventsCount(options),
        ]);

        return {
          meta: {
            count: data.length,
            totalCount,
            pages: Math.ceil(totalCount / options.take),
            current: cursor + 1,
          },
          data,
        };
      },
      {
        clientAuth: CLIENT_ALLOW,
        query: zExportEvents,
        detail: {
          tags: EXPORT_TAGS,
          description:
            'Export a paginated list of raw events with optional filtering by date, profile, and event type.',
        },
      }
    )
    .get(
      '/export/charts',
      async ({ query, client, status }) => {
        const resolved = await resolveExportProjectId(client, query);
        if (!resolved.ok) {
          return status(resolved.status, {
            error: 'Error',
            message: resolved.message,
          });
        }
        const { ChartEngine, getSettingsForProject } = await loadDb();
        const { timezone } = await getSettingsForProject(resolved.projectId);
        const { events, series, ...rest } = query;

        const eventSeries = (series ?? events ?? []).map((event) => ({
          ...event,
          type: 'event' as const,
          segment: event.segment ?? 'event',
          filters: event.filters ?? [],
        }));

        return ChartEngine.execute({
          ...rest,
          startDate: rest.startDate
            ? DateTime.fromISO(rest.startDate)
                .setZone(timezone)
                .toFormat('yyyy-MM-dd HH:mm:ss')
            : undefined,
          endDate: rest.endDate
            ? DateTime.fromISO(rest.endDate)
                .setZone(timezone)
                .toFormat('yyyy-MM-dd HH:mm:ss')
            : undefined,
          projectId: resolved.projectId,
          series: eventSeries,
          chartType: 'linear',
          metric: 'sum',
        });
      },
      {
        clientAuth: CLIENT_ALLOW,
        query: zExportCharts,
        detail: {
          tags: EXPORT_TAGS,
          description:
            'Export aggregated chart/analytics data for a series of events over a time range.',
        },
      }
    )
);

// ---------------------------------------------------------------------------
// /insights — analytics overview
// ---------------------------------------------------------------------------

const zOverviewQuery = zDateRange.extend({
  interval: z.enum(['hour', 'day', 'week', 'month']).optional(),
});

const zActiveUsersQuery = z.object({
  days: z.number().int().min(1).max(90).default(7),
});

const zGetMetricsQuery = z.object({
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  range: zRange.default('7d'),
  filters: z.array(zChartEventFilter).default([]),
});

const zGetTopPagesQuery = z.object({
  filters: z.array(zChartEventFilter).default([]),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  range: zRange.default('7d'),
  cursor: z.number().optional(),
  limit: z.number().default(10),
});

const zOverviewGenericQuerystring = zGetTopPagesQuery;

type OverviewGenericQuery = z.infer<typeof zOverviewGenericQuerystring>;
type InsightsProjectParam = z.infer<typeof projectIdParam>;
type InsightsClient = Parameters<typeof resolveInsightsProjectId>[0];

/** Shared body of the 18 `overviewColumns` routes below (V1's `getOverviewGeneric(column)`). */
async function getOverviewGeneric(
  column: IGetTopGenericInput['column'],
  params: InsightsProjectParam,
  query: OverviewGenericQuery,
  client: InsightsClient
) {
  const projectId = await resolveInsightsProjectId(client, params);
  const { getChartStartEndDate, getSettingsForProject, overviewService } =
    await loadDb();
  const { timezone } = await getSettingsForProject(projectId);
  const { startDate, endDate } = getChartStartEndDate(query, timezone);
  return overviewService.getTopGeneric({
    column,
    projectId,
    filters: query.filters,
    startDate,
    endDate,
    timezone,
  });
}

const zEntryExitQuery = zDateRange.extend({
  mode: z.enum(['entry', 'exit']).default('entry'),
});

const zPagePerfQuery = zDateRange.extend({
  search: z.string().optional(),
  sortBy: z
    .enum(['sessions', 'pageviews', 'bounce_rate', 'avg_duration'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(500).default(50),
});

const zFunnelQuery = zDateRange.extend({
  steps: z
    .union([z.array(z.string()), z.string().transform((s) => [s])])
    .refine((a) => a.length >= 2 && a.length <= 10, {
      message: 'steps must have between 2 and 10 items',
    }),
  windowHours: z.number().int().min(1).max(720).default(24),
  groupBy: z.enum(['session_id', 'profile_id']).default('session_id'),
});

const referrerColumns = [
  'referrer_name',
  'referrer_type',
  'referrer',
  'utm_source',
  'utm_medium',
  'utm_campaign',
] as const;
const geoColumns = ['country', 'region', 'city'] as const;
const deviceColumns = ['device', 'browser', 'os'] as const;

const zReferrerQuery = zDateRange.extend({
  breakdown: z.enum(referrerColumns).default('referrer_name'),
});
const zGeoQuery = zDateRange.extend({
  breakdown: z.enum(geoColumns).default('country'),
});
const zDeviceQuery = zDateRange.extend({
  breakdown: z.enum(deviceColumns).default('device'),
});

const zUserFlowQuery = zDateRange.extend({
  startEvent: z.string(),
  endEvent: z.string().optional(),
  mode: z.enum(['after', 'before', 'between']).default('after'),
  steps: z.number().int().min(2).max(10).default(5),
  exclude: z
    .union([z.array(z.string()), z.string().transform((s) => [s])])
    .optional(),
  include: z
    .union([z.array(z.string()), z.string().transform((s) => [s])])
    .optional(),
});

// ---------------------------------------------------------------------------
// /insights — events
// ---------------------------------------------------------------------------

const zEventsQuery = zDateRange.extend({
  eventNames: z
    .union([z.array(z.string()), z.string().transform((s) => [s])])
    .optional(),
  path: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  device: z.string().optional(),
  browser: z.string().optional(),
  os: z.string().optional(),
  referrer: z.string().optional(),
  referrerName: z.string().optional(),
  referrerType: z.string().optional(),
  profileId: z.string().optional(),
  properties: z.record(z.string(), z.string()).optional(),
  filters: zFiltersParam,
  limit: z.number().int().min(1).max(100).default(20),
});

const zEventPropertiesQuery = z.object({ eventName: z.string().optional() });
const zPropertyValuesQuery = z.object({
  eventName: z.string(),
  propertyKey: z.string(),
});

// ---------------------------------------------------------------------------
// /insights — profiles
// ---------------------------------------------------------------------------

const zProfilesQuery = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  device: z.string().optional(),
  browser: z.string().optional(),
  inactiveDays: z.number().int().min(1).optional(),
  minSessions: z.number().int().min(1).optional(),
  performedEvent: z.string().optional(),
  filters: zFiltersParam,
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit: z.number().int().min(1).max(100).default(20),
});

const zGetProfileQuery = z.object({
  eventLimit: z.number().int().min(1).max(100).default(20),
});
const zProfileSessionsQuery = z.object({
  limit: z.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// /insights — sessions
// ---------------------------------------------------------------------------

const zSessionsQuery = zDateRange.extend({
  country: z.string().optional(),
  city: z.string().optional(),
  device: z.string().optional(),
  browser: z.string().optional(),
  os: z.string().optional(),
  referrer: z.string().optional(),
  referrerName: z.string().optional(),
  referrerType: z.string().optional(),
  profileId: z.string().optional(),
  filters: zFiltersParam,
  limit: z.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// /insights — groups
// ---------------------------------------------------------------------------

const zGroupsQuery = z.object({
  type: z.string().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

const zGetGroupQuery = z.object({
  memberLimit: z.number().int().min(1).max(50).default(10),
});

// ---------------------------------------------------------------------------
// /insights — Google Search Console
// ---------------------------------------------------------------------------

const zGscOverviewQuery = zDateRange.extend({
  interval: z.enum(['day', 'week', 'month']).default('day'),
});
const zGscLimitQuery = zDateRange.extend({
  limit: z.number().int().min(1).max(1000).default(100),
});
const zGscPageDetailsQuery = zDateRange.extend({ page: z.string().url() });
const zGscQueryDetailsQuery = zDateRange.extend({ query: z.string() });
const zGscOpportunitiesQuery = zDateRange.extend({
  minImpressions: z.number().int().min(1).default(50),
});

export const insightsRoutes = defineRoutes((app) =>
  app
    .get(
      '/insights/:projectId/overview',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { startDate, endDate } = await resolveInsightsDateRange(
          projectId,
          query
        );
        const { getAnalyticsOverviewCore } = await loadDb();
        return getAnalyticsOverviewCore({
          projectId,
          startDate,
          endDate,
          interval: query.interval,
        });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zOverviewQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description:
            'Get an overview of key metrics for the project (sessions, pageviews, bounce rate, duration).',
        },
      }
    )
    .get(
      '/insights/:projectId/active_users',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { getRollingActiveUsersCore } = await loadDb();
        return getRollingActiveUsersCore({ projectId, days: query.days });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zActiveUsersQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get rolling active user counts over the last N days.',
        },
      }
    )
    .get(
      '/insights/:projectId/retention',
      async ({ params, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { getWeeklyRetentionSeriesCore } = await loadDb();
        return getWeeklyRetentionSeriesCore(projectId);
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get weekly retention series data.',
        },
      }
    )
    .get(
      '/insights/:projectId/retention/cohort',
      async ({ params, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { getRetentionCohortCore } = await loadDb();
        return getRetentionCohortCore(projectId);
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get retention cohort data.',
        },
      }
    )
    .get(
      '/insights/:projectId/pages/top',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { startDate, endDate } = await resolveInsightsDateRange(
          projectId,
          query
        );
        const { getTopPagesCore } = await loadDb();
        return getTopPagesCore({ projectId, startDate, endDate });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zDateRange,
        detail: {
          tags: INSIGHTS_TAGS,
          description:
            'Get the top pages by pageviews for the given date range.',
        },
      }
    )
    .get(
      '/insights/:projectId/pages/entry_exit',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { startDate, endDate } = await resolveInsightsDateRange(
          projectId,
          query
        );
        const { getEntryExitPagesCore } = await loadDb();
        return getEntryExitPagesCore({
          projectId,
          startDate,
          endDate,
          mode: query.mode,
        });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zEntryExitQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get entry or exit pages ranked by session count.',
        },
      }
    )
    .get(
      '/insights/:projectId/pages/performance',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { startDate, endDate } = await resolveInsightsDateRange(
          projectId,
          query
        );
        const { getPagePerformanceCore } = await loadDb();
        return getPagePerformanceCore({
          projectId,
          startDate,
          endDate,
          ...query,
        });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zPagePerfQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description:
            'Get page-level performance metrics (bounce rate, avg duration, sessions).',
        },
      }
    )
    .get(
      '/insights/:projectId/metrics',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { getChartStartEndDate, getSettingsForProject, overviewService } =
          await loadDb();
        const { timezone } = await getSettingsForProject(projectId);
        const { startDate, endDate } = getChartStartEndDate(query, timezone);
        return overviewService.getMetrics({
          projectId,
          filters: query.filters,
          startDate,
          endDate,
          interval: getDefaultIntervalByDates(startDate, endDate) ?? 'day',
          timezone,
        });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zGetMetricsQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description:
            'Get aggregated website metrics including sessions, pageviews, and bounce rate.',
        },
      }
    )
    .get(
      '/insights/:projectId/live',
      async ({ params, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { eventBuffer } = await loadDb();
        return { visitors: await eventBuffer.getActiveVisitorCount(projectId) };
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get the current number of live (active) visitors.',
        },
      }
    )
    .get(
      '/insights/:projectId/pages',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { getChartStartEndDate, getSettingsForProject, overviewService } =
          await loadDb();
        const { timezone } = await getSettingsForProject(projectId);
        const { startDate, endDate } = getChartStartEndDate(query, timezone);
        return overviewService.getTopPages({
          projectId,
          filters: query.filters,
          startDate,
          endDate,
          timezone,
        });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zGetTopPagesQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description:
            'Get top pages with pageview counts for the selected date range.',
        },
      }
    )
    .get(
      '/insights/:projectId/referrer',
      ({ params, query, client }) =>
        getOverviewGeneric('referrer', params, query, client),
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zOverviewGenericQuerystring,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get top values for the "referrer" dimension.',
        },
      }
    )
    .get(
      '/insights/:projectId/referrer_name',
      ({ params, query, client }) =>
        getOverviewGeneric('referrer_name', params, query, client),
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zOverviewGenericQuerystring,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get top values for the "referrer_name" dimension.',
        },
      }
    )
    .get(
      '/insights/:projectId/referrer_type',
      ({ params, query, client }) =>
        getOverviewGeneric('referrer_type', params, query, client),
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zOverviewGenericQuerystring,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get top values for the "referrer_type" dimension.',
        },
      }
    )
    .get(
      '/insights/:projectId/utm_source',
      ({ params, query, client }) =>
        getOverviewGeneric('utm_source', params, query, client),
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zOverviewGenericQuerystring,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get top values for the "utm_source" dimension.',
        },
      }
    )
    .get(
      '/insights/:projectId/utm_medium',
      ({ params, query, client }) =>
        getOverviewGeneric('utm_medium', params, query, client),
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zOverviewGenericQuerystring,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get top values for the "utm_medium" dimension.',
        },
      }
    )
    .get(
      '/insights/:projectId/utm_campaign',
      ({ params, query, client }) =>
        getOverviewGeneric('utm_campaign', params, query, client),
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zOverviewGenericQuerystring,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get top values for the "utm_campaign" dimension.',
        },
      }
    )
    .get(
      '/insights/:projectId/utm_term',
      ({ params, query, client }) =>
        getOverviewGeneric('utm_term', params, query, client),
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zOverviewGenericQuerystring,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get top values for the "utm_term" dimension.',
        },
      }
    )
    .get(
      '/insights/:projectId/utm_content',
      ({ params, query, client }) =>
        getOverviewGeneric('utm_content', params, query, client),
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zOverviewGenericQuerystring,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get top values for the "utm_content" dimension.',
        },
      }
    )
    .get(
      '/insights/:projectId/region',
      ({ params, query, client }) =>
        getOverviewGeneric('region', params, query, client),
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zOverviewGenericQuerystring,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get top values for the "region" dimension.',
        },
      }
    )
    .get(
      '/insights/:projectId/country',
      ({ params, query, client }) =>
        getOverviewGeneric('country', params, query, client),
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zOverviewGenericQuerystring,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get top values for the "country" dimension.',
        },
      }
    )
    .get(
      '/insights/:projectId/city',
      ({ params, query, client }) =>
        getOverviewGeneric('city', params, query, client),
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zOverviewGenericQuerystring,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get top values for the "city" dimension.',
        },
      }
    )
    .get(
      '/insights/:projectId/device',
      ({ params, query, client }) =>
        getOverviewGeneric('device', params, query, client),
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zOverviewGenericQuerystring,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get top values for the "device" dimension.',
        },
      }
    )
    .get(
      '/insights/:projectId/brand',
      ({ params, query, client }) =>
        getOverviewGeneric('brand', params, query, client),
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zOverviewGenericQuerystring,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get top values for the "brand" dimension.',
        },
      }
    )
    .get(
      '/insights/:projectId/model',
      ({ params, query, client }) =>
        getOverviewGeneric('model', params, query, client),
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zOverviewGenericQuerystring,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get top values for the "model" dimension.',
        },
      }
    )
    .get(
      '/insights/:projectId/browser',
      ({ params, query, client }) =>
        getOverviewGeneric('browser', params, query, client),
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zOverviewGenericQuerystring,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get top values for the "browser" dimension.',
        },
      }
    )
    .get(
      '/insights/:projectId/browser_version',
      ({ params, query, client }) =>
        getOverviewGeneric('browser_version', params, query, client),
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zOverviewGenericQuerystring,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get top values for the "browser_version" dimension.',
        },
      }
    )
    .get(
      '/insights/:projectId/os',
      ({ params, query, client }) =>
        getOverviewGeneric('os', params, query, client),
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zOverviewGenericQuerystring,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get top values for the "os" dimension.',
        },
      }
    )
    .get(
      '/insights/:projectId/os_version',
      ({ params, query, client }) =>
        getOverviewGeneric('os_version', params, query, client),
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zOverviewGenericQuerystring,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get top values for the "os_version" dimension.',
        },
      }
    )
    .get(
      '/insights/:projectId/funnel',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { startDate, endDate } = await resolveInsightsDateRange(
          projectId,
          query
        );
        const { getFunnelCore } = await loadDb();
        return getFunnelCore({
          projectId,
          startDate,
          endDate,
          steps: query.steps,
          windowHours: query.windowHours,
          groupBy: query.groupBy,
        });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zFunnelQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get funnel conversion rates for a sequence of events.',
        },
      }
    )
    .get(
      '/insights/:projectId/traffic/referrers',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { startDate, endDate } = await resolveInsightsDateRange(
          projectId,
          query
        );
        const { getTrafficBreakdownCore } = await loadDb();
        return getTrafficBreakdownCore({
          projectId,
          startDate,
          endDate,
          column: query.breakdown as TrafficColumn,
        });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zReferrerQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get traffic breakdown by referrer source.',
        },
      }
    )
    .get(
      '/insights/:projectId/traffic/geo',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { startDate, endDate } = await resolveInsightsDateRange(
          projectId,
          query
        );
        const { getTrafficBreakdownCore } = await loadDb();
        return getTrafficBreakdownCore({
          projectId,
          startDate,
          endDate,
          column: query.breakdown as TrafficColumn,
        });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zGeoQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description:
            'Get traffic breakdown by geographic dimension (country, region, city).',
        },
      }
    )
    .get(
      '/insights/:projectId/traffic/devices',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { startDate, endDate } = await resolveInsightsDateRange(
          projectId,
          query
        );
        const { getTrafficBreakdownCore } = await loadDb();
        return getTrafficBreakdownCore({
          projectId,
          startDate,
          endDate,
          column: query.breakdown as TrafficColumn,
        });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zDeviceQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get traffic breakdown by device type, browser, or OS.',
        },
      }
    )
    .get(
      '/insights/:projectId/user_flow',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { startDate, endDate } = await resolveInsightsDateRange(
          projectId,
          query
        );
        const { getUserFlowCore } = await loadDb();
        return getUserFlowCore({ projectId, startDate, endDate, ...query });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zUserFlowQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description:
            'Get user flow paths before, after, or between specified events.',
        },
      }
    )
    .get(
      '/insights/:projectId/engagement',
      async ({ params, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { getEngagementCore } = await loadDb();
        return getEngagementCore(projectId);
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get engagement metrics for the project.',
        },
      }
    )
    .get(
      '/insights/:projectId/events',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { queryEventsCore } = await loadDb();
        return queryEventsCore({ projectId, ...query });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zEventsQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description:
            'Query events with optional filters for date range, profile, and properties.',
        },
      }
    )
    .get(
      '/insights/:projectId/events/names',
      async ({ params, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { listEventNamesCore } = await loadDb();
        return listEventNamesCore(projectId);
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'List all distinct event names tracked in the project.',
        },
      }
    )
    .get(
      '/insights/:projectId/events/properties',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { listEventPropertiesCore } = await loadDb();
        return listEventPropertiesCore({
          projectId,
          eventName: query.eventName,
        });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zEventPropertiesQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'List all property keys for a given event name.',
        },
      }
    )
    .get(
      '/insights/:projectId/events/property_values',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { getEventPropertyValuesCore } = await loadDb();
        return getEventPropertyValuesCore({ projectId, ...query });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zPropertyValuesQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get the top values for a specific event property key.',
        },
      }
    )
    .get(
      '/insights/:projectId/profiles',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { findProfilesCore } = await loadDb();
        return findProfilesCore({ projectId, ...query });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zProfilesQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Search and filter user profiles.',
        },
      }
    )
    .get(
      '/insights/:projectId/profiles/:profileId',
      async ({ params, query, client, status }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { getProfileWithEvents } = await loadDb();
        const result = await getProfileWithEvents(
          projectId,
          params.profileId,
          query.eventLimit
        );
        if (!result.profile) {
          return status(404, {
            error: 'Profile not found',
            profileId: params.profileId,
          });
        }
        return { profile: result.profile, recentEvents: result.recent_events };
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: profileParam,
        query: zGetProfileQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get a single user profile with their recent events.',
        },
      }
    )
    .get(
      '/insights/:projectId/profiles/:profileId/sessions',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { getProfileSessionsCore } = await loadDb();
        return getProfileSessionsCore(projectId, params.profileId, query.limit);
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: profileParam,
        query: zProfileSessionsQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get sessions for a specific user profile.',
        },
      }
    )
    .get(
      '/insights/:projectId/profiles/:profileId/metrics',
      async ({ params, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { getProfileMetricsCore } = await loadDb();
        return getProfileMetricsCore({
          projectId,
          profileId: params.profileId,
        });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: profileParam,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get aggregated metrics for a specific user profile.',
        },
      }
    )
    .get(
      '/insights/:projectId/sessions',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { querySessionsCore } = await loadDb();
        return querySessionsCore({ projectId, ...query });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zSessionsQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Query sessions with optional filters.',
        },
      }
    )
    .get(
      '/insights/:projectId/groups/types',
      async ({ params, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { listGroupTypesCore } = await loadDb();
        return listGroupTypesCore(projectId);
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'List all group types defined in the project.',
        },
      }
    )
    .get(
      '/insights/:projectId/groups',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { findGroupsCore } = await loadDb();
        return findGroupsCore({ projectId, ...query });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zGroupsQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Search and filter groups.',
        },
      }
    )
    .get(
      '/insights/:projectId/groups/:groupId',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { getGroupCore } = await loadDb();
        return getGroupCore({
          projectId,
          groupId: params.groupId,
          memberLimit: query.memberLimit,
        });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: groupParam,
        query: zGetGroupQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get a single group with its members.',
        },
      }
    )
    .get(
      '/insights/:projectId/reports/:reportId/data',
      async ({ params, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { getReportDataCore } = await loadDb();
        return getReportDataCore({
          projectId,
          reportId: params.reportId,
          organizationId: client.organizationId,
        });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: reportParam,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get the data for a saved report.',
        },
      }
    )
    .get(
      '/insights/:projectId/gsc/overview',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { startDate, endDate } = await resolveInsightsDateRange(
          projectId,
          query
        );
        const { gscGetOverviewCore } = await loadDb();
        return gscGetOverviewCore({
          projectId,
          startDate,
          endDate,
          interval: query.interval,
        });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zGscOverviewQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description:
            'Get a Google Search Console performance overview (clicks, impressions, CTR, position).',
        },
      }
    )
    .get(
      '/insights/:projectId/gsc/pages',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { startDate, endDate } = await resolveInsightsDateRange(
          projectId,
          query
        );
        const { gscGetTopPagesCore } = await loadDb();
        return gscGetTopPagesCore({
          projectId,
          startDate,
          endDate,
          limit: query.limit,
        });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zGscLimitQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get top pages from Google Search Console.',
        },
      }
    )
    .get(
      '/insights/:projectId/gsc/pages/details',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { startDate, endDate } = await resolveInsightsDateRange(
          projectId,
          query
        );
        const { gscGetPageDetailsCore } = await loadDb();
        return gscGetPageDetailsCore({
          projectId,
          startDate,
          endDate,
          page: query.page,
        });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zGscPageDetailsQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get detailed GSC metrics for a specific page URL.',
        },
      }
    )
    .get(
      '/insights/:projectId/gsc/queries',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { startDate, endDate } = await resolveInsightsDateRange(
          projectId,
          query
        );
        const { gscGetTopQueriesCore } = await loadDb();
        return gscGetTopQueriesCore({
          projectId,
          startDate,
          endDate,
          limit: query.limit,
        });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zGscLimitQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get top search queries from Google Search Console.',
        },
      }
    )
    .get(
      '/insights/:projectId/gsc/queries/details',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { startDate, endDate } = await resolveInsightsDateRange(
          projectId,
          query
        );
        const { gscGetQueryDetailsCore } = await loadDb();
        return gscGetQueryDetailsCore({
          projectId,
          startDate,
          endDate,
          query: query.query,
        });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zGscQueryDetailsQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description: 'Get detailed GSC metrics for a specific search query.',
        },
      }
    )
    .get(
      '/insights/:projectId/gsc/queries/opportunities',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { startDate, endDate } = await resolveInsightsDateRange(
          projectId,
          query
        );
        const { gscGetQueryOpportunitiesCore } = await loadDb();
        return gscGetQueryOpportunitiesCore({
          projectId,
          startDate,
          endDate,
          minImpressions: query.minImpressions,
        });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zGscOpportunitiesQuery,
        detail: {
          tags: INSIGHTS_TAGS,
          description:
            'Get GSC query opportunities (high impressions, low CTR).',
        },
      }
    )
    .get(
      '/insights/:projectId/gsc/cannibalization',
      async ({ params, query, client }) => {
        const projectId = await resolveInsightsProjectId(client, params);
        const { startDate, endDate } = await resolveInsightsDateRange(
          projectId,
          query
        );
        const { gscGetCannibalizationCore } = await loadDb();
        return gscGetCannibalizationCore({ projectId, startDate, endDate });
      },
      {
        clientAuth: CLIENT_ALLOW,
        params: projectIdParam,
        query: zDateRange,
        detail: {
          tags: INSIGHTS_TAGS,
          description:
            'Detect keyword cannibalization across pages in Google Search Console.',
        },
      }
    )
);
