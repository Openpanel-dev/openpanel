'use client';

import { useEffect, useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAppParams } from '@/hooks/useAppParams';
import { cn } from '@/utils/cn';
import { useQueryClient } from '@tanstack/react-query';
import AnimatedNumbers from 'react-animated-numbers';
import { toast } from 'sonner';

import { getSafeJson } from '@mixan/common';
import type { IServiceCreateEventPayload } from '@mixan/db';

interface LiveCounterProps {
  initialCount: number;
}

export function LiveCounter({ initialCount = 0 }: LiveCounterProps) {
  const client = useQueryClient();
  const [counter, setCounter] = useState(initialCount);
  const { projectId } = useAppParams();
  const [es] = useState(
    typeof window != 'undefined' &&
      new EventSource(`http://localhost:3333/live/events/${projectId}`)
  );

  useEffect(() => {
    if (!es) {
      return () => {};
    }

    function handler(event: MessageEvent<string>) {
      const parsed = getSafeJson<{
        visitors: number;
        event: IServiceCreateEventPayload | null;
      }>(event.data);

      if (parsed) {
        setCounter(parsed.visitors);
        if (parsed.event) {
          client.refetchQueries({
            type: 'active',
          });
          toast('New event', {
            description: `${parsed.event.name}`,
            duration: 2000,
          });
        }
      }
    }
    es.addEventListener('message', handler);
    return () => es.removeEventListener('message', handler);
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger>
        <div className="border border-border rounded h-8 px-3 leading-none flex items-center font-medium gap-2">
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
            })}
            animateToNumber={counter}
            locale="en"
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {counter} unique visitors last 5 minutes
      </TooltipContent>
    </Tooltip>
  );
}
