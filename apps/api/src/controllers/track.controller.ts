import type { FastifyReply, FastifyRequest } from 'fastify';
import { assocPath, pathOr, pick } from 'ramda';

import { HttpError } from '@/utils/errors';
import { generateId, slug } from '@openpanel/common';
import {
  generateDeviceId,
  generateSecureId,
  parseUserAgent,
} from '@openpanel/common/server';
import {
  TABLE_NAMES,
  ch,
  getProfileById,
  getSalts,
  sessionBuffer,
  upsertProfile,
} from '@openpanel/db';
import { type GeoLocation, getGeoLocation } from '@openpanel/geo';
import { getEventsGroupQueueShard } from '@openpanel/queue';
import { getRedisCache } from '@openpanel/redis';

import {
  type IDecrementPayload,
  type IIdentifyPayload,
  type IIncrementPayload,
  type IReplayPayload,
  type ITrackHandlerPayload,
  type ITrackPayload,
  zTrackHandlerPayload,
} from '@openpanel/validation';

async function getDeviceId({
  projectId,
  ip,
  ua,
  salts,
  overrideDeviceId,
}: {
  projectId: string;
  ip: string;
  ua: string | undefined;
  salts: { current: string; previous: string };
  overrideDeviceId?: string;
}) {
  if (overrideDeviceId) {
    return { deviceId: overrideDeviceId, sessionId: undefined };
  }

  if (!ua) {
    return { deviceId: '', sessionId: undefined };
  }

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

  return await getDeviceIdFromSession({
    projectId,
    currentDeviceId,
    previousDeviceId,
  });
}

