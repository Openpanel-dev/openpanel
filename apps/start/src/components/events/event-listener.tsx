import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAppParams } from '@/hooks/use-app-params';
import { useDebounceState } from '@/hooks/useDebounceState';
import useWS from '@/hooks/useWS';
import { cn } from '@/utils/cn';

import type { IServiceEventMinimal } from '@openpanel/db';
import { AnimatedNumber } from '../animated-number';

export default function EventListener({
  onRefresh,
}: {
  onRefresh: () => void;
}) {
  const { projectId } = useAppParams();
  const counter = useDebounceState(0, 1000, {
    maxWait: 5000,
  });

  useWS<IServiceEventMinimal>(`/live/events/${projectId}`, (event) => {
    if (event?.name) {
      counter.set((prev) => prev + 1);
    }
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => {
            counter.set(0);
            onRefresh();
          }}
          className="flex h-8 items-center gap-2 rounded border border-border bg-card px-3 font-medium leading-none"
        >
          <div className="relative">
            <div
              className={cn(
                'h-3 w-3 animate-ping rounded-full bg-emerald-500 opacity-100 transition-all',
              )}
            />
            <div
              className={cn(
                'absolute left-0 top-0 h-3 w-3 rounded-full bg-emerald-500 transition-all',
              )}
            />
          </div>
          {counter.debounced === 0 ? (
            'Listening'
          ) : (
            <AnimatedNumber value={counter.debounced} suffix=" new events" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {counter.debounced === 0
          ? 'Listening to new events'
          : 'Click to refresh'}
      </TooltipContent>
    </Tooltip>
  );
}
