'use client';

import { memo } from 'react';
import { ChartSwitch } from '@/components/report/chart';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';

import type { IChartInput } from '@openpanel/validation';

type Props = {
  profileId: string;
  projectId: string;
};

const ProfileCharts = ({ profileId, projectId }: Props) => {
  const pageViewsChart: IChartInput = {
    projectId,
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

  return (
    <>
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
    </>
  );
};

// No clue why I need to check for equality here
export default memo(ProfileCharts, (a, b) => {
  return a.profileId === b.profileId && a.projectId === b.projectId;
});
