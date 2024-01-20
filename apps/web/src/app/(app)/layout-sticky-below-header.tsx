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
        'md:sticky top-16 bg-white border-b border-border z-10',
        className
      )}
    >
      {children}
    </div>
  );
}
