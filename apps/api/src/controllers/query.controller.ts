import type { IServiceClientWithProject } from '@openpanel/db';
import {
  ClientType,
  findGroupsCore,
  findProfilesCore,
  getAnalyticsOverviewCore,
  getChartStartEndDate,
  getEngagementCore,
  getEntryExitPagesCore,
  getEventPropertyValuesCore,
  getFunnelCore,
  getGroupCore,
  getPagePerformanceCore,
  getProfileMetricsCore,
  getProfileSessionsCore,
  getProfileWithEvents,
  getReportDataCore,
  getRetentionCohortCore,
  getRollingActiveUsersCore,
  getSettingsForProject,
  getTopPagesCore,
  getTrafficBreakdownCore,
  getUserFlowCore,
  getWeeklyRetentionSeriesCore,
  gscGetCannibalizationCore,
  gscGetOverviewCore,
  gscGetPageDetailsCore,
  gscGetQueryDetailsCore,
  gscGetQueryOpportunitiesCore,
  gscGetTopPagesCore,
  gscGetTopQueriesCore,
  listDashboardsCore,
  listEventNamesCore,
  listEventPropertiesCore,
  listGroupTypesCore,
  listProjectsCore,
  listReportsCore,
  queryEventsCore,
  querySessionsCore,
  resolveDateRange,
  type TrafficColumn,
} from '@openpanel/db';
import { zRange } from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveQueryProjectId(
  client: IServiceClientWithProject,
  urlProjectId: string | undefined
): string {
  if (client.type === ClientType.root) {
    if (!urlProjectId) {
      throw new Error('projectId URL parameter is required for root clients');
    }
    return urlProjectId;
  }
  if (!client.projectId) {
    throw new Error('Client is not associated with a project');
  }
  return client.projectId;
}

export const zDateRange = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  // Convenience shorthand matching the insights API (e.g. ?range=7d, ?range=30d).
  // When provided without explicit startDate, it expands to a timezone-aware range.
  // Explicit startDate/endDate always take precedence.
  range: zRange.optional(),
});

type DateRangeInput = z.infer<typeof zDateRange>;

async function resolveDates(
  projectId: string,
  data: DateRangeInput
): Promise<{ startDate: string; endDate: string }> {
  // Explicit dates always win — range is only a shorthand when no startDate is given
  if (!data.range || data.startDate) {
    return resolveDateRange(data.startDate, data.endDate);
  }
  const { timezone } = await getSettingsForProject(projectId);
  // data.range is guaranteed non-nullish here (checked above); cast to satisfy
  // getChartStartEndDate which expects a non-optional range with a default value.
  return getChartStartEndDate(
    { startDate: data.startDate, endDate: data.endDate, range: data.range! },
    timezone
  );
}

type RequestWithProjectParam = FastifyRequest<{
  Params: { projectId?: string };
}>;

function getProjectId(req: RequestWithProjectParam): string {
  return resolveQueryProjectId(req.client!, req.params.projectId);
}

function getOrgId(req: RequestWithProjectParam): string {
  return req.client!.organizationId;
}

