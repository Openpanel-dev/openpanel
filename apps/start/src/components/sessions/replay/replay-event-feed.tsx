import { useEffect, useRef } from 'react';
import { useReplayContext } from './replay-context';
import { ReplayEventItem, type ReplayItemState } from './replay-event-item';
import type { EventWithOffset } from './replay-utils';
import { ScrollArea } from '@/components/ui/scroll-area';

// After the user scrolls the feed by hand, leave it alone for a moment.
const MANUAL_SCROLL_PAUSE_MS = 4000;
const SKELETON_ROWS = Array.from({ length: 6 }, (_, index) => ({
  id: `skeleton-${index}`,
  width: 40 + ((index * 17) % 45),
}));

function getState(index: number, currentIndex: number): ReplayItemState {
  if (index === currentIndex) {
    return 'current';
  }
  return index < currentIndex ? 'past' : 'future';
}

export function ReplayEventFeed({
  events,
  currentIndex,
  isLoading,
}: {
  events: EventWithOffset[];
  currentIndex: number;
  isLoading: boolean;
}) {
  const { seek } = useReplayContext();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const lastManualScrollRef = useRef(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    const isUserScrolling =
      performance.now() - lastManualScrollRef.current < MANUAL_SCROLL_PAUSE_MS;
    if (!viewport || isUserScrolling) {
      return;
    }
    const current = viewport.querySelector<HTMLElement>(
      '[data-replay-state="current"]'
    );
    if (!current) {
      return;
    }
    const top =
      current.offsetTop - viewport.clientHeight / 2 + current.clientHeight / 2;
    viewport.scrollTo({ top, behavior: 'smooth' });
  }, [currentIndex]);

  return (
    <div className="col h-full min-h-0">
      <div className="row items-center justify-between border-b px-4 py-3">
        <span className="font-semibold">Activity</span>
        <span className="font-mono text-muted-foreground text-xs tabular-nums">
          {Math.max(0, currentIndex + 1)} / {events.length}
        </span>
      </div>
      <ScrollArea
        className="min-h-0 flex-1"
        onWheel={() => {
          lastManualScrollRef.current = performance.now();
        }}
        ref={viewportRef}
      >
        <div className="col py-1">
          {isLoading &&
            SKELETON_ROWS.map((row) => (
              <div className="row items-center gap-2.5 px-3 py-2" key={row.id}>
                <div className="size-6 shrink-0 animate-pulse rounded-full bg-def-200" />
                <div
                  className="h-3 animate-pulse rounded bg-def-200"
                  style={{ width: `${row.width}%` }}
                />
              </div>
            ))}
          {!isLoading &&
            events.map(({ event, offsetMs }, index) => (
              <ReplayEventItem
                event={event}
                key={event.id}
                offsetMs={offsetMs}
                onClick={() => seek(offsetMs)}
                state={getState(index, currentIndex)}
              />
            ))}
          {!isLoading && events.length === 0 && (
            <div className="py-10 text-center text-muted-foreground text-sm">
              No events were tracked during this recording.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
