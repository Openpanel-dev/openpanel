import {
  OverviewFilterButton,
  OverviewFiltersButtons,
} from '@/components/overview/filters/overview-filters-buttons';
import { ReportChartShortcut } from '@/components/report-chart/shortcut';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from '@/hooks/use-event-query-filters';

import type { IChartEventItem } from '@openpanel/validation';

import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/events/_tabs/stats',
)({
  component: Component,
});

function Component() {
  const { projectId } = Route.useParams();
  const [filters] = useEventQueryFilters();
  const [events] = useEventQueryNamesFilter();
  const fallback: IChartEventItem[] = [
    {
      id: 'A',
      name: '*',
      displayName: 'All events',
      segment: 'event',
      filters: filters ?? [],
      type: 'event',
    },
  ];

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <OverviewFilterButton enableEventsFilter />
        <OverviewFiltersButtons className="justify-end p-0" />
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Widget className="w-full">
          <WidgetHead>
            <span className="title">Events per day</span>
          </WidgetHead>
          <WidgetBody>
            <ReportChartShortcut
              projectId={projectId}
              range="30d"
              chartType="histogram"
              series={
                events && events.length > 0
                  ? events.map((name) => ({
                      id: name,
                      name,
                      displayName: name,
                      segment: 'event',
                      filters: filters ?? [],
                      type: 'event',
                    }))
                  : fallback
              }
            />
          </WidgetBody>
        </Widget>
        <Widget className="w-full">
          <WidgetHead>
            <span className="title">Event distribution</span>
          </WidgetHead>
          <WidgetBody>
            <ReportChartShortcut
              projectId={projectId}
              range="30d"
              chartType="pie"
              breakdowns={[
                {
                  id: 'A',
                  name: 'name',
                },
              ]}
              series={
                events && events.length > 0
                  ? events.map((name) => ({
                      id: name,
                      name,
                      displayName: name,
                      segment: 'event',
                      filters: filters ?? [],
                      type: 'event',
                    }))
                  : [
                      {
                        id: 'A',
                        name: '*',
                        displayName: 'All events',
                        segment: 'event',
                        filters: filters ?? [],
                        type: 'event',
                      },
                    ]
              }
            />
          </WidgetBody>
        </Widget>
        <Widget className="w-full">
          <WidgetHead>
            <span className="title">Event distribution</span>
          </WidgetHead>
          <WidgetBody>
            <ReportChartShortcut
              projectId={projectId}
              range="30d"
              chartType="bar"
              breakdowns={[
                {
                  id: 'A',
                  name: 'name',
                },
              ]}
              series={
                events && events.length > 0
                  ? events.map((name) => ({
                      id: name,
                      name,
                      displayName: name,
                      segment: 'event',
                      filters: filters ?? [],
                      type: 'event',
                    }))
                  : [
                      {
                        id: 'A',
                        name: '*',
                        displayName: 'All events',
                        segment: 'event',
                        filters: filters ?? [],
                        type: 'event',
                      },
                    ]
              }
            />
          </WidgetBody>
        </Widget>
        <Widget className="w-full">
          <WidgetHead>
            <span className="title">Event distribution</span>
          </WidgetHead>
          <WidgetBody>
            <ReportChartShortcut
              projectId={projectId}
              range="30d"
              chartType="linear"
              breakdowns={[
                {
                  id: 'A',
                  name: 'name',
                },
              ]}
              series={
                events && events.length > 0
                  ? events.map((name) => ({
                      id: name,
                      name,
                      displayName: name,
                      segment: 'event',
                      filters: filters ?? [],
                      type: 'event',
                    }))
                  : [
                      {
                        id: 'A',
                        name: '*',
                        displayName: 'All events',
                        segment: 'event',
                        filters: filters ?? [],
                        type: 'event',
                      },
                    ]
              }
            />
          </WidgetBody>
        </Widget>
      </div>
    </div>
  );
}
