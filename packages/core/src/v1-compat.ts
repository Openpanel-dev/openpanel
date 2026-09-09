// V1 COMPAT SEAM — what is left of it.
//
// M15-004 removed class (b): the 204 deps-threading wrappers that reached
// Postgres/ClickHouse through this file's boot-scoped `ServiceDeps` on behalf
// of a caller that already held one. Every one of those callers now passes the
// `deps` it was handed, so a converted read path carries the requestId minted
// at the edge all the way to the query (ADR-018, ADR-022 amendment A3) instead
// of losing it here.
//
// What remains is class (a) — the sibling-service wrappers, which need a
// service graph rather than a connection and die with R3's `services()`
// accessor (M15-005) — plus three seams that belong to neither:
// `compatPrisma` (the `Prisma` namespace, a sentinel value, not a client),
// `compatChHelpers` (ADR-013's still-unconverted query helpers) and
// `compatDb`, kept for `shared/access-lookups.ts` alone: its three lookups are
// `cacheable`, keyed on their ARGUMENTS, and their bare signature is pinned by
// the protected wire contract `verification/contracts/auth/
// group-b-project-access.mts` through `packages/db`'s re-export shim.
//
// Nothing that has a `Ctx` comes through here. HTTP routes, core's own
// procedures and job handlers all use `ctx.services.*`, built from the
// request-scoped ctx.
//
// A process that never builds `AppDeps` — this package's own unit suites,
// which exercise a service directly — falls back to the singletons the deleted
// module-level `loadDb()` / `loadChClient()` loaders reached. The fallback is
// LAZY: importing `@openpanel/core` still constructs no database, which is
// what keeps `bun test` runnable offline.

import {
  getRawWhereClause,
  isPageFilter,
} from './modules/overview/overview.service';
import { createServices, type ServiceDeps, type Services } from './services';

let registered: Services | undefined;
let registeredDeps: ServiceDeps | undefined;

/** Called once from `main.ts`, right after `AppDeps` is built. */
export function setV1CompatServices(deps: ServiceDeps): void {
  registeredDeps = deps;
  registered = createServices(deps);
}

/** Test-only: drop the registration so one suite cannot answer the next. */
export function resetV1CompatServicesForTests(): void {
  registered = undefined;
  registeredDeps = undefined;
  fallback = undefined;
}

/** What the boot scope stamps on jobs enqueued through this seam — there is
 *  no request to correlate with, and saying so beats a random id. */
export const V1_COMPAT_REQUEST_ID = 'v1-compat';

function unbuilt(field: string): never {
  throw new Error(
    `ServiceDeps.${field} is only available once main.ts has called setV1CompatServices(deps)`
  );
}

let fallback: Promise<ServiceDeps> | undefined;

function fallbackServiceDeps(): Promise<ServiceDeps> {
  fallback ??= (async () => {
    // `createLogger` is packages/db's own pino factory — the one that already
    // writes `chQuery`'s `query info` line today — so a caller that reaches
    // this fallback logs exactly what it logged before M10-003.
    const [{ db }, { ch }, { getRedisCache }, { createLogger }] =
      await Promise.all([
        import('@openpanel/db/src/prisma-client'),
        import('@openpanel/db/src/clickhouse/client'),
        import('@openpanel/redis'),
        import('@openpanel/db/src/logger'),
      ]);
    return {
      db,
      ch,
      redis: getRedisCache(),
      logger: createLogger({ name: 'v1-compat' }),
      get clients(): never {
        return unbuilt('clients');
      },
      get buffers(): never {
        return unbuilt('buffers');
      },
      get queues(): never {
        return unbuilt('queues');
      },
    };
  })();
  return fallback;
}

function compatServiceDeps(): Promise<ServiceDeps> {
  return registeredDeps
    ? Promise.resolve(registeredDeps)
    : fallbackServiceDeps();
}

function services(): Promise<Services> {
  return registered
    ? Promise.resolve(registered)
    : fallbackServiceDeps().then(createServices);
}

/**
 * The one deps-free Postgres handle left (M15-004). `shared/access-lookups.ts`
 * keeps it because its three lookups are `cacheable` on their ARGUMENTS and
 * their bare signature is a protected wire contract
 * (`verification/contracts/auth/group-b-project-access.mts` imports them
 * through `packages/db/src/services/access.service.ts`). Every other caller of
 * this seam now passes the `deps` it holds.
 */
