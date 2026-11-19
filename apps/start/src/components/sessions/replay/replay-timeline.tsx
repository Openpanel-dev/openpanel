import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReplayContext } from './replay-context';
import {
  detectRageClicks,
  type EventWithOffset,
  formatDuration,
  getActivityHistogram,
  getEventLabel,
  type PageSegment,
} from './replay-utils';
import { EventIcon } from '@/components/events/event-icon';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/utils/cn';

const HISTOGRAM_BUCKETS = 140;
const MARKER_GROUP_PX = 22;
const MIN_LABEL_WIDTH_PX = 48;
const FALLBACK_TRACK_WIDTH = 600;
const MIN_BAR_HEIGHT = 0.08;

function percent(timeMs: number, duration: number): number {
  return Math.max(0, Math.min(100, (timeMs / duration) * 100));
}

function groupMarkers(
  events: EventWithOffset[],
  duration: number,
  trackWidth: number
) {
  const thresholdMs = (MARKER_GROUP_PX / trackWidth) * duration;
  const groups: EventWithOffset[][] = [];
  for (const item of events) {
    const last = groups.at(-1);
    // Measured from the group's first event, which is where its marker sits.
    const anchor = last?.[0];
    if (last && anchor && item.offsetMs - anchor.offsetMs <= thresholdMs) {
      last.push(item);
    } else {
      groups.push([item]);
    }
  }
  return groups;
}

function useElementWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(FALLBACK_TRACK_WIDTH);
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(() => {
      setWidth(element.clientWidth || FALLBACK_TRACK_WIDTH);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function EventMarkers({
  events,
  duration,
  trackWidth,
}: {
  events: EventWithOffset[];
  duration: number;
  trackWidth: number;
}) {
  const { seek } = useReplayContext();
  // Screen views already have their own band; markers are for what happened on a page.
  const markers = useMemo(
    () =>
      groupMarkers(
        events.filter(
          ({ event, offsetMs }) =>
            event.name !== 'screen_view' &&
            offsetMs >= 0 &&
            offsetMs <= duration
        ),
        duration,
        trackWidth
      ),
    [events, duration, trackWidth]
  );

  return (
    <div className="relative h-6">
      {markers.map((group) => {
        const first = group[0]!;
        return (
          <Tooltip key={first.event.id}>
            <TooltipTrigger asChild>
              <button
                aria-label={`${getEventLabel(first.event)} at ${formatDuration(first.offsetMs)}`}
                className="absolute top-0 -ml-2.5 transition-transform hover:z-10 hover:scale-125"
                onClick={() => seek(first.offsetMs)}
                style={{ left: `${percent(first.offsetMs, duration)}%` }}
                type="button"
              >
                <EventIcon
                  className="ring-2 ring-card"
                  meta={first.event.meta}
                  name={first.event.name}
                  size="xs"
                />
                {group.length > 1 && (
                  <span className="absolute -top-1.5 -right-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-foreground px-0.5 font-semibold text-[9px] text-background tabular-nums">
                    {group.length}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent className="col gap-1.5" side="top">
              {group.map(({ event, offsetMs }) => (
                <div className="row items-center gap-2" key={event.id}>
                  <EventIcon meta={event.meta} name={event.name} size="xs" />
                  <span className="font-medium">{getEventLabel(event)}</span>
                  <span className="ml-auto pl-3 text-muted-foreground tabular-nums">
                    {formatDuration(offsetMs)}
                  </span>
                </div>
              ))}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function PageBands({
  segments,
  duration,
  trackWidth,
  currentSegmentId,
}: {
  segments: PageSegment[];
  duration: number;
  trackWidth: number;
  currentSegmentId: string | null;
}) {
  const { seek } = useReplayContext();
  return (
    <div className="relative mt-1.5 h-6">
      {segments.map((segment) => {
        const left = percent(segment.startMs, duration);
        const width = percent(segment.endMs, duration) - left;
        const isCurrent = segment.id === currentSegmentId;
        const showLabel = (width / 100) * trackWidth >= MIN_LABEL_WIDTH_PX;
        return (
          <Tooltip key={segment.id}>
            <TooltipTrigger asChild>
              <button
                aria-label={`Jump to ${segment.path}`}
                className={cn(
                  'absolute inset-y-0 truncate rounded-[5px] border-card border-r-2 px-1.5 text-left font-medium text-2xs transition-colors',
                  isCurrent
                    ? 'bg-highlight/15 text-highlight'
                    : 'bg-def-200 text-muted-foreground hover:bg-def-300 hover:text-foreground'
                )}
                onClick={() => seek(segment.startMs)}
                style={{ left: `${left}%`, width: `${width}%` }}
                type="button"
              >
                {showLabel ? segment.path : null}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <span className="font-medium">{segment.path}</span>
              <span className="ml-2 text-muted-foreground tabular-nums">
                {formatDuration(segment.endMs - segment.startMs)}
              </span>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function Waveform({ bars, className }: { bars: number[]; className: string }) {
  return (
    <div className="absolute inset-0 flex items-end gap-px">
      {bars.map((value, index) => (
        <div
          className={cn('flex-1 rounded-t-[1px]', className)}
          // biome-ignore lint/suspicious/noArrayIndexKey: buckets are positional
          key={index}
          style={{ height: `${Math.max(MIN_BAR_HEIGHT, value) * 100}%` }}
        />
      ))}
    </div>
  );
}

export function ReplayTimeline({
  events,
  segments,
  currentSegmentId,
}: {
  events: EventWithOffset[];
  segments: PageSegment[];
  currentSegmentId: string | null;
}) {
  const {
    currentTimeRef,
    duration,
    startTime,
    isReady,
    seek,
    subscribeToCurrentTime,
    activity,
  } = useReplayContext();
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubPointerRef = useRef<number | null>(null);
  const playedRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ pct: number; timeMs: number } | null>(
    null
  );
  const trackWidth = useElementWidth(trackRef);

  const bars = useMemo(
    () =>
      startTime == null
        ? []
        : getActivityHistogram(
            activity.interactions,
            startTime,
            duration,
            HISTOGRAM_BUCKETS
          ),
    [activity.interactions, startTime, duration]
  );

  const rageClicks = useMemo(
    () =>
      startTime == null
        ? []
        : detectRageClicks(activity.clicks, startTime).filter(
            (rage) => rage.offsetMs >= 0 && rage.offsetMs <= duration
          ),
    [activity.clicks, startTime, duration]
  );

  // The playhead moves on every tick; write to the DOM instead of re-rendering.
  useEffect(() => {
    if (duration <= 0) {
      return;
    }
    const paint = (t: number) => {
      const pct = `${percent(t, duration)}%`;
      if (playedRef.current) {
        playedRef.current.style.clipPath = `inset(0 calc(100% - ${pct}) 0 0)`;
      }
      if (playheadRef.current) {
        playheadRef.current.style.left = pct;
      }
    };
    paint(currentTimeRef.current);
    return subscribeToCurrentTime(paint);
  }, [subscribeToCurrentTime, duration, currentTimeRef]);

  const getTimeFromClientX = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || duration <= 0) {
        return null;
      }
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return { pct, timeMs: pct * duration };
    },
    [duration]
  );

  const startScrub = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // A pen and a finger can both be primary; only one scrub at a time.
      if (!e.isPrimary || scrubPointerRef.current !== null) {
        return;
      }
      const first = getTimeFromClientX(e.clientX);
      if (first) {
        seek(first.timeMs);
      }
      const { pointerId } = e;
      scrubPointerRef.current = pointerId;
      const onMove = (move: PointerEvent) => {
        if (move.pointerId !== pointerId) {
          return;
        }
        const info = getTimeFromClientX(move.clientX);
        if (info) {
          setHover(info);
          seek(info.timeMs);
        }
      };
      const onEnd = (end: PointerEvent) => {
        if (end.pointerId !== pointerId) {
          return;
        }
        scrubPointerRef.current = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
    },
    [getTimeFromClientX, seek]
  );

  if (!isReady || duration <= 0) {
    return <div className="h-[86px]" />;
  }

  const hoverSegment = hover
    ? segments.find(
        (segment) =>
          hover.timeMs >= segment.startMs && hover.timeMs < segment.endMs
      )
    : undefined;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="relative select-none">
        <EventMarkers
          duration={duration}
          events={events}
          trackWidth={trackWidth}
        />
        <div
          aria-label="Seek"
          aria-valuemax={Math.round(duration / 1000)}
          aria-valuemin={0}
          aria-valuenow={Math.round(currentTimeRef.current / 1000)}
          className="relative h-10 cursor-pointer touch-none"
          onKeyDown={(e) => {
            const step = 5000;
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              seek(currentTimeRef.current - step);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              seek(Math.min(duration, currentTimeRef.current + step));
            }
          }}
          onPointerDown={startScrub}
          onPointerLeave={() => setHover(null)}
          onPointerMove={(e) => setHover(getTimeFromClientX(e.clientX))}
          ref={trackRef}
          role="slider"
          tabIndex={0}
        >
          <Waveform bars={bars} className="bg-def-300" />
          <div className="absolute inset-0" ref={playedRef}>
            <Waveform bars={bars} className="bg-highlight" />
          </div>

          {rageClicks.map((rage) => (
            <Tooltip key={rage.offsetMs}>
              <TooltipTrigger asChild>
                <div
                  className="absolute -top-1 bottom-0 z-10 w-0.5 -translate-x-1/2 rounded-full bg-destructive"
                  style={{ left: `${percent(rage.offsetMs, duration)}%` }}
                >
                  <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 animate-pulse rounded-full bg-destructive ring-2 ring-card" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <span className="font-medium text-destructive">Rage click</span>
                <span className="ml-2 text-muted-foreground">
                  {rage.clicks} clicks at {formatDuration(rage.offsetMs)}
                </span>
              </TooltipContent>
            </Tooltip>
          ))}

          {hover && (
            <div
              className="pointer-events-none absolute inset-y-0 z-20 w-px bg-foreground/40"
              style={{ left: `${hover.pct * 100}%` }}
            >
              <div className="absolute bottom-full left-1/2 mb-8 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-2xs text-background shadow-lg">
                <span className="font-semibold tabular-nums">
                  {formatDuration(hover.timeMs)}
                </span>
                {hoverSegment && (
                  <span className="ml-1.5 opacity-70">{hoverSegment.path}</span>
                )}
              </div>
            </div>
          )}

          <div
            className="pointer-events-none absolute -top-1 -bottom-1 z-30 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
            ref={playheadRef}
          >
            <span className="absolute -top-1 left-1/2 size-3 -translate-x-1/2 rounded-full border-2 border-card bg-foreground shadow" />
          </div>
        </div>
        <PageBands
          currentSegmentId={currentSegmentId}
          duration={duration}
          segments={segments}
          trackWidth={trackWidth}
        />
      </div>
    </TooltipProvider>
  );
}
