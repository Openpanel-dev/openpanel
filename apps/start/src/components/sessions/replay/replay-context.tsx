import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  getClick,
  isUserInteraction,
  type ReplayRecordEvent,
} from './replay-utils';

export interface ReplayPlayerInstance {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  goto: (timeOffset: number, play?: boolean) => void;
  setSpeed: (speed: number) => void;
  toggleSkipInactive: () => void;
  triggerResize: () => void;
  getMetaData: () => { startTime: number; endTime: number; totalTime: number };
  addEvent: (event: ReplayRecordEvent) => void;
  addEventListener: (
    event: string,
    handler: (e: { payload: unknown }) => void
  ) => void;
  $set?: (props: Record<string, unknown>) => void;
  $destroy?: () => void;
}

type CurrentTimeListener = (t: number) => void;

export interface RecordingActivity {
  interactions: number[];
  clicks: { timestamp: number; x: number; y: number }[];
}

export const SPEED_OPTIONS = [0.5, 1, 2, 4, 8] as const;
export type ReplaySpeed = (typeof SPEED_OPTIONS)[number];
const DEFAULT_SPEED: ReplaySpeed = 1;
export const DEFAULT_SKIP_INACTIVE = true;

interface ReplayContextValue {
  // High-frequency value — read via ref, not state. Use subscribeToCurrentTime
  // or useCurrentTime() to get updates without causing 60fps re-renders.
  currentTimeRef: React.MutableRefObject<number>;
  subscribeToCurrentTime: (fn: CurrentTimeListener) => () => void;
  isPlaying: boolean;
  isSkipping: boolean;
  duration: number;
  startTime: number | null;
  isReady: boolean;
  speed: ReplaySpeed;
  skipInactive: boolean;
  activity: RecordingActivity;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (timeMs: number) => void;
  setSpeed: (speed: ReplaySpeed) => void;
  toggleSkipInactive: () => void;
  addEvent: (event: ReplayRecordEvent) => void;
  refreshDuration: () => void;
  onPlayerReady: (
    player: ReplayPlayerInstance,
    initialEvents: ReplayRecordEvent[]
  ) => void;
  onPlayerDestroy: () => void;
  setCurrentTime: (t: number) => void;
  setIsPlaying: (p: boolean) => void;
  setIsSkipping: (s: boolean) => void;
}

const ReplayContext = createContext<ReplayContextValue | null>(null);

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

const EMPTY_ACTIVITY: RecordingActivity = { interactions: [], clicks: [] };

export function ReplayProvider({ children }: { children: ReactNode }) {
  const playerRef = useRef<ReplayPlayerInstance | null>(null);
  const isPlayingRef = useRef(false);
  const currentTimeRef = useRef(0);
  const listenersRef = useRef<Set<CurrentTimeListener>>(new Set());
  // Chunks stream in after the player starts; collect what they tell us about
  // the user's activity here and publish it in one go per batch.
  const activityRef = useRef<RecordingActivity>({
    interactions: [],
    clicks: [],
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [speed, setSpeedState] = useState<ReplaySpeed>(DEFAULT_SPEED);
  const [skipInactive, setSkipInactive] = useState(DEFAULT_SKIP_INACTIVE);
  const [activity, setActivity] = useState<RecordingActivity>(EMPTY_ACTIVITY);

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

  const collectActivity = useCallback((event: ReplayRecordEvent) => {
    if (!isUserInteraction(event)) {
      return;
    }
    activityRef.current.interactions.push(event.timestamp);
    const click = getClick(event);
    if (click) {
      activityRef.current.clicks.push(click);
    }
  }, []);

  const publishActivity = useCallback(() => {
    setActivity({
      interactions: [...activityRef.current.interactions],
      clicks: [...activityRef.current.clicks],
    });
  }, []);

  // rrweb queues each added event in a microtask; reading the metadata in the
  // next one sees the whole batch instead of the length before it.
  const refreshDuration = useCallback(() => {
    queueMicrotask(() => {
      const total = playerRef.current?.getMetaData().totalTime ?? 0;
      if (total > 0) {
        setDuration(total);
      }
      publishActivity();
    });
  }, [publishActivity]);

  const onPlayerReady = useCallback(
    (player: ReplayPlayerInstance, initialEvents: ReplayRecordEvent[]) => {
      playerRef.current = player;
      activityRef.current = { interactions: [], clicks: [] };
      for (const event of initialEvents) {
        collectActivity(event);
      }
      setStartTime(player.getMetaData().startTime);
      currentTimeRef.current = 0;
      setIsPlayingWithRef(false);
      setSpeedState(DEFAULT_SPEED);
      setSkipInactive(DEFAULT_SKIP_INACTIVE);
      refreshDuration();
      setIsReady(true);
    },
    [collectActivity, refreshDuration, setIsPlayingWithRef]
  );

  const onPlayerDestroy = useCallback(() => {
    playerRef.current = null;
    setIsReady(false);
    currentTimeRef.current = 0;
    setDuration(0);
    setStartTime(null);
    setIsPlayingWithRef(false);
    setIsSkipping(false);
    setActivity(EMPTY_ACTIVITY);
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
    playerRef.current?.goto(Math.max(0, timeMs), isPlayingRef.current);
  }, []);

  const setSpeed = useCallback((next: ReplaySpeed) => {
    playerRef.current?.setSpeed(next);
    setSpeedState(next);
  }, []);

  const toggleSkipInactive = useCallback(() => {
    playerRef.current?.toggleSkipInactive();
    setSkipInactive((current) => !current);
  }, []);

  const addEvent = useCallback(
    (event: ReplayRecordEvent) => {
      playerRef.current?.addEvent(event);
      collectActivity(event);
    },
    [collectActivity]
  );

  const value: ReplayContextValue = {
    currentTimeRef,
    subscribeToCurrentTime,
    isPlaying,
    isSkipping,
    duration,
    startTime,
    isReady,
    speed,
    skipInactive,
    activity,
    play,
    pause,
    toggle,
    seek,
    setSpeed,
    toggleSkipInactive,
    addEvent,
    refreshDuration,
    onPlayerReady,
    onPlayerDestroy,
    setCurrentTime,
    setIsPlaying: setIsPlayingWithRef,
    setIsSkipping,
  };

  return (
    <ReplayContext.Provider value={value}>{children}</ReplayContext.Provider>
  );
}
