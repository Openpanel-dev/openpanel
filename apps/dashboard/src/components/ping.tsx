import { cn } from '@/utils/cn';
import { Badge } from './ui/badge';

export function Ping({ className }: { className?: string }) {
  return (
    <div className="relative">
      <div className={cn('size-2 bg-emerald-500 rounded-full', className)} />
      <div
        className={cn(
          'size-2 bg-emerald-500 rounded-full absolute inset-0 animate-ping',
          className,
        )}
      />
    </div>
  );
}

export function PingBadge({
  children,
  className,
}: { children: React.ReactNode; className?: string }) {
  return (
    <Badge variant={'outline'} className={cn('flex gap-1', className)}>
      <Ping />
      {children}
    </Badge>
  );
}
