import { ChartSwitchShortcut } from '@/components/report/chart';

import type { IChartEvent } from '@mixan/validation';

interface Props {
  projectId: string;
  events?: string[];
  filters?: any[];
}

export function EventChart({ projectId, filters, events }: Props) {
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
    <div className="card p-4 mb-8">
      <ChartSwitchShortcut
        projectId={projectId}
        range="1m"
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
