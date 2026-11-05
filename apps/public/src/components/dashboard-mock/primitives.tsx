import { CountUp } from '@/components/count-up';
import { cn } from '@/lib/utils';

// Building blocks that copy the dashboard's own look: uppercase labels,
// mono numbers, blue bars and soft blue area charts.

export function BarSpark({
  values,
  className,
  muted = false,
}: {
  values: number[];
  className?: string;
  muted?: boolean;
}) {
  const max = Math.max(...values);
  return (
    <div className={cn('row h-8 items-end gap-1', className)}>
      {values.map((value, index) => (
        <div
          className={cn(
            'flex-1 rounded-[2px]',
            muted ? 'bg-blue-600/30' : 'bg-blue-600'
          )}
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative bars
          key={index}
          style={{ height: `${Math.max((value / max) * 100, 8)}%` }}
        />
      ))}
    </div>
  );
}

export function StatCard({
  label,
  value,
  unit,
  change,
  negative,
  bars,
  period = 'Last 7 days',
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  change?: string;
  negative?: boolean;
  bars?: number[];
  period?: string;
  className?: string;
}) {
  return (
    <div className={cn('col gap-2 bg-white p-3.5', className)}>
      <div className="row items-start justify-between gap-2">
        <span className="whitespace-nowrap font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
          {label}
        </span>
        {change && (
          <span
            className={cn(
              'whitespace-nowrap font-medium text-[11px]',
              negative ? 'text-red-600' : 'text-emerald-600'
            )}
          >
            {negative ? '↓' : '↑'} {change}
          </span>
        )}
      </div>
      <div className="col">
        <span className="font-mono font-semibold text-[22px] tabular-nums leading-none tracking-tight">
          <CountUp value={value} />
          {unit && (
            <span className="ml-0.5 text-[12px] text-neutral-500">{unit}</span>
          )}
        </span>
        <span className="mt-1 text-[11px] text-neutral-500">{period}</span>
      </div>
      {bars && <BarSpark className="mt-1" values={bars} />}
    </div>
  );
}

function smoothPath(
  points: number[],
  width: number,
  height: number,
  max: number
) {
  const step = width / (points.length - 1);
  const coordinates = points.map((value, index) => ({
    x: index * step,
    y: height - (value / max) * height,
  }));
  let path = `M${coordinates[0].x},${coordinates[0].y}`;
  for (let index = 1; index < coordinates.length; index++) {
    const previous = coordinates[index - 1];
    const current = coordinates[index];
    const controlX = (previous.x + current.x) / 2;
    path += ` C${controlX},${previous.y} ${controlX},${current.y} ${current.x},${current.y}`;
  }
  return { path, coordinates };
}

