// The ingestion pipeline (M8-002). Ported from apps/api's
// track.controller.ts, its three route hooks (duplicate / client / is-bot)
// and utils/ids.ts. V1's Fastify controller and hooks stay the LIVE route
// (DELEGATE PATTERN) and call the functions below; ingest.routes.ts is the
// V2 half over the same functions.
//
// Nothing here throws for a caller error: each transport owns its own status
// codes and bodies, so the pipeline returns a `TrackOutcome` and V1 maps it
// back onto the exact `HttpError`s and replies it produced before.
//
// The Kafka producer is INJECTED. `produceIncomingEvent` still lives in
// @openpanel/queue, which imports @openpanel/core for its logger — core
// cannot import it back without a real package cycle (see
// cohort.service.ts's header). M8-003 moves the producer into core and the
// injection point becomes an AppDeps field.

import { generateId } from '@openpanel/common';
import { assocPath, pathOr, pick } from 'ramda';
import { v4 as uuid } from 'uuid';
import type { Buffers } from '../../buffers/create-buffers';
import { SESSION_TIMEOUT_MS } from '../../buffers/session-buffer';
import {
  type AsnInfo,
  type GeoLocation,
  getAsnInfo,
  getGeoLocation,
} from '../../clients/geo';
import type { Logger } from '../../logger';
import type { ServiceDeps } from '../../services';
import { parseUserAgent } from '../../shared/parser-user-agent';
import { generateDeviceId } from '../../shared/profileId';
import { createBotEvent } from '../event/event.service';
import {
  getProfileById,
  identifyProfile,
  upsertProfile,
} from '../profile/profile.service';
import { getSalts } from '../salt/salt.service';
import { convertClickhouseDateToJs } from '../session/src/dates';
import type {
  IAssignGroupPayload,
  IDecrementPayload,
  IGroupPayload,
  IIdentifyPayload,
  IIncrementPayload,
  IReplayPayload,
  ITrackHandlerPayload,
  ITrackPayload,
} from './ingest.constants';
import { isBot } from './src/bots/detect';
import { applyBotSuspicion, stripBotProperties } from './src/bots/suspicion';
import { isDuplicatedEvent } from './src/deduplicate';
import { getDeviceId } from './src/device-id';
import { headerValue, type IngestHeaders } from './src/headers';
import type {
  IncomingEventPayload,
  IncomingEventProducer,
} from './src/incoming-event';

export type { BotMatch } from './src/bots/detect';
export { detectBot, isBot } from './src/bots/detect';
export {
  applyBotSuspicion,
  BOT_CATEGORY_THRESHOLD,
  type BotSuspicion,
  stripBotProperties,
  summarizeBotSignals,
} from './src/bots/suspicion';
export {
  type IngestAuthErrorPayload,
  type IngestAuthOutcome,
  validateIngestRequest,
} from './src/client-auth';
export { isDuplicatedEvent } from './src/deduplicate';
export { getDeviceId } from './src/device-id';
export type { IngestHeaders } from './src/headers';
export type {
  IncomingEventPayload,
  IncomingEventProducer,
} from './src/incoming-event';

/** The buffers this module touches. A subset of `AppDeps.buffers`. */
export type IngestBuffers = Pick<Buffers, 'session' | 'replay' | 'group'>;

export interface IngestTransport {
  buffers: IngestBuffers;
  produceIncomingEvent: IncomingEventProducer;
}

const QUEUE_PAYLOAD_HEADERS = [
  'user-agent',
  'openpanel-sdk-name',
  'openpanel-sdk-version',
  'openpanel-client-id',
  'request-id',
];

const MAX_OVERRIDE_DEVICE_ID_LENGTH = 64;
const ONE_MINUTE_MS = 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * ONE_MINUTE_MS;
const FALLBACK_USER_AGENT = 'unknown/1.0';

/** The whitelisted subset that ships with the queue payload. */
export function getStringHeaders(
  headers: IngestHeaders
): Record<string, string | undefined> {
  return Object.entries(pick(QUEUE_PAYLOAD_HEADERS, headers)).reduce(
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
      ? { profileId: String(body.payload.profileId) }
      : undefined;
  }

  return undefined;
}

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

/** Resolve a caller-supplied device id from `properties.__deviceId`. */
export function getOverrideDeviceId(
  body: ITrackHandlerPayload
): string | undefined {
  if (body.type !== 'track') {
    return undefined;
  }
  return sanitizeOverrideDeviceId(body.payload?.properties?.__deviceId);
}

