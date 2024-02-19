import { api } from '@/app/_trpc/client';

export function useEventValues(
  projectId: string,
  event: string,
  property: string
) {
  const query = api.chart.values.useQuery({
    projectId: projectId,
    event,
    property,
  });

  return query.data?.values ?? [];
}
