import { AlertCircleIcon, ArrowDownIcon } from 'lucide-react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { ChatContextWidget } from './chat-context-widget';
import { ChatDrawerEmpty } from './chat-drawer-empty';
import { ChatMessage } from './chat-message';
import { useChatRuntime } from './chat-runtime';
import { Button } from '@/components/ui/button';
import { usePageContextValue } from '@/contexts/page-context';
import { cn } from '@/utils/cn';

/**
 * Message list. Reads `messages`, `status`, `isLoading`, `isStreaming`
 * from `useChatRuntime()` (the Better Agent `useAgent` hook
 * indirected through the runtime provider so the footer can share it).
 *
 * Auto-scrolls to bottom on new content, but stops if the user scrolls
 * up — courtesy of `use-stick-to-bottom`. Zero refs, zero effects.
 */
export function ChatDrawerBody() {
  const { messages, isLoading, isStreaming, status, error } = useChatRuntime();

  const hasContext = usePageContextValue();

  // `runStillActive` flags the currently-generating assistant message
  // so its reasoning blocks can stay in the shimmer state until Better
  // Agent emits a terminal signal. Everything in older messages is
  // always done. `isLoading` covers submitted/waiting, `isStreaming`
  // covers actively streaming — combining both catches the full run.
  const isRunActive = isLoading || isStreaming;
  const lastMessageIndex = messages.length - 1;

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <ChatContextWidget />
        <ChatDrawerEmpty />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="absolute top-0 right-0 left-0 z-20 backdrop-blur-sm">
        <ChatContextWidget />
      </div>
      <StickToBottom
        className="relative flex-1 overflow-hidden"
        initial="instant"
        resize="smooth"
      >
        <StickToBottom.Content
          className={cn('flex flex-col gap-4 px-3 py-4', hasContext && 'pt-24')}
        >
          {messages.map((message, idx) => (
            <ChatMessage
              key={message.localId}
              message={message}
              runStillActive={isRunActive && idx === lastMessageIndex}
            />
          ))}
          {isLoading && !isStreaming && (
            <div className="flex items-center gap-2 text-sm">
              <span className="op-shimmer font-medium">Thinking…</span>
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
              <span className="leading-[1.5]">
                {error?.message ?? 'Something went wrong. Try again.'}
              </span>
            </div>
          )}
        </StickToBottom.Content>
        <ScrollToBottomButton />
      </StickToBottom>
    </div>
  );
}

function ScrollToBottomButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) {
    return null;
  }
  return (
    <Button
      aria-label="Scroll to bottom"
      className="absolute bottom-3 left-1/2 h-7 -translate-x-1/2 gap-1 px-2 shadow-md"
      onClick={() => scrollToBottom()}
      size="sm"
      type="button"
      variant="secondary"
    >
      <ArrowDownIcon className="size-3" />
      <span className="text-sm">Latest</span>
    </Button>
  );
}
