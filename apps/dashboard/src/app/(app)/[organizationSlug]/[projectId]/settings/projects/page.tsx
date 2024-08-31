import PageLayout from '@/app/(app)/[organizationSlug]/[projectId]/page-layout';
import { Padding } from '@/components/ui/padding';

import {
  getClientsByOrganizationSlug,
  getProjectsByOrganizationSlug,
} from '@openpanel/db';

import ListProjects from './list-projects';

interface PageProps {
  params: {
    organizationSlug: string;
  };
}

export default async function Page({
  params: { organizationSlug },
}: PageProps) {
  const [projects, clients] = await Promise.all([
    getProjectsByOrganizationSlug(organizationSlug),
    getClientsByOrganizationSlug(organizationSlug),
  ]);

  return (
    <Padding>
      <ListProjects projects={projects} clients={clients} />
    </Padding>
  );
}
