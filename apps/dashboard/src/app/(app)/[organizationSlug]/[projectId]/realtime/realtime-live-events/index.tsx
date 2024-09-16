import { escape } from 'sqlstring';

import { TABLE_NAMES, getEvents } from '@openpanel/db';

import LiveEvents from './live-events';

type Props = {
  projectId: string;
  limit?: number;
};
const RealtimeLiveEventsServer = async ({ projectId, limit = 30 }: Props) => {
  const events = await getEvents(
    `SELECT * FROM ${TABLE_NAMES.events} WHERE created_at > now() - INTERVAL 2 HOUR AND project_id = ${escape(projectId)} ORDER BY created_at DESC LIMIT ${limit}`,
    {
      profile: true,
    },
  );
  return <LiveEvents events={events} projectId={projectId} limit={limit} />;
};

export default RealtimeLiveEventsServer;
