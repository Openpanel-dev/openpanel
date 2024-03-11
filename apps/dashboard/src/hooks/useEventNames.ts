import { api } from '@/app/_trpc/client';

export function useEventNames(projectId: string) {
  const query = api.chart.events.useQuery({
    projectId: projectId,
  });

  return query.data ?? [];
}
