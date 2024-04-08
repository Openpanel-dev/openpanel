import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';

import {
  getClientsByOrganizationSlug,
  getProjectsByOrganizationSlug,
} from '@openpanel/db';

import ListProjects from './list-projects';

interface PageProps {
  params: {
    organizationId: string;
  };
}

export default async function Page({
  params: { organizationId: organizationSlug },
}: PageProps) {
  const [projects, clients] = await Promise.all([
    getProjectsByOrganizationSlug(organizationSlug),
    getClientsByOrganizationSlug(organizationSlug),
  ]);

  return (
    <PageLayout title="Projects" organizationSlug={organizationSlug}>
      <ListProjects projects={projects} clients={clients} />
    </PageLayout>
  );
}