export async function compatDb(): Promise<ServiceDeps['db']> {
  return (await compatServiceDeps()).db;
}
/**
 * `subscription.service.ts` (has `deps`, but `deps.db`'s type is the client
 * instance, not the namespace) and `mcp`'s `dashboard-management.ts` (no
 * `deps` at all) both need `Prisma.DbNull` — a plain sentinel value, not a
 * client — to write an explicit SQL NULL onto a nullable Json column. The
 * namespace lives in the same module as the constructed `db` singleton, so
 * this seam is the only way to reach it without either module importing
 * `@openpanel/db` itself.
 */
export async function compatPrisma(): Promise<
  typeof import('@openpanel/db/src/prisma-client').Prisma
> {
  return (await import('@openpanel/db/src/prisma-client')).Prisma;
}

/**
 * ADR-013 keeps `chQuery`/`TABLE_NAMES` alive until the analytics read path's
 * conversion (one query per task, old-vs-new result sets diffed) —
 * `misc.service.ts`'s still-unconverted queries reach the query-building
 * helpers here instead of importing `@openpanel/db` themselves. The CLIENT
 * itself is still `deps.ch` (M15-004 deleted `compatCh`); this is only the
 * pure helpers that live beside it. (M12-006 converted the other two callers,
 * `project.service.ts` and mcp's `analytics/property-values.ts`.)
 *
 * M12-008 dropped the `clix` member: `legacy-scan.ts` and `widget.rpc.ts` were
 * its last consumers in core, and nothing destructured it from here any more.
 * Core no longer reaches the builder at all, which is what lets M12-009 delete
 * `query-builder.ts`.
 */
export async function compatChHelpers(): Promise<{
  TABLE_NAMES: typeof import('@openpanel/db/src/clickhouse/client').TABLE_NAMES;
  chQuery: typeof import('@openpanel/db/src/clickhouse/client').chQuery;
  convertClickhouseDateToJs: typeof import('@openpanel/db/src/clickhouse/client').convertClickhouseDateToJs;
  formatClickhouseDate: typeof import('@openpanel/db/src/clickhouse/client').formatClickhouseDate;
  toNullIfDefaultMinDate: typeof import('@openpanel/db/src/clickhouse/client').toNullIfDefaultMinDate;
}> {
  const client = await import('@openpanel/db/src/clickhouse/client');
  return {
    TABLE_NAMES: client.TABLE_NAMES,
    chQuery: client.chQuery,
    convertClickhouseDateToJs: client.convertClickhouseDateToJs,
    formatClickhouseDate: client.formatClickhouseDate,
    toNullIfDefaultMinDate: client.toNullIfDefaultMinDate,
  };
}

// --- chart -----------------------------------------------------------------

export const getProjectCard: Services['chart']['getProjectCard'] = (...args) =>
  services().then((container) => container.chart.getProjectCard(...args));
export const listChartEvents: Services['chart']['listChartEvents'] = (
  ...args
) => services().then((container) => container.chart.listChartEvents(...args));
export const listChartProperties: Services['chart']['listChartProperties'] = (
  ...args
) =>
  services().then((container) => container.chart.listChartProperties(...args));
export const getChartPropertyValues: Services['chart']['getChartPropertyValues'] =
  (...args) =>
    services().then((container) =>
      container.chart.getChartPropertyValues(...args)
    );
export const getChartBucketProfiles: Services['chart']['bucketProfiles'] = (
  ...args
) => services().then((container) => container.chart.bucketProfiles(...args));
export const getFunnelStepProfiles: Services['chart']['funnelStepProfiles'] = (
  ...args
) =>
  services().then((container) => container.chart.funnelStepProfiles(...args));
export const executeChart: Services['chart']['execute'] = (...args) =>
  services().then((container) => container.chart.execute(...args));
export const executeAggregateChart: Services['chart']['executeAggregate'] = (
  ...args
) => services().then((container) => container.chart.executeAggregate(...args));
export const ChartEngine = { execute: executeChart };
export const AggregateChartEngine = { execute: executeAggregateChart };

// --- funnel / conversion / sankey / retention ------------------------------

