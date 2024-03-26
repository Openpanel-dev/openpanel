import { getMembers, getProjectsByOrganizationSlug } from '@openpanel/db';

import Members from './members';

interface Props {
  organizationSlug: string;
}

const MembersServer = async ({ organizationSlug }: Props) => {
  const [members, projects] = await Promise.all([
    getMembers(organizationSlug),
    getProjectsByOrganizationSlug(organizationSlug),
  ]);

  return <Members members={members} projects={projects} />;
};

export default MembersServer;
