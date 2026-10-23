import { useMutation } from '@tanstack/react-query';
import { ArrowUpIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { applyDraft } from './reportSlice';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAppParams } from '@/hooks/use-app-params';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { useDispatch } from '@/redux';
import { cn } from '@/utils/cn';

/** What the box says while the model reads the project and drafts; one line per few seconds. */
const BUSY_STATUS = [
  'Reading your events…',
  'Drafting the report…',
  'Almost there…',
] as const;
const BUSY_STATUS_STEP_MS = 3500;

function useBusyStatus(busy: boolean): string | null {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!busy) {
      setIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setIndex((current) => Math.min(current + 1, BUSY_STATUS.length - 1));
    }, BUSY_STATUS_STEP_MS);
    return () => clearInterval(timer);
  }, [busy]);
  return busy ? BUSY_STATUS[index] : null;
}

/** The empty editor: say what you want and the model drafts a starting point from the project's events. */
export function ReportPrompt() {
  const { projectId } = useAppParams();
  const dispatch = useDispatch();
  const trpc = useTRPC();
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const draft = useMutation(
    trpc.chat.draftReport.mutationOptions({
      onSuccess(result) {
        if (!result.report) {
          setNotice(result.summary);
          return;
        }
        dispatch(applyDraft(result.report));
        toast(result.report.name, { description: result.summary });
      },
      onError: handleError,
    })
  );
  const busy = draft.isPending;
  const status = useBusyStatus(busy);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const submit = () => {
    const value = text.trim();
    if (!value || busy) {
      return;
    }
    setNotice(null);
    draft.mutate({ projectId, prompt: value });
  };

  return (
    <div className="card flex flex-col items-center px-4 py-16 md:py-24">
      <p className="max-w-lg text-center text-muted-foreground">
        To get you going, just say what you want to see and we'll generate a
        good starting point.
      </p>

      <form
        className="mt-6 w-full max-w-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div
          className={cn(
            'rounded-2xl border bg-card shadow-sm transition-shadow',
            'focus-within:border-ring focus-within:ring-1 focus-within:ring-ring',
            busy && 'opacity-80'
          )}
        >
          <textarea
            aria-label="Describe the report"
            className={cn(
              'block w-full resize-none bg-transparent px-4 pt-4 pb-2 text-base text-foreground',
              'placeholder:text-muted-foreground/70',
              'border-0 outline-none ring-0 focus:outline-none focus:ring-0'
            )}
            disabled={busy}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="Unique visitors per day for the last 30 days, split by device"
            ref={textareaRef}
            rows={3}
            value={text}
          />
          <div className="flex items-center justify-between gap-2 px-3 pb-3">
            <span
              aria-live="polite"
              className="min-w-0 truncate text-muted-foreground text-xs"
            >
              {status}
            </span>
            <Button
              aria-label="Generate report"
              className="size-8 shrink-0 rounded-full"
              disabled={!text.trim() || busy}
              size="icon"
              type="submit"
            >
              {busy ? (
                <Spinner size="sm" variant="white" />
              ) : (
                <ArrowUpIcon className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </form>

      {notice && (
        <p
          className="mt-3 max-w-2xl rounded-lg bg-def-100 px-3 py-2 text-center text-sm dark:bg-def-200"
          role="status"
        >
          {notice}
        </p>
      )}
    </div>
  );
}
