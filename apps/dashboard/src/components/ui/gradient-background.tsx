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
        'bg-gradient-to-tr from-slate-100 to-white rounded-md',
        className
      )}
      {...props}
    >
      <div className="p-4 flex flex-col gap-4">{children}</div>
    </div>
  );
}
