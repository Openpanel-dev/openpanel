import { omit, uniq } from 'ramda';
import { escape } from 'sqlstring';
import { v4 as uuid } from 'uuid';

import { toDots } from '@openpanel/common';
import { getRedisCache } from '@openpanel/redis';
import type { IChartEventFilter } from '@openpanel/validation';

import { eventBuffer } from '../buffers';
import {
  ch,
  chQuery,
  convertClickhouseDateToJs,
  formatClickhouseDate,
  TABLE_NAMES,
} from '../clickhouse-client';
import type { EventMeta, Prisma } from '../prisma-client';
import { db } from '../prisma-client';
import { createSqlBuilder } from '../sql-builder';
import { getEventFiltersWhereClause } from './chart.service';
import { getProfiles, upsertProfile } from './profile.service';
import type { IServiceProfile } from './profile.service';

export type IImportedEvent = Omit<
  IClickhouseEvent,
  'properties' | 'profile' | 'meta' | 'imported_at'
> & {
  properties: Record<string, unknown>;
};

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
    profile: event.profile,
    meta: event.meta,
    importedAt: event.imported_at ? new Date(event.imported_at) : null,
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
  importedAt: Date | null;
  profile: IServiceProfile | undefined;
  meta: EventMeta | undefined;
}

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
  profile?: boolean | Prisma.ProfileSelect;
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
  event: IServiceEvent
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

export async function getLiveVisitors(projectId: string) {
  const keys = await getRedisCache().keys(`live:event:${projectId}:*`);
  return keys.length;
}

export async function getEvents(
  sql: string,
  options: GetEventsOptions = {}
): Promise<IServiceEvent[]> {
  const events = await chQuery<IClickhouseEvent>(sql);
  if (options.profile) {
    const ids = events.map((e) => e.profile_id);
    const profiles = await getProfiles(ids);

    for (const event of events) {
      event.profile = profiles.find((p) => p.id === event.profile_id);
    }
  }

  if (options.meta) {
    const names = uniq(events.map((e) => e.name));
    const metas = await db.eventMeta.findMany({
      where: {
        name: {
          in: names,
        },
        projectId: events[0]?.project_id,
      },
      select: options.meta === true ? undefined : options.meta,
    });
    for (const event of events) {
      event.meta = metas.find((m) => m.name === event.name);
    }
  }
  return events.map(transformEvent);
}

export async function createEvent(payload: IServiceCreateEventPayload) {
  if (!payload.profileId) {
    payload.profileId = payload.deviceId;
  }
  console.log(
    `create event ${payload.name} for [deviceId]: ${payload.deviceId} [profileId]: ${payload.profileId} [projectId]: ${payload.projectId} [path]: ${payload.path}`
  );

  if (payload.profileId !== '') {
    await upsertProfile({
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
    });
  }

  const event: IClickhouseEvent = {
    id: uuid(),
    name: payload.name,
    device_id: payload.deviceId,
    profile_id: payload.profileId ? String(payload.profileId) : '',
    project_id: payload.projectId,
    session_id: payload.sessionId,
    properties: toDots(omit(['_path'], payload.properties)),
    path: payload.path ?? '',
    origin: payload.origin ?? '',
    created_at: formatClickhouseDate(payload.createdAt),
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
  };

  await eventBuffer.insert(event);

  return {
    document: event,
  };
}

export interface GetEventListOptions {
  projectId: string;
  profileId?: string;
  take: number;
  cursor?: number;
  events?: string[] | null;
  filters?: IChartEventFilter[];
  startDate?: Date;
  endDate?: Date;
  meta?: boolean;
  profile?: boolean;
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
  meta = true,
  profile = true,
}: GetEventListOptions) {
  const { sb, getSql, join } = createSqlBuilder();

  sb.limit = take;
  sb.offset = Math.max(0, (cursor ?? 0) * take);
  sb.where.projectId = `project_id = ${escape(projectId)}`;

  if (profileId) {
    sb.where.deviceId = `device_id IN (SELECT device_id as did FROM ${TABLE_NAMES.events} WHERE profile_id = ${escape(profileId)} group by did)`;
  }

  if (startDate && endDate) {
    sb.where.created_at = `created_at BETWEEN '${formatClickhouseDate(startDate)}' AND '${formatClickhouseDate(endDate)}'`;
  }

  if (events && events.length > 0) {
    sb.where.events = `name IN (${join(
      events.map((event) => escape(event)),
      ','
    )})`;
  }

  if (filters) {
    sb.where = {
      ...sb.where,
      ...getEventFiltersWhereClause(filters),
    };
  }

  // if (cursor) {
  //   sb.where.cursor = `created_at <= '${formatClickhouseDate(cursor)}'`;
  // }

  sb.orderBy.created_at = 'created_at DESC';

  return getEvents(getSql(), { profile, meta });
}

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
    sb.where.created_at = `created_at BETWEEN '${formatClickhouseDate(startDate)}' AND '${formatClickhouseDate(endDate)}'`;
  }

  if (events && events.length > 0) {
    sb.where.events = `name IN (${join(
      events.map((event) => escape(event)),
      ','
    )})`;
  }

  if (filters) {
    sb.where = {
      ...sb.where,
      ...getEventFiltersWhereClause(filters),
    };
  }

  const res = await chQuery<{ count: number }>(
    getSql().replace('*', 'count(*) as count')
  );

  return res[0]?.count ?? 0;
}

interface CreateBotEventPayload {
  name: string;
  type: string;
  path: string;
  projectId: string;
  createdAt: Date;
}

export function createBotEvent({
  name,
  type,
  projectId,
  createdAt,
  path,
}: CreateBotEventPayload) {
  return ch.insert({
    table: 'events_bots',
    format: 'JSONEachRow',
    values: [
      {
        name,
        type,
        project_id: projectId,
        path,
        created_at: formatClickhouseDate(createdAt),
      },
    ],
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

export async function getLastScreenViewFromProfileId({
  profileId,
  projectId,
}: {
  profileId: string;
  projectId: string;
}) {
  const eventInBuffer = await eventBuffer.find(
    (item) => item.event.profile_id === profileId
  );

  if (eventInBuffer) {
    return eventInBuffer;
  }

  const [eventInDb] = profileId
    ? await getEvents(
        `SELECT * FROM ${TABLE_NAMES.events} WHERE name = 'screen_view' AND profile_id = ${escape(profileId)} AND project_id = ${escape(projectId)} AND created_at >= now() - INTERVAL 30 MINUTE ORDER BY created_at DESC LIMIT 1`
      )
    : [];

  return eventInDb || null;
}
