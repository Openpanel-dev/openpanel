import { AlertCircleIcon, CheckIcon, SparklesIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { getToolPhrase } from './tool-labels';
import { Skeleton } from '@/components/skeleton';
import { cn } from '@/utils/cn';

/**
 * Wrapper that handles the tool-part state machine. Shows a shimmer
 * activity row while the tool is running, an error card on failure,
 * and the renderer's children on success.
 */
export function ToolStateGuard({
  state,
  errorText,
  toolName,
  pending,
  children,
}: {
  state: string;
  errorText?: string;
  /** Used for the friendly action label on in-progress / completed badges. */
  toolName?: string;
  pending?: ReactNode;
  children: ReactNode;
}) {
  if (state === 'input-streaming' || state === 'input-available') {
    return pending ?? <ToolActivityBadge toolName={toolName} />;
  }
  if (state === 'output-error') {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
        <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
        <span>{errorText ?? 'Tool failed'}</span>
      </div>
    );
  }
  if (state === 'output-available') {
    return <>{children}</>;
  }
  return null;
}

/**
 * Compact "the AI is working on this" badge with shimmer text. Shown
 * while a tool's input is streaming or it's executing on the server.
 */
export function ToolActivityBadge({ toolName }: { toolName?: string }) {
  const label = toolName ? getToolPhrase(toolName, 'active') : 'Working';
  return (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      <SparklesIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="op-shimmer font-medium">{label}…</span>
    </div>
  );
}

/**
 * Compact "done" badge for tools whose output we don't surface as a
 * full card (the model already wrote prose with the result). Renders
 * a small chip you can click to expand into details.
 */
export function ToolDoneBadge({
  toolName,
  children,
}: {
  toolName: string;
  children?: ReactNode;
}) {
  return (
    <details className="group rounded-md border bg-card text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 [&::-webkit-details-marker]:hidden">
        <CheckIcon className="size-3 shrink-0 text-emerald-500" />
        <span className="font-medium text-foreground/80">
          {getToolPhrase(toolName, 'done')}
        </span>
      </summary>
      {children && <div className="border-t px-2.5 py-2">{children}</div>}
    </details>
  );
}

export function ResultCard({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('overflow-hidden rounded-md border bg-card', className)}>
      {title && (
        <div className="border-b px-3 py-1.5 font-medium text-muted-foreground text-sm">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

export function ResultRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 px-3 py-1.5 text-sm',
        className
      )}
    >
      {children}
    </div>
  );
}

export function ResultLabel({ children }: { children: ReactNode }) {
  return <span className="truncate text-muted-foreground">{children}</span>;
}

export function ResultValue({
  children,
  mono = true,
}: {
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <span
      className={cn('shrink-0 font-medium tabular-nums', mono && 'font-mono')}
    >
      {children}
    </span>
  );
}

export { Skeleton };
