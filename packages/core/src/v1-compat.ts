// V1 COMPAT SEAM — one file, deleted whole when `packages/trpc` dies at P10.
//
// `apps/api/src/main.ts` still mounts `@openpanel/trpc`'s `appRouter`, not
// this package's `rpc.router.ts`, so V1's 28 routers are the live `/trpc`
// surface; the mcp and assistant tool runtimes call this package the same
// way. All of them reach a module through a BARE barrel export and have no
// `ServiceDeps` to hand it — `packages/trpc` is outside this wave's scope,
// so its call sites cannot change here.
//
// The alternative was to leave every module its own
// `import('@openpanel/db/...')` loader, which is exactly the drift
// docs/TECH_DEBT.md §4 exists to remove. Instead the boot scope registers
// the deps it has ALREADY built, once, here, and the barrel's V1 wrappers
// read them from this one place.
//
// Nothing that has a `Ctx` comes through here. HTTP routes, core's own
// procedures and job handlers all use `ctx.services.*`, built from the
// request-scoped ctx, so the requestId minted at the edge still reaches the
// query (ADR-018). What comes through this file gets the boot logger —
// exactly what those callers got before this wave, no worse.
//
// A process that never builds `AppDeps` — `packages/trpc`'s own vitest
// suites, which exercise a router directly — falls back to the singletons
// the deleted module-level `loadDb()` / `loadChClient()` loaders reached, so
// those callers behave exactly as they did before this wave. The fallback is
// LAZY: importing `@openpanel/core` still constructs no database, which is
// what keeps `bun test` runnable offline.

import {
  disableTotp as authDisableTotp,
  enableTotp as authEnableTotp,
  extendSessionCookie as authExtendSessionCookie,
  getTotpStatus as authGetTotpStatus,
  regenerateTotpRecoveryCodes as authRegenerateTotpRecoveryCodes,
  requestPasswordReset as authRequestPasswordReset,
  resetPasswordWithToken as authResetPasswordWithToken,
  setupTotp as authSetupTotp,
  signInWithEmail as authSignInWithEmail,
  signInWithTotp as authSignInWithTotp,
  signOutUser as authSignOutUser,
  signUpWithEmail as authSignUpWithEmail,
  type SignInShareInput,
  signInToShare as signInToShareWithDeps,
} from './modules/auth/auth.service';
import {
  createBotEvent as event_createBotEvent,
  createEvent as event_createEvent,
  getBotEventsPage as event_getBotEventsPage,
  getConversionEventNames as event_getConversionEventNames,
  getConversionListPage as event_getConversionListPage,
  getEventById as event_getEventById,
  getEventDetails as event_getEventDetails,
  getEventList as event_getEventList,
  getEventListPage as event_getEventListPage,
  getEventMetas as event_getEventMetas,
  getEventPropertyValuesCore as event_getEventPropertyValuesCore,
  getEvents as event_getEvents,
  getEventsCount as event_getEventsCount,
  getTopEventNames as event_getTopEventNames,
  getTopOrigins as event_getTopOrigins,
  getTopPages as event_getTopPages,
  listEventNamesCore as event_listEventNamesCore,
  listEventPropertiesCore as event_listEventPropertiesCore,
  queryEventsCore as event_queryEventsCore,
  updateEventMeta as event_updateEventMeta,
} from './modules/event/event.service';
import {
  createGroup as group_createGroup,
  deleteGroup as group_deleteGroup,
  findGroupsCore as group_findGroupsCore,
  getGroupActivity as group_getGroupActivity,
  getGroupById as group_getGroupById,
  getGroupCore as group_getGroupCore,
  getGroupList as group_getGroupList,
  getGroupListCount as group_getGroupListCount,
  getGroupListPage as group_getGroupListPage,
  getGroupMemberGrowth as group_getGroupMemberGrowth,
  getGroupMemberProfiles as group_getGroupMemberProfiles,
  getGroupMemberProfilesPage as group_getGroupMemberProfilesPage,
  getGroupMetrics as group_getGroupMetrics,
  getGroupMostEvents as group_getGroupMostEvents,
  getGroupPopularRoutes as group_getGroupPopularRoutes,
  getGroupPropertyKeys as group_getGroupPropertyKeys,
  getGroupStats as group_getGroupStats,
  getGroupsByIds as group_getGroupsByIds,
  getGroupTypes as group_getGroupTypes,
  listGroupTypesCore as group_listGroupTypesCore,
  updateGroup as group_updateGroup,
  upsertGroup as group_upsertGroup,
} from './modules/group/group.service';
import {
  getStats as misc_getStats,
  insertPingRecord as misc_insertPingRecord,
  runPingCron as misc_runPingCron,
} from './modules/misc/misc.service';
import {
  getRawWhereClause,
  isPageFilter,
  getAnalyticsOverviewCore as overview_getAnalyticsOverviewCore,
  getSegmentDailySeriesCore as overview_getSegmentDailySeriesCore,
  getTrafficBreakdownCore as overview_getTrafficBreakdownCore,
} from './modules/overview/overview.service';
import {
  getEntryExitPagesCore as pages_getEntryExitPagesCore,
  getPageConversionsCore as pages_getPageConversionsCore,
  getPagePerformanceCore as pages_getPagePerformanceCore,
  getTopPagesCore as pages_getTopPagesCore,
} from './modules/overview/pages.service';
import {
  adjustProfileProperty as profile_adjustProfileProperty,
  findProfilesCore as profile_findProfilesCore,
  getPowerUsers as profile_getPowerUsers,
  getProfileActivity as profile_getProfileActivity,
  getProfileById as profile_getProfileById,
  getProfileList as profile_getProfileList,
  getProfileListCount as profile_getProfileListCount,
  getProfileListPage as profile_getProfileListPage,
  getProfileMetrics as profile_getProfileMetrics,
  getProfileMetricsCore as profile_getProfileMetricsCore,
  getProfileMostEvents as profile_getProfileMostEvents,
  getProfilePopularRoutes as profile_getProfilePopularRoutes,
  getProfilePropertyKeys as profile_getProfilePropertyKeys,
  getProfilePropertyNames as profile_getProfilePropertyNames,
  getProfileSessionsCore as profile_getProfileSessionsCore,
  getProfiles as profile_getProfiles,
  getProfilesCached as profile_getProfilesCached,
  getProfileValues as profile_getProfileValues,
  getProfileWithEvents as profile_getProfileWithEvents,
  identifyProfile as profile_identifyProfile,
  upsertProfile as profile_upsertProfile,
} from './modules/profile/profile.service';
import {
  getRealtimeActiveSessions as realtime_getRealtimeActiveSessions,
  getRealtimeCoordinates as realtime_getRealtimeCoordinates,
  getRealtimeGeo as realtime_getRealtimeGeo,
  getRealtimeMapBadgeDetails as realtime_getRealtimeMapBadgeDetails,
  getRealtimePaths as realtime_getRealtimePaths,
  getRealtimeReferrals as realtime_getRealtimeReferrals,
} from './modules/realtime/realtime.service';
import { createServices, type ServiceDeps, type Services } from './services';
import type { ISetCookie } from './shared/cookie';

