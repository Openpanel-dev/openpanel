import PageLayout from '@/app/(app)/page-layout';
import { getProjectsByOrganizationSlug } from '@/server/services/project.service';

import ListProjects from './list-projects';

interface PageProps {
  params: {
    organizationId: string;
  };
}

export default async function Page({ params: { organizationId } }: PageProps) {
  const projects = await getProjectsByOrganizationSlug(organizationId);

  return (
    <PageLayout title="Projects">
      <ListProjects projects={projects} />
    </PageLayout>
  );
}
