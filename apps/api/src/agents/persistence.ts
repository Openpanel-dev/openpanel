import type { ConversationStore } from '@better-agent/core';
import type { ConversationItem } from '@better-agent/core/providers';
import { db } from '@openpanel/db';
import { chatRunContext } from './run-context';

/**
 * Prisma-backed `ConversationStore` for Better Agent.
 *
 * One Better Agent `ConversationItem` (message, tool call, or tool
 * result) is stored as one `ChatMessage` row. The `parts` JSON column
 * holds the entire item; `role` is a discriminator for analytics.
 *
 * Save semantics: Better Agent hands us the FULL item list every save.
 * In steady state the list is append-only — earlier items don't change,
 * only new ones get added. We exploit that invariant with a cheap
 * row-count comparison, which is O(1) instead of deep-equaling every
 * prior item on every turn.
 *
 * If `items.length >= existingCount`, we insert only the tail. Any
 * other case (shrank, or user-initiated edit/retry) falls back to a
 * full wipe-and-rewrite. The trade-off: if Better Agent ever mutates
 * a prior item in place while keeping the total count the same, we'd
 * miss that change — but Better Agent's ConversationStore contract
 * documents that prior items are immutable, so this is safe.
 *
 * Cursor is the `updatedAt` timestamp. Better Agent uses it for
 * optimistic concurrency — we trust the single-writer-per-conversation
 * invariant and don't check it explicitly.
 */
function roleOf(item: ConversationItem): string {
  if (item.type === 'message') return item.role;
  return item.type;
}

function itemToRow(conversationId: string, item: ConversationItem) {
  return {
    conversationId,
    role: roleOf(item),
    // Prisma's `IPrismaUIMessageParts` narrows to `unknown[]`, but our
    // JSON column stores a single `ConversationItem` object. The
    // runtime is fine — Prisma accepts any JSON-serializable value —
    // so we cast past the generator.
    // biome-ignore lint/suspicious/noExplicitAny: see comment above
    parts: item as any,
  };
}

export const prismaConversationStore: ConversationStore = {
  async load({ conversationId }) {
    const conv = await db.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!conv) return null;

    return {
      items: conv.messages.map((m) => m.parts as unknown as ConversationItem),
      cursor: conv.updatedAt.getTime(),
    };
  },

  async save({ conversationId, items }) {
    const owner = chatRunContext.getStore();
    if (!owner) {
      throw new Error(
        'chatRunContext missing during save — the Fastify wrapper must run first',
      );
    }

    await db.$transaction(async (tx) => {
      await tx.conversation.upsert({
        where: { id: conversationId },
        create: {
          id: conversationId,
          projectId: owner.projectId,
          organizationId: owner.organizationId,
          userId: owner.userId,
        },
        update: { updatedAt: new Date() },
      });

      const existingCount = await tx.chatMessage.count({
        where: { conversationId },
      });

      if (items.length >= existingCount) {
        // Append-only fast path: Better Agent guarantees prior items
        // are immutable, so we can safely insert only the tail.
        const newItems = items.slice(existingCount);
        if (newItems.length > 0) {
          await tx.chatMessage.createMany({
            data: newItems.map((item) => itemToRow(conversationId, item)),
          });
        }
      } else {
        // Incoming list is shorter than what's stored — an edit,
        // retry, or deletion. Rewrite.
        await tx.chatMessage.deleteMany({ where: { conversationId } });
        if (items.length > 0) {
          await tx.chatMessage.createMany({
            data: items.map((item) => itemToRow(conversationId, item)),
          });
        }
      }
    });

    const updated = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { updatedAt: true },
    });
    return { cursor: updated?.updatedAt.getTime() ?? Date.now() };
  },
};
