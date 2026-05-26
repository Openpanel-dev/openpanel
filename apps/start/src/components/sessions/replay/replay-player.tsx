import { Button } from '@/components/ui/button';
import { useTRPC } from '@/integrations/trpc/react';
import { useQueryClient } from '@tanstack/react-query';
import { PauseIcon, PlayIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Replayer } from 'rrweb';
import type { eventWithTime } from 'rrweb';

interface ReplayPlayerProps {
  sessionId: string;
  projectId: string;
}

interface MousePosition {
  t: number;
  x: number;
  y: number;
}

function formatMs(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function extractMousePositions(events: eventWithTime[]): MousePosition[] {
  const positions: MousePosition[] = [];
  for (const e of events) {
    // type 3 = IncrementalSnapshot, source 1 = MouseMove
    if ((e as any).type === 3 && (e as any).data?.source === 1) {
      for (const p of ((e as any).data.positions ?? [])) {
        positions.push({ t: e.timestamp + (p.timeOffset ?? 0), x: p.x, y: p.y });
      }
    }
  }
  return positions.sort((a, b) => a.t - b.t);
}

function findCursorAt(positions: MousePosition[], absT: number): MousePosition | null {
  if (positions.length === 0) return null;
  let lo = 0;
  let hi = positions.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (positions[mid].t <= absT) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return positions[best] ?? null;
}

export function ReplayPlayer({ sessionId, projectId }: ReplayPlayerProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<Replayer | null>(null);
  const scaleRef = useRef<number>(1);
  const mousePositionsRef = useRef<MousePosition[]>([]);
  const startTimestampRef = useRef<number>(0);
  const cursorDotRef = useRef<HTMLDivElement>(null);

  const [events, setEvents] = useState<eventWithTime[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);

  // Fetch all chunk pages upfront
  useEffect(() => {
    let cancelled = false;

    async function loadAllChunks() {
      try {
        let fromIndex = 0;
        const allEvents: eventWithTime[] = [];

        while (!cancelled) {
          const page = await queryClient.fetchQuery(
            trpc.session.replayChunksFrom.queryOptions({
              sessionId,
              projectId,
              fromIndex,
            }),
          );

          for (const chunk of page.data) {
            allEvents.push(...(chunk.events as unknown as eventWithTime[]));
          }

          if (!page.hasMore) break;
          fromIndex += 50;
        }

        if (!cancelled) {
          setEvents(allEvents);
          setLoaded(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load replay data.');
        }
      }
    }

    loadAllChunks();
    return () => {
      cancelled = true;
    };
  }, [sessionId, projectId]);

  // Init replayer once events are available
  useEffect(() => {
    const container = containerRef.current;
    if (!loaded || !container || events.length === 0) return;

    // Pull recorded viewport from the Meta event (type 4) so we can scale correctly
    const metaEvent = events.find((e) => (e as any).type === 4);
    const recordedWidth: number = (metaEvent?.data as any)?.width ?? 1280;
    const recordedHeight: number = (metaEvent?.data as any)?.height ?? 800;

    // Pre-extract mouse positions for the cursor overlay
    mousePositionsRef.current = extractMousePositions(events);
    startTimestampRef.current = events[0]?.timestamp ?? 0;

    // mouseTail disabled — causes blank iframe in rrweb 2.0.0-alpha.20.
    // Cursor is rendered by our own overlay instead (see cursorPos state).
    const replayer = new Replayer(events, {
      root: container,
      mouseTail: false,
    });

    const meta = replayer.getMetaData();
    setTotalTime(meta.totalTime);

    // Scale the replayer wrapper so the full recorded page fits the container width
    const applyScale = () => {
      const wrapper = container.querySelector('.replayer-wrapper') as HTMLElement | null;
      if (!wrapper) return;
      const scale = Math.min(1, container.clientWidth / recordedWidth);
      scaleRef.current = scale;
      wrapper.style.transform = `scale(${scale})`;
      wrapper.style.transformOrigin = 'top left';
      // shrink the outer container to match scaled height so no dead space below
      container.style.height = `${Math.round(recordedHeight * scale)}px`;
    };
    // rrweb injects the wrapper asynchronously — wait one tick
    setTimeout(applyScale, 50);

    // Cursor updates via direct DOM mutation (no React re-render) — 50ms for smooth movement
    const cursorTimer = setInterval(() => {
      const dot = cursorDotRef.current;
      if (!dot) return;
      const absT = startTimestampRef.current + (replayerRef.current?.getCurrentTime() ?? 0);
      const pos = findCursorAt(mousePositionsRef.current, absT);
      if (pos) {
        dot.style.left = `${pos.x * scaleRef.current}px`;
        dot.style.top = `${pos.y * scaleRef.current}px`;
        dot.style.display = 'block';
      }
    }, 50);

    // Scrubber / time display updates via React state — 300ms is plenty
    const timer = setInterval(() => {
      if (replayerRef.current) {
        setCurrentTime(replayerRef.current.getCurrentTime());
      }
    }, 300);

    replayer.on('finish', () => setPlaying(false));

    replayerRef.current = replayer;

    return () => {
      clearInterval(cursorTimer);
      clearInterval(timer);
      replayerRef.current?.pause();
      container.innerHTML = '';
      container.style.height = '';
      replayerRef.current = null;
      if (cursorDotRef.current) cursorDotRef.current.style.display = 'none';
    };
  }, [loaded, events]);

  function togglePlay() {
    const r = replayerRef.current;
    if (!r) return;
    if (playing) {
      r.pause();
    } else {
      r.play();
    }
    setPlaying((p) => !p);
  }

  function seek(timeMs: number) {
    replayerRef.current?.play(timeMs);
    setCurrentTime(timeMs);
    setPlaying(true);
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-32 text-destructive text-sm">
        {error}
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm animate-pulse">
        Loading replay…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        No replay data for this session.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* rrweb mounts an iframe here; height set dynamically after scale is applied */}
      <div className="relative w-full overflow-hidden rounded-md border bg-white" style={{ minHeight: 200 }}>
        <div ref={containerRef} className="w-full" />
        {/* Custom cursor overlay — position mutated directly, no React re-render on each tick */}
        <div
          ref={cursorDotRef}
          className="pointer-events-none absolute z-10 size-3 rounded-full bg-indigo-500/80 ring-2 ring-white shadow-md"
          style={{ display: 'none', transform: 'translate(-50%, -50%)' }}
        />
      </div>
      {/* Controls */}
      <div className="flex items-center gap-3 px-1">
        <Button variant="ghost" size="icon" onClick={togglePlay}>
          {playing ? (
            <PauseIcon className="size-4" />
          ) : (
            <PlayIcon className="size-4" />
          )}
        </Button>
        <input
          type="range"
          min={0}
          max={totalTime || 1}
          value={currentTime}
          onChange={(e) => seek(Number(e.target.value))}
          className="flex-1 h-1.5 accent-primary cursor-pointer"
        />
        <span className="text-xs text-muted-foreground tabular-nums w-20 text-right">
          {formatMs(currentTime)} / {formatMs(totalTime)}
        </span>
      </div>
    </div>
  );
}
