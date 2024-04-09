import { StickyBelowHeader } from '@/app/(app)/[organizationSlug]/[projectId]/layout-sticky-below-header';
import { OverviewReportRange } from '@/app/(app)/[organizationSlug]/[projectId]/overview-sticky-header';
import { Logo } from '@/components/logo';
import { OverviewFiltersButtons } from '@/components/overview/filters/overview-filters-buttons';
import ServerLiveCounter from '@/components/overview/live-counter';
import { OverviewLiveHistogram } from '@/components/overview/overview-live-histogram';
import OverviewMetrics from '@/components/overview/overview-metrics';
import OverviewTopDevices from '@/components/overview/overview-top-devices';
import OverviewTopEvents from '@/components/overview/overview-top-events';
import OverviewTopGeo from '@/components/overview/overview-top-geo';
import OverviewTopPages from '@/components/overview/overview-top-pages';
import OverviewTopSources from '@/components/overview/overview-top-sources';
import { notFound } from 'next/navigation';

import { getOrganizationBySlug, getShareOverviewById } from '@openpanel/db';

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
  if (!share.public) {
    return notFound();
  }
  const projectId = share.projectId;
  const organization = await getOrganizationBySlug(share.organizationSlug);

  return (
    <div className="bg-gradient-to-tl from-blue-950 to-blue-600 p-4 md:p-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-end justify-between">
          <div className="leading-none">
            <span className="mb-4 text-white">{organization?.name}</span>
            <h1 className="text-xl font-medium text-white">
              {share.project?.name}
            </h1>
          </div>
          <a href="https://openpanel.dev?utm_source=openpanel.dev&utm_medium=share">
            <Logo className="text-white max-sm:[&_span]:hidden" />
          </a>
        </div>
        <div className="rounded-lg bg-slate-100 shadow ring-8 ring-blue-600/50 max-sm:-mx-3">
          <StickyBelowHeader>
            <div className="flex justify-between gap-2 p-4">
              <div className="flex gap-2">
                <OverviewReportRange />
                {/* <OverviewFiltersDrawer projectId={projectId} mode="events" /> */}
              </div>
              <div className="flex gap-2">
                <ServerLiveCounter projectId={projectId} />
              </div>
            </div>
            <OverviewFiltersButtons />
          </StickyBelowHeader>
          <div className="grid grid-cols-6 gap-4 p-4">
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
        </div>
      </div>
    </div>
  );
}
