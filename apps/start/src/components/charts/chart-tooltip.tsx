import { cn } from '@/utils/cn';

export const ChartTooltipContainer = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        'col min-w-[180px] gap-2 rounded-xl border bg-background/80 p-3 shadow-xl backdrop-blur-sm',
        className
      )}
    >
      {children}
    </div>
  );
};

export const ChartTooltipHeader = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return <div className="flex justify-between gap-8">{children}</div>;
};

export const ChartTooltipItem = ({
  children,
  color,
  className,
  innerClassName,
}: {
  children: React.ReactNode;
  color: string;
  className?: string;
  innerClassName?: string;
}) => {
  return (
    <div className={cn('flex gap-2', className)}>
      <div className="w-[3px] rounded-full" style={{ background: color }} />
      <div className={cn('col flex-1 gap-1', innerClassName)}>{children}</div>
    </div>
  );
};
