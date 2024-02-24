'use client';

import type { RouterOutputs } from '@/app/_trpc/client';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { cn } from '@/utils/cn';
import { round } from '@/utils/math';
import { ArrowRight, ArrowRightIcon } from 'lucide-react';

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
  steps,
  totalSessions,
}: RouterOutputs['chart']['funnel']) {
  return (
    <Carousel className="w-full py-4" opts={{ loop: false, dragFree: true }}>
      <CarouselContent>
        <CarouselItem className={'flex-[0_0_0px] pl-3'} />
        {steps.map((step, index, list) => {
          const finalStep = index === list.length - 1;
          return (
            <CarouselItem
              className={'flex-[0_0_320px] max-w-full p-0 px-1'}
              key={step.event.id}
            >
              <div className="border border-border divide-y divide-border bg-white">
                <div className="p-4">
                  <p className="text-muted-foreground">Step {index + 1}</p>
                  <h3 className="font-bold">
                    {step.event.displayName || step.event.name}
                  </h3>
                </div>
                <div className="aspect-square relative">
                  <FunnelChart from={step.prevPercent} to={step.percent} />
                  <div className="absolute top-0 left-0 right-0 p-4 flex flex-col bg-white/40">
                    <div className="uppercase font-medium text-muted-foreground">
                      Sessions
                    </div>
                    <div className="uppercase text-3xl font-bold flex items-center">
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
                  <div className={cn('p-4 flex flex-col items-center')}>
                    <div className="uppercase text-xs font-medium">
                      Conversion
                    </div>
                    <div
                      className={cn(
                        'uppercase text-3xl font-bold',
                        getDropoffColor(step.dropoff.percent)
                      )}
                    >
                      {round(step.percent, 1)}%
                    </div>
                    <div className="uppercase text-sm mt-0 font-medium text-muted-foreground">
                      Converted {step.current} of {totalSessions} sessions
                    </div>
                  </div>
                ) : (
                  <div className={cn('p-4 flex flex-col items-center')}>
                    <div className="uppercase text-xs font-medium">Dropoff</div>
                    <div
                      className={cn(
                        'uppercase text-3xl font-bold',
                        getDropoffColor(step.dropoff.percent)
                      )}
                    >
                      {round(step.dropoff.percent, 1)}%
                    </div>
                    <div className="uppercase text-sm mt-0 font-medium text-muted-foreground">
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
