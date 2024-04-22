'use client';

import { ColorSquare } from '@/components/color-square';
import { AutoSizer } from '@/components/react-virtualized-auto-sizer';
import { Progress } from '@/components/ui/progress';
import { Widget, WidgetBody } from '@/components/widget';
import { pushModal } from '@/modals';
import { useSelector } from '@/redux';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { round } from '@/utils/math';
import { getChartColor } from '@/utils/theme';
import { AlertCircleIcon } from 'lucide-react';
import { last } from 'ramda';
import { Cell, Pie, PieChart } from 'recharts';

import type { IChartInput } from '@openpanel/validation';

import { useChartContext } from '../chart/ChartProvider';

const findMostDropoffs = (
  steps: RouterOutputs['chart']['funnel']['current']['steps']
) => {
  return steps.reduce((acc, step) => {
    if (step.dropoffCount > acc.dropoffCount) {
      return step;
    }
    return acc;
  });
};

function InsightCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border p-4 py-3">
      <span className="text-sm">{title}</span>
      <div className="whitespace-nowrap text-lg">{children}</div>
    </div>
  );
}

type Props = RouterOutputs['chart']['funnel'] & {
  input: IChartInput;
};

export function FunnelSteps({
  current: { steps, totalSessions },
  previous,
  input,
}: Props) {
  const { editMode } = useChartContext();
  const mostDropoffs = findMostDropoffs(steps);
  const lastStep = last(steps)!;
  const prevLastStep = last(previous.steps)!;
  const hasIncreased = lastStep.percent > prevLastStep.percent;
  const withWidget = (children: React.ReactNode) => {
    if (editMode) {
      return (
        <div className="p-4">
          <Widget>
            <WidgetBody>{children}</WidgetBody>
          </Widget>
        </div>
      );
    }

    return children;
  };

  return withWidget(
    <div className="flex flex-col gap-4 @container">
      <div
        className={cn(
          'rounded-lg border border-border',
          !editMode && 'border-0 p-0'
        )}
      >
        <div className="flex items-center gap-8 p-4">
          <div className="hidden shrink-0 @xl:block @xl:w-36">
            <AutoSizer disableHeight>
              {({ width }) => {
                const height = width;
                return (
                  <div className="relative" style={{ width, height }}>
                    <PieChart width={width} height={height}>
                      <Pie
                        data={[
                          {
                            value: lastStep.percent,
                            label: 'Conversion',
                          },
                          {
                            value: 100 - lastStep.percent,
                            label: 'Dropoff',
                          },
                        ]}
                        innerRadius={height / 3}
                        outerRadius={height / 2 - 10}
                        isAnimationActive={true}
                        nameKey="label"
                        dataKey="value"
                      >
                        <Cell strokeWidth={0} className="fill-blue-600" />
                        <Cell strokeWidth={0} className="fill-slate-200" />
                      </Pie>
                    </PieChart>
                    <div
                      className="absolute inset-0 flex items-center justify-center font-mono font-bold"
                      style={{
                        fontSize: width / 6,
                      }}
                    >
                      <div>{round(lastStep.percent, 2)}%</div>
                    </div>
                  </div>
                );
              }}
            </AutoSizer>
          </div>
          <div>
            <div className="mb-1 text-xl font-semibold">Insights</div>
            <div className="flex flex-wrap gap-4">
              <InsightCard title="Converted">
                <span className="font-bold">{lastStep.count}</span>
                <span className="mx-2 text-muted-foreground">of</span>
                <span className="text-muted-foreground">{totalSessions}</span>
              </InsightCard>
              <InsightCard
                title={hasIncreased ? 'Trending up' : 'Trending down'}
              >
                <span className="font-bold">{round(lastStep.percent, 2)}%</span>
                <span className="mx-2 text-muted-foreground">compared to</span>
                <span className="text-muted-foreground">
                  {round(prevLastStep.percent, 2)}%
                </span>
              </InsightCard>
              <InsightCard title={'Most dropoffs'}>
                <span className="font-bold">
                  {mostDropoffs.event.displayName}
                </span>
                <span className="mx-2 text-muted-foreground">lost</span>
                <span className="text-muted-foreground">
                  {mostDropoffs.dropoffCount} sessions
                </span>
              </InsightCard>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1 divide-y">
        {steps.map((step, index) => {
          const percent = (step.count / totalSessions) * 100;
          const isMostDropoffs = mostDropoffs.event.id === step.event.id;
          return (
            <div
              key={step.event.id}
              className="flex flex-col gap-4 px-4 py-4 @2xl:flex-row @2xl:px-8"
            >
              <div className="relative flex flex-1 flex-col gap-2 pl-8">
                <ColorSquare className="absolute left-0 top-0.5">
                  {step.event.id}
                </ColorSquare>
                <div className="font-semibold capitalize">
                  {step.event.displayName.replace(/_/g, ' ')}
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">
                      Total:
                    </span>
                    <span className="font-semibold">{step.previousCount}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">
                      Dropoff:
                    </span>
                    <span
                      className={cn(
                        'flex items-center gap-1 font-semibold',
                        isMostDropoffs && 'text-red-600'
                      )}
                    >
                      {isMostDropoffs && <AlertCircleIcon size={14} />}
                      {step.dropoffCount}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">
                      Current:
                    </span>
                    <div>
                      <span className="font-semibold">{step.count}</span>
                      <button
                        className="ml-2 underline"
                        onClick={() =>
                          pushModal('FunnelStepDetails', {
                            ...input,
                            step: index + 1,
                          })
                        }
                      >
                        Inspect
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <Progress
                size="lg"
                className="w-full @2xl:w-1/2"
                color={getChartColor(index)}
                value={percent}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
