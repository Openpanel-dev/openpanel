import type { IDBProfile } from '@/prisma-types';
import { omit } from 'ramda';

import { randomSplitName, toDots } from '@mixan/common';
import { redis, redisPub } from '@mixan/redis';

import {
  ch,
  chQuery,
  convertClickhouseDateToJs,
  formatClickhouseDate,
} from '../clickhouse-client';
import type { Prisma } from '../prisma-client';
import { db } from '../prisma-client';

export interface IClickhouseEvent {
  name: string;
  profile_id: string;
  project_id: string;
  path: string;
  referrer: string;
  referrer_name: string;
  referrer_type: string;
  duration: number;
  properties: Record<string, string | number | boolean>;
  created_at: string;
  country: string;
  city: string;
  region: string;
  os: string;
  os_version: string;
  browser: string;
  browser_version: string;
  device: string;
  brand: string;
  model: string;
  profile?: IDBProfile;
}

export function transformEvent(
  event: IClickhouseEvent
): IServiceCreateEventPayload {
  return {
    name: event.name,
    profileId: event.profile_id,
    projectId: event.project_id,
    properties: event.properties,
    createdAt: convertClickhouseDateToJs(event.created_at),
    country: event.country,
    city: event.city,
    region: event.region,
    os: event.os,
    osVersion: event.os_version,
    browser: event.browser,
    browserVersion: event.browser_version,
    device: event.device,
    brand: event.brand,
    model: event.model,
    duration: event.duration,
    path: event.path,
    referrer: event.referrer,
    referrerName: event.referrer_name,
    referrerType: event.referrer_type,
    profile: event.profile,
  };
}

export interface IServiceCreateEventPayload {
  name: string;
  profileId: string;
  projectId: string;
  properties: Record<string, unknown> & {
    hash?: string;
    query?: Record<string, unknown>;
  };
  createdAt: Date;
  country?: string | undefined;
  city?: string | undefined;
  region?: string | undefined;
  continent?: string | undefined;
  os?: string | undefined;
  osVersion?: string | undefined;
  browser?: string | undefined;
  browserVersion?: string | undefined;
  device?: string | undefined;
  brand?: string | undefined;
  model?: string | undefined;
  duration: number;
  path: string;
  referrer: string | undefined;
  referrerName: string | undefined;
  referrerType: string | undefined;
  profile?: IDBProfile;
}

interface GetEventsOptions {
  profile?: boolean | Prisma.ProfileSelect;
}

export async function getLiveVisitors(projectId: string) {
  const keys = await redis.keys(`live:event:${projectId}:*`);
  return keys.length;
}

export async function getEvents(sql: string, options: GetEventsOptions = {}) {
  const events = await chQuery<IClickhouseEvent>(sql);
  if (options.profile) {
    const profileIds = events.map((e) => e.profile_id);
    const profiles = await db.profile.findMany({
      where: {
        id: {
          in: profileIds,
        },
      },
      select: options.profile === true ? undefined : options.profile,
    });

    for (const event of events) {
      event.profile = profiles.find((p) => p.id === event.profile_id) as
        | IDBProfile
        | undefined;
    }
  }
  return events.map(transformEvent);
}

export async function createEvent(payload: IServiceCreateEventPayload) {
  console.log(`create event ${payload.name} for ${payload.profileId}`);

  if (payload.name === 'session_start') {
    const profile = await db.profile.findUnique({
      where: {
        id: payload.profileId,
      },
    });

    if (!profile) {
      const { firstName, lastName } = randomSplitName();
      await db.profile.create({
        data: {
          id: payload.profileId,
          project_id: payload.projectId,
          first_name: firstName,
          last_name: lastName,
          properties: {
            country: payload.country ?? '',
            city: payload.city ?? '',
            region: payload.region ?? '',
            os: payload.os ?? '',
            os_version: payload.osVersion ?? '',
            browser: payload.browser ?? '',
            browser_version: payload.browserVersion ?? '',
            device: payload.device ?? '',
            brand: payload.brand ?? '',
            model: payload.model ?? '',
            referrer: payload.referrer ?? '',
            referrer_name: payload.referrerName ?? '',
            referrer_type: payload.referrerType ?? '',
          },
        },
      });
    }
  }

  if (payload.properties.hash === '') {
    delete payload.properties.hash;
  }

  const event: IClickhouseEvent = {
    name: payload.name,
    profile_id: payload.profileId,
    project_id: payload.projectId,
    properties: toDots(omit(['_path'], payload.properties)),
    path: payload.path ?? '',
    created_at: formatClickhouseDate(payload.createdAt),
    country: payload.country ?? '',
    city: payload.city ?? '',
    region: payload.region ?? '',
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
  };

  const res = await ch.insert({
    table: 'events',
    values: [event],
    format: 'JSONEachRow',
  });

  redisPub.publish('event', JSON.stringify(transformEvent(event)));
  redis.set(
    `live:event:${event.project_id}:${event.profile_id}`,
    '',
    'EX',
    60 * 5
  );

  return {
    ...res,
    document: event,
  };
}
