import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  type ChunkData,
  ReplayChunkBuffer,
} from './replay-chunk-buffer';

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

export type PrefetchChunksFn = (
  fromIndex: number,
  toIndex: number,
) => Promise<ChunkData[]>;

/**
 * Smart-seek fetcher: given a target wall-clock ms, returns the slice of
 * chunks starting from the latest full snapshot at-or-before the target
 * through target + lookahead. Replaces the sequential walk when seeking far
 * into long sessions.
 */
export type SeekFetchFn = (targetMs: number) => Promise<ChunkData[]>;

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
  // Buffered-region tracking — for the YouTube-style buffered progress bar
  // and the buffer-aware seek path.
  loadedUpToMs: number;
  isBuffering: boolean;
  // Playback controls
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (timeMs: number) => void;
  setSpeed: (speed: number) => void;
  // Lazy chunk loading
  addEvent: (event: { type: number; data: unknown; timestamp: number }) => void;
  refreshDuration: () => void;
  /**
   * Called by chunk loaders for each chunk. `addToPlayer: false` is used for
   * the FIRST batch, whose events were already passed to the rrweb player at
   * construction time — we only need to register the range / chunkIndex so the
   * buffer reflects reality. Defaults to true for sequential + prefetch loads.
   */
  markChunkLoaded: (chunk: ChunkData, opts?: { addToPlayer?: boolean }) => void;
  /**
   * Registered by the consumer (ReplayContent) once it has a tRPC client +
   * sessionId. Allows seek() to prefetch chunks on demand.
   */
  setPrefetchChunks: (fn: PrefetchChunksFn | null) => void;
  /** Registers the smart-seek fetcher (anchored at nearest full snapshot). */
  setSeekFetch: (fn: SeekFetchFn | null) => void;
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

/** Chunks fetched per round trip during seek-targeted prefetch.
 * Larger = fewer network round trips for seeking far into long sessions. */
const PREFETCH_BATCH_SIZE = 250;
/** Bound the prefetch loop so a bug can't infinitely fetch.
 * 250 * 200 = 50,000 chunks — covers any realistic session. */
const MAX_PREFETCH_BATCHES = 200;

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

