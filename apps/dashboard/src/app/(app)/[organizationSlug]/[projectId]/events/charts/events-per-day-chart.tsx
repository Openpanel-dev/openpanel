import { ChartRootShortcut } from '@/components/report/chart';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';

import type { IChartEvent } from '@openpanel/validation';

interface Props {
  projectId: string;
  events?: string[];
  filters?: any[];
}

export function EventsPerDayChart({ projectId, filters, events }: Props) {
  const fallback: IChartEvent[] = [
    {
      id: 'A',
      name: '*',
      displayName: 'All events',
      segment: 'event',
      filters: filters ?? [],
    },
  ];

  return (
    <Widget className="w-full">
      <WidgetHead>
        <span className="title">Events per day</span>
      </WidgetHead>
      <WidgetBody>
        <ChartRootShortcut
          projectId={projectId}
          range="30d"
          chartType="histogram"
          events={
            events && events.length > 0
              ? events.map((name) => ({
                  id: name,
                  name,
                  displayName: name,
                  segment: 'event',
                  filters: filters ?? [],
                }))
              : fallback
          }
        />
      </WidgetBody>
    </Widget>
  );
}
