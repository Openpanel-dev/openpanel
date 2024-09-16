import { api } from '@/trpc/client';

export function usePropertyValues(
  params: Parameters<typeof api.chart.values.useQuery>[0],
) {
  const query = api.chart.values.useQuery(params, {
    staleTime: 1000 * 60 * 10,
  });

  return query.data?.values ?? [];
}
