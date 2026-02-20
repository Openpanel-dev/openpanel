import type { IServiceEvent } from '@openpanel/db';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserChrome } from './browser-chrome';
import { ReplayTime } from './replay-controls';
import { getEventOffsetMs } from './replay-utils';
import {
  ReplayProvider,
  useCurrentTime,
  useReplayContext,
} from '@/components/sessions/replay/replay-context';
import { ReplayEventFeed } from '@/components/sessions/replay/replay-event-feed';
import { ReplayPlayer } from '@/components/sessions/replay/replay-player';
import { ReplayTimeline } from '@/components/sessions/replay/replay-timeline';
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

    const latest = withOffset[withOffset.length - 1];
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
 * through the rest using replayChunksFrom.
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
  const { addEvent, refreshDuration } = useReplayContext();

  useEffect(() => {
    function recursive(fromIndex: number) {
      queryClient
        .fetchQuery(
          trpc.session.replayChunksFrom.queryOptions({
            sessionId,
            projectId,
            fromIndex,
          })
        )
        .then((res) => {
          res.data.forEach((row) => {
            row.events.forEach((event) => {
              addEvent(event);
            });
          });
          refreshDuration();
          if (res.hasMore) {
            recursive(fromIndex + res.data.length);
          }
        });
    }

    recursive(fromIndex);
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

  const events = eventsData?.data ?? [];
  const playerEvents = firstBatch?.data.flatMap((row) => row.events) ?? [];
  const hasMore = firstBatch?.hasMore ?? false;
  const hasReplay = playerEvents.length !== 0;

  return (
    <ReplayProvider>
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
            {replayLoading ? (
              <div className="col h-[320px] items-center justify-center gap-4 bg-background">
                <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
                <div>Loading session replay</div>
              </div>
            ) : hasReplay ? (
              <ReplayPlayer events={playerEvents} />
            ) : (
              <div className="flex h-[320px] items-center justify-center bg-background text-muted-foreground text-sm">
                No replay data available for this session.
              </div>
            )}
            {hasReplay && <ReplayTimeline events={events} />}
          </BrowserChrome>
        </div>
        <div className="relative hidden lg:block">
          <div className="absolute inset-0">
            <ReplayEventFeed events={events} replayLoading={replayLoading} />
          </div>
        </div>
      </div>
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
