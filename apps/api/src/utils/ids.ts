import crypto from 'node:crypto';
import { generateDeviceId } from '@openpanel/common/server';
import { getSafeJson } from '@openpanel/json';
import { getRedisCache } from '@openpanel/redis';

export async function getDeviceId({
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
    return { deviceId: overrideDeviceId, sessionId: '' };
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
      'data'
    );
    multi.hget(
      `bull:sessions:sessionEnd:${projectId}:${previousDeviceId}`,
      'data'
    );
    const res = await multi.exec();
    if (res?.[0]?.[1]) {
      const data = getSafeJson<{ payload: { sessionId: string } }>(
        (res?.[0]?.[1] as string) ?? ''
      );
      if (data) {
        const sessionId = data.payload.sessionId;
        return { deviceId: currentDeviceId, sessionId };
      }
    }
    if (res?.[1]?.[1]) {
      const data = getSafeJson<{ payload: { sessionId: string } }>(
        (res?.[1]?.[1] as string) ?? ''
      );
      if (data) {
        const sessionId = data.payload.sessionId;
        return { deviceId: previousDeviceId, sessionId };
      }
    }
  } catch (error) {
    console.error('Error getting session end GET /track/device-id', error);
  }

  return {
    deviceId: currentDeviceId,
    sessionId: getSessionId({
      projectId,
      deviceId: currentDeviceId,
      graceMs: 5 * 1000,
      windowMs: 1000 * 60 * 30,
    }),
  };
}

/**
 * Deterministic session id for (projectId, deviceId) within a time window,
 * with a grace period at the *start* of each window to avoid boundary splits.
 *
 * - windowMs: 30 minutes by default
 * - graceMs: 1 minute by default (events in first minute of a bucket map to previous bucket)
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
    windowMs = 5 * 60 * 1000,
    graceMs = 60 * 1000,
    bytes = 16,
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
  if (bytes < 8 || bytes > 32) {
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
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
