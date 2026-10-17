import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/integrations/trpc/react';

export function useCustomEvents(projectId: string) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.customEvent.list.queryOptions(
      { projectId },
      { enabled: !!projectId, staleTime: 1000 * 60 * 10 }
    )
  );
  return query.data ?? [];
}
