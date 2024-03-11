import {
  getCurrentOrganizations,
  getDashboardsByOrganization,
  getDashboardsByProjectId,
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
  const [organizations, dashboards] = await Promise.all([
    getCurrentOrganizations(),
    getDashboardsByProjectId(projectId),
  ]);

  return (
    <div id="dashboard">
      <LayoutSidebar
        {...{ organizationId, projectId, organizations, dashboards }}
      />
      <div className="lg:pl-72 transition-all">{children}</div>
    </div>
  );
}
