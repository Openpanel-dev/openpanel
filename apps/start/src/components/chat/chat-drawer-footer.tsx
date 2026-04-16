import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { ArrowUpIcon, StopCircleIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useChatRuntime } from './chat-runtime';
import { ModelPicker } from './model-picker';

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
    if (!value || isStreaming) return;
    send(value);
    setText('');
  };

  return (
    <form onSubmit={submit} className="px-3 pb-3 pt-2">
      <div
        className={cn(
          'rounded-xl border bg-card transition-shadow',
          'focus-within:ring-1 focus-within:ring-ring focus-within:border-ring',
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
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask anything about your data…"
          rows={2}
          className={cn(
            'block w-full bg-transparent text-sm leading-[1.5] text-foreground',
            'placeholder:text-muted-foreground/70',
            'resize-none border-0 outline-none ring-0 shadow-none',
            'focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0',
            'min-h-[48px] max-h-[200px] px-3 pt-3 pb-1',
          )}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <ModelPicker />
          {isStreaming ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="size-7 rounded-md shrink-0"
              onClick={stop}
              aria-label="Stop generating"
            >
              <StopCircleIcon className="size-3.5" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              variant="default"
              className="size-7 rounded-md shrink-0"
              disabled={!text.trim()}
              aria-label="Send message"
            >
              <ArrowUpIcon className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
