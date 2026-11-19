import { ReportChart } from '.';
import type { ReportChartProps } from './context';

type ChartRootShortcutProps = Omit<ReportChartProps, 'report'> & {
  projectId: ReportChartProps['report']['projectId'];
  range?: ReportChartProps['report']['range'];
  startDate?: ReportChartProps['report']['startDate'];
  endDate?: ReportChartProps['report']['endDate'];
  previous?: ReportChartProps['report']['previous'];
  chartType?: ReportChartProps['report']['chartType'];
  interval?: ReportChartProps['report']['interval'];
  series: ReportChartProps['report']['series'];
  breakdowns?: ReportChartProps['report']['breakdowns'];
  lineType?: ReportChartProps['report']['lineType'];
  /** Chart-type specific report options (stacked histogram, funnel mode…), as opposed to display `options`. */
  reportOptions?: ReportChartProps['report']['options'];
};

export const ReportChartShortcut = ({
  projectId,
  range = '7d',
  startDate,
  endDate,
  previous = false,
  chartType = 'linear',
  interval = 'day',
  series,
  breakdowns,
  lineType = 'monotone',
  reportOptions,
  options,
}: ChartRootShortcutProps) => {
  return (
    <ReportChart
      options={options ?? {}}
      report={{
        projectId,
        range,
        startDate,
        endDate,
        breakdowns: breakdowns ?? [],
        previous,
        chartType,
        interval,
        series,
        lineType,
        metric: 'sum',
        options: reportOptions,
      }}
    />
  );
};
