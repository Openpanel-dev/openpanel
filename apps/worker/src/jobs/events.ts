import type { Job } from 'bullmq';

import { createEvent } from '@mixan/db';
import type {
  EventsQueuePayload,
  EventsQueuePayloadCreateSessionEnd,
} from '@mixan/queue/src/queues';

import { createSessionEnd } from './events.create-session-end';

export async function eventsJob(job: Job<EventsQueuePayload>) {
  switch (job.data.type) {
    case 'createEvent': {
      if (job.attemptsStarted > 1 && job.data.payload.duration < 0) {
        job.data.payload.duration = 0;
      }
      return await createEvent(job.data.payload);
    }
  }
  switch (job.data.type) {
    case 'createSessionEnd': {
      return await createSessionEnd(
        job as Job<EventsQueuePayloadCreateSessionEnd>
      );
    }
  }
}
