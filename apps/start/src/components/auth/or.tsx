import { cn } from '@/utils/cn';

export function Or({ className }: { className?: string }) {
  return (
    <div className={cn('row items-center gap-4', className)}>
      <div className="h-px w-full bg-def-300" />
      <span className="text-muted-foreground text-sm font-medium px-2">OR</span>
      <div className="h-px w-full bg-def-300" />
    </div>
  );
}
