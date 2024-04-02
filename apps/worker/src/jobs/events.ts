import type { Job } from 'bullmq';
import { escape } from 'sqlstring';

import { chQuery, createEvent, db } from '@openpanel/db';
import type {
  EventsQueuePayload,
  EventsQueuePayloadCreateSessionEnd,
  EventsQueuePayloadIncomingEvent,
} from '@openpanel/queue/src/queues';

import { createSessionEnd } from './events.create-session-end';
import { incomingEvent } from './events.incoming-event';

export async function eventsJob(job: Job<EventsQueuePayload>) {
  switch (job.data.type) {
    case 'incomingEvent': {
      return await incomingEvent(job as Job<EventsQueuePayloadIncomingEvent>);
    }
    case 'createEvent': {
      if (job.attemptsStarted > 1 && job.data.payload.duration < 0) {
        job.data.payload.duration = 0;
      }
      const createdEvent = await createEvent(job.data.payload);
      try {
        await updateEventsCount(job.data.payload.projectId);
      } catch (e) {
        if (e instanceof Error) {
          job.log(`Failed to update events count: ${e.message}`);
        } else {
          job.log(`Failed to update events count: Unknown issue`);
        }
      }
      return createdEvent;
    }
    case 'createSessionEnd': {
      return await createSessionEnd(
        job as Job<EventsQueuePayloadCreateSessionEnd>
      );
    }
  }
}

async function updateEventsCount(projectId: string) {
  const res = await chQuery<{ count: number }>(
    `SELECT count(*) as count FROM events WHERE project_id = ${escape(projectId)}`
  );
  const count = res[0]?.count;
  if (count) {
    await db.project.update({
      where: {
        id: projectId,
      },
      data: {
        eventsCount: count,
      },
    });
  }
}