export const getFunnelChart: Services['chart']['getFunnelChart'] = (...args) =>
  services().then((container) => container.chart.getFunnelChart(...args));
export const getFunnel: Services['chart']['getFunnel'] = (...args) =>
  services().then((container) => container.chart.getFunnel(...args));
export const getFunnelCore: Services['chart']['getFunnelCore'] = (...args) =>
  services().then((container) => container.chart.getFunnelCore(...args));
export const buildFunnelBase: Services['chart']['buildFunnelBase'] = (
  ...args
) => services().then((container) => container.chart.buildFunnelBase(...args));
export const getFunnelProfileIds: Services['chart']['getFunnelProfileIds'] = (
  ...args
) =>
  services().then((container) => container.chart.getFunnelProfileIds(...args));
export const getConversionChart: Services['chart']['getConversionChart'] = (
  ...args
) =>
  services().then((container) => container.chart.getConversionChart(...args));
export const getConversion: Services['chart']['getConversion'] = (...args) =>
  services().then((container) => container.chart.getConversion(...args));
export const getSankeyChart: Services['chart']['getSankeyChart'] = (...args) =>
  services().then((container) => container.chart.getSankeyChart(...args));
export const getSankey: Services['chart']['getSankey'] = (...args) =>
  services().then((container) => container.chart.getSankey(...args));
export const getUserFlowCore: Services['chart']['getUserFlowCore'] = (
  ...args
) => services().then((container) => container.chart.getUserFlowCore(...args));
export const getRetentionChart: Services['chart']['getRetentionChart'] = (
  ...args
) => services().then((container) => container.chart.getRetentionChart(...args));
export const getRetentionCohort: Services['chart']['getRetentionCohort'] = (
  ...args
) =>
  services().then((container) => container.chart.getRetentionCohort(...args));
export const getRetentionCohortCore: Services['chart']['getRetentionCohortCore'] =
  (...args) =>
    services().then((container) =>
      container.chart.getRetentionCohortCore(...args)
    );
export const getRetentionSeries: Services['chart']['getRetentionSeries'] = (
  ...args
) =>
  services().then((container) => container.chart.getRetentionSeries(...args));
export const getRetentionLastSeenSeries: Services['chart']['getRetentionLastSeenSeries'] =
  (...args) =>
    services().then((container) =>
      container.chart.getRetentionLastSeenSeries(...args)
    );
export const getRollingActiveUsers: Services['chart']['getRollingActiveUsers'] =
  (...args) =>
    services().then((container) =>
      container.chart.getRollingActiveUsers(...args)
    );
export const getRollingActiveUsersCore: Services['chart']['getRollingActiveUsersCore'] =
  (...args) =>
    services().then((container) =>
      container.chart.getRollingActiveUsersCore(...args)
    );
export const getWeeklyRetentionSeriesCore: Services['chart']['getWeeklyRetentionSeriesCore'] =
  (...args) =>
    services().then((container) =>
      container.chart.getWeeklyRetentionSeriesCore(...args)
    );
export const getEngagementCore: Services['chart']['getEngagementCore'] = (
  ...args
) => services().then((container) => container.chart.getEngagementCore(...args));

// --- report ----------------------------------------------------------------

export const getReportsByDashboardId: Services['report']['getReportsByDashboardId'] =
  (...args) =>
    services().then((container) =>
      container.report.getReportsByDashboardId(...args)
    );
export const getReportById: Services['report']['getReportById'] = (...args) =>
  services().then((container) => container.report.getReportById(...args));
export const getReportByIdOrThrow: Services['report']['getReportByIdOrThrow'] =
  (...args) =>
    services().then((container) =>
      container.report.getReportByIdOrThrow(...args)
    );
export const listReportsCore: Services['report']['listReportsCore'] = (
  ...args
) => services().then((container) => container.report.listReportsCore(...args));
export const getReportDataCore: Services['report']['getReportDataCore'] = (
  ...args
) =>
  services().then((container) => container.report.getReportDataCore(...args));
export const createReport: Services['report']['createReport'] = (...args) =>
  services().then((container) => container.report.createReport(...args));
export const updateReport: Services['report']['updateReport'] = (...args) =>
  services().then((container) => container.report.updateReport(...args));
export const moveReport: Services['report']['moveReport'] = (...args) =>
  services().then((container) => container.report.moveReport(...args));
