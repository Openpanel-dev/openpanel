import type { IServiceOrganization } from '@openpanel/core';
import { round } from '@openpanel/shared';
import { useQuery } from '@tanstack/react-query';
import { Loader2Icon, XIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ComposedChart } from '@/components/charts/composed-chart';
import { Grid } from '@/components/charts/grid';
import { OPChartTooltip } from '@/components/charts/op-tooltip';
import { PieCenter } from '@/components/charts/pie-center';
import { DEFAULT_HOVER_OFFSET, PieChart } from '@/components/charts/pie-chart';
import { PieSlice } from '@/components/charts/pie-slice';
import { SeriesBar } from '@/components/charts/series-bar';
import { XAxis } from '@/components/charts/x-axis';
import { YAxis } from '@/components/charts/y-axis';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { formatDateInterval } from '@/hooks/use-format-date-interval';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/date';
import { getChartColor } from '@/utils/theme';

const MARGIN = { top: 12, right: 12, bottom: 28, left: 40 };
const BAR_RADIUS = 3;
const MAX_BAR_SIZE = 14;
// Room between stacked segments so each project reads as its own block.
const STACK_GAP = 1;
const DONUT_HOLE = 0.62;
const PAD_ANGLE = 0.02;
const CORNER_RADIUS = 3;
const PIE_SIZE = 200;
const OTHER_LABEL = 'Other';
const OTHER_COLOR = 'var(--chart-foreground-muted)';

interface Props {
  organization: IServiceOrganization;
}

interface UsagePoint {
  [key: string]: unknown;
  date: number;
  total: number;
}

interface Slice {
  id?: string;
  label: string;
  value: number;
  share: number;
  color: string;
}

function formatDayLabel(date: Date) {
  return formatDateInterval({ interval: 'day', date, short: true });
}

function toSlices(
  rows: { id?: string; label: string; value: number; color: string }[],
  total: number
): Slice[] {
  return rows
    .filter((row) => row.value > 0)
    .map((row) => ({
      ...row,
      share: total ? round((row.value / total) * 100, 1) : 0,
    }));
}

function SliceRow({ slice }: { slice: Slice }) {
  const number = useNumber();
  return (
    <>
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ background: slice.color }}
      />
      <span className="min-w-0 flex-1 truncate">{slice.label}</span>
      <span className="font-semibold tabular-nums">
        {number.short(slice.value)}
      </span>
      <span className="w-12 text-right text-muted-foreground tabular-nums">
        {slice.share}%
      </span>
    </>
  );
}

const SLICE_ROW_CLASS =
  'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left';