async function getDeviceIdFromSession({
  projectId,
  currentDeviceId,
  previousDeviceId,
}: {
  projectId: string;
  currentDeviceId: string;
  previousDeviceId: string;
}) {
  try {
    const multi = getRedisCache().multi();
    multi.hget(
      `bull:sessions:sessionEnd:${projectId}:${currentDeviceId}`,
      'data',
    );
    multi.hget(
      `bull:sessions:sessionEnd:${projectId}:${previousDeviceId}`,
      'data',
    );
    const res = await multi.exec();
    if (res?.[0]?.[1]) {
      const data = JSON.parse(res?.[0]?.[1] as string);
      const sessionId = data.payload.sessionId;
      return { deviceId: currentDeviceId, sessionId };
    }
    if (res?.[1]?.[1]) {
      const data = JSON.parse(res?.[1]?.[1] as string);
      const sessionId = data.payload.sessionId;
      return { deviceId: previousDeviceId, sessionId };
    }
  } catch (error) {
    console.error('Error getting session end GET /track/device-id', error);
  }

  return { deviceId: currentDeviceId, sessionId: generateSecureId('se') };
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

function getIdentity(body: ITrackHandlerPayload): IIdentifyPayload | undefined {
  if (body.type === 'track') {
    const identity = body.payload.properties?.__identify as
      | IIdentifyPayload
      | undefined;

    if (identity) {
      return identity;
    }

    return body.payload.profileId
      ? {
          profileId: String(body.payload.profileId),
        }
      : undefined;
  }

  return undefined;
}

export function getTimestamp(
  timestamp: FastifyRequest['timestamp'],
  payload: ITrackHandlerPayload['payload'],
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

  // isTimestampFromThePast is true only if timestamp is older than 15 minutes
  const isTimestampFromThePast =
    clientTimestampNumber < safeTimestamp - FIFTEEN_MINUTES_MS;

  return {
    timestamp: clientTimestampNumber,
    isTimestampFromThePast,
  };
}

interface TrackContext {
  projectId: string;
  ip: string;
  ua?: string;
  headers: Record<string, string | undefined>;
  timestamp: { value: number; isFromPast: boolean };
  identity?: IIdentifyPayload;
  deviceId: string;
  sessionId: string;
  geo: GeoLocation;
}

async function buildContext(
  request: FastifyRequest<{
    Body: ITrackHandlerPayload;
  }>,
  validatedBody: ITrackHandlerPayload,
): Promise<TrackContext> {
  const projectId = request.client?.projectId;
  if (!projectId) {
    throw new HttpError('Missing projectId', { status: 400 });
  }

  const timestamp = getTimestamp(request.timestamp, validatedBody.payload);
  const ip =
    validatedBody.type === 'track' && validatedBody.payload.properties?.__ip
      ? (validatedBody.payload.properties.__ip as string)
      : request.clientIp;
  const ua = request.headers['user-agent'] ?? 'unknown/1.0';

  const headers = getStringHeaders(request.headers);
  const identity = getIdentity(validatedBody);
  const profileId = identity?.profileId;

  if (profileId && validatedBody.type === 'track') {
    validatedBody.payload.profileId = profileId;
  }

  // Get geo location (needed for track and identify)
  const [geo, salts] = await Promise.all([getGeoLocation(ip), getSalts()]);

  const { deviceId, sessionId } = await getDeviceId({
    projectId,
    ip,
    ua,
    salts,
    overrideDeviceId:
      validatedBody.type === 'track' &&
      typeof validatedBody.payload?.properties?.__deviceId === 'string'
        ? validatedBody.payload?.properties.__deviceId
        : undefined,
  });

  return {
    projectId,
    ip,
    ua,
    headers,
    timestamp: {
      value: timestamp.timestamp,
      isFromPast: timestamp.isTimestampFromThePast,
    },
    identity,
    deviceId,
    sessionId,
    geo,
  };
}

async function handleTrack(
  payload: ITrackPayload,
  context: TrackContext,
): Promise<void> {
  const { projectId, deviceId, geo, headers, timestamp, sessionId } = context;

  const uaInfo = parseUserAgent(headers['user-agent'], payload.properties);
  const groupId = uaInfo.isServer
    ? payload.profileId
      ? `${projectId}:${payload.profileId}`
      : `${projectId}:${generateId()}`
    : deviceId;
  const jobId = [
    slug(payload.name),
    timestamp.value,
    projectId,
    deviceId,
    groupId,
  ]
    .filter(Boolean)
    .join('-');

  const promises = [];

  // If we have more than one property in the identity object, we should identify the user
  // Otherwise its only a profileId and we should not identify the user
  if (context.identity && Object.keys(context.identity).length > 1) {
    promises.push(handleIdentify(context.identity, context));
  }

  promises.push(
    getEventsGroupQueueShard(groupId).add({
      orderMs: timestamp.value,
      data: {
        projectId,
        headers,
        event: {
          ...payload,
          timestamp: timestamp.value,
          isTimestampFromThePast: timestamp.isFromPast,
        },
        uaInfo,
        geo,
        deviceId,
        sessionId,
        currentDeviceId: '', // TODO: Remove
        previousDeviceId: '', // TODO: Remove
      },
      groupId,
      jobId,
    }),
  );

  await Promise.all(promises);
}

async function handleIdentify(
  payload: IIdentifyPayload,
  context: TrackContext,
): Promise<void> {
  const { projectId, geo, ua } = context;
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

async function adjustProfileProperty(
  payload: IIncrementPayload | IDecrementPayload,
  projectId: string,
  direction: 1 | -1,
): Promise<void> {
  const { profileId, property, value } = payload;
  const profile = await getProfileById(profileId, projectId);
  if (!profile) {
    throw new HttpError('Profile not found', { status: 404 });
  }

  const parsed = Number.parseInt(
    pathOr<string>('0', property.split('.'), profile.properties),
    10,
  );

  if (Number.isNaN(parsed)) {
    throw new HttpError('Property value is not a number', { status: 400 });
  }

  profile.properties = assocPath(
    property.split('.'),
    parsed + direction * (value || 1),
    profile.properties,
  );

  await upsertProfile({
    id: profile.id,
    projectId,
    properties: profile.properties,
    isExternal: true,
  });
}

async function handleIncrement(
  payload: IIncrementPayload,
  context: TrackContext,
): Promise<void> {
  await adjustProfileProperty(payload, context.projectId, 1);
}

async function handleDecrement(
  payload: IDecrementPayload,
  context: TrackContext,
): Promise<void> {
  await adjustProfileProperty(payload, context.projectId, -1);
}

async function handleReplay(
  payload: IReplayPayload,
  context: TrackContext,
): Promise<void> {
  if (!context.sessionId) {
    throw new HttpError('Session ID is required for replay', { status: 400 });
  }

  const row = {
    project_id: context.projectId,
    session_id: context.sessionId,
    profile_id: '', // TODO: remove
    chunk_index: payload.chunk_index,
    started_at: payload.started_at,
    ended_at: payload.ended_at,
    events_count: payload.events_count,
    is_full_snapshot: payload.is_full_snapshot,
    payload: payload.payload,
  };
  await ch.insert({
    table: TABLE_NAMES.session_replay_chunks,
    values: [row],
    format: 'JSONEachRow',
  });
  await sessionBuffer.markHasReplay(row.session_id);
}

export async function handler(
  request: FastifyRequest<{
    Body: ITrackHandlerPayload;
  }>,
  reply: FastifyReply,
) {
  // Validate request body with Zod
  const validationResult = zTrackHandlerPayload.safeParse(request.body);
  if (!validationResult.success) {
    return reply.status(400).send({
      status: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      errors: validationResult.error.errors,
    });
  }

  const validatedBody = validationResult.data;

  // Handle alias (not supported)
  if (validatedBody.type === 'alias') {
    return reply.status(400).send({
      status: 400,
      error: 'Bad Request',
      message: 'Alias is not supported',
    });
  }

  // Build request context
  const context = await buildContext(request, validatedBody);

  // Dispatch to appropriate handler
  switch (validatedBody.type) {
    case 'track':
      await handleTrack(validatedBody.payload, context);
      break;
    case 'identify':
      await handleIdentify(validatedBody.payload, context);
      break;
    case 'increment':
      await handleIncrement(validatedBody.payload, context);
      break;
    case 'decrement':
      await handleDecrement(validatedBody.payload, context);
      break;
    case 'replay':
      await handleReplay(validatedBody.payload, context);
      break;
    default:
      return reply.status(400).send({
        status: 400,
        error: 'Bad Request',
        message: 'Invalid type',
      });
  }

  reply.status(200).send({
    deviceId: context.deviceId,
    sessionId: context.sessionId,
  });
}

export async function fetchDeviceId(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const salts = await getSalts();
  const projectId = request.client?.projectId;
  if (!projectId) {
    return reply.status(400).send('No projectId');
  }

  const ip = request.clientIp;
  if (!ip) {
    return reply.status(400).send('Missing ip address');
  }

  const ua = request.headers['user-agent'];
  if (!ua) {
    return reply.status(400).send('Missing header: user-agent');
  }

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

  try {
    const multi = getRedisCache().multi();
    multi.hget(
      `bull:sessions:sessionEnd:${projectId}:${currentDeviceId}`,
      'data',
    );
    multi.hget(
      `bull:sessions:sessionEnd:${projectId}:${previousDeviceId}`,
      'data',
    );
    const res = await multi.exec();
    if (res?.[0]?.[1]) {
      const data = JSON.parse(res?.[0]?.[1] as string);
      const sessionId = data.payload.sessionId;
      return reply.status(200).send({
        deviceId: sessionId,
        sessionId,
        message: 'current session exists for this device id',
      });
    }

    if (res?.[1]?.[1]) {
      const data = JSON.parse(res?.[1]?.[1] as string);
      const sessionId = data.payload.sessionId;
      return reply.status(200).send({
        deviceId: sessionId,
        sessionId,
        message: 'previous session exists for this device id',
      });
    }
  } catch (error) {
    request.log.error('Error getting session end GET /track/device-id', error);
  }

  return reply.status(200).send({
    deviceId: currentDeviceId,
    sessionId: '',
    message: 'No session exists for this device id',
  });
}
