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
      <div className="h-16 border-b border-border flex-shrink-0 sticky top-0 bg-white px-4 flex items-center justify-between z-20 pl-12 lg:pl-4">
        <div className="text-xl font-medium">{title}</div>
        {projects.length > 0 && <LayoutProjectSelector projects={projects} />}
      </div>
      <div>{children}</div>
    </>
  );
}
