import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';

export function useEventNames(params: any) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.chart.events.queryOptions(params, {
      enabled: !!params.projectId,
    }),
  );
  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