/** Drops a function type's first (`deps`) parameter — every bare V1-compat
 *  wrapper below has the same shape: the underlying function's parameters
 *  minus `deps`, since this seam supplies that one itself. */
type Tail<T extends readonly unknown[]> = T extends readonly [
  unknown,
  ...infer Rest,
]
  ? Rest
  : never;

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
 * The hot-path escape hatches (M10-004): a handful of callers — the ingest
 * pipeline's client auth, MCP's stateless tool handlers, the chat agent's
 * Prisma persistence — have a fixed, third-party-owned function signature
 * with no `Ctx`/`ServiceDeps` slot to add one to. They reach
 * Postgres/ClickHouse through these instead of `@openpanel/db` directly, so
 * a requestId minted at `/track` at least reaches AS FAR as this seam
 * reaches (no further — see this file's header on why that's still "no
 * worse" than before this wave).
 */
export async function compatDb(): Promise<ServiceDeps['db']> {
  return (await compatServiceDeps()).db;
}
export async function compatCh(): Promise<ServiceDeps['ch']> {
  return (await compatServiceDeps()).ch;
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
 * ADR-013 keeps `clix`/`chQuery`/`TABLE_NAMES` alive until the analytics read
 * path's P7 conversion (one query per task, old-vs-new result sets diffed) —
 * `project.service.ts`'s two still-unconverted functions and mcp's
 * `analytics/property-values.ts` reach the query-building helpers here
 * instead of importing `@openpanel/db` themselves. The CLIENT itself is
 * still `deps.ch` / `compatCh()`; this is only the pure helpers that live
 * beside it.
 */
export async function compatChHelpers(): Promise<{
  TABLE_NAMES: typeof import('@openpanel/db/src/clickhouse/client').TABLE_NAMES;
  chQuery: typeof import('@openpanel/db/src/clickhouse/client').chQuery;
  convertClickhouseDateToJs: typeof import('@openpanel/db/src/clickhouse/client').convertClickhouseDateToJs;
  formatClickhouseDate: typeof import('@openpanel/db/src/clickhouse/client').formatClickhouseDate;
  toNullIfDefaultMinDate: typeof import('@openpanel/db/src/clickhouse/client').toNullIfDefaultMinDate;
  clix: typeof import('@openpanel/db/src/clickhouse/query-builder').clix;
}> {
  const [client, queryBuilder] = await Promise.all([
    import('@openpanel/db/src/clickhouse/client'),
    import('@openpanel/db/src/clickhouse/query-builder'),
  ]);
  return {
    TABLE_NAMES: client.TABLE_NAMES,
    chQuery: client.chQuery,
    convertClickhouseDateToJs: client.convertClickhouseDateToJs,
    formatClickhouseDate: client.formatClickhouseDate,
    toNullIfDefaultMinDate: client.toNullIfDefaultMinDate,
    clix: queryBuilder.clix,
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

// --- auth ------------------------------------------------------------------

// `signInToShare` lives in the auth module, but it reads the share module's
// three lookups, so it took `ServiceDeps` in M10-003 too. V1's auth router
// calls it with two arguments.
export function signInToShare(
  input: SignInShareInput,
  setCookie: ISetCookie
): Promise<true> {
  return compatServiceDeps().then((deps) =>
    signInToShareWithDeps(deps, input, setCookie)
  );
}

// M10-004: every other bare auth function gained `ServiceDeps` too — same
// reasoning as `signInToShare` above, each reached through this seam.
export const signOutUser: (
  ...args: Tail<Parameters<typeof authSignOutUser>>
) => ReturnType<typeof authSignOutUser> = (...args) =>
  compatServiceDeps().then((deps) => authSignOutUser(deps, ...args));

export const signUpWithEmail: (
  ...args: Tail<Parameters<typeof authSignUpWithEmail>>
) => ReturnType<typeof authSignUpWithEmail> = (...args) =>
  compatServiceDeps().then((deps) => authSignUpWithEmail(deps, ...args));

export const signInWithEmail: (
  ...args: Tail<Parameters<typeof authSignInWithEmail>>
) => ReturnType<typeof authSignInWithEmail> = (...args) =>
  compatServiceDeps().then((deps) => authSignInWithEmail(deps, ...args));

export const signInWithTotp: (
  ...args: Tail<Parameters<typeof authSignInWithTotp>>
) => ReturnType<typeof authSignInWithTotp> = (...args) =>
  compatServiceDeps().then((deps) => authSignInWithTotp(deps, ...args));

export const getTotpStatus: (
  ...args: Tail<Parameters<typeof authGetTotpStatus>>
) => ReturnType<typeof authGetTotpStatus> = (...args) =>
  compatServiceDeps().then((deps) => authGetTotpStatus(deps, ...args));

export const setupTotp: (
  ...args: Tail<Parameters<typeof authSetupTotp>>
) => ReturnType<typeof authSetupTotp> = (...args) =>
  compatServiceDeps().then((deps) => authSetupTotp(deps, ...args));

export const enableTotp: (
  ...args: Tail<Parameters<typeof authEnableTotp>>
) => ReturnType<typeof authEnableTotp> = (...args) =>
  compatServiceDeps().then((deps) => authEnableTotp(deps, ...args));

export const disableTotp: (
  ...args: Tail<Parameters<typeof authDisableTotp>>
) => ReturnType<typeof authDisableTotp> = (...args) =>
  compatServiceDeps().then((deps) => authDisableTotp(deps, ...args));

export const regenerateTotpRecoveryCodes: (
  ...args: Tail<Parameters<typeof authRegenerateTotpRecoveryCodes>>
) => ReturnType<typeof authRegenerateTotpRecoveryCodes> = (...args) =>
  compatServiceDeps().then((deps) =>
    authRegenerateTotpRecoveryCodes(deps, ...args)
  );

export const resetPasswordWithToken: (
  ...args: Tail<Parameters<typeof authResetPasswordWithToken>>
) => ReturnType<typeof authResetPasswordWithToken> = (...args) =>
  compatServiceDeps().then((deps) => authResetPasswordWithToken(deps, ...args));

export const requestPasswordReset: (
  ...args: Tail<Parameters<typeof authRequestPasswordReset>>
) => ReturnType<typeof authRequestPasswordReset> = (...args) =>
  compatServiceDeps().then((deps) => authRequestPasswordReset(deps, ...args));

export const extendSessionCookie: (
  ...args: Tail<Parameters<typeof authExtendSessionCookie>>
) => ReturnType<typeof authExtendSessionCookie> = (...args) =>
  compatServiceDeps().then((deps) => authExtendSessionCookie(deps, ...args));

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

// M10-005: the runtime path's bare spellings. `event`, `profile`, `group`,
// `misc`, `overview`/`pages` and `realtime` all gained a `ServiceDeps` first
// parameter; `packages/trpc`'s routers and `@openpanel/queue`'s notification
// dispatch still call them bare, and reach them through here.

// --- event -------------------------------------------------------------------

export const createBotEvent: (
  ...args: Tail<Parameters<typeof event_createBotEvent>>
) => ReturnType<typeof event_createBotEvent> = (...args) =>
  compatServiceDeps().then((deps) => event_createBotEvent(deps, ...args));

export const createEvent: (
  ...args: Tail<Parameters<typeof event_createEvent>>
) => ReturnType<typeof event_createEvent> = (...args) =>
  compatServiceDeps().then((deps) => event_createEvent(deps, ...args));

export const getBotEventsPage: (
  ...args: Tail<Parameters<typeof event_getBotEventsPage>>
) => ReturnType<typeof event_getBotEventsPage> = (...args) =>
  compatServiceDeps().then((deps) => event_getBotEventsPage(deps, ...args));

export const getConversionEventNames: (
  ...args: Tail<Parameters<typeof event_getConversionEventNames>>
) => ReturnType<typeof event_getConversionEventNames> = (...args) =>
  compatServiceDeps().then((deps) =>
    event_getConversionEventNames(deps, ...args)
  );

export const getConversionListPage: (
  ...args: Tail<Parameters<typeof event_getConversionListPage>>
) => ReturnType<typeof event_getConversionListPage> = (...args) =>
  compatServiceDeps().then((deps) =>
    event_getConversionListPage(deps, ...args)
  );

export const getEventById: (
  ...args: Tail<Parameters<typeof event_getEventById>>
) => ReturnType<typeof event_getEventById> = (...args) =>
  compatServiceDeps().then((deps) => event_getEventById(deps, ...args));

export const getEventDetails: (
  ...args: Tail<Parameters<typeof event_getEventDetails>>
) => ReturnType<typeof event_getEventDetails> = (...args) =>
  compatServiceDeps().then((deps) => event_getEventDetails(deps, ...args));

export const getEventList: (
  ...args: Tail<Parameters<typeof event_getEventList>>
) => ReturnType<typeof event_getEventList> = (...args) =>
  compatServiceDeps().then((deps) => event_getEventList(deps, ...args));

export const getEventListPage: (
  ...args: Tail<Parameters<typeof event_getEventListPage>>
) => ReturnType<typeof event_getEventListPage> = (...args) =>
  compatServiceDeps().then((deps) => event_getEventListPage(deps, ...args));

export const getEventMetas: (
  ...args: Tail<Parameters<typeof event_getEventMetas>>
) => ReturnType<typeof event_getEventMetas> = (...args) =>
  compatServiceDeps().then((deps) => event_getEventMetas(deps, ...args));

export const getEventPropertyValuesCore: (
  ...args: Tail<Parameters<typeof event_getEventPropertyValuesCore>>
) => ReturnType<typeof event_getEventPropertyValuesCore> = (...args) =>
  compatServiceDeps().then((deps) =>
    event_getEventPropertyValuesCore(deps, ...args)
  );

export const getEvents: (
  ...args: Tail<Parameters<typeof event_getEvents>>
) => ReturnType<typeof event_getEvents> = (...args) =>
  compatServiceDeps().then((deps) => event_getEvents(deps, ...args));

export const getEventsCount: (
  ...args: Tail<Parameters<typeof event_getEventsCount>>
) => ReturnType<typeof event_getEventsCount> = (...args) =>
  compatServiceDeps().then((deps) => event_getEventsCount(deps, ...args));

export const getTopEventNames: (
  ...args: Tail<Parameters<typeof event_getTopEventNames>>
) => ReturnType<typeof event_getTopEventNames> = (...args) =>
  compatServiceDeps().then((deps) => event_getTopEventNames(deps, ...args));

export const getTopOrigins: (
  ...args: Tail<Parameters<typeof event_getTopOrigins>>
) => ReturnType<typeof event_getTopOrigins> = (...args) =>
  compatServiceDeps().then((deps) => event_getTopOrigins(deps, ...args));

export const getTopPages: (
  ...args: Tail<Parameters<typeof event_getTopPages>>
) => ReturnType<typeof event_getTopPages> = (...args) =>
  compatServiceDeps().then((deps) => event_getTopPages(deps, ...args));

export const listEventNamesCore: (
  ...args: Tail<Parameters<typeof event_listEventNamesCore>>
) => ReturnType<typeof event_listEventNamesCore> = (...args) =>
  compatServiceDeps().then((deps) => event_listEventNamesCore(deps, ...args));

export const listEventPropertiesCore: (
  ...args: Tail<Parameters<typeof event_listEventPropertiesCore>>
) => ReturnType<typeof event_listEventPropertiesCore> = (...args) =>
  compatServiceDeps().then((deps) =>
    event_listEventPropertiesCore(deps, ...args)
  );

export const queryEventsCore: (
  ...args: Tail<Parameters<typeof event_queryEventsCore>>
) => ReturnType<typeof event_queryEventsCore> = (...args) =>
  compatServiceDeps().then((deps) => event_queryEventsCore(deps, ...args));

export const updateEventMeta: (
  ...args: Tail<Parameters<typeof event_updateEventMeta>>
) => ReturnType<typeof event_updateEventMeta> = (...args) =>
  compatServiceDeps().then((deps) => event_updateEventMeta(deps, ...args));

// --- profile -----------------------------------------------------------------

export const adjustProfileProperty: (
  ...args: Tail<Parameters<typeof profile_adjustProfileProperty>>
) => ReturnType<typeof profile_adjustProfileProperty> = (...args) =>
  compatServiceDeps().then((deps) =>
    profile_adjustProfileProperty(deps, ...args)
  );

export const findProfilesCore: (
  ...args: Tail<Parameters<typeof profile_findProfilesCore>>
) => ReturnType<typeof profile_findProfilesCore> = (...args) =>
  compatServiceDeps().then((deps) => profile_findProfilesCore(deps, ...args));

export const getPowerUsers: (
  ...args: Tail<Parameters<typeof profile_getPowerUsers>>
) => ReturnType<typeof profile_getPowerUsers> = (...args) =>
  compatServiceDeps().then((deps) => profile_getPowerUsers(deps, ...args));

export const getProfileActivity: (
  ...args: Tail<Parameters<typeof profile_getProfileActivity>>
) => ReturnType<typeof profile_getProfileActivity> = (...args) =>
  compatServiceDeps().then((deps) => profile_getProfileActivity(deps, ...args));

export const getProfileById: (
  ...args: Tail<Parameters<typeof profile_getProfileById>>
) => ReturnType<typeof profile_getProfileById> = (...args) =>
  compatServiceDeps().then((deps) => profile_getProfileById(deps, ...args));

export const getProfileList: (
  ...args: Tail<Parameters<typeof profile_getProfileList>>
) => ReturnType<typeof profile_getProfileList> = (...args) =>
  compatServiceDeps().then((deps) => profile_getProfileList(deps, ...args));

export const getProfileListCount: (
  ...args: Tail<Parameters<typeof profile_getProfileListCount>>
) => ReturnType<typeof profile_getProfileListCount> = (...args) =>
  compatServiceDeps().then((deps) =>
    profile_getProfileListCount(deps, ...args)
  );

export const getProfileListPage: (
  ...args: Tail<Parameters<typeof profile_getProfileListPage>>
) => ReturnType<typeof profile_getProfileListPage> = (...args) =>
  compatServiceDeps().then((deps) => profile_getProfileListPage(deps, ...args));

export const getProfileMetrics: (
  ...args: Tail<Parameters<typeof profile_getProfileMetrics>>
) => ReturnType<typeof profile_getProfileMetrics> = (...args) =>
  compatServiceDeps().then((deps) => profile_getProfileMetrics(deps, ...args));

export const getProfileMetricsCore: (
  ...args: Tail<Parameters<typeof profile_getProfileMetricsCore>>
) => ReturnType<typeof profile_getProfileMetricsCore> = (...args) =>
  compatServiceDeps().then((deps) =>
    profile_getProfileMetricsCore(deps, ...args)
  );

export const getProfileMostEvents: (
  ...args: Tail<Parameters<typeof profile_getProfileMostEvents>>
) => ReturnType<typeof profile_getProfileMostEvents> = (...args) =>
  compatServiceDeps().then((deps) =>
    profile_getProfileMostEvents(deps, ...args)
  );

export const getProfilePopularRoutes: (
  ...args: Tail<Parameters<typeof profile_getProfilePopularRoutes>>
) => ReturnType<typeof profile_getProfilePopularRoutes> = (...args) =>
  compatServiceDeps().then((deps) =>
    profile_getProfilePopularRoutes(deps, ...args)
  );

export const getProfilePropertyKeys: (
  ...args: Tail<Parameters<typeof profile_getProfilePropertyKeys>>
) => ReturnType<typeof profile_getProfilePropertyKeys> = (...args) =>
  compatServiceDeps().then((deps) =>
    profile_getProfilePropertyKeys(deps, ...args)
  );

export const getProfilePropertyNames: (
  ...args: Tail<Parameters<typeof profile_getProfilePropertyNames>>
) => ReturnType<typeof profile_getProfilePropertyNames> = (...args) =>
  compatServiceDeps().then((deps) =>
    profile_getProfilePropertyNames(deps, ...args)
  );

export const getProfileSessionsCore: (
  ...args: Tail<Parameters<typeof profile_getProfileSessionsCore>>
) => ReturnType<typeof profile_getProfileSessionsCore> = (...args) =>
  compatServiceDeps().then((deps) =>
    profile_getProfileSessionsCore(deps, ...args)
  );

export const getProfileValues: (
  ...args: Tail<Parameters<typeof profile_getProfileValues>>
) => ReturnType<typeof profile_getProfileValues> = (...args) =>
  compatServiceDeps().then((deps) => profile_getProfileValues(deps, ...args));

export const getProfileWithEvents: (
  ...args: Tail<Parameters<typeof profile_getProfileWithEvents>>
) => ReturnType<typeof profile_getProfileWithEvents> = (...args) =>
  compatServiceDeps().then((deps) =>
    profile_getProfileWithEvents(deps, ...args)
  );

export const getProfiles: (
  ...args: Tail<Parameters<typeof profile_getProfiles>>
) => ReturnType<typeof profile_getProfiles> = (...args) =>
  compatServiceDeps().then((deps) => profile_getProfiles(deps, ...args));

/** `session.service.ts`'s `getSessionList` is still deps-free (its own task),
 *  and this is the one cached read it makes. */
export const getProfilesCached: (
  ...args: Tail<Parameters<typeof profile_getProfilesCached>>
) => ReturnType<typeof profile_getProfilesCached> = (...args) =>
  compatServiceDeps().then((deps) => profile_getProfilesCached(deps, ...args));

export const identifyProfile: (
  ...args: Tail<Parameters<typeof profile_identifyProfile>>
) => ReturnType<typeof profile_identifyProfile> = (...args) =>
  compatServiceDeps().then((deps) => profile_identifyProfile(deps, ...args));

export const upsertProfile: (
  ...args: Tail<Parameters<typeof profile_upsertProfile>>
) => ReturnType<typeof profile_upsertProfile> = (...args) =>
  compatServiceDeps().then((deps) => profile_upsertProfile(deps, ...args));

// --- group -------------------------------------------------------------------

export const createGroup: (
  ...args: Tail<Parameters<typeof group_createGroup>>
) => ReturnType<typeof group_createGroup> = (...args) =>
  compatServiceDeps().then((deps) => group_createGroup(deps, ...args));

export const deleteGroup: (
  ...args: Tail<Parameters<typeof group_deleteGroup>>
) => ReturnType<typeof group_deleteGroup> = (...args) =>
  compatServiceDeps().then((deps) => group_deleteGroup(deps, ...args));

export const findGroupsCore: (
  ...args: Tail<Parameters<typeof group_findGroupsCore>>
) => ReturnType<typeof group_findGroupsCore> = (...args) =>
  compatServiceDeps().then((deps) => group_findGroupsCore(deps, ...args));

export const getGroupActivity: (
  ...args: Tail<Parameters<typeof group_getGroupActivity>>
) => ReturnType<typeof group_getGroupActivity> = (...args) =>
  compatServiceDeps().then((deps) => group_getGroupActivity(deps, ...args));

export const getGroupById: (
  ...args: Tail<Parameters<typeof group_getGroupById>>
) => ReturnType<typeof group_getGroupById> = (...args) =>
  compatServiceDeps().then((deps) => group_getGroupById(deps, ...args));

export const getGroupCore: (
  ...args: Tail<Parameters<typeof group_getGroupCore>>
) => ReturnType<typeof group_getGroupCore> = (...args) =>
  compatServiceDeps().then((deps) => group_getGroupCore(deps, ...args));

export const getGroupList: (
  ...args: Tail<Parameters<typeof group_getGroupList>>
) => ReturnType<typeof group_getGroupList> = (...args) =>
  compatServiceDeps().then((deps) => group_getGroupList(deps, ...args));

export const getGroupListCount: (
  ...args: Tail<Parameters<typeof group_getGroupListCount>>
) => ReturnType<typeof group_getGroupListCount> = (...args) =>
  compatServiceDeps().then((deps) => group_getGroupListCount(deps, ...args));

export const getGroupListPage: (
  ...args: Tail<Parameters<typeof group_getGroupListPage>>
) => ReturnType<typeof group_getGroupListPage> = (...args) =>
  compatServiceDeps().then((deps) => group_getGroupListPage(deps, ...args));

export const getGroupMemberGrowth: (
  ...args: Tail<Parameters<typeof group_getGroupMemberGrowth>>
) => ReturnType<typeof group_getGroupMemberGrowth> = (...args) =>
  compatServiceDeps().then((deps) => group_getGroupMemberGrowth(deps, ...args));

export const getGroupMemberProfiles: (
  ...args: Tail<Parameters<typeof group_getGroupMemberProfiles>>
) => ReturnType<typeof group_getGroupMemberProfiles> = (...args) =>
  compatServiceDeps().then((deps) =>
    group_getGroupMemberProfiles(deps, ...args)
  );

export const getGroupMemberProfilesPage: (
  ...args: Tail<Parameters<typeof group_getGroupMemberProfilesPage>>
) => ReturnType<typeof group_getGroupMemberProfilesPage> = (...args) =>
  compatServiceDeps().then((deps) =>
    group_getGroupMemberProfilesPage(deps, ...args)
  );

export const getGroupMetrics: (
  ...args: Tail<Parameters<typeof group_getGroupMetrics>>
) => ReturnType<typeof group_getGroupMetrics> = (...args) =>
  compatServiceDeps().then((deps) => group_getGroupMetrics(deps, ...args));

export const getGroupMostEvents: (
  ...args: Tail<Parameters<typeof group_getGroupMostEvents>>
) => ReturnType<typeof group_getGroupMostEvents> = (...args) =>
  compatServiceDeps().then((deps) => group_getGroupMostEvents(deps, ...args));

export const getGroupPopularRoutes: (
  ...args: Tail<Parameters<typeof group_getGroupPopularRoutes>>
) => ReturnType<typeof group_getGroupPopularRoutes> = (...args) =>
  compatServiceDeps().then((deps) =>
    group_getGroupPopularRoutes(deps, ...args)
  );

export const getGroupPropertyKeys: (
  ...args: Tail<Parameters<typeof group_getGroupPropertyKeys>>
) => ReturnType<typeof group_getGroupPropertyKeys> = (...args) =>
  compatServiceDeps().then((deps) => group_getGroupPropertyKeys(deps, ...args));

export const getGroupStats: (
  ...args: Tail<Parameters<typeof group_getGroupStats>>
) => ReturnType<typeof group_getGroupStats> = (...args) =>
  compatServiceDeps().then((deps) => group_getGroupStats(deps, ...args));

export const getGroupTypes: (
  ...args: Tail<Parameters<typeof group_getGroupTypes>>
) => ReturnType<typeof group_getGroupTypes> = (...args) =>
  compatServiceDeps().then((deps) => group_getGroupTypes(deps, ...args));

export const getGroupsByIds: (
  ...args: Tail<Parameters<typeof group_getGroupsByIds>>
) => ReturnType<typeof group_getGroupsByIds> = (...args) =>
  compatServiceDeps().then((deps) => group_getGroupsByIds(deps, ...args));

export const listGroupTypesCore: (
  ...args: Tail<Parameters<typeof group_listGroupTypesCore>>
) => ReturnType<typeof group_listGroupTypesCore> = (...args) =>
  compatServiceDeps().then((deps) => group_listGroupTypesCore(deps, ...args));

export const updateGroup: (
  ...args: Tail<Parameters<typeof group_updateGroup>>
) => ReturnType<typeof group_updateGroup> = (...args) =>
  compatServiceDeps().then((deps) => group_updateGroup(deps, ...args));

export const upsertGroup: (
  ...args: Tail<Parameters<typeof group_upsertGroup>>
) => ReturnType<typeof group_upsertGroup> = (...args) =>
  compatServiceDeps().then((deps) => group_upsertGroup(deps, ...args));

// --- overview ----------------------------------------------------------------

export const getAnalyticsOverviewCore: (
  ...args: Tail<Parameters<typeof overview_getAnalyticsOverviewCore>>
) => ReturnType<typeof overview_getAnalyticsOverviewCore> = (...args) =>
  compatServiceDeps().then((deps) =>
    overview_getAnalyticsOverviewCore(deps, ...args)
  );

export const getSegmentDailySeriesCore: (
  ...args: Tail<Parameters<typeof overview_getSegmentDailySeriesCore>>
) => ReturnType<typeof overview_getSegmentDailySeriesCore> = (...args) =>
  compatServiceDeps().then((deps) =>
    overview_getSegmentDailySeriesCore(deps, ...args)
  );

export const getTrafficBreakdownCore: (
  ...args: Tail<Parameters<typeof overview_getTrafficBreakdownCore>>
) => ReturnType<typeof overview_getTrafficBreakdownCore> = (...args) =>
  compatServiceDeps().then((deps) =>
    overview_getTrafficBreakdownCore(deps, ...args)
  );

// --- pages -------------------------------------------------------------------

export const getEntryExitPagesCore: (
  ...args: Tail<Parameters<typeof pages_getEntryExitPagesCore>>
) => ReturnType<typeof pages_getEntryExitPagesCore> = (...args) =>
  compatServiceDeps().then((deps) =>
    pages_getEntryExitPagesCore(deps, ...args)
  );

export const getPageConversionsCore: (
  ...args: Tail<Parameters<typeof pages_getPageConversionsCore>>
) => ReturnType<typeof pages_getPageConversionsCore> = (...args) =>
  compatServiceDeps().then((deps) =>
    pages_getPageConversionsCore(deps, ...args)
  );

export const getPagePerformanceCore: (
  ...args: Tail<Parameters<typeof pages_getPagePerformanceCore>>
) => ReturnType<typeof pages_getPagePerformanceCore> = (...args) =>
  compatServiceDeps().then((deps) =>
    pages_getPagePerformanceCore(deps, ...args)
  );

export const getTopPagesCore: (
  ...args: Tail<Parameters<typeof pages_getTopPagesCore>>
) => ReturnType<typeof pages_getTopPagesCore> = (...args) =>
  compatServiceDeps().then((deps) => pages_getTopPagesCore(deps, ...args));

// --- realtime ----------------------------------------------------------------

export const getRealtimeActiveSessions: (
  ...args: Tail<Parameters<typeof realtime_getRealtimeActiveSessions>>
) => ReturnType<typeof realtime_getRealtimeActiveSessions> = (...args) =>
  compatServiceDeps().then((deps) =>
    realtime_getRealtimeActiveSessions(deps, ...args)
  );

export const getRealtimeCoordinates: (
  ...args: Tail<Parameters<typeof realtime_getRealtimeCoordinates>>
) => ReturnType<typeof realtime_getRealtimeCoordinates> = (...args) =>
  compatServiceDeps().then((deps) =>
    realtime_getRealtimeCoordinates(deps, ...args)
  );

export const getRealtimeGeo: (
  ...args: Tail<Parameters<typeof realtime_getRealtimeGeo>>
) => ReturnType<typeof realtime_getRealtimeGeo> = (...args) =>
  compatServiceDeps().then((deps) => realtime_getRealtimeGeo(deps, ...args));

export const getRealtimeMapBadgeDetails: (
  ...args: Tail<Parameters<typeof realtime_getRealtimeMapBadgeDetails>>
) => ReturnType<typeof realtime_getRealtimeMapBadgeDetails> = (...args) =>
  compatServiceDeps().then((deps) =>
    realtime_getRealtimeMapBadgeDetails(deps, ...args)
  );

export const getRealtimePaths: (
  ...args: Tail<Parameters<typeof realtime_getRealtimePaths>>
) => ReturnType<typeof realtime_getRealtimePaths> = (...args) =>
  compatServiceDeps().then((deps) => realtime_getRealtimePaths(deps, ...args));

export const getRealtimeReferrals: (
  ...args: Tail<Parameters<typeof realtime_getRealtimeReferrals>>
) => ReturnType<typeof realtime_getRealtimeReferrals> = (...args) =>
  compatServiceDeps().then((deps) =>
    realtime_getRealtimeReferrals(deps, ...args)
  );

// --- misc --------------------------------------------------------------------

export const getStats: (
  ...args: Tail<Parameters<typeof misc_getStats>>
) => ReturnType<typeof misc_getStats> = (...args) =>
  compatServiceDeps().then((deps) => misc_getStats(deps, ...args));

export const insertPingRecord: (
  ...args: Tail<Parameters<typeof misc_insertPingRecord>>
) => ReturnType<typeof misc_insertPingRecord> = (...args) =>
  compatServiceDeps().then((deps) => misc_insertPingRecord(deps, ...args));

export const runPingCron: (
  ...args: Tail<Parameters<typeof misc_runPingCron>>
) => ReturnType<typeof misc_runPingCron> = (...args) =>
  compatServiceDeps().then((deps) => misc_runPingCron(deps, ...args));

// `packages/trpc`'s overview and event routers call these as OBJECTS
// (`overviewService.getMetrics(...)`, `pagesService.getTopPages(...)`), and
// one of them still does `.bind(overviewService)`. Both were module-singleton
// class instances before M10-005; here they are plain objects of bare
// wrappers, so the call sites read identically and `bind` stays a no-op.
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
