import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import ServerLiveCounter from '@/components/overview/live-counter';
import { OverviewFilters } from '@/components/overview/overview-filters';
import { OverviewFiltersButtons } from '@/components/overview/overview-filters-buttons';
import { OverviewShare } from '@/components/overview/overview-share';
import OverviewTopDevices from '@/components/overview/overview-top-devices';
import OverviewTopEvents from '@/components/overview/overview-top-events';
import OverviewTopGeo from '@/components/overview/overview-top-geo';
import OverviewTopPages from '@/components/overview/overview-top-pages';
import OverviewTopSources from '@/components/overview/overview-top-sources';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { getExists } from '@/server/pageExists';

import { db } from '@mixan/db';

import { StickyBelowHeader } from './layout-sticky-below-header';
import OverviewMetrics from './overview-metrics';
import {
  OverviewFilterSheetTrigger,
  OverviewReportRange,
} from './overview-sticky-header';

interface PageProps {
  params: {
    organizationId: string;
    projectId: string;
  };
}

export default async function Page({
  params: { organizationId, projectId },
}: PageProps) {
  const [share] = await Promise.all([
    db.shareOverview.findUnique({
      where: {
        project_id: projectId,
      },
    }),
    getExists(organizationId, projectId),
  ]);

  return (
    <PageLayout title="Overview" organizationSlug={organizationId}>
      <Sheet>
        <StickyBelowHeader className="p-4 flex gap-2 justify-between">
          <div className="flex gap-2">
            <OverviewReportRange />
            <OverviewFilterSheetTrigger />
          </div>
          <div className="flex gap-2">
            <ServerLiveCounter projectId={projectId} />
            <OverviewShare data={share} />
          </div>
        </StickyBelowHeader>
        <div className="p-4 grid gap-4 grid-cols-6">
          <div className="col-span-6 flex flex-wrap gap-2">
            <OverviewFiltersButtons />
          </div>
          <OverviewMetrics projectId={projectId} />
          <OverviewTopSources projectId={projectId} />
          <OverviewTopPages projectId={projectId} />
          <OverviewTopDevices projectId={projectId} />
          <OverviewTopEvents projectId={projectId} />
          <div className="col-span-6">
            <OverviewTopGeo projectId={projectId} />
          </div>
        </div>
        <SheetContent className="!max-w-lg w-full" side="right">
          <OverviewFilters projectId={projectId} />
        </SheetContent>
      </Sheet>
    </PageLayout>
  );
}
