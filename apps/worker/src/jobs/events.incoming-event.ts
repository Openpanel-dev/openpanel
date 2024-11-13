import { getReferrerWithQuery, parseReferrer } from '@/utils/parse-referrer';
import type { Job } from 'bullmq';
import { omit } from 'ramda';

import { createSessionEnd, getSessionEnd } from '@/utils/session-handler';
import { isSameDomain, parsePath } from '@openpanel/common';
import { parseUserAgent } from '@openpanel/common/server';
import type { IServiceCreateEventPayload, IServiceEvent } from '@openpanel/db';
import { checkNotificationRulesForEvent, createEvent } from '@openpanel/db';
import { getLastScreenViewFromProfileId } from '@openpanel/db';
import type { EventsQueuePayloadIncomingEvent } from '@openpanel/queue';
import * as R from 'ramda';

const GLOBAL_PROPERTIES = ['__path', '__referrer'];

// This function will merge two objects.
// First it will strip '' and undefined/null from B
// Then it will merge the two objects with a standard ramda merge function
const merge = <A, B>(a: Partial<A>, b: Partial<B>): A & B =>
  R.mergeDeepRight(a, R.reject(R.anyPass([R.isEmpty, R.isNil]))(b)) as A & B;

async function createEventAndNotify(payload: IServiceCreateEventPayload) {
  await checkNotificationRulesForEvent(payload);
  return createEvent(payload);
}

export async function incomingEvent(job: Job<EventsQueuePayloadIncomingEvent>) {
  const {
    geo,
    event: body,
    headers,
    projectId,
    currentDeviceId,
    previousDeviceId,
    priority,
  } = job.data.payload;
  const properties = body.properties ?? {};
  const getProperty = (name: string): string | undefined => {
    // replace thing is just for older sdks when we didn't have `__`
    // remove when kiddokitchen app (24.09.02) is not used anymore
    return (
      ((properties[name] || properties[name.replace('__', '')]) as
        | string
        | null
        | undefined) ?? undefined
    );
  };

  // this will get the profileId from the alias table if it exists
  const profileId = body.profileId ? String(body.profileId) : '';
  const createdAt = new Date(body.timestamp);
  const isTimestampFromThePast = body.isTimestampFromThePast;
  const url = getProperty('__path');
  const { path, hash, query, origin } = parsePath(url);
  const referrer = isSameDomain(getProperty('__referrer'), url)
    ? null
    : parseReferrer(getProperty('__referrer'));
  const utmReferrer = getReferrerWithQuery(query);
  const userAgent = headers['user-agent'];
  const sdkName = headers['openpanel-sdk-name'];
  const sdkVersion = headers['openpanel-sdk-version'];
  const uaInfo = parseUserAgent(userAgent);

  const baseEvent = {
    name: body.name,
    profileId,
    projectId,
    properties: omit(GLOBAL_PROPERTIES, {
      ...properties,
      user_agent: userAgent,
      __hash: hash,
      __query: query,
    }),
    createdAt,
    duration: 0,
    sdkName,
    sdkVersion,
    city: geo.city,
    country: geo.country,
    region: geo.region,
    longitude: geo.longitude,
    latitude: geo.latitude,
    path,
    origin,
    referrer: utmReferrer?.url || referrer?.url || '',
    referrerName: utmReferrer?.name || referrer?.name || '',
    referrerType: utmReferrer?.type || referrer?.type || '',
    os: uaInfo.os,
    osVersion: uaInfo.osVersion,
    browser: uaInfo.browser,
    browserVersion: uaInfo.browserVersion,
    device: uaInfo.device,
    brand: uaInfo.brand,
    model: uaInfo.model,
  } as const;

  // if timestamp is from the past we dont want to create a new session
  if (uaInfo.isServer || isTimestampFromThePast) {
    const event = profileId
      ? await getLastScreenViewFromProfileId({
          profileId,
          projectId,
        })
      : null;

    const payload = merge(omit(['properties'], event ?? {}), baseEvent);
    return createEventAndNotify(payload as IServiceEvent);
  }

  const sessionEnd = await getSessionEnd({
    priority,
    projectId,
    currentDeviceId,
    previousDeviceId,
    profileId,
  });

  const payload: IServiceCreateEventPayload = merge(baseEvent, {
    deviceId: sessionEnd.payload.deviceId,
    sessionId: sessionEnd.payload.sessionId,
    referrer: sessionEnd.payload?.referrer,
    referrerName: sessionEnd.payload?.referrerName,
    referrerType: sessionEnd.payload?.referrerType,
  });

  if (sessionEnd.notFound) {
    await createSessionEnd({ payload });
  }

  return createEventAndNotify(payload);
}
