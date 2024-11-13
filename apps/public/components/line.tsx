import { cn } from '@/lib/utils';

export function PlusLine({ className }: { className?: string }) {
  return (
    <div className={cn('absolute', className)}>
      <div className="relative">
        <div className="w-px h-8 bg-foreground/40 -bottom-4 left-0 absolute animate-pulse" />
        <div className="w-8 h-px bg-foreground/40 -bottom-px -left-4 absolute animate-pulse" />
      </div>
    </div>
  );
}

export function VerticalLine({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'w-px bg-gradient-to-t from-transparent via-foreground/30 to-transparent absolute -top-12 -bottom-12',
        className,
      )}
    />
  );
}

export function HorizontalLine({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'h-px bg-gradient-to-r from-transparent via-foreground/30 to-transparent absolute left-0 right-0',
        className,
      )}
    />
  );
}
