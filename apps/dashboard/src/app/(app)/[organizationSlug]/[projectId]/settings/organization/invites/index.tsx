import { TableButtons } from '@/components/data-table';
import { InvitesTable } from '@/components/settings/invites';

import { getInvites, getProjectsByOrganizationSlug } from '@openpanel/db';

import CreateInvite from './create-invite';

interface Props {
  organizationSlug: string;
}

const InvitesServer = async ({ organizationSlug }: Props) => {
  const [invites, projects] = await Promise.all([
    getInvites(organizationSlug),
    getProjectsByOrganizationSlug(organizationSlug),
  ]);

  return (
    <div>
      <TableButtons>
        <CreateInvite projects={projects} />
      </TableButtons>
      <InvitesTable data={invites} projects={projects} />
    </div>
  );
};

export default InvitesServer;
