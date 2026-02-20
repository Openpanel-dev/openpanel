import { useCurrentTime, useReplayContext } from '@/components/sessions/replay/replay-context';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { IServiceEvent } from '@openpanel/db';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { EventIcon } from '@/components/events/event-icon';
import { cn } from '@/lib/utils';
import { ReplayPlayPauseButton } from './replay-controls';
import { formatDuration, getEventOffsetMs } from './replay-utils';

export function ReplayTimeline({ events }: { events: IServiceEvent[] }) {
  const { currentTimeRef, duration, startTime, isReady, seek, subscribeToCurrentTime } =
    useReplayContext();
  // currentTime as React state is only needed for keyboard seeks (low frequency).
  // The progress bar and thumb are updated directly via DOM refs to avoid re-renders.
  const currentTime = useCurrentTime(250);
  const trackRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<{
    pct: number;
    timeMs: number;
  } | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const rafDragRef = useRef<number | null>(null);

  // Clean up any in-progress drag listeners when the component unmounts
  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  // Update progress bar and thumb directly via DOM on every tick — no React re-render.
  useEffect(() => {
    if (duration <= 0) return;
    return subscribeToCurrentTime((t) => {
      const pct = Math.max(0, Math.min(100, (t / duration) * 100));
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${pct}%`;
      }
      if (thumbRef.current) {
        thumbRef.current.style.left = `calc(${pct}% - 8px)`;
      }
    });
  }, [subscribeToCurrentTime, duration]);

  const getTimeFromClientX = useCallback(
    (clientX: number) => {
      if (!trackRef.current || duration <= 0) return null;
      const rect = trackRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      return { pct, timeMs: pct * duration };
    },
    [duration],
  );

  const handleTrackMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('[data-timeline-event]')) {
        setHoverInfo(null);
        return;
      }
      const info = getTimeFromClientX(e.clientX);
      if (info) setHoverInfo(info);
    },
    [getTimeFromClientX],
  );

  const handleTrackMouseLeave = useCallback(() => {
    if (!isDragging) setHoverInfo(null);
  }, [isDragging]);

  const handleTrackMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only handle direct clicks on the track, not on child elements like the thumb
      if (
        e.target !== trackRef.current &&
        !(e.target as HTMLElement).closest('.replay-track-bg')
      )
        return;
      const info = getTimeFromClientX(e.clientX);
      if (info) seek(info.timeMs);
    },
    [getTimeFromClientX, seek],
  );

  const eventsWithOffset = useMemo(
    () =>
      events
        .map((ev) => ({
          event: ev,
          offsetMs: startTime != null ? getEventOffsetMs(ev, startTime) : 0,
        }))
        .filter(({ offsetMs }) => offsetMs >= 0 && offsetMs <= duration),
    [events, startTime, duration],
  );

  // Group events that are within 24px of each other on the track.
  // We need the track width for pixel math — use a stable ref-based calculation.
  const groupedEvents = useMemo(() => {
    if (!eventsWithOffset.length || duration <= 0) return [];

    // Sort by offsetMs so we sweep left-to-right
    const sorted = [...eventsWithOffset].sort((a, b) => a.offsetMs - b.offsetMs);

    // 24px in ms — recalculated from container width; fall back to 2% of duration
    const trackWidth = trackRef.current?.offsetWidth ?? 600;
    const thresholdMs = (24 / trackWidth) * duration;

    const groups: { items: typeof sorted; pct: number }[] = [];
    for (const item of sorted) {
      const last = groups[groups.length - 1];
      const lastPct = last ? (last.items[last.items.length - 1]!.offsetMs / duration) * 100 : -Infinity;
      const thisPct = (item.offsetMs / duration) * 100;

      if (last && item.offsetMs - last.items[last.items.length - 1]!.offsetMs <= thresholdMs) {
        last.items.push(item);
        // Anchor the group at its first item's position
      } else {
        groups.push({ items: [item], pct: thisPct });
      }
      // keep pct pointing at the first item (already set on push)
      void lastPct;
    }

    return groups;
  }, [eventsWithOffset, duration]);

  if (!isReady || duration <= 0) return null;

  const progressPct = Math.max(0, Math.min(100, (currentTimeRef.current / duration) * 100));

  return (
    <TooltipProvider delayDuration={300}>
      <div className="row items-center gap-4 p-4">
        <ReplayPlayPauseButton />
        <div className="col gap-4 flex-1 px-2">
          <div
            ref={trackRef}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={currentTime}
            tabIndex={0}
            className="relative flex h-8 cursor-pointer items-center outline-0"
            onMouseDown={handleTrackMouseDown}
            onMouseMove={handleTrackMouseMove}
            onMouseLeave={handleTrackMouseLeave}
            onKeyDown={(e) => {
              const step = 5000;
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                seek(Math.max(0, currentTime - step));
              } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                seek(Math.min(duration, currentTime + step));
              }
            }}
          >
            <div className="replay-track-bg bg-muted h-1.5 w-full overflow-hidden rounded-full">
              <div
                ref={progressBarRef}
                className="bg-primary h-full rounded-full"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div
              ref={thumbRef}
              className="absolute left-0 top-1/2 z-10 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-primary bg-background shadow-sm"
              style={{ left: `calc(${progressPct}% - 8px)` }}
              aria-hidden
            />
            {/* Hover timestamp tooltip */}
            <AnimatePresence>
              {hoverInfo && (
                <motion.div
                  className="pointer-events-none absolute z-20"
                  style={{
                    left: `${hoverInfo.pct * 100}%`,
                    top: 0,
                    bottom: 0,
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {/* Vertical line */}
                  <div className="absolute left-0 top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-foreground/30" />
                  {/* Timestamp badge */}
                  <motion.div
                    className="absolute bottom-6 left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] tabular-nums text-background shadow"
                    initial={{ opacity: 0, y: 16, scale: 0.5 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 16, scale: 0.5 }}
                    transition={{ duration: 0.2 }}
                  >
                    {formatDuration(hoverInfo.timeMs)}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            {groupedEvents.map((group) => {
              const first = group.items[0]!;
              const isGroup = group.items.length > 1;
              return (
                <Tooltip key={first.event.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      data-timeline-event
                      className="absolute top-1/2 z-[5] flex h-6 w-6 -translate-y-1/2 items-center justify-center transition-transform hover:scale-105"
                      style={{ left: `${group.pct}%`, marginLeft: -12 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        seek(first.offsetMs);
                      }}
                      aria-label={isGroup ? `${group.items.length} events at ${formatDuration(first.offsetMs)}` : `${first.event.name} at ${formatDuration(first.offsetMs)}`}
                    >
                      <EventIcon name={first.event.name} meta={first.event.meta} size="sm" />
                      {isGroup && (
                        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[9px] font-bold leading-none text-background">
                          {group.items.length}
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="col gap-1.5">
                    {group.items.map(({ event: ev, offsetMs }) => (
                      <div key={ev.id} className="row items-center gap-2">
                        <EventIcon name={ev.name} meta={ev.meta} size="sm" />
                        <span className="font-medium">
                          {ev.name === 'screen_view' ? ev.path : ev.name}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {formatDuration(offsetMs)}
                        </span>
                      </div>
                    ))}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
