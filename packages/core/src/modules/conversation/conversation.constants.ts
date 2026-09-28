// Shared with the frontend (chat-drawer-header.tsx, title-stream.tsx) so the
// page size / title length and the zod defaults never drift apart ("Not covered
// by any rule" #3 in docs/review/conversation.md).
//
// Isomorphic by the AGENTS.md rule: zod and nothing else.

export const CONVERSATION_LIST_LIMIT_DEFAULT = 50;
export const CONVERSATION_TITLE_MIN_LENGTH = 1;
export const CONVERSATION_TITLE_MAX_LENGTH = 80;
