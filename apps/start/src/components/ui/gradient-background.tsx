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
        'rounded-md bg-gradient-to-tr from-def-200 to-white',
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-4 p-4">{children}</div>
    </div>
  );
}
