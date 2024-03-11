import { api } from '@/app/_trpc/client';

export function useEventProperties(projectId: string, event?: string) {
  const query = api.chart.properties.useQuery({
    projectId: projectId,
    event,
  });

  return query.data ?? [];
}
