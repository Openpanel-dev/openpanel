import { AnimatedNumber } from '@/components/animated-number';
import { Ping } from '@/components/ping';
import { useNumber } from '@/hooks/use-numer-formatter';
import useWS from '@/hooks/use-ws';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

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
  const { shareId, limit, color } = Route.useSearch();
  const trpc = useTRPC();

  // Fetch widget data
  const { data, isLoading } = useQuery(
    trpc.widget.counter.queryOptions({ shareId }),
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-2 h-8">
        <Ping />
        <AnimatedNumber value={0} suffix=" unique visitors" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 px-2 h-8">
        <Ping className="bg-orange-500" />
        <AnimatedNumber value={0} suffix=" unique visitors" />
      </div>
    );
  }

  return <CounterWidget shareId={shareId} data={data} />;
}

interface RealtimeWidgetProps {
  shareId: string;
  data: RouterOutputs['widget']['counter'];
}

function CounterWidget({ shareId, data }: RealtimeWidgetProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const number = useNumber();

  // WebSocket subscription for real-time updates
  useWS<number>(
    `/live/visitors/${data.projectId}`,
    (res) => {
      if (!document.hidden) {
        queryClient.refetchQueries(
          trpc.widget.counter.queryFilter({ shareId }),
        );
      }
    },
    {
      debounce: {
        delay: 1000,
        maxWait: 60000,
      },
    },
  );

  return (
    <div className="flex items-center gap-2 px-2 h-8">
      <Ping />
      <AnimatedNumber value={data.counter} suffix=" unique visitors" />
    </div>
  );
}
