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
  className,
  size = 'default',
}: {
  title: string;
  value: React.ReactNode;
  enhancer?: React.ReactNode;
  className?: string;
  size?: 'default' | 'sm';
}) {
  return (
    <div
      className={cn(
        'col ring-[0.5px] ring-border',
        size === 'sm' ? 'gap-1 p-3' : 'gap-2 p-4',
        className,
      )}
    >
      <div
        className={cn(
          'text-muted-foreground',
          size === 'sm' ? 'text-xs' : 'text-sm',
        )}
      >
        {title}
      </div>
      <div className="row justify-between gap-4">
        <div
          className={cn(
            'font-mono leading-snug',
            size === 'sm' ? 'text-sm font-medium' : 'text-lg font-bold',
          )}
        >
          {value}
        </div>
        <div>{enhancer}</div>
      </div>
    </div>
  );
}
