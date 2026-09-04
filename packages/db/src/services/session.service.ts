// The session service lives in @openpanel/core now (M7-001):
// packages/core/src/modules/session/session.service.ts, with every ClickHouse
// query rewritten onto the `sql` tag (packages/core/src/modules/session/src/
// session.sql.ts). Re-exported here for existing `@openpanel/db` importers
// (packages/trpc's event router, the assistant/mcp tools, session-buffer's
// IClickhouseSession type) — same shape as share.service.ts since M6-004.
export {
  type GetSessionListOptions,
  getSessionById,
  getSessionDistinctValues,
  getSessionList,
  getSessionReplayChunksFrom,
  getSessionsCount,
  getSessionsCountCached,
  type IClickhouseSession,
  type IServiceSession,
  type ISessionReplayChunkMeta,
  type QuerySessionsInput,
  querySessionsCore,
  SESSION_DISTINCT_FIELDS,
  type SessionDistinctField,
  transformSession,
} from '@openpanel/core';

import { getSessionById } from '@openpanel/core';

// V1's `sessionService.byId(sessionId, projectId)` shape, kept for the
// callers that still reach it through `@openpanel/db`. Resolved at call time:
// core ↔ db is an import cycle and this module may evaluate first.
export const sessionService = {
  byId: (sessionId: string, projectId: string) =>
    getSessionById(sessionId, projectId),
};
