'use client';

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
  $destroy?: () => void;
}

interface ReplayContextValue {
  currentTime: number;
  isPlaying: boolean;
  speed: number;
  duration: number;
  startTime: number | null;
  isReady: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (timeOffset: number, play?: boolean) => void;
  setSpeed: (speed: number) => void;
  registerPlayer: (player: ReplayPlayerInstance) => void;
  unregisterPlayer: () => void;
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

export function ReplayProvider({ children }: { children: ReactNode }) {
  const playerRef = useRef<ReplayPlayerInstance | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const rafIdRef = useRef<number | null>(null);
  const lastUpdateRef = useRef(0);
  // Refs so stable callbacks can read latest values
  const isPlayingRef = useRef(false);
  const durationRef = useRef(0);
  const currentTimeRef = useRef(0);

  const registerPlayer = useCallback((player: ReplayPlayerInstance) => {
    playerRef.current = player;
    try {
      const meta = player.getMetaData();
      durationRef.current = meta.totalTime;
      setDuration(meta.totalTime);
      setStartTime(meta.startTime);
      setCurrentTime(0);
      currentTimeRef.current = 0;
      setIsReady(true);
    } catch {
      setIsReady(false);
    }
  }, []);

  const unregisterPlayer = useCallback(() => {
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    playerRef.current = null;
    setIsReady(false);
    setCurrentTime(0);
    currentTimeRef.current = 0;
    setDuration(0);
    durationRef.current = 0;
    setStartTime(null);
    setIsPlaying(false);
    isPlayingRef.current = false;
  }, []);

  const play = useCallback(() => {
    playerRef.current?.play();
    setIsPlaying(true);
    isPlayingRef.current = true;
  }, []);

  const pause = useCallback(() => {
    playerRef.current?.pause();
    setIsPlaying(false);
    isPlayingRef.current = false;
  }, []);

  const toggle = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    // If at the end, reset to start and play
    const atEnd = currentTimeRef.current >= durationRef.current - 100;
    if (atEnd && !isPlayingRef.current) {
      player.goto(0, true);
      setCurrentTime(0);
      currentTimeRef.current = 0;
      setIsPlaying(true);
      isPlayingRef.current = true;
      return;
    }

    player.toggle();
    const next = !isPlayingRef.current;
    setIsPlaying(next);
    isPlayingRef.current = next;
  }, []);

  const seek = useCallback((timeOffset: number, play?: boolean) => {
    const player = playerRef.current;
    if (!player) return;
    const shouldPlay = play ?? isPlayingRef.current;
    player.goto(timeOffset, shouldPlay);
    setCurrentTime(timeOffset);
    currentTimeRef.current = timeOffset;
    setIsPlaying(shouldPlay);
    isPlayingRef.current = shouldPlay;
  }, []);

  const setSpeed = useCallback((s: number) => {
    if (!SPEED_OPTIONS.includes(s as (typeof SPEED_OPTIONS)[number])) return;
    playerRef.current?.setSpeed(s);
    setSpeedState(s);
  }, []);

  useEffect(() => {
    if (!isReady || !playerRef.current) return;

    const tick = () => {
      const player = playerRef.current;
      if (!player) return;
      try {
        const replayer = player.getReplayer();
        const now = replayer.getCurrentTime();
        // Throttle state updates to ~10fps (every 100ms) to avoid excessive re-renders
        const t = Math.floor(now / 100);
        if (t !== lastUpdateRef.current) {
          lastUpdateRef.current = t;
          setCurrentTime(now);
          currentTimeRef.current = now;
        }

        // Detect end of replay
        if (
          now >= durationRef.current - 50 &&
          durationRef.current > 0 &&
          isPlayingRef.current
        ) {
          setIsPlaying(false);
          isPlayingRef.current = false;
        }
      } catch {
        // Player may be destroyed
      }
      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isReady]);

  const value: ReplayContextValue = {
    currentTime,
    isPlaying,
    speed,
    duration,
    startTime,
    isReady,
    play,
    pause,
    toggle,
    seek,
    setSpeed,
    registerPlayer,
    unregisterPlayer,
  };

  return (
    <ReplayContext.Provider value={value}>{children}</ReplayContext.Provider>
  );
}

export { SPEED_OPTIONS };
