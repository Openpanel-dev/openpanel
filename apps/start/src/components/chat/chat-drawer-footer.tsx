import { ArrowUpIcon, StopCircleIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useChatRuntime } from './chat-runtime';
import { ModelPicker } from './model-picker';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

/**
 * Composer card.
 *
 * Layout mirrors the modern "single-card" pattern: textarea on top,
 * model picker bottom-left, send button bottom-right. Owns its own
 * input state — `useChat` v5+ doesn't manage input.
 */
export function ChatDrawerFooter() {
  const { send, stop, status } = useChatRuntime();
  const [text, setText] = useState('');
  const isStreaming = status === 'streaming' || status === 'submitted';

  // Auto-focus the textarea on mount. Because the footer sits inside
  // `<ChatRuntimeProvider key={conversationId}>`, the provider (and
  // therefore this footer) remounts whenever the drawer opens or the
  // active conversation changes — so this runs on every "open"
  // without us needing to track the event explicitly.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value || isStreaming) {
      return;
    }
    send(value);
    setText('');
  };

  return (
    <form className="px-3 pt-2 pb-3" onSubmit={submit}>
      <div
        className={cn(
          'rounded-xl border bg-card transition-shadow',
          'focus-within:border-ring focus-within:ring-1 focus-within:ring-ring'
        )}
      >
        {/*
          Plain `<textarea>` here — the shadcn `<Textarea>` ships with
          its own `border-input` + `focus-visible:ring-2 + ring-offset-2`,
          which stack on top of the parent card's focus-within ring and
          produce a double-outline (see prior screenshot). Keep things
          unstyled at the element level so the parent card owns the
          focus boundary.
        */}
        {/*
          Input stays editable while a reply streams — the user can
          draft the next message in parallel. Enter is a no-op during
          streaming (blocked inside `submit`); once the run ends the
          drafted text sends on the next Enter press.
        */}
        <textarea
          className={cn(
            'block w-full bg-transparent text-foreground text-sm leading-[1.5]',
            'placeholder:text-muted-foreground/70',
            'resize-none border-0 shadow-none outline-none ring-0',
            'focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0',
            'max-h-[200px] min-h-[48px] px-3 pt-3 pb-1'
          )}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask anything about your data…"
          ref={textareaRef}
          rows={2}
          value={text}
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <ModelPicker />
          {isStreaming ? (
            <Button
              aria-label="Stop generating"
              className="size-7 shrink-0 rounded-md"
              onClick={stop}
              size="icon"
              type="button"
              variant="secondary"
            >
              <StopCircleIcon className="size-3.5" />
            </Button>
          ) : (
            <Button
              aria-label="Send message"
              className="size-7 shrink-0 rounded-md"
              disabled={!text.trim()}
              size="icon"
              type="submit"
              variant="default"
            >
              <ArrowUpIcon className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
