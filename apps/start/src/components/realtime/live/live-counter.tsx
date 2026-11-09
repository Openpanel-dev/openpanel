import { useQuery } from '@tanstack/react-query';
import { useRealtimeFilters } from './use-realtime-filters';
import { AnimatedNumber } from '@/components/animated-number';
import { Ping } from '@/components/ping';
import { useLiveCounter } from '@/hooks/use-live-counter';
import { useTRPC } from '@/integrations/trpc/react';

export function LiveCounter({ projectId }: { projectId: string }) {
  const { hasFilters } = useRealtimeFilters();

  return hasFilters ? (
    <FilteredCounter projectId={projectId} />
  ) : (
    <ProjectCounter projectId={projectId} />
  );
}

function ProjectCounter({ projectId }: { projectId: string }) {
  const counter = useLiveCounter({ projectId });

  return <CounterValue value={counter.debounced} />;
}

/** The websocket only counts whole projects. */
function FilteredCounter({ projectId }: { projectId: string }) {
  const trpc = useTRPC();
  const { filters } = useRealtimeFilters();
  const { data } = useQuery(
    trpc.realtime.onlineCount.queryOptions({ projectId, filters })
  );

  return <CounterValue value={data} />;
}

/** Undefined while loading or after a failed request: the count is unknown. */
function CounterValue({ value }: { value: number | undefined }) {
  return (
    <div className="flex flex-col">
      <div className="font-semibold text-6xl tabular-nums tracking-tight">
        {value === undefined ? '–' : <AnimatedNumber value={value} />}
      </div>
      <div className="flex items-center gap-2 font-medium text-2xs text-muted-foreground uppercase tracking-widest">
        <Ping />
        Online now
      </div>
    </div>
  );
}
