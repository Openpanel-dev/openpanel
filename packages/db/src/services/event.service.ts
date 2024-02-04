import { omit } from 'ramda';

import { toDots } from '@mixan/common';

import { ch, chQuery, formatClickhouseDate } from '../clickhouse-client';

export interface IClickhouseEvent {
  name: string;
  profile_id: string;
  project_id: string;
  path: string;
  referrer: string;
  referrer_name: string;
  duration: number;
  properties: Record<string, string>;
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
}

export function transformEvent(
  event: IClickhouseEvent
): IServiceCreateEventPayload {
  return {
    name: event.name,
    profileId: event.profile_id,
    projectId: event.project_id,
    properties: event.properties,
    createdAt: event.created_at,
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
  };
}

export interface IServiceCreateEventPayload {
  name: string;
  profileId: string;
  projectId: string;
  properties: Record<string, unknown>;
  createdAt: string;
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
}

export function getEvents(sql: string) {
  return chQuery<IClickhouseEvent>(sql).then((events) =>
    events.map(transformEvent)
  );
}

export async function createEvent(payload: IServiceCreateEventPayload) {
  console.log(`create event ${payload.name} for ${payload.profileId}`);

  return ch.insert({
    table: 'events',
    values: [
      {
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
      },
    ],
    format: 'JSONEachRow',
  });
}
