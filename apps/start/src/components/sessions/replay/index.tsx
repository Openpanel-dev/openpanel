import type { IServiceEvent } from '@openpanel/db';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserChrome } from './browser-chrome';
import { ReplayTime } from './replay-controls';
import { ReplayTimeline } from './replay-timeline';
import { getEventOffsetMs } from './replay-utils';
import {
  ReplayProvider,
  useCurrentTime,
  useReplayContext,
} from '@/components/sessions/replay/replay-context';
import { ReplayEventFeed } from '@/components/sessions/replay/replay-event-feed';
import { ReplayPlayer } from '@/components/sessions/replay/replay-player';
import { useTRPC } from '@/integrations/trpc/react';

function BrowserUrlBar({ events }: { events: IServiceEvent[] }) {
  const { startTime } = useReplayContext();
  const currentTime = useCurrentTime(250);

  const currentUrl = useMemo(() => {
    if (startTime == null || !events.length) {
      return '';
    }

    const withOffset = events
      .map((ev) => ({
        event: ev,
        offsetMs: getEventOffsetMs(ev, startTime),
      }))
      .filter(({ offsetMs }) => offsetMs >= -10_000 && offsetMs <= currentTime)
      .sort((a, b) => a.offsetMs - b.offsetMs);

    const latest = withOffset.at(-1);
    if (!latest) {
      return '';
    }

    const { origin = '', path = '/' } = latest.event;
    return `${origin}${path}`;
  }, [events, currentTime, startTime]);

  return <span className="truncate text-muted-foreground">{currentUrl}</span>;
}

