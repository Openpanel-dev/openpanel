import { StickyBelowHeader } from '@/app/(app)/[organizationId]/[projectId]/layout-sticky-below-header';
import OverviewMetrics from '@/app/(app)/[organizationId]/[projectId]/overview-metrics';
import {
  OverviewFilterSheetTrigger,
  OverviewReportRange,
} from '@/app/(app)/[organizationId]/[projectId]/overview-sticky-header';
import { Logo } from '@/components/Logo';
import ServerLiveCounter from '@/components/overview/live-counter';
import { OverviewFilters } from '@/components/overview/overview-filters';
import { OverviewFiltersButtons } from '@/components/overview/overview-filters-buttons';
import { OverviewLiveHistogram } from '@/components/overview/overview-live-histogram';
import OverviewTopDevices from '@/components/overview/overview-top-devices';
import OverviewTopEvents from '@/components/overview/overview-top-events';
import OverviewTopGeo from '@/components/overview/overview-top-geo';
import OverviewTopPages from '@/components/overview/overview-top-pages';
import OverviewTopSources from '@/components/overview/overview-top-sources';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { getOrganizationBySlug } from '@/server/services/organization.service';
import { notFound } from 'next/navigation';

import { getShareOverviewById } from '@mixan/db';

interface PageProps {
  params: {
    id: string;
  };
}

export default async function Page({ params: { id } }: PageProps) {
  const share = await getShareOverviewById(id);
  if (!share) {
    return notFound();
  }
  const projectId = share.project_id;
  const organization = await getOrganizationBySlug(share.organization_slug);

  return (
    <div className="p-4 md:p-16 bg-gradient-to-tl from-blue-950 to-blue-600">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-end mb-4">
          <div className="leading-none">
            <span className="text-white mb-4">{organization?.name}</span>
            <h1 className="text-white text-xl font-medium">
              {share.project?.name}
            </h1>
          </div>
          <a href="https://openpanel.dev?utm_source=openpanel.dev&utm_medium=share">
            <Logo className="text-white" />
          </a>
        </div>
        <div className="bg-white rounded-lg shadow ring-8 ring-blue-600/50">
          <Sheet>
            <StickyBelowHeader>
              <div className="p-4 flex gap-2 justify-between">
                <div className="flex gap-2">
                  <OverviewReportRange />
                  <OverviewFilterSheetTrigger />
                </div>
                <div className="flex gap-2">
                  <ServerLiveCounter projectId={projectId} />
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
              <div className="col-span-6">
                <OverviewTopGeo projectId={projectId} />
              </div>
            </div>
            <SheetContent className="!max-w-lg w-full" side="right">
              <OverviewFilters projectId={projectId} />
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  );
}
