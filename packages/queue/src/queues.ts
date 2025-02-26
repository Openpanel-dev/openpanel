import { Queue, QueueEvents } from 'bullmq';

import type { IServiceEvent, Notification } from '@openpanel/db';
import { getRedisQueue } from '@openpanel/redis';
import type { TrackPayload } from '@openpanel/sdk';

export interface EventsQueuePayloadIncomingEvent {
  type: 'incomingEvent';
  payload: {
    projectId: string;
    event: TrackPayload & {
      timestamp: string;
      isTimestampFromThePast: boolean;
    };
    geo: {
      country: string | undefined;
      city: string | undefined;
      region: string | undefined;
      longitude: number | undefined;
      latitude: number | undefined;
    };
    headers: Record<string, string | undefined>;
    currentDeviceId: string;
    previousDeviceId: string;
    priority: boolean;
  };
}
export interface EventsQueuePayloadCreateEvent {
  type: 'createEvent';
  payload: Omit<IServiceEvent, 'id'>;
}
type SessionEndRequired = 'sessionId' | 'deviceId' | 'profileId' | 'projectId';
export interface EventsQueuePayloadCreateSessionEnd {
  type: 'createSessionEnd';
  payload: Partial<Omit<IServiceEvent, SessionEndRequired>> &
    Pick<IServiceEvent, SessionEndRequired>;
}

// TODO: Rename `EventsQueuePayloadCreateSessionEnd`
export type SessionsQueuePayload = EventsQueuePayloadCreateSessionEnd;

export type EventsQueuePayload =
  | EventsQueuePayloadCreateEvent
  | EventsQueuePayloadCreateSessionEnd
  | EventsQueuePayloadIncomingEvent;

export type CronQueuePayloadSalt = {
  type: 'salt';
  payload: undefined;
};
export type CronQueuePayloadFlushEvents = {
  type: 'flushEvents';
  payload: undefined;
};
export type CronQueuePayloadFlushProfiles = {
  type: 'flushProfiles';
  payload: undefined;
};
export type CronQueuePayloadPing = {
  type: 'ping';
  payload: undefined;
};
export type CronQueuePayloadProject = {
  type: 'deleteProjects';
  payload: undefined;
};
export type CronQueuePayload =
  | CronQueuePayloadSalt
  | CronQueuePayloadFlushEvents
  | CronQueuePayloadFlushProfiles
  | CronQueuePayloadPing
  | CronQueuePayloadProject;

export type CronQueueType = CronQueuePayload['type'];

export const eventsQueue = new Queue<EventsQueuePayload>('events', {
  connection: getRedisQueue(),
  defaultJobOptions: {
    removeOnComplete: 10,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});

export const sessionsQueue = new Queue<SessionsQueuePayload>('sessions', {
  connection: getRedisQueue(),
  defaultJobOptions: {
    removeOnComplete: 10,
  },
});
export const sessionsQueueEvents = new QueueEvents('sessions', {
  connection: getRedisQueue(),
});

export const cronQueue = new Queue<CronQueuePayload>('cron', {
  connection: getRedisQueue(),
  defaultJobOptions: {
    removeOnComplete: 10,
  },
});

export type NotificationQueuePayload = {
  type: 'sendNotification';
  payload: {
    notification: Notification;
  };
};

export const notificationQueue = new Queue<NotificationQueuePayload>(
  'notification',
  {
    connection: getRedisQueue(),
    defaultJobOptions: {
      removeOnComplete: 10,
    },
  },
);
