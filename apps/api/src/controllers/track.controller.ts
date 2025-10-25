import { getClientIp } from '@/utils/get-client-ip';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { assocPath, pathOr, pick } from 'ramda';

import { logger } from '@/utils/logger';
import { generateId } from '@openpanel/common';
import { generateDeviceId, parseUserAgent } from '@openpanel/common/server';
import { getProfileById, getSalts, upsertProfile } from '@openpanel/db';
import { type GeoLocation, getGeoLocation } from '@openpanel/geo';
import type { ILogger } from '@openpanel/logger';
import { eventsGroupQueue } from '@openpanel/queue';
import { getRedisCache } from '@openpanel/redis';
import type {
  DecrementPayload,
  IdentifyPayload,
  IncrementPayload,
  TrackHandlerPayload,
  TrackPayload,
} from '@openpanel/sdk';

export function getStringHeaders(headers: FastifyRequest['headers']) {
  return Object.entries(
    pick(
      [
        'user-agent',
        'openpanel-sdk-name',
        'openpanel-sdk-version',
        'openpanel-client-id',
        'request-id',
      ],
      headers,
    ),
  ).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [key]: value ? String(value) : undefined,
    }),
    {},
  );
}

function getIdentity(body: TrackHandlerPayload): IdentifyPayload | undefined {
  const identity =
    'properties' in body.payload
      ? (body.payload?.properties?.__identify as IdentifyPayload | undefined)
      : undefined;

  return (
    identity ||
    (body?.payload?.profileId
      ? {
          profileId: body.payload.profileId,
        }
      : undefined)
  );
}

export function getTimestamp(
  timestamp: FastifyRequest['timestamp'],
  payload: TrackHandlerPayload['payload'],
) {
  const safeTimestamp = timestamp || Date.now();
  const userDefinedTimestamp =
    'properties' in payload
      ? (payload?.properties?.__timestamp as string | undefined)
      : undefined;

  if (!userDefinedTimestamp) {
    return { timestamp: safeTimestamp, isTimestampFromThePast: false };
  }

  const clientTimestamp = new Date(userDefinedTimestamp);
  const clientTimestampNumber = clientTimestamp.getTime();

  if (
    Number.isNaN(clientTimestampNumber) ||
    clientTimestampNumber > safeTimestamp
  ) {
    return { timestamp: safeTimestamp, isTimestampFromThePast: false };
  }

  return {
    timestamp: clientTimestampNumber,
    isTimestampFromThePast: true,
  };
}

export async function handler(
  request: FastifyRequest<{
    Body: TrackHandlerPayload;
  }>,
  reply: FastifyReply,
) {
  const timestamp = getTimestamp(request.timestamp, request.body.payload);
  const ip =
    'properties' in request.body.payload &&
    request.body.payload.properties?.__ip
      ? (request.body.payload.properties.__ip as string)
      : getClientIp(request)!;
  const ua = request.headers['user-agent']!;
  const projectId = request.client?.projectId;

  if (!projectId) {
    return reply.status(400).send({
      status: 400,
      error: 'Bad Request',
      message: 'Missing projectId',
    });
  }

  const identity = getIdentity(request.body);
  const profileId = identity?.profileId;

  // We might get a profileId from the alias table
  // If we do, we should use that instead of the one from the payload
  if (profileId) {
    request.body.payload.profileId = profileId;
  }

  switch (request.body.type) {
    case 'track': {
      const [salts, geo] = await Promise.all([getSalts(), getGeoLocation(ip)]);
      const currentDeviceId = ua
        ? generateDeviceId({
            salt: salts.current,
            origin: projectId,
            ip,
            ua,
          })
        : '';
      const previousDeviceId = ua
        ? generateDeviceId({
            salt: salts.previous,
            origin: projectId,
            ip,
            ua,
          })
        : '';

      const promises = [];

      // If we have more than one property in the identity object, we should identify the user
      // Otherwise its only a profileId and we should not identify the user
      if (identity && Object.keys(identity).length > 1) {
        promises.push(
          identify({
            payload: identity,
            projectId,
            geo,
            ua,
          }),
        );
      }

      promises.push(
        track({
          log: request.log.info,
          payload: request.body.payload,
          currentDeviceId,
          previousDeviceId,
          projectId,
          geo,
          headers: getStringHeaders(request.headers),
          timestamp: timestamp.timestamp,
          isTimestampFromThePast: timestamp.isTimestampFromThePast,
        }),
      );

      await Promise.all(promises);
      break;
    }
    case 'identify': {
      const geo = await getGeoLocation(ip);
      await identify({
        payload: request.body.payload,
        projectId,
        geo,
        ua,
      });
      break;
    }
    case 'alias': {
      return reply.status(400).send({
        status: 400,
        error: 'Bad Request',
        message: 'Alias is not supported',
      });
    }
    case 'increment': {
      await increment({
        payload: request.body.payload,
        projectId,
      });
      break;
    }
    case 'decrement': {
      await decrement({
        payload: request.body.payload,
        projectId,
      });
      break;
    }
    default: {
      return reply.status(400).send({
        status: 400,
        error: 'Bad Request',
        message: 'Invalid type',
      });
    }
  }

  reply.status(200).send();
}

