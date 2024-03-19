import { notFound } from 'next/navigation';

import {
  getCurrentOrganizations,
  getDashboardsByProjectId,
  getProjectsByOrganizationSlug,
} from '@openpanel/db';

import { LayoutSidebar } from './layout-sidebar';

interface AppLayoutProps {
  children: React.ReactNode;
  params: {
    organizationId: string;
    projectId: string;
  };
}

export default async function AppLayout({
  children,
  params: { organizationId, projectId },
}: AppLayoutProps) {
  const [organizations, projects, dashboards] = await Promise.all([
    getCurrentOrganizations(),
    getProjectsByOrganizationSlug(organizationId),
    getDashboardsByProjectId(projectId),
  ]);

  if (!organizations.find((item) => item.slug === organizationId)) {
    return notFound();
  }

  if (!projects.find((item) => item.id === projectId)) {
    return notFound();
  }

  return (
    <div id="dashboard">
      <LayoutSidebar
        {...{ organizationId, projectId, organizations, dashboards }}
      />
      <div className="lg:pl-72 transition-all">{children}</div>
    </div>
  );
}
