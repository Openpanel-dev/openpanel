import { generateId } from '@openpanel/common';
import { generateDeviceId, parseUserAgent } from '@openpanel/common/server';
import {
  getProfileById,
  getSalts,
  groupBuffer,
  replayBuffer,
  upsertProfile,
} from '@openpanel/db';
import { type GeoLocation, getGeoLocation } from '@openpanel/geo';
import {
  type EventsQueuePayloadIncomingEvent,
  getEventsGroupQueueShard,
  produceIncomingEvent,
  shouldUseKafka,
} from '@openpanel/queue';
import { getRedisCache } from '@openpanel/redis';
import type {
  IAssignGroupPayload,
  IDecrementPayload,
  IGroupPayload,
  IIdentifyPayload,
  IIncrementPayload,
  IReplayPayload,
  ITrackBatchBody,
  ITrackHandlerPayload,
  ITrackPayload,
} from '@openpanel/validation';
import { zTrackHandlerPayload } from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { assocPath, pathOr, pick } from 'ramda';
import { HttpError } from '@/utils/errors';
import { getDeviceId } from '@/utils/ids';

type Salts = Awaited<ReturnType<typeof getSalts>>;

/**
 * Per-request data that is identical for every event in a batch.
 * Computed once in the batch handler so we don't re-fetch salts/geo
 * or re-parse headers N times.
 */
