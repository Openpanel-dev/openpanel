import type { RouterInputs } from '@/trpc/client';
import { api } from '@/trpc/client';
import type { UseQueryOptions } from '@tanstack/react-query';

export function useEventProperties(
  params: RouterInputs['chart']['properties'],
  options?: UseQueryOptions<RouterInputs['chart']['properties']>,
): string[] {
  const query = api.chart.properties.useQuery(params, {
    staleTime: 1000 * 60 * 10,
    enabled: options?.enabled ?? true,
  });

  return query.data ?? [];
}
