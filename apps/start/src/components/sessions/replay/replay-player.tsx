import { LockIcon } from 'lucide-react';
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DEFAULT_SKIP_INACTIVE,
  type ReplayPlayerInstance,
  SPEED_OPTIONS,
  useReplayContext,
} from './replay-context';
import { getRecordedDimensions, type ReplayRecordEvent } from './replay-utils';
import { cn } from '@/utils/cn';

import 'rrweb-player/dist/style.css';

const FALLBACK_ASPECT_RATIO = 16 / 9;
const STAGE_PADDING = 24;
const BROWSER_BAR_HEIGHT = 36;
const PHONE_BEZEL = 10;
const PHONE_URL_HEIGHT = 36;
const MOUSE_TAIL = {
  duration: 600,
  lineCap: 'round',
  lineWidth: 3,
  strokeStyle: 'rgba(34, 102, 236, 0.45)',
};

type FrameKind = 'browser' | 'phone';

interface Size {
  width: number;
  height: number;
}

function fitViewport(area: Size, aspectRatio: number, kind: FrameKind): Size {
  const chromeWidth = kind === 'phone' ? PHONE_BEZEL * 2 : 0;
  const chromeHeight =
    kind === 'phone' ? PHONE_BEZEL * 2 + PHONE_URL_HEIGHT : BROWSER_BAR_HEIGHT;
  const maxWidth = Math.max(0, area.width - STAGE_PADDING * 2 - chromeWidth);
  const maxHeight = Math.max(0, area.height - STAGE_PADDING * 2 - chromeHeight);
  const height = Math.min(maxHeight, maxWidth / aspectRatio);
  return {
    width: Math.round(height * aspectRatio),
    height: Math.round(height),
  };
}

/**
 * Height a stage needs to show a wide recording edge to edge, as CSS against
 * the stage's container width; tall recordings are bounded by the stage's max.
 */
export function getStageFitHeight(events: ReplayRecordEvent[]): string {
  const recorded = getRecordedDimensions(events);
  const aspectRatio = recorded
    ? recorded.width / recorded.height
    : FALLBACK_ASPECT_RATIO;
  if (aspectRatio < 1) {
    return '100vh';
  }
  const verticalChrome = STAGE_PADDING * 2 + BROWSER_BAR_HEIGHT;
  return `calc((100cqw - ${STAGE_PADDING * 2}px) / ${aspectRatio.toFixed(4)} + ${verticalChrome}px)`;
}

