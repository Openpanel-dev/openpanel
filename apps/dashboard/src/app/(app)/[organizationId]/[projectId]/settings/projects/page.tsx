import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';

import {
  getClientsByOrganizationId,
  getProjectsByOrganizationSlug,
} from '@openpanel/db';

import ListProjects from './list-projects';

interface PageProps {
  params: {
    organizationId: string;
  };
}

export default async function Page({ params: { organizationId } }: PageProps) {
  const [projects, clients] = await Promise.all([
    getProjectsByOrganizationSlug(organizationId),
    getClientsByOrganizationId(organizationId),
  ]);

  return (
    <PageLayout title="Projects" organizationSlug={organizationId}>
      <ListProjects projects={projects} clients={clients} />
    </PageLayout>
  );
}
