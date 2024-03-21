import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { OverviewFiltersButtons } from '@/components/overview/filters/overview-filters-buttons';
import { OverviewFiltersDrawer } from '@/components/overview/filters/overview-filters-drawer';
import {
  eventQueryFiltersParser,
  eventQueryNamesFilter,
} from '@/hooks/useEventQueryFilters';
import { parseAsInteger } from 'nuqs';

import { getEventList, getEventsCount } from '@openpanel/db';

import { StickyBelowHeader } from '../layout-sticky-below-header';
import { EventsPerDayChart } from './charts/events-per-day-chart';
import EventConversionsListServer from './event-conversions-list';
import { EventList } from './event-list';

interface PageProps {
  params: {
    projectId: string;
    organizationId: string;
  };
  searchParams: {
    events?: string;
    cursor?: string;
    f?: string;
  };
}

const nuqsOptions = {
  shallow: false,
};

export default async function Page({
  params: { projectId, organizationId },
  searchParams,
}: PageProps) {
  const filters =
    eventQueryFiltersParser.parseServerSide(searchParams.f ?? '') ?? undefined;
  const eventsFilter = eventQueryNamesFilter.parseServerSide(
    searchParams.events ?? ''
  );
  const [events, count] = await Promise.all([
    getEventList({
      cursor:
        parseAsInteger.parseServerSide(searchParams.cursor ?? '') ?? undefined,
      projectId,
      take: 50,
      events: eventsFilter,
      filters,
    }),
    getEventsCount({
      projectId,
      events: eventsFilter,
      filters,
    }),
  ]);

  return (
    <PageLayout title="Events" organizationSlug={organizationId}>
      <StickyBelowHeader className="p-4 flex justify-between">
        <OverviewFiltersDrawer
          mode="events"
          projectId={projectId}
          nuqsOptions={nuqsOptions}
          enableEventsFilter
        />
        <OverviewFiltersButtons
          className="p-0 justify-end"
          nuqsOptions={nuqsOptions}
        />
      </StickyBelowHeader>
      <div className="grid md:grid-cols-2 p-4 gap-4">
        <div>
          <EventList data={events} count={count} />
        </div>
        <div>
          <EventsPerDayChart
            projectId={projectId}
            events={eventsFilter}
            filters={filters}
          />
          <EventConversionsListServer projectId={projectId} />
        </div>
      </div>
    </PageLayout>
  );
}
