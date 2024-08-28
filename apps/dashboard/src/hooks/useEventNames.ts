import { api } from '@/trpc/client';

export function useEventNames(
  params: Parameters<typeof api.chart.events.useQuery>[0]
) {
  const query = api.chart.events.useQuery(params);
  return query.data ?? [];
}
