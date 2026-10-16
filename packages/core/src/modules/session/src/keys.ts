// The Redis index the session buffer (buffers/session-buffer.ts) maintains and the
// reaper/vacuum walk. Redefined here because importing the buffer would construct
// the ClickHouse client at import time.

/** Idle time after which a session is over; also the reaper's deadman default.
 *  SESSION_TIMEOUT_MS overrides it (`config.session.timeoutMs`). */
export const DEFAULT_SESSION_TIMEOUT_MS = 1000 * 60 * 30;

/** Set of project ids with at least one live session. */
export const PROJECTS_SET_KEY = 'session:projects';

/** Per project: deviceId scored by wall-clock ms of the last received event. */
export const wallclockSetKey = (projectId: string) =>
  `session:wallclock:${projectId}`;
