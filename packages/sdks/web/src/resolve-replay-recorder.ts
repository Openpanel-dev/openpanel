export type SessionReplayRecorderConfig = {
  maskAllInputs?: boolean;
  maskAllText?: boolean;
  unmaskTextSelector?: string;
  blockSelector?: string;
  blockClass?: string;
  ignoreSelector?: string;
  flushIntervalMs?: number;
  maxEventsPerChunk?: number;
  maxPayloadBytes?: number;
};

export type SessionReplayChunkPayload = {
  chunk_index: number;
  events_count: number;
  is_full_snapshot: boolean;
  started_at: string;
  ended_at: string;
  payload: string;
};

export type SessionReplayRecorder = (
  config: SessionReplayRecorderConfig,
  sendChunk: (payload: SessionReplayChunkPayload) => void,
) => void;

/**
 * Decides how session replay starts.
 *
 * Library / bundler consumers must pass `recorder` (typically
 * `startReplayRecorder` from `@openpanel/web/replay`) so rrweb is only
 * pulled into a bundle that actually imports that subpath.
 *
 * The IIFE (script-tag) build still loads `op1-replay.js` from the CDN.
 */
export async function resolveSessionReplayRecorder(options: {
  recorder?: SessionReplayRecorder;
  isIifeBuild: boolean;
  loadIifeRecorder: () => Promise<SessionReplayRecorder | null>;
}): Promise<SessionReplayRecorder | null> {
  if (options.recorder) {
    return options.recorder;
  }
  if (options.isIifeBuild) {
    return options.loadIifeRecorder();
  }
  return null;
}
