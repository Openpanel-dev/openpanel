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
        className={cn(
          'grid overflow-hidden rounded border bg-background @xl:grid-cols-3 @4xl:grid-cols-6',
          className
        )}
        {...props}
      />
    </div>
  );
}

export function StatsCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="col gap-2 p-4 ring-[0.5px] ring-border">
      <div className="text-muted-foreground">{title}</div>
      <div className="truncate font-mono text-2xl font-bold">{value}</div>
    </div>
  );
}
