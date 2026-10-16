import { alphabetIds } from '@openpanel/core/modules/report/report.constants';
import { ChevronRightIcon, InfoIcon, UsersIcon } from 'lucide-react';
import { getPreviousMetric } from '../../../utils/previous-metric';
import { PreviousDiffIndicatorPure } from '../common/previous-diff-indicator';
import { useReportChartContext } from '../context';
import { ColorSquare } from '@/components/color-square';
import { Button } from '@/components/ui/button';
import { Tooltiper } from '@/components/ui/tooltip';
import { WidgetTable } from '@/components/widget-table';
import { useNumber } from '@/hooks/use-numer-formatter';
import { pushModal } from '@/modals';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';

interface Props {
  data: {
    current: RouterOutputs['chart']['funnel']['current'][number];
    previous: RouterOutputs['chart']['funnel']['current'][number] | null;
  };
  noTopBorderRadius?: boolean;
}

export const Metric = ({
  label,
  value,
  enhancer,
  className,
}: {
  label: string;
  value: React.ReactNode;
  enhancer?: React.ReactNode;
  className?: string;
}) => (
  <div className={cn('col flex-1 justify-between gap-1', className)}>
    <div className="text-muted-foreground text-sm">{label}</div>
    <div className="row items-center justify-between gap-2">
      <div className="font-mono font-semibold">{value}</div>
      {enhancer && <div>{enhancer}</div>}
    </div>
  </div>
);

export function Summary({ data }: { data: RouterOutputs['chart']['funnel'] }) {
  const number = useNumber();
  const highestConversion = data.current
    .slice(0)
    .sort((a, b) => b.lastStep.percent - a.lastStep.percent)[0];
  const highestCount = data.current
    .slice(0)
    .sort((a, b) => b.lastStep.count - a.lastStep.count)[0];
  return (
    <div className="grid grid-cols-2 gap-4">
      {highestConversion && (
        <div className="card row items-center p-4 py-3">
          <Metric
            label="Highest conversion rate"
            value={
              <ChartName breakdowns={highestConversion.breakdowns ?? []} />
            }
          />
          <span className="font-mono font-semibold text-xl">
            {number.formatWithUnit(
              highestConversion.lastStep.percent / 100,
              '%'
            )}
          </span>
        </div>
      )}
      {highestCount && (
        <div className="card row items-center p-4 py-3">
          <Metric
            label="Most conversions"
            value={<ChartName breakdowns={highestCount.breakdowns ?? []} />}
          />
          <span className="font-mono font-semibold text-xl">
            {number.format(highestCount.lastStep.count)}
          </span>
        </div>
      )}
    </div>
  );
}

function ChartName({
  breakdowns,
  className,
}: {
  breakdowns: string[];
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2 font-medium', className)}>
      {breakdowns.map((name, index) => {
        return (
          <>
            {index !== 0 && <ChevronRightIcon className="size-3" />}
            <span key={name}>{name}</span>
          </>
        );
      })}
    </div>
  );
}

