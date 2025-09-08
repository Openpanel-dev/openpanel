import { TableButtons } from '@/components/data-table';
import { InvitesTable } from '@/components/settings/invites';
import { Button } from '@/components/ui/button';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';

export const Route = createFileRoute(
  '/_app/$organizationId_/members/_tabs/invitations',
)({
  component: Component,
});

function Component() {
  const { organizationId } = Route.useParams();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.organization.invitations.queryOptions({ organizationId }),
  );

  return (
    <div>
      <TableButtons>
        <Button
          icon={PlusIcon}
          onClick={() => {
            pushModal('CreateInvite');
          }}
        >
          Invite user
        </Button>
      </TableButtons>
      <InvitesTable data={query.data} />
    </div>
  );
}
