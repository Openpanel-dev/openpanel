import {
  getCurrentProjects,
  getProjectsByOrganizationSlug,
} from '@openpanel/db';

import LayoutProjectSelector from './layout-project-selector';

interface PageLayoutProps {
  children: React.ReactNode;
  title: React.ReactNode;
  organizationSlug: string;
}

export default async function PageLayout({
  children,
  title,
  organizationSlug,
}: PageLayoutProps) {
  const projects = await getCurrentProjects(organizationSlug);

  return (
    <>
      <div className="sticky top-0 z-20 flex h-16 flex-shrink-0 items-center justify-between border-b border-border bg-white px-4 pl-12 lg:pl-4">
        <div className="text-xl font-medium">{title}</div>
        {projects.length > 0 && <LayoutProjectSelector projects={projects} />}
      </div>
      <div>{children}</div>
    </>
  );
}
