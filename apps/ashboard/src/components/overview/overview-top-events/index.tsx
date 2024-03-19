import { getConversionEventNames } from '@openpanel/db';

import type { OverviewTopEventsProps } from './overview-top-events';
import OverviewTopEvents from './overview-top-events';

export default async function OverviewTopEventsServer({
  projectId,
}: Omit<OverviewTopEventsProps, 'conversions'>) {
  const eventNames = await getConversionEventNames(projectId);
  return (
    <OverviewTopEvents
      projectId={projectId}
      conversions={eventNames.map((item) => item.name)}
    />
  );
}
