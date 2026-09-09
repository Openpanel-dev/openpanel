// Ported from packages/db/src/services/session.service.ts (M7-001). That file
// is now a re-export shim over this one, so @openpanel/db importers
// (packages/trpc's session + event routers, apps/api's insights controller,
// apps/start's types) keep working while V1 runs (DELEGATE PATTERN).
//
// Every query here is a `sql` fragment (src/session.sql.ts) — the module's
// queries are converted, one at a time with a result-set proof each, per
// ADR-013. `buildFilterWhere` is NOT converted here: it is the shared filter
// compiler, out of this task's scope; src/filter-clauses.ts is the one bridge.
//
// M10-009: the ClickHouse client is `deps.ch`, reached through core's own
// `chQuery` (shared/ch-query.ts), so the requestId minted at the edge reaches
// every query here (ADR-018, docs/TECH_DEBT.md §4). The one exception is
// `getSessionsCountCached`: `cacheable` keys on the call's ARGUMENTS
// (packages/redis/cachable.ts), so `ServiceDeps` cannot be a leading
// parameter — it reaches the boot scope's deps through the declared v1-compat
// seam instead. The remaining `load*` functions are intra-package lazy
// imports, kept lazy for a cycle, not for a client.

import { cacheable } from '@openpanel/redis';
import type { ServiceDeps, Services } from '../../services';
import { chQuery } from '../../shared/ch-query';
import { getSafeJson } from '../../shared/json';
import type { IServiceProfile } from '../profile/profile.service';
import type { IChartEventFilter } from '../report/report.constants';
import { convertClickhouseDateToJs } from './src/dates';
import type { CompiledFilterClauses } from './src/filter-clauses';
import {
  hasSessionListLookback,
  querySessionsQuery,
  type SessionDistinctField,
  sessionByIdQuery,
  sessionDistinctValuesQuery,
  sessionHasReplayQuery,
  sessionListQuery,
  sessionReplayChunksQuery,
  sessionsCountQuery,
} from './src/session.sql';
import {
  type EnqueueSessionEndInput,
  sessionEndEnqueueOptions,
  sessionEndJobPayload,
} from './src/session-end';

export {
  SESSION_DISTINCT_FIELDS,
  type SessionDistinctField,
} from './src/session.sql';

function loadFilterCompiler() {
  return import('../chart/src/table-filter-where');
}

/** `getSessionsCountCached` cannot carry `ServiceDeps` — see the header. */
function loadCompatServiceDeps() {
  return import('../../v1-compat').then((m) => m.compatServiceDeps());
}

function loadLookback() {
  return import('../../shared/lookback');
}

function loadDateService() {
  return import('../../shared/date');
}

export interface IClickhouseSession {
  id: string;
  profile_id: string;
  event_count: number;
  screen_view_count: number;
  entry_path: string;
  entry_origin: string;
  exit_path: string;
  exit_origin: string;
  created_at: string;
  ended_at: string;
  referrer: string;
  referrer_name: string;
  referrer_type: string;
  os: string;
  os_version: string;
  browser: string;
  browser_version: string;
  device: string;
  brand: string;
  model: string;
  country: string;
  region: string;
  city: string;
  longitude: number | null;
  latitude: number | null;
  is_bounce: boolean;
  project_id: string;
  device_id: string;
  duration: number;
  utm_medium: string;
  utm_source: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  revenue: number;
  sign: 1 | -1;
  version: number;
  // Dynamically added
  has_replay?: boolean;
  groups: string[];
}

export interface IServiceSession {
  id: string;
  profileId: string;
  eventCount: number;
  screenViewCount: number;
  entryPath: string;
  entryOrigin: string;
  exitPath: string;
  exitOrigin: string;
  createdAt: Date;
  endedAt: Date;
  referrer: string;
  referrerName: string;
  referrerType: string;
  os: string;
  osVersion: string;
  browser: string;
  browserVersion: string;
  device: string;
  brand: string;
  model: string;
  country: string;
  region: string;
  city: string;
  longitude: number | null;
  latitude: number | null;
  isBounce: boolean;
  projectId: string;
  deviceId: string;
  duration: number;
  utmMedium: string;
  utmSource: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
  revenue: number;
  profile?: IServiceProfile;
  hasReplay?: boolean;
  groups: string[];
}

export interface GetSessionListOptions {
  projectId: string;
  profileId?: string;
  take: number;
  filters?: IChartEventFilter[];
  startDate?: Date;
  endDate?: Date;
  search?: string;
  cursor?: Date;
  dateIntervalInDays?: number;
}

/** The session list's filters compile against the sessions table itself. */
const SESSION_FILTER_TABLE = {
  selfTable: 'sessions',
  profileIdExpr: 'profile_id',
  groupsExpr: 'groups',
} as const;

const DEFAULT_LOOKBACK_DAYS = 0.5;
const SESSION_LIST_MAX_LOOKBACK_DAYS_DEFAULT = 365;
const SESSION_LIST_MAX_LOOKBACK_DAYS_ENV = 'SESSION_LIST_MAX_LOOKBACK_DAYS';

