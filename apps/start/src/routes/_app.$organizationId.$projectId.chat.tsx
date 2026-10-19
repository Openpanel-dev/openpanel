import { zChatLaunchHint } from '@openpanel/core/modules/assistant/assistant.constants';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { z } from 'zod';
import { ChatNotConfigured } from '@/components/chat/chat-empty';
import { ChatView } from '@/components/chat/chat-view';
import type { AssistantUIMessage } from '@/components/chat/types';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle } from '@/utils/title';

const searchSchema = z.object({
  /** Conversation id. Absent means a new chat. */
  c: z.string().optional(),
  /** A question to send on arrival. */
  q: z.string().optional(),
  hint: zChatLaunchHint.optional(),
});

export const Route = createFileRoute('/_app/$organizationId/$projectId/chat')({
  component: Component,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: createProjectTitle('Chat') }] }),
});

function newConversationId(): string {
  return crypto.randomUUID();
}

function Component() {
  const { organizationId, projectId } = Route.useParams();
  const { c, q, hint } = Route.useSearch();
  const navigate = useNavigate();
  const trpc = useTRPC();

  const modelsQuery = useQuery(trpc.chat.models.queryOptions());
  // A fresh id per new chat; it becomes the URL once the first message is sent.
  const [draftId, setDraftId] = useState(newConversationId);
  const conversationId = c ?? draftId;

  // A chat started here lives in memory until its first turn is saved; only
  // conversations opened from the list or a link are loaded.
  const shouldLoad = !!c && c !== draftId;
  const conversationQuery = useQuery(
    trpc.conversation.get.queryOptions(
      { id: conversationId },
      { enabled: shouldLoad, retry: false }
    )
  );

  const initialMessages = useMemo<AssistantUIMessage[]>(() => {
    const rows = conversationQuery.data?.messages ?? [];
    return rows.map((row) => ({
      id: row.id,
      role: row.role as AssistantUIMessage['role'],
      parts: row.parts as AssistantUIMessage['parts'],
      metadata: (row.metadata ?? undefined) as AssistantUIMessage['metadata'],
    }));
  }, [conversationQuery.data]);

  const setSearch = useCallback(
    (next: { c?: string; q?: string }) =>
      navigate({
        to: '/$organizationId/$projectId/chat',
        params: { organizationId, projectId },
        search: { c: next.c, q: next.q, hint },
        replace: next.c === conversationId,
      }),
    [navigate, organizationId, projectId, hint, conversationId]
  );

  if (modelsQuery.isPending) {
    return <FullPageLoadingState />;
  }
  if (!modelsQuery.data || modelsQuery.data.models.length === 0) {
    return (
      <ChatFrame>
        <ChatNotConfigured />
      </ChatFrame>
    );
  }
  if (shouldLoad && conversationQuery.isPending) {
    return <FullPageLoadingState />;
  }

  return (
    <ChatFrame>
      <ChatView
        conversationId={conversationId}
        defaultModelId={modelsQuery.data.defaultModelId}
        hint={hint}
        initialMessages={initialMessages}
        initialQuestion={q}
        initialTitle={conversationQuery.data?.title ?? null}
        key={conversationId}
        models={modelsQuery.data.canChooseModel ? modelsQuery.data.models : []}
        onFirstMessage={() => setSearch({ c: conversationId })}
        onNewConversation={() => {
          setDraftId(newConversationId());
          setSearch({});
        }}
        onSelectConversation={(id) => setSearch({ c: id })}
      />
    </ChatFrame>
  );
}

/**
 * Pinned to the viewport instead of the page's `h-screen` column, so Chrome's
 * mobile toolbar cannot push the composer off screen.
 */
function ChatFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 top-16 bottom-0 flex lg:top-0 lg:left-72">
      {children}
    </div>
  );
}