export function ReplayProvider({
  children,
  totalDurationMs,
}: {
  children: ReactNode;
  /**
   * Definitive replay duration from `session.replayMeta`. When provided, this
   * overrides rrweb's progressive `getMetaData().totalTime` so the timeline
   * shows the final number from the start instead of growing as chunks load.
   */
  totalDurationMs?: number;
}) {
  const playerRef = useRef<ReplayPlayerInstance | null>(null);
  const isPlayingRef = useRef(false);
  const currentTimeRef = useRef(0);
  const listenersRef = useRef<Set<CurrentTimeListener>>(new Set());

  // Buffer state — ref (mutated by markChunkLoaded + drained ranges) feeds
  // the React state mirrors below so subscribers re-render at the right times.
  const bufferRef = useRef(new ReplayChunkBuffer());
  const startTimeRef = useRef<number | null>(null);
  const prefetchRef = useRef<PrefetchChunksFn | null>(null);
  const seekFetchRef = useRef<SeekFetchFn | null>(null);
  // Mirror totalDurationMs in a ref so callbacks (passed to the player's
  // useEffect deps) don't get a new identity when it changes — preventing the
  // player from being destroyed + recreated every time the prop lands.
  const totalDurationMsRef = useRef<number | undefined>(totalDurationMs);

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [loadedUpToMs, setLoadedUpToMs] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);

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
      startTimeRef.current = playerStartTime;
      setStartTime(playerStartTime);
      currentTimeRef.current = 0;
      setIsPlayingWithRef(false);
      setIsReady(true);
    },
    [setIsPlayingWithRef],
  );

  const onPlayerDestroy = useCallback(() => {
    playerRef.current = null;
    startTimeRef.current = null;
    bufferRef.current.reset();
    setIsReady(false);
    currentTimeRef.current = 0;
    // Preserve the server-supplied duration on re-mount (read via ref so this
    // callback's identity stays stable — putting totalDurationMs in deps would
    // cause the player to destroy + recreate every time it lands).
    const td = totalDurationMsRef.current;
    if (!(td && td > 0)) {
      setDuration(0);
    }
    setStartTime(null);
    setIsPlayingWithRef(false);
    setLoadedUpToMs(0);
    setIsBuffering(false);
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

  const addEvent = useCallback(
    (event: { type: number; data: unknown; timestamp: number }) => {
      playerRef.current?.addEvent(event);
    },
    [],
  );

  const refreshDuration = useCallback(() => {
    // When a definitive totalDurationMs is supplied (from session.replayMeta),
    // it owns the duration value — don't let rrweb's progressive totalTime
    // overwrite it as more chunks arrive (that's what made the timeline jump
    // from "2 min" to "35 min" to "80 min"). Read via ref to keep the callback
    // identity stable.
    const td = totalDurationMsRef.current;
    if (td && td > 0) return;
    const total = playerRef.current?.getMetaData().totalTime ?? 0;
    if (total > 0) setDuration(total);
  }, []);

  // Sync the prop into state + the ref once it lands (and on subsequent changes).
  useEffect(() => {
    totalDurationMsRef.current = totalDurationMs;
    if (totalDurationMs && totalDurationMs > 0) {
      setDuration(totalDurationMs);
    }
  }, [totalDurationMs]);

  const updateLoadedUpToMs = useCallback(() => {
    const wallMs = bufferRef.current.maxLoadedMs();
    const baseline = startTimeRef.current;
    if (wallMs == null || baseline == null) return;
    const relativeMs = Math.max(0, wallMs - baseline);
    setLoadedUpToMs((prev) => (relativeMs > prev ? relativeMs : prev));
  }, []);

  const markChunkLoaded = useCallback(
    (chunk: ChunkData, opts?: { addToPlayer?: boolean }) => {
      const addToPlayer = opts?.addToPlayer ?? true;
      const drained = bufferRef.current.enqueueAndDrain(chunk);
      if (addToPlayer) {
        for (const c of drained) {
          for (const ev of c.events) {
            playerRef.current?.addEvent(ev);
          }
        }
      }
      if (drained.length > 0) {
        const td = totalDurationMsRef.current;
        if (!(td && td > 0)) {
          const total = playerRef.current?.getMetaData().totalTime ?? 0;
          if (total > 0) setDuration(total);
        }
      }
      updateLoadedUpToMs();
    },
    [updateLoadedUpToMs],
  );

  const setPrefetchChunks = useCallback((fn: PrefetchChunksFn | null) => {
    prefetchRef.current = fn;
  }, []);

  const setSeekFetch = useCallback((fn: SeekFetchFn | null) => {
    seekFetchRef.current = fn;
  }, []);

  /**
   * Sequentially prefetch chunks starting from loadedUpToChunkIndex + 1 in
   * batches of PREFETCH_BATCH_SIZE until the target wall-clock ms is buffered
   * (or we run out of chunks to fetch). Bounded by MAX_PREFETCH_BATCHES so a
   * runaway loop can't lock the player.
   */
  const prefetchUntilLoaded = useCallback(
    async (targetWallMs: number) => {
      const fetch = prefetchRef.current;
      if (!fetch) return;
      let batches = 0;
      while (
        !bufferRef.current.isLoaded(targetWallMs) &&
        batches < MAX_PREFETCH_BATCHES
      ) {
        const fromIndex = bufferRef.current.loadedUpToChunkIndex + 1;
        const toIndex = fromIndex + PREFETCH_BATCH_SIZE - 1;
        const chunks = await fetch(fromIndex, toIndex);
        if (chunks.length === 0) {
          // Nothing more to fetch — give up.
          return;
        }
        for (const c of chunks) {
          const drained = bufferRef.current.enqueueAndDrain(c);
          for (const dc of drained) {
            for (const ev of dc.events) {
              playerRef.current?.addEvent(ev);
            }
          }
        }
        const td = totalDurationMsRef.current;
        if (!(td && td > 0)) {
          const total = playerRef.current?.getMetaData().totalTime ?? 0;
          if (total > 0) setDuration(total);
        }
        updateLoadedUpToMs();
        batches += 1;
      }
    },
    [updateLoadedUpToMs],
  );

  /**
   * Smart seek: jumps to the latest full DOM snapshot before the target time
   * via a single server query, then loads ~30 sec of chunks from there. One
   * round trip, regardless of how far into the session the user is seeking.
   * Falls back to sequential prefetch if the smart fetcher isn't registered.
   */
  const seekFastFetch = useCallback(
    async (targetWallMs: number) => {
      const fetch = seekFetchRef.current;
      if (!fetch) return false;
      const chunks = await fetch(targetWallMs);
      if (chunks.length === 0) return false;
      // Force the buffer's in-order pointer past anything we're about to skip,
      // so subsequent enqueueAndDrain calls accept these chunks (they'd
      // otherwise be ignored as "older than what's loaded").
      const minChunkIndex = chunks.reduce(
        (min, c) => (c.chunkIndex < min ? c.chunkIndex : min),
        chunks[0]!.chunkIndex,
      );
      if (bufferRef.current.loadedUpToChunkIndex < minChunkIndex - 1) {
        bufferRef.current.loadedUpToChunkIndex = minChunkIndex - 1;
      }
      for (const c of chunks) {
        const drained = bufferRef.current.enqueueAndDrain(c);
        for (const dc of drained) {
          for (const ev of dc.events) {
            playerRef.current?.addEvent(ev);
          }
        }
      }
      const td = totalDurationMsRef.current;
      if (!(td && td > 0)) {
        const total = playerRef.current?.getMetaData().totalTime ?? 0;
        if (total > 0) setDuration(total);
      }
      updateLoadedUpToMs();
      return true;
    },
    [updateLoadedUpToMs],
  );

  const seek = useCallback(
    async (timeMs: number) => {
      const baseline = startTimeRef.current;
      if (baseline == null) return;
      const targetWallMs = baseline + timeMs;

      // Fast path: target already buffered.
      if (bufferRef.current.isLoaded(targetWallMs)) {
        playerRef.current?.goto(timeMs, isPlayingRef.current);
        return;
      }

      // Slow path: pause, jump to nearest full snapshot via smart fetch, then
      // goto. Fall back to sequential prefetch if smart fetch isn't wired.
      const wasPlaying = isPlayingRef.current;
      setIsBuffering(true);
      playerRef.current?.pause();
      try {
        const fastOk = await seekFastFetch(targetWallMs);
        if (!fastOk) {
          await prefetchUntilLoaded(targetWallMs);
        }
      } finally {
        playerRef.current?.goto(timeMs, false);
        setIsBuffering(false);
        if (wasPlaying) playerRef.current?.play();
      }
    },
    [seekFastFetch, prefetchUntilLoaded],
  );

  const setSpeed = useCallback((s: number) => {
    if (!SPEED_OPTIONS.includes(s as (typeof SPEED_OPTIONS)[number])) return;
    playerRef.current?.setSpeed(s);
  }, []);

  const value: ReplayContextValue = {
    currentTimeRef,
    subscribeToCurrentTime,
    isPlaying,
    duration,
    startTime,
    isReady,
    loadedUpToMs,
    isBuffering,
    play,
    pause,
    toggle,
    seek,
    setSpeed,
    addEvent,
    refreshDuration,
    markChunkLoaded,
    setPrefetchChunks,
    setSeekFetch,
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