/**
 * Feeds remaining chunks into the player after it's ready.
 * Receives already-fetched chunks from the initial batch, then pages
 * through the rest using replayChunksFrom. Each chunk goes through
 * markChunkLoaded so the buffer (used by the buffer-aware seek path) stays
 * in sync.
 */
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
  const { markChunkLoaded } = useReplayContext();

  useEffect(() => {
    let cancelled = false;
    function recursive(fromIndex: number) {
      queryClient
        .fetchQuery(
          trpc.session.replayChunksFrom.queryOptions({
            sessionId,
            projectId,
            fromIndex,
          }),
        )
        .then((res) => {
          if (cancelled) return;
          res.data.forEach((row) => {
            if (!row) return;
            markChunkLoaded({
              chunkIndex: row.chunkIndex,
              startedAtMs: row.startedAtMs,
              endedAtMs: row.endedAtMs,
              events: row.events ?? [],
            });
          });
          if (res.hasMore) {
            recursive(fromIndex + res.data.length);
          }
        })
        .catch(() => {
          // chunk loading failed — replay may be incomplete
        });
    }

    recursive(fromIndex);
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

function FullscreenButton({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = useCallback(() => {
    if (!containerRef.current) {
      return;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }, [containerRef]);

  return (
    <button
      aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
      onClick={toggle}
      type="button"
    >
      {isFullscreen ? (
        <Minimize2 className="h-3.5 w-3.5" />
      ) : (
        <Maximize2 className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

/**
 * Inside the provider, seed the buffer with first-batch chunks (events already
 * passed to rrweb at construction — no addToPlayer) and register the prefetch
 * function so the buffer-aware seek path can fetch chunks on demand.
 */
function ReplayBufferBootstrap({
  sessionId,
  projectId,
  firstBatch,
}: {
  sessionId: string;
  projectId: string;
  firstBatch: { chunkIndex: number; startedAtMs: number; endedAtMs: number; events: { type: number; data: unknown; timestamp: number }[] }[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { markChunkLoaded, setPrefetchChunks, setSeekFetch, isReady } =
    useReplayContext();

  // Seed the buffer once the player is ready (so duration recompute uses the
  // real rrweb metadata, not 0).
  useEffect(() => {
    if (!isReady || firstBatch.length === 0) return;
    for (const row of firstBatch) {
      markChunkLoaded(row, { addToPlayer: false });
    }
  }, [isReady, firstBatch, markChunkLoaded]);

  // Register the prefetch function that the seek slow-path calls.
  useEffect(() => {
    setPrefetchChunks(async (fromIndex, toIndex) => {
      const res = await queryClient.fetchQuery(
        trpc.session.replayChunksByIndexRange.queryOptions({
          sessionId,
          projectId,
          fromIndex,
          toIndex,
        }),
      );
      return res.data.map((row) => ({
        chunkIndex: row.chunkIndex,
        startedAtMs: row.startedAtMs,
        endedAtMs: row.endedAtMs,
        events: row.events ?? [],
      }));
    });
    return () => setPrefetchChunks(null);
  }, [sessionId, projectId, queryClient, trpc, setPrefetchChunks]);

  // Register the smart-seek fetcher. Used by seek() to jump to the latest
  // full DOM snapshot before the target time — one round trip, no walking.
  useEffect(() => {
    setSeekFetch(async (targetMs) => {
      const res = await queryClient.fetchQuery(
        trpc.session.replayChunksAroundTime.queryOptions({
          sessionId,
          projectId,
          targetMs,
        }),
      );
      return res.data.map((row) => ({
        chunkIndex: row.chunkIndex,
        startedAtMs: row.startedAtMs,
        endedAtMs: row.endedAtMs,
        events: row.events ?? [],
      }));
    });
    return () => setSeekFetch(null);
  }, [sessionId, projectId, queryClient, trpc, setSeekFetch]);

  return null;
}

function ReplayContent({
  sessionId,
  projectId,
}: {
  sessionId: string;
  projectId: string;
}) {
  const trpc = useTRPC();
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: eventsData } = useQuery(
    trpc.event.events.queryOptions({
      projectId,
      sessionId,
      filters: [],
      columnVisibility: {},
    })
  );

  // Fetch first batch of chunks (includes chunk 0 for player init + more)
  const { data: firstBatch, isLoading: replayLoading } = useQuery(
    trpc.session.replayChunksFrom.queryOptions({
      sessionId,
      projectId,
      fromIndex: 0,
    })
  );

  // Definitive replay duration. One cheap min/max query — shown as the
  // canonical timeline length from first paint instead of rrweb's progressive
  // totalTime that grows as chunks load.
  const { data: replayMeta } = useQuery(
    trpc.session.replayMeta.queryOptions({ sessionId, projectId }),
  );

  const events = eventsData?.data ?? [];
  // Memoize the flat events array so its identity is stable across re-renders
  // (replayMeta landing, buffering state flipping, etc.) — otherwise rrweb's
  // useEffect would tear down and recreate the player on every parent render,
  // visibly resetting playback to 0:00.
  const playerEvents = useMemo(
    () => firstBatch?.data.flatMap((row) => row?.events ?? []) ?? [],
    [firstBatch],
  );
  // Stable reference for the same reason — passed into ReplayBufferBootstrap.
  const firstBatchData = useMemo(
    () => firstBatch?.data ?? [],
    [firstBatch],
  );
  const hasMore = firstBatch?.hasMore ?? false;
  const hasReplay = playerEvents.length !== 0;

  function renderReplay() {
    if (replayLoading) {
      return (
        <div className="col h-[320px] items-center justify-center gap-4 bg-background">
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
          <div>Loading session replay</div>
        </div>
      );
    }
    if (hasReplay) {
      return <ReplayPlayer events={playerEvents} />;
    }
    return (
      <div className="flex h-[320px] items-center justify-center bg-background text-muted-foreground text-sm">
        No replay data available for this session.
      </div>
    );
  }

  return (
    <ReplayProvider totalDurationMs={replayMeta?.totalDurationMs}>
      <div
        className="grid gap-4 lg:grid-cols-[1fr_380px] [&:fullscreen]:flex [&:fullscreen]:flex-col [&:fullscreen]:bg-background [&:fullscreen]:p-4"
        id="replay"
        ref={containerRef}
      >
        <div className="flex min-w-0 flex-col overflow-hidden">
          <BrowserChrome
            right={
              <div className="flex items-center gap-2">
                {hasReplay && <ReplayTime />}
                <FullscreenButton containerRef={containerRef} />
              </div>
            }
            url={
              hasReplay ? (
                <BrowserUrlBar events={events} />
              ) : (
                <span className="text-muted-foreground">about:blank</span>
              )
            }
          >
            {renderReplay()}
            {hasReplay && <ReplayTimeline events={events} />}
          </BrowserChrome>
        </div>
        <div className="relative hidden lg:block">
          <div className="absolute inset-0">
            <ReplayEventFeed events={events} replayLoading={replayLoading} />
          </div>
        </div>
      </div>
      {hasReplay && (
        <ReplayBufferBootstrap
          firstBatch={firstBatchData}
          projectId={projectId}
          sessionId={sessionId}
        />
      )}
      {hasReplay && hasMore && (
        <ReplayChunkLoader
          fromIndex={firstBatch?.data?.length ?? 0}
          projectId={projectId}
          sessionId={sessionId}
        />
      )}
    </ReplayProvider>
  );
}

export function ReplayShell({
  sessionId,
  projectId,
}: {
  sessionId: string;
  projectId: string;
}) {
  return <ReplayContent projectId={projectId} sessionId={sessionId} />;
}
