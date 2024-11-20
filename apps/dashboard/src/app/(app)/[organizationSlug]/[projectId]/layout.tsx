import { FullPageEmptyState } from '@/components/full-page-empty-state';

import {
  getCurrentOrganizations,
  getCurrentProjects,
  getDashboardsByProjectId,
} from '@openpanel/db';

import LayoutContent from './layout-content';
import { LayoutSidebar } from './layout-sidebar';
import SideEffects from './side-effects';

interface AppLayoutProps {
  children: React.ReactNode;
  params: {
    organizationSlug: string;
    projectId: string;
  };
}

export default async function AppLayout({
  children,
  params: { organizationSlug: organizationId, projectId },
}: AppLayoutProps) {
  const [organizations, projects, dashboards] = await Promise.all([
    getCurrentOrganizations(),
    getCurrentProjects(organizationId),
    getDashboardsByProjectId(projectId),
  ]);

  if (!organizations.find((item) => item.id === organizationId)) {
    return (
      <FullPageEmptyState title="Not found" className="min-h-screen">
        The organization you were looking for could not be found.
      </FullPageEmptyState>
    );
  }

  if (!projects.find((item) => item.id === projectId)) {
    return (
      <FullPageEmptyState title="Not found" className="min-h-screen">
        The project you were looking for could not be found.
      </FullPageEmptyState>
    );
  }

  return (
    <div id="dashboard">
      <LayoutSidebar
        {...{
          organizationId,
          projectId,
          organizations,
          projects,
          dashboards,
        }}
      />
      <LayoutContent>{children}</LayoutContent>
      <SideEffects />
    </div>
  );
}
