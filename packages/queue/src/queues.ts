import { Queue } from 'bullmq';

import type { IServiceEvent } from '@openpanel/db';
import { getRedisQueue } from '@openpanel/redis';
import type { PostEventPayload } from '@openpanel/sdk';

export interface EventsQueuePayloadIncomingEvent {
  type: 'incomingEvent';
  payload: {
    projectId: string;
    event: PostEventPayload;
    geo: {
      country: string | undefined;
      city: string | undefined;
      region: string | undefined;
      longitude: number | undefined;
      latitude: number | undefined;
    };
    headers: {
      ua: string | undefined;
    };
    currentDeviceId: string;
    previousDeviceId: string;
    priority: boolean;
  };
}
export interface EventsQueuePayloadCreateEvent {
  type: 'createEvent';
  payload: Omit<IServiceEvent, 'id'>;
}
export interface EventsQueuePayloadCreateSessionEnd {
  type: 'createSessionEnd';
  payload: Pick<
    IServiceEvent,
    'deviceId' | 'sessionId' | 'profileId' | 'projectId'
  >;
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
export type CronQueuePayload =
  | CronQueuePayloadSalt
  | CronQueuePayloadFlushEvents
  | CronQueuePayloadFlushProfiles;

export const eventsQueue = new Queue<EventsQueuePayload>('events', {
  connection: getRedisQueue(),
  defaultJobOptions: {
    removeOnComplete: 10,
  },
});

export const sessionsQueue = new Queue<SessionsQueuePayload>('sessions', {
  connection: getRedisQueue(),
  defaultJobOptions: {
    removeOnComplete: 10,
  },
});

export const cronQueue = new Queue<CronQueuePayload>('cron', {
  connection: getRedisQueue(),
  defaultJobOptions: {
    removeOnComplete: 10,
  },
});
