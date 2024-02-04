import PageLayout from '@/app/(app)/page-layout';
import { getDashboardsByProjectId } from '@/server/services/dashboard.service';

import { HeaderDashboards } from './header-dashboards';
import { ListDashboards } from './list-dashboards';

interface PageProps {
  params: {
    organizationId: string;
    projectId: string;
  };
}

export default async function Page({
  params: { organizationId, projectId },
}: PageProps) {
  const dashboards = await getDashboardsByProjectId(projectId);

  return (
    <PageLayout title="Dashboards" organizationId={organizationId}>
      <HeaderDashboards projectId={projectId} />
      <ListDashboards dashboards={dashboards} />
    </PageLayout>
  );
}
