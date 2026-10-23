import { AnimatedNumber } from '@/components/animated-number';
import { Ping } from '@/components/ping';
import { useLiveCounter } from '@/hooks/use-live-counter';

export function LiveCounter({ projectId }: { projectId: string }) {
  const counter = useLiveCounter({ projectId });

  return (
    <div className="flex flex-col">
      <div className="font-semibold text-6xl tabular-nums tracking-tight">
        <AnimatedNumber value={counter.debounced} />
      </div>
      <div className="flex items-center gap-2 font-medium text-2xs text-muted-foreground uppercase tracking-widest">
        <Ping />
        Online now
      </div>
    </div>
  );
}
