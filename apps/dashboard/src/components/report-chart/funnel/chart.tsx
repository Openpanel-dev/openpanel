'use client';

import { ColorSquare } from '@/components/color-square';
import { TooltipComplete } from '@/components/tooltip-complete';
import { Progress } from '@/components/ui/progress';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { AlertCircleIcon } from 'lucide-react';
import { last } from 'ramda';

import { getPreviousMetric, round } from '@openpanel/common';
import { alphabetIds } from '@openpanel/constants';

import { useNumber } from '@/hooks/useNumerFormatter';
import { PreviousDiffIndicator } from '../common/previous-diff-indicator';
import { useReportChartContext } from '../context';
import { MetricCardNumber } from '../metric/metric-card';

const findMostDropoffs = (
  steps: RouterOutputs['chart']['funnel']['current']['steps'],
) => {
  return steps.reduce((acc, step) => {
    if (step.dropoffCount > acc.dropoffCount) {
      return step;
    }
    return acc;
  });
};

type Props = {
  data: RouterOutputs['chart']['funnel'];
};

export function Chart({
  data: {
    current: { steps, totalSessions },
    previous,
  },
}: Props) {
  const number = useNumber();
  const { isEditMode } = useReportChartContext();
  const mostDropoffs = findMostDropoffs(steps);
  const lastStep = last(steps)!;
  const prevLastStep = previous?.steps ? last(previous.steps) : null;

  return (
    <div className={cn('col gap-4 @container', isEditMode ? 'card' : '-m-4')}>
      <div
        className={cn(
          'border-b border-border bg-def-100',
          isEditMode && 'rounded-t-md',
        )}
      >
        <div className="flex items-center gap-8 p-4 px-8">
          <MetricCardNumber
            className="flex-1"
            label="Converted"
            value={lastStep.count}
            enhancer={
              <PreviousDiffIndicator
                size="md"
                {...getPreviousMetric(lastStep.count, prevLastStep?.count)}
              />
            }
          />
          <MetricCardNumber
            className="flex-1"
            label="Percent"
            value={`${totalSessions ? round((lastStep.count / totalSessions) * 100, 2) : 0}%`}
            enhancer={
              <PreviousDiffIndicator
                size="md"
                {...getPreviousMetric(lastStep.count, prevLastStep?.count)}
              />
            }
          />
          <MetricCardNumber
            className="flex-1"
            label="Most dropoffs"
            value={mostDropoffs.event.displayName}
            enhancer={
              <PreviousDiffIndicator
                size="md"
                {...getPreviousMetric(lastStep.count, prevLastStep?.count)}
              />
            }
          />
        </div>
      </div>
      <div className="col divide-y divide-def-200">
        {steps.map((step, index) => {
          const percent = (step.count / totalSessions) * 100;
          const isMostDropoffs = mostDropoffs.event.id === step.event.id;
          return (
            <div
              key={step.event.id}
              className="col gap-12 px-4 py-4 @2xl:flex-row @2xl:px-8"
            >
              <div className="relative flex flex-1 flex-col gap-2 pl-8">
                <ColorSquare className="absolute left-0 top-0.5">
                  {alphabetIds[index]}
                </ColorSquare>
                <div className="font-semibold mt-1">
                  {step.event.displayName}
                </div>
                <div className="grid grid-cols-4 max-w-lg gap-8 text-sm">
                  <TooltipComplete
                    disabled={!previous?.steps?.[index]}
                    content={
                      <div className="flex items-center gap-2">
                        <span>
                          Last period:{' '}
                          <span className="font-mono">
                            {number.format(
                              previous?.steps?.[index]?.previousCount,
                            )}
                          </span>
                        </span>
                        <PreviousDiffIndicator
                          {...getPreviousMetric(
                            step.previousCount,
                            previous?.steps?.[index]?.previousCount,
                          )}
                        />
                      </div>
                    }
                  >
                    <div className="col gap-2">
                      <span className="text-xs text-muted-foreground">
                        Total:
                      </span>
                      <div className="flex items-center gap-4">
                        <span className="text-lg font-mono">
                          {number.format(step.previousCount)}
                        </span>
                      </div>
                    </div>
                  </TooltipComplete>
                  <TooltipComplete
                    disabled={!previous?.steps?.[index]}
                    content={
                      <div className="flex items-center gap-2">
                        <span>
                          Last period:{' '}
                          <span className="font-mono">
                            {number.format(
                              previous?.steps?.[index]?.dropoffCount,
                            )}
                          </span>
                        </span>
                        <PreviousDiffIndicator
                          inverted
                          {...getPreviousMetric(
                            step.dropoffCount,
                            previous?.steps?.[index]?.dropoffCount,
                          )}
                        />
                      </div>
                    }
                  >
                    <div className="col gap-2">
                      <span className="text-xs text-muted-foreground">
                        Dropoff:
                      </span>
                      <div className="flex items-center gap-4">
                        <span
                          className={cn(
                            'flex items-center gap-1 text-lg font-mono',
                            isMostDropoffs && 'text-rose-500',
                          )}
                        >
                          {isMostDropoffs && <AlertCircleIcon size={14} />}
                          {number.format(step.dropoffCount)}
                        </span>
                      </div>
                    </div>
                  </TooltipComplete>
                  <TooltipComplete
                    disabled={!previous?.steps?.[index]}
                    content={
                      <div className="flex items-center gap-2">
                        <span>
                          Last period:{' '}
                          <span className="font-mono">
                            {number.format(previous?.steps?.[index]?.count)}
                          </span>
                        </span>
                        <PreviousDiffIndicator
                          {...getPreviousMetric(
                            step.count,
                            previous?.steps?.[index]?.count,
                          )}
                        />
                      </div>
                    }
                  >
                    <div className="col gap-2">
                      <span className="text-xs text-muted-foreground">
                        Current:
                      </span>
                      <div className="flex items-center gap-4">
                        <span className="text-lg font-mono">
                          {number.format(step.count)}
                        </span>
                      </div>
                    </div>
                  </TooltipComplete>
                  <TooltipComplete
                    disabled={!previous?.steps?.[index]}
                    content={
                      <div className="flex items-center gap-2">
                        <span>
                          Last period:{' '}
                          <span className="font-mono">
                            {number.format(previous?.steps?.[index]?.count)}
                          </span>
                        </span>
                        <PreviousDiffIndicator
                          {...getPreviousMetric(
                            step.count,
                            previous?.steps?.[index]?.count,
                          )}
                        />
                      </div>
                    }
                  >
                    <div className="col gap-2">
                      <span className="text-xs text-muted-foreground">
                        Percent:
                      </span>
                      <div className="flex items-center gap-4">
                        <span className="text-lg font-mono">
                          {Number.isNaN(percent) ? 0 : round(percent, 2)}%
                        </span>
                      </div>
                    </div>
                  </TooltipComplete>
                </div>
              </div>
              <Progress
                size="lg"
                className={cn(
                  'w-full @2xl:w-1/4 text-white bg-def-200 mt-0.5 dark:text-black',
                )}
                innerClassName={cn(
                  'bg-primary',
                  step.event.id === mostDropoffs.event.id && 'bg-rose-500',
                )}
                value={percent}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
