import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { notFound } from 'next/navigation';

import {
  getCurrentOrganizations,
  getCurrentProjects,
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
    getCurrentProjects(organizationId),
    getDashboardsByProjectId(projectId),
  ]);

  if (!organizations.find((item) => item.slug === organizationId)) {
    return (
      <FullPageEmptyState
        title="Could not find organization"
        className="min-h-screen"
      >
        The organization you are looking for could not be found.
      </FullPageEmptyState>
    );
  }

  if (!projects.find((item) => item.id === projectId)) {
    return (
      <FullPageEmptyState
        title="Could not find project"
        className="min-h-screen"
      >
        The project you are looking for could not be found.
      </FullPageEmptyState>
    );
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
