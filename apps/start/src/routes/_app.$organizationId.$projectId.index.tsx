import { createFileRoute } from '@tanstack/react-router';
import { LazyComponent } from '@/components/lazy-component';
import {
  OverviewFilterButton,
  OverviewFiltersButtons,
} from '@/components/overview/filters/overview-filters-buttons';
import { LiveCounter } from '@/components/overview/live-counter';
import OverviewInsights from '@/components/overview/overview-insights';
import { OverviewInterval } from '@/components/overview/overview-interval';
import OverviewMetrics from '@/components/overview/overview-metrics';
import { OverviewRange } from '@/components/overview/overview-range';
import { OverviewShare } from '@/components/overview/overview-share';
import OverviewTopDevices from '@/components/overview/overview-top-devices';
import OverviewTopEvents from '@/components/overview/overview-top-events';
import OverviewTopGeo from '@/components/overview/overview-top-geo';
import OverviewTopPages from '@/components/overview/overview-top-pages';
import OverviewTopSources from '@/components/overview/overview-top-sources';
import OverviewUserJourney from '@/components/overview/overview-user-journey';
import OverviewWeeklyTrends from '@/components/overview/overview-weekly-trends';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute('/_app/$organizationId/$projectId/')({
  component: ProjectDashboard,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(PAGE_TITLES.DASHBOARD),
        },
      ],
    };
  },
});

function ProjectDashboard() {
  const { projectId } = Route.useParams();
  return (
    <div>
      <div className="sticky-header -top-px!">
        <div className="col gap-2 p-4">
          <div className="flex justify-between gap-2">
            <div className="flex gap-2">
              <OverviewRange />
              <OverviewInterval />
              <OverviewFilterButton mode="events" />
            </div>
            <div className="flex gap-2">
              <LiveCounter projectId={projectId} />
              <OverviewShare projectId={projectId} />
            </div>
          </div>
          <OverviewFiltersButtons />
        </div>
      </div>
      <div className="grid grid-cols-6 gap-4 p-4 pt-0">
        <OverviewMetrics projectId={projectId} />
        <OverviewInsights projectId={projectId} />
        <OverviewTopSources projectId={projectId} />
        <OverviewTopPages projectId={projectId} />
        <OverviewTopDevices projectId={projectId} />
        <OverviewTopEvents projectId={projectId} />
        <OverviewTopGeo projectId={projectId} />
        <LazyComponent className="col-span-6">
          <OverviewWeeklyTrends projectId={projectId} />
        </LazyComponent>
        <LazyComponent className="col-span-6">
          <OverviewUserJourney projectId={projectId} />
        </LazyComponent>
      </div>
    </div>
  );
}
