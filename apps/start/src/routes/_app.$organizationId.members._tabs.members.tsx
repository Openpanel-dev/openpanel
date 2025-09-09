import { MembersTable } from '@/components/settings/members';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/members/_tabs/members',
)({
  component: Component,
});

function Component() {
  const { organizationId } = useAppParams();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.organization.members.queryOptions({ organizationId }),
  );

  return <MembersTable data={query.data} />;
}
