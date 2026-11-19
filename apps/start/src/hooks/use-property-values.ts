import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterInputs } from '@/trpc/client';

const PROPERTY_VALUES_STALE_TIME_MS = 60 * 60 * 1000;

export function usePropertyValues(
  params: RouterInputs['chart']['values'] & { enabled?: boolean }
) {
  const trpc = useTRPC();
  const { enabled = true, ...input } = params;
  const query = useQuery(
    trpc.chart.values.queryOptions(input, {
      enabled: enabled !== false && !!input.projectId,
      // A filter-value dropdown doesn't need real-time data. Without a
      // staleTime, React Query refetches on every window focus/remount — a tab
      // left open on a filter re-fires the (slow, un-MV'd) values query and
      // hammers ClickHouse. Cache 1h + no focus refetch.
      staleTime: PROPERTY_VALUES_STALE_TIME_MS,
      refetchOnWindowFocus: false,
    })
  );
  return query.data?.values ?? [];
}
