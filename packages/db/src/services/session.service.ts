import { cacheable } from '@openpanel/redis';
import type { IChartEventFilter } from '@openpanel/validation';
import { uniq } from 'ramda';
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
import { type IServiceProfile, getProfilesCached } from './profile.service';

export type IClickhouseSession = {
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
  properties: Record<string, string>;
};

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
  properties: Record<string, string>;
  profile?: IServiceProfile;
}

export interface GetSessionListOptions {
  projectId: string;
  profileId?: string;
  take: number;
  cursor?: number | Date;
  filters?: IChartEventFilter[];
  startDate?: Date;
  endDate?: Date;
  search?: string;
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
    properties: session.properties,
    profile: undefined,
  };
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

  if (typeof cursor === 'number') {
    sb.offset = Math.max(0, (cursor ?? 0) * take);
  } else if (cursor instanceof Date) {
    sb.where.cursor = `created_at <= '${formatClickhouseDate(cursor)}'`;
  }

  sb.limit = take;
  sb.where.projectId = `project_id = ${sqlstring.escape(projectId)}`;

  // Add sign > 0 condition for versioned collapsing merge tree
  sb.where.sign = 'sign = 1';

  // Select all session fields
  sb.select.id = 'id';
  sb.select.project_id = 'project_id';
  sb.select.profile_id = 'argMax(profile_id, version) AS max_profile_id';
  sb.select.device_id = 'argMax(device_id, version) AS max_device_id';
  sb.select.created_at = 'argMax(created_at, version) AS max_created_at';
  sb.select.ended_at = 'argMax(ended_at, version) AS max_ended_at';
  sb.select.is_bounce = 'argMax(is_bounce, version) AS max_is_bounce';
  sb.select.entry_origin = 'argMax(entry_origin, version) AS max_entry_origin';
  sb.select.entry_path = 'argMax(entry_path, version) AS max_entry_path';
  sb.select.exit_origin = 'argMax(exit_origin, version) AS max_exit_origin';
  sb.select.exit_path = 'argMax(exit_path, version) AS max_exit_path';
  sb.select.screen_view_count =
    'argMax(screen_view_count, version) AS max_screen_view_count';
  sb.select.revenue = 'argMax(revenue, version) AS max_revenue';
  sb.select.event_count = 'argMax(event_count, version) AS max_event_count';
  sb.select.duration = 'argMax(duration, version) AS max_duration';
  sb.select.country = 'argMax(country, version) AS max_country';
  sb.select.region = 'argMax(region, version) AS max_region';
  sb.select.city = 'argMax(city, version) AS max_city';
  sb.select.longitude = 'argMax(longitude, version) AS max_longitude';
  sb.select.latitude = 'argMax(latitude, version) AS max_latitude';
  sb.select.device = 'argMax(device, version) AS max_device';
  sb.select.brand = 'argMax(brand, version) AS max_brand';
  sb.select.model = 'argMax(model, version) AS max_model';
  sb.select.browser = 'argMax(browser, version) AS max_browser';
  sb.select.browser_version =
    'argMax(browser_version, version) AS max_browser_version';
  sb.select.os = 'argMax(os, version) AS max_os';
  sb.select.os_version = 'argMax(os_version, version) AS max_os_version';
  sb.select.utm_medium = 'argMax(utm_medium, version) AS max_utm_medium';
  sb.select.utm_source = 'argMax(utm_source, version) AS max_utm_source';
  sb.select.utm_campaign = 'argMax(utm_campaign, version) AS max_utm_campaign';
  sb.select.utm_content = 'argMax(utm_content, version) AS max_utm_content';
  sb.select.utm_term = 'argMax(utm_term, version) AS max_utm_term';
  sb.select.referrer = 'argMax(referrer, version) AS max_referrer';
  sb.select.referrer_name =
    'argMax(referrer_name, version) AS max_referrer_name';
  sb.select.referrer_type =
    'argMax(referrer_type, version) AS max_referrer_type';
  sb.select.properties = 'argMax(properties, version) AS max_propertie';

  sb.groupBy.id = 'id';

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
    // Adapt the event filters to work with session fields where possible
    const sessionFilters = getEventFiltersWhereClause(filters);
    sb.where = {
      ...sb.where,
      ...sessionFilters,
    };
  }

  sb.orderBy.created_at = 'toDate(s.created_at) DESC';
  sb.from = `${TABLE_NAMES.sessions} s`;
  sb.groupBy.sign = 'sign';
  sb.groupBy.pid = 'project_id';

  console.log('SQL-------------->', getSql());

  const data = await chQuery<IClickhouseSession>(getSql());
  console.log('data', data[0]);

  const profileIds = data
    .filter((e) => e.device_id !== e.profile_id)
    .map((e) => e.profile_id);
  const profiles = await getProfilesCached(profileIds, projectId);

  const map = new Map<string, IServiceProfile>();
  for (const profile of profiles) {
    map.set(profile.id, profile);
  }

  const removeMaxPrefix = (key: string) => key.replace('max_', '');

  const najs = data
    .map((item) => {
      return Object.fromEntries(
        Object.entries(item).map(([key, value]) => [
          removeMaxPrefix(key),
          value,
        ]),
      );
    })
    .map(transformSession)
    .map((item) => {
      return {
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
      };
    })
    .map((item) => ({
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

  console.log(najs[0]);

  return najs;
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

    return transformSession(result[0]);
  }
}

export const sessionService = new SessionService(ch);
