import { MembersTable } from '@/components/settings/members';

import { getMembers, getProjectsByOrganizationId } from '@openpanel/db';

interface Props {
  organizationId: string;
}

const MembersServer = async ({ organizationId }: Props) => {
  const [members, projects] = await Promise.all([
    getMembers(organizationId),
    getProjectsByOrganizationId(organizationId),
  ]);

  return <MembersTable data={members} projects={projects} />;
};

export default MembersServer;
