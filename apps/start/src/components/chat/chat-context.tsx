import { useQuery } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { newConversationId, useChatUrlState } from './use-chat-open';
import {
  type ChatModelOption,
  isValidModelId,
  MODEL_STORAGE_KEY,
} from '@/agents/models';
import { useTRPC } from '@/integrations/trpc/react';

/**
 * Thin global context for chat identifiers. The active conversation
 * id and the drawer's open/closed state both live in the URL (`?chat`)
 * so conversations are linkable and survive navigation. Everything
 * else transient — the selected model, streaming title, pending
 * message for the sidebar composer — stays in React state here.
 *
 * No `useChat` or `useAgent` runs in this provider. The actual chat
 * runtime (`<ChatRuntimeProvider>`) lives inside the drawer and is
 * scoped to it.
 */

interface ChatStateValue {
  /**
   * Active conversation id. Mirrors `?chat` in the URL. When the
   * drawer is closed this is still populated (the next open uses it),
   * but `isOpen` will be false.
   */
  conversationId: string;
  /** True when the `?chat` param is present in the URL. */
  isOpen: boolean;

  /**
   * Open the drawer with a fresh conversation. This is the default
   * "Ask AI" / ⌘J behavior — previously this resumed a per-page
   * conversation from localStorage, but that added a second source of
   * truth next to the URL and was removed. The header's conversation
   * dropdown is the way to resume a prior conversation.
   */
  openChatForContext: () => void;
  /**
   * Start a brand-new conversation in the open drawer. Alias for
   * openChatForContext — kept because several call sites use the
   * name "newChat" for clarity.
   */
  openNewChat: () => void;
  /** Open the drawer on a specific existing conversation id. */
  openChat: (id: string) => void;
  /** Close the drawer (clears `?chat`). */
  closeChat: () => void;
  /** Switch the active conversation (leaves the drawer open). */
  switchConversation: (id: string) => void;
  /**
   * Start a fresh conversation inside the open drawer. Alias for
   * openNewChat — kept for clarity at call sites.
   */
  newConversation: () => void;

  /** Active agent name = model id from the whitelist. */
  agentName: string;
  models: readonly ChatModelOption[];
  setAgent: (agentName: string) => void;
  /**
   * Tri-state derived from the `chat.models` query:
   *   - `null`  — query hasn't resolved yet (show the neutral loading state)
   *   - `true`  — at least one provider is configured on the API
   *   - `false` — no providers configured → show setup instructions
   */
  isAiEnabled: boolean | null;

  /**
   * Title being streamed for the active conversation, if any. Flips
   * from null → accumulating deltas → null when either the stream
   * finishes (persisted title takes over) or the conversation
   * switches. The header renders this when non-null, falling back
   * to the persisted title otherwise.
   */
  streamingTitle: string | null;
  setStreamingTitle: (value: string | null) => void;
  /**
   * Message text the user wants to send the next time the chat
   * runtime mounts. The sidebar composer sets this and opens the
   * drawer; the runtime drains it once the agent is ready.
   */
  pendingMessage: string | null;
  setPendingMessage: (text: string | null) => void;
}

const ChatContext = createContext<ChatStateValue | null>(null);

function readStoredAgent(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.localStorage.getItem(MODEL_STORAGE_KEY);
  return isValidModelId(raw) ? raw : null;
}

