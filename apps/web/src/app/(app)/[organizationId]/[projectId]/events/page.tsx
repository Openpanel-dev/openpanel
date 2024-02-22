import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { OverviewFiltersButtons } from '@/components/overview/filters/overview-filters-buttons';
import { OverviewFiltersDrawer } from '@/components/overview/filters/overview-filters-drawer';
import {
  eventQueryFiltersParser,
  eventQueryNamesFilter,
} from '@/hooks/useEventQueryFilters';
import { getExists } from '@/server/pageExists';
import { parseAsInteger } from 'nuqs';

import { getEventList, getEventsCount } from '@mixan/db';

import { StickyBelowHeader } from '../layout-sticky-below-header';
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
  const [events, count] = await Promise.all([
    getEventList({
      cursor: parseAsInteger.parse(searchParams.cursor ?? '') ?? undefined,
      projectId,
      take: 50,
      events: eventQueryNamesFilter.parse(searchParams.events ?? ''),
      filters: eventQueryFiltersParser.parse(searchParams.f ?? '') ?? undefined,
    }),
    getEventsCount({
      projectId,
      events: eventQueryNamesFilter.parse(searchParams.events ?? ''),
      filters: eventQueryFiltersParser.parse(searchParams.f ?? '') ?? undefined,
    }),
    getExists(organizationId, projectId),
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
      <EventList data={events} count={count} />
    </PageLayout>
  );
}
