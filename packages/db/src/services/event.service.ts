import { path, assocPath, last, mergeDeepRight } from 'ramda';
import { escape } from 'sqlstring';
import { v4 as uuid } from 'uuid';

import { DateTime, toDots } from '@openpanel/common';
import { cacheable, getCache } from '@openpanel/redis';
import type { IChartEventFilter } from '@openpanel/validation';

import { botBuffer, eventBuffer, sessionBuffer } from '../buffers';
import {
  TABLE_NAMES,
  ch,
  chQuery,
  convertClickhouseDateToJs,
  formatClickhouseDate,
} from '../clickhouse/client';
import { type Query, clix } from '../clickhouse/query-builder';
import type { EventMeta, Prisma } from '../prisma-client';
import { db } from '../prisma-client';
import { createSqlBuilder } from '../sql-builder';
import { getEventFiltersWhereClause } from './chart.service';
import type { IServiceProfile } from './profile.service';
import { getProfileById, getProfiles, upsertProfile } from './profile.service';

export type IImportedEvent = Omit<
  IClickhouseEvent,
  'properties' | 'profile' | 'meta' | 'imported_at'
> & {
  properties: Record<string, unknown>;
};

export type IServicePage = {
  path: string;
  count: number;
  project_id: string;
  first_seen: string;
  title: string;
  origin: string;
};

export interface IClickhouseBotEvent {
  id: string;
  name: string;
  type: string;
  project_id: string;
  path: string;
  created_at: string;
}

export interface IServiceBotEvent {
  id: string;
  name: string;
  type: string;
  projectId: string;
  path: string;
  createdAt: Date;
}

export type IServiceCreateBotEventPayload = Omit<IServiceBotEvent, 'id'>;

export interface IClickhouseEvent {
  id: string;
  name: string;
  device_id: string;
  profile_id: string;
  project_id: string;
  session_id: string;
  path: string;
  origin: string;
  referrer: string;
  referrer_name: string;
  referrer_type: string;
  duration: number;
  properties: Record<string, string | number | boolean | undefined | null>;
  created_at: string;
  country: string;
  city: string;
  region: string;
  longitude: number | null;
  latitude: number | null;
  os: string;
  os_version: string;
  browser: string;
  browser_version: string;
  device: string;
  brand: string;
  model: string;
  imported_at: string | null;
  sdk_name: string;
  sdk_version: string;

  // They do not exist here. Just make ts happy for now
  profile?: IServiceProfile;
  meta?: EventMeta;
}

export function transformEvent(event: IClickhouseEvent): IServiceEvent {
  return {
    id: event.id,
    name: event.name,
    deviceId: event.device_id,
    profileId: event.profile_id,
    projectId: event.project_id,
    sessionId: event.session_id,
    properties: event.properties,
    createdAt: convertClickhouseDateToJs(event.created_at),
    country: event.country,
    city: event.city,
    region: event.region,
    longitude: event.longitude,
    latitude: event.latitude,
    os: event.os,
    osVersion: event.os_version,
    browser: event.browser,
    browserVersion: event.browser_version,
    device: event.device,
    brand: event.brand,
    model: event.model,
    duration: event.duration,
    path: event.path,
    origin: event.origin,
    referrer: event.referrer,
    referrerName: event.referrer_name,
    referrerType: event.referrer_type,
    meta: event.meta,
    importedAt: event.imported_at ? new Date(event.imported_at) : undefined,
    sdkName: event.sdk_name,
    sdkVersion: event.sdk_version,
    profile: event.profile,
  };
}

export type IServiceCreateEventPayload = Omit<
  IServiceEvent,
  'id' | 'importedAt' | 'profile' | 'meta'
>;

export interface IServiceEvent {
  id: string;
  name: string;
  deviceId: string;
  profileId: string;
  projectId: string;
  sessionId: string;
  properties: Record<string, unknown> & {
    hash?: string;
    query?: Record<string, unknown>;
    __reqId?: string;
    __user_agent?: string;
  };
  createdAt: Date;
  country?: string | undefined;
  city?: string | undefined;
  region?: string | undefined;
  longitude?: number | undefined | null;
  latitude?: number | undefined | null;
  os?: string | undefined;
  osVersion?: string | undefined;
  browser?: string | undefined;
  browserVersion?: string | undefined;
  device?: string | undefined;
  brand?: string | undefined;
  model?: string | undefined;
  duration: number;
  path: string;
  origin: string;
  referrer: string | undefined;
  referrerName: string | undefined;
  referrerType: string | undefined;
  importedAt: Date | undefined;
  profile: IServiceProfile | undefined;
  meta: EventMeta | undefined;
  sdkName: string | undefined;
  sdkVersion: string | undefined;
}

