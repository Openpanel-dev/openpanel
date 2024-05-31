import { cn } from '@/utils/cn';

interface GradientBackgroundProps {
  children: React.ReactNode;
  className?: string;
}

export function GradientBackground({
  children,
  className,
  ...props
}: GradientBackgroundProps) {
  return (
    <div
      className={cn(
        'from-def-200 rounded-md bg-gradient-to-tr to-white',
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-4 p-4">{children}</div>
    </div>
  );
}
