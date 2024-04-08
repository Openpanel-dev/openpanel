import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { OverviewFiltersButtons } from '@/components/overview/filters/overview-filters-buttons';
import { OverviewFiltersDrawer } from '@/components/overview/filters/overview-filters-drawer';
import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { ChartSwitch } from '@/components/report/chart';
import { SerieIcon } from '@/components/report/chart/SerieIcon';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import {
  eventQueryFiltersParser,
  eventQueryNamesFilter,
} from '@/hooks/useEventQueryFilters';
import { getProfileName } from '@/utils/getters';
import { notFound } from 'next/navigation';
import { parseAsInteger, parseAsString } from 'nuqs';

import type { GetEventListOptions } from '@openpanel/db';
import {
  getConversionEventNames,
  getEventList,
  getEventsCount,
  getProfileById,
} from '@openpanel/db';
import type { IChartEvent, IChartInput } from '@openpanel/validation';

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
  params: { projectId, profileId, organizationId: organizationSlug },
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
    range: '1m',
    previous: false,
    metric: 'sum',
  };

  if (!profile) {
    return notFound();
  }

  return (
    <PageLayout
      organizationSlug={organizationSlug}
      title={
        <div className="flex items-center gap-2">
          <ProfileAvatar {...profile} size="sm" className="hidden sm:block" />
          {getProfileName(profile)}
        </div>
      }
    >
      {/* <StickyBelowHeader className="flex justify-between p-4">
        <OverviewFiltersDrawer
          projectId={projectId}
          mode="events"
          nuqsOptions={{ shallow: false }}
        />
        <OverviewFiltersButtons
          nuqsOptions={{ shallow: false }}
          className="justify-end p-0"
        />
      </StickyBelowHeader> */}
      <div className="p-4">
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <EventList data={events} count={count} />
          </div>
          <div className="flex flex-col gap-4">
            <Widget className="w-full">
              <WidgetHead>
                <span className="title">Events per day</span>
              </WidgetHead>
              <WidgetBody className="flex gap-2">
                <ChartSwitch {...profileChart} />
              </WidgetBody>
            </Widget>
            <Widget className="w-full">
              <WidgetHead className="flex items-center justify-between">
                <span className="title">Profile</span>
                <ProfileAvatar {...profile} />
              </WidgetHead>
              <div className="grid grid-cols-1 text-sm">
                <ValueRow name={'ID'} value={profile.id} />
                <ValueRow name={'First name'} value={profile.firstName} />
                <ValueRow name={'Last name'} value={profile.lastName} />
                <ValueRow name={'Mail'} value={profile.email} />
                <ValueRow
                  name={'Last seen'}
                  value={profile.createdAt.toLocaleString()}
                />
              </div>
            </Widget>
            <Widget className="w-full">
              <WidgetHead>
                <span className="title">Properties</span>
              </WidgetHead>
              <div className="grid grid-cols-1 text-sm">
                {Object.entries(profile.properties)
                  .filter(([, value]) => !!value)
                  .map(([key, value]) => (
                    <ValueRow key={key} name={key} value={value} />
                  ))}
              </div>
            </Widget>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

function ValueRow({ name, value }: { name: string; value?: unknown }) {
  if (!value) {
    return null;
  }
  return (
    <div className="flex flex-row justify-between p-2 px-4">
      <div className="font-medium capitalize text-muted-foreground">
        {name.replace('_', ' ')}
      </div>
      <div className="flex items-center gap-2 text-right">
        {typeof value === 'string' ? (
          <>
            <SerieIcon name={value} /> {value}
          </>
        ) : (
          <>{value}</>
        )}
      </div>
    </div>
  );
}
