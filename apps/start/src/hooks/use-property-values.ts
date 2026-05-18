import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';

export function usePropertyValues(params: any) {
  const trpc = useTRPC();
  const { enabled = true, ...input } = params;
  const query = useQuery(
    trpc.chart.values.queryOptions(input, {
      enabled: enabled !== false && !!input.projectId,
    }),
  );
  return query.data?.values ?? [];
}
