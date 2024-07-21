import { api } from '@/trpc/client';

export function useEventNames(projectId: string, options?: any) {
  const query = api.chart.events.useQuery({
    projectId: projectId,
    ...(options ? options : {}),
  });

  return query.data ?? [];
}
