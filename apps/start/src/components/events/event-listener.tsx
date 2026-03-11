import { AnimatedNumber } from '../animated-number';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAppParams } from '@/hooks/use-app-params';
import { useDebounceState } from '@/hooks/use-debounce-state';
import useWS from '@/hooks/use-ws';
import { cn } from '@/utils/cn';

export default function EventListener({
  onRefresh,
}: {
  onRefresh: () => void;
}) {
  const { projectId } = useAppParams();
  const counter = useDebounceState(0, 1000);
  useWS<{ count: number }>(
    `/live/events/${projectId}`,
    ({ count }) => {
      counter.set((prev) => prev + count);
    },
    {
      debounce: {
        delay: 1000,
        maxWait: 5000,
      },
    }
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="flex h-8 items-center gap-2 rounded-md border border-border bg-card px-3 font-medium leading-none"
          onClick={() => {
            counter.set(0);
            onRefresh();
          }}
          type="button"
        >
          <div className="relative">
            <div
              className={cn(
                'h-3 w-3 animate-ping rounded-full bg-emerald-500 opacity-100 transition-all'
              )}
            />
            <div
              className={cn(
                'absolute top-0 left-0 h-3 w-3 rounded-full bg-emerald-500 transition-all'
              )}
            />
          </div>
          {counter.debounced === 0 ? (
            'Listening'
          ) : (
            <AnimatedNumber suffix=" new events" value={counter.debounced} />
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
