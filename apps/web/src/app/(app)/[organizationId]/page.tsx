import { LogoSquare } from '@/components/Logo';
import { notFound, redirect } from 'next/navigation';

import { getOrganizationBySlug, getProjectWithMostEvents } from '@mixan/db';

import { CreateProject } from './create-project';

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

  if (process.env.BLOCK) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="max-w-lg w-full">
          <LogoSquare className="w-20 md:w-28 mb-8" />
          <h1 className="font-medium text-3xl">Not quite there yet</h1>
          <div className="text-lg">
            We're still working on Openpanel, but we're not quite there yet.
            We'll let you know when we're ready to go!
          </div>
        </div>
      </div>
    );
  }

  if (project) {
    return redirect(`/${organizationId}/${project.id}`);
  }

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="max-w-lg w-full">
        <CreateProject />
      </div>
    </div>
  );
}
