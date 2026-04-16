import { Button } from '@/components/ui/button';
import { usePageContextValue } from '@/contexts/page-context';
import { cn } from '@/utils/cn';
import { ArrowDownIcon } from 'lucide-react';
import {
  StickToBottom,
  useStickToBottomContext,
} from 'use-stick-to-bottom';
import { ChatContextWidget } from './chat-context-widget';
import { ChatDrawerEmpty } from './chat-drawer-empty';
import { ChatMessage } from './chat-message';
import { useChatRuntime } from './chat-runtime';

/**
 * Message list. Reads `messages`, `status`, `isLoading`, `isStreaming`
 * from `useChatRuntime()` (the Better Agent `useAgent` hook
 * indirected through the runtime provider so the footer can share it).
 *
 * Auto-scrolls to bottom on new content, but stops if the user scrolls
 * up — courtesy of `use-stick-to-bottom`. Zero refs, zero effects.
 */
export function ChatDrawerBody() {
  const { messages, isLoading, isStreaming } = useChatRuntime();

  const hasContext = usePageContextValue();

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        <ChatContextWidget />
        <ChatDrawerEmpty />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <div className="absolute top-0 left-0 right-0 z-20 backdrop-blur-sm">
        <ChatContextWidget />
      </div>
      <StickToBottom
        className="flex-1 relative overflow-hidden"
        initial="instant"
        resize="smooth"
      >
        <StickToBottom.Content
          className={cn(
            'flex flex-col gap-4 px-3 py-4',
            hasContext && 'pt-24',
          )}
        >
          {messages.map((message) => (
            <ChatMessage key={message.localId} message={message} />
          ))}
          {isLoading && !isStreaming && (
            <div className="flex items-center gap-2 text-sm">
              <span className="op-shimmer font-medium">Thinking…</span>
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
  if (isAtBottom) return null;
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      className="absolute bottom-3 left-1/2 -translate-x-1/2 h-7 px-2 shadow-md gap-1"
      onClick={() => scrollToBottom()}
      aria-label="Scroll to bottom"
    >
      <ArrowDownIcon className="size-3" />
      <span className="text-sm">Latest</span>
    </Button>
  );
}
