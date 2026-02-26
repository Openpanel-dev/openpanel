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
import { getOrganizationByProjectIdCached } from './organization.service';
import { getProfilesCached, type IServiceProfile } from './profile.service';

export interface IClickhouseSession {
  id: string;
  profile_id: string;
  event_count: number;
  screen_view_count: number;
  screen_views: string[];
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
  };
}

interface PageInfo {
  next?: Cursor; // use last row
}

interface Cursor {
  createdAt: string; // ISO 8601 with ms
  id: string;
}

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

  const organization = await getOrganizationByProjectIdCached(projectId);
  // This will speed up the query quite a lot for big organizations
  const dateIntervalInDays =
    organization?.subscriptionPeriodEventsLimit &&
    organization?.subscriptionPeriodEventsLimit > 1_000_000
      ? 2
      : 360;

  if (cursor) {
    const cAt = sqlstring.escape(cursor.createdAt);
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

  sb.select.has_replay = `toBool(src.session_id != '') as hasReplay`;
  sb.joins.has_replay = `LEFT JOIN (SELECT DISTINCT session_id FROM ${TABLE_NAMES.session_replay_chunks} WHERE project_id = ${sqlstring.escape(projectId)} AND started_at > now() - INTERVAL ${dateIntervalInDays} DAY) AS src ON src.session_id = id`;

  const sql = getSql();
  const data = await chQuery<
    IClickhouseSession & {
      latestCreatedAt: string;
      hasReplay: boolean;
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

class SessionService {
  constructor(private client: typeof ch) {}

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
