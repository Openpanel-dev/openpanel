import { LogoSquare } from '@/components/logo';
import { ProjectCard } from '@/components/projects/project-card';
import { SignOutButton } from '@clerk/nextjs';
import { notFound, redirect } from 'next/navigation';

import {
  getCurrentProjects,
  getOrganizationBySlug,
  isWaitlistUserAccepted,
} from '@openpanel/db';

import { CreateProject } from './create-project';

interface PageProps {
  params: {
    organizationSlug: string;
  };
}

export default async function Page({
  params: { organizationSlug },
}: PageProps) {
  const [organization, projects] = await Promise.all([
    getOrganizationBySlug(organizationSlug),
    getCurrentProjects(organizationSlug),
  ]);

  if (!organization) {
    return notFound();
  }

  if (process.env.BLOCK) {
    const isAccepted = await isWaitlistUserAccepted();
    if (!isAccepted) {
      return (
        <div className="flex h-screen items-center justify-center p-4">
          <div className="w-full max-w-lg">
            <LogoSquare className="mb-8 w-20 md:w-28" />
            <h1 className="text-3xl font-medium">Not quite there yet</h1>
            <div className="text-lg">
              We&apos;re still working on Openpanel, but we&apos;re not quite
              there yet. We&apos;ll let you know when we&apos;re ready to go!
            </div>
          </div>
        </div>
      );
    }
  }

  if (projects.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center p-4 ">
        <div className="w-full max-w-lg">
          <CreateProject />
        </div>
      </div>
    );
  }

  if (projects.length === 1 && projects[0]) {
    return redirect(`/${organizationSlug}/${projects[0].id}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4 pt-20 ">
      <SignOutButton />
      <h1 className="text-xl font-medium">Select project</h1>
      {projects.map((item) => (
        <ProjectCard key={item.id} {...item} />
      ))}
    </div>
  );
}
