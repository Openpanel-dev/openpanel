import { MembersTable } from '@/components/settings/members';

import { getMembers, getProjectsByOrganizationSlug } from '@openpanel/db';

interface Props {
  organizationSlug: string;
}

const MembersServer = async ({ organizationSlug }: Props) => {
  const [members, projects] = await Promise.all([
    getMembers(organizationSlug),
    getProjectsByOrganizationSlug(organizationSlug),
  ]);

  return <MembersTable data={members} projects={projects} />;
};

export default MembersServer;
