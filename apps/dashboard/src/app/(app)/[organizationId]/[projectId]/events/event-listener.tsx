'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAppParams } from '@/hooks/useAppParams';
import { cn } from '@/utils/cn';
import { useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import useWebSocket from 'react-use-websocket';
import { toast } from 'sonner';

import type { IServiceCreateEventPayload } from '@openpanel/db';

const AnimatedNumbers = dynamic(() => import('react-animated-numbers'), {
  ssr: false,
  loading: () => <div>0</div>,
});

export default function EventListener() {
  const router = useRouter();
  const { projectId } = useAppParams();
  const ws = String(process.env.NEXT_PUBLIC_API_URL)
    .replace(/^https/, 'wss')
    .replace(/^http/, 'ws');
  const [counter, setCounter] = useState(0);
  const [socketUrl] = useState(`${ws}/live/events/${projectId}`);

  useWebSocket(socketUrl, {
    shouldReconnect: () => true,
    onMessage(payload) {
      const event = JSON.parse(payload.data) as IServiceCreateEventPayload;
      if (event?.name) {
        setCounter((prev) => prev + 1);
        toast(`New event ${event.name} from ${event.country}!`);
      }
    },
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => {
            setCounter(0);
            router.refresh();
          }}
          className="flex h-8 items-center gap-2 rounded border border-border bg-white px-3 text-sm font-medium leading-none"
        >
          <div className="relative">
            <div
              className={cn(
                'h-3 w-3 animate-ping rounded-full bg-emerald-500 opacity-100 transition-all'
              )}
            ></div>
            <div
              className={cn(
                'absolute left-0 top-0 h-3 w-3 rounded-full bg-emerald-500 transition-all'
              )}
            ></div>
          </div>
          {counter === 0 ? (
            'Listening'
          ) : (
            <>
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
              new events
            </>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {counter === 0 ? 'Listening to new events' : 'Click to refresh'}
      </TooltipContent>
    </Tooltip>
  );
}
