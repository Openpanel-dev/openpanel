// Device and session identity for an incoming event: the salted device id,
// and the session id the API answers with synchronously while the worker
// persists the blob async.

import crypto from 'node:crypto';
import type { SessionBuffer } from '../../../buffers/session-buffer';
import type { Logger } from '../../../logger';
import { generateDeviceId } from '../../../shared/profileId';
import type { IClickhouseSession } from '../../session/session.service';
import { convertClickhouseDateToJs } from '../../session/src/dates';

/** Only the read this module needs, so a caller may pass a narrower stub. */
export type SessionBufferReader = Pick<SessionBuffer, 'getExistingSession'>;

/** Only the level this module logs at. The inputs here are an IP and a salt,
 *  so it must be the redacting pino logger and never `console`. */
export type SessionResolutionLogger = Pick<Logger, 'error'>;

export interface DeviceIdResult {
  deviceId: string;
  sessionId: string;
}

const SESSION_ID_BYTES = 16;
const SESSION_ID_MIN_BYTES = 8;
const SESSION_ID_MAX_BYTES = 32;
const DEFAULT_SESSION_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_SESSION_GRACE_MS = 60 * 1000;
const SESSION_GRACE_CEILING_MS = 5000;
const SESSION_GRACE_WINDOW_DIVISOR = 6;
const BASE64_PLUS = /\+/g;
const BASE64_SLASH = /\//g;
const BASE64_PADDING = /=+$/g;

