import { DeltaChip } from '@/components/delta-chip';
import { ReportChart } from '@/components/report-chart';
import { Badge } from '@/components/ui/badge';
import { SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import type { IReportInput } from '@openpanel/validation';
import { useMutation } from '@tanstack/react-query';
import { SparklesIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

type Insight = RouterOutputs['insight']['list'][number];
type Explanation = RouterOutputs['insight']['explain'];

function formatWindow(windowKind: string): string {
  switch (windowKind) {
    case 'yesterday':
      return 'Yesterday';
    case 'rolling_7d':
      return '7 Days';
    case 'rolling_30d':
      return '30 Days';
  }
  return windowKind;
}

function SeverityDot({ band }: { band: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          band === 'severe'
            ? 'bg-red-500'
            : band === 'moderate'
              ? 'bg-yellow-500'
              : 'bg-blue-500',
        )}
      />
      <span className="text-muted-foreground text-xs capitalize">{band}</span>
    </span>
  );
}

/**
 * Build a report config for the insight's dimension so we render the same chart
 * the dashboard uses — filter `screen_view` to the insight's dimension, count
 * sessions or pageviews per the primary metric, previous period overlaid. Chart
 * window stays close to the insight's own window.
 */
function buildInsightReport(insight: Insight): IReportInput | null {
  const filters = (insight.payload?.dimensions ?? [])
    .filter((d) => d.value)
    .map((d) => ({
      name: d.key,
      operator: 'is' as const,
      value: [d.value],
    }));
  if (filters.length === 0) return null;

  const range = insight.windowKind === 'yesterday' ? '7d' : '30d';

  return {
    projectId: insight.projectId,
    chartType: 'linear',
    interval: 'day',
    range,
    previous: true,
    metric: 'sum',
    breakdowns: [],
    series: [
      {
        type: 'event',
        id: 'A',
        name: 'screen_view',
        displayName: insight.displayName || insight.title,
        segment:
          insight.payload?.primaryMetric === 'sessions' ? 'session' : 'event',
        filters,
      },
    ],
  };
}

/**
 * Phase 5: the insight detail sheet — the full insight, its primary metric, a
 * trend chart, and the on-demand AI "why" explanation. Opened via
 * `pushModal('InsightDetails', { insight })`; the explanation is fetched once
 * on open.
 */
export default function InsightDetails({ insight }: { insight: Insight }) {
  const trpc = useTRPC();
  const [explanation, setExplanation] = useState<Explanation>(null);

  const mutation = useMutation(
    trpc.insight.explain.mutationOptions({
      onSuccess: (data) => setExplanation(data),
    }),
  );

  // Fetch the explanation once when the sheet opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    mutation.mutate({ insightId: insight.id });
  }, []);

  // Primary metric (mirrors the card's selection).
  const metrics = Object.entries(insight.payload?.metrics ?? {});
  const primaryKey = insight.payload?.primaryMetric;
  const primary =
    metrics.find(([k]) => k === primaryKey)?.[1] ?? metrics[0]?.[1];
  const isRatio = primary?.unit === 'ratio';
  const fmt = (v?: number | null) =>
    v == null
      ? '-'
      : isRatio
        ? `${(v * 100).toFixed(1)}%`
        : Math.round(v).toLocaleString();
  const deltaText = isRatio
    ? `${Math.abs((primary?.delta ?? 0) * 100).toFixed(1)}pp`
    : `${Math.abs((primary?.changePct ?? 0) * 100).toFixed(1)}%`;
  const direction = primary?.direction ?? 'flat';
  const report = buildInsightReport(insight);

  return (
    <SheetContent className="gap-6 sm:max-w-md">
      <SheetHeader>
        <div className="flex flex-col gap-2 pr-8">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{formatWindow(insight.windowKind)}</Badge>
            {insight.severityBand && <SeverityDot band={insight.severityBand} />}
          </div>
          <SheetTitle className="text-lg leading-snug">
            {insight.displayName || insight.title}
          </SheetTitle>
        </div>
      </SheetHeader>

      {insight.aiSummary && (
        <p className="text-muted-foreground leading-normal">
          {insight.aiSummary}
        </p>
      )}

      {primary && (
        <div className="flex items-end justify-between gap-3 rounded-md border p-4">
          <div>
            <div className="mb-1 text-muted-foreground text-xs capitalize">
              {primaryKey}
            </div>
            <div className="font-semibold text-2xl tracking-tight">
              {fmt(primary.current)}
            </div>
            {primary.compare != null && (
              <div className="text-muted-foreground text-xs">
                vs {fmt(primary.compare)}
              </div>
            )}
          </div>
          <DeltaChip
            size="sm"
            variant={
              direction === 'up' ? 'inc' : direction === 'down' ? 'dec' : 'default'
            }
          >
            {deltaText}
          </DeltaChip>
        </div>
      )}

      {report && (
        <div className="rounded-md border p-3">
          <ReportChart
            lazy={false}
            options={{ hideLegend: true, minHeight: 160, maxHeight: 220 }}
            report={report}
          />
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center gap-2 font-medium text-sm">
          <SparklesIcon className="size-4" /> Why did this happen?
        </div>

        {mutation.isPending && (
          <p className="text-muted-foreground text-sm">Analyzing…</p>
        )}

        {explanation && (
          <div className="flex flex-col gap-3 text-sm leading-normal">
            <p>{explanation.summary}</p>
            {explanation.drivers.length > 0 && (
              <ul className="flex flex-col gap-2">
                {explanation.drivers.map((d) => (
                  <li key={d.label}>
                    <span className="font-medium">{d.label}:</span>{' '}
                    <span className="text-muted-foreground">{d.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            {explanation.relatedReference && (
              <p className="text-muted-foreground">
                Possibly related: {explanation.relatedReference}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
              Confidence: {explanation.confidence}
            </p>
          </div>
        )}

        {!mutation.isPending && mutation.isSuccess && !explanation && (
          <p className="text-muted-foreground text-sm">
            Couldn't generate an explanation for this one.
          </p>
        )}
      </div>
    </SheetContent>
  );
}
