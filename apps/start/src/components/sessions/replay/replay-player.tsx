'use client';

import { useReplayContext } from '@/components/sessions/replay/replay-context';
import type { ReplayPlayerInstance } from '@/components/sessions/replay/replay-context';
import { useEffect, useMemo, useRef } from 'react';

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

export function ReplayPlayer({
  events,
}: {
  events: Array<{ type: number; data: unknown; timestamp: number }>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<ReplayPlayerInstance | null>(null);
  const { registerPlayer, unregisterPlayer } = useReplayContext();

  const recordedDimensions = useMemo(
    () => getRecordedDimensions(events),
    [events],
  );

  useEffect(() => {
    if (!events.length || !containerRef.current) return;

    let mounted = true;

    import('rrweb-player').then((module) => {
      const PlayerConstructor = module.default;
      if (!containerRef.current || !mounted) return;
      containerRef.current.innerHTML = '';

      const maxHeight = window.innerHeight * 0.7;
      const containerWidth = containerRef.current.offsetWidth;
      const aspectRatio = recordedDimensions
        ? recordedDimensions.width / recordedDimensions.height
        : 16 / 9;
      const height = Math.min(
        Math.round(containerWidth / aspectRatio),
        maxHeight,
      );
      const width = Math.min(
        containerWidth,
        Math.round(height * aspectRatio),
      );

      const player = new PlayerConstructor({
        target: containerRef.current,
        props: {
          events,
          width,
          height,
          autoPlay: false,
          showController: false,
          speedOption: [0.5, 1, 2, 4, 8],
        },
      }) as ReplayPlayerInstance;
      playerRef.current = player;
      registerPlayer(player);
    });

    return () => {
      mounted = false;
      unregisterPlayer();
      if (playerRef.current?.$destroy) {
        playerRef.current.$destroy();
        playerRef.current = null;
      }
    };
  }, [events, registerPlayer, unregisterPlayer, recordedDimensions]);

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
