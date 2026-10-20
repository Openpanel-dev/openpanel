import type { ReplayChunkPayload, ReplayRecorderConfig } from './replay';

export type SessionReplayChunkPayload = ReplayChunkPayload;
export type SessionReplayRecorderConfig = ReplayRecorderConfig;
export type SessionReplayRecorder = (
  config: SessionReplayRecorderConfig,
  sendChunk: (payload: SessionReplayChunkPayload) => void
) => void;

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
