// M10-004: every function takes `ServiceDeps` and reaches Postgres as
// `deps.db`; the `loadDb()` lazy loader is gone.

import type {
  ChatMessage,
  Conversation,
  Prisma,
} from '@openpanel/db/src/prisma-client';
import type { ServiceDeps, Services } from '../../services';

export type IServiceConversation = Conversation;
export type IServiceChatMessage = ChatMessage;
export type IServiceConversationWithMessages = Prisma.ConversationGetPayload<{
  include: { messages: true };
}>;

// Shared with conversation.rpc.ts's zod default, so the two never drift.
export const DEFAULT_LIST_LIMIT = 50;

export async function getConversationById(
  deps: ServiceDeps,
  id: string,
  options: { withMessages?: boolean } = {}
): Promise<IServiceConversation | IServiceConversationWithMessages | null> {
  if (options.withMessages) {
    return deps.db.conversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
  }
  return deps.db.conversation.findUnique({ where: { id } });
}

export async function listConversations(
  deps: ServiceDeps,
  input: {
    projectId: string;
    userId: string;
    limit?: number;
  }
): Promise<IServiceConversation[]> {
  return deps.db.conversation.findMany({
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
export async function upsertConversationTitle(
  deps: ServiceDeps,
  input: {
    id: string;
    title: string;
    projectId: string;
    organizationId: string;
    userId: string;
  }
): Promise<IServiceConversation> {
  return deps.db.conversation.upsert({
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

export async function deleteConversation(
  deps: ServiceDeps,
  id: string
): Promise<void> {
  await deps.db.conversation.delete({ where: { id } });
}

export function createConversationService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return {
    getConversationById: (
      id: string,
      options?: { withMessages?: boolean }
    ): ReturnType<typeof getConversationById> =>
      getConversationById(deps, id, options),
    listConversations: (
      input: Parameters<typeof listConversations>[1]
    ): Promise<IServiceConversation[]> => listConversations(deps, input),
    upsertConversationTitle: (
      input: Parameters<typeof upsertConversationTitle>[1]
    ): Promise<IServiceConversation> => upsertConversationTitle(deps, input),
    deleteConversation: (id: string): Promise<void> =>
      deleteConversation(deps, id),
  };
}