export const deleteReport: Services['report']['deleteReport'] = (...args) =>
  services().then((container) => container.report.deleteReport(...args));
export const duplicateReport: Services['report']['duplicateReport'] = (
  ...args
) => services().then((container) => container.report.duplicateReport(...args));
export const updateReportLayout: Services['report']['updateReportLayout'] = (
  ...args
) =>
  services().then((container) => container.report.updateReportLayout(...args));
export const getReportLayouts: Services['report']['getReportLayouts'] = (
  ...args
) => services().then((container) => container.report.getReportLayouts(...args));
export const resetReportLayouts: Services['report']['resetReportLayouts'] = (
  ...args
) =>
  services().then((container) => container.report.resetReportLayouts(...args));

// --- dashboard -------------------------------------------------------------

export const getDashboardById: Services['dashboard']['getDashboardById'] = (
  ...args
) =>
  services().then((container) => container.dashboard.getDashboardById(...args));
export const getDashboardByIdOrThrow: Services['dashboard']['getDashboardByIdOrThrow'] =
  (...args) =>
    services().then((container) =>
      container.dashboard.getDashboardByIdOrThrow(...args)
    );
export const getDashboardsByProjectId: Services['dashboard']['getDashboardsByProjectId'] =
  (...args) =>
    services().then((container) =>
      container.dashboard.getDashboardsByProjectId(...args)
    );
export const listDashboardsCore: Services['dashboard']['listDashboardsCore'] = (
  ...args
) =>
  services().then((container) =>
    container.dashboard.listDashboardsCore(...args)
  );
export const createDashboard: Services['dashboard']['createDashboard'] = (
  ...args
) =>
  services().then((container) => container.dashboard.createDashboard(...args));
export const updateDashboard: Services['dashboard']['updateDashboard'] = (
  ...args
) =>
  services().then((container) => container.dashboard.updateDashboard(...args));
export const deleteDashboard: Services['dashboard']['deleteDashboard'] = (
  ...args
) =>
  services().then((container) => container.dashboard.deleteDashboard(...args));

// --- share -----------------------------------------------------------------

export const getShareOverviewById: Services['share']['getShareOverviewById'] = (
  ...args
) =>
  services().then((container) => container.share.getShareOverviewById(...args));
export const getShareByProjectId: Services['share']['getShareByProjectId'] = (
  ...args
) =>
  services().then((container) => container.share.getShareByProjectId(...args));
export const getShareDashboardById: Services['share']['getShareDashboardById'] =
  (...args) =>
    services().then((container) =>
      container.share.getShareDashboardById(...args)
    );
export const getShareDashboardByDashboardId: Services['share']['getShareDashboardByDashboardId'] =
  (...args) =>
    services().then((container) =>
      container.share.getShareDashboardByDashboardId(...args)
    );
export const getShareReportById: Services['share']['getShareReportById'] = (
  ...args
) =>
  services().then((container) => container.share.getShareReportById(...args));
export const getShareReportByReportId: Services['share']['getShareReportByReportId'] =
  (...args) =>
    services().then((container) =>
      container.share.getShareReportByReportId(...args)
    );
export const validateReportAccess: Services['share']['validateReportAccess'] = (
  ...args
) =>
  services().then((container) => container.share.validateReportAccess(...args));
export const validateShareAccess: Services['share']['validateShareAccess'] = (
  ...args
) =>
  services().then((container) => container.share.validateShareAccess(...args));
export const validateOverviewShareAccess: Services['share']['validateOverviewShareAccess'] =
  (...args) =>
    services().then((container) =>
      container.share.validateOverviewShareAccess(...args)
    );
export const getShareOverview: Services['share']['getShareOverview'] = (
  ...args
) => services().then((container) => container.share.getShareOverview(...args));
export const getShareOverviewSettings: Services['share']['getShareOverviewSettings'] =
  (...args) =>
    services().then((container) =>
      container.share.getShareOverviewSettings(...args)
    );
export const createShareOverview: Services['share']['createShareOverview'] = (
  ...args
) =>
  services().then((container) => container.share.createShareOverview(...args));
