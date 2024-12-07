import { cn } from '@/utils/cn';
import type { LucideIcon } from 'lucide-react';

export interface WidgetHeadProps {
  children: React.ReactNode;
  className?: string;
}
export function WidgetHead({ children, className }: WidgetHeadProps) {
  return (
    <div
      className={cn(
        'border-b border-border p-4 [&_.title]:whitespace-nowrap [&_.title]:font-semibold [&_.title]:text-lg',
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface WidgetTitleProps {
  children: React.ReactNode;
  className?: string;
  icon?: LucideIcon;
}
export function WidgetTitle({
  children,
  className,
  icon: Icon,
}: WidgetTitleProps) {
  return (
    <div
      className={cn(
        'relative flex items-center gap-4',
        className,
        !!Icon && 'pl-12',
      )}
    >
      {Icon && (
        <div className="absolute left-0 rounded-lg bg-def-200 p-2">
          <Icon size={18} />
        </div>
      )}
      <div className="title">{children}</div>
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
  return <div className={cn('card self-start', className)}>{children}</div>;
}
