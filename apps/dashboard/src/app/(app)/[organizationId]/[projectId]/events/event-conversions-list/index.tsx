import { Widget } from '@/components/widget';

import { db, getEvents } from '@openpanel/db';

import { EventConversionsList } from './event-conversions-list';

interface Props {
  projectId: string;
}

export default async function EventConversionsListServer({ projectId }: Props) {
  const conversions = await db.eventMeta.findMany({
    where: {
      project_id: projectId,
      conversion: true,
    },
  });

  if (conversions.length === 0) {
    return null;
  }

  const events = await getEvents(
    `SELECT * FROM events WHERE project_id = '${projectId}' AND name IN (${conversions.map((c) => `'${c.name}'`).join(', ')}) ORDER BY created_at DESC LIMIT 20;`,
    {
      profile: true,
      meta: true,
    }
  );

  return <EventConversionsList data={events} />;
}
