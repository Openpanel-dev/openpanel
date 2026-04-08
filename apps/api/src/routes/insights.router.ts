import { Prisma } from '@openpanel/db';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import { z } from 'zod';
import * as c from '@/controllers/insights.controller';
import {
  overviewColumns,
  zActiveUsersQuery,
  zDateRange,
  zDeviceQuery,
  zEntryExitQuery,
  zEventsQuery,
  zEventPropertiesQuery,
  zFunnelQuery,
  zGeoQuery,
  zGetGroupQuery,
  zGetMetricsQuery,
  zGetProfileQuery,
  zGetTopPagesQuery,
  zGroupsQuery,
  zGscLimitQuery,
  zGscOpportunitiesQuery,
  zGscOverviewQuery,
  zGscPageDetailsQuery,
  zGscQueryDetailsQuery,
  zOverviewGenericQuerystring,
  zOverviewQuery,
  zPagePerfQuery,
  zProfilesQuery,
  zProfileSessionsQuery,
  zPropertyValuesQuery,
  zReferrerQuery,
  zSessionsQuery,
  zUserFlowQuery,
} from '@/controllers/insights.controller';
import { validateExportRequest } from '@/utils/auth';
import { parseQueryString } from '@/utils/parse-zod-query-string';
import { activateRateLimiter } from '@/utils/rate-limiter';

const projectIdParam = z.object({ projectId: z.string() });
const profileParam = z.object({ projectId: z.string(), profileId: z.string() });
const groupParam = z.object({ projectId: z.string(), groupId: z.string() });
const reportParam = z.object({ projectId: z.string(), reportId: z.string() });

const TAGS = ['Insights'] as const;

