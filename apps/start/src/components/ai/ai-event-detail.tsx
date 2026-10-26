import type { IServiceAiEvent } from '@openpanel/core';
import { AlertTriangleIcon } from 'lucide-react';
import { useState } from 'react';
import { AiContent } from './ai-conversation';
import {
  AI_TYPE_LABELS,
  formatCost,
  formatLatency,
  formatTokens,
} from './ai-format';
import { ProjectLink } from '@/components/links';
import Syntax from '@/components/syntax';
import { Badge } from '@/components/ui/badge';
import { KeyValueGrid } from '@/components/ui/key-value-grid';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/date';
import { getProfileName } from '@/utils/getters';

const TABS = [
  { id: 'conversation', title: 'Conversation' },
  { id: 'details', title: 'Details' },
  { id: 'raw', title: 'Raw' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function AiEventBadges({ event }: { event: IServiceAiEvent }) {
  return (
    <div className="row flex-wrap items-center gap-1.5">
      <Badge variant="outline">{AI_TYPE_LABELS[event.type]}</Badge>
      {event.model && <Badge variant="secondary">{event.model}</Badge>}
      {event.isError && (
        <Badge variant="destructive">
          <AlertTriangleIcon /> {event.httpStatus || 'error'}
        </Badge>
      )}
      {event.stopReason && event.stopReason !== 'stop' && (
        <Badge variant="outline">{event.stopReason}</Badge>
      )}
      {event.isStream && <Badge variant="outline">stream</Badge>}
    </div>
  );
}

export function AiEventStats({ event }: { event: IServiceAiEvent }) {
  const items = [
    event.type !== 'span' && event.type !== 'trace'
      ? {
          label: 'Tokens',
          value: `${formatTokens(event.inputTokens)} → ${formatTokens(event.outputTokens)}`,
        }
      : null,
    event.cacheReadTokens > 0
      ? { label: 'Cached', value: formatTokens(event.cacheReadTokens) }
      : null,
    event.totalCost > 0 || event.costSource !== 'none'
      ? { label: 'Cost', value: formatCost(event.totalCost) }
      : null,
    { label: 'Latency', value: formatLatency(event.latencyMs) },
    event.timeToFirstTokenMs > 0
      ? { label: 'First token', value: formatLatency(event.timeToFirstTokenMs) }
      : null,
  ].filter((item): item is { label: string; value: string } => item !== null);
  return (
    <div className="row flex-wrap gap-x-5 gap-y-1 text-sm">
      {items.map((item) => (
        <span className="row items-baseline gap-1.5" key={item.label}>
          <span className="text-muted-foreground text-xs">{item.label}</span>
          <span className="font-medium font-mono tabular-nums">
            {item.value}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Everything about one AI event: the conversation, its metadata, the raw row. */
export function AiEventDetail({
  event,
  className,
  showTraceLink = true,
}: {
  event: IServiceAiEvent;
  className?: string;
  showTraceLink?: boolean;
}) {
  const [tab, setTab] = useState<TabId>('conversation');
  const isModelCall = event.type === 'generation' || event.type === 'embedding';
  const errorRecord =
    typeof event.error === 'object' && event.error !== null
      ? (event.error as Record<string, unknown>)
      : null;

  return (
    <div className={cn('col gap-4', className)}>
      <div className="col gap-2">
        <AiEventBadges event={event} />
        <AiEventStats event={event} />
        <div className="row flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
          <span>{formatDateTime(event.createdAt)}</span>
          {event.profile && (
            <ProjectLink
              className="hover:underline"
              params={{ profileId: event.profileId }}
              to="/profiles/$profileId"
            >
              {getProfileName(event.profile, false)}
            </ProjectLink>
          )}
          {showTraceLink && (
            <ProjectLink
              className="hover:underline"
              params={{ traceId: event.traceId }}
              search={{ at: event.createdAt.toISOString() }}
              to="/ai/traces/$traceId"
            >
              Open trace
            </ProjectLink>
          )}
          {event.sessionId && (
            <ProjectLink
              className="hover:underline"
              params={{ sessionId: event.sessionId }}
              to="/sessions/$sessionId"
            >
              Open session
            </ProjectLink>
          )}
        </div>
      </div>

      {event.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <div className="font-medium text-destructive">
            {String(errorRecord?.message ?? event.error ?? 'Failed')}
          </div>
          {typeof errorRecord?.code === 'string' && (
            <div className="font-mono text-muted-foreground text-xs">
              {errorRecord.code}
            </div>
          )}
        </div>
      )}

      <div className="row gap-1 border-b">
        {TABS.map((item) => (
          <button
            className={cn(
              'px-3 py-1.5 text-sm transition-colors',
              item.id === tab
                ? 'border-foreground border-b-2 font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
            key={item.id}
            onClick={() => setTab(item.id)}
            type="button"
          >
            {item.title}
          </button>
        ))}
      </div>

      {tab === 'conversation' && (
        <div className="col gap-5">
          <section className="col gap-2">
            <h3 className="font-medium text-3xs text-muted-foreground uppercase tracking-wider">
              {isModelCall ? 'Input' : 'Input state'}
            </h3>
            <AiContent empty="No input stored" value={event.input} />
          </section>
          <section className="col gap-2">
            <h3 className="font-medium text-3xs text-muted-foreground uppercase tracking-wider">
              {isModelCall ? 'Output' : 'Output state'}
            </h3>
            <AiContent
              empty={
                event.isError
                  ? 'No output, the call failed'
                  : 'No output stored'
              }
              value={event.output}
            />
          </section>
          {event.tools !== null && (
            <section className="col gap-2">
              <h3 className="font-medium text-3xs text-muted-foreground uppercase tracking-wider">
                Tools available
              </h3>
              <AiContent value={event.tools} />
            </section>
          )}
        </div>
      )}

      {tab === 'details' && (
        <KeyValueGrid
          className="border-0"
          columns={1}
          copyable
          data={[
            { name: 'id', value: event.id },
            { name: 'traceId', value: event.traceId },
            { name: 'spanId', value: event.spanId },
            ...(event.parentId
              ? [{ name: 'parentId', value: event.parentId }]
              : []),
            ...(event.conversationId
              ? [{ name: 'conversationId', value: event.conversationId }]
              : []),
            ...(event.name ? [{ name: 'name', value: event.name }] : []),
            ...(event.model ? [{ name: 'model', value: event.model }] : []),
            ...(event.provider
              ? [{ name: 'provider', value: event.provider }]
              : []),
            { name: 'inputTokens', value: event.inputTokens },
            { name: 'outputTokens', value: event.outputTokens },
            { name: 'cacheReadTokens', value: event.cacheReadTokens },
            { name: 'cacheWriteTokens', value: event.cacheWriteTokens },
            { name: 'reasoningTokens', value: event.reasoningTokens },
            { name: 'inputCost', value: formatCost(event.inputCost) },
            { name: 'outputCost', value: formatCost(event.outputCost) },
            { name: 'totalCost', value: formatCost(event.totalCost) },
            { name: 'costSource', value: event.costSource },
            { name: 'latencyMs', value: event.latencyMs },
            { name: 'timeToFirstTokenMs', value: event.timeToFirstTokenMs },
            ...(event.stopReason
              ? [{ name: 'stopReason', value: event.stopReason }]
              : []),
            ...(event.modelParameters
              ? [{ name: 'modelParameters', value: event.modelParameters }]
              : []),
            { name: 'profileId', value: event.profileId },
            { name: 'sessionId', value: event.sessionId },
            ...(event.groups.length
              ? [{ name: 'groups', value: event.groups.join(', ') }]
              : []),
            ...Object.entries(event.properties).map(([name, value]) => ({
              name,
              value,
            })),
          ]}
        />
      )}

      {tab === 'raw' && (
        <Syntax
          code={JSON.stringify(event, null, 2)}
          language="json"
          wrapLines
        />
      )}
    </div>
  );
}
