import {
  FastForwardIcon,
  Maximize2Icon,
  Minimize2Icon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  SPEED_OPTIONS,
  useCurrentTime,
  useReplayContext,
} from './replay-context';
import { type EventWithOffset, formatDuration } from './replay-utils';
import { Tooltiper } from '@/components/ui/tooltip';
import { cn } from '@/utils/cn';

const JUMP_MS = 10_000;
// Jumping to "previous event" right after one fired should go to the one before.
const PREVIOUS_EVENT_GRACE_MS = 1500;

function ControlButton({
  label,
  shortcut,
  onClick,
  children,
  active,
  className,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <Tooltiper
      asChild
      content={
        <span>
          {label}
          {shortcut && (
            <kbd className="ml-2 rounded border bg-def-100 px-1 font-mono text-2xs text-muted-foreground">
              {shortcut}
            </kbd>
          )}
        </span>
      }
    >
      <button
        aria-label={label}
        className={cn(
          'flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-def-200 hover:text-foreground',
          active && 'bg-highlight/10 text-highlight hover:bg-highlight/15',
          className
        )}
        onClick={onClick}
        type="button"
      >
        {children}
      </button>
    </Tooltiper>
  );
}

export function ReplayPlayPauseButton({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const { isPlaying, isReady, toggle } = useReplayContext();
  const isLarge = size === 'lg';

  return (
    <button
      aria-label={isPlaying ? 'Pause' : 'Play'}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition-transform hover:scale-105 active:scale-95 disabled:opacity-40',
        isLarge ? 'size-16 shadow-2xl' : 'size-9'
      )}
      disabled={!isReady}
      onClick={toggle}
      type="button"
    >
      {isPlaying ? (
        <PauseIcon
          className={isLarge ? 'size-6' : 'size-4'}
          fill="currentColor"
        />
      ) : (
        <PlayIcon
          className={cn('translate-x-px', isLarge ? 'size-6' : 'size-4')}
          fill="currentColor"
        />
      )}
    </button>
  );
}

function ReplayTime() {
  const { duration } = useReplayContext();
  const currentTime = useCurrentTime(250);

  return (
    <span className="font-mono text-xs tabular-nums">
      <span className="text-foreground">{formatDuration(currentTime)}</span>
      <span className="text-muted-foreground">
        {' '}
        / {formatDuration(duration)}
      </span>
    </span>
  );
}

function useEventJumps(events: EventWithOffset[]) {
  const { currentTimeRef, seek } = useReplayContext();
  const next = useCallback(() => {
    const target = events.find(
      ({ offsetMs }) => offsetMs > currentTimeRef.current + 1
    );
    if (target) {
      seek(target.offsetMs);
    }
  }, [events, currentTimeRef, seek]);
  const previous = useCallback(() => {
    const target = events
      .filter(
        ({ offsetMs }) =>
          offsetMs < currentTimeRef.current - PREVIOUS_EVENT_GRACE_MS
      )
      .at(-1);
    seek(target ? target.offsetMs : 0);
  }, [events, currentTimeRef, seek]);
  return { next, previous };
}

function useFullscreen(target: React.RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () =>
      setIsFullscreen(document.fullscreenElement === target.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [target]);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      target.current?.requestFullscreen();
    }
  }, [target]);

  return { isFullscreen, toggle };
}

function nextSpeed(current: number, direction: 1 | -1) {
  const index = SPEED_OPTIONS.indexOf(
    current as (typeof SPEED_OPTIONS)[number]
  );
  const nextIndex = Math.max(
    0,
    Math.min(SPEED_OPTIONS.length - 1, index + direction)
  );
  return SPEED_OPTIONS[nextIndex] ?? SPEED_OPTIONS[1];
}

