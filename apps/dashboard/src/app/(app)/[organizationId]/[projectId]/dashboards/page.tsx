import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { getExists } from '@/server/pageExists';
import { getDashboardsByProjectId } from '@openpanel/db';

import { HeaderDashboards } from './header-dashboards';
import { ListDashboards } from './list-dashboards';

interface PageProps {
  params: {
    projectId: string;
    organizationId: string;
  };
}

export default async function Page({
  params: { projectId, organizationId },
}: PageProps) {
  const [dashboards] = await Promise.all([
    getDashboardsByProjectId(projectId),
    await getExists(organizationId, projectId),
  ]);

  return (
    <PageLayout title="Dashboards" organizationSlug={organizationId}>
      {dashboards.length > 0 && <HeaderDashboards />}
      <ListDashboards dashboards={dashboards} />
    </PageLayout>
  );
}
