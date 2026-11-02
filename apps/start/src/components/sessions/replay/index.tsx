import type { IServiceEvent } from '@openpanel/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FastForwardIcon, VideoOffIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ReplayProvider,
  useCurrentTime,
  useReplayContext,
} from './replay-context';
import { ReplayControls, ReplayPlayPauseButton } from './replay-controls';
import { ReplayEventFeed } from './replay-event-feed';
import { getStageFitHeight, ReplayPlayer } from './replay-player';
import { ReplayTimeline } from './replay-timeline';
import {
  type EventWithOffset,
  findLastIndexAtTime,
  getPageSegments,
  type PageSegment,
  type ReplayRecordEvent,
  sortEventsByOffset,
} from './replay-utils';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';

const FEED_TICK_MS = 100;

/** Pages through the chunks after the first batch and feeds them to the player. */
function ReplayChunkLoader({
  sessionId,
  projectId,
  fromIndex,
}: {
  sessionId: string;
  projectId: string;
  fromIndex: number;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { addEvent, refreshDuration, isReady } = useReplayContext();

  useEffect(() => {
    if (!isReady) {
      return;
    }
    let cancelled = false;

    function loadFrom(index: number) {
      queryClient
        .fetchQuery(
          trpc.session.replayChunksFrom.queryOptions({
            sessionId,
            projectId,
            fromIndex: index,
          })
        )
        .then((res) => {
          if (cancelled) {
            return;
          }
          for (const row of res.data) {
            for (const event of row?.events ?? []) {
              addEvent(event);
            }
          }
          refreshDuration();
          if (res.hasMore && res.nextIndex > index) {
            loadFrom(res.nextIndex);
          }
        })
        .catch(() => {
          // A failed page leaves the replay shorter, not broken.
        });
    }

    loadFrom(fromIndex);
    return () => {
      cancelled = true;
    };
  }, [
    isReady,
    queryClient,
    trpc,
    sessionId,
    projectId,
    fromIndex,
    addEvent,
    refreshDuration,
  ]);

  return null;
}

function CurrentUrl({ segment }: { segment: PageSegment | undefined }) {
  if (!segment) {
    return <span className="truncate text-muted-foreground">about:blank</span>;
  }
  const host = segment.origin.replace(/^https?:\/\//, '');
  return (
    <span
      className="fade-in-0 slide-in-from-bottom-1 min-w-0 animate-in truncate duration-300"
      key={segment.id}
    >
      <span className="text-muted-foreground">{host}</span>
      <span className="text-foreground">{segment.path}</span>
    </span>
  );
}

/** A big play button until the viewer starts the replay for the first time. */
function StartOverlay() {
  const { isPlaying, isReady } = useReplayContext();
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    if (isPlaying) {
      setHasStarted(true);
    }
  }, [isPlaying]);

  if (!isReady || hasStarted) {
    return null;
  }

  return (
    <div className="fade-in-0 absolute inset-0 z-10 grid animate-in place-items-center bg-background/20 backdrop-blur-[1.5px]">
      <ReplayPlayPauseButton size="lg" />
    </div>
  );
}

function SkippingBadge() {
  const { isSkipping, isPlaying } = useReplayContext();
  if (!(isSkipping && isPlaying)) {
    return null;
  }
  return (
    <div className="fade-in-0 zoom-in-95 row absolute top-4 left-1/2 z-20 -translate-x-1/2 animate-in items-center gap-1.5 rounded-full bg-foreground/90 px-3 py-1.5 font-medium text-background text-xs shadow-lg backdrop-blur">
      <FastForwardIcon className="size-3.5 animate-pulse" fill="currentColor" />
      Skipping idle time
    </div>
  );
}

type StageStatus = 'loading' | 'error' | 'empty';

