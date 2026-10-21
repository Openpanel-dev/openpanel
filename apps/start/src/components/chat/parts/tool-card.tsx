import {
  AlertCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  SparklesIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toolPhrase } from '../tool-labels';

export function ToolActivity({ toolName }: { toolName: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <SparklesIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="op-shimmer font-medium">
        {toolPhrase(toolName, 'active')}…
      </span>
    </div>
  );
}

export function ToolError({
  toolName,
  message,
}: {
  toolName: string;
  message?: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
      <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {toolPhrase(toolName, 'active')} failed{message ? `: ${message}` : '.'}
      </span>
    </div>
  );
}

const MAX_PREVIEW_CHARS = 12_000;

/** A finished tool without a dedicated card: a chip that opens to the raw result. */
export function ToolDone({
  toolName,
  output,
}: {
  toolName: string;
  output: unknown;
}) {
  const [open, setOpen] = useState(false);
  const serialized = JSON.stringify(output, null, 2) ?? '';
  const preview =
    serialized.length > MAX_PREVIEW_CHARS
      ? `${serialized.slice(0, MAX_PREVIEW_CHARS)}…`
      : serialized;

  return (
    <div className="inline-flex max-w-full flex-col rounded-lg border bg-card text-sm">
      <button
        className="flex items-center gap-2 px-2.5 py-1.5 text-left"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <CheckIcon className="size-3.5 shrink-0 text-emerald-500" />
        <span className="font-medium text-foreground/80">
          {toolPhrase(toolName, 'done')}
        </span>
        <ChevronRightIcon
          className={`size-3 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all border-t bg-muted/20 px-2.5 py-2">
          {preview}
        </pre>
      )}
    </div>
  );
}
