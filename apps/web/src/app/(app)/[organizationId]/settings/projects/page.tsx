import PageLayout from '@/app/(app)/page-layout';
import { getProjectsByOrganizationId } from '@/server/services/project.service';

import ListProjects from './list-projects';

interface PageProps {
  params: {
    organizationId: string;
  };
}

export default async function Page({ params: { organizationId } }: PageProps) {
  const projects = await getProjectsByOrganizationId(organizationId);

  return (
    <PageLayout title="Projects" organizationId={organizationId}>
      <ListProjects projects={projects} />
    </PageLayout>
  );
}
