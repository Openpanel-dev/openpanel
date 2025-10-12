import { useTRPC } from '@/integrations/trpc/react';
import type { RouterInputs } from '@/trpc/client';
import { useQuery } from '@tanstack/react-query';

export function useEventProperties(
  params: RouterInputs['chart']['properties'],
  options?: {
    enabled: boolean;
  },
) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.chart.properties.queryOptions(params, {
      enabled:
        !!params.projectId && typeof options?.enabled !== 'undefined'
          ? options.enabled
          : true,
    }),
  );
  return query.data ?? [];
}
