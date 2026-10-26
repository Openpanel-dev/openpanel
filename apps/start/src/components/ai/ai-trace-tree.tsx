import type { IServiceAiEvent } from '@openpanel/core';
import {
  AlertTriangleIcon,
  BracesIcon,
  FileTextIcon,
  SparklesIcon,
  WorkflowIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { formatCost, formatLatency, formatTokens } from './ai-format';
import { cn } from '@/utils/cn';

interface TraceNode {
  event: IServiceAiEvent;
  depth: number;
  /** Offset from the trace start, ms. */
  offsetMs: number;
}

const TYPE_ICON = {
  generation: SparklesIcon,
  embedding: BracesIcon,
  span: WorkflowIcon,
  trace: FileTextIcon,
} as const;

const TYPE_COLOR = {
  generation: 'bg-chart-0',
  embedding: 'bg-chart-2',
  span: 'bg-chart-4',
  trace: 'bg-foreground/40',
} as const;

const INDENT_PX = 16;
const MIN_BAR_PX = 2;

/** Orders the trace's events as a tree: parents first, children by time. */
export function buildTraceNodes(events: IServiceAiEvent[]): {
  nodes: TraceNode[];
  totalMs: number;
} {
  const sorted = [...events].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  const start = sorted[0]?.createdAt.getTime() ?? 0;
  const end = Math.max(
    ...sorted.map((event) => event.createdAt.getTime() + event.latencyMs),
    start
  );
  const byId = new Map(
    sorted.map((event) => [event.spanId || event.id, event])
  );
  const children = new Map<string, IServiceAiEvent[]>();
  const roots: IServiceAiEvent[] = [];
  for (const event of sorted) {
    const parentKey =
      event.parentId &&
      event.parentId !== event.traceId &&
      byId.has(event.parentId)
        ? event.parentId
        : null;
    if (parentKey) {
      children.set(parentKey, [...(children.get(parentKey) ?? []), event]);
    } else {
      roots.push(event);
    }
  }
  const nodes: TraceNode[] = [];
  const visit = (event: IServiceAiEvent, depth: number) => {
    nodes.push({ event, depth, offsetMs: event.createdAt.getTime() - start });
    for (const child of children.get(event.spanId || event.id) ?? []) {
      visit(child, depth + 1);
    }
  };
  for (const root of roots) {
    visit(root, 0);
  }
  return { nodes, totalMs: Math.max(end - start, 1) };
}

interface Props {
  events: IServiceAiEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function AiTraceTree({ events, selectedId, onSelect }: Props) {
  const { nodes, totalMs } = useMemo(() => buildTraceNodes(events), [events]);

  return (
    <div className="col">
      <div className="row items-center justify-between px-3 py-1.5 font-medium text-3xs text-muted-foreground uppercase tracking-wider">
        <span>Step</span>
        <span>{formatLatency(totalMs)} total</span>
      </div>
      {nodes.map(({ event, depth, offsetMs }) => {
        const Icon = TYPE_ICON[event.type];
        const left = (offsetMs / totalMs) * 100;
        const width = Math.max((event.latencyMs / totalMs) * 100, 0);
        const selected = event.id === selectedId;
        return (
          <button
            className={cn(
              'group grid w-full grid-cols-[minmax(0,1fr)_minmax(120px,40%)] items-center gap-3 border-t px-3 py-2 text-left transition-colors hover:bg-def-100',
              selected && 'bg-def-100'
            )}
            key={event.id}
            onClick={() => onSelect(event.id)}
            type="button"
          >
            <div
              className="row min-w-0 items-center gap-2"
              style={{ paddingLeft: depth * INDENT_PX }}
            >
              <Icon
                className={cn(
                  'size-3.5 shrink-0',
                  event.isError ? 'text-destructive' : 'text-muted-foreground'
                )}
              />
              <span className="truncate font-medium text-sm">
                {event.name || event.model || event.type}
              </span>
              {event.model && event.name && (
                <span className="truncate text-muted-foreground text-xs">
                  {event.model}
                </span>
              )}
              {event.isError && (
                <AlertTriangleIcon className="size-3 shrink-0 text-destructive" />
              )}
            </div>
            <div className="row items-center gap-2">
              <div className="relative h-4 flex-1 rounded bg-def-200/60">
                <div
                  className={cn(
                    'absolute top-0 h-full rounded',
                    event.isError ? 'bg-destructive' : TYPE_COLOR[event.type]
                  )}
                  style={{
                    left: `${left}%`,
                    width: `max(${width}%, ${MIN_BAR_PX}px)`,
                  }}
                />
              </div>
              <span className="w-28 shrink-0 text-right font-mono text-muted-foreground text-xs tabular-nums">
                {formatLatency(event.latencyMs)}
                {event.type === 'generation' && (
                  <span className="ml-1">
                    · {formatTokens(event.inputTokens + event.outputTokens)}t
                  </span>
                )}
                {event.totalCost > 0 && (
                  <span className="ml-1">· {formatCost(event.totalCost)}</span>
                )}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