type SelectHelper<T> = {
  [K in keyof T]?: boolean;
};

export interface IServiceEventMinimal {
  id: string;
  name: string;
  projectId: string;
  sessionId: string;
  createdAt: Date;
  country?: string | undefined;
  longitude?: number | undefined | null;
  latitude?: number | undefined | null;
  os?: string | undefined;
  browser?: string | undefined;
  device?: string | undefined;
  brand?: string | undefined;
  duration: number;
  path: string;
  origin: string;
  referrer: string | undefined;
  meta: EventMeta | undefined;
  minimal: boolean;
}

interface GetEventsOptions {
  profile?: boolean;
  meta?: boolean | Prisma.EventMetaSelect;
}

function maskString(str: string, mask = '*') {
  const allMasked = str.replace(/(\w)/g, mask);
  if (str.length < 8) {
    return allMasked;
  }

  return `${str.slice(0, 4)}${allMasked.slice(4)}`;
}

export function transformMinimalEvent(
  event: IServiceEvent,
): IServiceEventMinimal {
  return {
    id: event.id,
    name: event.name,
    projectId: event.projectId,
    sessionId: event.sessionId,
    createdAt: event.createdAt,
    country: event.country,
    longitude: event.longitude,
    latitude: event.latitude,
    os: event.os,
    browser: event.browser,
    device: event.device,
    brand: event.brand,
    duration: event.duration,
    path: maskString(event.path),
    origin: event.origin,
    referrer: event.referrer,
    meta: event.meta,
    minimal: true,
  };
}

export function getEventMetas(projectId: string) {
  return db.eventMeta.findMany({
    where: {
      projectId,
    },
  });
}

export const getEventMetasCached = cacheable(getEventMetas, 60 * 5);

export async function getEvents(
  sql: string,
  options: GetEventsOptions = {},
): Promise<IServiceEvent[]> {
  const events = await chQuery<IClickhouseEvent>(sql);
  const projectId = events[0]?.project_id;
  if (options.profile && projectId) {
    const ids = events
      .filter((e) => e.device_id !== e.profile_id)
      .map((e) => e.profile_id);
    const profiles = await getProfiles(ids, projectId);

    const map = new Map<string, IServiceProfile>();
    for (const profile of profiles) {
      map.set(profile.id, profile);
    }

    for (const event of events) {
      event.profile = map.get(event.profile_id);
    }
  }

  if (options.meta && projectId) {
    const metas = await getEventMetasCached(projectId);
    const map = new Map<string, EventMeta>();
    for (const meta of metas) {
      map.set(meta.name, meta);
    }
    for (const event of events) {
      event.meta = map.get(event.name);
    }
  }
  return events.map(transformEvent);
}