export function Tables({
  data: {
    current: { steps, mostDropoffsStep, lastStep, breakdowns },
    previous: previousData,
  },
  noTopBorderRadius,
}: Props) {
  const number = useNumber();
  const hasHeader = breakdowns.length > 0;
  const {
    report: {
      projectId,
      startDate,
      endDate,
      range,
      interval,
      series: reportSeries,
      breakdowns: reportBreakdowns,
      previous,
      options,
    },
    shareId,
  } = useReportChartContext();

  const funnelOptions = options?.type === 'funnel' ? options : undefined;

  const handleInspectStep = (step: (typeof steps)[0], stepIndex: number) => {
    if (!(projectId && step.event.id)) {
      return;
    }

    // For funnels, we need to pass the step index so the modal can query
    // users who completed at least that step in the funnel sequence
    pushModal('ViewChartUsers', {
      type: 'funnel',
      report: {
        projectId,
        series: reportSeries,
        breakdowns: reportBreakdowns || [],
        interval: interval || 'day',
        startDate,
        endDate,
        range,
        previous,
        chartType: 'funnel',
        metric: 'sum',
        options: funnelOptions,
      },
      stepIndex,
      breakdownValues: breakdowns,
    });
  };
  return (
    <div
      className={cn(
        'col @container card divide-y divide-border',
        noTopBorderRadius && 'rounded-t-none'
      )}
    >
      {hasHeader && <ChartName breakdowns={breakdowns} className="p-4 py-3" />}
      <div
        className={cn(
          'bg-def-100',
          !hasHeader && 'rounded-t-md',
          noTopBorderRadius && 'rounded-t-none'
        )}
      >
        <div className="col md:row divide-border max-md:divide-y md:items-center md:divide-x">
          <Metric
            className="p-4 py-3"
            enhancer={
              previousData && (
                <PreviousDiffIndicatorPure
                  {...getPreviousMetric(
                    lastStep?.percent,
                    previousData.lastStep?.percent
                  )}
                />
              )
            }
            label="Conversion"
            value={number.formatWithUnit(lastStep?.percent / 100, '%')}
          />
          <Metric
            className="p-4 py-3"
            enhancer={
              previousData && (
                <PreviousDiffIndicatorPure
                  {...getPreviousMetric(
                    lastStep?.count,
                    previousData.lastStep?.count
                  )}
                />
              )
            }
            label="Completed"
            value={number.format(lastStep?.count)}
          />
          {!!mostDropoffsStep && (
            <Metric
              className="p-4 py-3"
              enhancer={
                <Tooltiper
                  content={
                    <span>
                      <span className="font-semibold">
                        {mostDropoffsStep?.dropoffCount}
                      </span>{' '}
                      dropped after this event. Improve this step and your
                      conversion rate will likely increase.
                    </span>
                  }
                  tooltipClassName="max-w-xs"
                >
                  <InfoIcon className="size-3" />
                </Tooltiper>
              }
              label="Most dropoffs after"
              value={mostDropoffsStep?.event?.displayName}
            />
          )}
        </div>
      </div>
      <div className="col divide-y divide-def-200">
        <WidgetTable
          className={'@container text-sm'}
          columnClassName="px-2 group/row items-center"
          columns={[
            {
              name: 'Event',
              render: (item, index) => (
                <div className="row relative min-w-0 items-center gap-2">
                  <ColorSquare color={getChartColor(index)}>
                    {alphabetIds[index]}
                  </ColorSquare>
                  <span className="truncate">{item.event.displayName}</span>
                </div>
              ),
              width: 'w-full',
              className: 'text-left font-mono font-semibold',
            },
            {
              name: 'Completed',
              render: (item) => number.format(item.count),
              className: 'text-right font-mono hidden @xl:block',
              width: '82px',
            },
            {
              name: 'Dropped after',
              render: (item) =>
                item.dropoffCount !== null && item.dropoffPercent !== null
                  ? number.format(item.dropoffCount)
                  : null,
              className: 'text-right font-mono hidden @xl:block',
              width: '110px',
            },
            {
              name: 'Conversion',
              render: (item) => number.formatWithUnit(item.percent / 100, '%'),
              className: 'text-right font-mono font-semibold',
              width: '90px',
            },
            {
              name: '',
              render: (item) =>
                shareId ? null : (
                  <Button
                    className="h-8 w-8 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      const stepIndex = steps.findIndex(
                        (s) => s.event.id === item.event.id
                      );
                      handleInspectStep(item, stepIndex);
                    }}
                    size="sm"
                    title="View users who completed this step"
                    variant="ghost"
                  >
                    <UsersIcon size={16} />
                  </Button>
                ),
              className: 'text-right',
              width: '48px',
            },
          ]}
          data={steps}
          eachRow={(item, index) => {
            return (
              <div className="!p-0 absolute inset-px">
                <div
                  className={cn(
                    'relative h-full bg-def-300 transition-colors group-hover/row:bg-blue-200 dark:group-hover/row:bg-blue-900',
                    item.isHighestDropoff && [
                      'bg-red-500/20',
                      'group-hover/row:bg-red-500/70',
                    ],
                    index === steps.length - 1 && 'rounded-bl-sm'
                  )}
                  style={{
                    width: `${item.percent}%`,
                  }}
                />
              </div>
            );
          }}
          keyExtractor={(item) => item.event.id!}
        />
      </div>
    </div>
  );
}
