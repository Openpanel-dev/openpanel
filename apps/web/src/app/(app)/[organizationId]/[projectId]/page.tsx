import PageLayout from '@/app/(app)/page-layout';

import OverviewMetrics from './overview-metrics';

interface PageProps {
  params: {
    organizationId: string;
    projectId: string;
  };
}

export default function Page({ params: { organizationId } }: PageProps) {
  return (
    <PageLayout title="Overview" organizationId={organizationId}>
      <OverviewMetrics />
    </PageLayout>
  );
}
