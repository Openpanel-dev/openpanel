import { cacheable } from '@openpanel/redis';
import type { IChartEventFilter } from '@openpanel/validation';
import sqlstring from 'sqlstring';
import {
  TABLE_NAMES,
  ch,
  chQuery,
  formatClickhouseDate,
} from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';
import { createSqlBuilder } from '../sql-builder';
import { getEventFiltersWhereClause } from './chart.service';
import { getOrganizationByProjectIdCached } from './organization.service';
import { type IServiceProfile, getProfilesCached } from './profile.service';

export type IClickhouseSession = {
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
  sign: 1 | 0;
  version: number;
};

export interface IServiceSession {
  id: string;
  profileId: string;
  hasReplay?: boolean;
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
}

export interface GetSessionListOptions {
  projectId: string;
  profileId?: string;
  take: number;
  filters?: IChartEventFilter[];
  startDate?: Date;
  endDate?: Date;
  search?: string;
  cursor?: Cursor | null;
}

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
    createdAt: new Date(session.created_at),
    endedAt: new Date(session.ended_at),
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
  };
}

type Direction = 'initial' | 'next' | 'prev';

type PageInfo = {
  next?: Cursor; // use last row
};

type Cursor = {
  createdAt: string; // ISO 8601 with ms
  id: string;
};

export async function getSessionList({
  cursor,
  take,
  projectId,
  profileId,
  filters,
  startDate,
  endDate,
  search,
}: GetSessionListOptions) {
  const { sb, getSql } = createSqlBuilder();

  sb.from = `${TABLE_NAMES.sessions} FINAL`;
  sb.limit = take;
  sb.where.projectId = `project_id = ${sqlstring.escape(projectId)}`;

  if (startDate && endDate) {
    sb.where.range = `created_at BETWEEN toDateTime('${formatClickhouseDate(startDate)}') AND toDateTime('${formatClickhouseDate(endDate)}')`;
  }

  if (profileId)
    sb.where.profileId = `profile_id = ${sqlstring.escape(profileId)}`;
  if (search) {
    const s = sqlstring.escape(`%${search}%`);
    sb.where.search = `(entry_path ILIKE ${s} OR exit_path ILIKE ${s} OR referrer ILIKE ${s} OR referrer_name ILIKE ${s})`;
  }
  if (filters?.length) {
    Object.assign(sb.where, getEventFiltersWhereClause(filters));
  }

  const organization = await getOrganizationByProjectIdCached(projectId);
  // This will speed up the query quite a lot for big organizations
  const dateIntervalInDays =
    organization?.subscriptionPeriodEventsLimit &&
    organization?.subscriptionPeriodEventsLimit > 1_000_000
      ? 1
      : 360;

  if (cursor) {
    const cAt = sqlstring.escape(cursor.createdAt);
    // TODO: remove id from cursor
    const cId = sqlstring.escape(cursor.id);
    sb.where.cursor = `created_at < toDateTime64(${cAt}, 3)`;
    sb.where.cursorWindow = `created_at >= toDateTime64(${cAt}, 3) - INTERVAL ${dateIntervalInDays} DAY`;
    sb.orderBy.created_at = 'created_at DESC';
  } else {
    sb.orderBy.created_at = 'created_at DESC';
    sb.where.created_at = `created_at > now() - INTERVAL ${dateIntervalInDays} DAY`;
  }

  // ==== Select columns (as you had) ====
  // sb.select.id = 'id'; sb.select.project_id = 'project_id'; ... etc.
  const columns = [
    'created_at',
    'ended_at',
    'id',
    'profile_id',
    'entry_path',
    'exit_path',
    'duration',
    'is_bounce',
    'referrer_name',
    'referrer',
    'country',
    'city',
    'os',
    'browser',
    'brand',
    'model',
    'device',
    'screen_view_count',
    'event_count',
    'revenue',
  ];

  columns.forEach((column) => {
    sb.select[column] = column;
  });

  const sql = getSql();
  const data = await chQuery<
    IClickhouseSession & {
      latestCreatedAt: string;
    }
  >(sql);

  // Compute cursors from page edges
  const last = data[take - 1];

  const meta: PageInfo = {
    next: last
      ? {
          createdAt: last.created_at,
          id: last.id,
        }
      : undefined,
  };

  // Profile hydration (unchanged)
  const profileIds = Array.from(new Set(data.map((e) => e.profile_id)));
  const profiles = await getProfilesCached(profileIds, projectId);
  const map = new Map<string, IServiceProfile>(profiles.map((p) => [p.id, p]));

  const sessionIds = data.map((s) => s.id);
  const replaySet = await batchSessionHasReplay(sessionIds, projectId);

  const items = data.map(transformSession).map((item) => ({
    ...item,
    hasReplay: replaySet.has(item.id),
    profile: map.get(item.profileId) ?? {
      id: item.profileId,
      email: '',
      avatar: '',
      firstName: '',
      lastName: '',
      createdAt: new Date(),
      projectId,
      isExternal: false,
      properties: {},
    },
  }));

  return { items, meta };
}

