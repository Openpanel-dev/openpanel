import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullWidthNavbar from '@/components/full-width-navbar';
import ProjectCard from '@/components/projects/project-card';
import SignOutButton from '@/components/sign-out-button';
import { redirect } from 'next/navigation';

import { getCurrentOrganizations, getCurrentProjects } from '@openpanel/db';

interface PageProps {
  params: {
    organizationSlug: string;
  };
}

export default async function Page({
  params: { organizationSlug },
}: PageProps) {
  const [organizations, projects] = await Promise.all([
    getCurrentOrganizations(),
    getCurrentProjects(organizationSlug),
  ]);

  const organization = organizations.find(
    (org) => org.slug === organizationSlug
  );

  if (!organization) {
    return (
      <FullPageEmptyState title="Not found" className="min-h-screen">
        The organization you were looking for could not be found.
      </FullPageEmptyState>
    );
  }

  if (projects.length === 0) {
    return redirect('/onboarding');
  }

  if (projects.length === 1 && projects[0]) {
    return redirect(`/${organizationSlug}/${projects[0].id}`);
  }

  return (
    <div>
      <FullWidthNavbar>
        <SignOutButton />
      </FullWidthNavbar>
      <div className="mx-auto flex flex-col gap-4 p-4 pt-20 md:max-w-[95vw] lg:max-w-[80vw] ">
        <h1 className="text-xl font-medium">Select project</h1>
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((item) => (
            <ProjectCard key={item.id} {...item} />
          ))}
        </div>
      </div>
    </div>
  );
}
