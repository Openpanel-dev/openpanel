import { useMemo } from 'react';
import { getPreviousMetric } from '../../../utils/previous-metric';
import { useChartChrome } from '../common/chart-size';
import { PreviousDiffIndicatorPure } from '../common/previous-diff-indicator';
import { SerieIcon } from '../common/serie-icon';
import { SerieName } from '../common/serie-name';
import { useReportChartContext } from '../context';
import { Bar } from '@/components/charts/bar';
import { BarChart } from '@/components/charts/bar-chart';
import { BarXAxis } from '@/components/charts/bar-x-axis';
import { FunnelChart } from '@/components/charts/funnel-chart';
import { Grid } from '@/components/charts/grid';
import {
  OPChartTooltip,
  type OPTooltipRow,
} from '@/components/charts/op-tooltip';
import { YAxis } from '@/components/charts/y-axis';
import { fancyMinutes, useNumber } from '@/hooks/use-numer-formatter';
import type { RouterOutputs } from '@/trpc/client';
import { getChartColor } from '@/utils/theme';

type FunnelData = RouterOutputs['chart']['funnel'];
type Funnel = FunnelData['current'][number];

const BREAKDOWN_BAR_GAP = 0.25;

export function Chart({
  data,
  visibleBreakdowns,
}: {
  data: FunnelData;
  visibleBreakdowns: Funnel[];
}) {
  const { layout } = useReportChartContext();
  const hasBreakdowns = data.current.length > 1;
  const funnel = data.current[0];
  const content = (
    <>
      {hasBreakdowns && (
        <BreakdownBars data={data} visibleBreakdowns={visibleBreakdowns} />
      )}
      {!hasBreakdowns && funnel && (
        <SingleFunnel funnel={funnel} previous={data.previous?.[0] ?? null} />
      )}
    </>
  );

  if (layout === 'fill') {
    return (
      <div className="h-full w-full" data-report-chart="funnel">
        {content}
      </div>
    );
  }

  // Safari does not resolve `h-full` against an `aspect-video` height, so the
  // funnel needs an absolute layer to get a definite height to fill.
  return (
    <div
      className="card relative aspect-video max-h-[250px] w-full"
      data-report-chart="funnel"
    >
      <div className="absolute inset-4">{content}</div>
    </div>
  );
}

function SingleFunnel({
  funnel,
  previous,
}: {
  funnel: Funnel;
  previous: Funnel | null;
}) {
  const number = useNumber();
  const stages = funnel.steps.map((step) => ({
    label: step.event.displayName,
    value: step.count,
  }));
  const conversion = funnel.lastStep.percent;
  const previousConversion = previous?.lastStep.percent;
  const comparison =
    previousConversion == null
      ? null
      : getPreviousMetric(conversion, previousConversion);

  return (
    <div className="col h-full gap-2">
      <div className="min-h-0 flex-1">
        <FunnelChart
          className="h-full"
          color={getChartColor(0)}
          data={stages}
          formatValue={number.short}
          grid={{ bands: true, lines: false }}
        />
      </div>
      {comparison && previousConversion != null && (
        <div className="flex shrink-0 items-center justify-center gap-2 text-muted-foreground text-sm">
          <span>
            Conversion{' '}
            <span className="font-semibold text-foreground tabular-nums">
              {number.formatWithUnit(conversion / 100, '%')}
            </span>
          </span>
          <span>
            previous{' '}
            <span className="tabular-nums">
              {number.formatWithUnit(previousConversion / 100, '%')}
            </span>
          </span>
          <PreviousDiffIndicatorPure {...comparison} size="xs" />
        </div>
      )}
    </div>
  );
}

function BreakdownBars({
  data,
  visibleBreakdowns,
}: {
  data: FunnelData;
  visibleBreakdowns: Funnel[];
}) {
  const number = useNumber();
  const chrome = useChartChrome();
  const breakdowns = useMemo(
    () =>
      visibleBreakdowns.map((breakdown, visibleIndex) => {
        const index = data.current.findIndex(
          (item) => item.id === breakdown.id
        );
        return {
          funnel: breakdown,
          key: `breakdown:${visibleIndex}`,
          color: getChartColor(index >= 0 ? index : visibleIndex),
          names: breakdown.breakdowns?.length
            ? breakdown.breakdowns
            : ['Funnel'],
        };
      }),
    [data.current, visibleBreakdowns]
  );

  const rows = useMemo(
    () =>
      (data.current[0]?.steps ?? []).map((step, stepIndex) => {
        const row: Record<string, unknown> = { name: step.event.displayName };
        for (const breakdown of breakdowns) {
          row[breakdown.key] = breakdown.funnel.steps[stepIndex]?.percent ?? 0;
        }
        row.stepIndex = stepIndex;
        return row;
      }),
    [data.current, breakdowns]
  );

  const tooltipRows = (row: Record<string, unknown>): OPTooltipRow[] =>
    breakdowns.map((breakdown) => {
      const step = breakdown.funnel.steps[row.stepIndex as number];
      return {
        color: breakdown.color,
        icon: <SerieIcon name={breakdown.names} />,
        label: <SerieName name={breakdown.names} />,
        value: step?.percent ?? 0,
        format: (value) => number.formatWithUnit(value / 100, '%'),
        sub: [
          { label: 'Count', value: step?.count ?? 0 },
          ...(step?.timeToConvert == null
            ? []
            : [
                {
                  label: 'Time to convert',
                  value: fancyMinutes(step.timeToConvert),
                },
              ]),
        ],
      };
    });

  return (
    <div className="col h-full">
      <div className="min-h-0 flex-1">
        <BarChart
          animationDuration={0}
          aspectRatio="auto"
          barGap={BREAKDOWN_BAR_GAP}
          className="h-full"
          data={rows}
          margin={chrome.margin}
          xDataKey="name"
        >
          <Grid horizontal />
          {chrome.showYAxis && <YAxis formatValue={(value) => `${value}%`} />}
          {chrome.showXAxis && <BarXAxis />}
          {breakdowns.map((breakdown) => (
            <Bar
              animate={false}
              dataKey={breakdown.key}
              fill={breakdown.color}
              key={breakdown.key}
              lineCap={4}
            />
          ))}
          <OPChartTooltip
            rows={tooltipRows}
            title={(row) => String(row.name)}
          />
        </BarChart>
      </div>
      {breakdowns.length > 1 && chrome.legendLimit > 0 && (
        <div className="flex shrink-0 flex-wrap justify-center gap-x-4 gap-y-1 pt-2 text-xs">
          {breakdowns.slice(0, chrome.legendLimit).map((breakdown) => (
            <div
              className="flex items-center gap-1"
              key={breakdown.key}
              style={{ color: breakdown.color }}
            >
              <SerieIcon name={breakdown.names} />
              <SerieName className="font-semibold" name={breakdown.names} />
            </div>
          ))}
          {breakdowns.length > chrome.legendLimit && (
            <div className="text-muted-foreground">
              +{breakdowns.length - chrome.legendLimit} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}
