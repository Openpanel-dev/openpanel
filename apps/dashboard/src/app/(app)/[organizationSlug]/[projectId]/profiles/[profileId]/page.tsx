import { Suspense } from 'react';
import PageLayout from '@/app/(app)/[organizationSlug]/[projectId]/page-layout';
import ClickToCopy from '@/components/click-to-copy';
import { ListPropertiesIcon } from '@/components/events/list-properties-icon';
import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { ChartSwitch } from '@/components/report/chart';
import { Tooltiper } from '@/components/ui/tooltip';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import {
  eventQueryFiltersParser,
  eventQueryNamesFilter,
} from '@/hooks/useEventQueryFilters';
import { clipboard } from '@/utils/clipboard';
import { getProfileName } from '@/utils/getters';
import { CopyIcon } from 'lucide-react';
import { notFound } from 'next/navigation';
import { parseAsInteger, parseAsString } from 'nuqs';
import { toast } from 'sonner';

import type { GetEventListOptions } from '@openpanel/db';
import { getEventList, getEventsCount, getProfileById } from '@openpanel/db';
import type { IChartInput } from '@openpanel/validation';

import { EventList } from '../../events/event-list';
import { StickyBelowHeader } from '../../layout-sticky-below-header';
import MostEventsServer from './most-events';
import PopularRoutesServer from './popular-routes';
import ProfileActivityServer from './profile-activity';
import ProfileMetrics from './profile-metrics';

interface PageProps {
  params: {
    organizationSlug: string;
    projectId: string;
    profileId: string;
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
  params: { projectId, profileId, organizationSlug },
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
  const profile = await getProfileById(profileId, projectId);

  const pageViewsChart: IChartInput = {
    projectId,
    startDate,
    endDate,
    chartType: 'linear',
    events: [
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
    ],
    breakdowns: [
      {
        id: 'path',
        name: 'path',
      },
    ],
    lineType: 'monotone',
    interval: 'day',
    name: 'Events',
    range: '30d',
    previous: false,
    metric: 'sum',
  };

  const eventsChart: IChartInput = {
    projectId,
    startDate,
    endDate,
    chartType: 'linear',
    events: [
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
    ],
    breakdowns: [
      {
        id: 'name',
        name: 'name',
      },
    ],
    lineType: 'monotone',
    interval: 'day',
    name: 'Events',
    range: '30d',
    previous: false,
    metric: 'sum',
  };

  if (!profile) {
    return notFound();
  }

  return (
    <>
      <PageLayout organizationSlug={organizationSlug} title={<div />} />
      <StickyBelowHeader className="!relative !top-auto !z-0 flex flex-col gap-8 p-4 md:flex-row md:items-center md:p-8">
        <div className="flex flex-1 gap-4">
          <ProfileAvatar {...profile} size={'lg'} />
          <div className="min-w-0">
            <ClickToCopy value={profile.id}>
              <h1 className="max-w-full overflow-hidden text-ellipsis break-words text-lg font-semibold md:max-w-sm md:whitespace-nowrap md:text-2xl">
                {getProfileName(profile)}
              </h1>
            </ClickToCopy>
            <div className="mt-1 flex items-center gap-4">
              <ListPropertiesIcon {...profile.properties} />
            </div>
          </div>
        </div>
        <ProfileMetrics profileId={profileId} projectId={projectId} />
      </StickyBelowHeader>
      <div className="p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          <div className="col-span-2">
            <ProfileActivityServer
              profileId={profileId}
              projectId={projectId}
            />
          </div>
          <div className="col-span-2">
            <MostEventsServer profileId={profileId} projectId={projectId} />
          </div>
          <div className="col-span-2">
            <PopularRoutesServer profileId={profileId} projectId={projectId} />
          </div>
          <Widget className="col-span-3 w-full">
            <WidgetHead>
              <span className="title">Page views</span>
            </WidgetHead>
            <WidgetBody className="flex gap-2">
              <ChartSwitch {...pageViewsChart} />
            </WidgetBody>
          </Widget>
          <Widget className="col-span-3 w-full">
            <WidgetHead>
              <span className="title">Events per day</span>
            </WidgetHead>
            <WidgetBody className="flex gap-2">
              <ChartSwitch {...eventsChart} />
            </WidgetBody>
          </Widget>
        </div>
        <div className="mt-8">
          <Suspense fallback={<div />}>
            <EventListServer {...eventListOptions} />
          </Suspense>
        </div>
      </div>
    </>
  );
}

async function EventListServer(props: GetEventListOptions) {
  const [events, count] = await Promise.all([
    getEventList(props),
    getEventsCount(props),
  ]);
  return <EventList data={events} count={count} />;
}
