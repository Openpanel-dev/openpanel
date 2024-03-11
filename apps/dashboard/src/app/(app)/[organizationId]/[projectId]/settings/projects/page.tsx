import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { getExists } from '@/server/pageExists';
import { getProjectsByOrganizationSlug } from '@openpanel/db';

import ListProjects from './list-projects';

interface PageProps {
  params: {
    organizationId: string;
  };
}

export default async function Page({ params: { organizationId } }: PageProps) {
  await getExists(organizationId);
  const projects = await getProjectsByOrganizationSlug(organizationId);

  return (
    <PageLayout title="Projects" organizationSlug={organizationId}>
      <ListProjects projects={projects} />
    </PageLayout>
  );
}
