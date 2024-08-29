import PageLayout from '@/app/(app)/[organizationSlug]/[projectId]/page-layout';

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
    <>
      <PageLayout title="Projects" />
      <ListProjects projects={projects} clients={clients} />
    </>
  );
}
