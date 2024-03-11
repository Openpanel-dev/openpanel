import { api } from '@/app/_trpc/client';

export function useProfileProperties(projectId: string, event?: string) {
  const query = api.profile.properties.useQuery({
    projectId: projectId,
    event,
  });

  return query.data ?? [];
}
