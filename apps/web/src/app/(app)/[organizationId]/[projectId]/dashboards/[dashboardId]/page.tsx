import PageLayout from '@/app/(app)/page-layout';
import {
  createRecentDashboard,
  getDashboardById,
} from '@/server/services/dashboard.service';
import { getReportsByDashboardId } from '@/server/services/reports.service';
import { auth } from '@clerk/nextjs';
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
  const { userId } = auth();

  const dashboard = await getDashboardById(dashboardId);
  const reports = await getReportsByDashboardId(dashboardId);
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
    <PageLayout title={dashboard.name}>
      <ListReports reports={reports} />
    </PageLayout>
  );
}
