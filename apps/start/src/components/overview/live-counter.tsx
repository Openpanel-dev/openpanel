import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { AnimatedNumber } from '../animated-number';
import { TooltipComplete } from '@/components/tooltip-complete';
import { useLiveCounter } from '@/hooks/use-live-counter';
import { cn } from '@/utils/cn';

export interface LiveCounterProps {
  projectId: string;
  shareId?: string;
}

export function LiveCounter({ projectId, shareId }: LiveCounterProps) {
  const client = useQueryClient();
  const onRefresh = useCallback(() => {
    toast('Refreshed data');
    client.refetchQueries({
      type: 'active',
    });
  }, [client]);
  const counter = useLiveCounter({ projectId, shareId, onRefresh });

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
              'absolute top-0 left-0 h-3 w-3 rounded-full bg-emerald-500 transition-all',
              counter.debounced === 0 && 'bg-destructive'
            )}
          />
        </div>
        <AnimatedNumber value={counter.debounced} />
      </div>
    </TooltipComplete>
  );
}
