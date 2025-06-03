import type { Job } from 'bullmq';

import type {
  EventsQueuePayload,
  EventsQueuePayloadIncomingEvent,
} from '@openpanel/queue';

import { incomingEvent } from './events.incoming-event';

export async function eventsJob(job: Job<EventsQueuePayload>, token?: string) {
  return await incomingEvent(
    job as Job<EventsQueuePayloadIncomingEvent>,
    token,
  );
}
