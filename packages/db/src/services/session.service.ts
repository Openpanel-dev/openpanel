import { getSafeJson } from '@openpanel/json';
import { cacheable } from '@openpanel/redis';
import type { IChartEventFilter } from '@openpanel/validation';
import sqlstring from 'sqlstring';
import {
  ch,
  chQuery,
  convertClickhouseDateToJs,
  formatClickhouseDate,
  TABLE_NAMES,
} from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';
import { createSqlBuilder } from '../sql-builder';
import { getEventFiltersWhereClause } from './chart.service';
import { getProfilesCached, type IServiceProfile } from './profile.service';

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
  sign: 1 | 0;
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
  minPageViews?: number | null;
  maxPageViews?: number | null;
  minEvents?: number | null;
  maxEvents?: number | null;
  dateIntervalInDays?: number;
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

export async function getSessionList(options: GetSessionListOptions) {
  const {
    cursor,
    take,
    projectId,
    profileId,
    filters,
    startDate,
    endDate,
    search,
    minPageViews,
    maxPageViews,
    minEvents,
    maxEvents,
    dateIntervalInDays = 0.5,
  } = options;

  const { sb, getSql } = createSqlBuilder();

  sb.from = `${TABLE_NAMES.sessions} FINAL`;
  sb.limit = take;
  sb.where.projectId = `project_id = ${sqlstring.escape(projectId)}`;

  const MAX_DATE_INTERVAL_IN_DAYS = 365;
  // Cap the date interval to prevent infinity
  const safeDateIntervalInDays = Math.min(
    dateIntervalInDays,
    MAX_DATE_INTERVAL_IN_DAYS
  );

  if (cursor instanceof Date) {
    sb.where.cursorWindow = `created_at >= toDateTime64(${sqlstring.escape(formatClickhouseDate(cursor))}, 3) - INTERVAL ${safeDateIntervalInDays} DAY`;
    sb.where.cursor = `created_at < ${sqlstring.escape(formatClickhouseDate(cursor))}`;
  }

  if (!(cursor || (startDate && endDate))) {
    sb.where.cursorWindow = `created_at >= toDateTime64(${sqlstring.escape(formatClickhouseDate(new Date()))}, 3) - INTERVAL ${safeDateIntervalInDays} DAY`;
  }

  if (startDate && endDate) {
    sb.where.created_at = `toDate(created_at) BETWEEN toDate('${formatClickhouseDate(startDate)}') AND toDate('${formatClickhouseDate(endDate)}')`;
  }

  sb.orderBy.created_at = 'created_at DESC';

  if (profileId) {
    sb.where.profileId = `profile_id = ${sqlstring.escape(profileId)}`;
  }
  if (search) {
    const s = sqlstring.escape(`%${search}%`);
    sb.where.search = `(entry_path ILIKE ${s} OR exit_path ILIKE ${s} OR referrer ILIKE ${s} OR referrer_name ILIKE ${s})`;
  }
  if (filters?.length) {
    Object.assign(sb.where, getEventFiltersWhereClause(filters));
  }
  if (minPageViews != null) {
    sb.where.minPageViews = `screen_view_count >= ${minPageViews}`;
  }
  if (maxPageViews != null) {
    sb.where.maxPageViews = `screen_view_count <= ${maxPageViews}`;
  }
  if (minEvents != null) {
    sb.where.minEvents = `event_count >= ${minEvents}`;
  }
  if (maxEvents != null) {
    sb.where.maxEvents = `event_count <= ${maxEvents}`;
  }

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
    'groups',
  ];

  columns.forEach((column) => {
    sb.select[column] = column;
  });

  sb.select.has_replay = `toBool(src.session_id != '') as hasReplay`;
  sb.joins.has_replay = `LEFT JOIN (SELECT DISTINCT session_id FROM ${TABLE_NAMES.session_replay_chunks} WHERE project_id = ${sqlstring.escape(projectId)} AND started_at > now() - INTERVAL ${dateIntervalInDays} DAY) AS src ON src.session_id = id`;

  const sql = getSql();
  const data = await chQuery<
    IClickhouseSession & {
      latestCreatedAt: string;
      hasReplay: boolean;
    }
  >(sql);

  // If no results and we haven't reached the max window, retry with a larger interval
  if (
    data.length === 0 &&
    sb.where.cursorWindow &&
    safeDateIntervalInDays < MAX_DATE_INTERVAL_IN_DAYS
  ) {
    return getSessionList({
      ...options,
      dateIntervalInDays: dateIntervalInDays * 2,
    });
  }

  // Profile hydration (unchanged)
  const profileIds = data
    .filter((e) => e.device_id !== e.profile_id)
    .map((e) => e.profile_id);
  const profiles = await getProfilesCached(profileIds, projectId);
  const map = new Map<string, IServiceProfile>(profiles.map((p) => [p.id, p]));

  const items = data.map(transformSession).map((item) => ({
    ...item,
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
      groups: [],
    },
  }));

  // Compute cursors from page edges
  const last = items.at(-1);

  const meta = {
    next: last ? last.createdAt.toISOString() : undefined,
  };

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

