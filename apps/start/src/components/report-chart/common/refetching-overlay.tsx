import { cn } from '@/utils/cn';
import { Loader2Icon } from 'lucide-react';

interface RefetchingOverlayProps {
  isRefetching: boolean;
}

export function RefetchingOverlay({ isRefetching }: RefetchingOverlayProps) {
  if (!isRefetching) return null;

  return (
    <div
      className={cn(
        'absolute inset-0 z-10 flex items-center justify-center',
        'bg-background/50 backdrop-blur-[1px] rounded',
        'animate-in fade-in duration-200',
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
        <span className="text-sm font-medium">Loading...</span>
      </div>
    </div>
  );
}
