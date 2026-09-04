// The seven buffers live in @openpanel/core now (M8-001):
// packages/core/src/buffers/*. They are no longer module singletons there —
// `createBuffers(deps)` builds them once and V2's main.ts hangs the result on
// `AppDeps.buffers` (ADR-007). This file is the V1 delegate: one call to that
// factory, its instances re-exported under the names apps/api, apps/worker,
// packages/trpc and core's own lazy `import('@openpanel/db/src/buffers')`
// call sites already use. Both boots therefore share ONE set of buffers and
// one set of Redis lists.
import { createBuffers } from '@openpanel/core';
import { cronQueue } from '@openpanel/queue';
import { createLogger } from '../logger';

const buffers = createBuffers({
  // packages/db's own pino, exactly as each buffer built it before the move —
  // same `LOG_PREFIX-<name>-<NODE_ENV>` service name on every line.
  createLogger: (name) => createLogger({ name }),
  // ADR-005's BullMQ escape hatch: pausing `cron` from bull-board halts all
  // buffer flushing, preserved deliberately (docs/ANSWERS.md §3: "known!").
  isCronPaused: () => cronQueue.isPaused(),
});

export const eventBuffer = buffers.event;
export const profileBuffer = buffers.profile;
export const botBuffer = buffers.bot;
export const sessionBuffer = buffers.session;
export const profileBackfillBuffer = buffers.profileBackfill;
export const replayBuffer = buffers.replay;
export const groupBuffer = buffers.group;

export type {
  IClickhouseSessionReplayChunk,
  ProfileBackfillEntry,
  SessionIngestResult,
} from '@openpanel/core';
export { SESSION_TIMEOUT_MS } from '@openpanel/core';
