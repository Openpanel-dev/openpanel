import PageLayout from '@/app/(app)/[organizationSlug]/[projectId]/page-layout';
import { DataTable } from '@/components/data-table';
import { OverviewFiltersButtons } from '@/components/overview/filters/overview-filters-buttons';
import { OverviewFiltersDrawer } from '@/components/overview/filters/overview-filters-drawer';
import { Padding, Spacer } from '@/components/ui/padding';
import { Table, TableHead, TableHeader } from '@/components/ui/table';
import {
  eventQueryFiltersParser,
  eventQueryNamesFilter,
} from '@/hooks/useEventQueryFilters';
import { LineChart, TableIcon } from 'lucide-react';
import { parseAsInteger } from 'nuqs';

import { StickyBelowHeader } from '../layout-sticky-below-header';
import { EventsPerDayChart } from './charts/events-per-day-chart';
import EventConversionsListServer from './event-conversions-list';
import EventListServer from './event-list';
import EventListener from './event-list/event-listener';

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

      <Padding>
        <div className="rounded border bg-background">
          <div className="flex items-center gap-4 border-b p-2">
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-2 py-1.5 text-lg font-semibold leading-none">
              <TableIcon /> Events
            </div>
            <div className="flex items-center gap-2 px-2 py-1.5 text-lg leading-none text-muted-foreground">
              <TableIcon /> Conversions
            </div>
            <div className="flex items-center gap-2 px-2 py-1.5 text-lg leading-none text-muted-foreground">
              <LineChart /> Stats
            </div>
          </div>
          <Padding>
            <div className="mb-2 flex gap-2">
              <EventListener />
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
            </div>
            <EventListServer
              projectId={projectId}
              cursor={cursor}
              filters={filters}
              eventNames={eventNames}
            />
          </Padding>
        </div>
      </Padding>
    </>
  );
}
