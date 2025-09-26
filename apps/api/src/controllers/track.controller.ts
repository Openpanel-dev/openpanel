import { getClientIp } from '@/utils/get-client-ip';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { path, assocPath, pathOr, pick } from 'ramda';

import { checkDuplicatedEvent } from '@/utils/deduplicate';
import { generateDeviceId, parseUserAgent } from '@openpanel/common/server';
import { getProfileById, getSalts, upsertProfile } from '@openpanel/db';
import { type GeoLocation, getGeoLocation } from '@openpanel/geo';
import { eventsQueue } from '@openpanel/queue';
import { getLock } from '@openpanel/redis';
import type {
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

      if (
        await checkDuplicatedEvent({
          reply,
          payload: {
            ...request.body,
            timestamp,
            previousDeviceId,
            currentDeviceId,
          },
          projectId,
        })
      ) {
        return;
      }

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
      if (
        await checkDuplicatedEvent({
          reply,
          payload: {
            ...request.body,
            timestamp,
          },
          projectId,
        })
      ) {
        return;
      }

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
      reply.status(400).send({
        status: 400,
        error: 'Bad Request',
        message: 'Alias is not supported',
      });
      break;
    }
    case 'increment': {
      if (
        await checkDuplicatedEvent({
          reply,
          payload: {
            ...request.body,
            timestamp,
          },
          projectId,
        })
      ) {
        return;
      }

      await increment({
        payload: request.body.payload,
        projectId,
      });
      break;
    }
    case 'decrement': {
      if (
        await checkDuplicatedEvent({
          reply,
          payload: {
            ...request.body,
            timestamp,
          },
          projectId,
        })
      ) {
        return;
      }

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

  reply.status(200).send();
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
  await eventsQueue.add(
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
      },
    },
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 200,
      },
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
