'use client';

import { cn } from '@/utils/cn';
import { ArrowRightCircleIcon, CheckCheckIcon, Edit2Icon } from 'lucide-react';
import { usePathname } from 'next/navigation';

type Step = {
  name: string;
  status: 'completed' | 'current' | 'pending';
  href: string;
};

type Props = {
  className?: string;
};

function useSteps(path: string) {
  console.log('path', path);

  const steps: Step[] = [
    {
      name: 'Account creation',
      status: 'pending',
      href: '/get-started',
    },
    {
      name: 'Tracking information',
      status: 'pending',
      href: '/onboarding',
    },
    {
      name: 'Connect your data',
      status: 'pending',
      href: '/onboarding/connect',
    },
    {
      name: 'Verify',
      status: 'pending',
      href: '/onboarding/verify',
    },
  ];

  const matchIndex = steps.findLastIndex((step) => path.startsWith(step.href));

  return steps.map((step, index) => {
    if (index < matchIndex) {
      return { ...step, status: 'completed' };
    }
    if (index === matchIndex) {
      return { ...step, status: 'current' };
    }
    return step;
  });
}

const Steps = ({ className }: Props) => {
  const path = usePathname();
  const steps = useSteps(path);
  const currentIndex = steps.findIndex((i) => i.status === 'current');
  return (
    <div className="relative">
      <div className="absolute bottom-4 left-4 top-4 w-px bg-slate-300"></div>
      <div
        className="absolute left-4 top-4 w-px bg-blue-600"
        style={{
          height: `calc(${((currentIndex + 1) / steps.length) * 100}% - 3.5rem)`,
        }}
      ></div>
      <div
        className={cn(
          'relative flex gap-4 overflow-hidden md:-ml-3 md:flex-col md:gap-8',
          className
        )}
      >
        {steps.map((step, index) => (
          <div
            className={cn(
              'flex flex-shrink-0 items-center gap-2 self-start px-3 py-1.5',
              step.status === 'current' &&
                'rounded-xl border border-border bg-background',
              step.status === 'completed' &&
                index !== currentIndex - 1 &&
                'max-md:hidden'
            )}
            key={step.name}
          >
            <div
              className={cn(
                'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm text-white'
                // step.status === 'completed' && 'bg-blue-500 ring-blue-500/50',
                // step.status === 'pending' && 'bg-slate-600 ring-slate-500/50'
              )}
            >
              <div
                className={cn(
                  'absolute inset-0 z-0 rounded-full bg-blue-500',
                  step.status === 'pending' && 'bg-slate-600'
                )}
              ></div>
              {step.status === 'current' && (
                <div className="animate-ping-slow absolute inset-1 z-0 rounded-full bg-blue-500"></div>
              )}
              <div className="relative">
                {step.status === 'completed' && <CheckCheckIcon size={14} />}
                {/* {step.status === 'current' && (
                  <ArrowRightCircleIcon size={14} />
                )} */}
                {(step.status === 'pending' || step.status === 'current') && (
                  <>{index + 1}</>
                )}
              </div>
            </div>

            <div className="text-sm font-medium">{step.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Steps;
