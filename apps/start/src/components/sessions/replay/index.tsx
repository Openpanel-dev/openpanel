'use client';

import {
  ReplayProvider,
  useReplayContext,
} from '@/components/sessions/replay/replay-context';
import { ReplayEventFeed } from '@/components/sessions/replay/replay-event-feed';
import { ReplayPlayer } from '@/components/sessions/replay/replay-player';
import { ReplayTimeline } from '@/components/sessions/replay/replay-timeline';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import type { IServiceEvent } from '@openpanel/db';
import { type ReactNode, useMemo } from 'react';
import { BrowserChrome } from './browser-chrome';
import { ReplayTime } from './replay-controls';

function getEventOffsetMs(event: IServiceEvent, startTime: number): number {
  const t =
    typeof event.createdAt === 'object' && event.createdAt instanceof Date
      ? event.createdAt.getTime()
      : new Date(event.createdAt).getTime();
  return t - startTime;
}

function BrowserUrlBar({ events }: { events: IServiceEvent[] }) {
  const { currentTime, startTime } = useReplayContext();

  const currentUrl = useMemo(() => {
    if (startTime == null || !events.length) return '';

    const withOffset = events
      .map((ev) => ({
        event: ev,
        offsetMs: getEventOffsetMs(ev, startTime),
      }))
      .filter(({ offsetMs }) => offsetMs >= -10_000 && offsetMs <= currentTime)
      .sort((a, b) => a.offsetMs - b.offsetMs);

    const latest = withOffset[withOffset.length - 1];
    if (!latest) return '';

    const { origin = '', path = '/' } = latest.event;
    const pathPart = path.startsWith('/') ? path : `/${path}`;
    return `${origin}${pathPart}`;
  }, [events, currentTime, startTime]);

  return <span className="text-muted-foreground truncate">{currentUrl}</span>;
}

function ReplayContent({
  sessionId,
  projectId,
}: {
  sessionId: string;
  projectId: string;
}) {
  const trpc = useTRPC();
  const {
    data: replayData,
    isLoading: replayLoading,
    isError: replayError,
  } = useQuery(trpc.session.replay.queryOptions({ sessionId, projectId }));
  const { data: eventsData } = useQuery(
    trpc.event.events.queryOptions({
      projectId,
      sessionId,
      filters: [],
      columnVisibility: {},
    }),
  );

  const events = eventsData?.data ?? [];
  const replayEvents = replayData?.events as
    | Array<{ type: number; data: unknown; timestamp: number }>
    | undefined;

  if (replayLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]" id="replay">
        <div className="flex min-w-0 flex-col overflow-hidden">
          <BrowserChrome>
            <div className="flex h-[320px] items-center justify-center bg-black">
              <div className="h-8 w-8 animate-pulse rounded-full bg-muted-foreground/20" />
            </div>
          </BrowserChrome>
        </div>
        <div className="hidden lg:block" />
      </div>
    );
  }

  if (replayError || !replayEvents?.length) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]" id="replay">
        <div className="flex min-w-0 flex-col overflow-hidden">
          <BrowserChrome
            url={<span className="text-muted-foreground">about:blank</span>}
          >
            <div className="flex h-[320px] items-center justify-center bg-black text-muted-foreground">
              No replay data available for this session.
            </div>
          </BrowserChrome>
        </div>
        <div className="hidden lg:block" />
      </div>
    );
  }

  return (
    <ReplayProvider>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]" id="replay">
        <div className="flex min-w-0 flex-col overflow-hidden">
          <BrowserChrome
            url={<BrowserUrlBar events={events} />}
            right={<ReplayTime />}
          >
            <ReplayPlayer events={replayEvents} />
            <ReplayTimeline events={events} />
          </BrowserChrome>
        </div>
        <div className="hidden lg:block relative">
          <div className="absolute inset-0">
            <ReplayEventFeed events={events} />
          </div>
        </div>
      </div>
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
  return <ReplayContent sessionId={sessionId} projectId={projectId} />;
}
