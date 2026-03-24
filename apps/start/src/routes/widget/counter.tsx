import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { AnimatedNumber } from '@/components/animated-number';
import { Ping } from '@/components/ping';
import useWS from '@/hooks/use-ws';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';

const widgetSearchSchema = z.object({
  shareId: z.string(),
  limit: z.number().default(10),
  color: z.string().optional(),
});

export const Route = createFileRoute('/widget/counter')({
  component: RouteComponent,
  validateSearch: widgetSearchSchema,
});

function RouteComponent() {
  const { shareId } = Route.useSearch();
  const trpc = useTRPC();

  // Fetch widget data
  const { data, isLoading } = useQuery(
    trpc.widget.counter.queryOptions({ shareId })
  );

  if (isLoading) {
    return (
      <div className="flex h-8 items-center gap-2 px-2">
        <Ping />
        <AnimatedNumber suffix=" unique visitors" value={0} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-8 items-center gap-2 px-2">
        <Ping className="bg-orange-500" />
        <AnimatedNumber suffix=" unique visitors" value={0} />
      </div>
    );
  }

  return <CounterWidget data={data} shareId={shareId} />;
}

interface RealtimeWidgetProps {
  shareId: string;
  data: RouterOutputs['widget']['counter'];
}

function CounterWidget({ shareId, data }: RealtimeWidgetProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // WebSocket subscription for real-time updates
  useWS<number>(
    `/live/visitors/${data.projectId}`,
    () => {
      if (!document.hidden) {
        queryClient.refetchQueries(
          trpc.widget.counter.queryFilter({ shareId })
        );
      }
    },
    {
      debounce: {
        delay: 1000,
        maxWait: 60_000,
      },
    }
  );

  return (
    <div className="flex h-8 items-center gap-2 px-2">
      <Ping />
      <AnimatedNumber suffix=" unique visitors" value={data.counter} />
    </div>
  );
}