export async function getDeviceId({
  projectId,
  ip,
  ua,
  salts,
  overrideDeviceId,
  eventTimeMs,
  sessionBuffer,
  sessionTimeoutMs,
  logger,
}: {
  projectId: string;
  ip: string;
  ua: string | undefined;
  salts: { current: string; previous: string };
  overrideDeviceId?: string;
  /** Event timestamp (ms). Used to decide whether an existing session is
   *  still within its idle window. Defaults to `Date.now()`. */
  eventTimeMs?: number;
  sessionBuffer: SessionBufferReader;
  /** The idle window, resolved from config by the caller. */
  sessionTimeoutMs: number;
  logger: SessionResolutionLogger;
}): Promise<DeviceIdResult> {
  if (overrideDeviceId) {
    // A caller-supplied device id is stable (no salt rotation), so it's the only
    // candidate — resolve it through the same path as internal ids.
    return await getInfoFromSession({
      projectId,
      deviceIds: [overrideDeviceId],
      eventTimeMs: eventTimeMs ?? Date.now(),
      sessionBuffer,
      sessionTimeoutMs,
      logger,
    });
  }

  if (!ua) {
    return { deviceId: '', sessionId: '' };
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

  return await getInfoFromSession({
    projectId,
    deviceIds: [currentDeviceId, previousDeviceId],
    eventTimeMs: eventTimeMs ?? Date.now(),
    sessionBuffer,
    sessionTimeoutMs,
    logger,
  });
}

/**
 * Returns true when an existing session is recent enough that the incoming
 * event should EXTEND it rather than start a new session.
 *
 * Critical: blobs have no Redis TTL (so the reaper can always find
 * them), which means an existing session blob may linger past its idle
 * window. We must NOT blindly reuse `existing.id` — if we did, the worker's
 * boundary detection would open a "new" session with the same id as the
 * closed one, breaking the id-based extension check in createSessionEnd.
 */
function withinIdleWindow(
  session: IClickhouseSession,
  eventTimeMs: number,
  sessionTimeoutMs: number
): boolean {
  const lastEventMs = convertClickhouseDateToJs(session.ended_at).getTime();
  return eventTimeMs - lastEventMs < sessionTimeoutMs;
}

async function getInfoFromSession({
  projectId,
  deviceIds,
  eventTimeMs,
  sessionBuffer,
  sessionTimeoutMs,
  logger,
}: {
  projectId: string;
  /** Candidate device ids in priority order (e.g. [current, previous] salt
   *  windows, or just [override]). Deduped; the first is canonical. */
  deviceIds: string[];
  eventTimeMs: number;
  sessionBuffer: SessionBufferReader;
  sessionTimeoutMs: number;
  logger: SessionResolutionLogger;
}): Promise<DeviceIdResult> {
  const candidates = [...new Set(deviceIds.filter(Boolean))];
  const primary = candidates[0] ?? '';

  try {
    // Reading the live blob is the source of truth for an active session — it's
    // what keeps a visit on one id across page reloads and salt rotation. Don't
    // drop this read to "save" a lookup or sessions split at the bucket boundary.
    const sessions = await Promise.all(
      candidates.map((deviceId) =>
        sessionBuffer.getExistingSession({ projectId, deviceId })
      )
    );

    for (const [index, session] of sessions.entries()) {
      if (session && withinIdleWindow(session, eventTimeMs, sessionTimeoutMs)) {
        return { deviceId: candidates[index]!, sessionId: session.id };
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Error resolving session for device id');
  }

  return {
    deviceId: primary,
    // Deterministic id for the first event of a session and to bridge the window
    // before the worker persists the blob (API resolves synchronously, worker
    // writes async — same bucket → same id, so they agree).
    //
    // The bucket window MUST track the idle timeout: a gap > the window has to
    // land in a new bucket so a boundary mints a *fresh* id. If it didn't (e.g.
    // a hardcoded 30min while the idle timeout is shorter), the worker would
    // reopen the just-closed id and its session_end would be skipped. Grace must
    // stay < window or getSessionId throws.
    sessionId: getSessionId({
      projectId,
      deviceId: primary,
      eventMs: eventTimeMs,
      graceMs: Math.min(
        SESSION_GRACE_CEILING_MS,
        Math.floor(sessionTimeoutMs / SESSION_GRACE_WINDOW_DIVISOR)
      ),
      windowMs: sessionTimeoutMs,
    }),
  };
}

/**
 * Deterministic session id for (projectId, deviceId) within a time window,
 * with a grace period at the *start* of each window to avoid boundary splits.
 *
 * - windowMs: `DEFAULT_SESSION_WINDOW_MS` (5 minutes) by default
 * - graceMs: `DEFAULT_SESSION_GRACE_MS` (1 minute) by default (events in the
 *   grace period at the start of a bucket map to the previous bucket)
 * - Output: base64url, 128-bit (16 bytes) truncated from SHA-256
 */
function getSessionId(params: {
  projectId: string;
  deviceId: string;
  eventMs?: number; // use event timestamp; defaults to Date.now()
  windowMs?: number; // default 5 min
  graceMs?: number; // default 1 min
  bytes?: number; // default 16 (128-bit). You can set 24 or 32 for longer ids.
}): string {
  const {
    projectId,
    deviceId,
    eventMs = Date.now(),
    windowMs = DEFAULT_SESSION_WINDOW_MS,
    graceMs = DEFAULT_SESSION_GRACE_MS,
    bytes = SESSION_ID_BYTES,
  } = params;

  if (!projectId) {
    throw new Error('projectId is required');
  }
  if (!deviceId) {
    throw new Error('deviceId is required');
  }
  if (windowMs <= 0) {
    throw new Error('windowMs must be > 0');
  }
  if (graceMs < 0 || graceMs >= windowMs) {
    throw new Error('graceMs must be >= 0 and < windowMs');
  }
  if (bytes < SESSION_ID_MIN_BYTES || bytes > SESSION_ID_MAX_BYTES) {
    throw new Error('bytes must be between 8 and 32');
  }

  const bucket = Math.floor(eventMs / windowMs);
  const offset = eventMs - bucket * windowMs;

  // Grace at the start of the bucket: stick to the previous bucket.
  const chosenBucket = offset < graceMs ? bucket - 1 : bucket;

  const input = `sess:v1:${projectId}:${deviceId}:${chosenBucket}`;

  const digest = crypto.createHash('sha256').update(input).digest();
  const truncated = digest.subarray(0, bytes);

  // base64url
  return truncated
    .toString('base64')
    .replace(BASE64_PLUS, '-')
    .replace(BASE64_SLASH, '_')
    .replace(BASE64_PADDING, '');
}