function BrowserFrame({
  url,
  viewport,
  children,
  width,
}: {
  url: ReactNode;
  viewport: string | null;
  children: ReactNode;
  width: number;
}) {
  return (
    <div
      className="overflow-hidden rounded-xl bg-card shadow-[0_30px_80px_-20px_rgb(0_0_0/0.35),0_0_0_1px_var(--border)]"
      style={{ width }}
    >
      <div
        className="row items-center gap-3 border-b bg-def-100 px-3"
        style={{ height: BROWSER_BAR_HEIGHT }}
      >
        <div className="row shrink-0 gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="row h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md bg-card px-2.5 text-xs shadow-[0_0_0_1px_var(--border)]">
          <LockIcon className="size-3 shrink-0 text-muted-foreground" />
          {url}
        </div>
        {viewport && (
          <span className="hidden shrink-0 font-mono text-2xs text-muted-foreground sm:block">
            {viewport}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function PhoneFrame({
  url,
  children,
}: {
  url: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="col items-center">
      <div
        className="row max-w-full items-center gap-1.5 self-stretch px-2"
        style={{ height: PHONE_URL_HEIGHT }}
      >
        <div className="row mx-auto h-6 min-w-0 max-w-full items-center gap-1.5 rounded-full bg-card px-3 text-xs shadow-[0_0_0_1px_var(--border)]">
          <LockIcon className="size-3 shrink-0 text-muted-foreground" />
          {url}
        </div>
      </div>
      <div
        className="rounded-[44px] bg-neutral-900 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.45),inset_0_0_0_1px_rgb(255_255_255/0.08)] ring-1 ring-black/40"
        style={{ padding: PHONE_BEZEL }}
      >
        <div className="overflow-hidden rounded-[34px] bg-card">{children}</div>
      </div>
    </div>
  );
}

export function ReplayPlayer({
  events,
  url,
  overlay,
}: {
  events: ReplayRecordEvent[];
  url: ReactNode;
  overlay?: ReactNode;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<ReplayPlayerInstance | null>(null);
  const {
    onPlayerReady,
    onPlayerDestroy,
    setCurrentTime,
    setIsPlaying,
    setIsSkipping,
  } = useReplayContext();
  const [importError, setImportError] = useState(false);
  const [size, setSize] = useState<Size | null>(null);
  const sizeRef = useRef<Size | null>(null);

  const recorded = useMemo(() => getRecordedDimensions(events), [events]);
  const aspectRatio = recorded
    ? recorded.width / recorded.height
    : FALLBACK_ASPECT_RATIO;
  const frameKind: FrameKind = aspectRatio < 1 ? 'phone' : 'browser';

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) {
      return;
    }
    const measure = () => {
      const next = fitViewport(
        { width: area.clientWidth, height: area.clientHeight },
        aspectRatio,
        frameKind
      );
      sizeRef.current = next;
      setSize(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [aspectRatio, frameKind]);

  const hasSize = size !== null && size.width > 0;

  useEffect(() => {
    const container = containerRef.current;
    const initialSize = sizeRef.current;
    if (!(events.length && container && hasSize && initialSize)) {
      return;
    }

    container.innerHTML = '';
    let mounted = true;
    let player: ReplayPlayerInstance | null = null;
    let handleVisibilityChange: (() => void) | null = null;

    import('rrweb-player')
      .then((module) => {
        if (!mounted) {
          return;
        }
        player = new module.default({
          target: container,
          props: {
            events,
            width: initialSize.width,
            height: initialSize.height,
            autoPlay: false,
            showController: false,
            speedOption: [...SPEED_OPTIONS],
            skipInactive: DEFAULT_SKIP_INACTIVE,
            mouseTail: MOUSE_TAIL,
          },
        }) as unknown as ReplayPlayerInstance;
        playerRef.current = player;

        let playingState = false;
        player.addEventListener('ui-update-current-time', (e) => {
          setCurrentTime(e.payload as number);
        });
        player.addEventListener('ui-update-player-state', (e) => {
          playingState = e.payload === 'playing';
          setIsPlaying(playingState);
        });
        player.addEventListener('skip-start', () => setIsSkipping(true));
        player.addEventListener('skip-end', () => setIsSkipping(false));

        // Pause while the tab is hidden so the replay clock does not drift.
        let wasPlaying = false;
        handleVisibilityChange = () => {
          if (!player) {
            return;
          }
          if (document.hidden) {
            wasPlaying = playingState;
            if (wasPlaying) {
              player.pause();
            }
          } else if (wasPlaying) {
            player.play();
            wasPlaying = false;
          }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        onPlayerReady(player, events);
      })
      .catch(() => {
        if (mounted) {
          setImportError(true);
        }
      });

    return () => {
      mounted = false;
      if (handleVisibilityChange) {
        document.removeEventListener(
          'visibilitychange',
          handleVisibilityChange
        );
      }
      player?.pause();
      container.innerHTML = '';
      playerRef.current = null;
      onPlayerDestroy();
    };
  }, [
    events,
    hasSize,
    onPlayerReady,
    onPlayerDestroy,
    setCurrentTime,
    setIsPlaying,
    setIsSkipping,
  ]);

  useEffect(() => {
    if (!(size && playerRef.current?.$set)) {
      return;
    }
    playerRef.current.$set({ width: size.width, height: size.height });
    playerRef.current.triggerResize();
  }, [size]);

  if (importError) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Failed to load replay player.
      </div>
    );
  }

  const viewport = (
    <div
      className={cn(
        'relative overflow-hidden bg-card',
        '[&_.rr-player]:!float-none [&_.rr-player]:!rounded-none [&_.rr-player]:!bg-transparent [&_.rr-player]:!shadow-none',
        '[&_.replayer-mouse]:after:!bg-highlight [&_.replayer-mouse]:after:!opacity-50'
      )}
      style={size ?? undefined}
    >
      <div ref={containerRef} />
      {overlay}
    </div>
  );

  const viewportLabel = recorded
    ? `${recorded.width} × ${recorded.height}`
    : null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      ref={areaRef}
    >
      {hasSize &&
        (frameKind === 'phone' ? (
          <PhoneFrame url={url}>{viewport}</PhoneFrame>
        ) : (
          <BrowserFrame url={url} viewport={viewportLabel} width={size.width}>
            {viewport}
          </BrowserFrame>
        ))}
    </div>
  );
}