export async function getSessionsCount({
  projectId,
  profileId,
  filters,
  startDate,
  endDate,
  search,
}: Omit<GetSessionListOptions, 'take' | 'cursor'>) {
  const { sb, getSql } = createSqlBuilder();

  sb.select.count = 'count(*) as count';
  sb.where.projectId = `project_id = ${sqlstring.escape(projectId)}`;
  sb.where.sign = 'sign = 1';

  if (profileId) {
    sb.where.profileId = `profile_id = ${sqlstring.escape(profileId)}`;
  }

  if (startDate && endDate) {
    sb.where.created_at = `toDate(created_at) BETWEEN toDate('${formatClickhouseDate(startDate)}') AND toDate('${formatClickhouseDate(endDate)}')`;
  }

  if (search) {
    sb.where.search = `(entry_path ILIKE '%${search}%' OR exit_path ILIKE '%${search}%' OR referrer ILIKE '%${search}%' OR referrer_name ILIKE '%${search}%')`;
  }

  if (filters && filters.length > 0) {
    const sessionFilters = getEventFiltersWhereClause(filters);
    sb.where = {
      ...sb.where,
      ...sessionFilters,
    };
  }

  sb.from = TABLE_NAMES.sessions;

  const result = await chQuery<{ count: number }>(getSql());
  return result[0]?.count ?? 0;
}

export const getSessionsCountCached = cacheable(getSessionsCount, 60 * 10);

class SessionService {
  constructor(private client: typeof ch) {}

  async byId(sessionId: string, projectId: string) {
    const result = await clix(this.client)
      .select<IClickhouseSession>(['*'])
      .from(TABLE_NAMES.sessions)
      .where('id', '=', sessionId)
      .where('project_id', '=', projectId)
      .where('sign', '=', 1)
      .execute();

    if (!result[0]) {
      throw new Error('Session not found');
    }

    const session = transformSession(result[0]);
    const profiles = await getProfilesCached([session.profileId], projectId);
    return { ...session, profile: profiles[0] };
  }
}

export const sessionService = new SessionService(ch);

const REPLAY_CHUNKS_PAGE_SIZE = 50;

type ReplayChunkRow = {
  chunk_index: number;
  payload: string;
  chunk_started_at: string;
  chunk_ended_at: string;
};

type ReplayChunkItem = {
  chunkIndex: number;
  startedAtMs: number;
  endedAtMs: number;
  events: { type: number; data: unknown; timestamp: number }[];
};

function transformReplayChunkRow(
  row: ReplayChunkRow,
  chunkIndex: number,
): ReplayChunkItem {
  let events: { type: number; data: unknown; timestamp: number }[] = [];
  try {
    events = JSON.parse(row.payload);
  } catch {
    events = [];
  }
  return {
    chunkIndex,
    startedAtMs: new Date(row.chunk_started_at).getTime(),
    endedAtMs: new Date(row.chunk_ended_at).getTime(),
    events,
  };
}

