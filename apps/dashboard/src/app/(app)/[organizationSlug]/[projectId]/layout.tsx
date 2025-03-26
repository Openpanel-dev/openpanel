import { FullPageEmptyState } from '@/components/full-page-empty-state';

import {
  getDashboardsByProjectId,
  getOrganizations,
  getProjects,
} from '@openpanel/db';

import { auth } from '@openpanel/auth/nextjs';
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
  const { userId } = await auth();
  const [organizations, projects, dashboards] = await Promise.all([
    getOrganizations(userId),
    getProjects({ organizationId, userId }),
    getDashboardsByProjectId(projectId),
  ]);

  const organization = organizations.find((item) => item.id === organizationId);

  if (!organization) {
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
      <SideEffects organization={organization} />
    </div>
  );
}