export function ChatStateProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const { session } = useRouteContext({
    from: '__root__',
  });

  // Single source of truth for "is AI configured on the API" — the
  // `chat.models` query already filters by which provider keys are set, so
  // an empty `models` array means no OpenAI/Anthropic key and we render the
  // setup-instructions empty state. No need to leak env vars to the client.
  const modelsQuery = useQuery(
    trpc.chat.models.queryOptions(undefined, {
      enabled: !!session?.session,
    })
  );
  const models = modelsQuery.data?.models ?? [];
  const defaultModelId = modelsQuery.data?.defaultModelId ?? null;
  const isAiEnabled: boolean | null = modelsQuery.isPending
    ? null
    : models.length > 0;
  // URL is the source of truth for the active conversation + drawer
  // open state. `chatParam`:
  //   - null         → drawer closed
  //   - non-empty id → drawer open, on that conversation
  //   - '' (empty)   → drawer open, needs a new id (we auto-fill below)
  const [chatParam, setChatParam] = useChatUrlState();

  // Fallback local id for first render / SSR when `chatParam` is
  // null. Keeps `conversationId` stable as a non-empty string so
  // `<ChatRuntimeProvider key={conversationId}>` never sees empty.
  // Replaced the moment the user opens the drawer.
  const [ghostId] = useState(() => newConversationId());
  const conversationId =
    chatParam && chatParam.length > 0 ? chatParam : ghostId;
  const isOpen = chatParam !== null;

  // If the URL says "open with empty id" (e.g. ?chat= from a stale
  // link or legacy boolean param), materialize a fresh conversation.
  useEffect(() => {
    if (chatParam === '') {
      setChatParam(newConversationId());
    }
  }, [chatParam, setChatParam]);

  const openChatForContext = useCallback(() => {
    setChatParam(newConversationId());
  }, [setChatParam]);

  const openNewChat = openChatForContext;

  const openChat = useCallback(
    (id: string) => {
      setChatParam(id);
    },
    [setChatParam]
  );

  const closeChat = useCallback(() => {
    setChatParam(null);
  }, [setChatParam]);

  const switchConversation = useCallback(
    (id: string) => {
      setChatParam(id);
    },
    [setChatParam]
  );

  const newConversation = openNewChat;

  // Model selection — persisted to localStorage. Initial value is the
  // stored preference (if any); resolves to the server-provided default
  // once the models query loads.
  const [agentName, setAgentNameState] = useState<string>(
    () => readStoredAgent() ?? ''
  );
  const setAgent = useCallback(
    (id: string) => {
      if (!models.some((m) => m.id === id)) {
        return;
      }
      setAgentNameState(id);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(MODEL_STORAGE_KEY, id);
      }
    },
    [models]
  );

  // Once the models query resolves, make sure `agentName` points at a
  // model the server can actually serve. Covers:
  //   - first render (no stored preference) → pick `defaultModelId`
  //   - stored preference from a provider that's no longer configured
  //     (e.g. ANTHROPIC_API_KEY was removed) → fall back to default
  useEffect(() => {
    if (!defaultModelId) {
      return;
    }
    if (agentName && models.some((m) => m.id === agentName)) {
      return;
    }
    setAgentNameState(defaultModelId);
  }, [agentName, defaultModelId, models]);

  // Transient session state.
  const [streamingTitle, setStreamingTitle] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  // Clear `streamingTitle` when the conversation changes — the title
  // belongs to the prior convo, not the new one.
  //
  // NB: we do NOT clear `pendingMessage` here. The sidebar composer
  // deliberately sets it *before* calling `openNewChat()`, which
  // changes `conversationId`. Clearing here would nuke the pending
  // message between set-and-drain and the new chat would open empty.
  // The runtime drains it as soon as the new `useAgent` is `ready`.
  useEffect(() => {
    setStreamingTitle(null);
  }, [conversationId]);

  const value = useMemo<ChatStateValue>(
    () => ({
      conversationId,
      isOpen,
      openChatForContext,
      openNewChat,
      openChat,
      closeChat,
      switchConversation,
      newConversation,
      agentName,
      models,
      setAgent,
      isAiEnabled,
      streamingTitle,
      setStreamingTitle,
      pendingMessage,
      setPendingMessage,
    }),
    [
      conversationId,
      isOpen,
      openChatForContext,
      openNewChat,
      openChat,
      closeChat,
      switchConversation,
      newConversation,
      agentName,
      models,
      setAgent,
      isAiEnabled,
      streamingTitle,
      pendingMessage,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatState(): ChatStateValue {
  const value = useContext(ChatContext);
  if (!value) {
    throw new Error('useChatState must be used inside <ChatStateProvider>');
  }
  return value;
}