export function AreaChart({
  primary,
  secondary,
  labels,
  className,
  height = 150,
}: {
  primary: number[];
  secondary?: number[];
  labels?: string[];
  className?: string;
  height?: number;
}) {
  const width = 600;
  // Both lines share one scale, so a lower previous period draws lower.
  const max = Math.max(...primary, ...(secondary ?? [])) * 1.1;
  const main = smoothPath(primary, width, height, max);
  const compare = secondary ? smoothPath(secondary, width, height, max) : null;
  const gridLines = [0.25, 0.5, 0.75];
  return (
    <div className={cn('col gap-2', className)}>
      <svg
        className="w-full"
        preserveAspectRatio="none"
        style={{ height }}
        viewBox={`0 0 ${width} ${height}`}
      >
        <title>Chart</title>
        <defs>
          <linearGradient id="mock-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridLines.map((line) => (
          <line
            key={line}
            stroke="#e5e5e5"
            strokeDasharray="3 4"
            x1="0"
            x2={width}
            y1={height * line}
            y2={height * line}
          />
        ))}
        <path
          d={`${main.path} L${width},${height} L0,${height} Z`}
          fill="url(#mock-area)"
        />
        {compare && (
          <path
            d={compare.path}
            fill="none"
            stroke="#a3a3a3"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          d={main.path}
          fill="none"
          stroke="#2563eb"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
        {main.coordinates.map((point) => (
          <circle
            cx={point.x}
            cy={point.y}
            fill="#2563eb"
            key={point.x}
            r="3"
          />
        ))}
      </svg>
      {labels && (
        <div className="row justify-between text-[11px] text-neutral-500">
          {labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function MockTabs({
  items,
  active = 0,
  className,
}: {
  items: string[];
  active?: number;
  className?: string;
}) {
  return (
    <div className={cn('row gap-4 text-[12px]', className)}>
      {items.map((item, index) => (
        <span
          className={cn(
            'pb-2',
            index === active
              ? 'border-neutral-900 border-b-2 font-medium text-neutral-900'
              : 'text-neutral-500'
          )}
          key={item}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export function MockTable({
  title,
  tabs,
  columns,
  rows,
  className,
}: {
  title?: string;
  tabs?: string[];
  columns: string[];
  rows: { cells: React.ReactNode[]; share?: number }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'col overflow-hidden rounded-lg border border-neutral-200 bg-white',
        className
      )}
    >
      {(tabs || title) && (
        <div className="border-neutral-200 border-b px-3 pt-3">
          {tabs ? (
            <MockTabs items={tabs} />
          ) : (
            <span className="block pb-2 font-medium text-[12px]">{title}</span>
          )}
        </div>
      )}
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-2 font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
        {columns.map((column, index) => (
          <span className={cn(index > 0 && 'text-right')} key={column}>
            {column}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <div
          className="relative grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-2 text-[12px]"
          key={String(row.cells[0])}
        >
          {row.share !== undefined && (
            <div
              className="absolute inset-y-1 left-1 rounded bg-blue-600/8"
              style={{ width: `${row.share}%` }}
            />
          )}
          {row.cells.map((cell, index) => (
            <span
              className={cn(
                'relative',
                index > 0 && 'text-right font-mono text-neutral-600'
              )}
              // biome-ignore lint/suspicious/noArrayIndexKey: static cells
              key={index}
            >
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function Pill({
  children,
  active = false,
  className,
}: {
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'row items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px]',
        active
          ? 'border-neutral-900 bg-neutral-900 text-white'
          : 'border-neutral-200 bg-white text-neutral-700',
        className
      )}
    >
      {children}
    </span>
  );
}

export function Avatar({ initials }: { initials: string }) {
  return (
    <span className="center-center size-6 shrink-0 rounded-full bg-neutral-100 font-medium text-[10px] text-neutral-700">
      {initials}
    </span>
  );
}

// Vertical bars with labels, one or two series, like the Bar chart type.
export function BarChart({
  values,
  secondary,
  labels,
  height = 120,
  className,
}: {
  values: number[];
  secondary?: number[];
  labels?: string[];
  height?: number;
  className?: string;
}) {
  const max = Math.max(...values, ...(secondary ?? [])) * 1.1;
  return (
    <div className={cn('col gap-2', className)}>
      <div className="row items-end gap-1.5" style={{ height }}>
        {values.map((value, index) => (
          <div
            className="row flex-1 items-end gap-0.5"
            // biome-ignore lint/suspicious/noArrayIndexKey: static decorative bars
            key={index}
          >
            <div
              className="flex-1 rounded-t-[3px] bg-blue-600"
              style={{ height: `${Math.max((value / max) * 100, 4)}%` }}
            />
            {secondary && (
              <div
                className="flex-1 rounded-t-[3px] bg-blue-600/30"
                style={{
                  height: `${Math.max(((secondary[index] ?? 0) / max) * 100, 4)}%`,
                }}
              />
            )}
          </div>
        ))}
      </div>
      {labels && (
        <div className="row justify-between text-[11px] text-neutral-500">
          {labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// Cohort-style grid: rows with a label, a size and heat-coloured cells.
export function HeatGrid({
  columns,
  rows,
  rowLabel = 'Cohort',
  sizeLabel = 'Users',
  unit = '%',
  className,
}: {
  columns: string[];
  rows: {
    label: string;
    size?: string;
    values: (number | undefined)[];
    emphasis?: boolean;
  }[];
  rowLabel?: string;
  sizeLabel?: string;
  unit?: string;
  className?: string;
}) {
  const withSize = rows.some((row) => row.size !== undefined);
  return (
    <div
      className={cn('grid gap-1 text-[11px]', className)}
      style={{
        gridTemplateColumns: `minmax(72px,auto) ${withSize ? '48px' : ''} repeat(${columns.length}, minmax(0, 1fr))`,
      }}
    >
      <span className="text-neutral-500">{rowLabel}</span>
      {withSize && <span className="text-neutral-500">{sizeLabel}</span>}
      {columns.map((column) => (
        <span className="truncate text-center text-neutral-500" key={column}>
          {column}
        </span>
      ))}
      {rows.map((row) => (
        <HeatRow
          columns={columns}
          key={row.label}
          row={row}
          unit={unit}
          withSize={withSize}
        />
      ))}
    </div>
  );
}

function HeatRow({
  row,
  columns,
  withSize,
  unit,
}: {
  row: {
    label: string;
    size?: string;
    values: (number | undefined)[];
    emphasis?: boolean;
  };
  columns: string[];
  withSize: boolean;
  unit: string;
}) {
  return (
    <>
      <span
        className={cn(
          'truncate py-1',
          row.emphasis ? 'font-semibold' : 'font-medium'
        )}
      >
        {row.label}
      </span>
      {withSize && (
        <span className="py-1 font-mono text-neutral-600">
          {row.size ?? ''}
        </span>
      )}
      {columns.map((column, index) => {
        const value = row.values[index];
        return (
          <span
            className={cn(
              'center-center rounded py-1 font-mono',
              value === undefined ? 'bg-transparent' : 'text-blue-950',
              row.emphasis && 'font-semibold'
            )}
            key={`${row.label}-${column}`}
            style={
              value === undefined
                ? undefined
                : {
                    backgroundColor: `rgba(37, 99, 235, ${0.08 + (value / 100) * 0.55})`,
                  }
            }
          >
            {value === undefined ? '' : `${value}${unit}`}
          </span>
        );
      })}
    </>
  );
}

// Two-column key/value grid, like the "Session info" and "Profile
// Information" cards.
export function KeyValue({
  items,
  className,
}: {
  items: { key: string; value: React.ReactNode }[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        'grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12px]',
        className
      )}
    >
      {items.map((item) => (
        <div className="contents" key={item.key}>
          <dt className="text-neutral-500">{item.key}</dt>
          <dd className="truncate font-mono text-neutral-800">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Toggle({ on = true, label }: { on?: boolean; label?: string }) {
  return (
    <span className="row items-center gap-2 text-[12px]">
      <span
        className={cn(
          'relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors',
          on ? 'bg-neutral-900' : 'bg-neutral-300'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-3 rounded-full bg-white shadow',
            on ? 'left-3.5' : 'left-0.5'
          )}
        />
      </span>
      {label && <span className="text-neutral-700">{label}</span>}
    </span>
  );
}

const TONE_CLASSES = {
  neutral: 'bg-neutral-100 text-neutral-700',
  blue: 'bg-blue-50 text-blue-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-700',
} as const;

export function MockBadge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONE_CLASSES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-[10.5px]',
        TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

// An active filter, as the toolbar shows it: "Country is Sweden ×".
export function FilterChip({
  field,
  operator = 'is',
  value,
}: {
  field: string;
  operator?: string;
  value: string;
}) {
  return (
    <span className="row items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11.5px]">
      <span className="text-neutral-500">{field}</span>
      <span className="text-neutral-400">{operator}</span>
      <span className="font-medium">{value}</span>
      <span className="ml-0.5 text-neutral-400">×</span>
    </span>
  );
}

// A white panel with a small heading, the card every dashboard page is made of.
export function Panel({
  title,
  action,
  children,
  className,
  padded = true,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        'col overflow-hidden rounded-lg border border-neutral-200 bg-white',
        padded && 'gap-3 p-4',
        className
      )}
    >
      {title && (
        <div
          className={cn(
            'row items-center justify-between',
            !padded && 'px-3 pt-3'
          )}
        >
          <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
            {title}
          </span>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
