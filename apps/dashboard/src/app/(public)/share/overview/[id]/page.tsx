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
  searchParams: {
    header: string;
  };
}

export default async function Page({
  params: { id },
  searchParams,
}: PageProps) {
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
    <div>
      {searchParams.header !== '0' && (
        <div className="flex items-center justify-between border-b border-border bg-white p-4">
          <div className="leading-none">
            <span className="mb-4">{organization?.name}</span>
            <h1 className="text-xl font-medium">{share.project?.name}</h1>
          </div>
          <a
            href="https://openpanel.dev?utm_source=openpanel.dev&utm_medium=share"
            className="flex flex-col items-end text-lg font-medium"
          >
            <span className="text-sm">POWERED BY</span>
            <span>openpanel.dev</span>
          </a>
        </div>
      )}
      <div className="">
        <StickyBelowHeader>
          <div className="flex justify-between gap-2 p-4">
            <div className="flex gap-2">
              <OverviewReportRange />
            </div>
            <div className="flex gap-2">
              <ServerLiveCounter projectId={projectId} />
            </div>
          </div>
          <OverviewFiltersButtons />
        </StickyBelowHeader>
        <div className="mx-auto grid max-w-7xl grid-cols-6 gap-4 p-4">
          <OverviewMetrics projectId={projectId} />
          <OverviewTopSources projectId={projectId} />
          <OverviewTopPages projectId={projectId} />
          <OverviewTopDevices projectId={projectId} />
          <OverviewTopEvents projectId={projectId} />
          <OverviewTopGeo projectId={projectId} />
        </div>
      </div>
    </div>
  );
}
