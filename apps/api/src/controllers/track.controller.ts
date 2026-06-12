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
  ITrackBatchHandlerPayload,
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

  const overrideDeviceId = getOverrideDeviceId(validatedBody);

  const deviceIdResult = await getDeviceId({
    projectId: shared.projectId,
    ip,
    ua: shared.requestUa,
    salts: shared.salts,
    overrideDeviceId,
    eventTimeMs: timestamp.timestamp,
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
  request: FastifyRequest,
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
    case 'replay': {
      // BACKCOMPAT(replay-sessionid): prefer the SDK-echoed sessionId, fall
      // back to the server-derived one. TEMPORARY legacy branch — remove when
      // the new SDK is fully deployed. Mirrors the single-event /track path.
      if (!body.payload.sessionId) {
        await handleReplay(body.payload, {
          projectId: context.projectId,
          sessionId: context.sessionId,
        });
        return;
      }
      await handleReplay(body.payload, {
        projectId: context.projectId,
        sessionId: body.payload.sessionId,
      });
      return;
    }
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
    Body: ITrackHandlerPayload | ITrackBatchHandlerPayload;
  }>,
  reply: FastifyReply,
) {
  const validatedBody = request.body;

  // Batch envelope: `{ type: 'batch', payload: [event, ...] }` — fan each
  // item through the same per-event pipeline as a single-event request.
  if (validatedBody.type === 'batch') {
    return handleBatch(request, reply, validatedBody.payload);
  }

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
 * `POST /track` with `{ type: 'batch', payload: [...] }` — accepts up to
 * TRACK_BATCH_MAX_EVENTS payloads in one request and dispatches each through
 * the same per-event pipeline as a single-event request.
 *
 * Per-event validation failures do NOT fail the whole batch: the response is
 * always 202 (assuming envelope + auth pass) with `{ accepted, rejected[] }`
 * so callers can fix and retry just the bad indices.
 *
 * Optimization: salts + request-IP geo are fetched once and shared across
 * all events. Events that override `__ip` still get their own geo lookup.
 */
// Bounded concurrency for per-event processing inside a batch. Each event
// hits Redis (session lookup + groupmq queue add) and may trigger a geo
// lookup if it overrides `__ip`, so an unbounded `Promise.all` over 2000
// events can spike Redis pool usage and the geo provider's rate budget on
// smaller self-hosted instances. 50 keeps the pipeline saturated without
// turning a single big batch into a thundering herd.
const BATCH_CONCURRENCY = 50;

async function handleBatch(
  request: FastifyRequest<{
    Body: ITrackHandlerPayload | ITrackBatchHandlerPayload;
  }>,
  reply: FastifyReply,
  events: unknown[],
) {
  const shared = await buildSharedRequestContext(request);

  const processOne = async (
    raw: unknown,
    index: number,
  ): Promise<BatchItemResult> => {
    const parsed = zTrackHandlerPayload.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path?.join('.') ?? '';
      const error = path
        ? `${path}: ${issue?.message}`
        : issue?.message ?? 'invalid payload';
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
      const message = err instanceof Error ? err.message : 'unknown error';
      if (!isClientError) {
        request.log.error(
          { err, index },
          'Batch event dispatch failed',
        );
      }
      return { index, status: 'rejected', reason, error: message };
    }
  };

  // Process in chunks of BATCH_CONCURRENCY. We keep results aligned with
  // input indices via the `index` field on each BatchItemResult.
  const results: BatchItemResult[] = new Array(events.length);
  for (let start = 0; start < events.length; start += BATCH_CONCURRENCY) {
    const end = Math.min(start + BATCH_CONCURRENCY, events.length);
    const chunk = await Promise.all(
      events.slice(start, end).map((raw, i) => processOne(raw, start + i)),
    );
    for (const r of chunk) {
      results[r.index] = r;
    }
  }

  let accepted = 0;
  const rejected: Extract<BatchItemResult, { status: 'rejected' }>[] = [];
  for (const result of results) {
    if (result.status === 'accepted') {
      accepted += 1;
    } else {
      rejected.push(result);
    }
  }

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
