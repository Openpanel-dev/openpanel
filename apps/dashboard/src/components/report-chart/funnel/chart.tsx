'use client';

import { ColorSquare } from '@/components/color-square';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { ChevronRightIcon, InfoIcon } from 'lucide-react';

import { alphabetIds } from '@openpanel/constants';

import { createChartTooltip } from '@/components/charts/chart-tooltip';
import { Tooltiper } from '@/components/ui/tooltip';
import { WidgetTable } from '@/components/widget-table';
import { useNumber } from '@/hooks/useNumerFormatter';
import { getChartColor } from '@/utils/theme';
import { getPreviousMetric } from '@openpanel/common';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { useXAxisProps, useYAxisProps } from '../common/axis';
import { PreviousDiffIndicatorPure } from '../common/previous-diff-indicator';

type Props = {
  data: {
    current: RouterOutputs['chart']['funnel']['current'][number];
    previous: RouterOutputs['chart']['funnel']['current'][number] | null;
  };
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
  <div className={cn('gap-1 justify-between flex-1 col', className)}>
    <div className="text-sm text-muted-foreground">{label}</div>
    <div className="row items-center gap-2 justify-between">
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
          <span className="text-xl font-semibold font-mono">
            {number.formatWithUnit(
              highestConversion.lastStep.percent / 100,
              '%',
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
          <span className="text-xl font-semibold font-mono">
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
}: { breakdowns: string[]; className?: string }) {
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
    previous,
  },
}: Props) {
  const number = useNumber();
  const hasHeader = breakdowns.length > 0;
  return (
    <div className={cn('col @container divide-y divide-border card')}>
      {hasHeader && <ChartName breakdowns={breakdowns} className="p-4 py-3" />}
      <div className={cn('bg-def-100', !hasHeader && 'rounded-t-md')}>
        <div className="col max-md:divide-y md:row md:items-center md:divide-x divide-border">
          <Metric
            className="p-4 py-3"
            label="Conversion"
            value={number.formatWithUnit(lastStep?.percent / 100, '%')}
            enhancer={
              previous && (
                <PreviousDiffIndicatorPure
                  {...getPreviousMetric(
                    lastStep?.percent,
                    previous.lastStep?.percent,
                  )}
                />
              )
            }
          />
          <Metric
            className="p-4 py-3"
            label="Completed"
            value={number.format(lastStep?.count)}
            enhancer={
              previous && (
                <PreviousDiffIndicatorPure
                  {...getPreviousMetric(
                    lastStep?.count,
                    previous.lastStep?.count,
                  )}
                />
              )
            }
          />
          {!!mostDropoffsStep && (
            <Metric
              className="p-4 py-3"
              label="Most dropoffs after"
              value={mostDropoffsStep?.event?.displayName}
              enhancer={
                <Tooltiper
                  tooltipClassName="max-w-xs"
                  content={
                    <span>
                      <span className="font-semibold">
                        {mostDropoffsStep?.dropoffCount}
                      </span>{' '}
                      dropped after this event. Improve this step and your
                      conversion rate will likely increase.
                    </span>
                  }
                >
                  <InfoIcon className="size-3" />
                </Tooltiper>
              }
            />
          )}
        </div>
      </div>
      <div className="col divide-y divide-def-200">
        <WidgetTable
          data={steps}
          keyExtractor={(item) => item.event.id!}
          className={'text-sm @container'}
          columnClassName="px-2 group/row items-center"
          eachRow={(item, index) => {
            return (
              <div className="absolute inset-px !p-0">
                <div
                  className={cn(
                    'h-full bg-def-300 group-hover/row:bg-blue-200 dark:group-hover/row:bg-blue-900 transition-colors relative',
                    item.isHighestDropoff && [
                      'bg-red-500/20',
                      'group-hover/row:bg-red-500/70',
                    ],
                    index === steps.length - 1 && 'rounded-bl-sm',
                  )}
                  style={{
                    width: `${item.percent}%`,
                  }}
                />
              </div>
            );
          }}
          columns={[
            {
              name: 'Event',
              render: (item, index) => (
                <div className="row items-center gap-2 row min-w-0 relative">
                  <ColorSquare>{alphabetIds[index]}</ColorSquare>
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
          ]}
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
}: RouterOutputs['chart']['funnel']): RechartData[] => {
  const firstFunnel = current[0];
  return (
    firstFunnel?.steps.map((step, stepIndex) => {
      return {
        name: step?.event.displayName ?? '',
        ...current.reduce((acc, item, index) => {
          const diff = previous?.[index];
          return {
            ...acc,
            [`step:percent:${index}`]: item.steps[stepIndex]?.percent ?? null,
            [`step:data:${index}`]:
              {
                ...item,
                step: item.steps[stepIndex],
              } ?? null,
            [`prev_step:percent:${index}`]:
              diff?.steps[stepIndex]?.percent ?? null,
            [`prev_step:data:${index}`]: diff
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

export function Chart({ data }: { data: RouterOutputs['chart']['funnel'] }) {
  const rechartData = useRechartData(data);
  const xAxisProps = useXAxisProps();
  const yAxisProps = useYAxisProps();

  return (
    <TooltipProvider data={data.current}>
      <div className="aspect-video max-h-[250px] w-full p-4 card pb-1">
        <ResponsiveContainer>
          <LineChart data={rechartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={true}
              vertical={true}
              className="stroke-border"
            />
            <XAxis
              {...xAxisProps}
              dataKey="name"
              allowDuplicatedCategory={false}
              type={'category'}
              scale="auto"
              domain={undefined}
              interval="preserveStartEnd"
              tickSize={0}
              tickMargin={4}
            />
            <YAxis {...yAxisProps} />
            {data.current.map((item, index) => (
              <Line
                stroke={getChartColor(index)}
                key={`step:percent:${item.id}`}
                dataKey={`step:percent:${index}`}
                type="linear"
                strokeWidth={2}
              />
            ))}
            <Tooltip />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </TooltipProvider>
  );
}

const { Tooltip, TooltipProvider } = createChartTooltip<
  RechartData,
  Record<string, unknown>
>(({ data: dataArray }) => {
  const data = dataArray[0]!;
  const number = useNumber();
  const variants = Object.keys(data).filter((key) =>
    key.startsWith('step:data:'),
  ) as `step:data:${number}`[];

  return (
    <>
      <div className="flex justify-between gap-8 text-muted-foreground">
        <div>{data.name}</div>
      </div>
      {variants.map((key, index) => {
        const variant = data[key];
        const prevVariant = data[`prev_${key}`];
        if (!variant?.step) {
          return null;
        }
        return (
          <div className="row gap-2" key={key}>
            <div
              className="w-[3px] rounded-full"
              style={{ background: getChartColor(index) }}
            />
            <div className="col flex-1 gap-1">
              <div className="flex items-center gap-1">
                <ChartName breakdowns={variant.breakdowns ?? []} />
              </div>
              <div className="flex justify-between gap-8 font-mono font-medium">
                <div className="col gap-1">
                  <span>
                    {number.formatWithUnit(variant.step.percent / 100, '%')}
                  </span>
                  <span className="text-muted-foreground">
                    ({number.format(variant.step.count)})
                  </span>
                </div>

                <PreviousDiffIndicatorPure
                  {...getPreviousMetric(
                    variant.step.percent,
                    prevVariant?.step.percent,
                  )}
                />
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
});
