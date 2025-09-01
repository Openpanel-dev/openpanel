import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';

export function useEventProperties(params: any) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.chart.properties.queryOptions(params, {
      enabled: !!params.projectId,
    }),
  );
  return query.data ?? [];
}
