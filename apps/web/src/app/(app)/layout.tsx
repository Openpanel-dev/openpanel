import { getSession } from '@/server/auth';
import { getRecentDashboardsByUserId } from '@/server/services/dashboard.service';
import { getOrganizations } from '@/server/services/organization.service';

import Auth from '../auth';
import { LayoutSidebar } from './layout-sidebar';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default async function AppLayout({ children }: AppLayoutProps) {
  const session = await getSession();
  const organizations = await getOrganizations();
  const recentDashboards = session?.user.id
    ? await getRecentDashboardsByUserId(session?.user.id)
    : [];

  if (!session) {
    return <Auth />;
  }

  return (
    <div id="dashboard">
      <LayoutSidebar {...{ organizations, recentDashboards }} />
      <div className="lg:pl-72 transition-all">{children}</div>
    </div>
  );
}
