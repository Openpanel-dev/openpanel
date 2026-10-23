import { cn } from '@/utils/cn';

export function Or({
  className,
  children = 'or',
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('row items-center gap-4', className)} role="separator">
      <div className="h-px flex-1 bg-border" />
      <span className="text-muted-foreground text-sm">{children}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
