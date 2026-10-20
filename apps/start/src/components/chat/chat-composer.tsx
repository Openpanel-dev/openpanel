import type { ChatModelEntry } from '@openpanel/core/modules/assistant/assistant.constants';
import { ArrowUpIcon, SquareIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ChatModelPicker } from './chat-model-picker';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

const MAX_ROWS_HEIGHT_PX = 200;

export function ChatComposer({
  onSend,
  onStop,
  busy,
  models,
  modelId,
  onModelChange,
  autoFocus,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  busy: boolean;
  models: readonly ChatModelEntry[];
  modelId: string | null;
  onModelChange: (id: string) => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus();
    }
  }, [autoFocus]);

  // Grow with the draft up to a cap, then scroll.
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) {
      return;
    }
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_ROWS_HEIGHT_PX)}px`;
  }, [text]);

  const submit = () => {
    const value = text.trim();
    if (!value || busy) {
      return;
    }
    onSend(value);
    setText('');
  };

  return (
    <form
      className="mx-auto w-full max-w-3xl px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div
        className={cn(
          'rounded-2xl border bg-card shadow-sm transition-shadow',
          'focus-within:border-ring focus-within:ring-1 focus-within:ring-ring'
        )}
      >
        <textarea
          aria-label="Message"
          className={cn(
            'block w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base text-foreground sm:text-sm',
            'placeholder:text-muted-foreground/70',
            'border-0 outline-none ring-0 focus:outline-none focus:ring-0'
          )}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Ask about your data, build a chart, or ask how something works…"
          ref={textareaRef}
          rows={1}
          value={text}
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          {models.length > 0 ? (
            <ChatModelPicker
              models={models}
              onChange={onModelChange}
              value={modelId}
            />
          ) : (
            <span />
          )}
          {busy ? (
            <Button
              aria-label="Stop generating"
              className="size-8 rounded-full"
              onClick={onStop}
              size="icon"
              type="button"
              variant="secondary"
            >
              <SquareIcon className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              aria-label="Send message"
              className="size-8 rounded-full"
              disabled={!text.trim()}
              size="icon"
              type="submit"
            >
              <ArrowUpIcon className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
