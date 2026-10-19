import type { ChatLaunchHint } from '@openpanel/core/modules/assistant/assistant.constants';
import {
  type ChatModelEntry,
  isValidModelId,
  MODEL_STORAGE_KEY,
} from '@openpanel/core/modules/assistant/assistant.constants';
import { HistoryIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatComposer } from './chat-composer';
import { ChatConversations } from './chat-conversations';
import { ChatEmpty } from './chat-empty';
import { ChatMessages } from './chat-messages';
import type { AssistantUIMessage } from './types';
import { useChatSession } from './use-chat-session';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

function readStoredModel(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const stored = window.localStorage.getItem(MODEL_STORAGE_KEY);
  return isValidModelId(stored) ? stored : null;
}

export function ChatView({
  conversationId,
  initialMessages,
  initialTitle,
  models,
  defaultModelId,
  hint,
  initialQuestion,
  onFirstMessage,
  onSelectConversation,
  onNewConversation,
}: {
  conversationId: string;
  initialMessages: AssistantUIMessage[];
  initialTitle: string | null;
  models: readonly ChatModelEntry[];
  defaultModelId: string | null;
  hint?: ChatLaunchHint;
  /** Sent once on mount; the launcher puts it in the URL. */
  initialQuestion?: string;
  onFirstMessage: () => void;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
}) {
  const [storedModel, setStoredModel] = useState<string | null>(
    readStoredModel
  );
  const modelId =
    storedModel && models.some((model) => model.id === storedModel)
      ? storedModel
      : defaultModelId;
  const selectModel = useCallback((id: string) => {
    setStoredModel(id);
    window.localStorage.setItem(MODEL_STORAGE_KEY, id);
  }, []);

  const session = useChatSession({
    conversationId,
    initialMessages,
    initialTitle,
    modelId,
    hint,
  });
  const { messages, status, sendMessage, stop, regenerate, error, title } =
    session;
  const busy = status === 'submitted' || status === 'streaming';
  const hasMessages = messages.length > 0;

  const send = useCallback(
    (text: string) => {
      if (messages.length === 0) {
        onFirstMessage();
      }
      sendMessage({ text });
    },
    [messages.length, onFirstMessage, sendMessage]
  );

  // The launcher's question is sent exactly once, however the page re-renders.
  const sentInitial = useRef(false);
  useEffect(() => {
    if (initialQuestion && !sentInitial.current && messages.length === 0) {
      sentInitial.current = true;
      send(initialQuestion);
    }
  }, [initialQuestion, messages.length, send]);

  const [listOpen, setListOpen] = useState(false);
  const selectConversation = (id: string) => {
    setListOpen(false);
    onSelectConversation(id);
  };
  const newConversation = () => {
    setListOpen(false);
    onNewConversation();
  };

  return (
    <div className="flex h-full min-h-0 w-full">
      <ChatConversations
        activeId={hasMessages ? conversationId : null}
        activeTitle={title}
        className="hidden w-64 shrink-0 border-r bg-card/50 lg:flex"
        onNew={newConversation}
        onSelect={selectConversation}
      />
      <Sheet onOpenChange={setListOpen} open={listOpen}>
        <SheetContent className="w-80 p-0" side="left">
          <SheetTitle className="sr-only">Conversations</SheetTitle>
          <ChatConversations
            activeId={hasMessages ? conversationId : null}
            activeTitle={title}
            onNew={newConversation}
            onSelect={selectConversation}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Button
            aria-label="Conversations"
            className="lg:hidden"
            onClick={() => setListOpen(true)}
            size="icon"
            variant="ghost"
          >
            <HistoryIcon className="size-4" />
          </Button>
          <div className="min-w-0 flex-1 truncate font-medium text-sm">
            {hasMessages ? (title ?? 'New chat') : 'New chat'}
          </div>
        </header>

        {hasMessages ? (
          <ChatMessages
            error={error}
            messages={messages}
            onApproval={(id, approved) =>
              session.addToolApprovalResponse({ id, approved })
            }
            onRetry={() => regenerate()}
            status={status}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <ChatEmpty hint={hint} onPick={send} />
          </div>
        )}

        <div className="shrink-0 border-t bg-background">
          <ChatComposer
            autoFocus
            busy={busy}
            modelId={modelId}
            models={models}
            onModelChange={selectModel}
            onSend={send}
            onStop={() => stop()}
          />
        </div>
      </div>
    </div>
  );
}
