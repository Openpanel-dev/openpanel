import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';

export function useProfileProperties(projectId: string) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.profile.properties.queryOptions({
      projectId,
    }),
  );
  return query.data ?? [];
}
