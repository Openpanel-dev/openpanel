import { Padding } from '@/components/ui/padding';
import { notFound } from 'next/navigation';

import {
  getDashboardById,
  getReportsByDashboardId,
  getShareByDashboardId,
} from '@openpanel/db';

import { ListReports } from './list-reports';

interface PageProps {
  params: {
    projectId: string;
    dashboardId: string;
  };
}

export default async function Page({
  params: { projectId, dashboardId },
}: PageProps) {
  const [dashboard, reports, shareDashboard] = await Promise.all([
    getDashboardById(dashboardId, projectId),
    getReportsByDashboardId(dashboardId),
    getShareByDashboardId(dashboardId),
  ]);

  if (!dashboard) {
    return notFound();
  }

  return (
    <Padding>
      <ListReports
        reports={reports}
        dashboard={dashboard}
        shareDashboard={shareDashboard}
      />
    </Padding>
  );
}
