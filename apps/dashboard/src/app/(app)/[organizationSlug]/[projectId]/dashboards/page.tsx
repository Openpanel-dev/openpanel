import PageLayout from '@/app/(app)/[organizationSlug]/[projectId]/page-layout';

import ListDashboardsServer from './list-dashboards';

interface PageProps {
  params: {
    projectId: string;
    organizationSlug: string;
  };
}

export default function Page({
  params: { projectId, organizationSlug },
}: PageProps) {
  return (
    <>
      <PageLayout title="Dashboards" organizationSlug={organizationSlug} />
      <ListDashboardsServer projectId={projectId} />
    </>
  );
}