export async function createEvent(payload: IServiceCreateEventPayload) {
  if (!payload.profileId && payload.deviceId) {
    payload.profileId = payload.deviceId;
  }

  const event: IClickhouseEvent = {
    id: uuid(),
    name: payload.name,
    device_id: payload.deviceId,
    profile_id: payload.profileId ? String(payload.profileId) : '',
    project_id: payload.projectId,
    session_id: payload.sessionId,
    properties: toDots(payload.properties),
    path: payload.path ?? '',
    origin: payload.origin ?? '',
    created_at: DateTime.fromJSDate(payload.createdAt)
      .setZone('UTC')
      .toFormat('yyyy-MM-dd HH:mm:ss.SSS'),
    country: payload.country ?? '',
    city: payload.city ?? '',
    region: payload.region ?? '',
    longitude: payload.longitude ?? null,
    latitude: payload.latitude ?? null,
    os: payload.os ?? '',
    os_version: payload.osVersion ?? '',
    browser: payload.browser ?? '',
    browser_version: payload.browserVersion ?? '',
    device: payload.device ?? '',
    brand: payload.brand ?? '',
    model: payload.model ?? '',
    duration: payload.duration,
    referrer: payload.referrer ?? '',
    referrer_name: payload.referrerName ?? '',
    referrer_type: payload.referrerType ?? '',
    imported_at: null,
    sdk_name: payload.sdkName ?? '',
    sdk_version: payload.sdkVersion ?? '',
  };

  await Promise.all([sessionBuffer.add(event), eventBuffer.add(event)]);

  if (payload.profileId) {
    const profile = {
      id: String(payload.profileId),
      isExternal: payload.profileId !== payload.deviceId,
      projectId: payload.projectId,
      properties: {
        path: payload.path,
        country: payload.country,
        city: payload.city,
        region: payload.region,
        longitude: payload.longitude,
        latitude: payload.latitude,
        os: payload.os,
        os_version: payload.osVersion,
        browser: payload.browser,
        browser_version: payload.browserVersion,
        device: payload.device,
        brand: payload.brand,
        model: payload.model,
        referrer: payload.referrer,
        referrer_name: payload.referrerName,
        referrer_type: payload.referrerType,
      },
    };

    if (
      profile.isExternal ||
      (profile.isExternal === false && payload.name === 'session_start')
    ) {
      await upsertProfile(profile, true);
    }
  }

  return {
    document: event,
  };
}

export interface GetEventListOptions {
  projectId: string;
  profileId?: string;
  take: number;
  cursor?: number | Date;
  events?: string[] | null;
  filters?: IChartEventFilter[];
  startDate?: Date;
  endDate?: Date;
  select?: SelectHelper<IServiceEvent>;
}

export async function getEventList({
  cursor,
  take,
  projectId,
  profileId,
  events,
  filters,
  startDate,
  endDate,
  select: incomingSelect,
}: GetEventListOptions) {
  const { sb, getSql, join } = createSqlBuilder();

  if (typeof cursor === 'number') {
    sb.offset = Math.max(0, (cursor ?? 0) * take);
  } else if (cursor instanceof Date) {
    sb.where.cursor = `created_at <= '${formatClickhouseDate(cursor)}'`;
  }

  sb.limit = take;
  sb.where.projectId = `project_id = ${escape(projectId)}`;
  const select = mergeDeepRight(
    {
      id: true,
      name: true,
      deviceId: true,
      profileId: true,
      sessionId: true,
      projectId: true,
      createdAt: true,
      path: true,
      duration: true,
      city: true,
      country: true,
      os: true,
      browser: true,
    },
    incomingSelect ?? {},
  );

  if (select.id) {
    sb.select.id = 'id';
  }
  if (select.name) {
    sb.select.name = 'name';
  }
  if (select.deviceId) {
    sb.select.deviceId = 'device_id';
  }
  if (select.profileId) {
    sb.select.profileId = 'profile_id';
  }
  if (select.projectId) {
    sb.select.projectId = 'project_id';
  }
  if (select.sessionId) {
    sb.select.sessionId = 'session_id';
  }
  if (select.properties) {
    sb.select.properties = 'properties';
  }
  if (select.createdAt) {
    sb.select.createdAt = 'created_at';
  }
  if (select.country) {
    sb.select.country = 'country';
  }
  if (select.city) {
    sb.select.city = 'city';
  }
  if (select.region) {
    sb.select.region = 'region';
  }
  if (select.longitude) {
    sb.select.longitude = 'longitude';
  }
  if (select.latitude) {
    sb.select.latitude = 'latitude';
  }
  if (select.os) {
    sb.select.os = 'os';
  }
  if (select.osVersion) {
    sb.select.osVersion = 'os_version';
  }
  if (select.browser) {
    sb.select.browser = 'browser';
  }
  if (select.browserVersion) {
    sb.select.browserVersion = 'browser_version';
  }
  if (select.device) {
    sb.select.device = 'device';
  }
  if (select.brand) {
    sb.select.brand = 'brand';
  }
  if (select.model) {
    sb.select.model = 'model';
  }
  if (select.duration) {
    sb.select.duration = 'duration';
  }
  if (select.path) {
    sb.select.path = 'path';
  }
  if (select.origin) {
    sb.select.origin = 'origin';
  }
  if (select.referrer) {
    sb.select.referrer = 'referrer';
  }
  if (select.referrerName) {
    sb.select.referrerName = 'referrer_name';
  }
  if (select.referrerType) {
    sb.select.referrerType = 'referrer_type';
  }
  if (select.importedAt) {
    sb.select.importedAt = 'imported_at';
  }
  if (select.sdkName) {
    sb.select.sdkName = 'sdk_name';
  }
  if (select.sdkVersion) {
    sb.select.sdkVersion = 'sdk_version';
  }

  if (profileId) {
    sb.where.deviceId = `(device_id IN (SELECT device_id as did FROM ${TABLE_NAMES.events} WHERE project_id = ${escape(projectId)} AND device_id != '' AND profile_id = ${escape(profileId)} group by did) OR profile_id = ${escape(profileId)})`;
  }

  if (startDate && endDate) {
    sb.where.created_at = `toDate(created_at) BETWEEN toDate('${formatClickhouseDate(startDate)}') AND toDate('${formatClickhouseDate(endDate)}')`;
  }

  if (events && events.length > 0) {
    sb.where.events = `name IN (${join(
      events.map((event) => escape(event)),
      ',',
    )})`;
  }

  if (filters) {
    sb.where = {
      ...sb.where,
      ...getEventFiltersWhereClause(filters),
    };
  }

  sb.orderBy.created_at =
    'toDate(created_at) DESC, created_at DESC, profile_id DESC, name DESC';

  return getEvents(getSql(), {
    profile: select.profile ?? true,
    meta: select.meta ?? true,
  });
}