function getClientType(req: RequestWithProjectParam): 'root' | 'read' {
  return req.client!.type === ClientType.root ? 'root' : 'read';
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function listProjects(req: FastifyRequest, reply: FastifyReply) {
  const client = req.client!;
  return reply.send(
    await listProjectsCore({
      clientType: getClientType(req as RequestWithProjectParam),
      organizationId: client.organizationId,
      projectId: client.projectId ?? null,
    })
  );
}

// ---------------------------------------------------------------------------
// Analytics — overview
// ---------------------------------------------------------------------------

export const zOverviewQuery = zDateRange.extend({
  interval: z.enum(['hour', 'day', 'week', 'month']).optional(),
});

export async function getOverview(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zOverviewQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  const { startDate, endDate } = await resolveDates(projectId, req.query);
  return reply.send(
    await getAnalyticsOverviewCore({
      projectId,
      startDate,
      endDate,
      interval: req.query.interval,
    })
  );
}

// ---------------------------------------------------------------------------
// Analytics — active users
// ---------------------------------------------------------------------------

export const zActiveUsersQuery = z.object({
  days: z.number().int().min(1).max(90).default(7),
});

export async function getActiveUsers(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zActiveUsersQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  return reply.send(
    await getRollingActiveUsersCore({ projectId, days: req.query.days })
  );
}

// ---------------------------------------------------------------------------
// Analytics — retention series
// ---------------------------------------------------------------------------

export async function getRetentionSeries(
  req: FastifyRequest<{ Params: { projectId?: string } }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  return reply.send(await getWeeklyRetentionSeriesCore(projectId));
}

// ---------------------------------------------------------------------------
// Analytics — retention cohort
// ---------------------------------------------------------------------------

export async function getRetentionCohort(
  req: FastifyRequest<{ Params: { projectId?: string } }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  return reply.send(await getRetentionCohortCore(projectId));
}

// ---------------------------------------------------------------------------
// Analytics — pages (top)
// ---------------------------------------------------------------------------

export async function getTopPages(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zDateRange>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  const { startDate, endDate } = await resolveDates(projectId, req.query);
  return reply.send(await getTopPagesCore({ projectId, startDate, endDate }));
}

// ---------------------------------------------------------------------------
// Analytics — pages (entry/exit)
// ---------------------------------------------------------------------------

export const zEntryExitQuery = zDateRange.extend({
  mode: z.enum(['entry', 'exit']).default('entry'),
});

export async function getEntryExitPages(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zEntryExitQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  const { startDate, endDate } = await resolveDates(projectId, req.query);
  return reply.send(
    await getEntryExitPagesCore({
      projectId,
      startDate,
      endDate,
      mode: req.query.mode,
    })
  );
}

// ---------------------------------------------------------------------------
// Analytics — page performance
// ---------------------------------------------------------------------------

export const zPagePerfQuery = zDateRange.extend({
  search: z.string().optional(),
  sortBy: z
    .enum(['sessions', 'pageviews', 'bounce_rate', 'avg_duration'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(500).default(50),
});

export async function getPagePerformance(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zPagePerfQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  const { startDate, endDate } = await resolveDates(projectId, req.query);
  return reply.send(
    await getPagePerformanceCore({
      projectId,
      startDate,
      endDate,
      ...req.query,
    })
  );
}

// ---------------------------------------------------------------------------
// Analytics — funnel
// ---------------------------------------------------------------------------

export const zFunnelQuery = zDateRange.extend({
  steps: z
    .union([z.array(z.string()), z.string().transform((s) => [s])])
    .refine((a) => a.length >= 2 && a.length <= 10, {
      message: 'steps must have between 2 and 10 items',
    }),
  windowHours: z.number().int().min(1).max(720).default(24),
  groupBy: z.enum(['session_id', 'profile_id']).default('session_id'),
});

export async function getFunnel(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zFunnelQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  const { startDate, endDate } = await resolveDates(projectId, req.query);
  return reply.send(
    await getFunnelCore({
      projectId,
      startDate,
      endDate,
      steps: req.query.steps,
      windowHours: req.query.windowHours,
      groupBy: req.query.groupBy,
    })
  );
}

// ---------------------------------------------------------------------------
// Analytics — traffic (referrers / geo / devices)
// ---------------------------------------------------------------------------

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

export const zReferrerQuery = zDateRange.extend({
  breakdown: z.enum(referrerColumns).default('referrer_name'),
});

export const zGeoQuery = zDateRange.extend({
  breakdown: z.enum(geoColumns).default('country'),
});

export const zDeviceQuery = zDateRange.extend({
  breakdown: z.enum(deviceColumns).default('device'),
});

export async function getTrafficReferrers(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zReferrerQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  const { startDate, endDate } = await resolveDates(projectId, req.query);
  return reply.send(
    await getTrafficBreakdownCore({
      projectId,
      startDate,
      endDate,
      column: req.query.breakdown as TrafficColumn,
    })
  );
}

export async function getTrafficGeo(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zGeoQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  const { startDate, endDate } = await resolveDates(projectId, req.query);
  return reply.send(
    await getTrafficBreakdownCore({
      projectId,
      startDate,
      endDate,
      column: req.query.breakdown as TrafficColumn,
    })
  );
}

export async function getTrafficDevices(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zDeviceQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  const { startDate, endDate } = await resolveDates(projectId, req.query);
  return reply.send(
    await getTrafficBreakdownCore({
      projectId,
      startDate,
      endDate,
      column: req.query.breakdown as TrafficColumn,
    })
  );
}

// ---------------------------------------------------------------------------
// Analytics — user flow
// ---------------------------------------------------------------------------

export const zUserFlowQuery = zDateRange.extend({
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

export async function getUserFlow(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zUserFlowQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  const { startDate, endDate } = await resolveDates(projectId, req.query);
  return reply.send(
    await getUserFlowCore({ projectId, startDate, endDate, ...req.query })
  );
}

// ---------------------------------------------------------------------------
// Analytics — engagement
// ---------------------------------------------------------------------------

export async function getEngagement(
  req: FastifyRequest<{ Params: { projectId?: string } }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  return reply.send(await getEngagementCore(projectId));
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const zEventsQuery = zDateRange.extend({
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
  limit: z.number().int().min(1).max(100).default(20),
});

export async function queryEvents(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zEventsQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  return reply.send(await queryEventsCore({ projectId, ...req.query }));
}

export async function listEventNames(
  req: FastifyRequest<{ Params: { projectId?: string } }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  return reply.send(await listEventNamesCore(projectId));
}

export const zEventPropertiesQuery = z.object({
  eventName: z.string().optional(),
});

export async function listEventProperties(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zEventPropertiesQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  return reply.send(
    await listEventPropertiesCore({ projectId, eventName: req.query.eventName })
  );
}

export const zPropertyValuesQuery = z.object({
  eventName: z.string(),
  propertyKey: z.string(),
});

export async function getEventPropertyValues(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zPropertyValuesQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  return reply.send(
    await getEventPropertyValuesCore({ projectId, ...req.query })
  );
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export const zProfilesQuery = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  device: z.string().optional(),
  browser: z.string().optional(),
  inactiveDays: z.number().int().min(1).optional(),
  minSessions: z.number().int().min(1).optional(),
  performedEvent: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit: z.number().int().min(1).max(100).default(20),
});

export async function findProfiles(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zProfilesQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  return reply.send(await findProfilesCore({ projectId, ...req.query }));
}

export const zGetProfileQuery = z.object({
  eventLimit: z.number().int().min(1).max(100).default(20),
});

export async function getProfile(
  req: FastifyRequest<{
    Params: { projectId?: string; profileId: string };
    Querystring: z.infer<typeof zGetProfileQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  const result = await getProfileWithEvents(
    projectId,
    req.params.profileId,
    req.query.eventLimit
  );
  if (!result.profile) {
    return reply
      .status(404)
      .send({ error: 'Profile not found', profileId: req.params.profileId });
  }
  return reply.send({
    profile: result.profile,
    recentEvents: result.recent_events,
  });
}

export const zProfileSessionsQuery = z.object({
  limit: z.number().int().min(1).max(100).default(20),
});

export async function getProfileSessions(
  req: FastifyRequest<{
    Params: { projectId?: string; profileId: string };
    Querystring: z.infer<typeof zProfileSessionsQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  return reply.send(
    await getProfileSessionsCore(
      projectId,
      req.params.profileId,
      req.query.limit
    )
  );
}

export async function getProfileMetrics(
  req: FastifyRequest<{ Params: { projectId?: string; profileId: string } }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  return reply.send(
    await getProfileMetricsCore({ projectId, profileId: req.params.profileId })
  );
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const zSessionsQuery = zDateRange.extend({
  country: z.string().optional(),
  city: z.string().optional(),
  device: z.string().optional(),
  browser: z.string().optional(),
  os: z.string().optional(),
  referrer: z.string().optional(),
  referrerName: z.string().optional(),
  referrerType: z.string().optional(),
  profileId: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export async function querySessions(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zSessionsQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  return reply.send(await querySessionsCore({ projectId, ...req.query }));
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export async function listGroupTypes(
  req: FastifyRequest<{ Params: { projectId?: string } }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  return reply.send(await listGroupTypesCore(projectId));
}

export const zGroupsQuery = z.object({
  type: z.string().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export async function findGroups(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zGroupsQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  return reply.send(await findGroupsCore({ projectId, ...req.query }));
}

export const zGetGroupQuery = z.object({
  memberLimit: z.number().int().min(1).max(50).default(10),
});

export async function getGroup(
  req: FastifyRequest<{
    Params: { projectId?: string; groupId: string };
    Querystring: z.infer<typeof zGetGroupQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  return reply.send(
    await getGroupCore({
      projectId,
      groupId: req.params.groupId,
      memberLimit: req.query.memberLimit,
    })
  );
}

// ---------------------------------------------------------------------------
// Dashboards & reports
// ---------------------------------------------------------------------------

export async function listDashboards(
  req: FastifyRequest<{ Params: { projectId?: string } }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  const organizationId = getOrgId(req as RequestWithProjectParam);
  return reply.send(await listDashboardsCore({ projectId, organizationId }));
}

export async function listReports(
  req: FastifyRequest<{ Params: { projectId?: string; dashboardId: string } }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  const organizationId = getOrgId(req as RequestWithProjectParam);
  return reply.send(
    await listReportsCore({
      projectId,
      dashboardId: req.params.dashboardId,
      organizationId,
    })
  );
}

export async function getReportData(
  req: FastifyRequest<{ Params: { projectId?: string; reportId: string } }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  const organizationId = getOrgId(req as RequestWithProjectParam);
  return reply.send(
    await getReportDataCore({
      projectId,
      reportId: req.params.reportId,
      organizationId,
    })
  );
}

// ---------------------------------------------------------------------------
// Google Search Console
// ---------------------------------------------------------------------------

export const zGscOverviewQuery = zDateRange.extend({
  interval: z.enum(['day', 'week', 'month']).default('day'),
});

export async function gscOverview(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zGscOverviewQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  const { startDate, endDate } = await resolveDates(projectId, req.query);
  return reply.send(
    await gscGetOverviewCore({
      projectId,
      startDate,
      endDate,
      interval: req.query.interval,
    })
  );
}

export const zGscLimitQuery = zDateRange.extend({
  limit: z.number().int().min(1).max(1000).default(100),
});

export async function gscPages(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zGscLimitQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  const { startDate, endDate } = await resolveDates(projectId, req.query);
  return reply.send(
    await gscGetTopPagesCore({
      projectId,
      startDate,
      endDate,
      limit: req.query.limit,
    })
  );
}

export const zGscPageDetailsQuery = zDateRange.extend({
  page: z.string().url(),
});

export async function gscPageDetails(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zGscPageDetailsQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  const { startDate, endDate } = await resolveDates(projectId, req.query);
  return reply.send(
    await gscGetPageDetailsCore({
      projectId,
      startDate,
      endDate,
      page: req.query.page,
    })
  );
}

export async function gscQueries(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zGscLimitQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  const { startDate, endDate } = await resolveDates(projectId, req.query);
  return reply.send(
    await gscGetTopQueriesCore({
      projectId,
      startDate,
      endDate,
      limit: req.query.limit,
    })
  );
}

export const zGscQueryDetailsQuery = zDateRange.extend({
  query: z.string(),
});

export async function gscQueryDetails(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zGscQueryDetailsQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  const { startDate, endDate } = await resolveDates(projectId, req.query);
  return reply.send(
    await gscGetQueryDetailsCore({
      projectId,
      startDate,
      endDate,
      query: req.query.query,
    })
  );
}

export const zGscOpportunitiesQuery = zDateRange.extend({
  minImpressions: z.number().int().min(1).default(50),
});

export async function gscQueryOpportunities(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zGscOpportunitiesQuery>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  const { startDate, endDate } = await resolveDates(projectId, req.query);
  return reply.send(
    await gscGetQueryOpportunitiesCore({
      projectId,
      startDate,
      endDate,
      minImpressions: req.query.minImpressions,
    })
  );
}

export async function gscCannibalization(
  req: FastifyRequest<{
    Params: { projectId?: string };
    Querystring: z.infer<typeof zDateRange>;
  }>,
  reply: FastifyReply
) {
  const projectId = getProjectId(req as RequestWithProjectParam);
  const { startDate, endDate } = await resolveDates(projectId, req.query);
  return reply.send(
    await gscGetCannibalizationCore({ projectId, startDate, endDate })
  );
}
