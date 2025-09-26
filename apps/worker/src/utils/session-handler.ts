import { getTime } from '@openpanel/common';
import { type IServiceCreateEventPayload, createEvent } from '@openpanel/db';
import {
  type EventsQueuePayloadCreateSessionEnd,
  sessionsQueue,
} from '@openpanel/queue';
import type { Job } from 'bullmq';
import { logger } from './logger';

export const SESSION_TIMEOUT = 1000 * 60 * 30;

const getSessionEndJobId = (projectId: string, deviceId: string) =>
  `sessionEnd:${projectId}:${deviceId}`;

export async function createSessionStart({
  payload,
}: {
  payload: IServiceCreateEventPayload;
}) {
  return createEvent({
    ...payload,
    name: 'session_start',
    createdAt: new Date(getTime(payload.createdAt) - 100),
  });
}

export async function createSessionEndJob({
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
    },
  );
}

export async function getSessionEnd({
  projectId,
  currentDeviceId,
  previousDeviceId,
  profileId,
}: {
  projectId: string;
  currentDeviceId: string;
  previousDeviceId: string;
  profileId: string;
}) {
  const sessionEnd = await getSessionEndJob({
    projectId,
    currentDeviceId,
    previousDeviceId,
  });

  if (sessionEnd) {
    // Hack: if session end job just got created, we want to give it a chance to complete
    // So the order is correct
    if (sessionEnd.job.timestamp > Date.now() - 50) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const existingSessionIsAnonymous =
      sessionEnd.job.data.payload.profileId ===
      sessionEnd.job.data.payload.deviceId;

    const eventIsIdentified =
      profileId && sessionEnd.job.data.payload.profileId !== profileId;

    if (existingSessionIsAnonymous && eventIsIdentified) {
      await sessionEnd.job.updateData({
        ...sessionEnd.job.data,
        payload: {
          ...sessionEnd.job.data.payload,
          profileId,
        },
      });
    }

    await sessionEnd.job.changeDelay(SESSION_TIMEOUT);
    return sessionEnd.job.data.payload;
  }

  return null;
}

export async function getSessionEndJob(args: {
  projectId: string;
  currentDeviceId: string;
  previousDeviceId: string;
  retryCount?: number;
}): Promise<{
  deviceId: string;
  job: Job<EventsQueuePayloadCreateSessionEnd>;
} | null> {
  const { retryCount = 0 } = args;

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
    if (state !== 'delayed') {
      logger.info(`[session-handler] Session end job is in "${state}" state`, {
        state,
        retryCount,
        jobTimestamp: new Date(job.timestamp).toISOString(),
        jobDelta: Date.now() - job.timestamp,
        jobId: job.id,
        reqId: job.data.payload.properties?.__reqId ?? 'unknown',
        payload: job.data.payload,
      });
    }

    if (state === 'delayed' || state === 'waiting') {
      return { deviceId, job };
    }

    if (state === 'active') {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return getSessionEndJob({
        ...args,
        retryCount: retryCount + 1,
      });
    }

    if (state === 'completed') {
      await job.remove();
    }

    return null;
  }

  // Check current device job
  const currentJob = await sessionsQueue.getJob(
    getSessionEndJobId(args.projectId, args.currentDeviceId),
  );
  if (currentJob) {
    return await handleJobStates(currentJob, args.currentDeviceId);
  }

  // Check previous device job
  const previousJob = await sessionsQueue.getJob(
    getSessionEndJobId(args.projectId, args.previousDeviceId),
  );
  if (previousJob) {
    return await handleJobStates(previousJob, args.previousDeviceId);
  }

  // Create session
  return null;
}
