'use client';

import { cn } from '@/utils/cn';
import { CheckCheckIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';

type Step = {
  name: string;
  status: 'completed' | 'current' | 'pending';
  match: string;
};

type Props = {
  className?: string;
};

function useSteps(path: string) {
  const steps: Step[] = [
    {
      name: 'Create an account',
      status: 'pending',
      match: '/onboarding',
    },
    {
      name: 'Create a project',
      status: 'pending',
      match: '/onboarding/project',
    },
    {
      name: 'Connect your data',
      status: 'pending',
      match: '/onboarding/(.+)/connect',
    },
    {
      name: 'Verify',
      status: 'pending',
      match: '/onboarding/(.+)/verify',
    },
  ];

  const matchIndex = steps.findLastIndex((step) =>
    path.match(new RegExp(step.match)),
  );

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
      <div className="absolute bottom-4 left-4 top-4 w-px bg-def-200" />
      <div
        className="absolute left-4 top-4 w-px bg-highlight"
        style={{
          height: `calc(${((currentIndex + 1) / steps.length) * 100}% - 3.5rem)`,
        }}
      />
      <div
        className={cn(
          'relative flex gap-4 overflow-hidden md:-ml-3 md:flex-col md:gap-8',
          className,
        )}
      >
        {steps.map((step, index) => (
          <div
            className={cn(
              'flex flex-shrink-0 items-center gap-4 self-start px-3 py-1.5',
              step.status === 'current' &&
                'rounded-xl border border-border bg-card',
              step.status === 'completed' &&
                index !== currentIndex - 1 &&
                'max-md:hidden',
            )}
            key={step.name}
          >
            <div
              className={cn(
                'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full  text-white',
              )}
            >
              <div
                className={cn(
                  'absolute inset-0 z-0 rounded-full bg-highlight',
                  step.status === 'pending' && 'bg-def-400',
                )}
              />
              {step.status === 'current' && (
                <div className="absolute inset-1 z-0 animate-ping-slow rounded-full bg-highlight" />
              )}
              <div className="relative">
                {step.status === 'completed' && <CheckCheckIcon size={14} />}
                {/* {step.status === 'current' && (
                  <ArrowRightCircleIcon size={14} />
                )} */}
                {(step.status === 'pending' || step.status === 'current') &&
                  index + 1}
              </div>
            </div>

            <div className="font-medium">{step.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Steps;
