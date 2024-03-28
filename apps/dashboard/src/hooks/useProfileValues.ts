import { api } from '@/trpc/client';

export function useProfileValues(projectId: string, property: string) {
  const query = api.profile.values.useQuery({
    projectId: projectId,
    property,
  });

  return query.data?.values ?? [];
}
