import { Queue } from 'bullmq';

import type { BatchPayload } from '@mixan/types';

import { connection } from './connection';

export interface EventsQueuePayload {
  projectId: string;
  payload: BatchPayload[];
}

export const eventsQueue = new Queue<EventsQueuePayload>('events', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 10,
  },
});