/** Player shortcuts; ignored while the user is typing anywhere on the page. */
function useReplayHotkeys({
  events,
  scope,
  onFullscreen,
}: {
  events: EventWithOffset[];
  scope: React.RefObject<HTMLElement | null>;
  onFullscreen: () => void;
}) {
  const {
    isReady,
    toggle,
    seek,
    currentTimeRef,
    duration,
    speed,
    setSpeed,
    toggleSkipInactive,
  } = useReplayContext();
  const jumps = useEventJumps(events);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const hasModifier = e.metaKey || e.ctrlKey || e.altKey;
      // Only while nothing else on the page has focus, or focus is in the player.
      const isInScope =
        e.target === document.body ||
        (e.target instanceof Node && scope.current?.contains(e.target));
      if (hasModifier || !isInScope) {
        return;
      }
      const actions: Record<string, () => void> = {
        ' ': toggle,
        k: toggle,
        j: () => seek(currentTimeRef.current - JUMP_MS),
        l: () => seek(Math.min(duration, currentTimeRef.current + JUMP_MS)),
        ',': jumps.previous,
        '.': jumps.next,
        '<': () => setSpeed(nextSpeed(speed, -1)),
        '>': () => setSpeed(nextSpeed(speed, 1)),
        i: toggleSkipInactive,
        f: onFullscreen,
      };
      const action = actions[e.key];
      if (!action) {
        return;
      }
      // Space on a focused button would also click it.
      const isButton = e.target instanceof HTMLButtonElement;
      if (e.key === ' ' && isButton) {
        return;
      }
      e.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isReady,
    toggle,
    seek,
    currentTimeRef,
    duration,
    speed,
    setSpeed,
    toggleSkipInactive,
    jumps,
    scope,
    onFullscreen,
  ]);
}

export function ReplayControls({
  events,
  fullscreenTarget,
}: {
  events: EventWithOffset[];
  fullscreenTarget: React.RefObject<HTMLElement | null>;
}) {
  const {
    isReady,
    seek,
    currentTimeRef,
    duration,
    speed,
    setSpeed,
    skipInactive,
    toggleSkipInactive,
  } = useReplayContext();
  const jumps = useEventJumps(events);
  const fullscreen = useFullscreen(fullscreenTarget);
  useReplayHotkeys({
    events,
    scope: fullscreenTarget,
    onFullscreen: fullscreen.toggle,
  });

  return (
    <div
      className={cn(
        'row items-center gap-1 transition-opacity',
        !isReady && 'pointer-events-none opacity-40'
      )}
    >
      <ReplayPlayPauseButton />
      <div className="row ml-2 items-center">
        <ControlButton
          label="Previous event"
          onClick={jumps.previous}
          shortcut=","
        >
          <SkipBackIcon className="size-4" />
        </ControlButton>
        <ControlButton
          label="Back 10 seconds"
          onClick={() => seek(currentTimeRef.current - JUMP_MS)}
          shortcut="J"
        >
          <RotateCcwIcon className="size-4" />
        </ControlButton>
        <ControlButton
          label="Forward 10 seconds"
          onClick={() =>
            seek(Math.min(duration, currentTimeRef.current + JUMP_MS))
          }
          shortcut="L"
        >
          <RotateCwIcon className="size-4" />
        </ControlButton>
        <ControlButton label="Next event" onClick={jumps.next} shortcut=".">
          <SkipForwardIcon className="size-4" />
        </ControlButton>
      </div>
      <div className="ml-2">
        <ReplayTime />
      </div>

      <div className="row ml-auto items-center gap-1">
        <ControlButton
          active={skipInactive}
          className="gap-1.5 px-2.5 font-medium text-xs"
          label={skipInactive ? 'Skipping idle time' : 'Skip idle time'}
          onClick={toggleSkipInactive}
          shortcut="I"
        >
          <FastForwardIcon className="size-3.5" />
          <span className="hidden sm:inline">Skip idle</span>
        </ControlButton>
        <ControlButton
          className="w-11 font-mono font-semibold text-xs tabular-nums"
          label="Playback speed"
          onClick={() => {
            const index = SPEED_OPTIONS.indexOf(speed);
            setSpeed(SPEED_OPTIONS[(index + 1) % SPEED_OPTIONS.length]!);
          }}
          shortcut="< >"
        >
          {speed}×
        </ControlButton>
        <ControlButton
          label={fullscreen.isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          onClick={fullscreen.toggle}
          shortcut="F"
        >
          {fullscreen.isFullscreen ? (
            <Minimize2Icon className="size-4" />
          ) : (
            <Maximize2Icon className="size-4" />
          )}
        </ControlButton>
      </div>
    </div>
  );
}
