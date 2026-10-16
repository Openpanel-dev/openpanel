import type { IServiceEvent } from '@openpanel/core';
import { useEffect, useMemo, useRef } from 'react';
import { BrowserChrome } from './browser-chrome';
import { getEventOffsetMs } from './replay-utils';
import {
  useCurrentTime,
  useReplayContext,
} from '@/components/sessions/replay/replay-context';
import { ReplayEventItem } from '@/components/sessions/replay/replay-event-item';
import { ScrollArea } from '@/components/ui/scroll-area';

type EventWithOffset = { event: IServiceEvent; offsetMs: number };

export function ReplayEventFeed({
  events,
  replayLoading,
}: {
  events: IServiceEvent[];
  replayLoading: boolean;
}) {
  const { startTime, isReady, seek } = useReplayContext();
  const currentTime = useCurrentTime(100);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const prevCountRef = useRef(0);

  // Pre-sort events by offset once when events/startTime changes.
  // This is the expensive part — done once, not on every tick.
  const sortedEvents = useMemo<EventWithOffset[]>(() => {
    if (startTime == null || !isReady) {
      return [];
    }
    return events
      .map((ev) => ({ event: ev, offsetMs: getEventOffsetMs(ev, startTime) }))
      .filter(({ offsetMs }) => offsetMs >= -10_000)
      .sort((a, b) => a.offsetMs - b.offsetMs);
  }, [events, startTime, isReady]);

  // Binary search to find how many events are visible at currentTime.
  // O(log n) instead of O(n) filter on every tick.
  const visibleCount = useMemo(() => {
    let lo = 0;
    let hi = sortedEvents.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((sortedEvents[mid]?.offsetMs ?? 0) <= currentTime) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }, [sortedEvents, currentTime]);

  const visibleEvents = sortedEvents.slice(0, visibleCount);
  const currentEventId = visibleEvents[visibleCount - 1]?.event.id ?? null;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || visibleEvents.length === 0) {
      return;
    }

    const isNewItem = visibleEvents.length > prevCountRef.current;
    prevCountRef.current = visibleEvents.length;

    requestAnimationFrame(() => {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: isNewItem ? 'smooth' : 'instant',
      });
    });
  }, [visibleEvents.length]);

  return (
    <BrowserChrome
      className="h-full"
      controls={<span className="font-medium text-lg">Timeline</span>}
      url={false}
    >
      <ScrollArea className="min-h-0 flex-1" ref={viewportRef}>
        <div className="flex w-full flex-col">
          {visibleEvents.map(({ event, offsetMs }) => (
            <div
              className="fade-in-0 slide-in-from-bottom-3 min-w-0 animate-in fill-mode-both duration-300"
              key={event.id}
            >
              <ReplayEventItem
                event={event}
                isCurrent={event.id === currentEventId}
                onClick={() => seek(Math.max(0, offsetMs))}
              />
            </div>
          ))}
          {!replayLoading && visibleEvents.length === 0 && (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Events will appear as the replay plays.
            </div>
          )}
          {replayLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <div
                className="flex items-center gap-2 border-b px-3 py-2"
                key={i}
              >
                <div className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div
                    className="h-3 animate-pulse rounded bg-muted"
                    style={{ width: `${50 + (i % 4) * 12}%` }}
                  />
                </div>
                <div className="h-3 w-10 shrink-0 animate-pulse rounded bg-muted" />
              </div>
            ))}
        </div>
      </ScrollArea>
    </BrowserChrome>
  );
}
