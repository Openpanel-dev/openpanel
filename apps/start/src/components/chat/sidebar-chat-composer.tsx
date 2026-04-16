import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { ArrowUpIcon, SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { useChatState } from './chat-context';

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
    if (!value) return;
    setPendingMessage(value);
    openNewChat();
    setText('');
  };

  return (
    <form
      onSubmit={submit}
      className={cn(
        'mb-4 flex items-center gap-1.5 rounded-md border bg-card pl-2 pr-1',
        'focus-within:ring-1 focus-within:ring-ring transition-shadow',
      )}
    >
      <SparklesIcon className="size-4 text-muted-foreground shrink-0" />
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask AI anything…"
        className={cn(
          'flex-1 min-w-0 bg-transparent text-sm py-2 text-foreground',
          'placeholder:text-muted-foreground/70',
          'border-0 outline-none ring-0 shadow-none',
          'focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0',
        )}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      />
      {hasText ? (
        <Button
          type="submit"
          size="icon"
          variant="default"
          className="size-6 rounded-sm shrink-0"
          aria-label="Send to AI"
        >
          <ArrowUpIcon className="size-3" />
        </Button>
      ) : (
        <kbd
          className={cn(
            'shrink-0 rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]',
            'text-muted-foreground',
          )}
          aria-label="Keyboard shortcut: Cmd+J"
        >
          ⌘J
        </kbd>
      )}
    </form>
  );
}
