import PageLayout from '@/app/(app)/page-layout';

import OverviewMetrics from './overview-metrics';

export default function Page() {
  return (
    <PageLayout title="Overview">
      <OverviewMetrics />
    </PageLayout>
  );
}
