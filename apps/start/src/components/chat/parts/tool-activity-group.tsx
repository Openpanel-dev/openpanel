import { getToolName, isToolUIPart } from 'ai';
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  Loader2Icon,
} from 'lucide-react';
import { useState } from 'react';
import { toolPhrase } from '../tool-labels';
import type { AssistantUIMessagePart } from '../types';
import { cn } from '@/utils/cn';

export type ToolPart = Extract<AssistantUIMessagePart, { toolCallId: string }>;

const MAX_DETAIL_CHARS = 8000;

type ItemStatus = 'running' | 'done' | 'error';

function statusOf(part: ToolPart): ItemStatus {
  switch (part.state) {
    case 'output-available':
      return 'done';
    case 'output-error':
      return 'error';
    default:
      return 'running';
  }
}

function labelOf(part: ToolPart, status: ItemStatus): string {
  const name = getToolName(part);
  if (status === 'running') {
    return toolPhrase(name, 'active');
  }
  if (status === 'error') {
    return `${toolPhrase(name, 'active')} failed`;
  }
  if (name === 'list_references') {
    const rows = (part.output as { rows?: unknown[] } | undefined)?.rows;
    if (Array.isArray(rows) && rows.length === 0) {
      return 'No references in this window';
    }
  }
  return toolPhrase(name, 'done');
}

function detailsOf(part: ToolPart): string {
  const payload =
    part.state === 'output-error'
      ? { input: part.input, error: part.errorText }
      : { input: part.input, output: part.output };
  const serialized = JSON.stringify(payload, null, 2) ?? '';
  return serialized.length > MAX_DETAIL_CHARS
    ? `${serialized.slice(0, MAX_DETAIL_CHARS)}…`
    : serialized;
}

function StatusIcon({ status }: { status: ItemStatus }) {
  if (status === 'running') {
    return <Loader2Icon className="size-3 animate-spin" />;
  }
  if (status === 'error') {
    return <AlertCircleIcon className="size-3 text-destructive" />;
  }
  return <CheckIcon className="size-3 text-emerald-500" />;
}

/**
 * A run of plain tool calls as one quiet line: what the assistant did, in
 * order, expanding to the raw inputs and outputs when asked.
 */
export function ToolActivityGroup({ parts }: { parts: ToolPart[] }) {
  const [open, setOpen] = useState(false);
  const items = parts.map((part) => {
    const status = statusOf(part);
    return { part, status, label: labelOf(part, status) };
  });
  const anyRunning = items.some((item) => item.status === 'running');

  return (
    <div className="text-xs">
      <button
        aria-expanded={open}
        className="group inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-1 text-left text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {items.map((item, index) => (
          <span
            className="inline-flex items-center gap-1"
            key={item.part.toolCallId}
          >
            {index > 0 && <span className="text-muted-foreground/50">·</span>}
            <StatusIcon status={item.status} />
            <span
              className={cn(
                item.status === 'running' && 'op-shimmer font-medium'
              )}
            >
              {item.label}
            </span>
          </span>
        ))}
        {!anyRunning && (
          <ChevronRightIcon
            className={cn('size-3 transition-transform', open && 'rotate-90')}
          />
        )}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {items.map((item) => (
            <details
              className="rounded-lg border bg-muted/20"
              key={item.part.toolCallId}
            >
              <summary className="cursor-pointer px-2.5 py-1.5 font-medium text-foreground/80">
                {getToolName(item.part)}
                {item.status === 'error' &&
                  item.part.state === 'output-error' && (
                    <span className="ml-2 font-normal text-destructive">
                      {item.part.errorText}
                    </span>
                  )}
              </summary>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all border-t px-2.5 py-2 font-mono text-[11px]">
                {detailsOf(item.part)}
              </pre>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

/** Tool parts that get their own card instead of a line in the activity group. */
export function isRichToolPart(part: AssistantUIMessagePart): boolean {
  if (!isToolUIPart(part)) {
    return false;
  }
  if (
    part.state === 'approval-requested' ||
    part.state === 'approval-responded' ||
    part.state === 'output-denied'
  ) {
    return true;
  }
  if (part.state !== 'output-available') {
    return false;
  }
  const name = getToolName(part);
  const output = part.output as Record<string, unknown> | unknown[] | undefined;
  if (
    [
      'navigate',
      'open_dialog',
      'search_docs',
      'search',
      'create_client',
    ].includes(name)
  ) {
    return true;
  }
  if (Array.isArray(output)) {
    return output.length > 0;
  }
  if (typeof output !== 'object' || output === null) {
    return false;
  }
  if ('error' in output) {
    return true;
  }
  if ('report' in output) {
    return true;
  }
  const rows = (output as { rows?: unknown }).rows;
  return Array.isArray(rows) && rows.length > 0;
}
