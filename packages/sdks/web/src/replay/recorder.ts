import type { eventWithTime } from 'rrweb';
import { record } from 'rrweb';

export type ReplayRecorderConfig = {
  maskAllInputs?: boolean;
  maskTextSelector?: string;
  blockSelector?: string;
  blockClass?: string;
  ignoreSelector?: string;
  flushIntervalMs?: number;
  maxEventsPerChunk?: number;
  maxPayloadBytes?: number;
};

export type ReplayChunkPayload = {
  chunk_index: number;
  events_count: number;
  is_full_snapshot: boolean;
  started_at: string;
  ended_at: string;
  payload: string;
};

let stopRecording: (() => void) | null = null;

export function startReplayRecorder(
  config: ReplayRecorderConfig,
  sendChunk: (payload: ReplayChunkPayload) => void,
): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }

  // Stop any existing recorder before starting a new one to avoid leaks
  if (stopRecording) {
    stopRecording();
  }

  const maxEventsPerChunk = config.maxEventsPerChunk ?? 200;
  const flushIntervalMs = config.flushIntervalMs ?? 10_000;
  const maxPayloadBytes = config.maxPayloadBytes ?? 1_048_576; // 1MB

  let buffer: eventWithTime[] = [];
  let chunkIndex = 0;
  let flushTimer: ReturnType<typeof setInterval> | null = null;

  function flush(isFullSnapshot: boolean): void {
    if (buffer.length === 0) return;

    const payloadJson = JSON.stringify(buffer);
    const payloadBytes = new TextEncoder().encode(payloadJson).length;

    if (payloadBytes > maxPayloadBytes) {
      if (buffer.length > 1) {
        const mid = Math.floor(buffer.length / 2);
        const firstHalf = buffer.slice(0, mid);
        const secondHalf = buffer.slice(mid);
        const firstHasFullSnapshot =
          isFullSnapshot && firstHalf.some((e) => e.type === 2);
        buffer = firstHalf;
        flush(firstHasFullSnapshot);
        buffer = secondHalf;
        flush(false);
        return;
      }
      // Single event exceeds limit — drop it to avoid server rejection
      buffer = [];
      return;
    }

    const startedAt = buffer[0]!.timestamp;
    const endedAt = buffer[buffer.length - 1]!.timestamp;

    try {
      sendChunk({
        chunk_index: chunkIndex,
        events_count: buffer.length,
        is_full_snapshot: isFullSnapshot,
        started_at: new Date(startedAt).toISOString(),
        ended_at: new Date(endedAt).toISOString(),
        payload: payloadJson,
      });
      chunkIndex += 1;
      buffer = [];
    } catch (err) {
      console.error('[ReplayRecorder] sendChunk failed', err);
      throw err;
    }
  }

  function flushIfNeeded(isCheckout: boolean): void {
    const isFullSnapshot =
      isCheckout ||
      buffer.some((e) => e.type === 2); /* EventType.FullSnapshot */
    if (buffer.length >= maxEventsPerChunk) {
      flush(isFullSnapshot);
    } else if (isCheckout && buffer.length > 0) {
      flush(true);
    }
  }

  const stopFn = record({
    emit(event: eventWithTime, isCheckout?: boolean) {
      buffer.push(event);
      flushIfNeeded(!!isCheckout);
    },
    checkoutEveryNms: flushIntervalMs,
    maskAllInputs: config.maskAllInputs ?? true,
    maskTextSelector: config.maskTextSelector ?? '[data-openpanel-replay-mask]',
    blockSelector: config.blockSelector ?? '[data-openpanel-replay-block]',
    blockClass: config.blockClass,
    ignoreSelector: config.ignoreSelector,
  });

  flushTimer = setInterval(() => {
    if (buffer.length > 0) {
      const hasFullSnapshot = buffer.some((e) => e.type === 2);
      flush(hasFullSnapshot);
    }
  }, flushIntervalMs);

  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden' && buffer.length > 0) {
      const hasFullSnapshot = buffer.some((e) => e.type === 2);
      flush(hasFullSnapshot);
    }
  }

  function onPageHide(): void {
    if (buffer.length > 0) {
      const hasFullSnapshot = buffer.some((e) => e.type === 2);
      flush(hasFullSnapshot);
    }
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);

  stopRecording = () => {
    // Flush any buffered events before tearing down (same logic as flushTimer)
    if (buffer.length > 0) {
      const hasFullSnapshot = buffer.some((e) => e.type === 2);
      flush(hasFullSnapshot);
    }
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onPageHide);
    stopFn?.();
    stopRecording = null;
  };
}

export function stopReplayRecorder(): void {
  if (stopRecording) {
    stopRecording();
  }
}
