import { OverviewFiltersButtons } from '@/components/overview/filters/overview-filters-buttons';
import { OverviewFiltersDrawer } from '@/components/overview/filters/overview-filters-drawer';
import ServerLiveCounter from '@/components/overview/live-counter';
import OverviewShareServer from '@/components/overview/overview-share';
import OverviewTopDevices from '@/components/overview/overview-top-devices';
import OverviewTopEvents from '@/components/overview/overview-top-events';
import OverviewTopGeo from '@/components/overview/overview-top-geo';
import OverviewTopPages from '@/components/overview/overview-top-pages';
import OverviewTopSources from '@/components/overview/overview-top-sources';

import { OverviewHydrateOptions } from '@/components/overview/overview-hydrate-options';
import { OverviewInterval } from '@/components/overview/overview-interval';
import OverviewMetrics from '@/components/overview/overview-metrics';
import { OverviewRange } from '@/components/overview/overview-range';

interface PageProps {
  params: {
    projectId: string;
  };
}

export default function Page({ params: { projectId } }: PageProps) {
  return (
    <>
      <OverviewHydrateOptions />
      <div className="col gap-2 p-4">
        <div className="flex justify-between gap-2">
          <div className="flex gap-2">
            <OverviewRange />
            <OverviewInterval />
            <OverviewFiltersDrawer projectId={projectId} mode="events" />
          </div>
          <div className="flex gap-2">
            <ServerLiveCounter projectId={projectId} />
            <OverviewShareServer projectId={projectId} />
          </div>
        </div>
        <OverviewFiltersButtons />
      </div>
      <div className="grid grid-cols-6 gap-4 p-4 pt-0">
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
