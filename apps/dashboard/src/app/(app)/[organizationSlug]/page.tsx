import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullWidthNavbar from '@/components/full-width-navbar';
import ProjectCard from '@/components/projects/project-card';
import { redirect } from 'next/navigation';

import SettingsToggle from '@/components/settings-toggle';
import { auth } from '@openpanel/auth/nextjs';
import { getOrganizations, getProjects } from '@openpanel/db';
import LayoutProjectSelector from './[projectId]/layout-project-selector';

interface PageProps {
  params: {
    organizationSlug: string;
  };
}

export default async function Page({
  params: { organizationSlug: organizationId },
}: PageProps) {
  const { userId } = await auth();
  const [organizations, projects] = await Promise.all([
    getOrganizations(userId),
    getProjects({ organizationId, userId }),
  ]);

  const organization = organizations.find((org) => org.id === organizationId);

  if (!organization) {
    return (
      <FullPageEmptyState title="Not found" className="min-h-screen">
        The organization you were looking for could not be found.
      </FullPageEmptyState>
    );
  }

  if (projects.length === 0) {
    return redirect('/onboarding/project');
  }

  if (projects.length === 1 && projects[0]) {
    return redirect(`/${organizationId}/${projects[0].id}`);
  }

  return (
    <div>
      <FullWidthNavbar>
        <div className="row gap-4">
          <LayoutProjectSelector
            align="start"
            projects={projects}
            organizations={organizations}
          />
          <SettingsToggle />
        </div>
      </FullWidthNavbar>
      <div className="mx-auto flex flex-col gap-4 p-4 pt-20 md:w-[95vw] lg:w-[80vw] max-w-screen-2xl">
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((item) => (
            <ProjectCard key={item.id} {...item} />
          ))}
        </div>
      </div>
    </div>
  );
}
