import { cn } from '@/utils/cn';

interface StickyBelowHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function StickyBelowHeader({
  children,
  className,
}: StickyBelowHeaderProps) {
  return (
    <div
      className={cn(
        'md:sticky bg-white border-b border-border z-20 [[id=dashboard]_&]:top-16 [[id=dashboard]_&]:rounded-none rounded-lg top-0',
        className
      )}
    >
      {children}
    </div>
  );
}
