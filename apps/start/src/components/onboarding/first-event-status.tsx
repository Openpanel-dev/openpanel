import type { IServiceEvent } from '@openpanel/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, PartyPopperIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Ping } from '@/components/ping';
import useWS from '@/hooks/use-ws';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { timeAgo } from '@/utils/date';
import { trackFunnel } from '@/utils/funnel-tracking';

const FALLBACK_POLL_MS = 10_000;
const SHOWN_EVENTS = 5;

/** The project's latest events, refreshed live while the user installs the SDK. */
export function useFirstEvents(projectId: string, secondsOnStep: () => number) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data } = useQuery(
    trpc.event.events.queryOptions(
      { projectId },
      {
        // The websocket below flips the status instantly; polling only covers
        // a socket that cannot connect.
        refetchInterval: FALLBACK_POLL_MS,
      }
    )
  );
  useWS(`/live/events/${projectId}`, () => {
    queryClient.invalidateQueries(trpc.event.events.queryFilter({ projectId }));
  });
  const events = data?.data ?? [];
  const isVerified = events.length > 0;

  const firstEvent = events.at(-1);
  useEffect(() => {
    if (isVerified) {
      trackFunnel('onboarding_first_event_verified', {
        projectId,
        secondsOnStep: secondsOnStep(),
        eventCount: events.length,
        firstEventName: firstEvent?.name ?? null,
        sdk: firstEvent?.sdkName || null,
      });
    }
    // Fires once, when the status flips; later refetches must not repeat it.
  }, [isVerified, projectId]);

  return { events, isVerified };
}

export function FirstEventStatus({
  events,
  className,
  children,
  help,
}: {
  events: IServiceEvent[];
  className?: string;
  /** Shown beside the headline, e.g. the "Open dashboard" button once connected. */
  children?: React.ReactNode;
  /** Shown under the waiting text, e.g. a way into troubleshooting. */
  help?: React.ReactNode;
}) {
  const isVerified = events.length > 0;
  return (
    <section
      aria-live="polite"
      className={cn(
        '@container col gap-4 rounded-xl p-5 transition-colors',
        isVerified
          ? 'bg-emerald-500/10 text-emerald-950 dark:text-emerald-50'
          : 'bg-def-200 dark:bg-def-300',
        className
      )}
    >
      <div className="flex @md:flex-row flex-col @md:items-center gap-4">
        <span
          className={cn(
            'center-center size-10 shrink-0 rounded-full',
            isVerified ? 'bg-emerald-500 text-white' : 'bg-background'
          )}
        >
          {isVerified ? (
            <PartyPopperIcon size={18} />
          ) : (
            <Ping className="size-2.5 bg-highlight" />
          )}
        </span>
        <div className="col min-w-0 flex-1">
          <div className="font-semibold text-base">
            {isVerified
              ? 'Connected! Events are coming in.'
              : 'Listening for your first event'}
          </div>
          <p
            className={cn(
              'text-sm',
              isVerified
                ? 'text-emerald-900/70 dark:text-emerald-100/70'
                : 'text-muted-foreground'
            )}
          >
            {isVerified
              ? 'Your setup works. Open the dashboard whenever you are ready.'
              : 'Install the snippet, open your site or app once, and this turns green by itself.'}
          </p>
          {!isVerified && help && <div className="mt-2">{help}</div>}
        </div>
        {children && <div className="@md:ml-auto shrink-0">{children}</div>}
      </div>
      {isVerified && (
        <ul className="col gap-1 rounded-lg bg-background/60 p-3 text-sm">
          {events.slice(0, SHOWN_EVENTS).map((event) => (
            <li className="row items-center gap-2" key={event.id}>
              <CheckIcon className="shrink-0 text-emerald-600" size={14} />
              <span className="truncate font-medium">{event.name}</span>
              <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
                {timeAgo(event.createdAt, 'round')}
              </span>
            </li>
          ))}
          {events.length > SHOWN_EVENTS && (
            <li className="text-muted-foreground">
              and {events.length - SHOWN_EVENTS} more
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
