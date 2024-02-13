import type { Job } from 'bullmq';

import { getTime, toISOString } from '@mixan/common';
import { createEvent, getEvents } from '@mixan/db';
import type { EventsQueuePayloadCreateSessionEnd } from '@mixan/queue/src/queues';

export async function createSessionEnd(
  job: Job<EventsQueuePayloadCreateSessionEnd>
) {
  const payload = job.data.payload;

  const sql = `
  SELECT * FROM events 
  WHERE 
    profile_id = '${payload.profileId}' 
    AND created_at >= (
      SELECT created_at 
      FROM events
      WHERE 
        profile_id = '${payload.profileId}' 
        AND name = 'session_start'
      ORDER BY created_at DESC
      LIMIT 1
    ) 
  ORDER BY created_at DESC
`;
  job.log(sql);
  const events = await getEvents(sql);

  events.map((event, index) => {
    job.log(
      [
        `Index: ${index}`,
        `Event: ${event.name}`,
        `Created: ${event.createdAt.toISOString()}`,
        `Profile: ${event.profileId}`,
        `Path: ${event.path}`,
      ].join('\n')
    );
  });

  const sessionDuration = events.reduce((acc, event) => {
    return acc + event.duration;
  }, 0);

  let lastScreenView = events.find((event) => event.name === 'screen_view');
  const sessionStart = events.find((event) => event.name === 'session_start');
  const lastEvent = events[0];
  const screenViews = events.filter((event) => event.name === 'screen_view');

  if (!sessionStart) {
    throw new Error('Failed to find a session_start');
  }

  if (!lastScreenView && lastEvent) {
    lastScreenView = lastEvent;
    job.log(
      `No screen_view found, using last event ${
        lastEvent.name
      } (${lastEvent.createdAt.toISOString()})`
    );
  }

  if (!lastScreenView) {
    job.log(
      'No screen_view found, creating session_end event with session_start path'
    );
    throw new Error('No screen_view found');
  }

  return createEvent({
    ...sessionStart,
    properties: {
      _bounce: screenViews.length === 1,
    },
    name: 'session_end',
    duration: sessionDuration,
    path: lastScreenView?.path ?? sessionStart.path,
    createdAt: toISOString(getTime(lastScreenView.createdAt) + 100),
  });
}
