import { api } from '@/app/_trpc/client';

export function useProfileProperties(projectId: string) {
  const query = api.profile.properties.useQuery({
    projectId: projectId,
  });

  return query.data ?? [];
}
