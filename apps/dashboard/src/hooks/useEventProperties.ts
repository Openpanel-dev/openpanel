import { api } from '@/trpc/client';

export function useEventProperties(
  params: Parameters<typeof api.chart.properties.useQuery>[0]
) {
  const query = api.chart.properties.useQuery(params);

  return query.data ?? [];
}
