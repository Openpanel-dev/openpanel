import PageLayout from '@/app/(app)/[organizationSlug]/[projectId]/page-layout';
import { OverviewFiltersButtons } from '@/components/overview/filters/overview-filters-buttons';
import { OverviewFiltersDrawer } from '@/components/overview/filters/overview-filters-drawer';
import ServerLiveCounter from '@/components/overview/live-counter';
import OverviewShareServer from '@/components/overview/overview-share';
import OverviewTopDevices from '@/components/overview/overview-top-devices';
import OverviewTopEvents from '@/components/overview/overview-top-events';
import OverviewTopGeo from '@/components/overview/overview-top-geo';
import OverviewTopPages from '@/components/overview/overview-top-pages';
import OverviewTopSources from '@/components/overview/overview-top-sources';

import OverviewMetrics from '../../../../components/overview/overview-metrics';
import { StickyBelowHeader } from './layout-sticky-below-header';
import { OverviewReportRange } from './overview-sticky-header';

interface PageProps {
  params: {
    organizationSlug: string;
    projectId: string;
  };
}

export default function Page({
  params: { organizationSlug, projectId },
}: PageProps) {
  return (
    <>
      <PageLayout title="Overview" organizationSlug={organizationSlug} />
      <StickyBelowHeader>
        <div className="flex justify-between gap-2 p-4">
          <div className="flex gap-2">
            <OverviewReportRange />
            <OverviewFiltersDrawer projectId={projectId} mode="events" />
          </div>
          <div className="flex gap-2">
            <ServerLiveCounter projectId={projectId} />
            <OverviewShareServer projectId={projectId} />
          </div>
        </div>
        <OverviewFiltersButtons />
      </StickyBelowHeader>
      <div className="grid grid-cols-6 gap-4 p-4">
        <OverviewMetrics projectId={projectId} />
        <OverviewTopSources projectId={projectId} />
        <OverviewTopPages projectId={projectId} />
        <OverviewTopDevices projectId={projectId} />
        <OverviewTopEvents projectId={projectId} />
        <OverviewTopGeo projectId={projectId} />
      </div>
    </>
  );
}
