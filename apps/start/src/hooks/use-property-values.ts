import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';

export function usePropertyValues(params: any) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.chart.values.queryOptions(params, {
      enabled: !!params.projectId,
    }),
  );
  return query.data?.values ?? [];
}
