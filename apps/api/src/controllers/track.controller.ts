import { generateId } from '@openpanel/common';
import { generateDeviceId, parseUserAgent } from '@openpanel/common/server';
import {
  convertClickhouseDateToJs,
  getProfileById,
  getSalts,
  groupBuffer,
  replayBuffer,
  SESSION_TIMEOUT_MS,
  sessionBuffer,
  upsertProfile,
} from '@openpanel/db';
import { type GeoLocation, getGeoLocation } from '@openpanel/geo';
import {
  type EventsQueuePayloadIncomingEvent,
  getEventsGroupQueueShard,
  produceIncomingEvent,
  shouldUseKafka,
} from '@openpanel/queue';
import type {
  IAssignGroupPayload,
  IDecrementPayload,
  IGroupPayload,
  IIdentifyPayload,
  IIncrementPayload,
  IReplayPayload,
  ITrackHandlerPayload,
  ITrackPayload,
} from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { assocPath, pathOr, pick } from 'ramda';
import { HttpError } from '@/utils/errors';
import { getDeviceId } from '@/utils/ids';

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
      headers
    )
  ).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [key]: value ? String(value) : undefined,
    }),
    {}
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

const MAX_OVERRIDE_DEVICE_ID_LENGTH = 64;

function sanitizeOverrideDeviceId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_OVERRIDE_DEVICE_ID_LENGTH) {
    return undefined;
  }
  return trimmed;
}

// Resolve a caller-supplied device id from a track event's `properties.__deviceId`.
export function getOverrideDeviceId(
  body: ITrackHandlerPayload
): string | undefined {
  if (body.type !== 'track') {
    return undefined;
  }
  return sanitizeOverrideDeviceId(body.payload?.properties?.__deviceId);
}

