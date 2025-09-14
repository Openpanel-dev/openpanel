import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';

export function useProfileValues(projectId: string, property: string) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.profile.values.queryOptions({
      projectId: projectId,
      property,
    }),
  );
  return query.data?.values ?? [];
}
