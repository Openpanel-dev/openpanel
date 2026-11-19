import { Badge } from './ui/badge';
import { cn } from '@/utils/cn';

export function Ping({ className }: { className?: string }) {
  return (
    <div className="relative">
      <div className={cn('size-2 rounded-full bg-emerald-500', className)} />
      <div
        className={cn(
          'absolute inset-0 size-2 animate-ping rounded-full bg-emerald-500',
          className
        )}
      />
    </div>
  );
}

export function PingBadge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge className={cn('flex gap-1', className)} variant={'outline'}>
      <Ping />
      {children}
    </Badge>
  );
}
