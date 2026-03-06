import { getPreviousMetric } from '@openpanel/common';
import { alphabetIds } from '@openpanel/constants';
import { ChevronRightIcon, InfoIcon, UsersIcon } from 'lucide-react';
import { useCallback } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { useXAxisProps, useYAxisProps } from '../common/axis';
import { PreviousDiffIndicatorPure } from '../common/previous-diff-indicator';
import { SerieIcon } from '../common/serie-icon';
import { SerieName } from '../common/serie-name';
import { useReportChartContext } from '../context';
import { createChartTooltip } from '@/components/charts/chart-tooltip';
import { BarShapeProps } from '@/components/charts/common-bar';
import { ColorSquare } from '@/components/color-square';
import { Button } from '@/components/ui/button';
import { Tooltiper } from '@/components/ui/tooltip';
import { WidgetTable } from '@/components/widget-table';
import { useNumber } from '@/hooks/use-numer-formatter';
import { pushModal } from '@/modals';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor, getChartTranslucentColor } from '@/utils/theme';

type Props = {
  data: {
    current: RouterOutputs['chart']['funnel']['current'][number];
    previous: RouterOutputs['chart']['funnel']['current'][number] | null;
  };
  noTopBorderRadius?: boolean;
};

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
              render: (item) => (
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

type RechartData = {
  name: string;
  [key: `step:percent:${number}`]: number | null;
  [key: `step:data:${number}`]:
    | (RouterOutputs['chart']['funnel']['current'][number] & {
        step: RouterOutputs['chart']['funnel']['current'][number]['steps'][number];
      })
    | null;
  [key: `prev_step:percent:${number}`]: number | null;
  [key: `prev_step:data:${number}`]:
    | (RouterOutputs['chart']['funnel']['current'][number] & {
        step: RouterOutputs['chart']['funnel']['current'][number]['steps'][number];
      })
    | null;
};

const useRechartData = ({
  current,
  previous,
  visibleBreakdowns,
}: RouterOutputs['chart']['funnel'] & {
  visibleBreakdowns: RouterOutputs['chart']['funnel']['current'];
}): RechartData[] => {
  const firstFunnel = current[0];
  // Create a map of original index to visible index
  const visibleBreakdownIds = new Set(visibleBreakdowns.map((b) => b.id));
  const originalToVisibleIndex = new Map<number, number>();
  let visibleIndex = 0;
  current.forEach((item, originalIndex) => {
    if (visibleBreakdownIds.has(item.id)) {
      originalToVisibleIndex.set(originalIndex, visibleIndex);
      visibleIndex++;
    }
  });

  return (
    firstFunnel?.steps.map((step, stepIndex) => {
      return {
        id: step?.event.id ?? '',
        name: step?.event.displayName ?? '',
        ...visibleBreakdowns.reduce((acc, visibleItem, visibleIdx) => {
          // Find the original index for this visible breakdown
          const originalIndex = current.findIndex(
            (item) => item.id === visibleItem.id
          );
          if (originalIndex === -1) {
            return acc;
          }

          const diff = previous?.[originalIndex];
          return {
            ...acc,
            [`step:percent:${visibleIdx}`]:
              visibleItem.steps[stepIndex]?.percent ?? null,
            [`step:data:${visibleIdx}`]: {
              ...visibleItem,
              step: visibleItem.steps[stepIndex],
            },
            [`prev_step:percent:${visibleIdx}`]:
              diff?.steps[stepIndex]?.percent ?? null,
            [`prev_step:data:${visibleIdx}`]: diff
              ? {
                  ...diff,
                  step: diff?.steps?.[stepIndex],
                }
              : null,
          };
        }, {}),
      };
    }) ?? []
  );
};

const StripedBarShape = (props: any) => {
  const { x, y, width, height, fill, stroke, value } = props;
  const patternId = `prev-stripes-${(fill || '').replace(/[^a-z0-9]/gi, '')}`;
  return (
    <g>
      <defs>
        <pattern
          height="6"
          id={patternId}
          patternTransform="rotate(-45)"
          patternUnits="userSpaceOnUse"
          width="6"
        >
          <rect fill="transparent" height="6" width="6" />
          <rect fill={fill} height="6" width="3" />
        </pattern>
      </defs>
      <rect
        fill={`url(#${patternId})`}
        height={height}
        rx={3}
        width={width}
        x={x}
        y={y}
      />
      {value > 0 && (
        <rect
          fill={stroke}
          height={2}
          opacity={0.6}
          rx={2}
          stroke="none"
          width={width}
          x={x}
          y={y - 3}
        />
      )}
    </g>
  );
};

export function Chart({
  data,
  visibleBreakdowns,
}: {
  data: RouterOutputs['chart']['funnel'];
  visibleBreakdowns: RouterOutputs['chart']['funnel']['current'];
}) {
  const rechartData = useRechartData({ ...data, visibleBreakdowns });
  const xAxisProps = useXAxisProps();
  const yAxisProps = useYAxisProps();
  const hasBreakdowns = data.current.length > 1;
  const hasVisibleBreakdowns = visibleBreakdowns.length > 1;
  const hasPrevious =
    data.previous !== null &&
    data.previous !== undefined &&
    data.previous.length > 0;
  const showPreviousBars = hasPrevious && !hasBreakdowns;

  const CustomLegend = useCallback(() => {
    if (!hasVisibleBreakdowns) {
      return null;
    }
    return (
      <div className="mt-4 -mb-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
        {visibleBreakdowns.map((breakdown, idx) => {
          const stableIndex = data.current.findIndex((b) => b.id === breakdown.id);
          const colorIndex = stableIndex >= 0 ? stableIndex : idx;
          return (
            <div
              className="flex items-center gap-1.5 rounded px-2 py-1"
              key={breakdown.id}
              style={{
                color: getChartColor(colorIndex),
              }}
            >
              <SerieIcon name={breakdown.breakdowns ?? []} />
              <SerieName
                className="font-semibold"
                name={
                  breakdown.breakdowns && breakdown.breakdowns.length > 0
                    ? breakdown.breakdowns
                    : ['Funnel']
                }
              />
            </div>
          );
        })}
      </div>
    );
  }, [visibleBreakdowns, hasVisibleBreakdowns]);

  const PreviousLegend = useCallback(() => {
    if (!showPreviousBars) {
      return null;
    }
    return (
      <div className="mt-4 -mb-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs">
        <div className="flex items-center gap-1.5 rounded px-2 py-1">
          <div
            className="h-3 w-3 rounded-[2px]"
            style={{
              background: 'rgba(59, 121, 255, 0.3)',
              borderTop: '2px solid rgba(59, 121, 255, 1)',
            }}
          />
          <span className="font-medium text-muted-foreground">Current</span>
        </div>
        <div className="flex items-center gap-1.5 rounded px-2 py-1">
          <svg height="12" viewBox="0 0 12 12" width="12">
            <defs>
              <pattern
                height="4"
                id="legend-stripes"
                patternTransform="rotate(-45)"
                patternUnits="userSpaceOnUse"
                width="4"
              >
                <rect fill="transparent" height="4" width="4" />
                <rect fill="rgba(59, 121, 255, 0.3)" height="4" width="2" />
              </pattern>
            </defs>
            <rect fill="url(#legend-stripes)" height="12" rx="2" width="12" />
          </svg>
          <span className="font-medium text-muted-foreground">Previous</span>
        </div>
      </div>
    );
  }, [showPreviousBars]);

  return (
    <TooltipProvider
      data={data.current}
      hasBreakdowns={hasBreakdowns}
      hasPrevious={hasPrevious}
      visibleBreakdownIds={new Set(visibleBreakdowns.map((b) => b.id))}
    >
      <div className="card aspect-video max-h-[250px] w-full p-4 pb-1">
        <ResponsiveContainer>
          <BarChart data={rechartData}>
            <CartesianGrid
              className="stroke-border"
              horizontal={true}
              strokeDasharray="3 3"
              vertical={true}
            />
            <XAxis
              {...xAxisProps}
              allowDuplicatedCategory={false}
              dataKey="id"
              domain={undefined}
              interval="preserveStartEnd"
              scale="auto"
              tickFormatter={(id) =>
                data.current[0].steps.find((step) => step.event.id === id)
                  ?.event.displayName ?? ''
              }
              tickMargin={4}
              tickSize={0}
              type={'category'}
            />
            <YAxis {...yAxisProps} />
            {hasBreakdowns &&
              visibleBreakdowns.map((item, breakdownIndex) => {
                const stableIndex = data.current.findIndex(
                  (b) => b.id === item.id,
                );
                const colorIndex =
                  stableIndex >= 0 ? stableIndex : breakdownIndex;
                return (
                  <Bar
                    dataKey={`step:percent:${breakdownIndex}`}
                    key={`step:percent:${item.id}`}
                    shape={<BarShapeProps />}
                  >
                    {rechartData.map((row, stepIndex) => (
                      <Cell
                        fill={getChartTranslucentColor(colorIndex)}
                        key={`${row.name}-${breakdownIndex}`}
                        stroke={getChartColor(colorIndex)}
                      />
                    ))}
                  </Bar>
                );
              })}
            {!hasBreakdowns && (
              <Bar dataKey="step:percent:0" shape={<BarShapeProps />}>
                {rechartData.map((item, index) => (
                  <Cell
                    fill={getChartTranslucentColor(index)}
                    key={item.name}
                    stroke={getChartColor(index)}
                  />
                ))}
              </Bar>
            )}
            {showPreviousBars && (
              <Bar dataKey="prev_step:percent:0" shape={<StripedBarShape />}>
                {rechartData.map((item, index) => (
                  <Cell
                    fill={getChartTranslucentColor(index)}
                    key={`prev-${item.name}`}
                    stroke={getChartColor(index)}
                  />
                ))}
              </Bar>
            )}
            {hasVisibleBreakdowns && <Legend content={<CustomLegend />} />}
            {showPreviousBars && <Legend content={<PreviousLegend />} />}
            <Tooltip />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </TooltipProvider>
  );
}

const { Tooltip, TooltipProvider } = createChartTooltip<
  RechartData,
  {
    data: RouterOutputs['chart']['funnel']['current'];
    visibleBreakdownIds: Set<string>;
    hasPrevious: boolean;
    hasBreakdowns: boolean;
  }
>(({ data: dataArray, context, ...props }) => {
  const data = dataArray[0];
  const number = useNumber();
  if (!data) {
    return null;
  }
  const variants = Object.keys(data).filter((key) =>
    key.startsWith('step:data:')
  ) as `step:data:${number}`[];

  const index = context.data[0].steps.findIndex(
    (step) => step.event.id === (data as any).id
  );

  // Filter variants to only show visible breakdowns
  // The variant object contains the full breakdown item, so we can check its ID directly
  const visibleVariants = variants.filter((key) => {
    const variant = data[key];
    if (!variant) {
      return false;
    }
    // The variant is the breakdown item itself (with step added), so it has an id property
    return context.visibleBreakdownIds.has(variant.id);
  });

  if (!context.hasBreakdowns && context.hasPrevious) {
    const currentVariant = data['step:data:0'];
    const previousVariant = data['prev_step:data:0'];

    if (!currentVariant?.step) {
      return null;
    }

    const metric = getPreviousMetric(
      currentVariant.step.percent,
      previousVariant?.step.percent
    );

    return (
      <>
        <div className="text-muted-foreground">{data.name}</div>
        <div className="col gap-1.5">
          <div className="flex justify-between gap-8 font-medium font-mono">
            <span className="text-muted-foreground">Current</span>
            <span>
              {number.format(currentVariant.step.count)} (
              {number.formatWithUnit(currentVariant.step.percent / 100, '%')})
            </span>
          </div>
          {previousVariant?.step && (
            <div className="flex justify-between gap-8 font-medium font-mono text-muted-foreground">
              <span>Previous</span>
              <span>
                {number.format(previousVariant.step.count)} (
                {number.formatWithUnit(previousVariant.step.percent / 100, '%')}
                )
              </span>
            </div>
          )}
          {metric && metric.diff != null && (
            <div className="mt-0.5 flex items-center justify-between gap-8 border-border border-t pt-1.5">
              <span className="font-medium text-sm">
                {metric.state === 'positive'
                  ? 'Improvement'
                  : metric.state === 'negative'
                    ? 'Decline'
                    : 'No change'}
              </span>
              <PreviousDiffIndicatorPure {...metric} size="xs" />
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex justify-between gap-8 text-muted-foreground">
        <div>{data.name}</div>
      </div>
      {visibleVariants.map((key, visibleIndex) => {
        const variant = data[key];
        const prevVariant = data[`prev_${key}`];
        if (!variant?.step) {
          return null;
        }
        // Find the original breakdown index for color (matches chart bar order)
        const originalBreakdownIndex = context.data.findIndex(
          (b) => b.id === variant.id
        );
        let colorIndex = index;
        if (visibleVariants.length > 1) {
          colorIndex =
            originalBreakdownIndex >= 0 ? originalBreakdownIndex : visibleIndex;
        }
        return (
          <div className="row gap-2" key={key}>
            <div
              className="w-[3px] rounded-full shrink-0"
              style={{
                background: getChartColor(colorIndex),
              }}
            />
            <div className="col flex-1 gap-1 min-w-0">
              <div className="flex items-center gap-1">
                <ChartName breakdowns={variant.breakdowns ?? []} />
              </div>
              <div className="flex items-center justify-between gap-4 font-mono font-medium">
                <div className="col gap-0.5">
                  <span>
                    {number.formatWithUnit(variant.step.percent / 100, '%')}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    ({number.format(variant.step.count)})
                  </span>
                </div>

                <PreviousDiffIndicatorPure
                  {...getPreviousMetric(
                    variant.step.percent,
                    prevVariant?.step.percent
                  )}
                  size="xs"
                />
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
});
