'use client';

import { useReplayContext } from '@/components/sessions/replay/replay-context';
import { ReplayEventItem } from '@/components/sessions/replay/replay-event-item';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { IServiceEvent } from '@openpanel/db';
import { useEffect, useMemo, useRef } from 'react';
import { BrowserChrome } from './browser-chrome';

function getEventOffsetMs(event: IServiceEvent, startTime: number): number {
  const t =
    typeof event.createdAt === 'object' && event.createdAt instanceof Date
      ? event.createdAt.getTime()
      : new Date(event.createdAt).getTime();
  return t - startTime;
}

export function ReplayEventFeed({ events }: { events: IServiceEvent[] }) {
  const { currentTime, startTime, isReady, seek } = useReplayContext();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const prevCountRef = useRef(0);

  const { visibleEvents, currentEventId } = useMemo(() => {
    if (startTime == null || !isReady) {
      return { visibleEvents: [], currentEventId: null as string | null };
    }
    const withOffset = events
      .map((ev) => ({
        event: ev,
        offsetMs: getEventOffsetMs(ev, startTime),
      }))
      // Include events up to 10s before recording started (e.g. screen views)
      .filter(({ offsetMs }) => offsetMs >= -10_000 && offsetMs <= currentTime)
      .sort((a, b) => a.offsetMs - b.offsetMs);

    const visibleEvents = withOffset.map(({ event, offsetMs }) => ({
      event,
      offsetMs,
    }));

    const current =
      visibleEvents.length > 0 ? visibleEvents[visibleEvents.length - 1] : null;
    const currentEventId = current?.event.id ?? null;

    return { visibleEvents, currentEventId };
  }, [events, startTime, isReady, currentTime]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || visibleEvents.length === 0) return;

    const isNewItem = visibleEvents.length > prevCountRef.current;
    prevCountRef.current = visibleEvents.length;

    requestAnimationFrame(() => {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: isNewItem ? 'smooth' : 'instant',
      });
    });
  }, [visibleEvents.length]);

  if (!isReady) return null;

  return (
    <BrowserChrome
      url={false}
      controls={<span className="text-lg font-medium">Timeline</span>}
      className="h-full"
    >
      <ScrollArea className="flex-1 min-h-0" ref={viewportRef}>
        <div className="flex w-full flex-col">
          {visibleEvents.map(({ event, offsetMs }) => (
            <div
              key={event.id}
              className="animate-in fade-in-0 slide-in-from-bottom-3 min-w-0 duration-300 fill-mode-both"
            >
              <ReplayEventItem
                event={event}
                offsetMs={offsetMs}
                isCurrent={event.id === currentEventId}
                onClick={() => seek(Math.max(0, offsetMs))}
              />
            </div>
          ))}
          {visibleEvents.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Events will appear as the replay plays.
            </div>
          )}
        </div>
      </ScrollArea>
    </BrowserChrome>
  );
}
