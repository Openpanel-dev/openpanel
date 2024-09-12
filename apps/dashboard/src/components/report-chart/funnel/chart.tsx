'use client';

import { ColorSquare } from '@/components/color-square';
import { TooltipComplete } from '@/components/tooltip-complete';
import { Progress } from '@/components/ui/progress';
import { Widget, WidgetBody } from '@/components/widget';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
import { AlertCircleIcon } from 'lucide-react';
import { last } from 'ramda';

import { getPreviousMetric } from '@openpanel/common';
import { alphabetIds } from '@openpanel/constants';

import { PreviousDiffIndicator } from '../common/previous-diff-indicator';
import { useReportChartContext } from '../context';

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

type Props = {
  data: RouterOutputs['chart']['funnel'];
};

export function Chart({
  data: {
    current: { steps, totalSessions },
    previous,
  },
}: Props) {
  const { isEditMode } = useReportChartContext();
  const mostDropoffs = findMostDropoffs(steps);
  const lastStep = last(steps)!;
  const prevLastStep = last(previous.steps);
  const withWidget = (children: React.ReactNode) => {
    if (isEditMode) {
      return (
        <Widget>
          <WidgetBody>{children}</WidgetBody>
        </Widget>
      );
    }

    return children;
  };

  return withWidget(
    <div className="flex flex-col gap-4 @container">
      <div
        className={cn(
          'border border-border',
          !isEditMode && 'border-0 border-b'
        )}
      >
        <div className="flex items-center gap-8 p-4">
          <div className="hidden shrink-0 gap-2 @xl:flex">
            {steps.map((step) => {
              return (
                <div
                  className="flex h-20 w-8 items-end overflow-hidden rounded bg-def-200"
                  key={step.event.id}
                >
                  <div
                    className="w-full bg-def-400"
                    style={{ height: `${step.percent}%` }}
                  ></div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-1 items-center gap-4">
            <div className="flex flex-1 flex-col">
              <div className="text-2xl">
                <span className="font-bold">
                  {lastStep.count} of {totalSessions}
                </span>{' '}
                sessions{' '}
              </div>
              <div className="text-xl text-muted-foreground">
                Last period:{' '}
                <span className="font-semibold">
                  {prevLastStep?.count} of {previous.totalSessions}
                </span>
              </div>
            </div>
            <PreviousDiffIndicator
              size="lg"
              {...getPreviousMetric(lastStep.count, prevLastStep?.count)}
            />
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
                  {alphabetIds[index]}
                </ColorSquare>
                <div className="font-semibold capitalize">
                  {step.event.displayName.replace(/_/g, ' ')}
                </div>
                <div className="flex items-center gap-8 text-sm">
                  <TooltipComplete
                    disabled={!previous.steps[index]}
                    content={
                      <div className="flex items-center gap-2">
                        <span>
                          Last period:{' '}
                          <span className="font-semibold">
                            {previous.steps[index]?.previousCount}
                          </span>
                        </span>
                        <PreviousDiffIndicator
                          {...getPreviousMetric(
                            step.previousCount,
                            previous.steps[index]?.previousCount
                          )}
                        />
                      </div>
                    }
                  >
                    <div className="flex flex-col gap-2">
                      <span className="text-xs text-muted-foreground">
                        Total:
                      </span>
                      <div className="flex items-center gap-4">
                        <span className="text-lg font-bold">
                          {step.previousCount}
                        </span>
                      </div>
                    </div>
                  </TooltipComplete>
                  <TooltipComplete
                    disabled={!previous.steps[index]}
                    content={
                      <div className="flex items-center gap-2">
                        <span>
                          Last period:{' '}
                          <span className="font-semibold">
                            {previous.steps[index]?.dropoffCount}
                          </span>
                        </span>
                        <PreviousDiffIndicator
                          inverted
                          {...getPreviousMetric(
                            step.dropoffCount,
                            previous.steps[index]?.dropoffCount
                          )}
                        />
                      </div>
                    }
                  >
                    <div className="flex flex-col gap-2">
                      <span className="text-xs text-muted-foreground">
                        Dropoff:
                      </span>
                      <div className="flex items-center gap-4">
                        <span
                          className={cn(
                            'flex items-center gap-1 text-lg font-bold',
                            isMostDropoffs && 'text-rose-500'
                          )}
                        >
                          {isMostDropoffs && <AlertCircleIcon size={14} />}
                          {step.dropoffCount}
                        </span>
                      </div>
                    </div>
                  </TooltipComplete>
                  <TooltipComplete
                    disabled={!previous.steps[index]}
                    content={
                      <div className="flex items-center gap-2">
                        <span>
                          Last period:{' '}
                          <span className="font-semibold">
                            {previous.steps[index]?.count}
                          </span>
                        </span>
                        <PreviousDiffIndicator
                          {...getPreviousMetric(
                            step.count,
                            previous.steps[index]?.count
                          )}
                        />
                      </div>
                    }
                  >
                    <div className="flex flex-col gap-2">
                      <span className="text-xs text-muted-foreground">
                        Current:
                      </span>
                      <div className="flex items-center gap-4">
                        <span className="text-lg font-bold">{step.count}</span>
                        {/* <button
                        className="ml-2 underline"
                        onClick={() =>
                        pushModal('FunnelStepDetails', {
                          ...input,
                          step: index + 1,
                          })
                          }
                          >
                          Inspect
                          </button> */}
                      </div>
                    </div>
                  </TooltipComplete>
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
