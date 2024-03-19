import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { getExists } from '@/server/pageExists';
import { notFound } from 'next/navigation';

import { getDashboardById, getReportsByDashboardId } from '@openpanel/db';

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
  const [dashboard, reports] = await Promise.all([
    getDashboardById(dashboardId, projectId),
    getReportsByDashboardId(dashboardId),
    getExists(organizationId),
  ]);

  if (!dashboard) {
    return notFound();
  }

  return (
    <PageLayout title={dashboard.name} organizationSlug={organizationId}>
      <ListReports reports={reports} />
    </PageLayout>
  );
}