export function getTimestamp(
  timestamp: FastifyRequest['timestamp'],
  payload: ITrackHandlerPayload['payload']
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
  validatedBody: ITrackHandlerPayload
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

  const overrideDeviceId = getOverrideDeviceId(validatedBody);

  // Get geo location (needed for track and identify)
  const [geo, salts] = await Promise.all([getGeoLocation(ip), getSalts()]);

  const deviceIdResult = await getDeviceId({
    projectId,
    ip,
    ua,
    salts,
    overrideDeviceId,
    eventTimeMs: timestamp.timestamp,
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
    deviceId: deviceIdResult.deviceId,
    sessionId: deviceIdResult.sessionId,
    geo,
  };
}

async function handleTrack(
  payload: ITrackPayload,
  context: TrackContext
): Promise<void> {
  const { projectId, deviceId, geo, headers, timestamp, sessionId } = context;

  const uaInfo = parseUserAgent(headers['user-agent'], payload.properties);
  const groupId = uaInfo.isServer
    ? payload.profileId
      ? `${projectId}:${payload.profileId}`
      : undefined
    : deviceId;
  const promises: Promise<unknown>[] = [];

  // If we have more than one property in the identity object, we should identify the user
  // Otherwise its only a profileId and we should not identify the user
  if (context.identity && Object.keys(context.identity).length > 1) {
    promises.push(handleIdentify(context.identity, context));
  }

  const queueData: EventsQueuePayloadIncomingEvent['payload'] = {
    projectId,
    headers,
    event: {
      ...payload,
      groups: payload.groups ?? [],
      timestamp: timestamp.value,
      isTimestampFromThePast: timestamp.isFromPast,
    },
    uaInfo,
    geo,
    deviceId,
    sessionId,
  };

  const partitionKey = groupId || generateId();

  if (shouldUseKafka()) {
    promises.push(produceIncomingEvent(queueData, partitionKey));
  } else {
    promises.push(
      getEventsGroupQueueShard(partitionKey).add({
        orderMs: timestamp.value,
        data: queueData,
        groupId,
      })
    );
  }

  await Promise.all(promises);
}

async function handleIdentify(
  payload: IIdentifyPayload,
  context: TrackContext
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
  direction: 1 | -1
): Promise<void> {
  const { profileId, property, value } = payload;
  const profile = await getProfileById(String(profileId), projectId);
  if (!profile) {
    throw new HttpError('Profile not found', { status: 404 });
  }

  const parsed = Number.parseInt(
    pathOr<string>('0', property.split('.'), profile.properties),
    10
  );

  if (Number.isNaN(parsed)) {
    throw new HttpError('Property value is not a number', { status: 400 });
  }

  profile.properties = assocPath(
    property.split('.'),
    parsed + direction * (value || 1),
    profile.properties
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
  context: TrackContext
): Promise<void> {
  await adjustProfileProperty(payload, context.projectId, 1);
}

async function handleDecrement(
  payload: IDecrementPayload,
  context: TrackContext
): Promise<void> {
  await adjustProfileProperty(payload, context.projectId, -1);
}

// Replay only needs the server-issued session id (the SDK echoes it back). Trust
// it — scoped to the authed project, unguessable, same trust level as event data.
export async function handleReplay(
  payload: IReplayPayload,
  { projectId, sessionId }: { projectId: string; sessionId: string | undefined }
): Promise<void> {
  if (!sessionId) {
    throw new HttpError('Session ID is required for replay', { status: 400 });
  }

  const row = {
    project_id: projectId,
    session_id: sessionId,
    chunk_index: payload.chunk_index,
    started_at: payload.started_at,
    ended_at: payload.ended_at,
    events_count: payload.events_count,
    is_full_snapshot: payload.is_full_snapshot,
    payload: payload.payload,
  };
  await replayBuffer.add(row);
}

async function handleGroup(
  payload: IGroupPayload,
  context: TrackContext
): Promise<void> {
  const { id, type, name, properties = {} } = payload;
  await groupBuffer.add({
    id,
    projectId: context.projectId,
    type,
    name,
    properties,
  });
}

async function handleAssignGroup(
  payload: IAssignGroupPayload,
  context: TrackContext
): Promise<void> {
  const profileId = payload.profileId ?? context.deviceId;
  if (!profileId) {
    return;
  }
  await upsertProfile({
    id: String(profileId),
    projectId: context.projectId,
    isExternal: !!payload.profileId,
    groups: payload.groupIds,
  });
}

export async function handler(
  request: FastifyRequest<{
    Body: ITrackHandlerPayload;
  }>,
  reply: FastifyReply
) {
  const validatedBody = request.body;

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
    case 'replay': {
      // BACKCOMPAT(replay-sessionid): TEMPORARY legacy branch, remove when new SDK is fully deployed
      if (!validatedBody.payload.sessionId) {
        await handleReplay(validatedBody.payload, {
          projectId: context.projectId,
          sessionId: context.sessionId,
        });
        break;
      }

      await handleReplay(validatedBody.payload, {
        projectId: context.projectId,
        sessionId: validatedBody.payload.sessionId,
      });
      break;
    }
    case 'group':
      await handleGroup(validatedBody.payload, context);
      break;
    case 'assign_group':
      await handleAssignGroup(validatedBody.payload, context);
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
  reply: FastifyReply
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
    const [current, previous] = await Promise.all([
      sessionBuffer.getExistingSession({
        projectId,
        deviceId: currentDeviceId,
      }),
      sessionBuffer.getExistingSession({
        projectId,
        deviceId: previousDeviceId,
      }),
    ]);

    // Blob has no TTL — only treat the session as "current" if its last
    // event is within the idle window. Otherwise the SDK should ask the
    // server to start a fresh session id on the next event.
    const now = Date.now();
    const isLive = (s: typeof current) =>
      !!s &&
      now - convertClickhouseDateToJs(s.ended_at).getTime() <
        SESSION_TIMEOUT_MS;

    if (current && isLive(current)) {
      return reply.status(200).send({
        deviceId: currentDeviceId,
        sessionId: current.id,
        message: 'current session exists for this device id',
      });
    }

    if (previous && isLive(previous)) {
      return reply.status(200).send({
        deviceId: previousDeviceId,
        sessionId: previous.id,
        message: 'previous session exists for this device id',
      });
    }
  } catch (error) {
    request.log.error(
      { err: error },
      'Error getting session end GET /track/device-id'
    );
  }

  return reply.status(200).send({
    deviceId: currentDeviceId,
    sessionId: '',
    message: 'No session exists for this device id',
  });
}
