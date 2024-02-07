import { getProjectWithMostEvents } from '@/server/services/project.service';
import { redirect } from 'next/navigation';

import PageLayout from '../page-layout';

interface PageProps {
  params: {
    organizationId: string;
  };
}

export default async function Page({ params: { organizationId } }: PageProps) {
  const project = await getProjectWithMostEvents(organizationId);

  if (project) {
    return redirect(`/${organizationId}/${project.id}`);
  }

  return (
    <PageLayout title="Projects">
      <div className="p-4">
        <h1>Create your first project</h1>
      </div>
    </PageLayout>
  );
}
