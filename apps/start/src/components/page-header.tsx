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
      <div className={'space-y-1 flex-1'}>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && (
          <p className="text-muted-foreground font-medium">{description}</p>
        )}
        {children}
      </div>
      <div className="row gap-2">{actions}</div>
    </div>
  );
}
