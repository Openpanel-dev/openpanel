import { api } from '@/trpc/client';

export function useEventValues(
  params: Parameters<typeof api.chart.values.useQuery>[0]
) {
  const query = api.chart.values.useQuery(params);
  return query.data?.values ?? [];
}
