import PageLayout from '@/app/(app)/[organizationSlug]/[projectId]/page-layout';
import { notFound } from 'next/navigation';

import { getDashboardById, getReportsByDashboardId } from '@openpanel/db';

import { ListReports } from './list-reports';

interface PageProps {
  params: {
    organizationSlug: string;
    projectId: string;
    dashboardId: string;
  };
}

export default async function Page({
  params: { organizationSlug, projectId, dashboardId },
}: PageProps) {
  const [dashboard, reports] = await Promise.all([
    getDashboardById(dashboardId, projectId),
    getReportsByDashboardId(dashboardId),
  ]);

  if (!dashboard) {
    return notFound();
  }

  return (
    <>
      <PageLayout title={dashboard.name} organizationSlug={organizationSlug} />
      <ListReports reports={reports} />
    </>
  );
}
