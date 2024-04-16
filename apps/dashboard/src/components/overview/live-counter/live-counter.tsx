'use client';

import { useRef, useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import useWS from '@/hooks/useWS';
import { cn } from '@/utils/cn';
import { useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';

import { useOverviewOptions } from '../useOverviewOptions';

export interface LiveCounterProps {
  data: number;
  projectId: string;
}

const AnimatedNumbers = dynamic(() => import('react-animated-numbers'), {
  ssr: false,
  loading: () => <div>0</div>,
});

const FIFTEEN_SECONDS = 1000 * 15;

export default function LiveCounter({ data = 0, projectId }: LiveCounterProps) {
  const { setLiveHistogram } = useOverviewOptions();
  const client = useQueryClient();
  const [counter, setCounter] = useState(data);
  const lastRefresh = useRef(Date.now());

  useWS<number>(`/live/visitors/${projectId}`, (value) => {
    if (!isNaN(value)) {
      setCounter(value);
      if (Date.now() - lastRefresh.current > FIFTEEN_SECONDS) {
        lastRefresh.current = Date.now();
        toast('Refreshed data');
        client.refetchQueries({
          type: 'active',
        });
      }
    }
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => setLiveHistogram((p) => !p)}
          className="flex h-8 items-center gap-2 rounded border border-border px-3 font-medium leading-none"
        >
          <div className="relative">
            <div
              className={cn(
                'h-3 w-3 animate-ping rounded-full bg-emerald-500 opacity-100 transition-all',
                counter === 0 && 'bg-destructive opacity-0'
              )}
            ></div>
            <div
              className={cn(
                'absolute left-0 top-0 h-3 w-3 rounded-full bg-emerald-500 transition-all',
                counter === 0 && 'bg-destructive'
              )}
            ></div>
          </div>
          <AnimatedNumbers
            includeComma
            transitions={(index) => ({
              type: 'spring',
              duration: index + 0.3,

              damping: 10,
              stiffness: 200,
            })}
            animateToNumber={counter}
            locale="en"
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{counter} unique visitors last 5 minutes</p>
        <p>Click to see activity for the last 30 minutes</p>
      </TooltipContent>
    </Tooltip>
  );
}