function StagePlaceholder({ status }: { status: StageStatus }) {
  if (status === 'loading') {
    return (
      <div className="absolute inset-0 grid place-items-center p-6">
        <div className="col aspect-video w-full max-w-3xl overflow-hidden rounded-xl bg-card shadow-[0_0_0_1px_var(--border)]">
          <div className="h-9 border-b bg-def-100" />
          <div className="relative flex-1 overflow-hidden">
            <div className="absolute inset-0 animate-pulse bg-def-100" />
            <div className="absolute inset-0 grid place-items-center text-muted-foreground text-sm">
              Loading recording…
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="col absolute inset-0 items-center justify-center gap-3 text-muted-foreground">
      <VideoOffIcon className="size-8" />
      <span className="text-sm">
        {status === 'error'
          ? 'The recording could not be loaded. Reload the page to try again.'
          : 'No recording was captured for this session.'}
      </span>
    </div>
  );
}

function getStageStatus(isLoading: boolean, isError: boolean): StageStatus {
  if (isLoading) {
    return 'loading';
  }
  return isError ? 'error' : 'empty';
}

function ReplayStage({
  events,
  playerEvents,
  isLoading,
  isError,
  fullscreenTarget,
}: {
  events: IServiceEvent[];
  playerEvents: ReplayRecordEvent[];
  isLoading: boolean;
  isError: boolean;
  fullscreenTarget: React.RefObject<HTMLDivElement | null>;
}) {
  const { startTime, duration } = useReplayContext();
  const currentTime = useCurrentTime(FEED_TICK_MS);

  // Until the duration is known every event is kept; after that, only what
  // the recording covers can be seeked to.
  const sorted = useMemo<EventWithOffset[]>(() => {
    if (startTime == null) {
      return [];
    }
    const all = sortEventsByOffset(events, startTime);
    return duration > 0
      ? all.filter(({ offsetMs }) => offsetMs <= duration)
      : all;
  }, [events, startTime, duration]);
  const segments = useMemo(
    () => getPageSegments(sorted, duration),
    [sorted, duration]
  );
  const currentIndex = findLastIndexAtTime(sorted, currentTime);
  const currentSegment =
    segments.filter((segment) => segment.startMs <= currentTime).at(-1) ??
    segments[0];
  const hasRecording = playerEvents.length > 0;
  const stageFitHeight = useMemo(
    () => getStageFitHeight(playerEvents),
    [playerEvents]
  );

  return (
    <div className="grid in-[:fullscreen]:h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="@container col min-w-0">
        <div
          className={cn(
            'relative h-[max(360px,min(clamp(420px,64vh,760px),var(--stage-fit)))] in-[:fullscreen]:h-auto in-[:fullscreen]:flex-1 overflow-hidden bg-def-100',
            'bg-[radial-gradient(var(--def-300)_1px,transparent_1px)] [background-size:18px_18px]'
          )}
          style={{ '--stage-fit': stageFitHeight } as React.CSSProperties}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,color-mix(in_oklab,var(--highlight)_14%,transparent),transparent)]" />
          {hasRecording ? (
            <ReplayPlayer
              events={playerEvents}
              overlay={<StartOverlay />}
              url={<CurrentUrl segment={currentSegment} />}
            />
          ) : (
            <StagePlaceholder status={getStageStatus(isLoading, isError)} />
          )}
          <SkippingBadge />
        </div>
        <div className="col gap-3 border-t bg-card px-4 pt-2 pb-3">
          <ReplayTimeline
            currentSegmentId={currentSegment?.id ?? null}
            events={sorted}
            segments={segments}
          />
          <ReplayControls events={sorted} fullscreenTarget={fullscreenTarget} />
        </div>
      </div>
      <aside className="relative hidden border-l bg-card lg:block">
        <div className="absolute inset-0">
          <ReplayEventFeed
            currentIndex={currentIndex}
            events={sorted}
            isLoading={isLoading || (hasRecording && startTime == null)}
          />
        </div>
      </aside>
    </div>
  );
}

export function ReplayShell({
  sessionId,
  projectId,
  events,
}: {
  sessionId: string;
  projectId: string;
  events: IServiceEvent[];
}) {
  const trpc = useTRPC();
  const rootRef = useRef<HTMLDivElement>(null);

  // The first batch carries the full snapshot the player needs to start.
  const {
    data: firstBatch,
    isLoading,
    isError,
  } = useQuery(
    trpc.session.replayChunksFrom.queryOptions({
      sessionId,
      projectId,
      fromIndex: 0,
    })
  );

  const playerEvents = useMemo(
    () => firstBatch?.data.flatMap((row) => row?.events ?? []) ?? [],
    [firstBatch]
  );

  return (
    // Keyed so playback state (e.g. the start overlay) resets per session.
    <ReplayProvider key={sessionId}>
      <div
        className="card overflow-hidden [&:fullscreen]:rounded-none [&:fullscreen]:border-0"
        id="replay"
        ref={rootRef}
      >
        <ReplayStage
          events={events}
          fullscreenTarget={rootRef}
          isError={isError}
          isLoading={isLoading}
          playerEvents={playerEvents}
        />
      </div>
      {firstBatch?.hasMore && (
        <ReplayChunkLoader
          fromIndex={firstBatch.nextIndex}
          projectId={projectId}
          sessionId={sessionId}
        />
      )}
    </ReplayProvider>
  );
}
