'use client';

import { useRef, useState } from 'react';
import { TooltipComplete } from '@/components/tooltip-complete';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useDebounceVal } from '@/hooks/useDebounceVal';
import useWS from '@/hooks/useWS';
import { cn } from '@/utils/cn';
import { useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';

export interface LiveCounterProps {
  data: number;
  projectId: string;
}

const AnimatedNumbers = dynamic(() => import('react-animated-numbers'), {
  ssr: false,
  loading: () => <div>0</div>,
});

const FIFTEEN_SECONDS = 1000 * 30;

export default function LiveCounter({ data = 0, projectId }: LiveCounterProps) {
  const client = useQueryClient();
  const counter = useDebounceVal(data, 1000, {
    maxWait: 5000,
  });
  const lastRefresh = useRef(Date.now());

  useWS<number>(`/live/visitors/${projectId}`, (value) => {
    if (!isNaN(value)) {
      counter.set(value);
      if (Date.now() - lastRefresh.current > FIFTEEN_SECONDS) {
        lastRefresh.current = Date.now();
        if (!document.hidden) {
          toast('Refreshed data');
          client.refetchQueries({
            type: 'active',
          });
        }
      }
    }
  });

  return (
    <TooltipComplete
      content={`${counter.debounced} unique visitors last 5 minutes`}
    >
      <div className="flex h-8 items-center gap-2 rounded border border-border px-3 font-medium leading-none">
        <div className="relative">
          <div
            className={cn(
              'h-3 w-3 animate-ping rounded-full bg-emerald-500 opacity-100 transition-all',
              counter.debounced === 0 && 'bg-destructive opacity-0'
            )}
          />
          <div
            className={cn(
              'absolute left-0 top-0 h-3 w-3 rounded-full bg-emerald-500 transition-all',
              counter.debounced === 0 && 'bg-destructive'
            )}
          />
        </div>
        <AnimatedNumbers
          includeComma
          transitions={(index) => ({
            type: 'spring',
            duration: index + 0.3,

            damping: 10,
            stiffness: 200,
          })}
          animateToNumber={counter.debounced}
          locale="en"
        />
      </div>
    </TooltipComplete>
  );
}
