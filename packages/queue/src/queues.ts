import { Queue } from 'bullmq';

import type { IServiceCreateEventPayload } from '@openpanel/db';
import type { PostEventPayload } from '@openpanel/sdk';

import { connection } from './connection';

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
      origin: string | undefined;
      ua: string | undefined;
    };
    currentDeviceId: string;
    previousDeviceId: string;
  };
}
export interface EventsQueuePayloadCreateEvent {
  type: 'createEvent';
  payload: Omit<IServiceCreateEventPayload, 'id'>;
}
export interface EventsQueuePayloadCreateSessionEnd {
  type: 'createSessionEnd';
  payload: Pick<IServiceCreateEventPayload, 'deviceId'>;
}
export type EventsQueuePayload =
  | EventsQueuePayloadCreateEvent
  | EventsQueuePayloadCreateSessionEnd
  | EventsQueuePayloadIncomingEvent;

export interface CronQueuePayload {
  type: 'salt';
  payload: undefined;
}

export const eventsQueue = new Queue<EventsQueuePayload>('events', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 10,
  },
});

export const cronQueue = new Queue<CronQueuePayload>('cron', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 10,
  },
});
