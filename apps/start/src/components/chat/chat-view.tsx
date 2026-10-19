import type { ChatLaunchHint } from '@openpanel/core/modules/assistant/assistant.constants';
import {
  type ChatModelEntry,
  isValidModelId,
  MODEL_STORAGE_KEY,
} from '@openpanel/core/modules/assistant/assistant.constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatComposer } from './chat-composer';
import { ChatEmpty } from './chat-empty';
import { ChatMessages } from './chat-messages';
import type { AssistantUIMessage } from './types';
import { useChatSession } from './use-chat-session';

function readStoredModel(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const stored = window.localStorage.getItem(MODEL_STORAGE_KEY);
  return isValidModelId(stored) ? stored : null;
}

/** The conversation itself: messages and composer. The list and header live in `ChatLayout`. */
export function ChatView({
  conversationId,
  initialMessages,
  initialTitle,
  models,
  defaultModelId,
  hint,
  initialQuestion,
  onFirstMessage,
  onTitleChange,
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
  onTitleChange: (title: string | null) => void;
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

  useEffect(() => {
    onTitleChange(hasMessages ? title : null);
  }, [title, hasMessages, onTitleChange]);

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

  return (
    <>
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
    </>
  );
}
