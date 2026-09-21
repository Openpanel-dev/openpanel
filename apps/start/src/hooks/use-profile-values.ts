import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/integrations/trpc/react';

export function useProfileValues(projectId: string, property: string) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.profile.values.queryOptions({
      projectId,
      property,
    })
  );
  return query.data?.values ?? [];
}
