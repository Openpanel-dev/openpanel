import { Padding } from '@/components/ui/padding';

import {
  getClientsByOrganizationId,
  getProjectsByOrganizationId,
} from '@openpanel/db';

import ListProjects from './list-projects';

interface PageProps {
  params: {
    organizationId: string;
  };
}

export default async function Page({ params: { organizationId } }: PageProps) {
  const [projects, clients] = await Promise.all([
    getProjectsByOrganizationId(organizationId),
    getClientsByOrganizationId(organizationId),
  ]);

  return (
    <Padding>
      <ListProjects projects={projects} clients={clients} />
    </Padding>
  );
}
