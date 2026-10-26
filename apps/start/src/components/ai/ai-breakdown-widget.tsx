import type { IAiBreakdownRow } from '@openpanel/core';
import type { AiBreakdownDimension } from '@openpanel/core/modules/ai/ai.constants';
import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { formatCost, formatLatency, formatTokens } from './ai-format';
import { type AiMeasure, breakdownReportDraft } from './ai-report-draft';
import { OpenAsReportLink } from './open-as-report-link';
import { ProjectLink } from '@/components/links';
import {
  WidgetFooter,
  WidgetHead,
  WidgetTitle,
} from '@/components/overview/overview-widget';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { Skeleton } from '@/components/skeleton';
import { Widget, WidgetBody } from '@/components/widget';
import { useAiFilters } from '@/hooks/use-ai-filters';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { getProfileName } from '@/utils/getters';

type Measure = AiMeasure;

const MEASURE_LABEL: Record<Measure, string> = {
  cost: 'Cost',
  generations: 'Generations',
  errors: 'Errors',
  tokens: 'Tokens',
  p95LatencyMs: 'p95',
};

function formatMeasure(measure: Measure, value: number): string {
  switch (measure) {
    case 'cost':
      return formatCost(value);
    case 'p95LatencyMs':
      return formatLatency(value);
    default:
      return formatTokens(value);
  }
}

interface Props {
  projectId: string;
  dimension: AiBreakdownDimension;
  title: string;
  icon?: LucideIcon;
  measure?: Measure;
  secondary?: Measure;
  limit?: number;
  className?: string;
}

const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e'] as const;

const DIMENSION_HEADER: Record<AiBreakdownDimension, string> = {
  model: 'Model',
  provider: 'Provider',
  name: 'Feature',
  profile: 'User',
  conversation: 'Conversation',
  group: 'Group',
  stopReason: 'Stop reason',
  errorCode: 'Error',
};

function RowLabel({
  row,
  dimension,
}: {
  row: IAiBreakdownRow;
  dimension: AiBreakdownDimension;
}) {
  if (dimension === 'profile') {
    const profile = row.profile;
    return (
      <ProjectLink
        className="row min-w-0 items-center gap-2 hover:underline"
        params={{ profileId: row.key }}
        to="/profiles/$profileId"
      >
        <ProfileAvatar size="xs" {...profile} />
        <span className="truncate">
          {profile ? getProfileName(profile, false) : row.key}
        </span>
      </ProjectLink>
    );
  }
  if (dimension === 'group') {
    return (
      <ProjectLink
        className="truncate hover:underline"
        params={{ groupId: row.key }}
        to="/groups/$groupId"
      >
        {row.label}
      </ProjectLink>
    );
  }
  return <span className="truncate">{row.label}</span>;
}

export function AiBreakdownWidget({
  projectId,
  dimension,
  title,
  icon,
  measure = 'cost',
  secondary = 'generations',
  limit,
  className,
}: Props) {
  const trpc = useTRPC();
  const { range, startDate, endDate, interval } = useOverviewOptions();
  const { filters } = useAiFilters();
  const draft = breakdownReportDraft(
    { projectId, range, startDate, endDate, interval, filters },
    { dimension, measure, name: title }
  );
  const query = useQuery(
    trpc.ai.breakdown.queryOptions({
      projectId,
      range,
      startDate,
      endDate,
      filters,
      dimension,
      limit,
    })
  );
  const rows = query.data ?? [];
  const max = Math.max(...rows.map((row) => row[measure]), 0) || 1;

  return (
    <Widget className={cn('col-span-6 md:col-span-3', className)}>
      <WidgetHead className="border-b-0 pb-0">
        <WidgetTitle icon={icon}>{title}</WidgetTitle>
      </WidgetHead>
      <WidgetBody className="p-0">
        <div className="row justify-between px-4 pb-1 font-medium text-3xs text-muted-foreground uppercase tracking-wider">
          <span>{DIMENSION_HEADER[dimension]}</span>
          <span className="row gap-6">
            <span className="w-16 text-right">{MEASURE_LABEL[secondary]}</span>
            <span className="w-16 text-right">{MEASURE_LABEL[measure]}</span>
          </span>
        </div>
        <div className="col gap-0.5 p-1 pt-0">
          {query.isLoading &&
            SKELETON_ROWS.map((row) => (
              <Skeleton className="h-8 w-full" key={row} />
            ))}
          {query.isSuccess && rows.length === 0 && (
            <div className="px-3 py-6 text-center text-muted-foreground text-sm">
              Nothing in this range
            </div>
          )}
          {rows.map((row) => (
            <div className="group relative px-3 py-1.5" key={row.key}>
              <div
                className="absolute top-0 bottom-0 left-0 rounded bg-def-200 transition-colors group-hover:bg-def-300"
                style={{ width: `${(row[measure] / max) * 100}%` }}
              />
              <div className="row relative min-w-0 items-center justify-between gap-2 text-sm">
                <RowLabel dimension={dimension} row={row} />
                <span className="row shrink-0 gap-6 font-mono tabular-nums">
                  <span className="w-16 text-right text-muted-foreground">
                    {formatMeasure(secondary, row[secondary])}
                  </span>
                  <span className="w-16 text-right font-medium">
                    {formatMeasure(measure, row[measure])}
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </WidgetBody>
      {draft && (
        <WidgetFooter>
          <OpenAsReportLink draft={draft} />
        </WidgetFooter>
      )}
    </Widget>
  );
}
