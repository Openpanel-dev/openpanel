import { escape } from 'sqlstring';

import { getEvents } from '@openpanel/db';

import LiveEvents from './live-events';

type Props = {
  projectId: string;
  limit?: number;
};
const RealtimeLiveEventsServer = async ({ projectId, limit = 30 }: Props) => {
  const events = await getEvents(
    `SELECT * FROM events WHERE project_id = ${escape(projectId)} ORDER BY created_at DESC LIMIT ${limit}`,
    {
      profile: true,
    }
  );
  return <LiveEvents events={events} projectId={projectId} limit={limit} />;
};

export default RealtimeLiveEventsServer;
