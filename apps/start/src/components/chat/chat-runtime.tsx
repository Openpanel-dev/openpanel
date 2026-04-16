import { getChatClient } from '@/agents/client';
import { usePageContextValue } from '@/contexts/page-context';
import { useAppContext } from '@/hooks/use-app-context';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { useAgent } from '@better-agent/client/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useChatState } from './chat-context';
import { chatToolHandlers } from './tool-handlers';
import { streamTitle } from './title-stream';

/**
 * Drawer-scoped runtime that owns the `useAgent()` instance and exposes
 * `messages`, `status`, `sendMessage`, `stop` to body + footer via a
 * tiny context. Mounts inside the drawer, between the header and the
 * body/footer pair.
 *
 * Why this is here and not in a global provider:
 *   - The `useAgent()` call itself is a hook — it can't move without
 *     mounting. Putting it on the drawer means the chat client is
 *     only active when the drawer is open.
 *   - Page context is read here so every send carries the user's
 *     current view (project, page, filters). Re-evaluates on each
 *     send via the closure — no refs needed.
 *   - When `agentName` or `conversationId` changes, the controller
 *     rebuilds. Better Agent handles hydration via `hydrateFromServer`.
 */

type ChatRuntimeValue = ReturnType<typeof useAgent> & {
  /** Send a plain-text message with the current page context attached. */
  send: (text: string) => void;
};

const ChatRuntimeContext = createContext<ChatRuntimeValue | null>(null);

export function ChatRuntimeProvider({ children }: { children: ReactNode }) {
  const { apiUrl } = useAppContext();
  const { projectId, organizationId } = useAppParams();
  const {
    agentName,
    conversationId,
    setStreamingTitle,
    pendingMessage,
    setPendingMessage,
  } = useChatState();
  const pageContext = usePageContextValue();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const client = useMemo(() => getChatClient(apiUrl), [apiUrl]);

  const renameConversation = useMutation(
    trpc.conversation.rename.mutationOptions(),
  );

  // Title streams run fire-and-forget. If the user switches or closes
  // the conversation before the stream finishes, we abort so:
  //   - the stream stops pulling from the network
  //   - stale `setStreamingTitle(partial)` calls don't flash the old
  //     title into the header of the new conversation (global state)
  // The ref is cleared on unmount; the provider remounts on
  // conversation switch (via `key={conversationId}`) which triggers
  // the cleanup.
  const titleAbortRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      titleAbortRef.current?.abort();
      titleAbortRef.current = null;
    },
    [],
  );

  const agent = useAgent(client, {
    agent: agentName,
    conversationId,
    hydrateFromServer: true,
    optimisticUserMessage: true,
    // Better Agent forwards tool calls for any tool declared via
    // `.client()` on the server (see `apps/api/src/agents/tools/ui.ts`)
    // to the matching entry here. Typed via `ToolHandlers<ChatApp>`
    // on the map itself, so this line stays cast-free.
    toolHandlers: chatToolHandlers,
    onFinish: () => {
      // Refresh the conversation list so the new row appears in the
      // header dropdown.
      queryClient.invalidateQueries(trpc.conversation.list.pathFilter());
    },
  });

  const value = useMemo<ChatRuntimeValue>(
    () => ({
      ...agent,
      send: (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        if (agent.status === 'submitted' || agent.status === 'streaming') {
          return;
        }
        const isFirstTurn = agent.messages.length === 0;

        void agent.sendMessage({
          input: text,
          // The `agentName` is a runtime-resolved string so TypeScript
          // can't narrow `useAgent`'s context type — we know the shape
          // from `chatContextSchema` on the server.
          // biome-ignore lint/suspicious/noExplicitAny: see comment above
          context: {
            projectId,
            organizationId,
            pageContext: pageContext ?? undefined,
          } as any,
        });

        // On the first turn, kick off a parallel title stream. Deltas
        // flow into `streamingTitle` so the header renders the title
        // word-by-word. When the stream finishes we persist via TRPC
        // so the title survives a reload, but we leave `streamingTitle`
        // set — it's the in-memory source of truth for this session.
        // It gets cleared on `newConversation()` / `switchConversation()`.
        if (isFirstTurn) {
          // Cancel any previously in-flight title (shouldn't exist on
          // a first turn, but defensive) and start a fresh controller
          // bound to this runtime's lifecycle.
          titleAbortRef.current?.abort();
          const controller = new AbortController();
          titleAbortRef.current = controller;
          const idAtSend = conversationId;
          setStreamingTitle('');
          void (async () => {
            const finalTitle = await streamTitle(
              client,
              trimmed,
              (partial) => {
                if (controller.signal.aborted) return;
                setStreamingTitle(partial);
              },
              controller.signal,
            );
            if (controller.signal.aborted || !finalTitle) return;
            try {
              await renameConversation.mutateAsync({
                id: idAtSend,
                title: finalTitle,
                projectId,
              });
              queryClient.invalidateQueries(
                trpc.conversation.list.pathFilter(),
              );
            } catch (err) {
              console.error('[chat] conversation rename failed', err);
            }
          })();
        }
      },
    }),
    [
      agent,
      client,
      conversationId,
      projectId,
      organizationId,
      pageContext,
      renameConversation,
      setStreamingTitle,
    ],
  );

  // Drain the pending message left by the sidebar composer.
  //
  // Timing is tricky because of `hydrateFromServer: true`:
  //   useAgent's initial snapshot reports status="ready", then its
  //   init() effect flips it to "hydrating", and finally back to
  //   "ready" once hydration completes. If we send on the very first
  //   "ready", init() aborts the run moments later.
  //
  // We model this as an explicit state machine:
  //   'init'      — mount frame before init() has run
  //   'hydrating' — saw a non-ready status at least once
  //   'settled'   — hydration finished, safe to send
  //
  // For brand-new conversations Better Agent may never leave 'ready'
  // (nothing to load). A single setTimeout(0) on mount flips 'init'
  // to 'settled' after the current task queue drains, which lets the
  // drain effect fire for that case too.
  type HydrationPhase = 'init' | 'hydrating' | 'settled';
  const [hydrationPhase, setHydrationPhase] = useState<HydrationPhase>('init');

  useEffect(() => {
    setHydrationPhase((prev) => {
      if (agent.status !== 'ready') return 'hydrating';
      if (prev === 'hydrating') return 'settled';
      return prev;
    });
  }, [agent.status]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setHydrationPhase((prev) => (prev === 'init' ? 'settled' : prev));
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (hydrationPhase !== 'settled') return;
    if (agent.status !== 'ready') return;
    if (!pendingMessage) return;
    const text = pendingMessage;
    // Clear first to prevent re-entry: the effect re-runs when `value`
    // rebuilds (it depends on agent state), and without the early null
    // guard we'd send twice.
    setPendingMessage(null);
    value.send(text);
  }, [hydrationPhase, agent.status, pendingMessage, setPendingMessage, value]);

  return (
    <ChatRuntimeContext.Provider value={value}>
      {children}
    </ChatRuntimeContext.Provider>
  );
}

export function useChatRuntime(): ChatRuntimeValue {
  const value = useContext(ChatRuntimeContext);
  if (!value) {
    throw new Error('useChatRuntime must be used inside <ChatRuntimeProvider>');
  }
  return value;
}
