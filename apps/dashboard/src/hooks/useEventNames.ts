import { api } from '@/trpc/client';

export function useEventNames(
  params: Parameters<typeof api.chart.events.useQuery>[0]
) {
  const query = api.chart.events.useQuery(params, {
    staleTime: 1000 * 60 * 10,
  });
  return query.data ?? [];
}
