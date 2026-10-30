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

function smoothPath(points: number[], width: number, height: number) {
  const max = Math.max(...points) * 1.1;
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
  const main = smoothPath(primary, width, height);
  const compare = secondary ? smoothPath(secondary, width, height) : null;
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
