'use client';

import { useReplayContext } from '@/components/sessions/replay/replay-context';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { IServiceEvent } from '@openpanel/db';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useRef, useState } from 'react';

import { EventIcon } from '@/components/events/event-icon';
import { cn } from '@/lib/utils';
import { ReplayPlayPauseButton } from './replay-controls';

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getEventOffsetMs(event: IServiceEvent, startTime: number): number {
  const t =
    typeof event.createdAt === 'object' && event.createdAt instanceof Date
      ? event.createdAt.getTime()
      : new Date(event.createdAt).getTime();
  return t - startTime;
}

export function ReplayTimeline({ events }: { events: IServiceEvent[] }) {
  const { currentTime, duration, startTime, isReady, seek } =
    useReplayContext();
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<{
    pct: number;
    timeMs: number;
  } | null>(null);

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

  const seekToPosition = useCallback(
    (clientX: number) => {
      const info = getTimeFromClientX(clientX);
      if (info) seek(info.timeMs);
    },
    [getTimeFromClientX, seek],
  );

  const handleTrackMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only handle direct clicks on the track, not on child elements like the thumb
      if (
        e.target !== trackRef.current &&
        !(e.target as HTMLElement).closest('.replay-track-bg')
      )
        return;
      seekToPosition(e.clientX);
    },
    [seekToPosition],
  );

  const handleThumbMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      const onMouseMove = (moveEvent: MouseEvent) => {
        seekToPosition(moveEvent.clientX);
        const info = getTimeFromClientX(moveEvent.clientX);
        if (info) setHoverInfo(info);
      };
      const onMouseUp = () => {
        setIsDragging(false);
        setHoverInfo(null);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [seekToPosition, getTimeFromClientX],
  );

  if (!isReady || duration <= 0) return null;

  const progressPct =
    duration > 0
      ? Math.max(0, Math.min(100, (currentTime / duration) * 100))
      : 0;

  const eventsWithOffset = events
    .map((ev) => ({
      event: ev,
      offsetMs: startTime != null ? getEventOffsetMs(ev, startTime) : 0,
    }))
    .filter(({ offsetMs }) => offsetMs >= 0 && offsetMs <= duration);

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
            className="relative flex h-8 cursor-pointer items-center"
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
                className="bg-primary h-full rounded-full transition-[width] duration-75"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div
              className="absolute left-0 top-1/2 z-10 h-4 w-4 -translate-y-1/2 cursor-grab rounded-full border-2 border-primary bg-background shadow-sm transition-[left] duration-75 active:cursor-grabbing"
              style={{ left: `calc(${progressPct}% - 8px)` }}
              onMouseDown={handleThumbMouseDown}
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
                    {formatTime(hoverInfo.timeMs)}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            {eventsWithOffset.map(({ event: ev, offsetMs }) => {
              const pct = (offsetMs / duration) * 100;
              return (
                <Tooltip key={ev.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      data-timeline-event
                      className={cn(
                        'absolute top-1/2 z-[5] flex h-6 w-6 -translate-y-1/2 items-center justify-center transition-transform hover:scale-125',
                      )}
                      style={{ left: `${pct}%`, marginLeft: -12 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        seek(offsetMs);
                      }}
                      aria-label={`${ev.name} at ${formatTime(offsetMs)}`}
                    >
                      <EventIcon name={ev.name} meta={ev.meta} size="sm" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="col gap-2">
                    <div className="font-medium row items-center gap-2">
                      <EventIcon name={ev.name} meta={ev.meta} size="sm" />
                      {ev.name === 'screen_view' ? ev.path : ev.name}
                    </div>
                    <div className="text-muted-foreground">
                      {formatTime(offsetMs)}
                    </div>
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