// The donut's legend highlights slices on hover; the project legend selects
// a project to filter the donut by.
function SliceLegend({
  slices,
  hoveredIndex = null,
  onHover,
  selectedIndex = null,
  onSelect,
}: {
  slices: Slice[];
  hoveredIndex?: number | null;
  onHover?: (index: number | null) => void;
  selectedIndex?: number | null;
  onSelect?: (index: number | null) => void;
}) {
  return (
    <ul className="col gap-0.5">
      {slices.map((slice, index) => {
        const isSelected = selectedIndex === index;
        const isFaded = hoveredIndex !== null && hoveredIndex !== index;
        return (
          <li key={slice.label}>
            <button
              aria-pressed={onSelect ? isSelected : undefined}
              className={cn(
                SLICE_ROW_CLASS,
                'transition-opacity hover:bg-def-100',
                isFaded && 'opacity-50',
                isSelected && 'bg-def-100 font-medium'
              )}
              onBlur={() => onHover?.(null)}
              onClick={() => onSelect?.(isSelected ? null : index)}
              onFocus={() => onHover?.(index)}
              onMouseEnter={() => onHover?.(index)}
              onMouseLeave={() => onHover?.(null)}
              type="button"
            >
              <SliceRow slice={slice} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function UsageWidget({
  title,
  subtitle,
  aside,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Widget className={cn('w-full', className)}>
      <WidgetHead className="row items-start justify-between gap-4">
        <div className="col min-w-0 gap-0.5">
          <span className="title">{title}</span>
          {subtitle && (
            <span className="text-muted-foreground text-sm">{subtitle}</span>
          )}
        </div>
        {aside}
      </WidgetHead>
      <WidgetBody>{children}</WidgetBody>
    </Widget>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return <div className="center-center p-8 font-medium">{children}</div>;
}

export default function BillingUsage({ organization }: Props) {
  const number = useNumber();
  const trpc = useTRPC();
  const usageQuery = useQuery(
    trpc.subscription.usage.queryOptions({ organizationId: organization.id })
  );
  const usage = usageQuery.data;

  const [hoveredName, setHoveredName] = useState<number | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const selectProject = (projectId: string | null) => {
    setSelectedProjectId(projectId);
    setHoveredName(null);
  };

  const projects = useMemo(
    () =>
      (usage?.projects ?? []).map((project, index) => ({
        ...project,
        color: getChartColor(index),
        total: usage?.projectTotals[project.id] ?? 0,
      })),
    [usage]
  );
  const total = projects.reduce((sum, project) => sum + project.total, 0);

  const chartData = useMemo<UsagePoint[]>(
    () =>
      (usage?.days ?? []).map((row) => ({
        date: new Date(`${row.day}T00:00:00`).getTime(),
        total: Object.values(row.counts).reduce((sum, n) => sum + n, 0),
        ...row.counts,
      })),
    [usage]
  );

  const projectSlices = useMemo(
    () =>
      toSlices(
        projects.map((project) => ({
          id: project.id,
          label: project.name,
          value: project.total,
          color: project.color,
        })),
        total
      ),
    [projects, total]
  );

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? null;
  const namesTotal = selectedProject ? selectedProject.total : total;
  const nameSlices = useMemo(() => {
    const rows = selectedProject
      ? (usage?.eventNamesByProject[selectedProject.id] ?? [])
      : (usage?.eventNames ?? []);
    const named = rows.map((row, index) => ({
      label: row.name,
      value: row.count,
      color: getChartColor(index),
    }));
    const namedTotal = named.reduce((sum, row) => sum + row.value, 0);
    return toSlices(
      [
        ...named,
        {
          label: OTHER_LABEL,
          value: namesTotal - namedTotal,
          color: OTHER_COLOR,
        },
      ],
      namesTotal
    );
  }, [usage, selectedProject, namesTotal]);

  const windowLabel = (() => {
    if (!usage) {
      return undefined;
    }
    const range = `${formatDate(new Date(`${usage.from}T00:00:00`))} – ${formatDate(new Date(`${usage.to}T00:00:00`))}`;
    const kind =
      usage.window === 'billing_period'
        ? 'Current billing period'
        : 'Last 30 days';
    return `${kind} · ${range}`;
  })();

  const renderState = () => {
    if (usageQuery.isLoading) {
      return (
        <div className="center-center p-8">
          <Loader2Icon className="animate-spin" />
        </div>
      );
    }
    if (usageQuery.isError) {
      return <Message>Issues loading usage data</Message>;
    }
    if (total === 0) {
      return <Message>No events in this period</Message>;
    }
    return null;
  };
  const state = renderState();

  if (state) {
    return <UsageWidget title="Usage">{state}</UsageWidget>;
  }

  const innerRadius = (PIE_SIZE / 2 - DEFAULT_HOVER_OFFSET) * DONUT_HOLE;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <UsageWidget
        className="lg:col-span-2"
        subtitle={windowLabel}
        title="Events per project"
      >
        <ComposedChart
          animationDuration={0}
          aspectRatio="auto"
          className="h-[260px]"
          data={chartData}
          formatDateLabel={formatDayLabel}
          margin={MARGIN}
          maxBarSize={MAX_BAR_SIZE}
          stacked
          stackGap={STACK_GAP}
          xDataKey="date"
        >
          <Grid horizontal />
          <YAxis formatValue={number.short} />
          <XAxis />
          {projects.map((project) => (
            <SeriesBar
              animate={false}
              dataKey={project.id}
              fill={project.color}
              key={project.id}
              radius={BAR_RADIUS}
            />
          ))}
          <OPChartTooltip<UsagePoint>
            interval="day"
            rows={(point) => [
              ...projects
                .map((project) => ({
                  color: project.color,
                  label: project.name,
                  value: Number(point[project.id] ?? 0),
                  format: number.format,
                }))
                .filter((row) => row.value > 0),
              {
                color: 'transparent',
                label: 'Total',
                value: point.total,
                format: number.format,
              },
            ]}
            showCrosshair={false}
            showDots={false}
            title={(point) => formatDate(new Date(point.date))}
          />
        </ComposedChart>
        <div className="mt-4 border-t pt-4">
          <SliceLegend
            onSelect={(index) =>
              selectProject(
                index === null ? null : (projectSlices[index]?.id ?? null)
              )
            }
            selectedIndex={
              selectedProject
                ? projectSlices.findIndex(
                    (slice) => slice.id === selectedProject.id
                  )
                : null
            }
            slices={projectSlices}
          />
        </div>
      </UsageWidget>

      <UsageWidget
        aside={
          selectedProject && (
            <Button
              onClick={() => selectProject(null)}
              size="sm"
              variant="outline"
            >
              All projects
              <XIcon className="ml-1 size-3.5" />
            </Button>
          )
        }
        subtitle={
          windowLabel &&
          `${selectedProject?.name ?? 'All projects'} · ${windowLabel}`
        }
        title="Events by name"
      >
        <div className="col items-center gap-4">
          <PieChart
            cornerRadius={CORNER_RADIUS}
            data={nameSlices}
            hoveredIndex={hoveredName}
            innerRadius={innerRadius}
            onHoverChange={setHoveredName}
            padAngle={PAD_ANGLE}
            size={PIE_SIZE}
          >
            {nameSlices.map((slice, index) => (
              <PieSlice animate={false} index={index} key={slice.label} />
            ))}
            <PieCenter>
              {({ value, isHovered }) => {
                const slice =
                  hoveredName === null ? null : nameSlices[hoveredName];
                return (
                  <div className="col max-w-[80%] items-center text-center">
                    <div className="font-semibold text-lg tabular-nums">
                      {number.short(value)}
                    </div>
                    <div className="w-full truncate text-muted-foreground text-xs">
                      {isHovered && slice ? `${slice.share}%` : 'Total'}
                    </div>
                  </div>
                );
              }}
            </PieCenter>
          </PieChart>
          <div className="w-full">
            <SliceLegend
              hoveredIndex={hoveredName}
              onHover={setHoveredName}
              slices={nameSlices}
            />
          </div>
        </div>
      </UsageWidget>
    </div>
  );
}
