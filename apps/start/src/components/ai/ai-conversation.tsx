import { ChevronDownIcon, WrenchIcon } from 'lucide-react';
import { useState } from 'react';
import Syntax from '@/components/syntax';
import { cn } from '@/utils/cn';

const COLLAPSE_AFTER_CHARS = 1500;

const ROLE_CLASS: Record<string, string> = {
  system: 'bg-def-200 text-muted-foreground',
  user: 'bg-blue-500/15 text-blue-600 dark:text-blue-300',
  assistant: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  tool: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
};

interface MessageLike {
  role: string;
  content: unknown;
}

function isMessageLike(value: unknown): value is MessageLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'role' in value &&
    typeof (value as { role: unknown }).role === 'string'
  );
}

function stringify(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function LongText({ text, className }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const tooLong = text.length > COLLAPSE_AFTER_CHARS;
  const shown =
    tooLong && !expanded ? text.slice(0, COLLAPSE_AFTER_CHARS) : text;
  return (
    <div className={cn('whitespace-pre-wrap break-words text-sm', className)}>
      {shown}
      {tooLong && (
        <button
          className="ml-1 text-muted-foreground text-xs underline"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded
            ? 'Show less'
            : `Show ${text.length - COLLAPSE_AFTER_CHARS} more characters`}
        </button>
      )}
    </div>
  );
}

function ToolBlock({
  label,
  name,
  payload,
}: {
  label: string;
  name?: unknown;
  payload: unknown;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border bg-background">
      <button
        className="row w-full items-center gap-2 px-2 py-1.5 text-left text-xs"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <WrenchIcon className="size-3 text-muted-foreground" />
        <span className="text-muted-foreground">{label}</span>
        {typeof name === 'string' && (
          <span className="font-medium font-mono">{name}</span>
        )}
        <ChevronDownIcon
          className={cn(
            'ml-auto size-3 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>
      {open && (
        <div className="border-t p-2">
          <Syntax
            code={stringify(payload)}
            copyable={false}
            language="json"
            wrapLines
          />
        </div>
      )}
    </div>
  );
}

function Part({ part }: { part: unknown }) {
  if (typeof part === 'string') {
    return <LongText text={part} />;
  }
  if (typeof part !== 'object' || part === null) {
    return <LongText text={stringify(part)} />;
  }
  const record = part as Record<string, unknown>;
  switch (record.type) {
    case 'text':
      return <LongText text={String(record.text ?? '')} />;
    case 'reasoning':
      return (
        <LongText
          className="text-muted-foreground italic"
          text={String(record.text ?? '')}
        />
      );
    case 'tool_call':
    case 'tool-call':
    case 'function':
      return (
        <ToolBlock
          label="Tool call"
          name={
            record.toolName ??
            record.name ??
            (record.function as { name?: unknown } | undefined)?.name
          }
          payload={
            record.input ?? record.arguments ?? record.args ?? record.function
          }
        />
      );
    case 'tool_result':
    case 'tool-result':
      return (
        <ToolBlock
          label="Tool result"
          name={record.toolName}
          payload={record.output ?? record.result}
        />
      );
    case 'image':
    case 'file':
      return (
        <span className="rounded bg-def-200 px-2 py-0.5 text-muted-foreground text-xs">
          [{String(record.type)}
          {typeof record.mediaType === 'string' ? ` ${record.mediaType}` : ''}]
        </span>
      );
    default:
      return (
        <Syntax
          code={stringify(part)}
          copyable={false}
          language="json"
          wrapLines
        />
      );
  }
}

function Message({ message }: { message: MessageLike }) {
  const parts = Array.isArray(message.content)
    ? message.content
    : [message.content];
  return (
    <div className="col gap-1.5">
      <span
        className={cn(
          'w-fit rounded px-1.5 py-0.5 font-medium text-2xs uppercase tracking-wider',
          ROLE_CLASS[message.role] ?? 'bg-def-200 text-muted-foreground'
        )}
      >
        {message.role}
      </span>
      <div className="col gap-1.5 pl-1">
        {parts.map((part, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: message parts have no ids and the list is never reordered
          <Part key={index} part={part} />
        ))}
      </div>
    </div>
  );
}

/**
 * Renders what a model received and returned: an array of role messages
 * (the shape the SDKs send), a plain string (an embedding or a span state),
 * or any other JSON, raw. Truncated content arrives as text and falls into
 * the last case.
 */
export function AiContent({
  value,
  empty = 'Nothing captured',
}: {
  value: unknown;
  empty?: string;
}) {
  if (value === null || value === undefined || value === '') {
    return <div className="text-muted-foreground text-sm">{empty}</div>;
  }
  if (Array.isArray(value) && value.length > 0 && value.every(isMessageLike)) {
    return (
      <div className="col gap-4">
        {value.map((message, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: messages have no ids and the list is never reordered
          <Message key={index} message={message} />
        ))}
      </div>
    );
  }
  if (isMessageLike(value)) {
    return <Message message={value} />;
  }
  if (typeof value === 'string') {
    return <LongText text={value} />;
  }
  return (
    <Syntax
      code={stringify(value)}
      copyable={false}
      language="json"
      wrapLines
    />
  );
}