const SESSIONS_COUNT_CACHE_SECONDS = 60 * 10;
const REPLAY_CHUNKS_PAGE_SIZE = 40;
const DISTINCT_VALUES_DEFAULT_LIMIT = 200;
const QUERY_SESSIONS_DEFAULT_LIMIT = 20;

// clix always sent `session_timezone: 'UTC'`; the two queries converted from
// clix keep sending it so their result sets stay identical.
const CLIX_SESSION_TIMEZONE = { session_timezone: 'UTC' } as const;

export function transformSession(session: IClickhouseSession): IServiceSession {
  return {
    id: session.id,
    profileId: session.profile_id,
    eventCount: session.event_count,
    screenViewCount: session.screen_view_count,
    entryPath: session.entry_path,
    entryOrigin: session.entry_origin,
    exitPath: session.exit_path,
    exitOrigin: session.exit_origin,
    createdAt: convertClickhouseDateToJs(session.created_at),
    endedAt: convertClickhouseDateToJs(session.ended_at),
    referrer: session.referrer,
    referrerName: session.referrer_name,
    referrerType: session.referrer_type,
    os: session.os,
    osVersion: session.os_version,
    browser: session.browser,
    browserVersion: session.browser_version,
    device: session.device,
    brand: session.brand,
    model: session.model,
    country: session.country,
    region: session.region,
    city: session.city,
    longitude: session.longitude,
    latitude: session.latitude,
    isBounce: session.is_bounce,
    projectId: session.project_id,
    deviceId: session.device_id,
    duration: session.duration,
    utmMedium: session.utm_medium,
    utmSource: session.utm_source,
    utmCampaign: session.utm_campaign,
    utmContent: session.utm_content,
    utmTerm: session.utm_term,
    revenue: session.revenue,
    profile: undefined,
    hasReplay: session.has_replay,
    groups: session.groups,
  };
}

async function compileSessionFilters(
  filters: IChartEventFilter[] | undefined,
  projectId: string,
  range: { startDate?: Date; endDate?: Date }
): Promise<CompiledFilterClauses> {
  if (!filters?.length) {
    return {};
  }
  const { buildFilterWhere } = await loadFilterCompiler();
  return buildFilterWhere(filters, projectId, {
    ...SESSION_FILTER_TABLE,
    ...range,
  });
}

function emptyProfile(profileId: string, projectId: string): IServiceProfile {
  return {
    id: profileId,
    email: '',
    avatar: '',
    firstName: '',
    lastName: '',
    createdAt: new Date(),
    lastSeenAt: new Date(),
    projectId,
    isExternal: false,
    properties: {},
    groups: [],
  };
}

export async function getSessionList(
  deps: ServiceDeps,
  options: GetSessionListOptions
) {
  const {
    cursor,
    take,
    projectId,
    profileId,
    filters,
    startDate,
    endDate,
    search,
    dateIntervalInDays = DEFAULT_LOOKBACK_DAYS,
  } = options;

  const { resolveMaxLookbackDays } = await loadLookback();

  // Deployment-tunable ceiling for the empty-result lookback (see lookback.ts).
  const maxLookbackDays = resolveMaxLookbackDays(
    SESSION_LIST_MAX_LOOKBACK_DAYS_ENV,
    SESSION_LIST_MAX_LOOKBACK_DAYS_DEFAULT
  );
  const lookbackDays = Math.min(dateIntervalInDays, maxLookbackDays);

  const data = await chQuery<IClickhouseSession & { hasReplay: boolean }>(
    deps,
    sessionListQuery({
      projectId,
      take,
      cursor,
      lookbackDays,
      startDate,
      endDate,
      profileId,
      search,
      filterClauses: await compileSessionFilters(filters, projectId, {
        startDate,
        endDate,
      }),
    })
  );

  // Empty window: double it and retry until the ceiling.
  if (
    data.length === 0 &&
    hasSessionListLookback({ cursor, startDate, endDate }) &&
    lookbackDays < maxLookbackDays
  ) {
    return getSessionList(deps, {
      ...options,
      dateIntervalInDays: dateIntervalInDays * 2,
    });
  }

  // M10-005: `getProfilesCached` takes `ServiceDeps` now and `getSessionList`
  // has none — packages/trpc's session router still calls it bare — so it
  // reaches the v1-compat spelling. Converting this module is its own task.
  const { getProfilesCached } = await import('../../v1-compat');
  const profileIds = data
    .filter((e) => e.device_id !== e.profile_id)
    .map((e) => e.profile_id);
  const profiles = await getProfilesCached(profileIds, projectId);
  const map = new Map<string, IServiceProfile>(profiles.map((p) => [p.id, p]));

  const items = data.map(transformSession).map((item) => ({
    ...item,
    profile: map.get(item.profileId) ?? emptyProfile(item.profileId, projectId),
  }));

  const last = items.at(-1);

  return {
    items,
    meta: { next: last ? last.createdAt.toISOString() : undefined },
  };
}

