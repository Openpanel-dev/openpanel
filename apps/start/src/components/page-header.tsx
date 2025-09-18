import { cn } from '@/utils/cn';

interface PageHeaderProps {
  title: React.ReactNode;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  className,
  children,
}: PageHeaderProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description && (
        <p className="text-muted-foreground font-medium">{description}</p>
      )}
      {children}
    </div>
  );
}
