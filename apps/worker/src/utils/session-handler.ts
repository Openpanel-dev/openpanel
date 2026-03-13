import type { IServiceCreateEventPayload } from '@openpanel/db';
import { sessionsQueue } from '@openpanel/queue';

export const SESSION_TIMEOUT = 1000 * 60 * 30;

const CHANGE_DELAY_THROTTLE_MS = process.env.CHANGE_DELAY_THROTTLE_MS
  ? Number.parseInt(process.env.CHANGE_DELAY_THROTTLE_MS, 10)
  : 60_000; // 1 minute

const CHANGE_DELAY_THROTTLE_MAP = new Map<string, number>();

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

  await job.changeDelay(SESSION_TIMEOUT);
  CHANGE_DELAY_THROTTLE_MAP.set(`${projectId}:${deviceId}`, Date.now());
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