export function getTimestamp(
  timestamp: number | undefined,
  payload: ITrackHandlerPayload['payload']
): { timestamp: number; isTimestampFromThePast: boolean } {
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

  return { timestamp: clientTimestampNumber, isTimestampFromThePast };
}

export interface TrackContext {
  projectId: string;
  ip: string;
  ua?: string;
  // Whitelisted subset (getStringHeaders) that ships with the queue payload.
  headers: Record<string, string | undefined>;
  // Full raw request headers — bot signals need sec-ch-ua / sec-fetch-* /
  // accept-language, which the whitelist above deliberately drops.
  requestHeaders: IngestHeaders;
  clientSecretAuth: boolean;
  timestamp: { value: number; isFromPast: boolean };
  identity?: IIdentifyPayload;
  deviceId: string;
  sessionId: string;
  geo: GeoLocation;
  asnInfo: AsnInfo;
}

/** What a transport hands the pipeline, after its own auth ran. */
export interface TrackRequest {
  projectId: string | null | undefined;
  clientIp: string;
  headers: IngestHeaders;
  clientSecretAuth: boolean;
  /** The request-arrival timestamp (V1's `timestampHook`). */
  timestamp: number | undefined;
  body: ITrackHandlerPayload;
}

export type TrackOutcome =
  | { status: 'ok'; deviceId: string; sessionId: string }
  | { status: 'alias-not-supported' }
  | { status: 'invalid-type' }
  | { status: 'missing-project-id' }
  | { status: 'replay-missing-session-id' }
  | { status: 'profile-not-found' }
  | { status: 'profile-property-not-a-number' };

async function buildContext(
  request: TrackRequest,
  buffers: IngestBuffers
): Promise<TrackContext> {
  const projectId = request.projectId as string;
  const timestamp = getTimestamp(request.timestamp, request.body.payload);
  const ip =
    request.body.type === 'track' && request.body.payload.properties?.__ip
      ? (request.body.payload.properties.__ip as string)
      : request.clientIp;
  const ua = headerValue(request.headers, 'user-agent') ?? FALLBACK_USER_AGENT;

  const headers = getStringHeaders(request.headers);
  const identity = getIdentity(request.body);
  const profileId = identity?.profileId;

  if (profileId && request.body.type === 'track') {
    request.body.payload.profileId = profileId;
  }

  const overrideDeviceId = getOverrideDeviceId(request.body);

  // Get geo location (needed for track and identify) + ASN (bot detection).
  // Both hit the same MaxMind readers keyed on the same IP and are cached, so
  // resolving them together adds no meaningful latency.
  const [geo, asnInfo, salts] = await Promise.all([
    getGeoLocation(ip),
    getAsnInfo(ip),
    getSalts(),
  ]);

  const deviceIdResult = await getDeviceId({
    projectId,
    ip,
    ua,
    salts,
    overrideDeviceId,
    eventTimeMs: timestamp.timestamp,
    sessionBuffer: buffers.session,
  });

  return {
    projectId,
    ip,
    ua,
    headers,
    requestHeaders: request.headers,
    clientSecretAuth: request.clientSecretAuth,
    timestamp: {
      value: timestamp.timestamp,
      isFromPast: timestamp.isTimestampFromThePast,
    },
    identity,
    deviceId: deviceIdResult.deviceId,
    sessionId: deviceIdResult.sessionId,
    geo,
    asnInfo,
  };
}