export const getShareDashboard: Services['share']['getShareDashboard'] = (
  ...args
) => services().then((container) => container.share.getShareDashboard(...args));
export const getShareDashboardSettings: Services['share']['getShareDashboardSettings'] =
  (...args) =>
    services().then((container) =>
      container.share.getShareDashboardSettings(...args)
    );
export const createShareDashboard: Services['share']['createShareDashboard'] = (
  ...args
) =>
  services().then((container) => container.share.createShareDashboard(...args));
export const getShareDashboardReports: Services['share']['getShareDashboardReports'] =
  (...args) =>
    services().then((container) =>
      container.share.getShareDashboardReports(...args)
    );
export const getShareReport: Services['share']['getShareReport'] = (...args) =>
  services().then((container) => container.share.getShareReport(...args));
export const getShareReportSettings: Services['share']['getShareReportSettings'] =
  (...args) =>
    services().then((container) =>
      container.share.getShareReportSettings(...args)
    );
export const createShareReport: Services['share']['createShareReport'] = (
  ...args
) => services().then((container) => container.share.createShareReport(...args));

// --- reference -------------------------------------------------------------

export const getReferenceById: Services['reference']['getReferenceById'] = (
  ...args
) =>
  services().then((container) => container.reference.getReferenceById(...args));
export const getReferenceByIdOrThrow: Services['reference']['getReferenceByIdOrThrow'] =
  (...args) =>
    services().then((container) =>
      container.reference.getReferenceByIdOrThrow(...args)
    );
export const listReferences: Services['reference']['listReferences'] = (
  ...args
) =>
  services().then((container) => container.reference.listReferences(...args));
export const createReference: Services['reference']['createReference'] = (
  ...args
) =>
  services().then((container) => container.reference.createReference(...args));
export const updateReference: Services['reference']['updateReference'] = (
  ...args
) =>
  services().then((container) => container.reference.updateReference(...args));
export const deleteReference: Services['reference']['deleteReference'] = (
  ...args
) =>
  services().then((container) => container.reference.deleteReference(...args));
export const getChartReferences: Services['reference']['getChartReferences'] = (
  ...args
) =>
  services().then((container) =>
    container.reference.getChartReferences(...args)
  );

// --- client ------------------------------------------------------------

export const getClientById: Services['client']['getClientById'] = (...args) =>
  services().then((container) => container.client.getClientById(...args));
export const getClientByIdCached: Services['client']['getClientByIdCached'] = (
  ...args
) =>
  services().then((container) => container.client.getClientByIdCached(...args));
export const clearClientByIdCache: Services['client']['clearClientByIdCache'] =
  (...args) =>
    services().then((container) =>
      container.client.clearClientByIdCache(...args)
    );
export const getClientsByOrganizationId: Services['client']['getClientsByOrganizationId'] =
  (...args) =>
    services().then((container) =>
      container.client.getClientsByOrganizationId(...args)
    );
export const getClientsByProjectId: Services['client']['getClientsByProjectId'] =
  (...args) =>
    services().then((container) =>
      container.client.getClientsByProjectId(...args)
    );
export const listClientsForOrganization: Services['client']['listClientsForOrganization'] =
  (...args) =>
    services().then((container) =>
      container.client.listClientsForOrganization(...args)
    );
export const getClientForOrganization: Services['client']['getClientForOrganization'] =
  (...args) =>
    services().then((container) =>
      container.client.getClientForOrganization(...args)
    );
export const createClientForOrganization: Services['client']['createClientForOrganization'] =
  (...args) =>
    services().then((container) =>
      container.client.createClientForOrganization(...args)
    );
export const updateClientForOrganization: Services['client']['updateClientForOrganization'] =
  (...args) =>
    services().then((container) =>
      container.client.updateClientForOrganization(...args)
    );
export const deleteClientForOrganization: Services['client']['deleteClientForOrganization'] =
  (...args) =>
    services().then((container) =>
      container.client.deleteClientForOrganization(...args)
    );

// --- project -------------------------------------------------------------

export const getProjectById: Services['project']['getProjectById'] = (
  ...args
) => services().then((container) => container.project.getProjectById(...args));
export const getProjectByIdCached: Services['project']['getProjectByIdCached'] =
  (...args) =>
    services().then((container) =>
      container.project.getProjectByIdCached(...args)
    );