interface SharedRequestContext {
  projectId: string;
  requestIp: string;
  requestUa: string;
  requestHeaders: Record<string, string | undefined>;
  requestGeo: GeoLocation;
  salts: Salts;
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

/**
 * Build the per-request shared context. Done once per HTTP request — for
 * single-event /track this is just an extra struct; for /track/batch it
 * lets N events share one salts + one geo lookup.
 */
async function buildSharedRequestContext(
  request: FastifyRequest,
): Promise<SharedRequestContext> {
  const projectId = request.client?.projectId;
  if (!projectId) {
    throw new HttpError('Missing projectId', { status: 400 });
  }

  const requestIp = request.clientIp;
  const requestUa = request.headers['user-agent'] ?? 'unknown/1.0';
  const requestHeaders = getStringHeaders(request.headers);

  const [requestGeo, salts] = await Promise.all([
    getGeoLocation(requestIp),
    getSalts(),
  ]);

  return {
    projectId,
    requestIp,
    requestUa,
    requestHeaders,
    requestGeo,
    salts,
  };
}

/**
 * Build a per-event TrackContext from already-fetched shared data.
 * Per-event work: timestamp, identity, ip override, deviceId, and a
 * second geo lookup *only* if the event overrides __ip.
 */
async function buildEventContext(
  shared: SharedRequestContext,
  requestTimestamp: FastifyRequest['timestamp'],
  validatedBody: ITrackHandlerPayload,
): Promise<TrackContext> {
  const timestamp = getTimestamp(requestTimestamp, validatedBody.payload);

  const overrideIp =
    validatedBody.type === 'track' && validatedBody.payload.properties?.__ip
      ? (validatedBody.payload.properties.__ip as string)
      : undefined;
  const ip = overrideIp ?? shared.requestIp;

  // Only re-fetch geo when the event overrode the IP — the common case
  // (browser SDK, no __ip) reuses the request-level geo computed once.
  const geo =
    overrideIp && overrideIp !== shared.requestIp
      ? await getGeoLocation(overrideIp)
      : shared.requestGeo;

  const identity = getIdentity(validatedBody);
  const profileId = identity?.profileId;
  if (profileId && validatedBody.type === 'track') {
    validatedBody.payload.profileId = profileId;
  }

  const overrideDeviceId =
    validatedBody.type === 'track' &&
    typeof validatedBody.payload?.properties?.__deviceId === 'string'
      ? validatedBody.payload?.properties.__deviceId
      : undefined;

  const deviceIdResult = await getDeviceId({
    projectId: shared.projectId,
    ip,
    ua: shared.requestUa,
    salts: shared.salts,
    overrideDeviceId,
    // Bucket the deterministic session_id by the event's own __timestamp,
    // not the wall-clock moment the request arrived. Critical for
    // /track/batch where one request can contain events spanning days.
    eventMs: timestamp.timestamp,
  });

  return {
    projectId: shared.projectId,
    ip,
    ua: shared.requestUa,
    headers: shared.requestHeaders,
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

async function buildContext(
  request: FastifyRequest<{
    Body: ITrackHandlerPayload;
  }>,
  validatedBody: ITrackHandlerPayload,
): Promise<TrackContext> {
  const shared = await buildSharedRequestContext(request);
  return buildEventContext(shared, request.timestamp, validatedBody);
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

  if (shouldUseKafka(projectId)) {
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

async function handleReplay(
  payload: IReplayPayload,
  context: TrackContext
): Promise<void> {
  if (!context.sessionId) {
    throw new HttpError('Session ID is required for replay', { status: 400 });
  }

  const row = {
    project_id: context.projectId,
    session_id: context.sessionId,
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

/**
 * Dispatch a validated event to the matching per-type handler. Shared by
 * /track and /track/batch. Throws HttpError(400) for the unsupported `alias`
 * type so single-event and batch can both surface it consistently.
 */
async function dispatchEvent(
  body: ITrackHandlerPayload,
  context: TrackContext,
): Promise<void> {
  switch (body.type) {
    case 'alias':
      throw new HttpError('Alias is not supported', { status: 400 });
    case 'track':
      await handleTrack(body.payload, context);
      return;
    case 'identify':
      await handleIdentify(body.payload, context);
      return;
    case 'increment':
      await handleIncrement(body.payload, context);
      return;
    case 'decrement':
      await handleDecrement(body.payload, context);
      return;
    case 'replay':
      await handleReplay(body.payload, context);
      return;
    case 'group':
      await handleGroup(body.payload, context);
      return;
    case 'assign_group':
      await handleAssignGroup(body.payload, context);
      return;
    default: {
      // Exhaustiveness check: `body` narrows to `never` when every variant
      // of ITrackHandlerPayload['type'] is handled. Adding a new variant
      // makes this assignment fail to compile.
      const exhaustive: never = body;
      throw new HttpError(`Unhandled event type: ${exhaustive}`, {
        status: 400,
      });
    }
  }
}

export async function handler(
  request: FastifyRequest<{
    Body: ITrackHandlerPayload;
  }>,
  reply: FastifyReply,
) {
  const validatedBody = request.body;

  // Reject `alias` before building context — saves the salts/geo/deviceId work
  // for a request that's going to fail anyway.
  if (validatedBody.type === 'alias') {
    return reply.status(400).send({
      status: 400,
      error: 'Bad Request',
      message: 'Alias is not supported',
    });
  }

  const context = await buildContext(request, validatedBody);
  await dispatchEvent(validatedBody, context);

  reply.status(200).send({
    deviceId: context.deviceId,
    sessionId: context.sessionId,
  });
}

type BatchItemResult =
  | { index: number; status: 'accepted' }
  | {
      index: number;
      status: 'rejected';
      reason: 'validation' | 'internal';
      error: string;
    };

/**
 * POST /track/batch — accepts up to TRACK_BATCH_MAX_EVENTS payloads in one
 * request and dispatches each through the same per-event pipeline as /track.
 *
 * Per-event validation failures do NOT fail the whole batch: the response is
 * always 202 (assuming envelope + auth pass) with `{ accepted, rejected[] }`
 * so callers can fix and retry just the bad indices.
 *
 * Optimization: salts + request-IP geo are fetched once and shared across
 * all events. Events that override `__ip` still get their own geo lookup.
 */
export async function batchHandler(
  request: FastifyRequest<{
    Body: ITrackBatchBody;
  }>,
  reply: FastifyReply,
) {
  const { events } = request.body;
  const shared = await buildSharedRequestContext(request);

  const results = await Promise.all(
    events.map<Promise<BatchItemResult>>(async (raw, index) => {
      const parsed = zTrackHandlerPayload.safeParse(raw);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const path = issue?.path?.join('.') ?? '';
        const error = path ? `${path}: ${issue?.message}` : issue?.message ?? 'invalid payload';
        return { index, status: 'rejected', reason: 'validation', error };
      }

      try {
        const context = await buildEventContext(
          shared,
          request.timestamp,
          parsed.data,
        );
        await dispatchEvent(parsed.data, context);
        return { index, status: 'accepted' };
      } catch (err) {
        // HttpError with 4xx → caller's fault (validation-style: alias,
        // unknown type, replay without session). Anything else → ours.
        const isClientError =
          err instanceof HttpError && err.status >= 400 && err.status < 500;
        const reason: 'validation' | 'internal' = isClientError
          ? 'validation'
          : 'internal';
        const message =
          err instanceof Error ? err.message : 'unknown error';
        if (!isClientError) {
          request.log.error(
            { err, index },
            'Batch event dispatch failed',
          );
        }
        return { index, status: 'rejected', reason, error: message };
      }
    }),
  );

  const accepted = results.filter((r) => r.status === 'accepted').length;
  const rejected = results.filter(
    (r): r is Extract<BatchItemResult, { status: 'rejected' }> =>
      r.status === 'rejected',
  );

  reply.status(202).send({
    accepted,
    rejected,
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
    const multi = getRedisCache().multi();
    multi.hget(
      `bull:sessions:sessionEnd:${projectId}:${currentDeviceId}`,
      'data'
    );
    multi.hget(
      `bull:sessions:sessionEnd:${projectId}:${previousDeviceId}`,
      'data'
    );
    const res = await multi.exec();
    if (res?.[0]?.[1]) {
      const data = JSON.parse(res?.[0]?.[1] as string);
      const sessionId = data.payload.sessionId;
      return reply.status(200).send({
        deviceId: currentDeviceId,
        sessionId,
        message: 'current session exists for this device id',
      });
    }

    if (res?.[1]?.[1]) {
      const data = JSON.parse(res?.[1]?.[1] as string);
      const sessionId = data.payload.sessionId;
      return reply.status(200).send({
        deviceId: previousDeviceId,
        sessionId,
        message: 'previous session exists for this device id',
      });
    }
  } catch (error) {
    request.log.error(
      { err: error },
      'Error getting session end GET /track/device-id',
    );
  }

  return reply.status(200).send({
    deviceId: currentDeviceId,
    sessionId: '',
    message: 'No session exists for this device id',
  });
}
