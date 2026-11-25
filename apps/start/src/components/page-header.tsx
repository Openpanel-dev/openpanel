import { cn } from '@/utils/cn';

interface PageHeaderProps {
  title: React.ReactNode;
  description?: string;
  className?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  className,
  children,
  actions,
}: PageHeaderProps) {
  return (
    <div className={cn('col md:row gap-2 md:flex-wrap', className)}>
      <div className="flex-1 space-y-1 md:min-w-64">
        <h1 className="font-semibold text-xl">{title}</h1>
        {description && (
          <p className="font-medium text-base text-muted-foreground">
            {description}
          </p>
        )}
        {children}
      </div>
      <div className="row flex-wrap items-center gap-2 md:self-start">
        {actions}
      </div>
    </div>
  );
}
