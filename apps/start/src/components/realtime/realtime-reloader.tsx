import useWS from '@/hooks/use-ws';
import { useTRPC } from '@/integrations/trpc/react';
import { useQueryClient } from '@tanstack/react-query';
import { getCountReport, getReport } from './realtime-live-histogram';

type Props = {
  projectId: string;
};

const RealtimeReloader = ({ projectId }: Props) => {
  const client = useQueryClient();
  const trpc = useTRPC();

  useWS<number>(
    `/live/events/${projectId}`,
    () => {
      if (!document.hidden) {
        client.refetchQueries(trpc.realtime.pathFilter());
        client.refetchQueries(
          trpc.chart.chart.queryFilter(getReport(projectId)),
        );
        client.refetchQueries(
          trpc.chart.chart.queryFilter(getCountReport(projectId)),
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

  return null;
};

export default RealtimeReloader;
