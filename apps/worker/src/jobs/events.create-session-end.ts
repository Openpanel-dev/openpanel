import type { Job } from 'bullmq';

import { getTime } from '@openpanel/common';
import { createEvent, getEvents } from '@openpanel/db';
import type { EventsQueuePayloadCreateSessionEnd } from '@openpanel/queue/src/queues';

export async function createSessionEnd(
  job: Job<EventsQueuePayloadCreateSessionEnd>
) {
  const payload = job.data.payload;

  const sql = `
  SELECT * FROM events 
  WHERE 
    device_id = '${payload.deviceId}' 
    AND created_at >= (
      SELECT created_at 
      FROM events
      WHERE 
        device_id = '${payload.deviceId}' 
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
        `DeviceId: ${event.deviceId}`,
        `Profile: ${event.profileId}`,
        `Path: ${event.path}`,
      ].join('\n')
    );
  });

  const sessionDuration = events.reduce((acc, event) => {
    return acc + event.duration;
  }, 0);

  const sessionStart = events.find((event) => event.name === 'session_start');
  const lastEvent = events[0];
  const screenViews = events.filter((event) => event.name === 'screen_view');

  if (!sessionStart) {
    throw new Error('Failed to find a session_start');
  }

  if (!lastEvent) {
    throw new Error('No last event found');
  }

  return createEvent({
    ...sessionStart,
    properties: {
      ...sessionStart.properties,
      __bounce: screenViews.length <= 1,
    },
    name: 'session_end',
    duration: sessionDuration,
    path: lastEvent.path,
    createdAt: new Date(getTime(lastEvent?.createdAt) + 100),
  });
}
