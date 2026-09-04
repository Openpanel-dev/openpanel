// The Redis index the session buffer (packages/db/src/buffers/session-buffer.ts,
// moves at P8) maintains and the reaper/vacuum walk. Redefined here exactly as
// V1's reaper and vacuum redefine them — the buffer keeps its own copy and
// importing it would construct the ClickHouse client at import time.

const DEFAULT_SESSION_TIMEOUT_MS = 1000 * 60 * 30;

/** Idle time after which a session is over; also the reaper's deadman default. */
export const SESSION_TIMEOUT_MS = Number.parseInt(
  process.env.SESSION_TIMEOUT_MS || String(DEFAULT_SESSION_TIMEOUT_MS),
  10
);

/** Set of project ids with at least one live session. */
export const PROJECTS_SET_KEY = 'session:projects';

/** Per project: deviceId scored by wall-clock ms of the last received event. */
export const wallclockSetKey = (projectId: string) =>
  `session:wallclock:${projectId}`;
