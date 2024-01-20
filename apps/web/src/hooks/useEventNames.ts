import { api } from '@/app/_trpc/client';

export function useEventNames(projectId: string) {
  const filterEventsQuery = api.chart.events.useQuery({
    projectId: projectId,
  });

  return (filterEventsQuery.data ?? []).map((item) => ({
    value: item.name,
    label: item.name,
  }));
}