export const clearProjectByIdCache: Services['project']['clearProjectByIdCache'] =
  (...args) =>
    services().then((container) =>
      container.project.clearProjectByIdCache(...args)
    );
export const getProjectWithClients: Services['project']['getProjectWithClients'] =
  (...args) =>
    services().then((container) =>
      container.project.getProjectWithClients(...args)
    );
export const getProjects: Services['project']['getProjects'] = (...args) =>
  services().then((container) => container.project.getProjects(...args));
export const getProjectEventsCount: Services['project']['getProjectEventsCount'] =
  (...args) =>
    services().then((container) =>
      container.project.getProjectEventsCount(...args)
    );
export const getLastEventPerProject: Services['project']['getLastEventPerProject'] =
  (...args) =>
    services().then((container) =>
      container.project.getLastEventPerProject(...args)
    );
export const resolveClientProjectId: Services['project']['resolveClientProjectId'] =
  (...args) =>
    services().then((container) =>
      container.project.resolveClientProjectId(...args)
    );
export const getProjectActivationStatus: Services['project']['getProjectActivationStatus'] =
  (...args) =>
    services().then((container) =>
      container.project.getProjectActivationStatus(...args)
    );
export const listProjectsCore: Services['project']['listProjectsCore'] = (
  ...args
) =>
  services().then((container) => container.project.listProjectsCore(...args));
export const listProjectsForOrganization: Services['project']['listProjectsForOrganization'] =
  (...args) =>
    services().then((container) =>
      container.project.listProjectsForOrganization(...args)
    );
export const getProjectForOrganization: Services['project']['getProjectForOrganization'] =
  (...args) =>
    services().then((container) =>
      container.project.getProjectForOrganization(...args)
    );
export const createProjectForOrganization: Services['project']['createProjectForOrganization'] =
  (...args) =>
    services().then((container) =>
      container.project.createProjectForOrganization(...args)
    );
export const updateProjectForOrganization: Services['project']['updateProjectForOrganization'] =
  (...args) =>
    services().then((container) =>
      container.project.updateProjectForOrganization(...args)
    );
export const deleteProjectForOrganization: Services['project']['deleteProjectForOrganization'] =
  (...args) =>
    services().then((container) =>
      container.project.deleteProjectForOrganization(...args)
    );
export const scheduleProjectDeletion: Services['project']['scheduleProjectDeletion'] =
  (...args) =>
    services().then((container) =>
      container.project.scheduleProjectDeletion(...args)
    );
export const cancelProjectDeletion: Services['project']['cancelProjectDeletion'] =
  (...args) =>
    services().then((container) =>
      container.project.cancelProjectDeletion(...args)
    );

// --- user ------------------------------------------------------------------

export const getUserById: Services['user']['getUserById'] = (...args) =>
  services().then((container) => container.user.getUserById(...args));
export const getUserAccount: Services['user']['getUserAccount'] = (...args) =>
  services().then((container) => container.user.getUserAccount(...args));
export const listUserDeletionBlockers: Services['user']['listUserDeletionBlockers'] =
  (...args) =>
    services().then((container) =>
      container.user.listUserDeletionBlockers(...args)
    );
export const deleteUserAccount: Services['user']['deleteUserAccount'] = (
  ...args
) => services().then((container) => container.user.deleteUserAccount(...args));
export const updateUserProfile: Services['user']['updateUserProfile'] = (
  ...args
) => services().then((container) => container.user.updateUserProfile(...args));

// --- subscription ------------------------------------------------------

// `getCurrentSubscriptionProduct` never touched Postgres directly, so it
// kept its bare signature straight through — no wrapper needed, exported
// directly from subscription.service.ts on the barrel.
export const checkout: Services['subscription']['checkout'] = (...args) =>
  services().then((container) => container.subscription.checkout(...args));
export const listProducts: Services['subscription']['listProducts'] = (
  ...args
) =>
  services().then((container) => container.subscription.listProducts(...args));
export const getUsage: Services['subscription']['getUsage'] = (...args) =>
  services().then((container) => container.subscription.getUsage(...args));
export const cancelSubscription: Services['subscription']['cancelSubscription'] =
  (...args) =>
    services().then((container) =>
      container.subscription.cancelSubscription(...args)
    );
export const pauseSubscription: Services['subscription']['pauseSubscription'] =
  (...args) =>
    services().then((container) =>
      container.subscription.pauseSubscription(...args)
    );
