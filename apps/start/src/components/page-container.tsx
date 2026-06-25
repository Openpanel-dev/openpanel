import { cn } from '@/utils/cn';

interface PageContainerProps {
  className?: string;
  children: React.ReactNode;
  /** Fill full width instead of the capped `container` (e.g. dashboard). */
  fluid?: boolean;
}

export function PageContainer({
  className,
  children,
  fluid,
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn(fluid ? 'w-full p-6' : 'container p-6', className)}
      {...props}
    >
      {children}
    </div>
  );
}
