import type { ChatMessage, Conversation, Prisma } from '../prisma-client';
import { db } from '../prisma-client';

export type IServiceConversation = Conversation;
export type IServiceChatMessage = ChatMessage;
export type IServiceConversationWithMessages = Prisma.ConversationGetPayload<{
  include: { messages: true };
}>;

export async function getConversationById(
  id: string,
  options: { withMessages?: boolean } = {},
): Promise<IServiceConversation | IServiceConversationWithMessages | null> {
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
  return db.conversation.findMany({
    where: {
      projectId: input.projectId,
      userId: input.userId,
    },
    orderBy: { updatedAt: 'desc' },
    take: input.limit ?? 50,
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
  await db.conversation.delete({ where: { id } });
}