export async function getSessionReplayChunksFrom(
  sessionId: string,
  projectId: string,
  fromIndex: number,
) {
  // LIMIT 1 BY chunk_index dedupes duplicate rows at the same chunk_index
  // (legacy recorder restart bug) by keeping the earliest one — same semantics
  // as argMin but without holding every payload in memory.
  const rows = await chQuery<ReplayChunkRow>(
    `SELECT chunk_index,
            payload,
            started_at AS chunk_started_at,
            ended_at AS chunk_ended_at
     FROM ${TABLE_NAMES.session_replay_chunks}
     WHERE session_id = ${sqlstring.escape(sessionId)}
       AND project_id = ${sqlstring.escape(projectId)}
     ORDER BY chunk_index, started_at
     LIMIT 1 BY chunk_index
     LIMIT ${REPLAY_CHUNKS_PAGE_SIZE + 1}
     OFFSET ${fromIndex}`,
  );

  const items = rows
    .slice(0, REPLAY_CHUNKS_PAGE_SIZE)
    .map((row, index) => transformReplayChunkRow(row, index + fromIndex));

  return {
    data: items,
    hasMore: rows.length > REPLAY_CHUNKS_PAGE_SIZE,
  };
}

/**
 * Returns the definitive replay duration + chunk count for a session.
 * Used by the player to display the FINAL duration upfront — instead of the
 * progressive `getMetaData().totalTime` that grows as chunks arrive (which
 * makes the timeline jump from "2 min" to "35 min" to "80 min" as the user
 * watches).
 */
export async function getSessionReplayMeta(
  sessionId: string,
  projectId: string,
) {
  const rows = await chQuery<{
    started_at_ms: string;
    ended_at_ms: string;
    chunk_count: string;
  }>(
    `SELECT
       toUnixTimestamp64Milli(min(started_at)) AS started_at_ms,
       toUnixTimestamp64Milli(max(ended_at)) AS ended_at_ms,
       toString(count(DISTINCT chunk_index)) AS chunk_count
     FROM ${TABLE_NAMES.session_replay_chunks}
     WHERE session_id = ${sqlstring.escape(sessionId)}
       AND project_id = ${sqlstring.escape(projectId)}`,
  );
  const row = rows[0];
  if (!row) {
    return { startedAtMs: 0, endedAtMs: 0, totalDurationMs: 0, totalChunkCount: 0 };
  }
  const startedAtMs = Number(row.started_at_ms);
  const endedAtMs = Number(row.ended_at_ms);
  const totalChunkCount = Number(row.chunk_count);
  return {
    startedAtMs,
    endedAtMs,
    totalDurationMs: Math.max(0, endedAtMs - startedAtMs),
    totalChunkCount,
  };
}

export async function getSessionReplayChunksByIndexRange(
  sessionId: string,
  projectId: string,
  fromIndex: number,
  toIndex: number,
) {
  if (toIndex < fromIndex) {
    return { data: [] as ReplayChunkItem[] };
  }
  const rows = await chQuery<ReplayChunkRow>(
    `SELECT chunk_index,
            payload,
            started_at AS chunk_started_at,
            ended_at AS chunk_ended_at
     FROM ${TABLE_NAMES.session_replay_chunks}
     WHERE session_id = ${sqlstring.escape(sessionId)}
       AND project_id = ${sqlstring.escape(projectId)}
       AND chunk_index BETWEEN ${Math.floor(fromIndex)} AND ${Math.floor(toIndex)}
     ORDER BY chunk_index, started_at
     LIMIT 1 BY chunk_index`,
  );

  const items = rows.map((row) =>
    transformReplayChunkRow(row, row.chunk_index),
  );

  return { data: items };
}

export async function batchSessionHasReplay(
  sessionIds: string[],
  projectId: string,
): Promise<Set<string>> {
  if (sessionIds.length === 0) return new Set();
  try {
    const inList = sessionIds.map((id) => sqlstring.escape(id)).join(',');
    const rows = await chQuery<{ session_id: string }>(
      `SELECT DISTINCT session_id
       FROM ${TABLE_NAMES.session_replay_chunks}
       WHERE project_id = ${sqlstring.escape(projectId)}
         AND session_id IN (${inList})`,
    );
    return new Set(rows.map((r) => r.session_id));
  } catch {
    return new Set();
  }
}

export async function sessionHasReplay(
  sessionId: string,
  projectId: string,
): Promise<boolean> {
  const rows = await chQuery<{ has: number }>(
    `SELECT 1 AS has
     FROM ${TABLE_NAMES.session_replay_chunks}
     WHERE session_id = ${sqlstring.escape(sessionId)}
       AND project_id = ${sqlstring.escape(projectId)}
     LIMIT 1`,
  );
  return rows.length > 0;
}
