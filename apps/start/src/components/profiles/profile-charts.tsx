import { AI_INTERNAL_EVENT_NAMES } from '@openpanel/core/modules/ai/ai.constants';
import type { IReport } from '@openpanel/core/modules/report/report.constants';
import { memo } from 'react';
import { WidgetHead } from '../overview/overview-widget';
import { ReportChart } from '@/components/report-chart';
import { Widget, WidgetBody } from '@/components/widget';

const CHART_OPTIONS = { hideTable: true };

interface Props {
  profileId: string;
  projectId: string;
}

export const ProfileCharts = memo(
  ({ profileId, projectId }: Props) => {
    const pageViewsChart: IReport = {
      projectId,
      chartType: 'linear',
      series: [
        {
          type: 'event',
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
          name: 'screen_view',
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

    const eventsChart: IReport = {
      projectId,
      chartType: 'linear',
      series: [
        {
          type: 'event',
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
              operator: 'isNot',
              value: [...AI_INTERNAL_EVENT_NAMES],
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
        <Widget>
          <WidgetHead>
            <span className="title">Page views</span>
          </WidgetHead>
          <WidgetBody>
            <ReportChart options={CHART_OPTIONS} report={pageViewsChart} />
          </WidgetBody>
        </Widget>
        <Widget>
          <WidgetHead>
            <span className="title">Events per day</span>
          </WidgetHead>
          <WidgetBody>
            <ReportChart options={CHART_OPTIONS} report={eventsChart} />
          </WidgetBody>
        </Widget>
      </>
    );
  },
  (a, b) => {
    return a.profileId === b.profileId && a.projectId === b.projectId;
  }
);
