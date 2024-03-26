import { getInvites, getProjectsByOrganizationSlug } from '@openpanel/db';

import Invites from './invites';

interface Props {
  organizationSlug: string;
}

const InvitesServer = async ({ organizationSlug }: Props) => {
  const [invites, projects] = await Promise.all([
    getInvites(organizationSlug),
    getProjectsByOrganizationSlug(organizationSlug),
  ]);

  return <Invites invites={invites} projects={projects} />;
};

export default InvitesServer;
