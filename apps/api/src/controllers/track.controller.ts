import type { GeoLocation } from '@/utils/parse-ip';
import { getClientIp, parseIp } from '@/utils/parse-ip';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { path, assocPath, pathOr, pick } from 'ramda';

import { generateDeviceId, parseUserAgent } from '@openpanel/common/server';
import {
  createProfileAlias,
  getProfileById,
  getProfileIdCached,
  getSalts,
  upsertProfile,
} from '@openpanel/db';
import { eventsQueue } from '@openpanel/queue';
import { getRedisCache } from '@openpanel/redis';
import type {
  AliasPayload,
  DecrementPayload,
  IdentifyPayload,
  IncrementPayload,
  TrackHandlerPayload,
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
  const identity = path<IdentifyPayload>(
    ['properties', '__identify'],
    body.payload,
  );

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
  const safeTimestamp = new Date(timestamp || Date.now()).toISOString();
  const userDefinedTimestamp = path<string>(
    ['properties', '__timestamp'],
    payload,
  );

  if (!userDefinedTimestamp) {
    return { timestamp: safeTimestamp, isTimestampFromThePast: false };
  }

  const clientTimestamp = new Date(userDefinedTimestamp);

  if (
    Number.isNaN(clientTimestamp.getTime()) ||
    clientTimestamp > new Date(safeTimestamp)
  ) {
    return { timestamp: safeTimestamp, isTimestampFromThePast: false };
  }

  return {
    timestamp: clientTimestamp.toISOString(),
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
    path<string>(['properties', '__ip'], request.body.payload) ||
    getClientIp(request)!;
  const ua = request.headers['user-agent']!;
  const projectId = request.client?.projectId;

  if (!projectId) {
    reply.status(400).send({
      status: 400,
      error: 'Bad Request',
      message: 'Missing projectId',
    });
    return;
  }

  const identity = getIdentity(request.body);
  const profileId = identity?.profileId
    ? await getProfileIdCached({
        projectId,
        profileId: identity?.profileId,
      })
    : undefined;

  // We might get a profileId from the alias table
  // If we do, we should use that instead of the one from the payload
  if (profileId) {
    request.body.payload.profileId = profileId;
  }

  switch (request.body.type) {
    case 'track': {
      const [salts, geo] = await Promise.all([getSalts(), parseIp(ip)]);
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

      const promises = [
        track({
          payload: request.body.payload,
          currentDeviceId,
          previousDeviceId,
          projectId,
          geo,
          headers: getStringHeaders(request.headers),
          timestamp: timestamp.timestamp,
          isTimestampFromThePast: timestamp.isTimestampFromThePast,
        }),
      ];

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

      await Promise.all(promises);
      break;
    }
    case 'identify': {
      const geo = await parseIp(ip);
      await identify({
        payload: request.body.payload,
        projectId,
        geo,
        ua,
      });
      break;
    }
    case 'alias': {
      await alias({
        payload: request.body.payload,
        projectId,
      });
      break;
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
      reply.status(400).send({
        status: 400,
        error: 'Bad Request',
        message: 'Invalid type',
      });
      break;
    }
  }
}

type TrackPayload = {
  name: string;
  properties?: Record<string, any>;
};

async function track({
  payload,
  currentDeviceId,
  previousDeviceId,
  projectId,
  geo,
  headers,
  timestamp,
  isTimestampFromThePast,
}: {
  payload: TrackPayload;
  currentDeviceId: string;
  previousDeviceId: string;
  projectId: string;
  geo: GeoLocation;
  headers: Record<string, string | undefined>;
  timestamp: string;
  isTimestampFromThePast: boolean;
}) {
  const isScreenView = payload.name === 'screen_view';
  // this will ensure that we don't have multiple events creating sessions
  const locked = await getRedisCache().set(
    `request:priority:${currentDeviceId}-${previousDeviceId}:${isScreenView ? 'screen_view' : 'other'}`,
    'locked',
    'PX',
    950, // a bit under the delay below
    'NX',
  );

  eventsQueue.add(
    'event',
    {
      type: 'incomingEvent',
      payload: {
        projectId,
        headers,
        event: {
          ...payload,
          timestamp,
          isTimestampFromThePast,
        },
        geo,
        currentDeviceId,
        previousDeviceId,
        priority: locked === 'OK',
      },
    },
    {
      // Prioritize 'screen_view' events by setting no delay
      // This ensures that session starts are created from 'screen_view' events
      // rather than other events, maintaining accurate session tracking
      delay: isScreenView ? undefined : 1000,
    },
  );
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
      ...(geo ?? {}),
      ...uaInfo,
    },
  });
}

async function alias({
  payload,
  projectId,
}: {
  payload: AliasPayload;
  projectId: string;
}) {
  await createProfileAlias({
    alias: payload.alias,
    profileId: payload.profileId,
    projectId,
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
