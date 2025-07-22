import { api } from '@/trpc/client';

export function useEventNames(projectId: string) {
  const query = api.chart.events.useQuery({
    projectId,
  });

  const events = query.data ?? [];
  
  // Add negative versions of events for filtering
  const eventsWithNegatives = [
    ...events,
    ...events.map(event => ({
      ...event,
      name: `!${event.name}`,
      count: event.count,
      meta: event.meta,
    }))
  ];

  return eventsWithNegatives;
}
