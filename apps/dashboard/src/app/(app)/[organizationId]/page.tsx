import { LogoSquare } from '@/components/Logo';
import { ProjectCard } from '@/components/projects/project-card';
import { notFound, redirect } from 'next/navigation';

import {
  getOrganizationBySlug,
  getProjectsByOrganizationSlug,
  isWaitlistUserAccepted,
} from '@openpanel/db';

import { CreateProject } from './create-project';

interface PageProps {
  params: {
    organizationId: string;
  };
}

export default async function Page({ params: { organizationId } }: PageProps) {
  const [organization, projects] = await Promise.all([
    getOrganizationBySlug(organizationId),
    getProjectsByOrganizationSlug(organizationId),
  ]);

  if (!organization) {
    return notFound();
  }

  if (process.env.BLOCK) {
    const isAccepted = await isWaitlistUserAccepted();
    if (!isAccepted) {
      return (
        <div className="p-4 flex items-center justify-center h-screen">
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
  }

  if (projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen p-4 ">
        <div className="max-w-lg w-full">
          <CreateProject />
        </div>
      </div>
    );
  }

  if (projects.length === 1 && projects[0]) {
    return redirect(`/${organizationId}/${projects[0].id}`);
  }

  return (
    <div className="max-w-xl w-full mx-auto flex flex-col gap-4 pt-20 p-4 ">
      <h1 className="font-medium text-xl">Select project</h1>
      {projects.map((item) => (
        <ProjectCard key={item.id} {...item} />
      ))}
    </div>
  );
}
