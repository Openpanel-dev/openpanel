import { useMutation } from '@tanstack/react-query';
import { ArrowUpIcon, SparklesIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { applyDraft } from './reportSlice';
import { Button } from '@/components/ui/button';
import { SheetTrigger } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { useAppParams } from '@/hooks/use-app-params';
import { useEventNames } from '@/hooks/use-event-names';
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
const MAX_EXAMPLES = 4;
/** Automatic events make poor examples; a custom event reads like the user's own data. */
const AUTOMATIC_EVENTS = new Set([
  'screen_view',
  'session_start',
  'session_end',
]);
const GENERIC_EXAMPLES = [
  'Unique visitors per day for the last 30 days',
  'Page views by country, last 7 days',
  'Top referrers this month',
  'Sessions per week over the last 3 months, by device',
];

function examplePrompts(eventNames: string[]): string[] {
  const custom = eventNames.filter((name) => !AUTOMATIC_EVENTS.has(name));
  const [first, second] = custom;
  if (!first) {
    return GENERIC_EXAMPLES;
  }
  const examples = [
    `Daily ${first} for the last 30 days`,
    `Unique users with ${first} per week, last 3 months`,
    `${first} by country, last 7 days`,
  ];
  if (second) {
    examples.push(`Funnel from ${first} to ${second}`);
  } else if (eventNames.includes('screen_view')) {
    examples.push(`Funnel from screen_view to ${first}`);
  }
  return examples.slice(0, MAX_EXAMPLES);
}

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

/** The empty editor: describe the report in words and the model drafts it from the project's events. */
export function ReportPrompt() {
  const { projectId } = useAppParams();
  const dispatch = useDispatch();
  const trpc = useTRPC();
  const eventNames = useEventNames({ projectId, anyEvents: false });
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

  const submit = (prompt: string) => {
    const value = prompt.trim();
    if (!value || busy) {
      return;
    }
    setNotice(null);
    draft.mutate({ projectId, prompt: value });
  };

  return (
    <div className="card flex flex-col items-center px-4 py-12 md:py-16">
      <div className="flex size-11 items-center justify-center rounded-full bg-highlight/10 text-highlight">
        <SparklesIcon className="size-5" />
      </div>
      <h2 className="mt-5 text-center font-semibold text-2xl">
        What do you want to see?
      </h2>
      <p className="mt-2 max-w-md text-center text-muted-foreground">
        Describe the chart in plain words. The events, filters and chart type
        come from what this project tracks.
      </p>

      <form
        className="mt-8 w-full max-w-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          submit(text);
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
                submit(text);
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
              {status ?? 'Enter to generate, Shift+Enter for a new line'}
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

      <div className="mt-4 flex w-full max-w-2xl flex-wrap justify-center gap-2">
        {examplePrompts(eventNames.map((event) => event.name)).map(
          (example) => (
            <button
              className="rounded-full border bg-card px-3 py-1.5 text-left text-sm transition-colors hover:bg-def-100 disabled:opacity-50 dark:hover:bg-def-200"
              disabled={busy}
              key={example}
              onClick={() => {
                setText(example);
                submit(example);
              }}
              type="button"
            >
              {example}
            </button>
          )
        )}
      </div>

      <p className="mt-8 text-muted-foreground text-sm">
        Prefer to build it yourself?{' '}
        <SheetTrigger asChild>
          <button
            className="font-medium text-foreground underline-offset-4 hover:underline"
            type="button"
          >
            Pick the events by hand
          </button>
        </SheetTrigger>
      </p>
    </div>
  );
}
