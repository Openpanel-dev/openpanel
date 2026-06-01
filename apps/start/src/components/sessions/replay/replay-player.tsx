import { useReplayContext } from '@/components/sessions/replay/replay-context';
import type { ReplayPlayerInstance } from '@/components/sessions/replay/replay-context';
import { useEffect, useMemo, useRef, useState } from 'react';

import 'rrweb-player/dist/style.css';

/** rrweb meta event (type 4) carries the recorded viewport size */
function getRecordedDimensions(
  events: Array<{ type: number; data: unknown }>,
): { width: number; height: number } | null {
  const meta = events.find((e) => e.type === 4);
  if (
    meta &&
    typeof meta.data === 'object' &&
    meta.data !== null &&
    'width' in meta.data &&
    'height' in meta.data
  ) {
    const { width, height } = meta.data as { width: number; height: number };
    if (width > 0 && height > 0) return { width, height };
  }
  return null;
}

function calcDimensions(
  containerWidth: number,
  aspectRatio: number,
): { width: number; height: number } {
  const maxHeight = window.innerHeight * 0.7;
  const height = Math.min(Math.round(containerWidth / aspectRatio), maxHeight);
  const width = Math.min(containerWidth, Math.round(height * aspectRatio));
  return { width, height };
}

export function ReplayPlayer({
  events,
}: {
  events: Array<{ type: number; data: unknown; timestamp: number }>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<ReplayPlayerInstance | null>(null);
  const {
    onPlayerReady,
    onPlayerDestroy,
    setCurrentTime,
    setIsPlaying,
    setDuration,
  } = useReplayContext();
  const [importError, setImportError] = useState(false);

  const recordedDimensions = useMemo(
    () => getRecordedDimensions(events),
    [events],
  );

  useEffect(() => {
    if (!events.length || !containerRef.current) return;

    // Clear any previous player DOM
    containerRef.current.innerHTML = '';

    let mounted = true;
    let player: ReplayPlayerInstance | null = null;
    let handleVisibilityChange: (() => void) | null = null;

    const aspectRatio = recordedDimensions
      ? recordedDimensions.width / recordedDimensions.height
      : 16 / 9;

    const { width, height } = calcDimensions(
      containerRef.current.offsetWidth,
      aspectRatio,
    );

    import('rrweb-player')
      .then((module) => {
        if (!containerRef.current || !mounted) return;

        const PlayerConstructor = module.default;
        player = new PlayerConstructor({
          target: containerRef.current,
          props: {
            events,
            width,
            height,
            autoPlay: false,
            showController: false,
            speedOption: [0.5, 1, 2, 4, 8],
            UNSAFE_replayCanvas: true,
            skipInactive: false,
          },
        }) as ReplayPlayerInstance;

        playerRef.current = player;

        // Track play state from replayer (getMetaData() does not expose isPlaying)
        let playingState = false;

        // Wire rrweb's built-in event emitter — no RAF loop needed.
        // Note: rrweb-player does NOT emit ui-update-duration; duration is
        // read from getMetaData() on init and after each addEvent batch.
        player.addEventListener('ui-update-current-time', (e) => {
          const t = e.payload as number;
          setCurrentTime(t);
        });

        player.addEventListener('ui-update-player-state', (e) => {
          const playing = e.payload === 'playing';
          playingState = playing;
          setIsPlaying(playing);
        });

        // Pause on tab hide; resume on show (prevents timer drift).
        // getMetaData() does not expose isPlaying, so we use playingState
        // kept in sync by ui-update-player-state above.
        let wasPlaying = false;
        handleVisibilityChange = () => {
          if (!player) return;
          if (document.hidden) {
            wasPlaying = playingState;
            if (wasPlaying) player.pause();
          } else {
            if (wasPlaying) {
              player.play();
              wasPlaying = false;
            }
          }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Notify context — marks isReady = true and sets initial duration
        const meta = player.getMetaData();
        if (meta.totalTime > 0) setDuration(meta.totalTime);
        onPlayerReady(player, meta.startTime);
      })
      .catch(() => {
        if (mounted) setImportError(true);
      });

    const onWindowResize = () => {
      if (!containerRef.current || !mounted || !playerRef.current?.$set) return;
      const { width: w, height: h } = calcDimensions(
        containerRef.current.offsetWidth,
        aspectRatio,
      );
      playerRef.current.$set({ width: w, height: h });
    };
    window.addEventListener('resize', onWindowResize);

    return () => {
      mounted = false;
      window.removeEventListener('resize', onWindowResize);
      if (handleVisibilityChange) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (player) {
        player.pause();
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      playerRef.current = null;
      onPlayerDestroy();
    };
  }, [events, recordedDimensions, onPlayerReady, onPlayerDestroy, setCurrentTime, setIsPlaying, setDuration]);

  if (importError) {
    return (
      <div className="flex h-[320px] items-center justify-center bg-black text-sm text-muted-foreground">
        Failed to load replay player.
      </div>
    );
  }

  return (
    <div className="relative flex w-full justify-center overflow-hidden">
      <div
        ref={containerRef}
        className="w-full"
        style={{ maxHeight: '70vh' }}
      />
    </div>
  );
}
