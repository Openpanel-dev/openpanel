import type { FastifyReply, FastifyRequest } from 'fastify';
import { assocPath, pathOr, pick } from 'ramda';

import { HttpError } from '@/utils/errors';
import { generateId, slug } from '@openpanel/common';
import { generateDeviceId, parseUserAgent } from '@openpanel/common/server';
import {
  getProfileById,
  getSalts,
  replayBuffer,
  sessionBuffer,
  upsertAlias,
  upsertProfile,
} from '@openpanel/db';
import { type GeoLocation, getGeoLocation } from '@openpanel/geo';
import { getEventsGroupQueueShard, getQueueName } from '@openpanel/queue';
import { getRedisCache } from '@openpanel/redis';
import type {
  DecrementPayload,
  IdentifyPayload,
  IncrementPayload,
  ReplayPayload,
  TrackHandlerPayload,
  TrackPayload,
} from '@openpanel/sdk';

const replayProjectIdsEnv = (process.env.REPLAY_ENABLED_PROJECT_IDS || '').trim();
const replayAllowAllProjects = replayProjectIdsEnv === '*';
const replayProjectIdAllowList = new Set<string>(
  replayProjectIdsEnv && !replayAllowAllProjects
    ? replayProjectIdsEnv
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : [],
);

function isReplayEnabledForProject(projectId: string): boolean {
  if (replayAllowAllProjects) return true;
  return replayProjectIdAllowList.has(projectId);
}

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
  if (body.type === 'replay') {
    return undefined;
  }
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

  // Constants for time validation
  const ONE_MINUTE_MS = 60 * 1000;
  const FIFTEEN_MINUTES_MS = 15 * ONE_MINUTE_MS;

  // Use safeTimestamp if invalid or more than 1 minute in the future
  if (
    Number.isNaN(clientTimestampNumber) ||
    clientTimestampNumber > safeTimestamp + ONE_MINUTE_MS
  ) {
    return { timestamp: safeTimestamp, isTimestampFromThePast: false };
  }

  // isTimestampFromThePast is true only if timestamp is older than 1 hour
  const isTimestampFromThePast =
    clientTimestampNumber < safeTimestamp - FIFTEEN_MINUTES_MS;

  return {
    timestamp: clientTimestampNumber,
    isTimestampFromThePast,
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
      : request.clientIp;
  const ua = request.headers['user-agent'];
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
  const overrideDeviceId = (() => {
    if (!('properties' in request.body.payload)) {
      return undefined;
    }
    const properties = request.body.payload.properties;
    // The Mixpanel proxy forwards the original device id as `$device_id`.
    // Honor it (alongside the SDK's `__deviceId`) so proxied events use the
    // real device id instead of falling back to the salted IP+UA fingerprint.
    const deviceId = properties?.__deviceId ?? properties?.$device_id;
    if (typeof deviceId === 'string') {
      return deviceId;
    }
    return undefined;
  })();

  // We might get a profileId from the alias table
  // If we do, we should use that instead of the one from the payload
  if (profileId && request.body.type !== 'replay') {
    request.body.payload.profileId = profileId;
  }

  switch (request.body.type) {
    case 'track': {
      const [salts, geo] = await Promise.all([getSalts(), getGeoLocation(ip)]);
      const currentDeviceId =
        overrideDeviceId ||
        (ua
          ? generateDeviceId({
              salt: salts.current,
              origin: projectId,
              ip,
              ua,
            })
          : '');
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
      const payload = request.body.payload;
      const geo = await getGeoLocation(ip);
      if (!payload.profileId) {
        throw new HttpError('Missing profileId', {
          status: 400,
        });
      }

      await identify({
        payload,
        projectId,
        geo,
        ua,
      });
      break;
    }
    case 'alias': {
      const payload = request.body.payload;
      if (!payload.profileId || !payload.alias) {
        throw new HttpError('Missing profileId or alias', {
          status: 400,
        });
      }

      // Persist the (anonymous id -> identified id) mapping. Nothing reads
      // profile_aliases yet — query-time resolution lands in a follow-up PR.
      await upsertAlias({
        projectId,
        profileId: payload.profileId,
        alias: payload.alias,
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
    case 'replay': {
      await handleReplay({
        payload: request.body.payload,
        projectId,
        ip,
        ua,
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
}: {
  payload: TrackPayload;
  currentDeviceId: string;
  previousDeviceId: string;
  projectId: string;
  geo: GeoLocation;
  headers: Record<string, string | undefined>;
  timestamp: number;
  isTimestampFromThePast: boolean;
}) {
  const uaInfo = parseUserAgent(headers['user-agent'], payload.properties);
  const groupId = uaInfo.isServer
    ? payload.profileId
      ? `${projectId}:${payload.profileId}`
      : `${projectId}:${generateId()}`
    : currentDeviceId;
  const jobId = [
    slug(payload.name),
    timestamp,
    projectId,
    currentDeviceId,
    groupId,
  ]
    .filter(Boolean)
    .join('-');
  await getEventsGroupQueueShard(groupId).add({
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

async function handleReplay({
  payload,
  projectId,
  ip,
  ua,
}: {
  payload: ReplayPayload;
  projectId: string;
  ip: string | undefined;
  ua: string | undefined;
}) {
  if (!isReplayEnabledForProject(projectId)) {
    return;
  }

  // Trust the SDK-supplied session_id when present. Modern SDKs (1.3.0+)
  // get this id by calling /track/device-id?deviceId=<their localStorage
  // UUID or stable user id> — the server-side lookup there already keys
  // off the same deviceId the track flow uses to create sessions, so the
  // session_id the SDK echoes back IS a real row in the `sessions` table.
  // Trusting it makes session_replay_chunks.session_id match sessions.id
  // correctly even for users behind a shared NAT.
  //
  // Only fall back to IP+UA derivation when the SDK didn't send one (old
  // SDKs that pre-date the deviceId override path).
  let sessionId = payload.session_id;
  if (!sessionId && ip && ua) {
    try {
      const salts = await getSalts();
      const redis = getRedisCache();
      const queueName = getQueueName('sessions');
      for (const salt of [salts.current, salts.previous]) {
        const deviceId = generateDeviceId({ salt, origin: projectId, ip, ua });
        const exists = await redis.exists(
          `bull:${queueName}:sessionEnd:${projectId}:${deviceId}`,
        );
        if (exists) {
          const session = await sessionBuffer.getExistingSession({
            projectId,
            profileId: deviceId,
          });
          if (session?.id) {
            sessionId = session.id;
            break;
          }
        }
      }
    } catch {
      // non-fatal — will 400 below if we still don't have a session_id.
    }
  }

  if (!sessionId) {
    throw new HttpError('session_id is required for replay chunks', {
      status: 400,
    });
  }

  await replayBuffer.add({
    project_id: projectId,
    session_id: sessionId,
    chunk_index: payload.chunk_index,
    started_at: payload.started_at,
    ended_at: payload.ended_at,
    events_count: payload.events_count,
    is_full_snapshot: payload.is_full_snapshot,
    payload: payload.payload,
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
  let profile;
  try {
    profile = await getProfileById(profileId, projectId);
  } catch (error) {
    throw new HttpError('Failed to fetch profile for increment', {
      status: 500,
    });
  }
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
  let profile;
  try {
    profile = await getProfileById(profileId, projectId);
  } catch (error) {
    throw new HttpError('Failed to fetch profile for decrement', {
      status: 500,
    });
  }
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

export async function fetchDeviceId(
  request: FastifyRequest<{ Querystring: { deviceId?: string } }>,
  reply: FastifyReply,
) {
  const salts = await getSalts();
  const projectId = request.client?.projectId;
  if (!projectId) {
    return reply.status(400).send('No projectId');
  }

  // Optional client-supplied deviceId. The web SDK persists a UUID in
  // localStorage (or consumers can set a stable identifier like a Firebase
  // UID via setGlobalProperties) and passes it through here so we can
  // honor it instead of deriving from IP+UA. Without this, every user
  // behind the same NAT (office WiFi, mobile carrier) collapses to the
  // same deviceId/sessionId.
  const overrideDeviceId = request.query?.deviceId?.trim();

  const ip = request.clientIp;
  const ua = request.headers['user-agent'];

  // When the SDK doesn't supply a deviceId, we still need IP + UA to
  // derive one server-side. With an override, ip/ua are optional.
  if (!overrideDeviceId) {
    if (!ip) {
      return reply.status(400).send('Missing ip address');
    }
    if (!ua) {
      return reply.status(400).send('Missing header: user-agent');
    }
  }

  // Prefer the SDK-supplied id when present (NAT-collision-safe).
  // Otherwise fall back to the legacy IP+UA hash for backward compat
  // with older SDKs that don't persist a localStorage deviceId.
  const currentDeviceId =
    overrideDeviceId ??
    generateDeviceId({
      salt: salts.current,
      origin: projectId,
      ip: ip!,
      ua: ua!,
    });
  const previousDeviceId =
    overrideDeviceId ??
    generateDeviceId({
      salt: salts.previous,
      origin: projectId,
      ip: ip!,
      ua: ua!,
    });

  try {
    const redis = getRedisCache();
    const queueName = getQueueName('sessions');
    const [currentExists, previousExists] = await Promise.all([
      redis.exists(`bull:${queueName}:sessionEnd:${projectId}:${currentDeviceId}`),
      redis.exists(`bull:${queueName}:sessionEnd:${projectId}:${previousDeviceId}`),
    ]);

    if (currentExists) {
      const session = await sessionBuffer.getExistingSession({
        projectId,
        profileId: currentDeviceId,
      });
      return reply.status(200).send({
        deviceId: currentDeviceId,
        sessionId: session?.id,
        message: 'current session exists for this device id',
      });
    }

    if (previousExists) {
      const session = await sessionBuffer.getExistingSession({
        projectId,
        profileId: previousDeviceId,
      });
      return reply.status(200).send({
        deviceId: previousDeviceId,
        sessionId: session?.id,
        message: 'previous session exists for this device id',
      });
    }
  } catch (error) {
    request.log.error('Error getting session end GET /track/device-id', error);
  }

  return reply.status(200).send({
    deviceId: currentDeviceId,
    message: 'No session exists for this device id',
  });
}
