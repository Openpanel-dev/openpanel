import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { OverviewFiltersButtons } from '@/components/overview/filters/overview-filters-buttons';
import { OverviewFiltersDrawer } from '@/components/overview/filters/overview-filters-drawer';
import ServerLiveCounter from '@/components/overview/live-counter';
import { OverviewLiveHistogram } from '@/components/overview/overview-live-histogram';
import { OverviewShare } from '@/components/overview/overview-share';
import OverviewTopDevices from '@/components/overview/overview-top-devices';
import OverviewTopEvents from '@/components/overview/overview-top-events';
import OverviewTopGeo from '@/components/overview/overview-top-geo';
import OverviewTopPages from '@/components/overview/overview-top-pages';
import OverviewTopSources from '@/components/overview/overview-top-sources';

import { db } from '@openpanel/db';

import OverviewMetrics from '../../../../components/overview/overview-metrics';
import { StickyBelowHeader } from './layout-sticky-below-header';
import { OverviewReportRange } from './overview-sticky-header';

interface PageProps {
  params: {
    organizationId: string;
    projectId: string;
  };
}

export default async function Page({
  params: { organizationId, projectId },
}: PageProps) {
  const share = await db.shareOverview.findUnique({
    where: {
      project_id: projectId,
    },
  });

  return (
    <PageLayout title="Overview" organizationSlug={organizationId}>
      <StickyBelowHeader>
        <div className="p-4 flex gap-2 justify-between">
          <div className="flex gap-2">
            <OverviewReportRange />
            <OverviewFiltersDrawer projectId={projectId} mode="events" />
          </div>
          <div className="flex gap-2">
            <ServerLiveCounter projectId={projectId} />
            <OverviewShare data={share} />
          </div>
        </div>
        <OverviewFiltersButtons />
      </StickyBelowHeader>
      <div className="p-4 grid gap-4 grid-cols-6">
        <div className="col-span-6">
          <OverviewLiveHistogram projectId={projectId} />
        </div>
        <OverviewMetrics projectId={projectId} />
        <OverviewTopSources projectId={projectId} />
        <OverviewTopPages projectId={projectId} />
        <OverviewTopDevices projectId={projectId} />
        <OverviewTopEvents projectId={projectId} />
        <OverviewTopGeo projectId={projectId} />
      </div>
    </PageLayout>
  );
}