async function track({
  payload,
  currentDeviceId,
  previousDeviceId,
  projectId,
  geo,
  headers,
  timestamp,
  isTimestampFromThePast,
  log,
}: {
  payload: TrackPayload;
  currentDeviceId: string;
  previousDeviceId: string;
  projectId: string;
  geo: GeoLocation;
  headers: Record<string, string | undefined>;
  timestamp: number;
  isTimestampFromThePast: boolean;
  log: any;
}) {
  const uaInfo = parseUserAgent(headers['user-agent'], payload.properties);
  const groupId = uaInfo.isServer
    ? payload.profileId
      ? `${projectId}:${payload.profileId}`
      : `${projectId}:${generateId()}`
    : currentDeviceId;
  const jobId = [payload.name, timestamp, projectId, currentDeviceId, groupId]
    .filter(Boolean)
    .join('-');
  await getRedisCache().incr('track:counter');
  log('track handler', {
    jobId: jobId,
    groupId: groupId,
    timestamp: timestamp,
    data: {
      projectId,
      headers,
      event: {
        ...payload,
        timestamp,
        isTimestampFromThePast,
      },
      uaInfo,
      geo,
      currentDeviceId,
      previousDeviceId,
    },
  });
  await eventsGroupQueue.add({
    orderMs: timestamp,
    data: {
      projectId,
      headers,
      event: {
        ...payload,
        timestamp,
        isTimestampFromThePast,
      },
      uaInfo,
      geo,
      currentDeviceId,
      previousDeviceId,
    },
    groupId,
    jobId,
  });
}

async function identify({
  payload,
  projectId,
  geo,
  ua,
}: {
  payload: IdentifyPayload;
  projectId: string;
  geo: GeoLocation;
  ua?: string;
}) {
  const uaInfo = parseUserAgent(ua, payload.properties);
  await upsertProfile({
    ...payload,
    id: payload.profileId,
    isExternal: true,
    projectId,
    properties: {
      ...(payload.properties ?? {}),
      country: geo.country,
      city: geo.city,
      region: geo.region,
      longitude: geo.longitude,
      latitude: geo.latitude,
      os: uaInfo.os,
      os_version: uaInfo.osVersion,
      browser: uaInfo.browser,
      browser_version: uaInfo.browserVersion,
      device: uaInfo.device,
      brand: uaInfo.brand,
      model: uaInfo.model,
    },
  });
}

async function increment({
  payload,
  projectId,
}: {
  payload: IncrementPayload;
  projectId: string;
}) {
  const { profileId, property, value } = payload;
  const profile = await getProfileById(profileId, projectId);
  if (!profile) {
    throw new Error('Not found');
  }

  const parsed = Number.parseInt(
    pathOr<string>('0', property.split('.'), profile.properties),
    10,
  );

  if (Number.isNaN(parsed)) {
    throw new Error('Not number');
  }

  profile.properties = assocPath(
    property.split('.'),
    parsed + (value || 1),
    profile.properties,
  );

  await upsertProfile({
    id: profile.id,
    projectId,
    properties: profile.properties,
    isExternal: true,
  });
}

async function decrement({
  payload,
  projectId,
}: {
  payload: DecrementPayload;
  projectId: string;
}) {
  const { profileId, property, value } = payload;
  const profile = await getProfileById(profileId, projectId);
  if (!profile) {
    throw new Error('Not found');
  }

  const parsed = Number.parseInt(
    pathOr<string>('0', property.split('.'), profile.properties),
    10,
  );

  if (Number.isNaN(parsed)) {
    throw new Error('Not number');
  }

  profile.properties = assocPath(
    property.split('.'),
    parsed - (value || 1),
    profile.properties,
  );

  await upsertProfile({
    id: profile.id,
    projectId,
    properties: profile.properties,
    isExternal: true,
  });
}
