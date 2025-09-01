import { cn } from '@/utils/cn';

export function Stats({
  className,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="@container">
      <div
        className={cn('overflow-hidden rounded border bg-card', className)}
        {...props}
      />
    </div>
  );
}

export function StatsCard({
  title,
  value,
  enhancer,
}: { title: string; value: React.ReactNode; enhancer?: React.ReactNode }) {
  return (
    <div className="col gap-2 p-4 ring-[0.5px] ring-border">
      <div className="text-muted-foreground text-sm">{title}</div>
      <div className="row justify-between gap-4">
        <div className="font-mono text-lg font-bold leading-snug">{value}</div>
        <div>{enhancer}</div>
      </div>
    </div>
  );
}
