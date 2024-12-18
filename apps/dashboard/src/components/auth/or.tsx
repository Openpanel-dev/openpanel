import { cn } from '@/utils/cn';

export function Or({ className }: { className?: string }) {
  return (
    <div className={cn('row items-center gap-2', className)}>
      <div className="h-px w-full bg-border" />
      <span className="text-muted-foreground">OR</span>
      <div className="h-px w-full bg-border" />
    </div>
  );
}
