// Every function takes `ServiceDeps` and reaches Postgres as `deps.db`; the
// `loadDb` lazy loader is gone.

import type {
  ChatMessage,
  Conversation,
  Prisma,
} from '@openpanel/db/src/prisma-client';
import type { ServiceDeps, Services } from '../../services';
import { CONVERSATION_LIST_LIMIT_DEFAULT } from './conversation.constants';

export type IServiceConversation = Conversation;
export type IServiceChatMessage = ChatMessage;
export type IServiceConversationWithMessages = Prisma.ConversationGetPayload<{
  include: { messages: true };
}>;

async function getConversationByIdImpl(
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

// Overloaded so a caller's static type matches what it actually asked for,
// instead of the three-way union every call used to get regardless of
// `options` (docs/review/conversation.md, "Not covered by any rule" #4).
export function getConversationById(
  deps: ServiceDeps,
  id: string,
  options: { withMessages: true }
): Promise<IServiceConversationWithMessages | null>;
export function getConversationById(
  deps: ServiceDeps,
  id: string,
  options?: { withMessages?: false }
): Promise<IServiceConversation | null>;
export function getConversationById(
  deps: ServiceDeps,
  id: string,
  options?: { withMessages?: boolean }
): Promise<IServiceConversation | IServiceConversationWithMessages | null> {
  return getConversationByIdImpl(deps, id, options);
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
    take: input.limit ?? CONVERSATION_LIST_LIMIT_DEFAULT,
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
  // Re-declared (not just re-exported) so the bound version a caller
  // actually reaches through `ctx.services.conversation` keeps the same
  // per-call narrowing as the standalone export above.
  function boundGetConversationById(
    id: string,
    options: { withMessages: true }
  ): Promise<IServiceConversationWithMessages | null>;
  function boundGetConversationById(
    id: string,
    options?: { withMessages?: false }
  ): Promise<IServiceConversation | null>;
  function boundGetConversationById(
    id: string,
    options?: { withMessages?: boolean }
  ): Promise<IServiceConversation | IServiceConversationWithMessages | null> {
    return getConversationByIdImpl(deps, id, options);
  }

  return {
    getConversationById: boundGetConversationById,
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
