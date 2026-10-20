import { ArrowUpIcon, SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { useChatLaunch } from './chat-launch';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

/** The sidebar's one-line "Ask AI" box; submitting opens the chat page with the question. */
export function SidebarChatComposer() {
  const launch = useChatLaunch();
  const [text, setText] = useState('');
  const hasText = text.trim().length > 0;

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    launch(text);
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
          'min-w-0 flex-1 bg-transparent py-2 font-medium text-foreground text-sm',
          'placeholder:font-normal placeholder:text-muted-foreground',
          'border-0 shadow-none outline-none ring-0',
          'focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0'
        )}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
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
        <button
          aria-label="Open the chat (Cmd+J)"
          className={cn(
            'shrink-0 rounded border border-border bg-def-200 px-1.5 py-0.5 font-mono text-2xs',
            'cursor-pointer text-muted-foreground'
          )}
          onClick={() => launch()}
          type="button"
        >
          ⌘J
        </button>
      )}
    </form>
  );
}
