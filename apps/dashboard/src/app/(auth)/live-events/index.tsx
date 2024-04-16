import { getEvents, transformMinimalEvent } from '@openpanel/db';

import LiveEvents from './live-events';

const LiveEventsServer = async () => {
  const events = await getEvents(
    'SELECT * FROM events ORDER BY created_at DESC LIMIT 30'
  );
  return <LiveEvents events={events.map(transformMinimalEvent)} />;
};

export default LiveEventsServer;
