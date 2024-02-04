import { cn } from '@/utils/cn';

export interface WidgetHeadProps {
  children: React.ReactNode;
  className?: string;
}
export function WidgetHead({ children, className }: WidgetHeadProps) {
  return (
    <div
      className={cn(
        'p-4 border-b border-border [&_.title]:font-medium',
        className
      )}
    >
      {children}
    </div>
  );
}

export interface WidgetBodyProps {
  children: React.ReactNode;
  className?: string;
}
export function WidgetBody({ children, className }: WidgetBodyProps) {
  return <div className={cn('p-4', className)}>{children}</div>;
}

export interface WidgetProps {
  children: React.ReactNode;
  className?: string;
}
export function Widget({ children, className }: WidgetProps) {
  return (
    <div
      className={cn(
        'border border-border rounded-md bg-white self-start',
        className
      )}
    >
      {children}
    </div>
  );
}
