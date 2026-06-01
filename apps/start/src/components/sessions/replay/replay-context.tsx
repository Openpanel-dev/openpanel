import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface ReplayPlayerInstance {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  goto: (timeOffset: number, play?: boolean) => void;
  setSpeed: (speed: number) => void;
  getMetaData: () => { startTime: number; endTime: number; totalTime: number };
  getReplayer: () => { getCurrentTime: () => number };
  addEvent: (event: { type: number; data: unknown; timestamp: number }) => void;
  addEventListener: (event: string, handler: (e: { payload: unknown }) => void) => void;
  $set?: (props: Record<string, unknown>) => void;
  $destroy?: () => void;
}

type CurrentTimeListener = (t: number) => void;

interface ReplayContextValue {
  // High-frequency value — read via ref, not state. Use subscribeToCurrentTime
  // or useCurrentTime() to get updates without causing 60fps re-renders.
  currentTimeRef: React.MutableRefObject<number>;
  subscribeToCurrentTime: (fn: CurrentTimeListener) => () => void;
  // Low-frequency state (safe to consume directly)
  isPlaying: boolean;
  duration: number;
  startTime: number | null;
  isReady: boolean;
  // Playback controls
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (timeMs: number) => void;
  setSpeed: (speed: number) => void;
  // Lazy chunk loading
  addEvent: (event: { type: number; data: unknown; timestamp: number }) => void;
  refreshDuration: () => void;
  // Called by ReplayPlayer to register/unregister the rrweb instance
  onPlayerReady: (player: ReplayPlayerInstance, playerStartTime: number) => void;
  onPlayerDestroy: () => void;
  // State setters exposed so ReplayPlayer can wire rrweb event listeners
  setCurrentTime: (t: number) => void;
  setIsPlaying: (p: boolean) => void;
  setDuration: (d: number) => void;
}

const ReplayContext = createContext<ReplayContextValue | null>(null);

const SPEED_OPTIONS = [0.5, 1, 2, 4, 8] as const;

export function useReplayContext() {
  const ctx = useContext(ReplayContext);
  if (!ctx) {
    throw new Error('useReplayContext must be used within ReplayProvider');
  }
  return ctx;
}

/**
 * Subscribe to currentTime updates at a throttled rate.
 * intervalMs=0 means every tick (use for the progress bar DOM writes).
 * intervalMs=250 means 4 updates/second (use for text displays).
 */
export function useCurrentTime(intervalMs = 0): number {
  const { currentTimeRef, subscribeToCurrentTime } = useReplayContext();
  const [time, setTime] = useState(currentTimeRef.current);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    return subscribeToCurrentTime((t) => {
      if (intervalMs === 0) {
        setTime(t);
        return;
      }
      const now = performance.now();
      if (now - lastUpdateRef.current >= intervalMs) {
        lastUpdateRef.current = now;
        setTime(t);
      }
    });
  }, [subscribeToCurrentTime, intervalMs]);

  return time;
}

export function ReplayProvider({ children }: { children: ReactNode }) {
  const playerRef = useRef<ReplayPlayerInstance | null>(null);
  const isPlayingRef = useRef(false);
  const currentTimeRef = useRef(0);
  const listenersRef = useRef<Set<CurrentTimeListener>>(new Set());

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);

  const setIsPlayingWithRef = useCallback((playing: boolean) => {
    isPlayingRef.current = playing;
    setIsPlaying(playing);
  }, []);

  const subscribeToCurrentTime = useCallback((fn: CurrentTimeListener) => {
    listenersRef.current.add(fn);
    return () => {
      listenersRef.current.delete(fn);
    };
  }, []);

  // Called by ReplayPlayer on every ui-update-current-time tick.
  // Updates the ref and notifies subscribers — no React state update here.
  const setCurrentTime = useCallback((t: number) => {
    currentTimeRef.current = t;
    for (const fn of listenersRef.current) {
      fn(t);
    }
  }, []);

  const onPlayerReady = useCallback(
    (player: ReplayPlayerInstance, playerStartTime: number) => {
      playerRef.current = player;
      setStartTime(playerStartTime);
      currentTimeRef.current = 0;
      setIsPlayingWithRef(false);
      setIsReady(true);
    },
    [setIsPlayingWithRef],
  );

  const onPlayerDestroy = useCallback(() => {
    playerRef.current = null;
    setIsReady(false);
    currentTimeRef.current = 0;
    setDuration(0);
    setStartTime(null);
    setIsPlayingWithRef(false);
  }, [setIsPlayingWithRef]);

  const play = useCallback(() => {
    playerRef.current?.play();
  }, []);

  const pause = useCallback(() => {
    playerRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    playerRef.current?.toggle();
  }, []);

  const seek = useCallback((timeMs: number) => {
    playerRef.current?.goto(timeMs, isPlayingRef.current);
  }, []);

  const setSpeed = useCallback((s: number) => {
    if (!SPEED_OPTIONS.includes(s as (typeof SPEED_OPTIONS)[number])) return;
    playerRef.current?.setSpeed(s);
  }, []);

  const addEvent = useCallback(
    (event: { type: number; data: unknown; timestamp: number }) => {
      playerRef.current?.addEvent(event);
    },
    [],
  );

  const refreshDuration = useCallback(() => {
    const total = playerRef.current?.getMetaData().totalTime ?? 0;
    if (total > 0) setDuration(total);
  }, []);

  const value: ReplayContextValue = {
    currentTimeRef,
    subscribeToCurrentTime,
    isPlaying,
    duration,
    startTime,
    isReady,
    play,
    pause,
    toggle,
    seek,
    setSpeed,
    addEvent,
    refreshDuration,
    onPlayerReady,
    onPlayerDestroy,
    setCurrentTime,
    setIsPlaying: setIsPlayingWithRef,
    setDuration,
  };

  return (
    <ReplayContext.Provider value={value}>{children}</ReplayContext.Provider>
  );
}

export { SPEED_OPTIONS };
