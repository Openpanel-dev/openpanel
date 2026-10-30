import { cn } from '@/lib/utils';

// Every homepage illustration sits on the same soft panel so they read as one set.
export function IllustrationPanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex items-center justify-center rounded-3xl border bg-muted/50 p-6 md:p-10',
        className
      )}
    >
      {children}
    </div>
  );
}

export function IllustrationCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'col w-full gap-5 rounded-2xl border bg-background p-5 shadow-black/5 shadow-xl md:p-6',
        className
      )}
    >
      {children}
    </div>
  );
}

export function Sparkline({
  points,
  className,
  stroke = 'stroke-blue-600',
  fill = 'fill-blue-600/10',
}: {
  points: number[];
  className?: string;
  stroke?: string;
  fill?: string;
}) {
  const width = 100;
  const height = 40;
  const max = Math.max(...points);
  const step = width / (points.length - 1);
  const coordinates = points.map((value, index) => {
    const x = index * step;
    const y = height - (value / max) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const line = `M${coordinates.join(' L')}`;
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg
      className={cn('h-full w-full', className)}
      preserveAspectRatio="none"
      viewBox={`0 0 ${width} ${height}`}
    >
      <path className={fill} d={area} />
      <path
        className={stroke}
        d={line}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Stat({
  label,
  value,
  change,
  negative,
}: {
  label: string;
  value: string;
  change?: string;
  negative?: boolean;
}) {
  return (
    <div className="col gap-1">
      <span className="text-muted-foreground text-sm">{label}</span>
      <div className="row items-baseline gap-2">
        <span className="font-semibold text-2xl tracking-tight">{value}</span>
        {change && (
          <span
            className={cn(
              'font-medium text-sm',
              negative ? 'text-red-600' : 'text-emerald-600'
            )}
          >
            {change}
          </span>
        )}
      </div>
    </div>
  );
}

export function Bar({
  label,
  value,
  share,
  className,
}: {
  label: string;
  value: string;
  share: number;
  className?: string;
}) {
  return (
    <div className="row relative items-center justify-between overflow-hidden rounded-lg px-3 py-2 text-sm">
      <div
        className={cn('absolute inset-y-0 left-0 bg-blue-600/10', className)}
        style={{ width: `${share}%` }}
      />
      <span className="relative font-medium">{label}</span>
      <span className="relative text-muted-foreground">{value}</span>
    </div>
  );
}