async function handleTrack(
  payload: ITrackPayload,
  context: TrackContext,
  transport: IngestTransport
): Promise<void> {
  const { projectId, deviceId, geo, headers, timestamp, sessionId } = context;

  const uaInfo = parseUserAgent(headers['user-agent'], payload.properties);
  // Mark (never block) likely bot traffic with __bot / __bot_reasons props.
  payload.properties = applyBotSuspicion(payload.properties, {
    asnInfo: context.asnInfo,
    headers: context.requestHeaders,
    clientSecretAuth: context.clientSecretAuth,
    isServer: uaInfo.isServer,
  });
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

  const queueData: IncomingEventPayload = {
    // The id of the ClickHouse row this event becomes, minted here so a
    // redelivered Kafka message is a duplicate we can recognise.
    id: uuid(),
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

  promises.push(transport.produceIncomingEvent(queueData, partitionKey));

  await Promise.all(promises);
}

async function handleIdentify(
  payload: IIdentifyPayload,
  context: TrackContext
): Promise<void> {
  // Profiles must not carry forged bot verdicts either.
  stripBotProperties(payload.properties);
  const userAgent = parseUserAgent(context.ua, payload.properties);
  await identifyProfile(context.projectId, payload, {
    geo: context.geo,
    userAgent,
  });
}

async function adjustProfileProperty(
  payload: IIncrementPayload | IDecrementPayload,
  projectId: string,
  direction: 1 | -1
): Promise<TrackOutcome | null> {
  const { profileId, property, value } = payload;
  const profile = await getProfileById(String(profileId), projectId);
  if (!profile) {
    return { status: 'profile-not-found' };
  }

  const parsed = Number.parseInt(
    pathOr<string>('0', property.split('.'), profile.properties),
    10
  );

  if (Number.isNaN(parsed)) {
    return { status: 'profile-property-not-a-number' };
  }

  await upsertProfile({
    id: profile.id,
    projectId,
    properties: assocPath(
      property.split('.'),
      parsed + direction * (value || 1),
      profile.properties
    ),
    isExternal: true,
  });

  return null;
}

/** Replay only needs the server-issued session id (the SDK echoes it back).
 *  Trust it — scoped to the authed project, unguessable, same trust level as
 *  event data. */
export async function handleReplay(
  payload: IReplayPayload,
  {
    projectId,
    sessionId,
  }: { projectId: string; sessionId: string | undefined },
  replayBuffer: IngestBuffers['replay']
): Promise<TrackOutcome | null> {
  if (!sessionId) {
    return { status: 'replay-missing-session-id' };
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
  return null;
}

async function handleGroup(
  payload: IGroupPayload,
  context: TrackContext,
  groupBuffer: IngestBuffers['group']
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

/** `POST /track`. The dispatch order is V1's, including that an unknown type
 *  still resolves geo/device before it is refused. */
export async function ingestTrack(
  request: TrackRequest,
  transport: IngestTransport
): Promise<TrackOutcome> {
  const body = request.body;

  if (body.type === 'alias') {
    return { status: 'alias-not-supported' };
  }

  if (!request.projectId) {
    return { status: 'missing-project-id' };
  }

  const context = await buildContext(request, transport.buffers);

  switch (body.type) {
    case 'track':
      await handleTrack(body.payload, context, transport);
      break;
    case 'identify':
      await handleIdentify(body.payload, context);
      break;
    case 'increment': {
      const failure = await adjustProfileProperty(
        body.payload,
        context.projectId,
        1
      );
      if (failure) {
        return failure;
      }
      break;
    }
    case 'decrement': {
      const failure = await adjustProfileProperty(
        body.payload,
        context.projectId,
        -1
      );
      if (failure) {
        return failure;
      }
      break;
    }
    case 'replay': {
      // BACKCOMPAT(replay-sessionid): TEMPORARY legacy branch, remove when new SDK is fully deployed
      const failure = await handleReplay(
        body.payload,
        {
          projectId: context.projectId,
          sessionId: body.payload.sessionId || context.sessionId,
        },
        transport.buffers.replay
      );
      if (failure) {
        return failure;
      }
      break;
    }
    case 'group':
      await handleGroup(body.payload, context, transport.buffers.group);
      break;
    case 'assign_group':
      await handleAssignGroup(body.payload, context);
      break;
    default:
      return { status: 'invalid-type' };
  }

  return {
    status: 'ok',
    deviceId: context.deviceId,
    sessionId: context.sessionId,
  };
}

export type DeviceIdentity =
  | { status: 'ok'; deviceId: string; sessionId: string; message: string }
  | { status: 'missing-project-id' }
  | { status: 'missing-ip' }
  | { status: 'missing-user-agent' };

/** `GET /track/device-id`. */
export async function fetchDeviceIdentity(
  request: {
    projectId: string | null | undefined;
    clientIp: string | undefined;
    headers: IngestHeaders;
  },
  buffers: Pick<IngestBuffers, 'session'>,
  logger: Logger
): Promise<DeviceIdentity> {
  const salts = await getSalts();
  const projectId = request.projectId;
  if (!projectId) {
    return { status: 'missing-project-id' };
  }

  const ip = request.clientIp;
  if (!ip) {
    return { status: 'missing-ip' };
  }

  const ua = headerValue(request.headers, 'user-agent');
  if (!ua) {
    return { status: 'missing-user-agent' };
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
      buffers.session.getExistingSession({
        projectId,
        deviceId: currentDeviceId,
      }),
      buffers.session.getExistingSession({
        projectId,
        deviceId: previousDeviceId,
      }),
    ]);

    // Blob has no TTL — only treat the session as "current" if its last
    // event is within the idle window. Otherwise the SDK should ask the
    // server to start a fresh session id on the next event.
    const now = Date.now();

    if (current && isLiveSession(current, now)) {
      return {
        status: 'ok',
        deviceId: currentDeviceId,
        sessionId: current.id,
        message: 'current session exists for this device id',
      };
    }

    if (previous && isLiveSession(previous, now)) {
      return {
        status: 'ok',
        deviceId: previousDeviceId,
        sessionId: previous.id,
        message: 'previous session exists for this device id',
      };
    }
  } catch (error) {
    logger.error(
      { err: error },
      'Error getting session end GET /track/device-id'
    );
  }

  return {
    status: 'ok',
    deviceId: currentDeviceId,
    sessionId: '',
    message: 'No session exists for this device id',
  };
}

/** The `duplicateHook`: the web SDK can fire the same event twice. */
export async function isDuplicateIngestRequest(request: {
  method: string;
  clientIp: string | undefined;
  headers: IngestHeaders;
  body: unknown;
}): Promise<boolean> {
  const ip = request.clientIp;
  const origin = headerValue(request.headers, 'origin');
  const clientId = headerValue(request.headers, 'openpanel-client-id');
  const isReplay = isTrackBody(request) && request.body.type === 'replay';
  const shouldCheck = ip && origin && clientId && !isReplay;

  if (!shouldCheck) {
    return false;
  }

  return await isDuplicatedEvent({
    ip,
    origin,
    payload: request.body as Record<string, unknown>,
    projectId: clientId,
  });
}

function isTrackBody(request: {
  method: string;
  body: unknown;
}): request is { method: string; body: ITrackHandlerPayload } {
  if (request.method !== 'POST') {
    return false;
  }
  if (!request.body) {
    return false;
  }
  if (typeof request.body !== 'object' || Array.isArray(request.body)) {
    return false;
  }
  return 'type' in request.body;
}

export type BotVerdict = { name: string; type: string } | null;

/**
 * The `isBotHook`. Requests authenticated with a client secret come from
 * server-side SDKs (node, php, go, rust, java, python, …). That auth is a far
 * stronger signal of legitimate first-party traffic than the user agent, so
 * never treat them as bots — bot detection is for public/frontend
 * (origin-authenticated) traffic.
 */
export async function checkIngestBot(request: {
  headers: IngestHeaders;
  clientSecretAuth: boolean;
  projectId: string | null | undefined;
  body: unknown;
}): Promise<BotVerdict> {
  if (request.clientSecretAuth) {
    return null;
  }

  const userAgent = headerValue(request.headers, 'user-agent');
  const bot = userAgent ? await isBot(userAgent) : null;

  if (!(bot && request.projectId)) {
    return null;
  }

  const path = getBotEventPath(request.body);
  if (path) {
    await createBotEvent({
      ...bot,
      projectId: request.projectId,
      path,
      createdAt: new Date(),
    });
  }

  return bot;
}

function getBotEventPath(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  if ('type' in body && (body as ITrackHandlerPayload).type === 'track') {
    const properties = (
      body as { payload?: { properties?: Record<string, unknown> } }
    ).payload?.properties;
    return (properties?.__path || properties?.path) as string | undefined;
  }
  // Handle deprecated events (v1)
  if ('name' in body && 'properties' in body) {
    const properties = (body as { properties?: Record<string, unknown> })
      .properties;
    return (properties?.__path || properties?.path) as string | undefined;
  }
  return undefined;
}

function isLiveSession(session: { ended_at: string }, now: number): boolean {
  return (
    now - convertClickhouseDateToJs(session.ended_at).getTime() <
    SESSION_TIMEOUT_MS
  );
}

export interface IngestService {
  track(
    request: TrackRequest,
    produceIncomingEvent: IncomingEventProducer
  ): Promise<TrackOutcome>;
  checkBot: typeof checkIngestBot;
  isDuplicate: typeof isDuplicateIngestRequest;
}

export function createIngestService(deps: ServiceDeps): IngestService {
  return {
    track: (request, produceIncomingEvent) =>
      ingestTrack(request, { buffers: deps.buffers, produceIncomingEvent }),
    checkBot: checkIngestBot,
    isDuplicate: isDuplicateIngestRequest,
  };
}
