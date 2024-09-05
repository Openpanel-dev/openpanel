import { api } from '@/trpc/client';

export function useProfileValues(projectId: string, property: string) {
  const query = api.profile.values.useQuery(
    {
      projectId: projectId,
      property,
    },
    {
      staleTime: 1000 * 60 * 10,
    }
  );

  return query.data?.values ?? [];
}
