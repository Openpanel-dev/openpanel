import { cn } from '@/utils/cn';

interface PageContainerProps {
  className?: string;
  children: React.ReactNode;
}

export function PageContainer({
  className,
  children,
  ...props
}: PageContainerProps) {
  return (
    <div className={cn('container p-8', className)} {...props}>
      {children}
    </div>
  );
}
