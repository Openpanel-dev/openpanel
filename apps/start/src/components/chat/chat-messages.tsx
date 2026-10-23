import { AlertCircleIcon, ArrowDownIcon } from 'lucide-react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { ChatLimitNotice, parseChatLimit } from './chat-limit-notice';
import { ChatMessage } from './chat-message';
import type { AssistantUIMessage } from './types';
import { Button } from '@/components/ui/button';

export function ChatMessages({
  messages,
  status,
  error,
  onApproval,
  onRetry,
}: {
  messages: AssistantUIMessage[];
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  error?: Error;
  onApproval: (approvalId: string, approved: boolean) => void;
  onRetry: () => void;
}) {
  const active = status === 'submitted' || status === 'streaming';
  const lastIndex = messages.length - 1;
  const limit = status === 'error' ? parseChatLimit(error) : null;

  return (
    <StickToBottom
      className="relative min-h-0 flex-1 overflow-hidden"
      initial="instant"
      resize="smooth"
    >
      <StickToBottom.Content className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
        {messages.map((message, index) => (
          <ChatMessage
            key={message.id}
            message={message}
            onApproval={onApproval}
            streaming={active && index === lastIndex}
          />
        ))}
        {status === 'submitted' && (
          <div className="op-shimmer font-medium text-sm">Thinking…</div>
        )}
        {limit && <ChatLimitNotice limit={limit} />}
        {status === 'error' && !limit && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
            <span className="flex-1">
              {error?.message ?? 'Something went wrong.'}
            </span>
            <button className="underline" onClick={onRetry} type="button">
              Retry
            </button>
          </div>
        )}
      </StickToBottom.Content>
      <ScrollToBottom />
    </StickToBottom>
  );
}

function ScrollToBottom() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) {
    return null;
  }
  return (
    <Button
      aria-label="Scroll to latest"
      className="absolute bottom-3 left-1/2 h-7 -translate-x-1/2 gap-1 rounded-full px-3 shadow-md"
      onClick={() => scrollToBottom()}
      size="sm"
      type="button"
      variant="secondary"
    >
      <ArrowDownIcon className="size-3" />
      Latest
    </Button>
  );
}
