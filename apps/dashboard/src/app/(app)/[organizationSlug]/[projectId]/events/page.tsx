import PageLayout from '@/app/(app)/[organizationSlug]/[projectId]/page-layout';
import { OverviewFiltersButtons } from '@/components/overview/filters/overview-filters-buttons';
import { OverviewFiltersDrawer } from '@/components/overview/filters/overview-filters-drawer';
import {
  eventQueryFiltersParser,
  eventQueryNamesFilter,
} from '@/hooks/useEventQueryFilters';
import { parseAsInteger } from 'nuqs';

import { StickyBelowHeader } from '../layout-sticky-below-header';
import { EventsPerDayChart } from './charts/events-per-day-chart';
import EventConversionsListServer from './event-conversions-list';
import EventListServer from './event-list';

interface PageProps {
  params: {
    projectId: string;
    organizationSlug: string;
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

export default function Page({
  params: { projectId, organizationSlug },
  searchParams,
}: PageProps) {
  const cursor =
    parseAsInteger.parseServerSide(searchParams.cursor ?? '') ?? undefined;
  const filters =
    eventQueryFiltersParser.parseServerSide(searchParams.f ?? '') ?? undefined;
  const eventNames =
    eventQueryNamesFilter.parseServerSide(searchParams.events) ?? undefined;

  return (
    <>
      <PageLayout title="Events" organizationSlug={organizationSlug} />
      <StickyBelowHeader className="flex justify-between p-4">
        <OverviewFiltersDrawer
          mode="events"
          projectId={projectId}
          nuqsOptions={nuqsOptions}
          enableEventsFilter
        />
        <OverviewFiltersButtons
          className="justify-end p-0"
          nuqsOptions={nuqsOptions}
        />
      </StickyBelowHeader>
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <div>
          <EventListServer
            projectId={projectId}
            cursor={cursor}
            filters={filters}
            eventNames={eventNames}
          />
        </div>
        <div className="flex flex-col gap-4">
          <EventsPerDayChart
            projectId={projectId}
            events={eventNames}
            filters={filters}
          />
          <EventConversionsListServer projectId={projectId} />
        </div>
      </div>
    </>
  );
}
