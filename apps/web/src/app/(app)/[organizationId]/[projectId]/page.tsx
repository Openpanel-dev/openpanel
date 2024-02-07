import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { getExists } from '@/server/pageExists';

import OverviewMetrics from './overview-metrics';

interface PageProps {
  params: {
    organizationId: string;
    projectId: string;
  };
}
export default async function Page({
  params: { organizationId, projectId },
}: PageProps) {
  await getExists(organizationId, projectId);

  return (
    <PageLayout title="Overview" organizationSlug={organizationId}>
      <OverviewMetrics />
    </PageLayout>
  );
}
