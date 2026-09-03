// Moved from packages/db/src/services/conversation.service.ts (M5-006).
// packages/db keeps a re-export shim (unlike cohort/import, M5-003/004):
// apps/api's live chat route and this package's own assistant.routes.ts stub
// both still reach these through `@openpanel/db`'s barrel.
//
// db access is LAZY, not a static top-level import — see insight.service.ts's
// header for the full reasoning (jobs.registry.ts and services.ts pull this
// module into the eager barrel chain nearly every core test file reaches, and
// constructing @openpanel/db's clients at import time would spawn a
// pino-pretty transport worker thread per test file).

import type {
  ChatMessage,
  Conversation,
  Prisma,
} from '@openpanel/db/src/prisma-client';

export type IServiceConversation = Conversation;
export type IServiceChatMessage = ChatMessage;
export type IServiceConversationWithMessages = Prisma.ConversationGetPayload<{
  include: { messages: true };
}>;

const DEFAULT_LIST_LIMIT = 50;

function loadDb() {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

export async function getConversationById(
  id: string,
  options: { withMessages?: boolean } = {}
): Promise<IServiceConversation | IServiceConversationWithMessages | null> {
  const db = await loadDb();
  if (options.withMessages) {
    return db.conversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
  }
  return db.conversation.findUnique({ where: { id } });
}

export async function listConversations(input: {
  projectId: string;
  userId: string;
  limit?: number;
}): Promise<IServiceConversation[]> {
  const db = await loadDb();
  return db.conversation.findMany({
    where: {
      projectId: input.projectId,
      userId: input.userId,
    },
    orderBy: { updatedAt: 'desc' },
    take: input.limit ?? DEFAULT_LIST_LIMIT,
  });
}

/**
 * Set the title on a conversation, creating the row if it doesn't
 * exist yet. Used by the chat titler: on the first turn we stream a
 * title in parallel with the agent run, and the titler may finish
 * before the agent's `ConversationStore.save()` has inserted the row.
 * This upsert makes that race harmless — the row ends up with the
 * right owner + title regardless of which side finishes first.
 */
export async function upsertConversationTitle(input: {
  id: string;
  title: string;
  projectId: string;
  organizationId: string;
  userId: string;
}): Promise<IServiceConversation> {
  const db = await loadDb();
  return db.conversation.upsert({
    where: { id: input.id },
    create: {
      id: input.id,
      title: input.title,
      projectId: input.projectId,
      organizationId: input.organizationId,
      userId: input.userId,
    },
    update: { title: input.title },
  });
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await loadDb();
  await db.conversation.delete({ where: { id } });
}
