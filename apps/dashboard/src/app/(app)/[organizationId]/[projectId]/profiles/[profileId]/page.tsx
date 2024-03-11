import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { OverviewFiltersButtons } from '@/components/overview/filters/overview-filters-buttons';
import { OverviewFiltersDrawer } from '@/components/overview/filters/overview-filters-drawer';
import { ProfileAvatar } from '@/components/profiles/ProfileAvatar';
import { ChartSwitch } from '@/components/report/chart';
import { KeyValue } from '@/components/ui/key-value';
import { Widget, WidgetBody, WidgetHead } from '@/components/Widget';
import {
  eventQueryFiltersParser,
  eventQueryNamesFilter,
} from '@/hooks/useEventQueryFilters';
import { getExists } from '@/server/pageExists';
import { cn } from '@/utils/cn';
import { getProfileName } from '@/utils/getters';
import type { GetEventListOptions } from '@openpanel/db';
import {
  getConversionEventNames,
  getEventList,
  getEventsCount,
  getProfileById,
} from '@openpanel/db';
import type { IChartEvent, IChartInput } from '@openpanel/validation';
import { notFound } from 'next/navigation';
import { parseAsInteger, parseAsString } from 'nuqs';

import { EventList } from '../../events/event-list';
import { StickyBelowHeader } from '../../layout-sticky-below-header';

interface PageProps {
  params: {
    projectId: string;
    profileId: string;
    organizationId: string;
  };
  searchParams: {
    events?: string;
    cursor?: string;
    f?: string;
    startDate: string;
    endDate: string;
  };
}

export default async function Page({
  params: { projectId, profileId, organizationId },
  searchParams,
}: PageProps) {
  const eventListOptions: GetEventListOptions = {
    projectId,
    profileId,
    take: 50,
    cursor:
      parseAsInteger.parseServerSide(searchParams.cursor ?? '') ?? undefined,
    events: eventQueryNamesFilter.parseServerSide(searchParams.events ?? ''),
    filters:
      eventQueryFiltersParser.parseServerSide(searchParams.f ?? '') ??
      undefined,
  };
  const startDate = parseAsString.parseServerSide(searchParams.startDate);
  const endDate = parseAsString.parseServerSide(searchParams.endDate);
  const [profile, events, count, conversions] = await Promise.all([
    getProfileById(profileId),
    getEventList(eventListOptions),
    getEventsCount(eventListOptions),
    getConversionEventNames(projectId),
    getExists(organizationId, projectId),
  ]);

  const chartSelectedEvents: IChartEvent[] = [
    {
      segment: 'event',
      filters: [
        {
          id: 'profile_id',
          name: 'profile_id',
          operator: 'is',
          value: [profileId],
        },
      ],
      id: 'A',
      name: '*',
      displayName: 'Events',
    },
  ];

  if (conversions.length) {
    chartSelectedEvents.push({
      segment: 'event',
      filters: [
        {
          id: 'profile_id',
          name: 'profile_id',
          operator: 'is',
          value: [profileId],
        },
        {
          id: 'name',
          name: 'name',
          operator: 'is',
          value: conversions.map((c) => c.name),
        },
      ],
      id: 'B',
      name: '*',
      displayName: 'Conversions',
    });
  }

  const profileChart: IChartInput = {
    projectId,
    startDate,
    endDate,
    chartType: 'histogram',
    events: chartSelectedEvents,
    breakdowns: [],
    lineType: 'monotone',
    interval: 'day',
    name: 'Events',
    range: '7d',
    previous: false,
    metric: 'sum',
  };

  if (!profile) {
    return notFound();
  }

  return (
    <PageLayout
      organizationSlug={organizationId}
      title={
        <div className="flex items-center gap-2">
          <ProfileAvatar {...profile} size="sm" className="hidden sm:block" />
          {getProfileName(profile)}
        </div>
      }
    >
      <StickyBelowHeader className="p-4 flex justify-between">
        <OverviewFiltersDrawer
          projectId={projectId}
          mode="events"
          nuqsOptions={{ shallow: false }}
        />
        <OverviewFiltersButtons
          nuqsOptions={{ shallow: false }}
          className="p-0 justify-end"
        />
      </StickyBelowHeader>
      <div className="p-4">
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 mb-8">
          <Widget>
            <WidgetHead>
              <span className="title">Properties</span>
            </WidgetHead>
            <WidgetBody className="flex gap-2 flex-wrap">
              {Object.entries(profile.properties)
                .filter(([, value]) => !!value)
                .map(([key, value]) => (
                  <KeyValue key={key} name={key} value={value} />
                ))}
            </WidgetBody>
          </Widget>
          <Widget>
            <WidgetHead>
              <span className="title">Events per day</span>
            </WidgetHead>
            <WidgetBody className="flex gap-2">
              <ChartSwitch {...profileChart} />
            </WidgetBody>
          </Widget>
        </div>
        <EventList data={events} count={count} />
      </div>
    </PageLayout>
  );
}
