import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';

export function usePropertyValues(params: any) {
  const trpc = useTRPC();
  const { enabled = true, ...input } = params;
  const query = useQuery(
    trpc.chart.values.queryOptions(input, {
      enabled: enabled !== false && !!input.projectId,
      // A filter-value dropdown doesn't need real-time data. Without a
      // staleTime, React Query refetches on every window focus/remount — a tab
      // left open on a filter re-fires the (slow, un-MV'd) values query and
      // hammers ClickHouse. Cache 1h + no focus refetch.
      staleTime: 60 * 60 * 1000,
      refetchOnWindowFocus: false,
    }),
  );
  return query.data?.values ?? [];
}