const insightsRouter: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  await activateRateLimiter({ fastify, max: 100, timeWindow: '10 seconds' });

  fastify.addHook('preHandler', async (req: FastifyRequest, reply) => {
    try {
      const client = await validateExportRequest(req.headers);
      req.client = client;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Client ID seems to be malformed' });
      }
      if (e instanceof Error) {
        return reply.status(401).send({ error: 'Unauthorized', message: e.message });
      }
      return reply.status(401).send({ error: 'Unauthorized', message: 'Unexpected error' });
    }

  });

  // Run parseQueryString before Fastify schema validation so coercion
  // (string→number, JSON-encoded arrays, etc.) is handled automatically.
  fastify.addHook('preValidation', async (req) => {
    req.query = parseQueryString(req.query as Record<string, unknown>) as typeof req.query;
  });

  // ---------------------------------------------------------------------------
  // Analytics — overview
  // ---------------------------------------------------------------------------

  fastify.route({
    method: 'GET',
    url: '/:projectId/overview',
    schema: {
      tags: TAGS,
      description: 'Get an overview of key metrics for the project (sessions, pageviews, bounce rate, duration).',
      params: projectIdParam,
      querystring: zOverviewQuery,
    },
    handler: c.getOverview,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/active_users',
    schema: {
      tags: TAGS,
      description: 'Get rolling active user counts over the last N days.',
      params: projectIdParam,
      querystring: zActiveUsersQuery,
    },
    handler: c.getActiveUsers,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/retention',
    schema: {
      tags: TAGS,
      description: 'Get weekly retention series data.',
      params: projectIdParam,
    },
    handler: c.getRetentionSeries,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/retention/cohort',
    schema: {
      tags: TAGS,
      description: 'Get retention cohort data.',
      params: projectIdParam,
    },
    handler: c.getRetentionCohort,
  });

  // ---------------------------------------------------------------------------
  // Analytics — pages
  // ---------------------------------------------------------------------------

  fastify.route({
    method: 'GET',
    url: '/:projectId/pages/top',
    schema: {
      tags: TAGS,
      description: 'Get the top pages by pageviews for the given date range.',
      params: projectIdParam,
      querystring: zDateRange,
    },
    handler: c.getTopPages,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/pages/entry_exit',
    schema: {
      tags: TAGS,
      description: 'Get entry or exit pages ranked by session count.',
      params: projectIdParam,
      querystring: zEntryExitQuery,
    },
    handler: c.getEntryExitPages,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/pages/performance',
    schema: {
      tags: TAGS,
      description: 'Get page-level performance metrics (bounce rate, avg duration, sessions).',
      params: projectIdParam,
      querystring: zPagePerfQuery,
    },
    handler: c.getPagePerformance,
  });

  // ---------------------------------------------------------------------------
  // Analytics — metrics overview (legacy insights routes)
  // ---------------------------------------------------------------------------

  fastify.route({
    method: 'GET',
    url: '/:projectId/metrics',
    schema: {
      tags: TAGS,
      description: 'Get aggregated website metrics including sessions, pageviews, and bounce rate.',
      params: projectIdParam,
      querystring: zGetMetricsQuery,
    },
    handler: c.getMetrics,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/live',
    schema: {
      tags: TAGS,
      description: 'Get the current number of live (active) visitors.',
      params: projectIdParam,
    },
    handler: c.getLiveVisitors,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/pages',
    schema: {
      tags: TAGS,
      description: 'Get top pages with pageview counts for the selected date range.',
      params: projectIdParam,
      querystring: zGetTopPagesQuery,
    },
    handler: c.getPages,
  });

  for (const column of overviewColumns) {
    fastify.route({
      method: 'GET',
      url: `/:projectId/${column}`,
      schema: {
        tags: TAGS,
        description: `Get top values for the "${column}" dimension.`,
        params: projectIdParam,
        querystring: zOverviewGenericQuerystring,
      },
      handler: c.getOverviewGeneric(column),
    });
  }

  // ---------------------------------------------------------------------------
  // Analytics — funnel
  // ---------------------------------------------------------------------------

  fastify.route({
    method: 'GET',
    url: '/:projectId/funnel',
    schema: {
      tags: TAGS,
      description: 'Get funnel conversion rates for a sequence of events.',
      params: projectIdParam,
      querystring: zFunnelQuery,
    },
    handler: c.getFunnel,
  });

  // ---------------------------------------------------------------------------
  // Analytics — traffic
  // ---------------------------------------------------------------------------

  fastify.route({
    method: 'GET',
    url: '/:projectId/traffic/referrers',
    schema: {
      tags: TAGS,
      description: 'Get traffic breakdown by referrer source.',
      params: projectIdParam,
      querystring: zReferrerQuery,
    },
    handler: c.getTrafficReferrers,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/traffic/geo',
    schema: {
      tags: TAGS,
      description: 'Get traffic breakdown by geographic dimension (country, region, city).',
      params: projectIdParam,
      querystring: zGeoQuery,
    },
    handler: c.getTrafficGeo,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/traffic/devices',
    schema: {
      tags: TAGS,
      description: 'Get traffic breakdown by device type, browser, or OS.',
      params: projectIdParam,
      querystring: zDeviceQuery,
    },
    handler: c.getTrafficDevices,
  });

  // ---------------------------------------------------------------------------
  // Analytics — user flow & engagement
  // ---------------------------------------------------------------------------

  fastify.route({
    method: 'GET',
    url: '/:projectId/user_flow',
    schema: {
      tags: TAGS,
      description: 'Get user flow paths before, after, or between specified events.',
      params: projectIdParam,
      querystring: zUserFlowQuery,
    },
    handler: c.getUserFlow,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/engagement',
    schema: {
      tags: TAGS,
      description: 'Get engagement metrics for the project.',
      params: projectIdParam,
    },
    handler: c.getEngagement,
  });

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  fastify.route({
    method: 'GET',
    url: '/:projectId/events',
    schema: {
      tags: TAGS,
      description: 'Query events with optional filters for date range, profile, and properties.',
      params: projectIdParam,
      querystring: zEventsQuery,
    },
    handler: c.queryEvents,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/events/names',
    schema: {
      tags: TAGS,
      description: 'List all distinct event names tracked in the project.',
      params: projectIdParam,
    },
    handler: c.listEventNames,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/events/properties',
    schema: {
      tags: TAGS,
      description: 'List all property keys for a given event name.',
      params: projectIdParam,
      querystring: zEventPropertiesQuery,
    },
    handler: c.listEventProperties,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/events/property_values',
    schema: {
      tags: TAGS,
      description: 'Get the top values for a specific event property key.',
      params: projectIdParam,
      querystring: zPropertyValuesQuery,
    },
    handler: c.getEventPropertyValues,
  });

  // ---------------------------------------------------------------------------
  // Profiles
  // ---------------------------------------------------------------------------

  fastify.route({
    method: 'GET',
    url: '/:projectId/profiles',
    schema: {
      tags: TAGS,
      description: 'Search and filter user profiles.',
      params: projectIdParam,
      querystring: zProfilesQuery,
    },
    handler: c.findProfiles,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/profiles/:profileId',
    schema: {
      tags: TAGS,
      description: 'Get a single user profile with their recent events.',
      params: profileParam,
      querystring: zGetProfileQuery,
    },
    handler: c.getProfile,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/profiles/:profileId/sessions',
    schema: {
      tags: TAGS,
      description: 'Get sessions for a specific user profile.',
      params: profileParam,
      querystring: zProfileSessionsQuery,
    },
    handler: c.getProfileSessions,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/profiles/:profileId/metrics',
    schema: {
      tags: TAGS,
      description: 'Get aggregated metrics for a specific user profile.',
      params: profileParam,
    },
    handler: c.getProfileMetrics,
  });

  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------

  fastify.route({
    method: 'GET',
    url: '/:projectId/sessions',
    schema: {
      tags: TAGS,
      description: 'Query sessions with optional filters.',
      params: projectIdParam,
      querystring: zSessionsQuery,
    },
    handler: c.querySessions,
  });

  // ---------------------------------------------------------------------------
  // Groups
  // ---------------------------------------------------------------------------

  fastify.route({
    method: 'GET',
    url: '/:projectId/groups/types',
    schema: {
      tags: TAGS,
      description: 'List all group types defined in the project.',
      params: projectIdParam,
    },
    handler: c.listGroupTypes,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/groups',
    schema: {
      tags: TAGS,
      description: 'Search and filter groups.',
      params: projectIdParam,
      querystring: zGroupsQuery,
    },
    handler: c.findGroups,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/groups/:groupId',
    schema: {
      tags: TAGS,
      description: 'Get a single group with its members.',
      params: groupParam,
      querystring: zGetGroupQuery,
    },
    handler: c.getGroup,
  });

  // ---------------------------------------------------------------------------
  // Dashboards & reports
  // ---------------------------------------------------------------------------

  fastify.route({
    method: 'GET',
    url: '/:projectId/reports/:reportId/data',
    schema: {
      tags: TAGS,
      description: 'Get the data for a saved report.',
      params: reportParam,
    },
    handler: c.getReportData,
  });

  // ---------------------------------------------------------------------------
  // Google Search Console
  // ---------------------------------------------------------------------------

  fastify.route({
    method: 'GET',
    url: '/:projectId/gsc/overview',
    schema: {
      tags: TAGS,
      description: 'Get a Google Search Console performance overview (clicks, impressions, CTR, position).',
      params: projectIdParam,
      querystring: zGscOverviewQuery,
    },
    handler: c.gscOverview,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/gsc/pages',
    schema: {
      tags: TAGS,
      description: 'Get top pages from Google Search Console.',
      params: projectIdParam,
      querystring: zGscLimitQuery,
    },
    handler: c.gscPages,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/gsc/pages/details',
    schema: {
      tags: TAGS,
      description: 'Get detailed GSC metrics for a specific page URL.',
      params: projectIdParam,
      querystring: zGscPageDetailsQuery,
    },
    handler: c.gscPageDetails,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/gsc/queries',
    schema: {
      tags: TAGS,
      description: 'Get top search queries from Google Search Console.',
      params: projectIdParam,
      querystring: zGscLimitQuery,
    },
    handler: c.gscQueries,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/gsc/queries/details',
    schema: {
      tags: TAGS,
      description: 'Get detailed GSC metrics for a specific search query.',
      params: projectIdParam,
      querystring: zGscQueryDetailsQuery,
    },
    handler: c.gscQueryDetails,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/gsc/queries/opportunities',
    schema: {
      tags: TAGS,
      description: 'Get GSC query opportunities (high impressions, low CTR).',
      params: projectIdParam,
      querystring: zGscOpportunitiesQuery,
    },
    handler: c.gscQueryOpportunities,
  });

  fastify.route({
    method: 'GET',
    url: '/:projectId/gsc/cannibalization',
    schema: {
      tags: TAGS,
      description: 'Detect keyword cannibalization across pages in Google Search Console.',
      params: projectIdParam,
      querystring: zDateRange,
    },
    handler: c.gscCannibalization,
  });
};

export default insightsRouter;
