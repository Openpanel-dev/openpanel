import { getDashboardsByOrganization } from '@/server/services/dashboard.service';
import { getCurrentOrganizations } from '@/server/services/organization.service';

import { LayoutSidebar } from './layout-sidebar';

interface AppLayoutProps {
  children: React.ReactNode;
  params: {
    organizationId: string;
  };
}

export default async function AppLayout({
  children,
  params: { organizationId },
}: AppLayoutProps) {
  const [organizations, dashboards] = await Promise.all([
    getCurrentOrganizations(),
    getDashboardsByOrganization(organizationId),
  ]);

  return (
    <div id="dashboard">
      <LayoutSidebar {...{ organizations, dashboards }} />
      <div className="lg:pl-72 transition-all">{children}</div>
    </div>
  );
}