export const getEventsCountCached = cacheable(getEventsCount, 60 * 10);
export async function getEventsCount({
  projectId,
  profileId,
  events,
  filters,
  startDate,
  endDate,
}: Omit<GetEventListOptions, 'cursor' | 'take'>) {
  const { sb, getSql, join } = createSqlBuilder();
  sb.where.projectId = `project_id = ${escape(projectId)}`;
  if (profileId) {
    sb.where.profileId = `profile_id = ${escape(profileId)}`;
  }

  if (startDate && endDate) {
    sb.where.created_at = `toDate(created_at) BETWEEN toDate('${formatClickhouseDate(startDate)}') AND toDate('${formatClickhouseDate(endDate)}')`;
  }

  if (events && events.length > 0) {
    sb.where.events = `name IN (${join(
      events.map((event) => escape(event)),
      ',',
    )})`;
  }

  if (filters) {
    sb.where = {
      ...sb.where,
      ...getEventFiltersWhereClause(filters),
    };
  }

  const res = await chQuery<{ count: number }>(
    getSql().replace('*', 'count(*) as count'),
  );

  return res[0]?.count ?? 0;
}

export function createBotEvent({
  name,
  type,
  projectId,
  createdAt,
  path,
}: IServiceCreateBotEventPayload) {
  return botBuffer.add({
    id: uuid(),
    name,
    type,
    project_id: projectId,
    path,
    created_at: formatClickhouseDate(createdAt),
  });
}

export function getConversionEventNames(projectId: string) {
  return db.eventMeta.findMany({
    where: {
      projectId,
      conversion: true,
    },
  });
}

export async function getTopPages({
  projectId,
  cursor,
  take,
  search,
}: {
  projectId: string;
  cursor?: number;
  take: number;
  search?: string;
}) {
  const res = await chQuery<IServicePage>(`
    SELECT path, count(*) as count, project_id, first_value(created_at) as first_seen, last_value(properties['__title']) as title, origin
    FROM ${TABLE_NAMES.events} 
    WHERE name = 'screen_view' 
    AND  project_id = ${escape(projectId)} 
    AND created_at > now() - INTERVAL 30 DAY 
    ${search ? `AND path ILIKE '%${search}%'` : ''}
    GROUP BY path, project_id, origin
    ORDER BY count desc 
    LIMIT ${take} 
    OFFSET ${Math.max(0, (cursor ?? 0) * take)}
  `);

  return res;
}

export interface IEventServiceGetList {
  projectId: string;
  profileId?: string;
  cursor?: Date;
  filters?: IChartEventFilter[];
}

class EventService {
  constructor(private client: typeof ch) {}

