import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { AiEventDetail } from '@/components/ai/ai-event-detail';
import {
  formatCost,
  formatLatency,
  formatTokens,
} from '@/components/ai/ai-format';
import { AiTraceTree, buildTraceNodes } from '@/components/ai/ai-trace-tree';
import { ProfileCell } from '@/components/ai/ai-traces-table';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { ProjectLink } from '@/components/links';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  Widget,
  WidgetBody,
  WidgetHead,
  WidgetTitle,
} from '@/components/widget';
import { useTRPC } from '@/integrations/trpc/react';
import { formatDateTime } from '@/utils/date';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';

const zSearch = z.object({
  /** ISO time near the trace, so the lookup prunes partitions. */
  at: z.string().optional(),
  event: z.string().optional(),
});

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/ai_/traces/$traceId'
)({
  component: Component,
  validateSearch: zSearch,
  loaderDeps: ({ search }) => ({ at: search.at }),
  loader: async ({ context, params, deps }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.ai.trace.queryOptions({
        projectId: params.projectId,
        traceId: params.traceId,
        around: deps.at,
      })
    );
  },
  pendingComponent: FullPageLoadingState,
  head: () => ({ meta: [{ title: createProjectTitle(PAGE_TITLES.AI_TRACE) }] }),
});

function Component() {
  const { projectId, traceId } = Route.useParams();
  const { at } = Route.useSearch();
  const trpc = useTRPC();
  const { data: events } = useSuspenseQuery(
    trpc.ai.trace.queryOptions({ projectId, traceId, around: at })
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { nodes, totalMs } = buildTraceNodes(events);
  const first = nodes[0]?.event;
  const selected = events.find((event) => event.id === selectedId) ?? first;
  const totals = events.reduce(
    (acc, event) => ({
      cost: acc.cost + event.totalCost,
      tokens: acc.tokens + event.inputTokens + event.outputTokens,
      generations: acc.generations + (event.type === 'generation' ? 1 : 0),
      errors: acc.errors + (event.isError ? 1 : 0),
    }),
    { cost: 0, tokens: 0, generations: 0, errors: 0 }
  );
  const root = events.find((event) => event.type === 'trace');
  const name =
    root?.name ||
    events.find((event) => event.type === 'generation' && event.name)?.name ||
    first?.name ||
    'Trace';

  return (
    <PageContainer className="col gap-6">
      <PageHeader title={name}>
        <div className="col gap-2 text-sm">
          <div className="row flex-wrap items-center gap-x-5 gap-y-1">
            {first && (
              <ProfileCell
                deviceId={first.deviceId}
                profile={first.profile}
                profileId={first.profileId}
              />
            )}
            {first && (
              <span className="text-muted-foreground">
                {formatDateTime(first.createdAt)}
              </span>
            )}
            {first?.sessionId && (
              <ProjectLink
                className="text-muted-foreground hover:underline"
                params={{ sessionId: first.sessionId }}
                to="/sessions/$sessionId"
              >
                Open session
              </ProjectLink>
            )}
            {first?.conversationId && (
              <ProjectLink
                className="text-muted-foreground hover:underline"
                search={{ conversation: first.conversationId }}
                to="/ai/traces"
              >
                Conversation
              </ProjectLink>
            )}
          </div>
          <div className="row flex-wrap gap-x-5 gap-y-1 font-mono text-xs tabular-nums">
            <span>{formatLatency(totalMs)}</span>
            <span>{totals.generations} generations</span>
            <span>{formatTokens(totals.tokens)} tokens</span>
            <span>{formatCost(totals.cost)}</span>
            {totals.errors > 0 && (
              <span className="text-destructive">{totals.errors} errors</span>
            )}
          </div>
          <span className="font-mono text-2xs text-muted-foreground">
            {traceId}
          </span>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Widget className="w-full self-start">
          <WidgetHead>
            <WidgetTitle>Timeline</WidgetTitle>
          </WidgetHead>
          <AiTraceTree
            events={events}
            onSelect={setSelectedId}
            selectedId={selected?.id ?? null}
          />
        </Widget>
        <Widget className="w-full self-start">
          <WidgetHead>
            <WidgetTitle>
              {selected?.name || selected?.model || 'Step'}
            </WidgetTitle>
          </WidgetHead>
          <WidgetBody>
            {selected && (
              <AiEventDetail event={selected} showTraceLink={false} />
            )}
          </WidgetBody>
        </Widget>
      </div>
    </PageContainer>
  );
}
