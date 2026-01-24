import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';

export function useCohorts(params: { projectId: string; includeCount?: boolean }, options?: { enabled?: boolean }) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.cohort.list.queryOptions(params, {
      enabled:
        !!params.projectId && typeof options?.enabled !== 'undefined'
          ? options.enabled
          : true,
    }),
  );
  return query.data ?? [];
}
