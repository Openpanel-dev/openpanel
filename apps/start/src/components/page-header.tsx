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
    <div className={cn('col md:row gap-2', className)}>
      <div className={'flex-1 space-y-1'}>
        <h1 className="font-semibold text-xl">{title}</h1>
        {description && (
          <p className="font-medium text-base text-muted-foreground">
            {description}
          </p>
        )}
        {children}
      </div>
      <div className="row flex-wrap gap-2">{actions}</div>
    </div>
  );
}
