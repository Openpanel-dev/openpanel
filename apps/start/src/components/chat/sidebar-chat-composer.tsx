import { ArrowUpIcon, SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { useChatState } from './chat-context';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

/**
 * Compact "Ask AI" composer for the sidebar.
 *
 * Single-row layout:
 *   [✨] Ask AI anything…                 [⌘J] | [↑ send]
 *
 * The trailing slot shows the keyboard-shortcut hint while the input
 * is empty and swaps to a send button the moment the user starts
 * typing. Submitting stashes the draft on `chatState.pendingMessage`
 * and opens a fresh conversation — the drawer's runtime drains the
 * pending message once `useAgent` is ready.
 */
export function SidebarChatComposer() {
  const { setPendingMessage, openNewChat } = useChatState();
  const [text, setText] = useState('');
  const hasText = text.trim().length > 0;

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value) {
      return;
    }
    setPendingMessage(value);
    openNewChat();
    setText('');
  };

  return (
    <form
      className={cn(
        'mb-4 flex items-center gap-2 rounded-md border border-border bg-def-100 pr-2 pl-3',
        'transition-all focus-within:border-def-400 focus-within:ring-1 focus-within:ring-ring'
      )}
      onSubmit={submit}
    >
      <SparklesIcon className="size-5 shrink-0 text-muted-foreground" />
      <input
        className={cn(
          'min-w-0 flex-1 bg-transparent py-2 font-medium text-[13px] text-foreground',
          'placeholder:font-normal placeholder:text-muted-foreground',
          'border-0 shadow-none outline-none ring-0',
          'focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0'
        )}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Ask AI anything…"
        type="text"
        value={text}
      />
      {hasText ? (
        <Button
          aria-label="Send to AI"
          className="size-6 shrink-0 rounded-sm"
          size="icon"
          type="submit"
          variant="default"
        >
          <ArrowUpIcon className="size-3.5" />
        </Button>
      ) : (
        <kbd
          aria-label="Keyboard shortcut: Cmd+J"
          className={cn(
            'shrink-0 rounded border border-border bg-def-200 px-1.5 py-0.5 font-mono text-[11px]',
            'cursor-pointer text-muted-foreground'
          )}
          onClick={() => openNewChat()}
        >
          ⌘J
        </kbd>
      )}
    </form>
  );
}