  query<T>({
    projectId,
    profileId,
    where,
    select,
    limit,
    orderBy,
  }: {
    projectId: string;
    profileId?: string;
    where?: {
      profile?: (query: Query<T>) => void;
      event?: (query: Query<T>) => void;
      session?: (query: Query<T>) => void;
    };
    select: {
      profile?: Partial<SelectHelper<IServiceProfile>>;
      event: Partial<SelectHelper<IServiceEvent>>;
    };
    limit?: number;
    orderBy?: keyof IClickhouseEvent;
  }) {
    const events = clix(this.client)
      .select<
        Partial<IClickhouseEvent> & {
          // profile
          profileId: string;
          profile_firstName: string;
          profile_lastName: string;
          profile_avatar: string;
          profile_isExternal: boolean;
          profile_createdAt: string;
        }
      >([
        select.event.id && 'e.id as id',
        select.event.deviceId && 'e.device_id as device_id',
        select.event.name && 'e.name as name',
        select.event.path && 'e.path as path',
        select.event.duration && 'e.duration as duration',
        select.event.country && 'e.country as country',
        select.event.city && 'e.city as city',
        select.event.os && 'e.os as os',
        select.event.browser && 'e.browser as browser',
        select.event.createdAt && 'e.created_at as created_at',
        select.event.projectId && 'e.project_id as project_id',
        'e.session_id as session_id',
        'e.profile_id as profile_id',
      ])
      .from('events e')
      .where('project_id', '=', projectId)
      .when(!!where?.event, where?.event)
      // Do not limit if profileId, we will limit later since we need the "correct" profileId
      .when(!!limit && !profileId, (q) => q.limit(limit!))
      .orderBy('toDate(created_at)', 'DESC')
      .orderBy('created_at', 'DESC');

    const sessions = clix(this.client)
      .select(['id as session_id', 'profile_id'])
      .from('sessions')
      .where('sign', '=', 1)
      .where('project_id', '=', projectId)
      .when(!!where?.session, where?.session)
      .when(!!profileId, (q) => q.where('profile_id', '=', profileId));

    const profiles = clix(this.client)
      .select([
        'id',
        'any(created_at) as created_at',
        `any(nullIf(first_name, '')) as first_name`,
        `any(nullIf(last_name, '')) as last_name`,
        `any(nullIf(email, '')) as email`,
        `any(nullIf(avatar, '')) as avatar`,
        'last_value(is_external) as is_external',
      ])
      .from('profiles')
      .where('project_id', '=', projectId)
      .where(
        'id',
        'IN',
        clix.exp(
          clix(this.client)
            .select(['profile_id'])
            .from(
              clix.exp(
                clix(this.client)
                  .select(['profile_id'])
                  .from('cte_sessions')
                  .union(
                    clix(this.client).select(['profile_id']).from('cte_events'),
                  ),
              ),
            )
            .groupBy(['profile_id']),
        ),
      )
      .groupBy(['id', 'project_id'])
      .when(!!where?.profile, where?.profile);

    return clix(this.client)
      .with('cte_events', events)
      .with('cte_sessions', sessions)
      .with('cte_profiles', profiles)
      .select<
        Partial<IClickhouseEvent> & {
          // profile
          profileId: string;
          profile_firstName: string;
          profile_lastName: string;
          profile_avatar: string;
          profile_isExternal: boolean;
          profile_createdAt: string;
        }
      >([
        select.event.id && 'e.id as id',
        select.event.deviceId && 'e.device_id as device_id',
        select.event.name && 'e.name as name',
        select.event.path && 'e.path as path',
        select.event.duration && 'e.duration as duration',
        select.event.country && 'e.country as country',
        select.event.city && 'e.city as city',
        select.event.os && 'e.os as os',
        select.event.browser && 'e.browser as browser',
        select.event.createdAt && 'e.created_at as created_at',
        select.event.projectId && 'e.project_id as project_id',
        select.event.sessionId && 'e.session_id as session_id',
        select.event.profileId && 'e.profile_id as event_profile_id',
        // Profile
        select.profile?.id && 'p.id as profile_id',
        select.profile?.firstName && 'p.first_name as profile_first_name',
        select.profile?.lastName && 'p.last_name as profile_last_name',
        select.profile?.avatar && 'p.avatar as profile_avatar',
        select.profile?.isExternal && 'p.is_external as profile_is_external',
        select.profile?.createdAt && 'p.created_at as profile_created_at',
        select.profile?.email && 'p.email as profile_email',
        select.profile?.properties && 'p.properties as profile_properties',
      ])
      .from('cte_events e')
      .leftJoin('cte_sessions s', 'e.session_id = s.session_id')
      .leftJoin(
        'cte_profiles p',
        's.profile_id = p.id AND p.is_external = true',
      )
      .when(!!profileId, (q) => {
        q.where('s.profile_id', '=', profileId);
        q.limit(limit!);
      });
  }

