import type { ServiceDeps } from '../../../services';
import type { AssistantUIMessage } from './message';

/** Rows are one UI message each; `parts` is the message's parts array. */
export async function loadMessages(
  deps: ServiceDeps,
  conversationId: string
): Promise<AssistantUIMessage[]> {
  const rows = await deps.db.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    role: row.role as AssistantUIMessage['role'],
    parts: row.parts as AssistantUIMessage['parts'],
    metadata: (row.metadata ?? undefined) as AssistantUIMessage['metadata'],
  }));
}

export async function saveMessages(
  deps: ServiceDeps,
  input: {
    conversationId: string;
    projectId: string;
    organizationId: string;
    userId: string;
    messages: AssistantUIMessage[];
    title?: string | null;
  }
): Promise<void> {
  await deps.db.$transaction(async (tx) => {
    await tx.conversation.upsert({
      where: { id: input.conversationId },
      create: {
        id: input.conversationId,
        projectId: input.projectId,
        organizationId: input.organizationId,
        userId: input.userId,
        title: input.title ?? undefined,
      },
      update: {
        updatedAt: new Date(),
        ...(input.title ? { title: input.title } : {}),
      },
    });
    for (const message of input.messages) {
      const parts = message.parts as unknown[];
      const metadata = (message.metadata ?? {}) as Record<string, unknown>;
      await tx.chatMessage.upsert({
        where: { id: message.id },
        create: {
          id: message.id,
          conversationId: input.conversationId,
          role: message.role,
          parts,
          metadata,
        },
        update: { parts, metadata },
      });
    }
  });
}

/** Regeneration: drop the message and everything after it. */
export async function deleteMessagesFrom(
  deps: ServiceDeps,
  conversationId: string,
  messageId: string
): Promise<void> {
  const target = await deps.db.chatMessage.findFirst({
    where: { id: messageId, conversationId },
    select: { createdAt: true },
  });
  if (!target) {
    return;
  }
  await deps.db.chatMessage.deleteMany({
    where: { conversationId, createdAt: { gte: target.createdAt } },
  });
}
