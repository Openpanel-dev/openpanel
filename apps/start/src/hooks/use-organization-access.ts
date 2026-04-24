import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';

export function useOrganizationAccess(organizationId: string | undefined) {
  const trpc = useTRPC();
  const { data } = useQuery({
    ...trpc.organization.myAccess.queryOptions({
      organizationId: organizationId ?? '',
    }),
    enabled: !!organizationId,
  });

  return {
    role: data?.role ?? null,
    isAdmin: data?.role === 'org:admin',
  };
}
