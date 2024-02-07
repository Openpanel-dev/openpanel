import { getOrganizations } from '@/server/services/organization.service';

import { LayoutSidebar } from './layout-sidebar';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default async function AppLayout({ children }: AppLayoutProps) {
  const organizations = await getOrganizations();

  return (
    <div id="dashboard">
      <LayoutSidebar {...{ organizations }} />
      <div className="lg:pl-72 transition-all">{children}</div>
    </div>
  );
}
