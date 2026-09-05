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
  type SignInShareInput,
  signInToShare as signInToShareWithDeps,
} from './modules/auth/auth.service';
import { createServices, type ServiceDeps, type Services } from './services';
import type { ISetCookie } from './shared/cookie';

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
