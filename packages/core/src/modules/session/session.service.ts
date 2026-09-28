// The session read path. Every query is a `sql` fragment (src/sql.ts), per
// ADR-013; `buildFilterWhere` is the shared filter compiler and
// src/filter-clauses.ts is the bridge to it.
//
// `getSessionsCountCached` is `cacheablePerDeps`: `cacheable` keys on the
// call's ARGUMENTS (packages/redis/cachable.ts), so the caller's deps have to
// travel beside the key rather than inside it, or the Redis key would change
// per request.

import { getSafeJson, resolveDateRange } from '@openpanel/shared';
import { cacheablePerDeps } from '../../cacheable-per-deps';
import { chQuery } from '../../ch-query';
import type { ServiceDeps, Services } from '../../services';
import { toRangeBoundaryLiteral } from '../../shared/ch-dates';
import { buildFilterWhere } from '../chart/src/table-filter-where';
import type { IServiceProfile } from '../profile/profile.service';
import type { IChartEventFilter } from '../report/report.constants';
import { convertClickhouseDateToJs } from './src/dates';
import type { CompiledFilterClauses } from './src/filter-clauses';
import {
  type EnqueueSessionEndInput,
  sessionEndEnqueueOptions,
  sessionEndJobPayload,
} from './src/session-end';
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
} from './src/sql';

export {
  SESSION_DISTINCT_FIELDS,
  type SessionDistinctField,
} from './src/sql';

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

  // Deployment-tunable ceiling for the empty-result lookback
  // (SESSION_LIST_MAX_LOOKBACK_DAYS).
  const maxLookbackDays =
    deps.config.query.sessionListMaxLookbackDays ??
    SESSION_LIST_MAX_LOOKBACK_DAYS_DEFAULT;
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

  const { getProfilesCached } = await import('../profile/profile.service');
  const profileIds = data
    .filter((e) => e.device_id !== e.profile_id)
    .map((e) => e.profile_id);
  const profiles = await getProfilesCached(deps, profileIds, projectId);
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

export const getSessionsCountCached = cacheablePerDeps(
  'getSessionsCount',
  (
    deps: ServiceDeps,
    options: Omit<GetSessionListOptions, 'take' | 'cursor'>
  ): Promise<number> => getSessionsCount(deps, options),
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

  // `chunkIndex` is the row's position, not `row.chunk_index`, and `hasMore`
  // counts rows the JSON filter may drop — so an unparseable chunk rewinds the
  // client (docs/review/session.md, "not covered by any rule" #5). Correcting
  // either changes what the endpoint returns, so it is reported, not fixed.
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

export async function querySessionsCore(
  deps: ServiceDeps,
  input: QuerySessionsInput
): Promise<IClickhouseSession[]> {
  const { startDate, endDate } = resolveDateRange(
    input.startDate,
    input.endDate
  );

  // MCP sends a bare `YYYY-MM-DD`. The local `clix.datetime` helper this
  // replaces flattened that to midnight before the query builder could widen
  // it, so the whole last day was dropped, and it read an explicit datetime in
  // the server's local zone on the way through.
  const from = toRangeBoundaryLiteral(startDate, 'start');
  const to = toRangeBoundaryLiteral(endDate, 'end');

  return chQuery<IClickhouseSession>(
    deps,
    querySessionsQuery({
      ...input,
      startDate: from,
      endDate: to,
      limit: input.limit ?? QUERY_SESSIONS_DEFAULT_LIMIT,
      filterClauses: await compileSessionFilters(
        input.filters,
        input.projectId,
        {
          startDate: convertClickhouseDateToJs(from),
          endDate: convertClickhouseDateToJs(to),
        }
      ),
    }),
    CLIX_SESSION_TIMEZONE
  );
}

export function createSessionService(
  deps: ServiceDeps,
  _services: () => Services
) {
  /**
   * Enqueue one `session_end` job, idempotent on the closed session's id.
   * The ctx.queues-based producer; V1's now-deleted apps/worker kept its own
   * @openpanel/queue producer (utils/session-handler.ts) because core could
   * not import @openpanel/queue back (see cohort.service.ts's header).
   */
  async function enqueueSessionEnd(
    input: EnqueueSessionEndInput
  ): Promise<void> {
    await deps.queues.sessions.session.add(
      sessionEndJobPayload(input),
      sessionEndEnqueueOptions(input.closedSession.id)
    );
  }

  /** `event.service.ts` reaches this through the composition root's thunk
   *  (ADR-022 R3): `session-end.ts` statically imports the event module, so
   *  the two are a real cycle and an import back would be the wrong answer. */
  function getById(
    sessionId: string,
    projectId: string
  ): ReturnType<typeof getSessionById> {
    return getSessionById(deps, sessionId, projectId);
  }

  return { enqueueSessionEnd, getById };
}
