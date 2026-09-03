// Moved to @openpanel/core's conversation module (M5-006). Re-exported here
// for existing `@openpanel/db` importers (apps/api's live chat route,
// core's own assistant.routes.ts stub) — same shape as
// packages/db/src/services/gsc.service.ts since M5-002.
export type {
  IServiceChatMessage,
  IServiceConversation,
  IServiceConversationWithMessages,
} from '@openpanel/core';
export {
  deleteConversation,
  getConversationById,
  listConversations,
  upsertConversationTitle,
} from '@openpanel/core';
