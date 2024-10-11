import { ReportChart } from '.';
import type { ReportChartProps } from './context';

type ChartRootShortcutProps = Omit<ReportChartProps, 'report'> & {
  projectId: ReportChartProps['report']['projectId'];
  range?: ReportChartProps['report']['range'];
  previous?: ReportChartProps['report']['previous'];
  chartType?: ReportChartProps['report']['chartType'];
  interval?: ReportChartProps['report']['interval'];
  events: ReportChartProps['report']['events'];
  breakdowns?: ReportChartProps['report']['breakdowns'];
  lineType?: ReportChartProps['report']['lineType'];
};

export const ReportChartShortcut = ({
  projectId,
  range = '7d',
  previous = false,
  chartType = 'linear',
  interval = 'day',
  events,
  breakdowns,
  lineType = 'monotone',
  options,
}: ChartRootShortcutProps) => {
  return (
    <ReportChart
      report={{
        name: 'Shortcut',
        projectId,
        range,
        breakdowns: breakdowns ?? [],
        previous,
        chartType,
        interval,
        events,
        lineType,
        metric: 'sum',
      }}
      options={options ?? {}}
    />
  );
};