export async function getSessionsCount(
  deps: ServiceDeps,
  {
    projectId,
    profileId,
    filters,
    startDate,
    endDate,
    search,
  }: Omit<GetSessionListOptions, 'take' | 'cursor'>
) {
  const result = await chQuery<{ count: number }>(
    deps,
    sessionsCountQuery({
      projectId,
      profileId,
      startDate,
      endDate,
      search,
      filterClauses: await compileSessionFilters(filters, projectId, {
        startDate,
        endDate,
      }),
    })
  );
  return result[0]?.count ?? 0;
}

export const getSessionsCountCached = cacheable(
  'getSessionsCount',
  async (options: Omit<GetSessionListOptions, 'take' | 'cursor'>) =>
    getSessionsCount(await loadCompatServiceDeps(), options),
  SESSIONS_COUNT_CACHE_SECONDS
);

export interface ISessionReplayChunkMeta {
  chunk_index: number;
  started_at: string;
  ended_at: string;
  events_count: number;
  is_full_snapshot: boolean;
}

export async function getSessionReplayChunksFrom(
  deps: ServiceDeps,
  sessionId: string,
  projectId: string,
  fromIndex: number
) {
  const rows = await chQuery<{ chunk_index: number; payload: string }>(
    deps,
    sessionReplayChunksQuery({
      sessionId,
      projectId,
      limit: REPLAY_CHUNKS_PAGE_SIZE + 1,
      offset: fromIndex,
    })
  );

  return {
    data: rows
      .slice(0, REPLAY_CHUNKS_PAGE_SIZE)
      .map((row, index) => {
        const events = getSafeJson<
          { type: number; data: unknown; timestamp: number }[]
        >(row.payload);
        if (!events) {
          return null;
        }
        return { chunkIndex: index + fromIndex, events };
      })
      .filter(Boolean),
    hasMore: rows.length > REPLAY_CHUNKS_PAGE_SIZE,
  };
}

export async function getSessionDistinctValues(
  deps: ServiceDeps,
  projectId: string,
  field: SessionDistinctField,
  limit = DISTINCT_VALUES_DEFAULT_LIMIT
): Promise<string[]> {
  const results = await chQuery<{ value: string }>(
    deps,
    sessionDistinctValuesQuery({ projectId, field, limit })
  );
  return results.map((r) => r.value).filter(Boolean);
}

export async function getSessionById(
  deps: ServiceDeps,
  sessionId: string,
  projectId: string
) {
  const [sessionRows, hasReplayRows] = await Promise.all([
    chQuery<IClickhouseSession>(
      deps,
      sessionByIdQuery({ sessionId, projectId }),
      CLIX_SESSION_TIMEZONE
    ),
    chQuery<{ n: number }>(
      deps,
      sessionHasReplayQuery({ sessionId, projectId })
    ),
  ]);

  if (!sessionRows[0]) {
    throw new Error('Session not found');
  }

  return {
    ...transformSession(sessionRows[0]),
    hasReplay: hasReplayRows.length > 0,
  };
}

export interface QuerySessionsInput {
  projectId: string;
  startDate?: string;
  endDate?: string;
  country?: string;
  city?: string;
  device?: string;
  browser?: string;
  os?: string;
  referrer?: string;
  referrerName?: string;
  referrerType?: string;
  profileId?: string;
  filters?: IChartEventFilter[];
  limit?: number;
}

/** `clix.datetime`: any date input to a UTC `YYYY-MM-DD HH:mm:ss`. */
function toClixDatetime(date: string): string {
  return new Date(date).toISOString().slice(0, 19).replace('T', ' ');
}

export async function querySessionsCore(
  deps: ServiceDeps,
  input: QuerySessionsInput
): Promise<IClickhouseSession[]> {
  const { resolveDateRange } = await loadDateService();
  const { startDate, endDate } = resolveDateRange(
    input.startDate,
    input.endDate
  );

  return chQuery<IClickhouseSession>(
    deps,
    querySessionsQuery({
      ...input,
      startDate: toClixDatetime(startDate),
      endDate: toClixDatetime(endDate),
      limit: input.limit ?? QUERY_SESSIONS_DEFAULT_LIMIT,
      filterClauses: await compileSessionFilters(
        input.filters,
        input.projectId,
        { startDate: new Date(startDate), endDate: new Date(endDate) }
      ),
    }),
    CLIX_SESSION_TIMEZONE
  );
}

export function createSessionService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return {
    byId: (
      sessionId: string,
      projectId: string
    ): Promise<IServiceSession & { hasReplay: boolean }> =>
      getSessionById(deps, sessionId, projectId),
    /**
     * Enqueue one `session_end` job, idempotent on the closed session's id.
     * The ctx.queues-based producer; V1's now-deleted apps/worker kept its own
     * @openpanel/queue producer (utils/session-handler.ts) because core could
     * not import @openpanel/queue back (see cohort.service.ts's header).
     */
    enqueueSessionEnd: async (input: EnqueueSessionEndInput): Promise<void> => {
      await deps.queues.sessions.session.add(
        sessionEndJobPayload(input),
        sessionEndEnqueueOptions(input.closedSession.id)
      );
    },
  };
}
