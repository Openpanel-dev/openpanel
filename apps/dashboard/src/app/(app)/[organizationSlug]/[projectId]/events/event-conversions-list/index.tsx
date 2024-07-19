import withLoadingWidget from '@/hocs/with-loading-widget';
import { escape } from 'sqlstring';

import { db, getEvents, TABLE_NAMES } from '@openpanel/db';

import { EventConversionsList } from './event-conversions-list';

interface Props {
  projectId: string;
}

async function EventConversionsListServer({ projectId }: Props) {
  const conversions = await db.eventMeta.findMany({
    where: {
      projectId,
      conversion: true,
    },
  });

  if (conversions.length === 0) {
    return null;
  }

  const events = await getEvents(
    `SELECT * FROM ${TABLE_NAMES.events} WHERE project_id = ${escape(projectId)} AND name IN (${conversions.map((c) => escape(c.name)).join(', ')}) ORDER BY created_at DESC LIMIT 20;`,
    {
      profile: true,
      meta: true,
    }
  );

  return <EventConversionsList data={events} />;
}

export default withLoadingWidget(EventConversionsListServer);