export interface ISessionReplayChunkMeta {
  chunk_index: number;
  started_at: string;
  ended_at: string;
  events_count: number;
  is_full_snapshot: boolean;
}

const REPLAY_CHUNKS_PAGE_SIZE = 40;

export async function getSessionReplayChunksFrom(
  sessionId: string,
  projectId: string,
  fromIndex: number
) {
  const rows = await chQuery<{ chunk_index: number; payload: string }>(
    `SELECT chunk_index, payload
     FROM ${TABLE_NAMES.session_replay_chunks}
     WHERE session_id = ${sqlstring.escape(sessionId)}
       AND project_id = ${sqlstring.escape(projectId)}
     ORDER BY started_at, ended_at, chunk_index
     LIMIT ${REPLAY_CHUNKS_PAGE_SIZE + 1}
     OFFSET ${fromIndex}`
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

export const SESSION_DISTINCT_FIELDS = [
  'referrer_name',
  'country',
  'os',
  'browser',
  'device',
] as const;

export type SessionDistinctField = (typeof SESSION_DISTINCT_FIELDS)[number];

export async function getSessionDistinctValues(
  projectId: string,
  field: SessionDistinctField,
  limit = 200
): Promise<string[]> {
  const sql = `
    SELECT ${field} AS value, count() AS cnt
    FROM ${TABLE_NAMES.sessions}
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND ${field} != ''
      AND sign = 1
      AND created_at > now() - INTERVAL 90 DAY
    GROUP BY value
    ORDER BY cnt DESC
    LIMIT ${limit}
  `;
  const results = await chQuery<{ value: string }>(sql);
  return results.map((r) => r.value).filter(Boolean);
}

class SessionService {
  private readonly client: typeof ch;
  constructor(client: typeof ch) {
    this.client = client;
  }

  async byId(sessionId: string, projectId: string) {
    const [sessionRows, hasReplayRows] = await Promise.all([
      clix(this.client)
        .select<IClickhouseSession>(['*'])
        .from(TABLE_NAMES.sessions, true)
        .where('id', '=', sessionId)
        .where('project_id', '=', projectId)
        .where('sign', '=', 1)
        .execute(),
      chQuery<{ n: number }>(
        `SELECT 1 AS n
         FROM ${TABLE_NAMES.session_replay_chunks}
         WHERE session_id = ${sqlstring.escape(sessionId)}
           AND project_id = ${sqlstring.escape(projectId)}
         LIMIT 1`
      ),
    ]);

    if (!sessionRows[0]) {
      throw new Error('Session not found');
    }

    const session = transformSession(sessionRows[0]);

    return {
      ...session,
      hasReplay: hasReplayRows.length > 0,
    };
  }
}

export const sessionService = new SessionService(ch);
