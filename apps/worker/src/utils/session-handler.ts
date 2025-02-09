import { getTime } from '@openpanel/common';
import { type IServiceCreateEventPayload, createEvent } from '@openpanel/db';
import {
  type EventsQueuePayloadCreateSessionEnd,
  sessionsQueue,
  sessionsQueueEvents,
} from '@openpanel/queue';
import type { Job } from 'bullmq';
import { v4 as uuid } from 'uuid';

export const SESSION_TIMEOUT = 1000 * 60 * 30;

const getSessionEndJobId = (projectId: string, deviceId: string) =>
  `sessionEnd:${projectId}:${deviceId}`;

export async function createSessionEnd({
  payload,
}: {
  payload: IServiceCreateEventPayload;
}) {
  await sessionsQueue.add(
    'session',
    {
      type: 'createSessionEnd',
      payload,
    },
    {
      delay: SESSION_TIMEOUT,
      jobId: getSessionEndJobId(payload.projectId, payload.deviceId),
    },
  );

  await createEvent({
    ...payload,
    name: 'session_start',
    createdAt: new Date(getTime(payload.createdAt) - 100),
  });
}

export async function getSessionEnd({
  projectId,
  currentDeviceId,
  previousDeviceId,
  profileId,
  priority,
}: {
  projectId: string;
  currentDeviceId: string;
  previousDeviceId: string;
  profileId: string;
  priority: boolean;
}) {
  const sessionEnd = await getSessionEndJob({
    priority,
    projectId,
    currentDeviceId,
    previousDeviceId,
  });

  const sessionEndPayload =
    sessionEnd?.job.data.payload ||
    ({
      sessionId: uuid(),
      deviceId: currentDeviceId,
      profileId,
      projectId,
    } satisfies EventsQueuePayloadCreateSessionEnd['payload']);

  if (sessionEnd) {
    // If for some reason we have a session end job that is not a createSessionEnd job
    if (sessionEnd.job.data.type !== 'createSessionEnd') {
      throw new Error('Invalid session end job');
    }

    await sessionEnd.job.changeDelay(SESSION_TIMEOUT);
  }

  return {
    payload: sessionEndPayload,
    notFound: !sessionEnd,
  };
}

export async function getSessionEndJob(args: {
  projectId: string;
  currentDeviceId: string;
  previousDeviceId: string;
  priority: boolean;
  retryCount?: number;
}): Promise<{
  deviceId: string;
  job: Job<EventsQueuePayloadCreateSessionEnd>;
} | null> {
  const { priority, retryCount = 0 } = args;

  if (retryCount >= 6) {
    throw new Error('Failed to get session end');
  }

  async function handleJobStates(
    job: Job<EventsQueuePayloadCreateSessionEnd>,
    deviceId: string,
  ): Promise<{
    deviceId: string;
    job: Job<EventsQueuePayloadCreateSessionEnd>;
  } | null> {
    const state = await job.getState();
    if (state === 'delayed') {
      return { deviceId, job };
    }

    if (state === 'failed') {
      await job.retry();
      await job.waitUntilFinished(sessionsQueueEvents, 1000 * 10);
      return getSessionEndJob({
        ...args,
        priority,
        retryCount,
      });
    }

    if (state === 'completed') {
      await job.remove();
      return getSessionEndJob({
        ...args,
        priority,
        retryCount,
      });
    }

    if (state === 'active' || state === 'waiting') {
      await job.waitUntilFinished(sessionsQueueEvents, 1000 * 10);
      return getSessionEndJob({
        ...args,
        priority,
        retryCount,
      });
    }

    // Shady state here, just remove it and retry
    if (state === 'unknown') {
      await job.remove();
      return getSessionEndJob({
        ...args,
        priority,
        retryCount,
      });
    }

    return null;
  }

  // Check current device job
  const currentJob = await sessionsQueue.getJob(
    getSessionEndJobId(args.projectId, args.currentDeviceId),
  );
  if (currentJob) {
    const res = await handleJobStates(currentJob, args.currentDeviceId);
    if (res) return res;
  }

  // Check previous device job
  const previousJob = await sessionsQueue.getJob(
    getSessionEndJobId(args.projectId, args.previousDeviceId),
  );
  if (previousJob) {
    const res = await handleJobStates(previousJob, args.previousDeviceId);
    if (res) return res;
  }

  // If no job found and not priority, retry
  if (!priority) {
    const backoffDelay = 50 * 2 ** retryCount;
    await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    return getSessionEndJob({ ...args, priority, retryCount: retryCount + 1 });
  }

  // Create session
  return null;
}
