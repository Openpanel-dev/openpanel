import type { ConversationStore } from '@better-agent/core';
import type { ConversationItem } from '@better-agent/core/providers';
import type { ServiceDeps } from '../../../services';
import { chatRunContext } from './run-context';

// Built from the route's deps and closing over them: `ConversationStore`'s
// load/save signatures leave no room for a `Ctx`.

/**
 * Prisma-backed `ConversationStore`: one `ConversationItem` per `ChatMessage`
 * row, the whole item in `parts`.
 *
 * Better Agent hands over the full item list on every save and prior items are
 * immutable, so when the list is not shorter than the stored count only the
 * tail is inserted; otherwise (edit, retry) the rows are rewritten. The cursor
 * is `updatedAt`; a single writer per conversation is assumed, not checked.
 */
function roleOf(item: ConversationItem): string {
  if (item.type === 'message') {
    return item.role;
  }
  return item.type;
}

function itemToRow(conversationId: string, item: ConversationItem) {
  return {
    conversationId,
    role: roleOf(item),
    // Prisma types the column as `unknown[]` but it stores one `ConversationItem`.
    // biome-ignore lint/suspicious/noExplicitAny: see comment above
    parts: item as any,
  };
}

export function createConversationStore(deps: ServiceDeps): ConversationStore {
  const db = deps.db;
  return {
    async load({ conversationId }) {
      const conv = await db.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
        },
      });
      if (!conv) {
        return null;
      }

      return {
        items: conv.messages.map((m) => m.parts as unknown as ConversationItem),
        cursor: conv.updatedAt.getTime(),
      };
    },

    async save({ conversationId, items }) {
      const owner = chatRunContext.getStore();
      if (!owner) {
        throw new Error(
          'chatRunContext missing during save — assistant.routes.ts must run the handler inside chatRunContext.run()'
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
          const newItems = items.slice(existingCount);
          if (newItems.length > 0) {
            await tx.chatMessage.createMany({
              data: newItems.map((item) => itemToRow(conversationId, item)),
            });
          }
        } else {
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
}
