import type { GeoLocation } from '@/utils/parseIp';
import { getClientIp, parseIp } from '@/utils/parseIp';
import { parseUserAgent } from '@/utils/parseUserAgent';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { assocPath, pathOr } from 'ramda';

import { generateDeviceId } from '@openpanel/common';
import {
  ch,
  chQuery,
  getProfileById,
  getProfileId,
  getSalts,
  TABLE_NAMES,
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

export async function handler(
  request: FastifyRequest<{
    Body: TrackHandlerPayload;
  }>,
  reply: FastifyReply
) {
  const ip = getClientIp(request)!;
  const ua = request.headers['user-agent']!;
  const projectId = request.client?.projectId;
  const profileId =
    projectId && request.body.payload.profileId
      ? await getProfileId({
          projectId,
          profileId: request.body.payload.profileId,
        })
      : undefined;

  if (profileId) {
    request.body.payload.profileId = profileId;
  }

  console.log(
    '> Request',
    request.body.type,
    JSON.stringify(request.body.payload, null, 2)
  );

  if (!projectId) {
    reply.status(400).send('missing origin');
    return;
  }

  switch (request.body.type) {
    case 'track': {
      const [salts, geo] = await Promise.all([getSalts(), parseIp(ip)]);
      const currentDeviceId = generateDeviceId({
        salt: salts.current,
        origin: projectId,
        ip,
        ua,
      });
      const previousDeviceId = generateDeviceId({
        salt: salts.previous,
        origin: projectId,
        ip,
        ua,
      });
      await track({
        payload: request.body.payload,
        currentDeviceId,
        previousDeviceId,
        projectId,
        geo,
        ua,
      });
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
  ua,
}: {
  payload: TrackPayload;
  currentDeviceId: string;
  previousDeviceId: string;
  projectId: string;
  geo: GeoLocation;
  ua: string;
}) {
  // this will ensure that we don't have multiple events creating sessions
  const locked = await getRedisCache().set(
    `request:priority:${currentDeviceId}-${previousDeviceId}`,
    'locked',
    'EX',
    10,
    'NX'
  );

  eventsQueue.add('event', {
    type: 'incomingEvent',
    payload: {
      projectId,
      headers: {
        ua,
      },
      event: {
        ...payload,
        // Dont rely on the client for the timestamp
        timestamp: new Date().toISOString(),
      },
      geo,
      currentDeviceId,
      previousDeviceId,
      priority: locked === 'OK',
    },
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
  ua: string;
}) {
  const uaInfo = parseUserAgent(ua);
  await upsertProfile({
    id: payload.profileId,
    isExternal: true,
    projectId,
    properties: {
      ...(payload.properties ?? {}),
      ...(geo ?? {}),
      ...uaInfo,
    },
    ...payload,
  });
}

async function alias({
  payload,
  projectId,
}: {
  payload: AliasPayload;
  projectId: string;
}) {
  await ch.insert({
    table: TABLE_NAMES.alias,
    values: [
      {
        projectId,
        profile_id: payload.profileId,
        alias: payload.alias,
      },
    ],
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

  const parsed = parseInt(
    pathOr<string>('0', property.split('.'), profile.properties),
    10
  );

  if (isNaN(parsed)) {
    throw new Error('Not number');
  }

  profile.properties = assocPath(
    property.split('.'),
    parsed + (value || 1),
    profile.properties
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

  const parsed = parseInt(
    pathOr<string>('0', property.split('.'), profile.properties),
    10
  );

  if (isNaN(parsed)) {
    throw new Error('Not number');
  }

  profile.properties = assocPath(
    property.split('.'),
    parsed - (value || 1),
    profile.properties
  );

  await upsertProfile({
    id: profile.id,
    projectId,
    properties: profile.properties,
    isExternal: true,
  });
}
