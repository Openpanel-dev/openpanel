import type { ServiceDeps } from '../../../services';
import type { AssistantUIMessage } from './message';

const NULL_CHARACTER = '\u0000';

/** Postgres json cannot hold NUL, and tool outputs echo raw event data. */
export function stripNullCharacters<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replaceAll(NULL_CHARACTER, '') as T;
  }
  if (Array.isArray(value)) {
    return value.map(stripNullCharacters) as T;
  }
  if (value !== null && typeof value === 'object') {
    // fromEntries defines own properties, so a "__proto__" key survives.
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        stripNullCharacters(key),
        stripNullCharacters(entry),
      ])
    ) as T;
  }
  return value;
}

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
    // Message ids come from the client; one must not overwrite a row in another conversation.
    const foreign = await tx.chatMessage.findFirst({
      where: {
        id: { in: input.messages.map((message) => message.id) },
        conversationId: { not: input.conversationId },
      },
      select: { id: true },
    });
    if (foreign) {
      throw new Error(`Message ${foreign.id} belongs to another conversation`);
    }
    const title = stripNullCharacters(input.title ?? undefined);
    await tx.conversation.upsert({
      where: { id: input.conversationId },
      create: {
        id: input.conversationId,
        projectId: input.projectId,
        organizationId: input.organizationId,
        userId: input.userId,
        title,
      },
      update: {
        updatedAt: new Date(),
        ...(title ? { title } : {}),
      },
    });
    // Rows saved together must load in this order; the default timestamp can tie.
    const baseTime = Date.now();
    for (const [index, message] of input.messages.entries()) {
      const parts = stripNullCharacters(message.parts as unknown[]);
      const metadata = stripNullCharacters(
        (message.metadata ?? {}) as Record<string, unknown>
      );
      await tx.chatMessage.upsert({
        where: { id: message.id },
        create: {
          id: message.id,
          conversationId: input.conversationId,
          role: message.role,
          parts,
          metadata,
          createdAt: new Date(baseTime + index),
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
