import { getOrganizationBySlug } from '@mixan/db';
import { getProjectWithMostEvents } from '@mixan/db';
import { notFound, redirect } from 'next/navigation';

import PageLayout from './[projectId]/page-layout';

interface PageProps {
  params: {
    organizationId: string;
  };
}

export default async function Page({ params: { organizationId } }: PageProps) {
  const [organization, project] = await Promise.all([
    getOrganizationBySlug(organizationId),
    getProjectWithMostEvents(organizationId),
  ]);

  if (!organization) {
    return notFound();
  }

  if (project) {
    return redirect(`/${organizationId}/${project.id}`);
  }

  return (
    <PageLayout title="Projects" organizationSlug={organizationId}>
      <div className="p-4">
        <h1>Create your first project</h1>
      </div>
    </PageLayout>
  );
}
