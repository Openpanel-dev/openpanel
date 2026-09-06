// Moved from packages/db/src/buffers/index.ts (M9-CLEANUP-001, packages/db's
// final-surface shrink). The seven buffers live in @openpanel/core
// (M8-001): `createBuffers(deps)` builds them once and V2's main.ts hangs the
// result on `AppDeps.buffers` (ADR-007). This file is the ONE process-wide
// singleton instance every call site that predates that ctx wiring still
// reaches. Since M11-003 that is packages/trpc's overview/widget routers
// alone — core's last lazy importer (widget.rpc.ts, via `loadDbBuffers`)
// now reads `ctx.buffers`. Repointing the two remaining trpc call sites is
// the larger, separately-scoped follow-up docs/TECH_DEBT.md tracks (the 93
// lazy db imports bypassing ctx/requestId) — not this task, whose scope
// stops at packages/queue.
//
// Lives in @openpanel/queue rather than @openpanel/core because it needs
// `cronQueue` (ADR-005's BullMQ escape hatch: pausing `cron` from bull-board
// halts all buffer flushing, preserved deliberately — docs/ANSWERS.md §3:
// "known!"), and core must not import `@openpanel/queue` back without a real
// package cycle (see queues.ts, which imports core for its logger).
// `@openpanel/queue` already depends on `@openpanel/core`, so this is the one
// side of that boundary free of a cycle. Also keeps core's own rule intact:
// buffers are boot singletons on AppDeps, never a module-level singleton in
// core itself (M8-005).
import { createBuffers, createLogger } from '@openpanel/core';
import { cronQueue } from './queues';

const buffers = createBuffers({
  createLogger: (name) => createLogger({ name }),
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
