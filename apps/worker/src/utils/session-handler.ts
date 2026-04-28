import type { IServiceCreateEventPayload } from '@openpanel/db';
import { sessionsQueue } from '@openpanel/queue';
import { LRUCache } from '@openpanel/redis';
import { logger as baseLogger } from '@/utils/logger';

export const SESSION_TIMEOUT = 1000 * 60 * 30;

const CHANGE_DELAY_THROTTLE_MS = process.env.CHANGE_DELAY_THROTTLE_MS
  ? Number.parseInt(process.env.CHANGE_DELAY_THROTTLE_MS, 10)
  : 60_000; // 1 minute

const CHANGE_DELAY_THROTTLE_MAP = new LRUCache<string, number>({
  max: 100_000,
  ttl: SESSION_TIMEOUT,
});

export async function extendSessionEndJob({
  projectId,
  deviceId,
}: {
  projectId: string;
  deviceId: string;
}) {
  const last = CHANGE_DELAY_THROTTLE_MAP.get(`${projectId}:${deviceId}`) ?? 0;
  const isThrottled = Date.now() - last < CHANGE_DELAY_THROTTLE_MS;

  if (isThrottled) {
    return;
  }

  const jobId = getSessionEndJobId(projectId, deviceId);
  const job = await sessionsQueue.getJob(jobId);

  if (!job) {
    return;
  }

  const state = await job.getState();
  if (state !== 'delayed') {
    baseLogger.warn(
      { jobId, state },
      'Session end job is not in delayed state, skipping extend',
    );
    return;
  }

  // Narrow TOCTOU window: state could flip from delayed → waiting between
  // the getState() check above and this call.
  try {
    await job.changeDelay(SESSION_TIMEOUT);
    CHANGE_DELAY_THROTTLE_MAP.set(`${projectId}:${deviceId}`, Date.now());
  } catch (error) {
    baseLogger.warn(
      { err: error, jobId },
      'Session end job moved out of delayed state during extend',
    );
  }
}

const getSessionEndJobId = (projectId: string, deviceId: string) =>
  `sessionEnd:${projectId}:${deviceId}`;

export function createSessionEndJob({
  payload,
}: {
  payload: IServiceCreateEventPayload;
}) {
  return sessionsQueue.add(
    'session',
    {
      type: 'createSessionEnd',
      payload,
    },
    {
      delay: SESSION_TIMEOUT,
      jobId: getSessionEndJobId(payload.projectId, payload.deviceId),
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 200,
      },
    }
  );
}
