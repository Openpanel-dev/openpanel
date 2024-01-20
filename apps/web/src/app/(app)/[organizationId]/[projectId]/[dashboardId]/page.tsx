import PageLayout from '@/app/(app)/page-layout';
import { getSession } from '@/server/auth';
import {
  createRecentDashboard,
  getDashboardById,
} from '@/server/services/dashboard.service';
import { getReportsByDashboardId } from '@/server/services/reports.service';
import { revalidateTag } from 'next/cache';

import { ListReports } from './list-reports';

interface PageProps {
  params: {
    organizationId: string;
    projectId: string;
    dashboardId: string;
  };
}

export default async function Page({
  params: { organizationId, projectId, dashboardId },
}: PageProps) {
  const session = await getSession();
  const dashboard = await getDashboardById(dashboardId);
  const reports = await getReportsByDashboardId(dashboardId);
  const userId = session?.user.id;
  if (userId && dashboard) {
    await createRecentDashboard({
      userId,
      organizationId,
      projectId,
      dashboardId,
    });
    revalidateTag(`recentDashboards__${userId}`);
  }

  return (
    <PageLayout title={dashboard.name} organizationId={organizationId}>
      <ListReports reports={reports} />
    </PageLayout>
  );
}
