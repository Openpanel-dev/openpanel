// @ts-nocheck

'use client';

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { round } from '@/utils/math';
import { ArrowRightIcon } from 'lucide-react';

import { useChartContext } from '../chart/ChartProvider';

function FunnelChart({ from, to }: { from: number; to: number }) {
  const fromY = 100 - from;
  const toY = 100 - to;
  const steps = [
    `M0,${fromY}`,
    'L0,100',
    'L100,100',
    `L100,${toY}`,
    `L0,${fromY}`,
  ];
  return (
    <svg viewBox="0 0 100 100">
      <defs>
        <linearGradient
          id="blue"
          x1="50"
          y1="100"
          x2="50"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          {/* bottom */}
          <stop offset="0%" stop-color="#2564eb" />
          {/* top */}
          <stop offset="100%" stop-color="#2564eb" />
        </linearGradient>
        <linearGradient
          id="red"
          x1="50"
          y1="100"
          x2="50"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          {/* bottom */}
          <stop offset="0%" stop-color="#f87171" />
          {/* top */}
          <stop offset="100%" stop-color="#fca5a5" />
        </linearGradient>
      </defs>
      <rect
        x="0"
        y={fromY}
        width="100"
        height="100"
        fill="url(#red)"
        fillOpacity={0.2}
      />
      <path d={steps.join(' ')} fill="url(#blue)" />
    </svg>
  );
}

function getDropoffColor(value: number) {
  if (value > 80) {
    return 'text-red-600';
  }
  if (value > 50) {
    return 'text-orange-600';
  }
  if (value > 30) {
    return 'text-yellow-600';
  }
  return 'text-green-600';
}

export function FunnelSteps({
  current: { steps, totalSessions },
}: RouterOutputs['chart']['funnel']) {
  const { editMode } = useChartContext();
  return (
    <Carousel className="w-full" opts={{ loop: false, dragFree: true }}>
      <CarouselContent>
        <CarouselItem className={'flex-[0_0_0] pl-3'} />
        {steps.map((step, index, list) => {
          const finalStep = index === list.length - 1;
          return (
            <CarouselItem
              className={cn(
                'max-w-full flex-[0_0_250px] p-0 px-1',
                editMode && 'flex-[0_0_320px]'
              )}
              key={step.event.id}
            >
              <div className="card divide-y divide-border bg-background">
                <div className="p-4">
                  <p className="text-muted-foreground">Step {index + 1}</p>
                  <h3 className="font-bold">
                    {step.event.displayName || step.event.name}
                  </h3>
                </div>
                <div className="relative aspect-square">
                  <FunnelChart from={step.prevPercent} to={step.percent} />
                  <div className="absolute left-0 right-0 top-0 flex flex-col bg-background/40 p-4">
                    <div className="font-medium uppercase text-muted-foreground">
                      Sessions
                    </div>
                    <div className="flex items-center text-3xl font-bold uppercase">
                      <span className="text-muted-foreground">
                        {step.before}
                      </span>
                      <ArrowRightIcon size={16} className="mx-2" />
                      <span>{step.current}</span>
                    </div>
                    {index !== 0 && (
                      <>
                        <div className="text-muted-foreground">
                          {step.current} of {totalSessions} (
                          {round(step.percent, 1)}%)
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {finalStep ? (
                  <div className={cn('flex flex-col items-center p-4')}>
                    <div className="text-xs font-medium uppercase">
                      Conversion
                    </div>
                    <div
                      className={cn(
                        'text-3xl font-bold uppercase',
                        getDropoffColor(step.dropoff.percent)
                      )}
                    >
                      {round(step.percent, 1)}%
                    </div>
                    <div className="mt-0 text-sm font-medium uppercase text-muted-foreground">
                      Converted {step.current} of {totalSessions} sessions
                    </div>
                  </div>
                ) : (
                  <div className={cn('flex flex-col items-center p-4')}>
                    <div className="text-xs font-medium uppercase">Dropoff</div>
                    <div
                      className={cn(
                        'text-3xl font-bold uppercase',
                        getDropoffColor(step.dropoff.percent)
                      )}
                    >
                      {round(step.dropoff.percent, 1)}%
                    </div>
                    <div className="mt-0 text-sm font-medium uppercase text-muted-foreground">
                      Lost {step.dropoff.count} sessions
                    </div>
                  </div>
                )}
              </div>
            </CarouselItem>
          );
        })}
        <CarouselItem className={'flex-[0_0_0px] pl-3'} />
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );
}
