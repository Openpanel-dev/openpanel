import { isOrganizationAdminRole } from '@openpanel/core/modules/organization/organization.constants';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/integrations/trpc/react';

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
    isAdmin: !!data && isOrganizationAdminRole(data.role),
  };
}
