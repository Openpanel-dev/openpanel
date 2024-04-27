import { ChartSwitchShortcut } from '@/components/report/chart';

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
    <div className="card mb-8 p-4">
      <ChartSwitchShortcut
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
    </div>
  );
}
