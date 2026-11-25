import type {
  IChartBreakdown,
  IChartEventItem,
  IHistogramOptions,
} from '@openpanel/core/modules/report/report.constants';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import {
  OverviewFilterButton,
  OverviewFiltersButtons,
} from '@/components/overview/filters/overview-filters-buttons';
import { OverviewInterval } from '@/components/overview/overview-interval';
import { OverviewRange } from '@/components/overview/overview-range';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { ReportChartShortcut } from '@/components/report-chart/shortcut';
import { ComboboxEvents } from '@/components/ui/combobox-events';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { useEventNames } from '@/hooks/use-event-names';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from '@/hooks/use-event-query-filters';
import {
  TranslationText as DashboardText,
  useTranslation as useDashboardTranslation,
} from '@/i18n/provider';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/events/_tabs/stats'
)({
  component: Component,
});

const BREAKDOWN_BY_EVENT_NAME: IChartBreakdown[] = [{ id: 'A', name: 'name' }];
const STACKED_HISTOGRAM: IHistogramOptions = {
  type: 'histogram',
  stacked: true,
};
// Breaking down by `name` nests the event under itself; show only the event.
const breakdownChartOptions = {
  hideTable: true,
  renderSerieName(names: string[]) {
    return names.at(-1);
  },
};

function Component() {
  const { t: translateUi } = useDashboardTranslation();

  const { projectId } = Route.useParams();
  const { range, startDate, endDate, interval } = useOverviewOptions();
  const [filters] = useEventQueryFilters();
  const [eventNames, setEventNames] = useEventQueryNamesFilter();
  const availableEvents = useEventNames({ projectId, anyEvents: false });

  const series = useMemo<IChartEventItem[]>(() => {
    const names = eventNames.length > 0 ? eventNames : ['*'];
    return names.map((name) => ({
      id: name,
      name,
      displayName: name === '*' ? 'All events' : name,
      segment: 'event',
      filters: filters ?? [],
      type: 'event',
    }));
  }, [eventNames, filters]);

  const timeWindow = { range, startDate, endDate, interval };

  return (
    <div>
      <div className="col mb-2 gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <OverviewRange />
          <OverviewInterval />
          <ComboboxEvents
            items={availableEvents}
            maxDisplayItems={2}
            multiple
            onChange={setEventNames}
            placeholder={translateUi('All events')}
            searchable
            value={eventNames}
          />
          <OverviewFilterButton enableEventsFilter />
        </div>
        <OverviewFiltersButtons
          className="p-0"
          filterModal={{ enableEventsFilter: true }}
        />
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Widget className="w-full">
          <WidgetHead>
            <span className="title">
              <DashboardText i18nKey={'Events over time'} />
            </span>
          </WidgetHead>
          <WidgetBody>
            <ReportChartShortcut
              breakdowns={BREAKDOWN_BY_EVENT_NAME}
              chartType="histogram"
              options={breakdownChartOptions}
              projectId={projectId}
              reportOptions={STACKED_HISTOGRAM}
              series={series}
              {...timeWindow}
            />
          </WidgetBody>
        </Widget>
        <Widget className="w-full">
          <WidgetHead>
            <span className="title">
              <DashboardText i18nKey={'Share of events'} />
            </span>
          </WidgetHead>
          <WidgetBody>
            <ReportChartShortcut
              breakdowns={BREAKDOWN_BY_EVENT_NAME}
              chartType="pie"
              options={breakdownChartOptions}
              projectId={projectId}
              series={series}
              {...timeWindow}
            />
          </WidgetBody>
        </Widget>
        <Widget className="w-full">
          <WidgetHead>
            <span className="title">
              <DashboardText i18nKey={'Events by name'} />
            </span>
          </WidgetHead>
          <WidgetBody>
            <ReportChartShortcut
              breakdowns={BREAKDOWN_BY_EVENT_NAME}
              chartType="bar"
              options={breakdownChartOptions}
              projectId={projectId}
              series={series}
              {...timeWindow}
            />
          </WidgetBody>
        </Widget>
        <Widget className="w-full">
          <WidgetHead>
            <span className="title">
              <DashboardText i18nKey={'Trend by event'} />
            </span>
          </WidgetHead>
          <WidgetBody>
            <ReportChartShortcut
              breakdowns={BREAKDOWN_BY_EVENT_NAME}
              chartType="linear"
              options={breakdownChartOptions}
              projectId={projectId}
              series={series}
              {...timeWindow}
            />
          </WidgetBody>
        </Widget>
      </div>
    </div>
  );
}
