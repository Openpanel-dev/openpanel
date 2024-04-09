import PageLayout from '@/app/(app)/[organizationSlug]/[projectId]/page-layout';

import { getDashboardsByProjectId } from '@openpanel/db';

import { HeaderDashboards } from './header-dashboards';
import { ListDashboards } from './list-dashboards';

interface PageProps {
  params: {
    projectId: string;
    organizationSlug: string;
  };
}

export default async function Page({
  params: { projectId, organizationSlug },
}: PageProps) {
  const dashboards = await getDashboardsByProjectId(projectId);

  return (
    <PageLayout title="Dashboards" organizationSlug={organizationSlug}>
      {dashboards.length > 0 && <HeaderDashboards />}
      <ListDashboards dashboards={dashboards} />
    </PageLayout>
  );
}