  transformFromQuery(res: any[]) {
    return res
      .map((item) => {
        return Object.entries(item).reduce(
          (acc, [prop, val]) => {
            if (prop === 'event_profile_id' && val) {
              if (!item.profile_id) {
                return assocPath(['profile', 'id'], val, acc);
              }
            }

            if (
              prop.startsWith('profile_') &&
              !path(['profile', prop.replace('profile_', '')], acc)
            ) {
              return assocPath(
                ['profile', prop.replace('profile_', '')],
                val,
                acc,
              );
            }
            return assocPath([prop], val, acc);
          },
          {
            profile: {},
          } as IClickhouseEvent,
        );
      })
      .map(transformEvent);
  }

  async getById({
    projectId,
    id,
    createdAt,
  }: {
    projectId: string;
    id: string;
    createdAt?: Date;
  }) {
    const event = await clix(this.client)
      .select<IClickhouseEvent>(['*'])
      .from('events')
      .where('project_id', '=', projectId)
      .when(!!createdAt, (q) => {
        if (createdAt) {
          q.where('created_at', 'BETWEEN', [
            new Date(createdAt.getTime() - 1000),
            new Date(createdAt.getTime() + 1000),
          ]);
        }
      })
      .where('id', '=', id)
      .limit(1)
      .execute()
      .then((res) => {
        if (!res[0]) {
          return null;
        }

        return transformEvent(res[0]);
      });

    if (event?.profileId) {
      const profile = await getProfileById(event?.profileId, projectId);
      if (profile) {
        event.profile = profile;
      }
    }

    return event;
  }

  async getList({
    projectId,
    profileId,
    cursor,
    filters,
    limit = 50,
    startDate,
    endDate,
  }: IEventServiceGetList & {
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  }) {
    const date = cursor || new Date();
    const query = this.query({
      projectId,
      profileId,
      limit,
      orderBy: 'created_at',
      select: {
        event: {
          deviceId: true,
          profileId: true,
          id: true,
          name: true,
          createdAt: true,
          duration: true,
          country: true,
          city: true,
          os: true,
          browser: true,
          path: true,
          sessionId: true,
        },
        profile: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
          isExternal: true,
        },
      },
      where: {
        event: (q) => {
          if (startDate && endDate) {
            q.where('created_at', 'BETWEEN', [
              startDate ?? new Date(date.getTime() - 1000 * 60 * 60 * 24 * 3.5),
              cursor ?? endDate,
            ]);
          } else {
            q.where('created_at', '<', date);
          }
          if (filters) {
            q.rawWhere(
              Object.values(getEventFiltersWhereClause(filters)).join(' AND '),
            );
          }
        },
        session: (q) => {
          if (startDate && endDate) {
            q.where('created_at', 'BETWEEN', [
              startDate ?? new Date(date.getTime() - 1000 * 60 * 60 * 24 * 3.5),
              endDate ?? date,
            ]);
          } else {
            q.where('created_at', '<', date);
          }
        },
      },
    })
      .orderBy('toDate(created_at)', 'DESC')
      .orderBy('created_at', 'DESC');

    const results = await query.execute();

    // Current page items (middle chunk)
    const items = results.slice(0, limit);

    // Check if there's a next page
    const hasNext = results.length >= limit;

    return {
      items: this.transformFromQuery(items).map((item) => ({
        ...item,
        projectId: projectId,
      })),
      meta: {
        next: hasNext ? last(items)?.created_at : null,
      },
    };
  }
}

export const eventService = new EventService(ch);
