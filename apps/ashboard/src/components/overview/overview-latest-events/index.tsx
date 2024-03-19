import { getConversionEventNames } from '@openpanel/db';

import type { OverviewLatestEventsProps } from './overview-latest-events';
import OverviewLatestEvents from './overview-latest-events';

export default async function OverviewLatestEventsServer({
  projectId,
}: Omit<OverviewLatestEventsProps, 'conversions'>) {
  const eventNames = await getConversionEventNames(projectId);
  return (
    <OverviewLatestEvents
      projectId={projectId}
      conversions={eventNames.map((item) => item.name)}
    />
  );
}
