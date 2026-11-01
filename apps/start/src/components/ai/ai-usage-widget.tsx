import type { IAiEntitySummary } from '@openpanel/core';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { BotIcon } from 'lucide-react';
import { formatCost, formatLatency, formatTokens } from './ai-format';
import { ProjectLink } from '@/components/links';
import { WidgetHead, WidgetTitle } from '@/components/overview/overview-widget';
import { Skeleton } from '@/components/skeleton';
import { Badge } from '@/components/ui/badge';
import { Widget, WidgetBody } from '@/components/widget';
import { useTRPC } from '@/integrations/trpc/react';
import { timeAgo } from '@/utils/date';

type Entity =
  | { kind: 'profile'; profileId: string }
  | { kind: 'group'; groupId: string }
  | { kind: 'session'; sessionId: string };

interface Props {
  projectId: string;
  entity: Entity;
  className?: string;
}

function tracesSearch(entity: Entity): Record<string, string> {
  switch (entity.kind) {
    case 'profile':
      return { profile: entity.profileId };
    case 'group':
      return { group: entity.groupId };
    default:
      return { session: entity.sessionId };
  }
}

/** Lifetime AI usage of one profile, group or session; hidden when there is none. */
export function AiUsageWidget({ projectId, entity, className }: Props) {
  switch (entity.kind) {
    case 'profile':
      return (
        <ProfileUsage
          className={className}
          entity={entity}
          projectId={projectId}
        />
      );
    case 'group':
      return (
        <GroupUsage
          className={className}
          entity={entity}
          projectId={projectId}
        />
      );
    default:
      return (
        <SessionUsage
          className={className}
          entity={entity}
          projectId={projectId}
        />
      );
  }
}

function ProfileUsage({
  projectId,
  entity,
  className,
}: Props & { entity: Extract<Entity, { kind: 'profile' }> }) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.ai.profileSummary.queryOptions({
      projectId,
      profileId: entity.profileId,
    })
  );
  return <UsageBody className={className} entity={entity} query={query} />;
}

function GroupUsage({
  projectId,
  entity,
  className,
}: Props & { entity: Extract<Entity, { kind: 'group' }> }) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.ai.groupSummary.queryOptions({ projectId, groupId: entity.groupId })
  );
  return <UsageBody className={className} entity={entity} query={query} />;
}

function SessionUsage({
  projectId,
  entity,
  className,
}: Props & { entity: Extract<Entity, { kind: 'session' }> }) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.ai.sessionSummary.queryOptions({
      projectId,
      sessionId: entity.sessionId,
    })
  );
  return <UsageBody className={className} entity={entity} query={query} />;
}

function UsageBody({
  query,
  entity,
  className,
}: {
  query: UseQueryResult<IAiEntitySummary, unknown>;
  entity: Entity;
  className?: string;
}) {
  const data = query.data;

  if (query.isSuccess && (!data || data.generations === 0)) {
    return null;
  }

  const stats = data
    ? [
        { label: 'Generations', value: formatTokens(data.generations) },
        { label: 'Cost', value: formatCost(data.cost) },
        {
          label: 'Tokens',
          value: formatTokens(data.inputTokens + data.outputTokens),
        },
        { label: 'Avg latency', value: formatLatency(data.avgLatencyMs) },
        { label: 'Errors', value: formatTokens(data.errors) },
        { label: 'Last call', value: data.lastAt ? timeAgo(data.lastAt) : '—' },
      ]
    : [];

  return (
    <Widget className={className}>
      <WidgetHead>
        <WidgetTitle icon={BotIcon}>AI usage</WidgetTitle>
      </WidgetHead>
      <WidgetBody className="col gap-3">
        {query.isLoading && <Skeleton className="h-16 w-full" />}
        {data && (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {stats.map((stat) => (
                <div className="col gap-0.5" key={stat.label}>
                  <dt className="text-muted-foreground text-xs">
                    {stat.label}
                  </dt>
                  <dd className="font-medium font-mono tabular-nums">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
            {data.topModels.length > 0 && (
              <div className="row flex-wrap gap-1">
                {data.topModels.map((model) => (
                  <Badge
                    className="max-w-full truncate"
                    key={model}
                    variant="secondary"
                  >
                    {model}
                  </Badge>
                ))}
              </div>
            )}
            <ProjectLink
              className="text-muted-foreground text-sm hover:underline"
              search={tracesSearch(entity)}
              to="/ai/traces"
            >
              View traces →
            </ProjectLink>
          </>
        )}
      </WidgetBody>
    </Widget>
  );
}
