'use client';

import type { IChartInput } from '@/types';
import { cn } from '@/utils/cn';
import { ChevronsUpDownIcon } from 'lucide-react';
import AnimateHeight from 'react-animate-height';

import { Chart } from '../report/chart';
import { Widget, WidgetBody, WidgetHead } from '../Widget';
import { useOverviewOptions } from './useOverviewOptions';

interface OverviewLiveHistogramProps {
  projectId: string;
}
export function OverviewLiveHistogram({
  projectId,
}: OverviewLiveHistogramProps) {
  const { liveHistogram, setLiveHistogram } = useOverviewOptions();
  const report: IChartInput = {
    projectId,
    events: [
      {
        segment: 'user',
        filters: [
          {
            id: '1',
            name: 'name',
            operator: 'is',
            value: ['screen_view', 'session_start'],
          },
        ],
        id: 'A',
        name: '*',
        displayName: 'Active users',
      },
    ],
    chartType: 'histogram',
    interval: 'minute',
    range: '30min',
    name: '',
    metric: 'sum',
    breakdowns: [],
    lineType: 'monotone',
    previous: true,
  };

  return (
    <Widget>
      <button onClick={() => setLiveHistogram((p) => !p)} className="w-full">
        <WidgetHead
          className={cn(
            'flex justify-between items-center',
            !liveHistogram && 'border-b-0'
          )}
        >
          <div className="title">Active users last 30 minutes</div>
          <ChevronsUpDownIcon size={16} />
        </WidgetHead>
      </button>

      <AnimateHeight duration={500} height={liveHistogram ? 'auto' : 0}>
        <WidgetBody>
          <Chart {...report} />
        </WidgetBody>
      </AnimateHeight>
    </Widget>
  );
}
