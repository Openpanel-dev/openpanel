import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAppParams } from '@/hooks/use-app-params';
import { useDebounceState } from '@/hooks/use-debounce-state';
import useWS from '@/hooks/use-ws';
import { cn } from '@/utils/cn';

import type { IServiceEvent, IServiceEventMinimal } from '@openpanel/db';
import { useParams } from '@tanstack/react-router';
import { AnimatedNumber } from '../animated-number';

export default function EventListener({
  onRefresh,
}: {
  onRefresh: () => void;
}) {
  const params = useParams({
    strict: false,
  });
  const { projectId } = useAppParams();
  const counter = useDebounceState(0, 1000);
  useWS<IServiceEventMinimal | IServiceEvent>(
    `/live/events/${projectId}`,
    (event) => {
      if (event) {
        const isProfilePage = !!params?.profileId;
        if (isProfilePage) {
          const profile = 'profile' in event ? event.profile : null;
          if (profile?.id === params?.profileId) {
            counter.set((prev) => prev + 1);
          }
          return;
        }

        counter.set((prev) => prev + 1);
      }
    },
    {
      debounce: {
        delay: 1000,
        maxWait: 5000,
      },
    },
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => {
            counter.set(0);
            onRefresh();
          }}
          className="flex h-8 items-center gap-2 rounded-md border border-border bg-card px-3 font-medium leading-none"
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