export const resumeSubscription: Services['subscription']['resumeSubscription'] =
  (...args) =>
    services().then((container) =>
      container.subscription.resumeSubscription(...args)
    );
export const applySaveDiscount: Services['subscription']['applySaveDiscount'] =
  (...args) =>
    services().then((container) =>
      container.subscription.applySaveDiscount(...args)
    );
export const portal: Services['subscription']['portal'] = (...args) =>
  services().then((container) => container.subscription.portal(...args));

// --- salt ------------------------------------------------------------------

// `ingest.service.ts`'s `/track` hot path has no `Ctx` to reach
// `ctx.services.salt` from — see salt.service.ts's header for why `getSalts`
// stays bare here instead of gaining a `deps` parameter like every other
// function in this file.
export const getSalts: Services['salt']['getSalts'] = () =>
  services().then((container) => container.salt.getSalts());

// --- conversation ------------------------------------------------------

export const getConversationById: Services['conversation']['getConversationById'] =
  (...args) =>
    services().then((container) =>
      container.conversation.getConversationById(...args)
    );
export const listConversations: Services['conversation']['listConversations'] =
  (...args) =>
    services().then((container) =>
      container.conversation.listConversations(...args)
    );
export const upsertConversationTitle: Services['conversation']['upsertConversationTitle'] =
  (...args) =>
    services().then((container) =>
      container.conversation.upsertConversationTitle(...args)
    );
export const deleteConversation: Services['conversation']['deleteConversation'] =
  (...args) =>
    services().then((container) =>
      container.conversation.deleteConversation(...args)
    );

// V1's (now-deleted) `@openpanel/trpc` overview and event routers called
// these as OBJECTS (`overviewService.getMetrics(...)`,
// `pagesService.getTopPages(...)`), and one of them still did
// `.bind(overviewService)`. Both were module-singleton class instances
// before M10-005; here they are plain objects of bare wrappers, so those
// call sites read identically and `bind` stayed a no-op.
export const overviewService = {
  isPageFilter: (...args: Parameters<Services['overview']['isPageFilter']>) =>
    isPageFilter(...args),
  getRawWhereClause: (
    ...args: Parameters<Services['overview']['getRawWhereClause']>
  ) => getRawWhereClause(...args),
  getMetrics: ((...args) =>
    services().then((container) =>
      container.overview.getMetrics(...args)
    )) as Services['overview']['getMetrics'],
  getTopPages: ((...args) =>
    services().then((container) =>
      container.overview.getTopPages(...args)
    )) as Services['overview']['getTopPages'],
  getTopEntryExit: ((...args) =>
    services().then((container) =>
      container.overview.getTopEntryExit(...args)
    )) as Services['overview']['getTopEntryExit'],
  getTopGeneric: ((...args) =>
    services().then((container) =>
      container.overview.getTopGeneric(...args)
    )) as Services['overview']['getTopGeneric'],
  getTopGenericSeries: ((...args) =>
    services().then((container) =>
      container.overview.getTopGenericSeries(...args)
    )) as Services['overview']['getTopGenericSeries'],
  getUserJourney: ((...args) =>
    services().then((container) =>
      container.overview.getUserJourney(...args)
    )) as Services['overview']['getUserJourney'],
  getTopEvents: ((...args) =>
    services().then((container) =>
      container.overview.getTopEvents(...args)
    )) as Services['overview']['getTopEvents'],
  getTopLinkOut: ((...args) =>
    services().then((container) =>
      container.overview.getTopLinkOut(...args)
    )) as Services['overview']['getTopLinkOut'],
  getMapData: ((...args) =>
    services().then((container) =>
      container.overview.getMapData(...args)
    )) as Services['overview']['getMapData'],
  getLiveData: ((...args) =>
    services().then((container) =>
      container.overview.getLiveData(...args)
    )) as Services['overview']['getLiveData'],
};

export const pagesService = {
  getTopPages: ((...args) =>
    services().then((container) =>
      container.pages.getTopPages(...args)
    )) as Services['pages']['getTopPages'],
  getPageTimeseries: ((...args) =>
    services().then((container) =>
      container.pages.getPageTimeseries(...args)
    )) as Services['pages']['getPageTimeseries'],
};
