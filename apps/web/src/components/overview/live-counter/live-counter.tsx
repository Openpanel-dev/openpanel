'use client';

import { useRef, useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/utils/cn';
import { useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import useWebSocket from 'react-use-websocket';
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
  const ws = String(process.env.NEXT_PUBLIC_API_URL)
    .replace(/^https/, 'wss')
    .replace(/^http/, 'ws');
  const client = useQueryClient();
  const [counter, setCounter] = useState(data);
  const [socketUrl] = useState(`${ws}/live/visitors/${projectId}`);
  const lastRefresh = useRef(Date.now());

  useWebSocket(socketUrl, {
    shouldReconnect: () => true,
    onMessage(event) {
      const value = parseInt(event.data, 10);
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
    },
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => setLiveHistogram((p) => !p)}
          className="border border-border rounded h-8 px-3 leading-none flex items-center font-medium gap-2"
        >
          <div className="relative">
            <div
              className={cn(
                'bg-emerald-500 h-3 w-3 rounded-full animate-ping opacity-100 transition-all',
                counter === 0 && 'bg-destructive opacity-0'
              )}
            ></div>
            <div
              className={cn(
                'bg-emerald-500 h-3 w-3 rounded-full absolute top-0 left-0 transition-all',
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
