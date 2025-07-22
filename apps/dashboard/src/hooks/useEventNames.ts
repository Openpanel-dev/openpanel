import { api } from '@/trpc/client';

export function useEventNames(projectId: string) {
  const query = api.chart.events.useQuery({
    projectId,
  });

  return query.data ?? [];
}
